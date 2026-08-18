import { Module } from '@nestjs/common';
import { DigifoodWebhookController } from './digifood-webhook.controller';
import { DigifoodController } from './digifood.controller';
import { DigifoodSignatureService } from './services/digifood-signature.service';
import { DigifoodWebhookHandler } from './services/digifood-webhook.handler';
import { DigifoodIngestionService } from './services/digifood-ingestion.service';
import { DigifoodCsvImportService } from './services/digifood-csv-import.service';
import { PricingModule } from '../../shared/pricing/pricing.module';

/**
 * Intégration Digifood (PLAN_INTEGRATION_DIGIFOOD §4) : webhooks temps réel
 * order.completed / order.refunded → source commune Sales*.
 * ⚠️ Module enregistré dans app.module.ts — gotcha KvModule : un module non
 * enregistré = routes mortes silencieuses.
 */
// PrismaModule et EncryptionModule sont @Global() : pas d'imports nécessaires.
// PricingModule : DigifoodIngestionService appelle SalesPriceAggService (BUG-337-02, docs/bugs/).
@Module({
    imports: [PricingModule],
    controllers: [DigifoodWebhookController, DigifoodController],
    providers: [
        DigifoodSignatureService,
        DigifoodWebhookHandler,
        DigifoodIngestionService,
        DigifoodCsvImportService,
    ],
    exports: [DigifoodIngestionService, DigifoodSignatureService, DigifoodCsvImportService],
})
export class DigifoodModule { }
