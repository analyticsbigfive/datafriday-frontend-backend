import { Module } from '@nestjs/common';
import { LogisticsModule } from '../logistics.module';
import { SimulationRunProcessor } from './simulation-run.processor';

/** Consommateur des runs d'auto-simulation. Chargé par BackgroundJobsModule uniquement. */
@Module({
  imports: [LogisticsModule],
  providers: [SimulationRunProcessor],
})
export class LogisticsJobsModule {}
