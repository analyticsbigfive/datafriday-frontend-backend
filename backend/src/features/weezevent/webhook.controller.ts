import { Controller, Post, Body, Param, Headers, HttpCode, HttpStatus, Req, RawBodyRequest } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { Public } from '../../core/auth/decorators/public.decorator';
import { WeezeventWebhookPayloadDto } from './dto/webhook-payload.dto';
import { WeezeventWebhookIngestService } from './services/weezevent-webhook-ingest.service';

// Endpoint appelé par Weezevent (sans JWT Supabase) : l'authentification se fait par
// signature HMAC du corps brut, pas par le guard JWT global.
@ApiTags('Weezevent Webhooks')
@Controller('webhooks/weezevent')
@Public()
export class WebhookController {

    constructor(
        private readonly webhookIngest: WeezeventWebhookIngestService,
    ) { }

    @Post(':tenantId/:integrationId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Recevoir un webhook Weezevent (WeezPay)' })
    @ApiParam({ name: 'tenantId', description: 'ID du tenant destinataire du webhook' })
    @ApiParam({ name: 'integrationId', description: 'ID de l\'intégration Weezevent' })
    @ApiBody({ type: WeezeventWebhookPayloadDto })
    @ApiResponse({ status: 200, description: 'Webhook reçu et enregistré pour traitement' })
    async receiveWebhook(
        @Param('tenantId') tenantId: string,
        @Param('integrationId') integrationId: string,
        @Headers() headers: Record<string, string | string[] | undefined>,
        // Webhook : signature vérifiée sur le corps brut, payload fournisseur libre.
        // eslint-disable-next-line no-restricted-syntax
        @Body() body: unknown,
        @Req() req: RawBodyRequest<FastifyRequest>,
    ): Promise<{ received: boolean; eventId: string }> {
        return this.webhookIngest.receiveWebhook(tenantId, integrationId, headers, body, req);
    }

}
