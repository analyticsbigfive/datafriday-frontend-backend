import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/database/prisma.service';
import { GuestPinAccessService } from './guest-pin-access.service';
import {
  InventoryWindowPhase,
  inventoryWindowPeriod,
  inventoryWindowPeriodState,
} from './inventory-window-period';

/**
 * Clôture automatique des fenêtres invité (PIN) à la fin de leur période
 * (cf. inventory-window-period.ts) : pre-event à l'ouverture des portes, post-event à
 * l'heure de fin de l'event.
 *
 * Piloté par les FENÊTRES OUVERTES, pas par les events récents : l'ancien seul
 * mécanisme (InventoryLiveInitCronService, candidats bornés à 7 jours et marqueur déjà
 * posé) laissait des fenêtres ouvertes indéfiniment, qui bloquaient ensuite le match
 * suivant (index unique une fenêtre ouverte par espace et par phase, incident Jean Bouin
 * 26/09). Chaque tick rattrape donc aussi toute fenêtre oubliée.
 *
 * Push Logistic : seulement pour un post-event clôturé à l'heure (au plus
 * LATE_PUSH_GRACE_MS après la fin), comme le bouton « Clôturer ». Le pre-event n'est
 * jamais poussé ici, le flux « portes ouvertes » (PreEventInventoryFlowService.runDoorsOpen)
 * s'en charge.
 */
@Injectable()
export class InventoryWindowLifecycleCronService implements OnModuleInit {
  private readonly logger = new Logger(InventoryWindowLifecycleCronService.name);
  private isEnabled = true;
  private running = false;

  static readonly ACTOR = 'system-window-lifecycle';
  static readonly LATE_PUSH_GRACE_MS = 3 * 60 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly guestPin: GuestPinAccessService,
  ) {}

  onModuleInit() {
    this.isEnabled = process.env.INVENTORY_WINDOW_LIFECYCLE_CRON_ENABLED !== 'false';
    this.logger.log(`Inventory window lifecycle CRON ${this.isEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (!this.isEnabled || this.running) return;
    this.running = true;
    try {
      await this.closeExpiredWindows();
    } catch (error: any) {
      this.logger.warn(`Clôture automatique des fenêtres en échec : ${error?.message}`);
    } finally {
      this.running = false;
    }
  }

  async closeExpiredWindows(now: Date = new Date()): Promise<number> {
    const windows = await this.prisma.inventoryWindow.findMany({ where: { status: 'open' } });
    if (!windows.length) return 0;

    const events = await this.prisma.event.findMany({
      where: { id: { in: [...new Set(windows.map((w) => w.eventId))] } },
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
      const event = eventById.get(window.eventId);
      let pushToLogistic = false;
      if (event) {
        const period = inventoryWindowPeriod(
          event,
          window.phase as InventoryWindowPhase,
          event.space?.timezone || 'Europe/Paris',
        );
        if (inventoryWindowPeriodState(period, now) !== 'over') continue;
        pushToLogistic =
          window.phase === 'post-event' &&
          now.getTime() - period.closesAt.getTime() <= InventoryWindowLifecycleCronService.LATE_PUSH_GRACE_MS;
      }
      // Event supprimé : fenêtre orpheline, clôturée sans push.
      try {
        const push = await this.guestPin.closeWindowRecord(window, InventoryWindowLifecycleCronService.ACTOR, {
          pushToLogistic,
          reason: 'period-end',
        });
        if (push.reason === 'already-closed') continue;
        closedCount++;
        this.logger.log(
          `Fenêtre ${window.phase} clôturée en fin de période : space ${window.spaceId} / event ${window.eventId}` +
            (pushToLogistic ? ` (push Logistic ${push.ok ? 'ok' : `échec : ${push.reason}`})` : ''),
        );
      } catch (error: any) {
        this.logger.warn(`Clôture de la fenêtre ${window.id} en échec : ${error?.message}`);
      }
    }
    return closedCount;
  }
}
