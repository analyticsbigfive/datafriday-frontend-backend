import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { InventoryWindow } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { SpaceAccessService } from '../../core/auth/space-access.service';
import { StockMovementService } from '../logistics/services/stock-movement.service';
import { VentilationDepositsService, normalizeItemName, uniqueIds } from '../logistics/ventilation-deposits.service';
import { VentilationEventsService } from '../logistics/ventilation-events.service';
import { generateSlug } from '../../shared/utils';
import { isEventOver } from '../../shared/utils/event-window.util';
import { GuestLoginResult, GuestPinSessionService } from './services/guest-pin-session.service';
import { GuestPinWindowService } from './services/guest-pin-window.service';
import { GuestPinCredentialService } from './services/guest-pin-credential.service';
import { VENTILATION_PHASE } from './inventory-window-period';
import { GuestVentilationDepositDto, VentilationSelectionDto, VentilationWindowDto } from './dto/ventilation.dto';
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
 * Ventilation v2 (maquettes Bertrand et décision Ulrich du 2026-10-09) : un accès et
 * un PIN par COMBINAISON de matchs (A, A + B, B + C, A + B + C…), créé et ouvert dès
 * que Logistique l'affiche (`ensure`) ; le PIN n'affiche que les matchs de sa
 * combinaison, dont la feuille de l'invité additionne les feuilles de réarmement.
 * Fenêtre : `eventId` = premier match, `linkedEventIds` = les autres, `selectionKey` =
 * empreinte de la combinaison. Plusieurs accès restent ouverts en même temps.
 * Fermeture automatique à la fin réelle du DERNIER match de la combinaison
 * (InventoryWindowLifecycleCronService), arrêt et reprise manuels possibles.
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
    private readonly ventilationEvents: VentilationEventsService,
  ) {}

  // ── Logistique (utilisateur connecté) ───────────────────────────────────────

  /**
   * PIN de la combinaison de matchs choisie dans Logistique (décision Ulrich du
   * 2026-10-09 : un PIN par combinaison, qui n'affiche que ses matchs). L'accès est
   * créé et ouvert s'il n'existe pas encore (PIN prédéfini, utilisable dès qu'il
   * s'affiche) ; la même combinaison, dans n'importe quel ordre, retrouve toujours le
   * même accès. Un accès arrêté à la main le reste : seule « Reprendre » le rouvre.
   * Les matchs déjà terminés sont écartés de la combinaison.
   */
  async ensure(dto: VentilationSelectionDto, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, dto.spaceId);
    const tenantId = user.tenantId!;
    const space = await this.prisma.space.findFirst({ where: { id: dto.spaceId, tenantId }, select: { timezone: true } });
    if (!space) throw new NotFoundException('Espace introuvable');
    const timeZone = space.timezone || 'Europe/Paris';
    const ordered = (await this.ventilationEvents.orderedEvents(dto.spaceId, tenantId, dto.eventIds)).filter(
      (e) => !isEventOver(e, timeZone),
    );
    const slug = await this.ensureSpaceSlug(dto.spaceId, tenantId);
    if (!ordered.length) return this.statusView(slug, null);

    const [primary, ...others] = ordered;
    const selectionKey = ventilationSelectionKey(ordered.map((e) => e.id));
    const window = await this.prisma.inventoryWindow.upsert({
      where: {
        uniq_inventory_window: { tenantId, spaceId: dto.spaceId, eventId: primary.id, phase: VENTILATION_PHASE, selectionKey },
      },
      create: {
        tenantId,
        spaceId: dto.spaceId,
        eventId: primary.id,
        phase: VENTILATION_PHASE,
        selectionKey,
        linkedEventIds: others.map((e) => e.id),
        openedBy: user.id,
      },
      // La combinaison est figée par sa clé : rien à mettre à jour.
      update: {},
    });
    if (window.status === 'open') await this.guestPinWindowService.ensureWindowPin(window, user.id);
    return this.statusView(slug, await this.findWindowById(tenantId, dto.spaceId, window.id));
  }

  /** Reprend un accès arrêté à la main (même PIN), tant qu'un de ses matchs n'est pas terminé. */
  async start(dto: VentilationWindowDto, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, dto.spaceId);
    const tenantId = user.tenantId!;
    const window = await this.requireWindow(tenantId, dto.spaceId, dto.windowId);
    const space = await this.prisma.space.findFirst({ where: { id: dto.spaceId, tenantId }, select: { timezone: true } });
    const events = await this.ventilationEvents.orderedEvents(dto.spaceId, tenantId, [window.eventId, ...(window.linkedEventIds ?? [])]);
    if (!events.some((e) => !isEventOver(e, space?.timezone || 'Europe/Paris'))) {
      throw new BadRequestException("Ces matchs sont terminés : l'accès ventilation ne peut plus être ouvert.");
    }
    await this.prisma.inventoryWindow.update({
      where: { id: window.id },
      data: { status: 'open', openedAt: new Date(), openedBy: user.id, closedAt: null, closedBy: null },
    });
    // Reprise : l'arrêt avait révoqué l'accès, il redevient joignable avec le même PIN.
    await this.prisma.guestPinAccess.updateMany({
      where: { windowId: window.id, status: 'revoked' },
      data: { status: 'active', revokedAt: null, revokedBy: null },
    });
    await this.guestPinWindowService.ensureWindowPin({ ...window, status: 'open' }, user.id);
    return this.windowStatus(tenantId, dto.spaceId, window.id);
  }

  async stop(dto: VentilationWindowDto, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, dto.spaceId);
    const window = await this.requireWindow(user.tenantId!, dto.spaceId, dto.windowId);
    if (window.status === 'open') {
      await this.guestPinWindowService.closeWindowRecord(window, user.id, { pushToLogistic: false, reason: 'manual-stop' });
    }
    return this.windowStatus(user.tenantId!, dto.spaceId, window.id);
  }

  async resetPin(dto: VentilationWindowDto, user: CurrentUserData) {
    await this.spaceAccess.assertCanAccessSpace(user, dto.spaceId);
    const window = await this.requireWindow(user.tenantId!, dto.spaceId, dto.windowId);
    if (window.status !== 'open') {
      throw new BadRequestException("L'accès ventilation est arrêté : reprenez-le avant de changer le PIN.");
    }
    await this.guestPinWindowService.regenerateWindowPin(window.id, window.tenantId, user.id);
    return this.windowStatus(user.tenantId!, dto.spaceId, window.id);
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
   * Données de la feuille de ventilation de l'invité : feuilles de réarmement des
   * matchs de son accès (premier match + matchs rattachés ; lignes réduites aux
   * champs utiles), corrections, lignes cochées « réarmé », dépôts déjà faits (cumul
   * + liste) pour tous les matchs de ces feuilles, stockages et tailles de pack.
   * Le reste à déposer est calculé côté front par le MÊME code que l'écran Logistique
   * (utils/ventilationPlans.js + utils/restockDepositSheet.js).
   */
  async getSheet(user: GuestPinUser, deviceId: string | undefined) {
    this.assertVentilationSession(user);
    const session = await this.sessionContext(user);
    const depositEventIds = this.depositEventIds(session);
    const [sums, movements, storages] = await Promise.all([
      this.deposits.sumByEvents(user.spaceId, depositEventIds, user.tenantId),
      this.deposits.listByEvents(user.spaceId, depositEventIds, user.tenantId),
      this.storagesOf(user, session.events),
    ]);
    const plans = session.plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      selectedEventIds: plan.selectedEventIds,
      restockLines: planLines(plan).map(pickSheetLine),
      lineOverrides: plan.lineOverrides ?? {},
      restockedRows: plan.restockedRows ?? {},
    }));
    const elementIds = uniqueIds([
      ...plans.flatMap((p) => p.restockLines.map((l) => String(l.shopId))),
      ...sums.map((d) => d.elementId),
    ]);
    const packSizes = await this.deposits.packSizes(user.spaceId, user.tenantId, elementIds);
    const uppByKey = new Map(packSizes.map((p) => [`${p.elementId}::${normalizeItemName(p.itemName)}`, p.unitsPerPack]));
    const actor = this.actorOf(user, deviceId);
    return {
      eventId: user.eventId,
      eventName: session.events.map((e) => e.name).join(' + ') || null,
      // Matchs de l'accès, ordre chronologique (ordre d'imputation des dépôts).
      eventOrder: session.events.map((e) => e.id),
      plans,
      deposits: sums.map((d) => ({ ...d, unitsPerPack: uppByKey.get(`${d.elementId}::${normalizeItemName(d.itemKey)}`) ?? null })),
      packSizes,
      storages,
      movements: movements.map(({ createdBy, ...m }) => ({ ...m, cancellable: !m.cancelled && createdBy === actor })),
    };
  }

  /**
   * Dépôt d'un logisticien : sur une ligne d'une des feuilles de son accès (`rowKey`
   * préfixé par l'id de la feuille, cf. utils/ventilationPlans.js), ou dans un
   * stockage du périmètre sans ligne prévue. Le front répartit déjà une saisie entre
   * les feuilles ; chaque dépôt est enregistré sur un match de SA feuille.
   */
  async deposit(user: GuestPinUser, dto: GuestVentilationDepositDto, deviceId: string | undefined) {
    this.assertVentilationSession(user);
    if (dto.packed <= 0 && dto.loose <= 0) throw new BadRequestException('Quantité nulle');
    const session = await this.sessionContext(user);
    const target = dto.rowKey ? this.lineTarget(session, dto.rowKey) : await this.storageTarget(user, session, dto);
    const itemKey = await this.deposits.resolveElementItemKey(user.spaceId, target.elementId, target.itemName, user.tenantId);
    const { movement } = await this.stockMovementService.createMovement(
      {
        spaceId: user.spaceId,
        elementId: target.elementId,
        itemKey,
        direction: 'add',
        packed: dto.packed,
        loose: dto.loose,
        reason: 'VENTILATION',
        eventId: target.eventId,
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

  /**
   * Matchs de l'accès de l'invité (premier match + matchs rattachés à sa fenêtre),
   * ordre chronologique, et la feuille de réarmement de chacun (la plus récemment
   * modifiée qui le contient, même règle que Logistique), sans doublon.
   */
  private async sessionContext(user: GuestPinUser): Promise<SessionContext> {
    const window = await this.prisma.inventoryWindow.findFirst({
      where: { id: user.windowId, tenantId: user.tenantId },
      select: { eventId: true, linkedEventIds: true },
    });
    const ids = uniqueIds([window?.eventId ?? user.eventId, ...(window?.linkedEventIds ?? [])]);
    const events = await this.ventilationEvents.orderedEvents(user.spaceId, user.tenantId, ids);
    const order = events.map((e) => e.id);
    const candidates = order.length
      ? await this.prisma.restockPlan.findMany({
          where: { tenantId: user.tenantId, spaceId: user.spaceId, selectedEventIds: { hasSome: order } },
          orderBy: { updatedAt: 'desc' },
          select: { id: true, name: true, selectedEventIds: true, restockLines: true, lineOverrides: true, restockedRows: true },
        })
      : [];
    const plans: SessionPlan[] = [];
    for (const eventId of order) {
      const plan = candidates.find((p) => p.selectedEventIds.includes(eventId));
      if (plan && !plans.some((p) => p.id === plan.id)) plans.push(plan);
    }
    return { events, order, plans };
  }

  /** Tous les matchs des feuilles de l'accès : un dépôt compte pour sa feuille, quel que soit son match. */
  private depositEventIds(session: SessionContext): string[] {
    return uniqueIds([...session.order, ...session.plans.flatMap((p) => p.selectedEventIds)]);
  }

  /**
   * Destination, article et match d'un dépôt sur une ligne d'une feuille de l'accès.
   * `rowKey` = `planId::rowKey` (feuilles fusionnées) ; sans préfixe, première feuille.
   */
  private lineTarget(session: SessionContext, key: string): DepositTarget {
    const sep = key.indexOf('::');
    const planId = sep >= 0 ? key.slice(0, sep) : null;
    const rowKey = sep >= 0 ? key.slice(sep + 2) : key;
    const plan = planId ? session.plans.find((p) => p.id === planId) : session.plans[0];
    const line = plan ? planLines(plan).find((l) => l?.rowKey === rowKey) : null;
    if (!plan || !line?.shopId) throw new NotFoundException('Cette ligne ne figure pas sur la feuille de ventilation du match');
    // Ligne retirée de la feuille depuis (cochée « réarmé » ou corrigée à 0) : plus rien à y déposer.
    const restocked = (plan.restockedRows ?? {}) as Record<string, unknown>;
    const overrides = (plan.lineOverrides ?? {}) as Record<string, unknown>;
    const override = overrides[rowKey];
    if (restocked[rowKey] || (override != null && override !== '' && Number(override) <= 0)) {
      throw new BadRequestException("Cette ligne n'est plus à déposer : rechargez la feuille");
    }
    // Match de la feuille le plus proche parmi ceux de l'accès (même règle que le front).
    const eventId = session.order.find((id) => plan.selectedEventIds.includes(id)) ?? plan.selectedEventIds[0];
    return { elementId: String(line.shopId), itemName: String(line.itemName ?? ''), eventId };
  }

  /**
   * Dépôt dans un espace de stockage sans ligne prévue (section « Espaces de
   * stockage ») : le stockage doit être dans le périmètre des matchs et l'article sur
   * une de leurs feuilles (jamais un article inventé par le client). Enregistré sur le
   * premier match de l'accès.
   */
  private async storageTarget(user: GuestPinUser, session: SessionContext, dto: GuestVentilationDepositDto): Promise<DepositTarget> {
    const storages = await this.storagesOf(user, session.events);
    if (!storages.some((s) => s.id === dto.storageId)) {
      throw new NotFoundException('Cet espace de stockage ne fait pas partie du match');
    }
    const wanted = normalizeItemName(dto.itemName);
    const line = session.plans.flatMap(planLines).find((l) => normalizeItemName(String(l?.itemName ?? '')) === wanted);
    if (!wanted || !line) throw new NotFoundException('Cet article ne figure pas sur la feuille de ventilation du match');
    return { elementId: String(dto.storageId), itemName: String(line.itemName), eventId: session.order[0] ?? user.eventId };
  }

  /** Stockages des configurations des matchs de l'accès. */
  private storagesOf(user: GuestPinUser, events: Array<{ configurationId: string | null }>) {
    return this.deposits.storagesOfConfigs(
      user.spaceId,
      user.tenantId,
      uniqueIds(events.map((e) => e.configurationId)),
    );
  }

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

  private findWindowById(tenantId: string, spaceId: string, windowId: string) {
    return this.prisma.inventoryWindow.findFirst({ where: { id: windowId, tenantId, spaceId, phase: VENTILATION_PHASE } });
  }

  private async requireWindow(tenantId: string, spaceId: string, windowId: string) {
    const window = await this.findWindowById(tenantId, spaceId, windowId);
    if (!window) throw new NotFoundException('Accès ventilation introuvable');
    return window;
  }

  private async windowStatus(tenantId: string, spaceId: string, windowId: string) {
    const [space, window] = await Promise.all([
      this.prisma.space.findFirst({ where: { id: spaceId, tenantId }, select: { ventilationSlug: true } }),
      this.findWindowById(tenantId, spaceId, windowId),
    ]);
    return this.statusView(space?.ventilationSlug ?? null, window);
  }

  private openWindowWithPin(spaceId: string) {
    return this.prisma.inventoryWindow.findFirst({
      where: { spaceId, phase: VENTILATION_PHASE, status: 'open', pinLookupHash: { not: null } },
      select: { id: true },
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
            linkedEventIds: window.linkedEventIds ?? [],
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
      // eslint-disable-next-line no-await-in-loop -- nouvel essai seulement en cas de collision de slug (rare)
      const clash = await this.prisma.spaceElement.findUnique({ where: { slug }, select: { id: true } });
      if (clash) continue;
      try {
        // eslint-disable-next-line no-await-in-loop -- idem
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

/** Ligne de la feuille de réarmement telle que stockée (JSON du RestockPlan). */
type RestockLine = Record<string, unknown> & { rowKey?: string; shopId?: string };

interface SessionPlan {
  id: string;
  name: string;
  selectedEventIds: string[];
  restockLines: Prisma.JsonValue;
  lineOverrides: Prisma.JsonValue;
  restockedRows: Prisma.JsonValue;
}

interface SessionContext {
  /** Matchs de l'accès, ordre chronologique. */
  events: Array<{ id: string; name: string; configurationId: string | null }>;
  order: string[];
  plans: SessionPlan[];
}

interface DepositTarget {
  elementId: string;
  itemName: string;
  eventId: string;
}

function planLines(plan: { restockLines: Prisma.JsonValue }): RestockLine[] {
  return Array.isArray(plan.restockLines) ? (plan.restockLines as RestockLine[]) : [];
}

/**
 * Clé d'une combinaison de matchs : empreinte des ids triés, pour que la même
 * combinaison donne toujours le même accès quel que soit l'ordre de sélection.
 */
export function ventilationSelectionKey(eventIds: string[]): string {
  const ids = uniqueIds(eventIds).sort();
  return createHash('sha256').update(ids.join(',')).digest('hex').slice(0, 32);
}

function pickSheetLine(line: RestockLine) {
  const out: Record<string, unknown> = {};
  for (const field of SHEET_LINE_FIELDS) if (line?.[field] !== undefined) out[field] = line[field];
  return out;
}
