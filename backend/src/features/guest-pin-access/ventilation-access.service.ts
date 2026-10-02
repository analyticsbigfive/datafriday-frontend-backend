import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { InventoryWindow } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { StockMovementService } from '../logistics/services/stock-movement.service';
import { VentilationDepositsService, normalizeItemName } from '../logistics/ventilation-deposits.service';
import { generateSlug } from '../../shared/utils';
import { isEventOver } from '../../shared/utils/event-window.util';
import { GuestLoginResult, GuestPinSessionService } from './services/guest-pin-session.service';
import { GuestPinWindowService } from './services/guest-pin-window.service';
import { GuestPinCredentialService } from './services/guest-pin-credential.service';
import { VENTILATION_PHASE } from './inventory-window-period';
import { GuestVentilationDepositDto, VentilationTargetDto } from './dto/ventilation.dto';
import type { GuestPinUser } from '../../core/auth/strategies/jwt-guest-pin.strategy';
import type { CurrentUserData } from '../../core/auth/decorators/current-user.decorator';

const COMBINING_DIACRITICS_REGEX = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

/** Champs de ligne de réarmement transmis à l'invité : de quoi calculer le reste à
 *  déposer (utils/restockDepositSheet.js côté front), rien de plus (ni prix, ni
 *  détail des recettes). */
const SHEET_LINE_FIELDS = [
  'rowKey',
  'elementType',
  'shopId',
  'shopName',
  'itemKey',
  'itemName',
  'unit',
  'targetQuantity',
  'remainingQuantity',
  'restockQuantity',
  'packaging',
] as const;

export interface VentilationPublicContext {
  kind: 'ventilation';
  elementName: null;
  spaceName: string | null;
  active: boolean;
}

/**
 * Accès PIN « Ventilation » des logisticiens (chantier logistic_ventilation, partie 3 ;
 * réponse #72 de Bertrand : PIN, sans login DataFriday).
 *
 * Réutilise l'infrastructure PIN de l'inventaire (InventoryWindow de phase
 * `ventilation`, PIN partagé chiffré, anti brute force, jeton `jwt-guest-pin`), avec
 * un QR fixe PAR ESPACE (`Space.ventilationSlug`, décision #77) et une ligne
 * `GuestPinAccess` par fenêtre dont `elementId` vaut l'id de l'espace (pas de clé
 * étrangère sur ce champ : valeur sentinelle, l'accès ne vise aucun élément).
 *
 * Cycle de vie (décision #75) : ouverture manuelle depuis Logistique, fermeture
 * automatique à la fin réelle du match (InventoryWindowLifecycleCronService),
 * l'ouverture d'un autre match ferme la précédente, arrêt manuel possible.
 */
@Injectable()
export class VentilationAccessService {
  private readonly logger = new Logger(VentilationAccessService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly guestPinSessionService: GuestPinSessionService,
    private readonly guestPinWindowService: GuestPinWindowService,
    private readonly guestPinCredentialService: GuestPinCredentialService,
    private readonly stockMovementService: StockMovementService,
    private readonly deposits: VentilationDepositsService,
    private readonly spaceAccess: SpaceAccessService,
  ) {}

  // ── Logistique (utilisateur connecté) ───────────────────────────────────────

  async getStatus(spaceId: string, eventId: string, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, spaceId);
    const tenantId = user.tenantId!;
    const [space, window] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { ventilationSlug: true } }),
      eventId ? this.findWindow(tenantId, spaceId, eventId) : null,
    ]);
    if (!space) throw new NotFoundException('Espace introuvable');
    return this.statusView(space.ventilationSlug, window);
  }

  async start(dto: VentilationTargetDto, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, dto.spaceId);
    const tenantId = user.tenantId!;
    const event = await this.prisma.event.findFirst({
      where: { id: dto.eventId, spaceId: dto.spaceId, tenantId },
      select: {
        id: true,
        eventDate: true,
        eventStartDate: true,
        eventEndDate: true,
        eventEndTime: true,
        sessions: true,
        space: { select: { timezone: true } },
      },
    });
    if (!event) throw new NotFoundException('Match introuvable pour cet espace');
    if (isEventOver(event, event.space?.timezone || 'Europe/Paris')) {
      throw new BadRequestException("Ce match est terminé : l'accès ventilation ne peut plus être ouvert.");
    }

    // Une seule fenêtre ventilation ouverte par espace : ouvrir ce match ferme l'autre.
    const stale = await this.prisma.inventoryWindow.findMany({
      where: { tenantId, spaceId: dto.spaceId, phase: VENTILATION_PHASE, status: 'open', eventId: { not: dto.eventId } },
    });
    for (const w of stale) {
      await this.guestPinWindowService.closeWindowRecord(w, user.id, { pushToLogistic: false, reason: 'superseded' });
    }

    const window = await this.prisma.inventoryWindow.upsert({
      where: {
        uniq_inventory_window: { tenantId, spaceId: dto.spaceId, eventId: dto.eventId, phase: VENTILATION_PHASE },
      },
      create: { tenantId, spaceId: dto.spaceId, eventId: dto.eventId, phase: VENTILATION_PHASE, openedBy: user.id },
      update: { status: 'open', openedAt: new Date(), openedBy: user.id, closedAt: null, closedBy: null },
    });
    // Reprise : l'arrêt avait révoqué l'accès, il redevient joignable avec le même PIN.
    await this.prisma.guestPinAccess.updateMany({
      where: { windowId: window.id, status: 'revoked' },
      data: { status: 'active', revokedAt: null, revokedBy: null },
    });
    await this.guestPinWindowService.ensureWindowPin(window, user.id);
    const slug = await this.ensureSpaceSlug(dto.spaceId, tenantId);
    const fresh = await this.findWindow(tenantId, dto.spaceId, dto.eventId);
    return this.statusView(slug, fresh);
  }

  async stop(dto: VentilationTargetDto, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, dto.spaceId);
    const window = await this.findWindow(user.tenantId!, dto.spaceId, dto.eventId);
    if (window?.status === 'open') {
      await this.guestPinWindowService.closeWindowRecord(window, user.id, { pushToLogistic: false, reason: 'manual-stop' });
    }
    return this.getStatus(dto.spaceId, dto.eventId, user);
  }

  async resetPin(dto: VentilationTargetDto, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, dto.spaceId);
    const window = await this.findWindow(user.tenantId!, dto.spaceId, dto.eventId);
    if (!window || window.status !== 'open') {
      throw new BadRequestException("L'accès ventilation est arrêté : démarrez-le avant de changer le PIN.");
    }
    await this.guestPinWindowService.regenerateWindowPin(window.id, window.tenantId, user.id);
    return this.getStatus(dto.spaceId, dto.eventId, user);
  }

  // ── Logisticien (QR + PIN) ──────────────────────────────────────────────────

  /** Espace d'un slug de ventilation, ou null (le slug est alors celui d'un élément). */
  findSpaceBySlug(slug: string) {
    if (!slug) return Promise.resolve(null);
    return this.prisma.space.findUnique({
      where: { ventilationSlug: slug },
      select: { id: true, name: true, tenantId: true },
    });
  }

  async getPublicContext(space: { id: string; name: string }): Promise<VentilationPublicContext> {
    const open = await this.openWindowWithPin(space.id);
    return { kind: 'ventilation', elementName: null, spaceName: space.name, active: !!open };
  }

  async login(
    space: { id: string; name: string; tenantId: string },
    pin: string,
    deviceId: string | undefined,
    ip: string,
  ): Promise<GuestLoginResult> {
    const retryAfter = await this.guestPinSessionService.pinLoginRetryAfter(ip);
    if (retryAfter != null) return { state: 'locked', retryAfter };
    // Rien d'ouvert : même écran « Accès inactif », aucun PIN comparé, rien à compter.
    if (!(await this.openWindowWithPin(space.id))) return { state: 'inactive' };

    const window = await this.guestPinSessionService.findWindowByPin(space.id, pin, VENTILATION_PHASE);
    if (!window) {
      return { state: 'not_found', attemptsRemaining: await this.guestPinSessionService.recordPinLoginFailure(ip) };
    }
    if (window.status !== 'open') return { state: 'inactive' };

    const access = await this.prisma.guestPinAccess.upsert({
      where: { uniq_guest_pin_access_per_element: { windowId: window.id, elementId: space.id } },
      create: { tenantId: window.tenantId, windowId: window.id, spaceId: space.id, elementId: space.id, status: 'active' },
      update: {},
    });
    if (access.status !== 'active') return { state: 'inactive' };

    const token = await this.guestPinSessionService.issueGuestToken(access.id, deviceId);
    return {
      state: 'ok',
      token,
      phase: VENTILATION_PHASE,
      spaceId: space.id,
      spaceName: space.name,
      elementId: space.id,
      elementName: null,
      eventId: window.eventId,
    };
  }

  /**
   * Données de la feuille de ventilation du match de l'invité : lignes de la feuille
   * de réarmement (champs utiles seulement), corrections, lignes cochées « réarmé »,
   * dépôts déjà faits (cumul + liste) et tailles de pack Logistic des destinations.
   * Le reste à déposer est calculé côté front par le MÊME code que l'écran Logistique
   * (utils/restockDepositSheet.js).
   */
  async getSheet(user: GuestPinUser, deviceId: string | undefined) {
    this.assertVentilationSession(user);
    const [plan, event, sums, movements] = await Promise.all([
      this.findPlan(user.tenantId, user.spaceId, user.eventId),
      this.prisma.event.findFirst({ where: { id: user.eventId, tenantId: user.tenantId }, select: { name: true } }),
      this.deposits.sumByEvent(user.spaceId, user.eventId, user.tenantId),
      this.deposits.listByEvent(user.spaceId, user.eventId, user.tenantId),
    ]);
    const restockLines = (Array.isArray(plan?.restockLines) ? (plan!.restockLines as any[]) : []).map(pickSheetLine);
    const elementIds = [...new Set([...restockLines.map((l) => String(l.shopId)), ...sums.map((d) => d.elementId)])];
    const packSizes = await this.deposits.packSizes(user.spaceId, user.tenantId, elementIds);
    const uppByKey = new Map(packSizes.map((p) => [`${p.elementId}::${normalizeItemName(p.itemName)}`, p.unitsPerPack]));
    const actor = this.actorOf(user, deviceId);
    return {
      eventId: user.eventId,
      eventName: event?.name ?? null,
      plan: plan
        ? {
            name: plan.name,
            restockLines,
            lineOverrides: plan.lineOverrides ?? {},
            restockedRows: plan.restockedRows ?? {},
          }
        : null,
      deposits: sums.map((d) => ({ ...d, unitsPerPack: uppByKey.get(`${d.elementId}::${normalizeItemName(d.itemKey)}`) ?? null })),
      packSizes,
      movements: movements.map(({ createdBy, ...m }) => ({ ...m, cancellable: !m.cancelled && createdBy === actor })),
    };
  }

  async deposit(user: GuestPinUser, dto: GuestVentilationDepositDto, deviceId: string | undefined) {
    this.assertVentilationSession(user);
    const plan = await this.findPlan(user.tenantId, user.spaceId, user.eventId);
    const lines = Array.isArray(plan?.restockLines) ? (plan!.restockLines as any[]) : [];
    const line = lines.find((l) => l?.rowKey === dto.rowKey);
    if (!line?.shopId) throw new NotFoundException('Cette ligne ne figure pas sur la feuille de ventilation du match');
    // Ligne retirée de la feuille depuis (cochée « réarmé » ou corrigée à 0) : plus rien à y déposer.
    const restocked = (plan?.restockedRows ?? {}) as Record<string, unknown>;
    const overrides = (plan?.lineOverrides ?? {}) as Record<string, unknown>;
    const override = overrides[dto.rowKey];
    if (restocked[dto.rowKey] || (override != null && override !== '' && Number(override) <= 0)) {
      throw new BadRequestException("Cette ligne n'est plus à déposer : rechargez la feuille");
    }
    if (dto.packed <= 0 && dto.loose <= 0) throw new BadRequestException('Quantité nulle');
    const itemKey = await this.deposits.resolveElementItemKey(user.spaceId, String(line.shopId), String(line.itemName ?? ''), user.tenantId);
    const { movement } = await this.stockMovementService.createMovement(
      {
        spaceId: user.spaceId,
        elementId: String(line.shopId),
        itemKey,
        direction: 'add',
        packed: dto.packed,
        loose: dto.loose,
        reason: 'VENTILATION',
        eventId: user.eventId,
        note: dto.depositorName?.trim() || undefined,
      },
      user.tenantId,
      this.actorOf(user, deviceId),
    );
    // Réponse minimale : pas de niveau de stock ni d'identifiant d'auteur côté invité.
    return { ok: true, movementId: movement.id };
  }

  /** Un logisticien n'annule que les dépôts saisis depuis son appareil (décision #76). */
  async cancel(user: GuestPinUser, movementId: string, deviceId: string | undefined) {
    this.assertVentilationSession(user);
    const actor = this.actorOf(user, deviceId);
    await this.deposits.cancel(movementId, user.tenantId, actor, { requireCreatedBy: actor });
    return { ok: true };
  }

  // ── Interne ────────────────────────────────────────────────────────────────

  private assertVentilationSession(user: GuestPinUser): void {
    if (user.phase !== VENTILATION_PHASE) {
      throw new ForbiddenException("Cet accès ne permet pas d'utiliser la feuille de ventilation");
    }
  }

  /**
   * Auteur d'un dépôt invité : l'accès PIN est PARTAGÉ par tous les logisticiens du
   * match, c'est l'appareil (identifiant local envoyé en en-tête, haché) qui
   * distingue « mes dépôts » de ceux des autres.
   */
  private actorOf(user: GuestPinUser, deviceId: string | undefined): string {
    const device = deviceId ? createHash('sha256').update(deviceId).digest('hex').slice(0, 16) : 'unknown';
    return `guest-pin:${user.id}:${device}`;
  }

  private findWindow(tenantId: string, spaceId: string, eventId: string) {
    return this.prisma.inventoryWindow.findFirst({ where: { tenantId, spaceId, eventId, phase: VENTILATION_PHASE } });
  }

  private openWindowWithPin(spaceId: string) {
    return this.prisma.inventoryWindow.findFirst({
      where: { spaceId, phase: VENTILATION_PHASE, status: 'open', pinLookupHash: { not: null } },
      select: { id: true },
    });
  }

  /** Même choix que l'écran Logistique : la feuille la plus récemment modifiée
   *  dont les matchs incluent celui-ci. */
  private findPlan(tenantId: string, spaceId: string, eventId: string) {
    return this.prisma.restockPlan.findFirst({
      where: { tenantId, spaceId, selectedEventIds: { has: eventId } },
      orderBy: { updatedAt: 'desc' },
      select: { name: true, restockLines: true, lineOverrides: true, restockedRows: true },
    });
  }

  private statusView(slug: string | null, window: InventoryWindow | null) {
    return {
      slug,
      window: window
        ? {
            id: window.id,
            eventId: window.eventId,
            status: window.status,
            pin: window.status === 'open' ? this.guestPinCredentialService.readWindowPin(window) : null,
            pinSetAt: window.pinSetAt,
            openedAt: window.openedAt,
            closedAt: window.closedAt,
          }
        : null,
    };
  }

  /** Slug du QR de ventilation de l'espace, créé une fois. Suffixe aléatoire : jamais
   *  de collision avec le slug d'un élément (même route /login/pin/:slug). */
  private async ensureSpaceSlug(spaceId: string, tenantId: string): Promise<string> {
    const space = await this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { name: true, ventilationSlug: true } });
    if (!space) throw new NotFoundException('Espace introuvable');
    if (space.ventilationSlug) return space.ventilationSlug;
    const base = generateSlug(space.name.normalize('NFD').replace(COMBINING_DIACRITICS_REGEX, '')) || 'espace';
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = `ventilation-${base}-${randomBytes(3).toString('hex')}`;
      const clash = await this.prisma.spaceElement.findUnique({ where: { slug }, select: { id: true } });
      if (clash) continue;
      try {
        await this.prisma.space.update({ where: { id: spaceId }, data: { ventilationSlug: slug } });
        return slug;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
        throw error;
      }
    }
    this.logger.warn(`Slug de ventilation introuvable pour l'espace ${spaceId}`);
    throw new BadRequestException('Impossible de créer le lien QR de ventilation, réessayez');
  }
}

function pickSheetLine(line: any) {
  const out: Record<string, unknown> = {};
  for (const field of SHEET_LINE_FIELDS) if (line?.[field] !== undefined) out[field] = line[field];
  return out;
}
