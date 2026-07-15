import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { WeezeventIntegrationService } from './services/weezevent-integration.service';
import { DigifoodIntegrationService } from './services/digifood-integration.service';
import { WebhookIntegrationService } from './services/webhook-integration.service';
import { EncryptionModule } from '../../core/encryption/encryption.module';
import { WeezeventModule } from '../weezevent/weezevent.module';
import { DigifoodModule } from '../digifood/digifood.module';

@Module({
  imports: [EncryptionModule, WeezeventModule, DigifoodModule],
  controllers: [IntegrationsController],
  providers: [
    IntegrationsService,
    WeezeventIntegrationService,
    DigifoodIntegrationService,
    WebhookIntegrationService,
  ],
  exports: [WeezeventIntegrationService, DigifoodIntegrationService, WebhookIntegrationService],
})
export class IntegrationsModule { }
