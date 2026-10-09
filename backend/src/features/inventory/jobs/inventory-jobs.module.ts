import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory.module';
import { InventoryLiveInitCronService } from './inventory-live-init.cron';
import { InventoryLogisticSyncCronService } from './inventory-logistic-sync.cron';

/** Crons « portes ouvertes » et envoi des comptages vers Logistic. Chargés par BackgroundJobsModule uniquement. */
@Module({
  imports: [InventoryModule],
  providers: [InventoryLiveInitCronService, InventoryLogisticSyncCronService],
})
export class InventoryJobsModule {}
