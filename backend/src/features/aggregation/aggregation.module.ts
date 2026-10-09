import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AggregationController } from './aggregation.controller';
import { EventWindowResolverService } from './event-window-resolver.service';
import { EventRollupService } from './event-rollup.service';
import { LiveMinuteAggregationService } from './live-minute-aggregation.service';
import { IntegrationTransactionStatsService } from './integration-transaction-stats.service';
import { BasketAggregationService } from './basket-aggregation.service';
import { SpaceIntegrationScopeService } from './space-integration-scope.service';
import { SyncStaleRowsService } from './sync-stale-rows.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { QUEUES } from '../../core/queue/queue.constants';
import { MappingsModule } from '../mappings/mappings.module';
import { AggregationService } from './aggregation.service';
import { AggregationStatusService } from './aggregation-status.service';
import { EventAggregateReadService } from './event-aggregate-read.service';

@Module({
  imports: [
    PrismaModule,
    MappingsModule,
    // La connexion Redis est configurée globalement par QueueModule (BullModule.forRootAsync).
    // On n'enregistre ici que la queue dont ce module a besoin.
    BullModule.registerQueue({ name: QUEUES.AGGREGATION }),
  ],
  controllers: [AggregationController],
  providers: [
    EventWindowResolverService,
    EventRollupService,
    LiveMinuteAggregationService,
    IntegrationTransactionStatsService,
    BasketAggregationService,
    SpaceIntegrationScopeService,
    SyncStaleRowsService,
    AggregationStatusService,
    EventAggregateReadService,
    AggregationService,
  ],
  exports: [AggregationService, LiveMinuteAggregationService],
})
export class AggregationModule {}
