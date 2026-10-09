import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../../core/database/prisma.service';
import { VENTILATION_PHASE, inventoryWindowPeriod, inventoryWindowPeriodState } from '../inventory-window-period';
import { revokeWindowAccesses } from '../../inventory/inventory-window-closure';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';
import { GuestPinWindowService } from '../services/guest-pin-window.service';

/**
 * Clôture automatique des fenêtres invité (PIN) PRE-EVENT à la fin réelle de l'event
 * (cf. inventory-window-period.ts ; aux portes jusqu'au 2026-10-07). Les PDV rouverts un
 * par un sur une fenêtre arrêtée sont coupés eux aussi. Le post-event n'est jamais fermé ici : c'est
 * l'utilisateur qui le clôture (« Update Logistic »), décision Ulrich 2026-09-28.
 *
 * Piloté par les FENÊTRES OUVERTES, pas par les events récents : l'ancien seul
 * mécanisme (InventoryLiveInitCronService, candidats bornés à 7 jours et marqueur déjà
 * posé) laissait des fenêtres pre-event ouvertes indéfiniment, qui bloquaient ensuite le
 * match suivant (index unique une fenêtre ouverte par espace et par phase, incident Jean
 * Bouin 26/09). Chaque tick rattrape donc aussi toute fenêtre oubliée.
 *
 * Jamais de push Logistic ici : le flux « portes ouvertes »
 * (PreEventInventoryFlowService.runDoorsOpen) régénère et pousse la feuille pre-event.
 */
@Injectable()
export class InventoryWindowLifecycleCronService {
  private readonly logger = new Logger(InventoryWindowLifecycleCronService.name);
  private running = false;

  static readonly ACTOR = 'system-window-lifecycle';

  constructor(
    private readonly prisma: PrismaService,
    private readonly guestPinWindowService: GuestPinWindowService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Fenêtres de tous les tenants : transverse ; chaque clôture dans son tenant.
      await this.tenantContext.runWithoutTenantScope(() => this.closeExpiredWindows());
    } catch (error: any) {
      this.logger.warn(`Clôture automatique des fenêtres en échec : ${error?.message}`);
    } finally {
      this.running = false;
    }
  }

  async closeExpiredWindows(now: Date = new Date()): Promise<number> {
    const windows = await this.prisma.inventoryWindow.findMany({
      where: {
        // Ventilation (décision #75) : fermée à la fin réelle du match, comme le pre-event.
        phase: { in: ['pre-event', VENTILATION_PHASE] },
        OR: [{ status: 'open' }, { guestAccesses: { some: { status: 'active' } } }],
      },
    });
    if (!windows.length) return 0;

    const events = await this.prisma.event.findMany({
      // Ventilation : les matchs rattachés comptent (fermeture à la fin du dernier).
      where: { id: { in: [...new Set(windows.flatMap((w) => [w.eventId, ...(w.linkedEventIds ?? [])]))] } },
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
    const eventById = new Map(events.map((e) => [e.id, e]));

    let closedCount = 0;
    for (const window of windows) {
      // Ventilation : accès d'une sélection de matchs, ouvert jusqu'à la fin du dernier
      // (maquettes Bertrand 2026-10-09). Event supprimé : ignoré ; tous supprimés :
      // fenêtre orpheline, clôturée elle aussi.
      const windowEvents = (window.phase === VENTILATION_PHASE ? [window.eventId, ...(window.linkedEventIds ?? [])] : [window.eventId])
        .map((id) => eventById.get(id))
        .filter((e): e is NonNullable<typeof e> => !!e);
      const stillRunning = windowEvents.some((event) => {
        const period = inventoryWindowPeriod(event, 'pre-event', event.space?.timezone || 'Europe/Paris');
        return inventoryWindowPeriodState(period, now) !== 'over';
      });
      if (stillRunning) continue;
      try {
        if (window.status !== 'open') {
          // Fenêtre déjà arrêtée : seuls des PDV rouverts un par un restaient joignables.
          // eslint-disable-next-line no-await-in-loop -- fenêtres expirées traitées une par une, chacune dans son contexte tenant
          await this.tenantContext.runForTenant(window.tenantId, () =>
            revokeWindowAccesses(this.prisma, [window.id], InventoryWindowLifecycleCronService.ACTOR),
          );
          closedCount++;
          continue;
        }
        // eslint-disable-next-line no-await-in-loop -- fenêtres expirées traitées une par une, chacune dans son contexte tenant
        const push = await this.tenantContext.runForTenant(window.tenantId, () =>
          this.guestPinWindowService.closeWindowRecord(window, InventoryWindowLifecycleCronService.ACTOR, {
            pushToLogistic: false,
            reason: 'period-end',
          }),
        );
        if (push.reason === 'already-closed') continue;
        closedCount++;
        this.logger.log(
          `Fenêtre ${window.phase} clôturée à la fin de l'event : space ${window.spaceId} / event ${window.eventId}`,
        );
      } catch (error: any) {
        this.logger.warn(`Clôture de la fenêtre ${window.id} en échec : ${error?.message}`);
      }
    }
    return closedCount;
  }
}
