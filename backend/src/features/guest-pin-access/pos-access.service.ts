import { BadRequestException, ForbiddenException, HttpException, Injectable, NotFoundException } from '@nestjs/common';
import type { InventoryWindow } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { POS_ERROR_CODES, POS_PHASE } from '../pos/pos.contracts';
import { GuestLoginResult, GuestPinSessionService } from './services/guest-pin-session.service';
import { GuestPinWindowService } from './services/guest-pin-window.service';
import { GuestPinCredentialService } from './services/guest-pin-credential.service';
import { isPosEventSellable } from './pos-period';
import { sanitizeVendorName } from './pos-vendor-name';
import { revokeWindowAccesses } from '../inventory/inventory-window-closure';

/** Élément de PdV tel que résolu par le slug du QR. */
export interface PosPdvRef {
  id: string;
  name: string;
  spaceId: string | null;
}

/** État de la caisse d'un PdV pour un évènement (lecture staff). `pin` est déjà déchiffré : le contrôleur le masque sans `front.fb.posManage`. */
export interface PosAccessStatus {
  elementId: string;
  windowId: string | null;
  /** Caisse démarrée (▶) et non arrêtée : la fenêtre est ouverte et son accès actif. */
  open: boolean;
  pin: string | null;
  pinSetAt: Date | null;
  openedAt: Date | null;
  closedAt: Date | null;
  lastLoginAt: Date | null;
}

/** Résultat d'un démarrage ou arrêt en masse : un PdV en échec n'empêche pas les autres. */
export interface PosBulkResult {
  results: PosAccessStatus[];
  failures: Array<{ elementId: string; code: string; message: string }>;
}

export interface PosPublicContext {
  /** Une caisse POS est ouverte pour ce PdV : l'écran de connexion demande le nom du vendeur. */
  posActive: boolean;
}

const EVENT_SELECT = {
  id: true,
  configurationId: true,
  eventDate: true,
  eventStartDate: true,
  eventEndDate: true,
  eventEndTime: true,
  sessions: true,
  space: { select: { timezone: true } },
} as const;

const posError = (Exc: new (body: object) => HttpException, code: string, message: string) => new Exc({ code, message });

/**
 * Accès invité « caisse POS » (chantier pos_mvp, lot L2, PLAN.md décisions 2, 3, 10).
 *
 * Réutilise l'infrastructure PIN de l'inventaire (InventoryWindow, PIN chiffré, anti brute
 * force, jeton `jwt-guest-pin`) avec UNE fenêtre PAR PdV : `phase = 'pos'`, `selectionKey =
 * elementId`. Chaque PdV a donc son PIN et son QR (slug du SpaceElement), et le PIN du PdV A
 * ne retrouve jamais la fenêtre du PdV B (recherche par PIN ET par selectionKey du PdV scanné).
 * La phase `pos` reste hors de INVENTORY_PHASES : aucun flux d'inventaire ne la voit.
 *
 * Plusieurs vendeurs partagent la GuestPinAccess du PdV : le nom du vendeur est saisi à la
 * connexion et vit dans la session (claim `vendorName` du jeton), pas en base.
 *
 * Toutes les méthodes prennent `tenantId` explicitement : les routes invité sont @Public, le
 * scoping Prisma par tenant (CLS) y est inactif (PLAN.md piège 4).
 */
@Injectable()
export class PosAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionService: GuestPinSessionService,
    private readonly windowService: GuestPinWindowService,
    private readonly credentialService: GuestPinCredentialService,
  ) {}

  // ── Staff ───────────────────────────────────────────────────────────────────

  /**
   * ▶ d'un PdV : crée ou rouvre sa fenêtre pos, garantit son PIN (conservé à la reprise) et
   * réactive son accès. Utilisable tout de suite, avant l'ouverture des portes comme après.
   */
  async start(tenantId: string, spaceId: string, eventId: string, elementId: string, userId: string): Promise<PosAccessStatus> {
    const event = await this.requireEvent(tenantId, spaceId, eventId);
    this.assertSellable(event);
    return this.startPdv(tenantId, spaceId, event, elementId, userId);
  }

  /** ■ d'un PdV : ferme la fenêtre et révoque l'accès, la session du vendeur tombe à sa prochaine requête. PIN conservé. */
  async stop(tenantId: string, spaceId: string, eventId: string, elementId: string, userId: string): Promise<PosAccessStatus> {
    const window = await this.findWindow(tenantId, spaceId, eventId, elementId);
    if (window) await this.closeWindow(window, userId);
    return this.status(tenantId, spaceId, eventId, elementId);
  }

  /** Nouveau PIN pour un PdV démarré (l'ancien ne permet plus de se connecter). */
  async regeneratePin(tenantId: string, spaceId: string, eventId: string, elementId: string, userId: string): Promise<PosAccessStatus> {
    const window = await this.findWindow(tenantId, spaceId, eventId, elementId);
    if (!window || window.status !== 'open') {
      throw new BadRequestException("La caisse de ce point de vente est arrêtée : démarrez-la avant de changer le PIN.");
    }
    await this.windowService.regenerateWindowPin(window.id, tenantId, userId);
    return this.status(tenantId, spaceId, eventId, elementId);
  }

  async startAll(tenantId: string, spaceId: string, eventId: string, elementIds: string[], userId: string): Promise<PosBulkResult> {
    const event = await this.requireEvent(tenantId, spaceId, eventId);
    this.assertSellable(event);
    return this.eachPdv(elementIds, (elementId) => this.startPdv(tenantId, spaceId, event, elementId, userId));
  }

  async stopAll(tenantId: string, spaceId: string, eventId: string, elementIds: string[], userId: string): Promise<PosBulkResult> {
    return this.eachPdv(elementIds, (elementId) => this.stop(tenantId, spaceId, eventId, elementId, userId));
  }

  /** PIN en clair d'un PdV, ou null (jamais démarré, ou caisse arrêtée). */
  async getPin(tenantId: string, spaceId: string, eventId: string, elementId: string): Promise<string | null> {
    const window = await this.findWindow(tenantId, spaceId, eventId, elementId);
    return window && window.status === 'open' ? this.credentialService.readWindowPin(window) : null;
  }

  async status(tenantId: string, spaceId: string, eventId: string, elementId: string): Promise<PosAccessStatus> {
    return (await this.statuses(tenantId, spaceId, eventId, [elementId]))[0];
  }

  /** Statut de plusieurs PdV en deux requêtes (page staff). Un PdV sans fenêtre est « inactif ». */
  async statuses(tenantId: string, spaceId: string, eventId: string, elementIds: string[]): Promise<PosAccessStatus[]> {
    if (!elementIds.length) return [];
    const windows = await this.prisma.inventoryWindow.findMany({
      where: { tenantId, spaceId, eventId, phase: POS_PHASE, selectionKey: { in: elementIds } },
    });
    const accesses = windows.length
      ? await this.prisma.guestPinAccess.findMany({
          where: { windowId: { in: windows.map((w) => w.id) } },
          select: { windowId: true, elementId: true, status: true, lastLoginAt: true },
        })
      : [];
    const windowByElement = new Map(windows.map((w) => [w.selectionKey, w]));
    const accessByWindow = new Map(accesses.map((a) => [a.windowId, a]));
    return elementIds.map((elementId) => {
      const window = windowByElement.get(elementId);
      const access = window ? accessByWindow.get(window.id) : undefined;
      return {
        elementId,
        windowId: window?.id ?? null,
        open: !!window && window.status === 'open' && access?.status === 'active',
        pin: window && window.status === 'open' ? this.credentialService.readWindowPin(window) : null,
        pinSetAt: window?.pinSetAt ?? null,
        openedAt: window?.openedAt ?? null,
        closedAt: window?.closedAt ?? null,
        lastLoginAt: access?.lastLoginAt ?? null,
      };
    });
  }

  // ── Vendeur (QR + PIN + nom) ────────────────────────────────────────────────

  /** PdV d'un slug de QR si une caisse POS lui est ouverte, sinon null (flux inventaire inchangé). */
  async findOpenPdvBySlug(slug: string): Promise<PosPdvRef | null> {
    if (!slug) return null;
    const element = await this.credentialService.resolveElementBySlug(slug);
    if (!element?.spaceId) return null;
    return (await this.hasOpenWindow(element.id)) ? element : null;
  }

  async getPublicContext(slug: string): Promise<PosPublicContext> {
    return { posActive: !!(await this.findOpenPdvBySlug(slug)) };
  }

  /**
   * Connexion d'un vendeur sur la caisse du PdV scanné. Le PIN n'est comparé qu'à la fenêtre pos
   * DE CE PdV : le PIN d'un autre PdV (ou celui d'un inventaire) n'ouvre pas la caisse. Un PIN qui
   * ne correspond pas à la caisse est confié à `inventoryLogin` (le PdV peut aussi être en
   * inventaire, même QR). Le nom du vendeur n'est exigé qu'une fois le PIN de la caisse reconnu.
   */
  async login(
    element: PosPdvRef,
    pin: string,
    vendorName: string | undefined,
    deviceId: string | undefined,
    ip: string,
    inventoryLogin: () => Promise<GuestLoginResult>,
  ): Promise<GuestLoginResult> {
    const retryAfter = await this.sessionService.pinLoginRetryAfter(ip);
    if (retryAfter != null) return { state: 'locked', retryAfter };

    const window = await this.prisma.inventoryWindow.findFirst({
      where: { phase: POS_PHASE, selectionKey: element.id, ...(element.spaceId ? { spaceId: element.spaceId } : {}), pinLookupHash: this.credentialService.hashPin(pin) },
    });
    if (!window) {
      const result = await inventoryLogin();
      // Une caisse est ouverte : un PIN a bien été comparé, « inactif » (rien d'ouvert en
      // inventaire) serait trompeur et ne compterait pas l'échec.
      if (result.state === 'inactive') {
        return { state: 'not_found', attemptsRemaining: await this.sessionService.recordPinLoginFailure(ip) };
      }
      return result;
    }
    if (window.status !== 'open') return { state: 'inactive' };

    const name = sanitizeVendorName(vendorName);
    if (!name) throw posError(BadRequestException, POS_ERROR_CODES.VENDOR_NAME_REQUIRED, 'Saisissez votre nom pour ouvrir la caisse.');

    const event = await this.prisma.event.findFirst({ where: { id: window.eventId, tenantId: window.tenantId }, select: EVENT_SELECT });
    if (!event) throw new NotFoundException('Évènement introuvable');
    this.assertSellable(event);

    const access = await this.prisma.guestPinAccess.upsert({
      where: { uniq_guest_pin_access_per_element: { windowId: window.id, elementId: element.id } },
      create: { tenantId: window.tenantId, windowId: window.id, spaceId: window.spaceId, elementId: element.id, status: 'active' },
      update: {},
    });
    if (access.status !== 'active') return { state: 'inactive' };

    const [space, token] = await Promise.all([
      this.prisma.space.findUnique({ where: { id: window.spaceId }, select: { name: true } }),
      this.sessionService.issueGuestToken(access.id, deviceId, { vendorName: name }),
    ]);
    return {
      state: 'ok',
      token,
      phase: POS_PHASE,
      spaceId: window.spaceId,
      spaceName: space?.name ?? null,
      elementId: element.id,
      elementName: element.name,
      eventId: window.eventId,
      vendorName: name,
    };
  }

  // ── Interne ────────────────────────────────────────────────────────────────

  private async startPdv(
    tenantId: string,
    spaceId: string,
    event: { id: string; configurationId: string | null },
    elementId: string,
    userId: string,
  ): Promise<PosAccessStatus> {
    await this.assertPdvInEventConfig(spaceId, event.configurationId, elementId);
    const window = await this.prisma.inventoryWindow.upsert({
      where: { uniq_inventory_window: { tenantId, spaceId, eventId: event.id, phase: POS_PHASE, selectionKey: elementId } },
      create: { tenantId, spaceId, eventId: event.id, phase: POS_PHASE, selectionKey: elementId, openedBy: userId },
      update: { status: 'open', openedAt: new Date(), openedBy: userId, closedAt: null, closedBy: null },
    });
    // PIN conservé d'un arrêt à l'autre : une reprise rouvre l'accès avec le même code.
    await this.windowService.ensureWindowPin(window, userId);
    await this.prisma.guestPinAccess.upsert({
      where: { uniq_guest_pin_access_per_element: { windowId: window.id, elementId } },
      create: { tenantId, windowId: window.id, spaceId, elementId, status: 'active', createdBy: userId },
      update: { status: 'active', revokedAt: null, revokedBy: null },
    });
    return this.status(tenantId, spaceId, event.id, elementId);
  }

  private async closeWindow(window: InventoryWindow, userId: string): Promise<void> {
    if (window.status === 'open') {
      // Ferme la fenêtre ET révoque ses accès, sans push Logistic (ce n'est pas un inventaire).
      await this.windowService.closeWindowRecord(window, userId, { pushToLogistic: false, reason: 'manual-stop' });
    } else {
      // Fenêtre déjà fermée : on s'assure qu'aucun accès ne traîne actif.
      await revokeWindowAccesses(this.prisma, [window.id], userId);
    }
  }

  private findWindow(tenantId: string, spaceId: string, eventId: string, elementId: string) {
    return this.prisma.inventoryWindow.findUnique({
      where: { uniq_inventory_window: { tenantId, spaceId, eventId, phase: POS_PHASE, selectionKey: elementId } },
    });
  }

  private hasOpenWindow(elementId: string) {
    return this.prisma.inventoryWindow.findFirst({
      where: { phase: POS_PHASE, selectionKey: elementId, status: 'open', pinLookupHash: { not: null } },
      select: { id: true },
    });
  }

  private async requireEvent(tenantId: string, spaceId: string, eventId: string) {
    const event = await this.prisma.event.findFirst({ where: { id: eventId, tenantId, spaceId }, select: EVENT_SELECT });
    if (!event) throw new NotFoundException('Évènement introuvable');
    return event;
  }

  /** Évènement terminé (fin réelle + grâce du Live dépassées) : plus de caisse à démarrer ni de connexion. */
  private assertSellable(event: Parameters<typeof isPosEventSellable>[0] & { space?: { timezone: string | null } | null }): void {
    const timeZone = event.space?.timezone || 'Europe/Paris';
    if (!isPosEventSellable(event, timeZone)) {
      throw posError(ForbiddenException, POS_ERROR_CODES.EVENT_NOT_SELLABLE, "Cet évènement est terminé : la caisse n'est plus disponible.");
    }
  }

  /** Le PdV existe dans l'espace et fait partie de la configuration de l'évènement (v1 : parent ; v2 : ConfigurationElement). */
  private async assertPdvInEventConfig(spaceId: string, configurationId: string | null, elementId: string): Promise<void> {
    const element = await this.credentialService.resolveElementById(elementId);
    if (!element || element.spaceId !== spaceId) throw new NotFoundException('Point de vente introuvable');
    if (!configurationId) {
      throw posError(BadRequestException, POS_ERROR_CODES.PDV_NOT_IN_EVENT_CONFIG, "Cet évènement n'a pas de configuration : aucun point de vente à ouvrir.");
    }
    const inConfig = await this.prisma.spaceElement.findFirst({
      where: {
        id: elementId,
        OR: [
          { configurationElements: { some: { configId: configurationId } } },
          { floor: { configId: configurationId } },
          { forecourt: { configId: configurationId } },
          { externalMerch: { configId: configurationId } },
        ],
      },
      select: { id: true },
    });
    if (!inConfig) {
      throw posError(BadRequestException, POS_ERROR_CODES.PDV_NOT_IN_EVENT_CONFIG, "Ce point de vente ne fait pas partie de la configuration de l'évènement.");
    }
  }

  private async eachPdv(elementIds: string[], run: (elementId: string) => Promise<PosAccessStatus>): Promise<PosBulkResult> {
    const out: PosBulkResult = { results: [], failures: [] };
    for (const elementId of [...new Set(elementIds)]) {
      try {
        // eslint-disable-next-line no-await-in-loop -- un PdV à la fois : un échec isolé ne doit pas masquer les autres, et l'index partiel ne tolère pas la course
        out.results.push(await run(elementId));
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        const body = error.getResponse() as { code?: string; message?: string } | string;
        out.failures.push({
          elementId,
          code: typeof body === 'object' && body.code ? body.code : String(error.getStatus()),
          message: typeof body === 'object' ? (body.message ?? error.message) : body,
        });
      }
    }
    return out;
  }
}
