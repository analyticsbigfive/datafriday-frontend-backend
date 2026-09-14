import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/database/prisma.service';
import { FlowEvent, PreEventInventoryFlowService } from './pre-event-inventory-flow.service';

/**
 * Cron du flux Pre-event Inventory autour de l'ouverture des portes (proxy :
 * `eventStartDate ?? eventDate`, sans borne de provider : Weezevent ET Digifood).
 * Toutes les minutes, pour chaque event dont les portes sont ouvertes :
 *  1. `runDoorsOpen` (idempotent, marqueur KvStore) : clôt la fenêtre invité
 *     pre-event, régénère la feuille de réconciliation et recale la Logistique
 *     avec tout ce qui a été saisi ;
 *  2. `flushDirty` pendant les 30 minutes d'édition staff qui suivent : toute
 *     écriture depuis la dernière feuille la régénère (Logistique comprise).
 *
 * Historique : décision Bertrand du 2026-07-24 (question #24, 11_LIVE.md §15,
 * init du stock Live depuis le snapshot pre-event, toutes les 5 min), remplacée
 * le 2026-09-14 par le flux ci-dessus (critères d'acceptation Pre-event
 * Inventory). La cadence passe à la minute pour tenir la fenêtre des 30 min.
 */
@Injectable()
export class InventoryLiveInitCronService implements OnModuleInit {
  private readonly logger = new Logger(InventoryLiveInitCronService.name);
  private isEnabled = true;

  // Même tolérance que LIVE_AGGREGATION_GRACE_HOURS (WeezeventCronService, BUG-109) :
  // combien de temps après la fin d'un event on tente encore le passage "portes
  // ouvertes" (rattrapage d'un tick manqué, redéploiement pendant le match).
  private readonly GRACE_HOURS = 3;
  // Marge après la fin des 30 minutes pour vider un dernier marqueur "dirty".
  private readonly DIRTY_FLUSH_GRACE_MS = 2 * 60 * 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly flow: PreEventInventoryFlowService,
  ) {}

  onModuleInit() {
    this.isEnabled = process.env.INVENTORY_LIVE_INIT_CRON_ENABLED !== 'false';
    this.logger.log(`Inventory live-init CRON ${this.isEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async autoInitLiveStockForOpenEvents(): Promise<void> {
    if (!this.isEnabled) return;

    const now = new Date();
    const graceMs = this.GRACE_HOURS * 60 * 60 * 1000;

    // Bornée à 7 jours en DB (perf, même pattern que triggerLiveAggregationSafetyNet),
    // le filtre de fenêtre précis est appliqué ensuite en mémoire.
    const candidates = await this.prisma.event.findMany({
      where: {
        tenantId: { not: null },
        spaceId: { not: null },
        eventDate: { lte: now, gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        tenantId: true,
        spaceId: true,
        name: true,
        eventDate: true,
        eventStartDate: true,
        eventEndDate: true,
      },
    });

    const openEvents = candidates
      .map(
        (e) =>
          ({ ...e, tenantId: e.tenantId as string, spaceId: e.spaceId as string }) as FlowEvent,
      )
      .filter((e) => {
        const start = this.flow.doorsOpenAt(e);
        const end = e.eventEndDate ?? e.eventDate;
        const graceEnd = new Date(end.getTime() + graceMs);
        return now >= start && now <= graceEnd;
      });
    if (!openEvents.length) return;

    for (const e of openEvents) {
      try {
        const opened = await this.flow.runDoorsOpen(e);
        if (opened.ok) {
          this.logger.log(
            `Portes ouvertes : feuille pre-event générée : space ${e.spaceId} / event ${e.id} (${opened.lineCount} ligne(s))`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Doors-open flow failed for space ${e.spaceId}/event ${e.id}: ${error.message}`,
        );
      }

      if (now.getTime() > this.flow.editDeadline(e).getTime() + this.DIRTY_FLUSH_GRACE_MS) continue;
      try {
        const flushed = await this.flow.flushDirty(e);
        if (flushed.ok) {
          this.logger.log(
            `Feuille pre-event régénérée après édition : space ${e.spaceId} / event ${e.id} (${flushed.lineCount} ligne(s))`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Dirty flush failed for space ${e.spaceId}/event ${e.id}: ${error.message}`,
        );
      }
    }
  }
}
