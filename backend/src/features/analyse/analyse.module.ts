import { Module } from '@nestjs/common';
import { AnalyseService } from './analyse.service';
import { AnalyseController } from './analyse.controller';
import { ArticleDimensionsService } from './article-dimensions.service';
import { StockCostResolverService } from './stock-cost-resolver.service';
import { StockValuationService } from './stock-valuation.service';
import { EventValuationService } from './event-valuation.service';
import { EventCostsService } from './event-costs.service';
import { CostTrackingModule } from '../cost-tracking/cost-tracking.module';
import { LogisticsModule } from '../logistics/logistics.module';
import { PrismaModule } from '../../core/database/prisma.module';

@Module({
  imports: [PrismaModule, LogisticsModule, CostTrackingModule],
  controllers: [AnalyseController],
  providers: [AnalyseService, ArticleDimensionsService, StockCostResolverService, StockValuationService, EventValuationService, EventCostsService],
  exports: [AnalyseService],
})
export class AnalyseModule {}
