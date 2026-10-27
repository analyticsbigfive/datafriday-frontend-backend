import { Module } from '@nestjs/common';
import { MarketPricesController } from './market-prices.controller';
import { MarketPriceTaxonomyService } from './market-price-taxonomy.service';
import {
  MarketPriceTypesController,
  MarketPriceCategoriesController,
} from './market-price-taxonomy.controller';
import { PrismaModule } from '../../core/database/prisma.module';
import { MarketPriceQueryService } from './services/market-price-query.service';
import { MarketPriceRecipeSyncService } from './services/market-price-recipe-sync.service';
import { MarketPriceCostPropagationService } from './services/market-price-cost-propagation.service';
import { MarketPriceRecipeUsageService } from './services/market-price-recipe-usage.service';
import { MenuComponentsModule } from '../menu-components/menu-components.module';
import { MenuItemsModule } from '../menu-items/menu-items.module';
import { MarketPricesService } from './market-prices.service';

@Module({
  imports: [PrismaModule, MenuComponentsModule, MenuItemsModule],
  controllers: [
    MarketPricesController,
    MarketPriceTypesController,
    MarketPriceCategoriesController,
  ],
  providers: [ MarketPriceTaxonomyService,
    MarketPriceQueryService,
    MarketPriceRecipeSyncService,
    MarketPriceRecipeUsageService,
    MarketPriceCostPropagationService,
    MarketPricesService,
  ],
  exports: [ MarketPriceTaxonomyService,
    MarketPriceQueryService,
  ],
})
export class MarketPricesModule {}
