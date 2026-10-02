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
import { MarketPricesService } from './market-prices.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    MarketPricesController,
    MarketPriceTypesController,
    MarketPriceCategoriesController,
  ],
  providers: [ MarketPriceTaxonomyService,
    MarketPriceQueryService,
    MarketPriceRecipeSyncService,
    MarketPricesService,
  ],
  exports: [ MarketPriceTaxonomyService,
    MarketPriceQueryService,
  ],
})
export class MarketPricesModule {}
