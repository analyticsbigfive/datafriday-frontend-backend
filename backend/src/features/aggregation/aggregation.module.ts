import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AggregationService } from './aggregation.service';
import { AggregationController } from './aggregation.controller';
import { AggregationProcessor } from './aggregation.processor';
import { EventWindowResolverService } from './event-window-resolver.service';
import { EventRollupService } from './event-rollup.service';
import { LiveMinuteAggregationService } from './live-minute-aggregation.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { QUEUES } from '../../core/queue/queue.constants';
import { MappingsModule } from '../mappings/mappings.module';

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
    AggregationService,
    AggregationProcessor,
    EventWindowResolverService,
    EventRollupService,
    LiveMinuteAggregationService,
  ],
  exports: [AggregationService],
})
export class AggregationModule {}
