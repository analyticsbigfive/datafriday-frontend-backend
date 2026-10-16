import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { SaleLinePricingService } from './sale-line-pricing.service';

/** Résolution des lignes de vente (prix, promo, TVA) partagée par la caisse POS. Ne dépend que de PrismaModule (global) et PricingModule. */
@Module({
  imports: [PricingModule],
  providers: [SaleLinePricingService],
  exports: [SaleLinePricingService],
})
export class SaleLinePricingModule {}
