import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { InventoryWindow, Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { SpaceShopsService } from '../../spaces/services/space-shops.service';
import { GuestPinWindowService } from '../services/guest-pin-window.service';
import { GuestPinPhaseService } from '../services/guest-pin-phase.service';
import { PRE_SALE_STOP_ACTOR, preSaleStopKey } from '../pre-sale-stop';
import {
  isEventOver,
  pickNextEventBeforeDoorsOpen,
  resolveEventTransactionWindow,
  resolvePostEventAutoStartAt,
} from '../../../shared/utils/event-window.util';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Au-delà, un démarrage automatique du post-event n'est plus rattrapé (serveur arrêté). */
const POST_AUTOSTART_CATCHUP_MS = 6 * 60 * 60 * 1000;

const ATTACHED = { tenantId: { not: null }, spaceId: { not: null } } as const;

const EVENT_SELECT = {
  id: true,
  tenantId: true,
  spaceId: true,
  eventDate: true,
  eventStartDate: true,
  eventEndDate: true,
  eventEndTime: true,
  integrationId: true,
  sessions: true,
  space: { select: { timezone: true } },
} as const;

type CycleEvent = Prisma.EventGetPayload<{ select: typeof EVENT_SELECT }>;

/**
 * Cycle automatique des inventaires pre / post-event (document Bertrand « Pre et Post
 * event Inventory cycle », 2026-10-06, pages 1 à 4) :
 * - PIN préparés à l'avance pour chaque event à venir (fenêtres arrêtées, avec PIN) ;
 * - heure du show de N (sinon ouverture des portes) : le post-event de N démarre ; le
 *   pre-event de N continue (Bertrand 2026-10-07) pour les PDV qui n'ont pas encore vendu ;
 * - livraison détectée en Logistique APRÈS la fin réelle de N : le post-event de N
 *   s'arrête et le pre-event du prochain event démarre (D3, D16) ;
 * - première vente d'un PDV le jour de N : le pre-event de N s'arrête pour CE PDV
 *   seulement, vente de test comprise (Bertrand 2026-10-07, remplace l'arrêt de tout
 *   l'espace après 3 ventes en 15 min ; cf. pre-sale-stop.ts).
 *
 * Chaque déclenchement automatique ne joue qu'UNE fois (marqueur KvStore) : une reprise
 * manuelle faite après coup par le responsable n'est jamais annulée au tick suivant.
 * Les arrêts referment aussi les PDV rouverts un par un (D8, cf. stopPhaseWindow).
 */
@Injectable()
export class InventoryCycleCronService {
  private readonly logger = new Logger(InventoryCycleCronService.name);
  private running = false;
  private preparing = false;

  static readonly ACTOR = 'system-inventory-cycle';

  constructor(
    private readonly prisma: PrismaService,
    private readonly guestPinWindowService: GuestPinWindowService,
    private readonly guestPinPhaseService: GuestPinPhaseService,
    private readonly spaces: SpaceShopsService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    const now = new Date();
    try {
      await this.run('démarrage du post-event aux portes', () => this.startPostAtShowTime(now));
      await this.run('arrêt du post-event sur livraison', () => this.stopPostOnDelivery(now));
      await this.run('arrêt du pre-event PDV par PDV sur vente', () => this.stopPreElementsOnSale(now));
    } finally {
      this.running = false;
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async prepareTick(): Promise<void> {
    if (this.preparing) return;
    this.preparing = true;
    try {
      await this.run('préparation des PIN', () => this.prepareUpcomingWindows(new Date()));
    } finally {
      this.preparing = false;
    }
  }

  private async run(label: string, job: () => Promise<number>): Promise<void> {
    try {
      // Events et fenêtres de tous les tenants : transverse, chaque requête porte son tenantId.
      const count = await this.tenantContext.runWithoutTenantScope(job);
      if (count) this.logger.log(`${label} : ${count}`);
    } catch (error: any) {
      this.logger.warn(`${label} en échec : ${error?.message}`);
    }
  }

  /** Fenêtres pre ET post préparées (arrêtées, avec PIN) pour chaque event non terminé. */
  async prepareUpcomingWindows(now: Date): Promise<number> {
    const events = await this.prisma.event.findMany({
      // tenantId / spaceId nullables en base : un event orphelin n'a pas d'inventaire.
      where: { eventDate: { gte: new Date(now.getTime() - DAY_MS) }, isSimulated: false, ...ATTACHED },
      select: EVENT_SELECT,
    });
    const targets = events
      .filter((event) => !isEventOver(event, this.tz(event), now))
      .flatMap((event) => (['pre-event', 'post-event'] as const).map((phase) => ({ event, phase })));
    let created = 0;
    for (const { event, phase } of targets) {
      // eslint-disable-next-line no-await-in-loop -- une fenêtre à la fois : création et PIN unique sur toute la base (nouvel essai en cas de collision)
      const result = await this.guestPinWindowService.prepareWindow(
        { spaceId: event.spaceId, eventId: event.id, phase },
        event.tenantId,
        InventoryCycleCronService.ACTOR,
      );
      if (result === 'created') created++;
    }
    return created;
  }

  /** Show de N commencé (sinon portes ouvertes) : le post-event de N démarre, une fois, sans
   *  arrêter le pre-event. */
  async startPostAtShowTime(now: Date): Promise<number> {
    const events = await this.prisma.event.findMany({
      where: {
        eventDate: { gte: new Date(now.getTime() - 2 * DAY_MS), lte: new Date(now.getTime() + DAY_MS) },
        isSimulated: false,
        ...ATTACHED,
      },
      select: EVENT_SELECT,
    });
    let started = 0;
    for (const event of events) {
      // eslint-disable-next-line no-await-in-loop -- un event à la fois : chaque démarrage réclame son marqueur et ouvre sa fenêtre
      if (await this.startPostIfDue(event, now)) started++;
    }
    return started;
  }

  private async startPostIfDue(event: CycleEvent, now: Date): Promise<boolean> {
    // Heure du show (Bertrand 2026-10-07), sinon ouverture des portes ; sans aucune des
    // deux : pas de démarrage automatique, le directeur démarre à la main.
    const startAt = resolvePostEventAutoStartAt(event, this.tz(event));
    if (!startAt || startAt > now || now.getTime() - startAt.getTime() > POST_AUTOSTART_CATCHUP_MS) return false;
    const claimed = await this.claim(event.tenantId, `inventory-cycle:post-start:${event.spaceId}:${event.id}`, now);
    if (!claimed) return false;
    await this.guestPinPhaseService.startPhase(
      { spaceId: event.spaceId, eventId: event.id, phase: 'post-event' },
      event.tenantId,
      InventoryCycleCronService.ACTOR,
      { keepOtherPhase: true },
    );
    return true;
  }

  /** Livraison après la fin réelle de N : post-event de N arrêté, pre-event suivant démarré. */
  async stopPostOnDelivery(now: Date): Promise<number> {
    const windows = await this.reachableWindows('post-event');
    let stopped = 0;
    for (const window of windows) {
      // eslint-disable-next-line no-await-in-loop -- une fenêtre à la fois : l'arrêt de l'une et le démarrage du pre-event suivant s'enchaînent
      if (await this.stopPostIfDelivered(window, now)) stopped++;
    }
    return stopped;
  }

  private async stopPostIfDelivered(window: InventoryWindow, now: Date): Promise<boolean> {
    const event = await this.findEvent(window);
    // Event supprimé, ou pas encore terminé : un réassort pendant le match ne coupe rien (D16).
    if (!event || !isEventOver(event, this.tz(event), now)) return false;
    const endedAt = resolveEventTransactionWindow(event, this.tz(event)).end;
    // Un dépôt « Ventilation » (réarmement du match suivant) remplit les PDV comme
    // une livraison : un comptage post-event fait après lui serait faussé.
    const delivery = await this.prisma.stockMovement.findFirst({
      where: {
        tenantId: window.tenantId,
        spaceId: window.spaceId,
        reason: { in: ['DELIVERY', 'VENTILATION'] },
        createdAt: { gt: endedAt },
      },
      select: { id: true },
    });
    if (!delivery) return false;
    if (!(await this.claim(window.tenantId, `inventory-cycle:post-delivery:${window.id}`, now))) return false;

    const next = await this.nextEvent(window, now);
    if (next) {
      // Démarrer le pre-event arrête le post-event (startPhase → stopOtherPhase).
      await this.guestPinPhaseService.startPhase(
        { spaceId: window.spaceId, eventId: next.id, phase: 'pre-event' },
        window.tenantId,
        InventoryCycleCronService.ACTOR,
      );
    }
    // Toujours arrêter explicitement : sans event suivant, ou PDV rouverts un par un.
    const fresh = await this.prisma.inventoryWindow.findUnique({ where: { id: window.id } });
    if (fresh) await this.guestPinPhaseService.stopPhaseWindow(fresh, InventoryCycleCronService.ACTOR, 'delivery');
    return true;
  }

  /**
   * Première vente d'un PDV le jour de N : pre-event de N arrêté pour ce PDV seul, une fois
   * (pre-sale-stop.ts). Seuls les PDV encore joignables en pre-event sont concernés ; un PDV
   * rouvert à la main n'est jamais recoupé.
   */
  async stopPreElementsOnSale(now: Date): Promise<number> {
    const windows = await this.reachableWindows('pre-event');
    let stopped = 0;
    for (const window of windows) {
      // eslint-disable-next-line no-await-in-loop -- une fenêtre à la fois : chaque arrêt réclame son marqueur avant d'agir
      stopped += await this.stopPreElementsOfWindow(window, now);
    }
    return stopped;
  }

  private async stopPreElementsOfWindow(window: InventoryWindow, now: Date): Promise<number> {
    const event = await this.findEvent(window);
    if (!event) return 0;
    // Avant le jour de N, aucune vente ne peut lui être rattachée : pas de requête.
    const eventStart = resolveEventTransactionWindow(event, this.tz(event)).start;
    if (now < eventStart) return 0;
    const firstSales = await this.spaces.firstValidSaleByElementSince(window.spaceId, window.tenantId, eventStart);
    if (!firstSales.size) return 0;
    const accesses = await this.prisma.guestPinAccess.findMany({
      where: { windowId: window.id, elementId: { in: [...firstSales.keys()] } },
      select: { elementId: true, status: true },
    });
    const statusByElement = new Map(accesses.map((a) => [a.elementId, a.status]));
    // Sans ligne, le PDV suit la fenêtre (ouverte en masse ou non).
    const reachable = [...firstSales.keys()].filter((elementId) => {
      const status = statusByElement.get(elementId);
      return status ? status === 'active' : window.status === 'open';
    });
    let stopped = 0;
    for (const elementId of reachable) {
      // eslint-disable-next-line no-await-in-loop -- un PDV à la fois : marqueur réclamé puis arrêt, jamais deux fois
      if (await this.stopPreElementOnce(window, elementId, now)) stopped++;
    }
    return stopped;
  }

  private async stopPreElementOnce(window: InventoryWindow, elementId: string, now: Date): Promise<boolean> {
    if (!(await this.claim(window.tenantId, preSaleStopKey(window.id, elementId), now))) return false;
    await this.guestPinPhaseService.stopPreElement(window, elementId, PRE_SALE_STOP_ACTOR);
    return true;
  }

  /** Fenêtres de cette phase joignables : ouvertes, ou avec un PDV rouvert seul. */
  private reachableWindows(phase: 'pre-event' | 'post-event'): Promise<InventoryWindow[]> {
    return this.prisma.inventoryWindow.findMany({
      where: { phase, OR: [{ status: 'open' }, { guestAccesses: { some: { status: 'active' } } }] },
    });
  }

  private findEvent(window: InventoryWindow) {
    return this.prisma.event.findFirst({
      where: { id: window.eventId, tenantId: window.tenantId },
      select: EVENT_SELECT,
    });
  }

  /** Prochain event de l'espace dont les portes ne sont pas encore ouvertes. */
  private async nextEvent(window: InventoryWindow, now: Date) {
    const candidates = await this.prisma.event.findMany({
      where: {
        tenantId: window.tenantId,
        spaceId: window.spaceId,
        isSimulated: false,
        eventDate: { gte: new Date(now.getTime() - DAY_MS) },
      },
      select: EVENT_SELECT,
    });
    const tz = candidates[0] ? this.tz(candidates[0]) : 'Europe/Paris';
    return pickNextEventBeforeDoorsOpen(candidates, tz, now);
  }

  private tz(event: { space?: { timezone: string | null } | null }): string {
    return event.space?.timezone || 'Europe/Paris';
  }

  /** Marqueur « déjà fait » : faux si un autre tick (ou instance) l'a déjà posé. */
  private async claim(tenantId: string, key: string, now: Date): Promise<boolean> {
    try {
      await this.prisma.kvStore.create({ data: { tenantId, key, value: { at: now.toISOString() } } });
      return true;
    } catch (error: any) {
      if (error?.code === 'P2002') return false;
      throw error;
    }
  }
}
