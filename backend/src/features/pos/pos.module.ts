import { Module } from '@nestjs/common';
import { PricingModule } from '../../shared/pricing/pricing.module';
import { SaleLinePricingModule } from '../../shared/sales/sale-line-pricing.module';
import { EventSalesSourcesModule } from '../event-sales-sources/event-sales-sources.module';
import { PaymentMethodsModule } from '../payment-methods/payment-methods.module';
import { PosAvailabilityModule } from './availability/pos-availability.module';
import { PosCatalogService } from './guest/pos-catalog.service';
import { PosGuestController } from './guest/pos-guest.controller';
import { PosLiveTriggerService } from './sales/pos-live-trigger.service';
import { PosSaleCancelService } from './sales/pos-sale-cancel.service';
import { PosSaleContextService } from './sales/pos-sale-context.service';
import { PosSaleService } from './sales/pos-sale.service';
import { PosSalesQueryService } from './sales/pos-sales-query.service';
import { PosSourceService } from './services/pos-source.service';

/**
 * Caisse POS : référentiels de ventes (L1), écriture des ventes, annulation, historique et clôture (L3),
 * endpoints invité. PrismaService, QueueService et RedisService viennent de modules globaux.
 * Exporte PosSourceService (démarrage des caisses) et PosSalesQueryService (historique et export staff).
 */
@Module({
    imports: [PricingModule, SaleLinePricingModule, EventSalesSourcesModule, PaymentMethodsModule, PosAvailabilityModule],
    controllers: [PosGuestController],
    providers: [
        PosSourceService,
        PosSaleContextService,
        PosSaleService,
        PosSaleCancelService,
        PosSalesQueryService,
        PosLiveTriggerService,
        PosCatalogService,
    ],
    exports: [PosSourceService, PosSalesQueryService],
})
export class PosModule {}
