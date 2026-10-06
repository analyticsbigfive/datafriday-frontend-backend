import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PreEventInventoryFlowService } from './pre-event-inventory-flow.service';

/**
 * Logistique mise à jour depuis les comptages, regroupée à la minute (document Bertrand
 * « Pre et Post event Inventory cycle », 2026-10-06, D1 ; délai ≤ 1 min validé par Ulrich
 * le 2026-10-06). Chaque « Marquer compté » pose un marqueur ; ce cron envoie les lignes
 * modifiées depuis leur dernier envoi. Un envoi par clic recalculerait le stock de tout
 * l'espace des centaines de fois par match (LogisticsService.reset).
 */
@Injectable()
export class InventoryLogisticSyncCronService implements OnModuleInit {
  private readonly logger = new Logger(InventoryLogisticSyncCronService.name);
  private isEnabled = true;
  private running = false;

  constructor(private readonly flow: PreEventInventoryFlowService) {}

  onModuleInit() {
    this.isEnabled = process.env.INVENTORY_LOGISTIC_SYNC_CRON_ENABLED !== 'false';
    this.logger.log(`Inventory → Logistic sync CRON ${this.isEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (!this.isEnabled || this.running) return;
    this.running = true;
    try {
      const pushed = await this.flow.flushLogisticDirty();
      if (pushed) this.logger.log(`Comptages envoyés vers Logistic : ${pushed} match(s)`);
    } catch (error: any) {
      this.logger.warn(`Envoi des comptages vers Logistic en échec : ${error?.message}`);
    } finally {
      this.running = false;
    }
  }
}
