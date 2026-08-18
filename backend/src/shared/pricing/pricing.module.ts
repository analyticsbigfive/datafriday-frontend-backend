import { Module } from '@nestjs/common';
import { MenuItemPricingService } from './menu-item-pricing.service';
import { SalesPriceAggService } from './sales-price-agg.service';

/**
 * Module partagé exposant le calcul de prix menu item (catalogue + Data Integration).
 * Ne dépend que de PrismaModule (@Global) → aucun risque de dépendance circulaire.
 */
@Module({
  providers: [MenuItemPricingService, SalesPriceAggService],
  exports: [MenuItemPricingService, SalesPriceAggService],
})
export class PricingModule {}
