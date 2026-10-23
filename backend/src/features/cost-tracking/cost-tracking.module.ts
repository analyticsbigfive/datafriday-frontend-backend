import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/database/prisma.module';
import { RedisModule } from '../../core/redis/redis.module';
import { SpacesModule } from '../spaces/spaces.module';
import { CostTrackingController } from './cost-tracking.controller';
import { CostTrackingAsOfService } from './services/cost-tracking-as-of.service';
import { CostTrackingBrickReaderService } from './services/cost-tracking-brick-reader.service';
import { CostTrackingBrickScopeService } from './services/cost-tracking-brick-scope.service';
import { CostTrackingComponentGraphService } from './services/cost-tracking-component-graph.service';
import { CostTrackingCatalogService } from './services/cost-tracking-catalog.service';
import { CostTrackingEventsService } from './services/cost-tracking-events.service';
import { CostTrackingHistoryService } from './services/cost-tracking-history.service';
import { CostTrackingRecipeReaderService } from './services/cost-tracking-recipe-reader.service';
import { CostTrackingRevenueService } from './services/cost-tracking-revenue.service';
import { CostTrackingSeriesService } from './services/cost-tracking-series.service';
import { CostTrackingSnapshotReaderService } from './services/cost-tracking-snapshot-reader.service';
import { CostTrackingSupplierShareService } from './services/cost-tracking-supplier-share.service';

@Module({
  imports: [PrismaModule, RedisModule, SpacesModule],
  controllers: [CostTrackingController],
  providers: [
    CostTrackingSnapshotReaderService,
    CostTrackingBrickReaderService,
    CostTrackingRecipeReaderService,
    CostTrackingBrickScopeService,
    CostTrackingComponentGraphService,
    CostTrackingSupplierShareService,
    CostTrackingCatalogService,
    CostTrackingEventsService,
    CostTrackingRevenueService,
    CostTrackingSeriesService,
    CostTrackingHistoryService,
    CostTrackingAsOfService,
  ],
  // costsAsOf sert au lot 4 (coûts à la date de l'event dans les rapports d'Analyse).
  exports: [CostTrackingAsOfService],
})
export class CostTrackingModule {}
