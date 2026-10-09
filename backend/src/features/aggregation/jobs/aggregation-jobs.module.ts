import { Module } from '@nestjs/common';
import { AggregationModule } from '../aggregation.module';
import { AggregationProcessor } from './aggregation.processor';

/** Consommateur de la file d'agrégation. Chargé par BackgroundJobsModule uniquement. */
@Module({
  imports: [AggregationModule],
  providers: [AggregationProcessor],
})
export class AggregationJobsModule {}
