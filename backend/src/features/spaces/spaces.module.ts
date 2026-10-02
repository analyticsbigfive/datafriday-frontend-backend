import { Module } from '@nestjs/common';
import { SpacesController, } from './spaces.controller';
import { PinnedSpacesController } from './pinned-spaces.controller';
import { DashboardController } from './dashboard.controller';
import { SpaceCacheService } from './services/space-cache.service';
import { SpaceZoneElementsService } from './services/space-zone-elements.service';
import { SpaceCrudService } from './services/space-crud.service';
import { SpaceAccessGrantService } from './services/space-access-grant.service';
import { SpaceElementService } from './services/space-element.service';
import { SpaceElementLayoutService } from './services/space-element-layout.service';
import { SpaceElementPlacementService } from './services/space-element-placement.service';
import { SpaceSalesScopeService } from './services/space-sales-scope.service';
import { SpaceAnalyseBatchService } from './services/space-analyse-batch.service';
import { SpaceShopsService } from './services/space-shops.service';
import { SpaceEventTimelineService } from './services/space-event-timeline.service';
import { SpaceWeezeventEventService } from './services/space-weezevent-event.service';
import { SpaceAggregationService } from './services/space-aggregation.service';
import { SpaceRevenueSummaryService } from './services/space-revenue-summary.service';
import { PrismaModule } from '../../core/database/prisma.module';
import { RedisModule } from '../../core/redis/redis.module';
import { WeezeventModule } from '../weezevent/weezevent.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { SpaceAnalyticsController } from './space-analytics.controller';
import { SpaceShopsController } from './space-shops.controller';
import { SpaceIntegrationsController } from './space-integrations.controller';
import { SpaceAccessController } from './space-access.controller';
import { ConfigurationsController } from './configurations.controller';
import { SpaceConfigurationSaveService } from './services/space-configuration-save.service';
import { SpaceConfigurationService } from './services/space-configuration.service';
import { SpaceDashboardSectionsService } from './services/space-dashboard-sections.service';
import { SpaceDashboardService } from './services/space-dashboard.service';

@Module({
  imports: [PrismaModule, RedisModule, WeezeventModule, LogisticsModule],
  controllers: [
    SpacesController,
    ConfigurationsController,
    PinnedSpacesController,
    DashboardController,
    SpaceAnalyticsController,
    SpaceShopsController,
    SpaceIntegrationsController,
    SpaceAccessController,
  ],
  providers: [
    SpaceCacheService,
    SpaceZoneElementsService,
    SpaceCrudService,
    SpaceAccessGrantService,
    SpaceElementService,
    SpaceElementLayoutService,
    SpaceElementPlacementService,
    SpaceSalesScopeService,
    SpaceEventTimelineService,
    SpaceAnalyseBatchService,
    SpaceShopsService,
    SpaceWeezeventEventService,
    SpaceAggregationService,
    SpaceRevenueSummaryService,
    SpaceConfigurationSaveService,
    SpaceConfigurationService,
    SpaceDashboardSectionsService,
    SpaceDashboardService,
  ],
  exports: [
    // Utilisés hors du module : invalidation (builder-v2), suppression d'élément (mappings).
    SpaceCacheService,
    SpaceElementService,
    SpaceAggregationService,
    SpaceDashboardService,
    // Première vente par PdV : arrêt du pre-event (InventoryCycleCronService).
    SpaceShopsService,
  ],
})
export class SpacesModule {}
