import { Module } from '@nestjs/common';
import { InventoryController, InventoryCountsController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryLiveInitCronService } from './inventory-live-init.cron';
import { LogisticsModule } from '../logistics/logistics.module';

@Module({
  imports: [LogisticsModule],
  controllers: [InventoryController, InventoryCountsController],
  providers: [InventoryService, InventoryLiveInitCronService],
  exports: [InventoryService],
})
export class InventoryModule {}
