import {
    Controller,
    Post,
    Body,
    Param,
    Headers,
    HttpCode,
    HttpStatus,
    Logger,
    BadRequestException,
    UnauthorizedException,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../core/database/prisma.service';
import { Public } from '../../core/auth/decorators/public.decorator';
import { EncryptionService } from '../../core/encryption/encryption.service';
import { WebhookSignatureService } from './services/webhook-signature.service';
import { WebhookEventHandler } from './services/webhook-event.handler';
import { WeezeventWebhookPayloadDto } from './dto/webhook-payload.dto';

// Endpoint appelé par Weezevent (sans JWT Supabase) : l'authentification se fait
// par SIGNATURE HMAC (header x-weezevent-signature), pas par le guard JWT global.
// `@Public()` désactive JwtDatabaseGuard/TenantGuard ; le scoping Prisma est de toute
// façon neutralisé hors contexte tenant (cf. PrismaService).
@ApiTags('Weezevent Webhooks')
@Controller('webhooks/weezevent')
@Public()
export class WebhookController {
    private readonly logger = new Logger(WebhookController.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly signatureService: WebhookSignatureService,
        private readonly eventHandler: WebhookEventHandler,
        private readonly encryption: EncryptionService,
    ) { }

    /**
     * Receive webhook from Weezevent
     * POST /webhooks/weezevent/:tenantId
     */
    @Post(':tenantId/:integrationId')
    @HttpCode(HttpStatus.OK)
    @ApiOperation({ summary: 'Recevoir un webhook Weezevent' })
    @ApiParam({ name: 'tenantId', description: 'ID du tenant destinataire du webhook' })
    @ApiParam({ name: 'integrationId', description: 'ID de l\'intégration Weezevent' })
    @ApiBody({ type: WeezeventWebhookPayloadDto })
    @ApiResponse({ status: 200, description: 'Webhook reçu et enregistré pour traitement' })
    async receiveWebhook(
        @Param('tenantId') tenantId: string,
        @Param('integrationId') integrationId: string,
        @Headers('x-weezevent-signature') signature: string,
        @Body() payload: WeezeventWebhookPayloadDto,
    ): Promise<{ received: boolean; eventId: string }> {
        this.logger.log(
            `Received webhook for tenant ${tenantId}: ${payload.type} - ${payload.method}`,
        );

        try {
            const integration = await this.prisma.integration.findUnique({
                where: { id: integrationId },
                select: {
                    id: true,
                    tenantId: true,
                    weezevent: { select: { webhookEnabled: true, webhookSecret: true } },
                },
            });

            if (!integration || integration.tenantId !== tenantId) {
                throw new BadRequestException('Integration not found');
            }

            // 1. Get tenant configuration — sert de repli BUG-106 tant qu'aucun secret
            //    par-intégration n'est configuré (rétrocompatible, zéro action requise).
            const tenant = await this.prisma.tenant.findUnique({
                where: { id: tenantId },
            });

            if (!tenant) {
                throw new BadRequestException('Tenant not found');
            }

            // BUG-106 : secret par intégration (WeezeventIntegrationConfig.webhookSecret)
            // prioritaire s'il est explicitement configuré ; sinon repli intégral sur
            // Tenant.weezeventWebhookSecret/weezeventWebhookEnabled (comportement historique,
            // seule option avant que cette capacité de configuration par-intégration existe).
            const perIntegrationConfigured =
                integration.weezevent?.webhookEnabled === true && !!integration.weezevent?.webhookSecret;

            const webhookEnabled = perIntegrationConfigured ? true : tenant.weezeventWebhookEnabled;
            if (!webhookEnabled) {
                throw new UnauthorizedException('Webhooks not enabled for this tenant');
            }

            // 2. Validate signature (OBLIGATOIRE — fail-closed). Sans secret configuré
            //    ou sans signature valide, on rejette : pas de webhook anonyme/spoofable.
            const webhookSecret = perIntegrationConfigured
                ? this.encryption.decrypt(integration.weezevent!.webhookSecret!)
                : tenant.weezeventWebhookSecret;

            if (!webhookSecret) {
                this.logger.warn(`Webhook secret not configured for tenant ${tenantId}`);
                throw new UnauthorizedException('Webhook secret not configured for this tenant');
            }

            if (!signature) {
                throw new UnauthorizedException('Signature header missing');
            }

            const isValid = this.signatureService.validateSignature(
                payload,
                signature,
                webhookSecret,
            );

            if (!isValid) {
                this.logger.warn(`Invalid signature for tenant ${tenantId}`);
                throw new UnauthorizedException('Invalid signature');
            }

            this.logger.log(
                `Signature validated for tenant ${tenantId}` +
                (perIntegrationConfigured ? ' (secret par intégration)' : ' (secret tenant, repli)'),
            );

            // 3. Dédup (BUG-026 corrigé) — Weezevent ne fournit pas d'UUID de livraison dans le
            // payload (contrairement à Digifood, cf. IntegrationWebhookEvent.externalDeliveryId).
            // La signature HMAC est déterministe sur le corps exact du payload (WebhookSignatureService
            // : HMAC-SHA256(secret, JSON.stringify(payload))) : un retry Weezevent renvoie le même
            // corps, donc la même signature — c'est une clé d'idempotence naturelle, déjà validée
            // ci-dessus, aucune donnée supplémentaire à extraire.
            const existing = await this.prisma.integrationWebhookEvent.findUnique({
                where: {
                    integrationId_externalDeliveryId: { integrationId, externalDeliveryId: signature },
                },
                select: { id: true, processed: true },
            });

            if (existing) {
                this.logger.log(`Webhook déjà reçu (dédupliqué via signature) — event existant ${existing.id}`);
                return { received: true, eventId: existing.id };
            }

            // 4. Store webhook event for audit and processing
            const webhookEvent = await this.prisma.integrationWebhookEvent.create({
                data: {
                    tenantId,
                    integrationId,
                    eventType: payload.type,
                    method: payload.method,
                    payload: payload as any,
                    signature,
                    externalDeliveryId: signature,
                    processed: false,
                },
            });

            this.logger.log(`Stored webhook event ${webhookEvent.id}`);

            // 5. Process event asynchronously (don't wait for completion)
            // This ensures we return 200 quickly to Weezevent
            this.processEventAsync(webhookEvent.id);

            // 6. Return success immediately
            return {
                received: true,
                eventId: webhookEvent.id,
            };
        } catch (error) {
            this.logger.error(
                `Failed to receive webhook for tenant ${tenantId}`,
                error.stack,
            );
            throw error;
        }
    }

    /**
     * Process event asynchronously without blocking the response
     */
    private processEventAsync(eventId: string): void {
        // Use setImmediate to process in next event loop iteration
        setImmediate(async () => {
            try {
                await this.eventHandler.processEvent(eventId);
            } catch (error) {
                this.logger.error(
                    `Async processing failed for event ${eventId}`,
                    error.stack,
                );
                // Error is already logged in the database by the handler
            }
        });
    }
}
