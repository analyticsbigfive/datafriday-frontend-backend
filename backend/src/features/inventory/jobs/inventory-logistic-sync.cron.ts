import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PreEventInventoryFlowService } from '../pre-event-inventory-flow.service';
import { TenantContextService } from '../../../core/tenant/tenant-context.service';

/**
 * Logistique mise à jour depuis les comptages, regroupée à la minute (document Bertrand
 * « Pre et Post event Inventory cycle », 2026-10-06, D1 ; délai ≤ 1 min validé par Ulrich
 * le 2026-10-06). Chaque « Marquer compté » pose un marqueur ; ce cron envoie les lignes
 * modifiées depuis leur dernier envoi. Un envoi par clic recalculerait le stock de tout
 * l'espace des centaines de fois par match (LogisticsService.reset).
 */
@Injectable()
export class InventoryLogisticSyncCronService {
  private readonly logger = new Logger(InventoryLogisticSyncCronService.name);
  private running = false;

  constructor(
    private readonly flow: PreEventInventoryFlowService,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      // Marqueurs de tous les tenants : transverse, chaque envoi porte son tenantId.
      const pushed = await this.tenantContext.runWithoutTenantScope(() => this.flow.flushLogisticDirty());
      if (pushed) this.logger.log(`Comptages envoyés vers Logistic : ${pushed} match(s)`);
    } catch (error) {
      this.logger.warn(`Envoi des comptages vers Logistic en échec : ${(error as Error)?.message}`);
    } finally {
      this.running = false;
    }
  }
}
