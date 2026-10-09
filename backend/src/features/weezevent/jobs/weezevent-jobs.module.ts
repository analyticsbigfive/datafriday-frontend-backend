import { Module } from '@nestjs/common';
import { WeezeventModule } from '../weezevent.module';
import { DataSyncProcessor } from './data-sync.processor';
import { WeezeventCronService } from './weezevent-cron.service';
import { LiveSyncSchedulerService } from './live-sync-scheduler.service';
import { LiveReconciliationCronService } from './live-reconciliation-cron.service';

/** Jobs Weezevent (file data-sync, crons de synchro). Chargé par BackgroundJobsModule uniquement. */
@Module({
  imports: [WeezeventModule],
  providers: [DataSyncProcessor, WeezeventCronService, LiveSyncSchedulerService, LiveReconciliationCronService],
})
export class WeezeventJobsModule {}
