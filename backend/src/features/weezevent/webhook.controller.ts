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
    Req,
    RawBodyRequest,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import * as crypto from 'crypto';
import { PrismaService } from '../../core/database/prisma.service';
import { Public } from '../../core/auth/decorators/public.decorator';
import { EncryptionService } from '../../core/encryption/encryption.service';
import { WebhookSignatureService } from './services/webhook-signature.service';
import { WebhookEventHandler } from './services/webhook-event.handler';
import { WeezeventWebhookPayloadDto } from './dto/webhook-payload.dto';
import { parseWeezeventWebhookPayload } from './webhook-payload.parser';

/** Headers de signature acceptés tant que Weezevent n'a pas confirmé le sien (fiche 379-02). */
const SIGNATURE_HEADERS = ['x-weezevent-signature', 'x-signature', 'x-hub-signature-256', 'signature'];

// Endpoint appelé par Weezevent (sans JWT Supabase) : l'authentification se fait par
// signature HMAC du corps brut, pas par le guard JWT global.
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
        @Body() body: unknown,
        @Req() req: RawBodyRequest<FastifyRequest>,
    ): Promise<{ received: boolean; eventId: string }> {
        // BUG-379-02 : pas de DTO class-validator ici, le ValidationPipe global
        // (forbidNonWhitelisted) rejetait le vrai format WeezPay. Parsing tolérant dédié.
        const payload = parseWeezeventWebhookPayload(body);
        const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}));
        this.logger.log(`Received webhook for tenant ${tenantId}: ${payload.type} - ${payload.method} (id ${payload.objectId ?? '?'})`);

        try {
            const integration = await this.prisma.integration.findUnique({
                where: { id: integrationId },
                select: {
                    id: true,
                    tenantId: true,
                    weezevent: { select: { webhookEnabled: true, webhookSecret: true, organizationId: true } },
                },
            });
            if (!integration || integration.tenantId !== tenantId) {
                throw new BadRequestException('Integration not found');
            }
            const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
            if (!tenant) {
                throw new BadRequestException('Tenant not found');
            }

            // BUG-106 : secret par intégration prioritaire, repli sur le secret tenant.
            const perIntegrationConfigured =
                integration.weezevent?.webhookEnabled === true && !!integration.weezevent?.webhookSecret;
            const webhookEnabled = perIntegrationConfigured ? true : tenant.weezeventWebhookEnabled;
            if (!webhookEnabled) {
                throw new UnauthorizedException('Webhooks not enabled for this integration');
            }
            const webhookSecret = perIntegrationConfigured
                ? this.encryption.decrypt(integration.weezevent!.webhookSecret!)
                : tenant.weezeventWebhookSecret;
            if (!webhookSecret) {
                throw new UnauthorizedException('Webhook secret not configured for this integration');
            }

            const signature = this.readSignature(headers);
            if (!signature) {
                throw new UnauthorizedException('Signature header missing');
            }
            if (!this.signatureService.validateSignature(rawBody, signature, webhookSecret)) {
                this.logger.warn(`Invalid webhook signature for integration ${integrationId}`);
                throw new UnauthorizedException('Invalid signature');
            }

            // Défense en profondeur : un webhook d'une autre organisation Weezevent posté sur
            // notre URL est rejeté même correctement signé.
            const expectedOrg = integration.weezevent?.organizationId;
            if (payload.organizationId && expectedOrg && payload.organizationId !== String(expectedOrg)) {
                throw new UnauthorizedException('Webhook organization does not match this integration');
            }

            // Dédup : Weezevent ne fournit pas d'id de livraison (contrairement à Digifood). Le
            // hash du corps brut est une clé d'idempotence naturelle : un rejeu renvoie le même corps.
            const deliveryId = crypto.createHash('sha256').update(rawBody).digest('hex');
            const existing = await this.prisma.integrationWebhookEvent.findUnique({
                where: { integrationId_externalDeliveryId: { integrationId, externalDeliveryId: deliveryId } },
                select: { id: true },
            });
            if (existing) {
                this.logger.log(`Webhook already received (dedup) for event ${existing.id}`);
                return { received: true, eventId: existing.id };
            }

            const webhookEvent = await this.prisma.integrationWebhookEvent.create({
                data: {
                    tenantId,
                    integrationId,
                    eventType: payload.type,
                    method: payload.method,
                    payload: payload.raw as any,
                    signature,
                    externalDeliveryId: deliveryId,
                    processed: false,
                },
            });

            // Répondre 200 tout de suite : Weezevent ne rejoue pas un webhook en erreur.
            this.processEventAsync(webhookEvent.id);
            return { received: true, eventId: webhookEvent.id };
        } catch (error) {
            this.logger.error(`Failed to receive webhook for tenant ${tenantId}`, (error as Error).stack);
            throw error;
        }
    }

    private readSignature(headers: Record<string, string | string[] | undefined>): string | null {
        for (const name of SIGNATURE_HEADERS) {
            const value = headers[name];
            const first = Array.isArray(value) ? value[0] : value;
            if (first) return first;
        }
        return null;
    }

    private processEventAsync(eventId: string): void {
        setImmediate(async () => {
            try {
                await this.eventHandler.processEvent(eventId);
            } catch (error) {
                this.logger.error(`Async processing failed for event ${eventId}`, (error as Error).stack);
            }
        });
    }
}
