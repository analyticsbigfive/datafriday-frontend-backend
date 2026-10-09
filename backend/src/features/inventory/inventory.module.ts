import { Module } from '@nestjs/common';
import { InventoryController, InventoryCountsController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { PostEventDraftService } from './post-event-draft.service';
import { PreEventInventoryFlowService } from './pre-event-inventory-flow.service';
import { LogisticsModule } from '../logistics/logistics.module';

@Module({
  imports: [LogisticsModule],
  controllers: [InventoryController, InventoryCountsController],
  providers: [InventoryService, PreEventInventoryFlowService, PostEventDraftService],
  exports: [InventoryService, PreEventInventoryFlowService, PostEventDraftService],
})
export class InventoryModule {}
