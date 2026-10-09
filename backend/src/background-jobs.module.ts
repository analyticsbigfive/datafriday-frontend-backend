import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WeezeventJobsModule } from './features/weezevent/jobs/weezevent-jobs.module';
import { AggregationJobsModule } from './features/aggregation/jobs/aggregation-jobs.module';
import { LogisticsJobsModule } from './features/logistics/jobs/logistics-jobs.module';
import { InventoryJobsModule } from './features/inventory/jobs/inventory-jobs.module';
import { GuestPinAccessJobsModule } from './features/guest-pin-access/jobs/guest-pin-access-jobs.module';

/**
 * Tout le travail de fond : consommateurs BullMQ et crons. Un seul process doit
 * l'importer : le worker (worker.module.ts), ou l'API en repli si aucun worker n'est
 * déployé (BACKGROUND_JOBS_IN_API=true). Jamais les deux à la fois : chaque cron
 * tournerait deux fois et les files auraient deux consommateurs.
 */
@Module({
  imports: [
    ScheduleModule.forRoot(),
    WeezeventJobsModule,
    AggregationJobsModule,
    LogisticsJobsModule,
    InventoryJobsModule,
    GuestPinAccessJobsModule,
  ],
})
export class BackgroundJobsModule {}
