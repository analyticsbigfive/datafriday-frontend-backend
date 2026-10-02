import { Controller, Post, Body, Param, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../core/auth/decorators/public.decorator';
import { DigifoodWebhookIngestService } from './services/digifood-webhook-ingest.service';

// Endpoint appelé par Digifood (sans JWT) : authentification par SIGNATURE HMAC
// (header digifood-wh-signature, HMAC-SHA256 sur le JSON trié récursivement).
// @Public() désactive JwtDatabaseGuard/TenantGuard ; le scoping Prisma CLS est
// inactif hors requête authentifiée → toutes les écritures portent tenantId explicite.
//
// Le body est reçu en objet brut (PAS de DTO classe) : le ValidationPipe global
// (whitelist + forbidNonWhitelisted) rejetterait les champs que Digifood ajoute au
// fil des versions, et la signature doit couvrir le body COMPLET non filtré (§5.7).
// L'enveloppe est validée manuellement ci-dessous.
@ApiTags('Digifood Webhooks')
@Controller('webhooks/digifood')
@Public()
export class DigifoodWebhookController {

    constructor(
        private readonly webhookIngest: DigifoodWebhookIngestService,
    ) { }

    /**
     * POST /webhooks/digifood/:tenantId/:integrationId
     * Réception order.completed / order.refunded. Ack < 1 s (traitement async),
     * dédup sur payload.id (retries Digifood pendant 24 h).
     */
    @Post(':tenantId/:integrationId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Recevoir un webhook Digifood (order.completed / order.refunded)' })
    @ApiParam({ name: 'tenantId', description: 'ID du tenant destinataire' })
    @ApiParam({ name: 'integrationId', description: "ID de l'intégration Digifood" })
    @ApiResponse({ status: 200, description: 'Webhook reçu (duplicate=true si retry déjà traité)' })
    @ApiResponse({ status: 401, description: 'Signature absente/invalide ou intégration désactivée' })
    async receiveWebhook(
        @Param('tenantId') tenantId: string,
        @Param('integrationId') integrationId: string,
        @Headers('digifood-wh-signature') signatureHeader: string | undefined,
        @Headers('digifood-wh-key-version') keyVersionHeader: string | undefined,
        // Webhook : signature vérifiée sur le corps brut, payload fournisseur libre.
        // eslint-disable-next-line no-restricted-syntax
        @Body() body: Record<string, unknown>,
    ): Promise<{ received: boolean; eventId?: string; duplicate?: boolean }> {
        return this.webhookIngest.receiveWebhook(tenantId, integrationId, signatureHeader, keyVersionHeader, body);
    }

}
