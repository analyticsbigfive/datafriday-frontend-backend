import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../core/database/prisma.module';
import { LogisticsModule } from '../../logistics/logistics.module';
import { PosAvailabilityService } from './pos-availability.service';
import { PosRecipeRequirementsService } from './pos-recipe-requirements.service';
import { PosStockSnapshotService } from './pos-stock-snapshot.service';

/** RecipeExplosionService et StockLevelService viennent de LogisticsModule (instance partagée). */
@Module({
  imports: [PrismaModule, LogisticsModule],
  providers: [PosAvailabilityService, PosRecipeRequirementsService, PosStockSnapshotService],
  exports: [PosAvailabilityService],
})
export class PosAvailabilityModule {}
