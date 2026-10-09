import { Module } from '@nestjs/common';
import { InventoryController, InventoryCountsController } from './inventory.controller';
import { PostEventDraftService } from './post-event-draft.service';
import { PreEventInventoryFlowService } from './pre-event-inventory-flow.service';
import { LogisticsModule } from '../logistics/logistics.module';
import { InventoryBaselineService } from './services/inventory-baseline.service';
import { InventoryCountService } from './services/inventory-count.service';
import { InventoryLogisticPushService } from './services/inventory-logistic-push.service';
import { InventoryReconciliationService } from './services/inventory-reconciliation.service';
import { InventoryUnitResolverService } from './services/inventory-unit-resolver.service';

@Module({
  imports: [LogisticsModule],
  controllers: [InventoryController, InventoryCountsController],
  providers: [
    PreEventInventoryFlowService,
    InventoryUnitResolverService,
    InventoryCountService,
    InventoryBaselineService,
    InventoryLogisticPushService,
    InventoryReconciliationService,
    PostEventDraftService,
  ],
  exports: [PreEventInventoryFlowService, InventoryCountService, InventoryLogisticPushService, PostEventDraftService],
})
export class InventoryModule {}
