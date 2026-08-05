import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../core/database/prisma.service';
import { InventoryService } from './inventory.service';

/**
 * Déclenche `InventoryService.autoInitLiveStockFromPreEventInventory` pour tout
 * event dont l'« ouverture des portes » (proxy : `eventStartDate ?? eventDate`)
 * est passée, sans borne de provider (Weezevent ET Digifood — contrairement à
 * `WeezeventCronService`, ce chantier n'est pas spécifique à une intégration).
 * Décision Bertrand du 2026-07-24 (question #24, 11_LIVE.md §15), implémentée le
 * 2026-08-05. Idempotent côté service (marqueur KvStore) — un passage redondant
 * toutes les 5 min ne duplique rien, il rattrape juste un tick manqué ou un
 * comptage pré-événement sauvegardé après l'ouverture des portes.
 */
@Injectable()
export class InventoryLiveInitCronService implements OnModuleInit {
  private readonly logger = new Logger(InventoryLiveInitCronService.name);
  private isEnabled = true;

  // Même tolérance que LIVE_AGGREGATION_GRACE_HOURS (WeezeventCronService, BUG-109) :
  // combien de temps après la fin d'un event on tente encore l'auto-init (rattrapage
  // d'un event dont le comptage pré-événement n'a été sauvegardé que tardivement).
  private readonly GRACE_HOURS = 3;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
  ) {}

  onModuleInit() {
    this.isEnabled = process.env.INVENTORY_LIVE_INIT_CRON_ENABLED !== 'false';
    this.logger.log(`Inventory live-init CRON ${this.isEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async autoInitLiveStockForOpenEvents(): Promise<void> {
    if (!this.isEnabled) return;

    const now = new Date();
    const graceMs = this.GRACE_HOURS * 60 * 60 * 1000;

    // Bornée à 7 jours en DB (perf, même pattern que triggerLiveAggregationSafetyNet) —
    // le filtre de fenêtre précis est appliqué ensuite en mémoire.
    const candidates = await this.prisma.event.findMany({
      where: {
        tenantId: { not: null },
        spaceId: { not: null },
        eventDate: { lte: now, gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, tenantId: true, spaceId: true, name: true, eventDate: true, eventStartDate: true, eventEndDate: true },
    });

    const openEvents = candidates.filter((e) => {
      const start = e.eventStartDate ?? e.eventDate;
      const end = e.eventEndDate ?? e.eventDate;
      const graceEnd = new Date(end.getTime() + graceMs);
      return now >= start && now <= graceEnd;
    });
    if (!openEvents.length) return;

    for (const e of openEvents) {
      try {
        const result = await this.inventoryService.autoInitLiveStockFromPreEventInventory(
          e.spaceId as string,
          e.id,
          e.name,
          e.tenantId as string,
        );
        if (result.ok) {
          this.logger.log(`Live stock auto-initialisé depuis l'Inventaire pré-événement — space ${e.spaceId} / event ${e.id} (${result.lineCount} ligne(s))`);
        }
      } catch (error) {
        this.logger.warn(`Live stock auto-init failed for space ${e.spaceId}/event ${e.id}: ${error.message}`);
      }
    }
  }
}
