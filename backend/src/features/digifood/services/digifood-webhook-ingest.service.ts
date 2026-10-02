import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { EncryptionService } from '../../../core/encryption/encryption.service';
import { DigifoodSignatureService } from './digifood-signature.service';
import { DigifoodWebhookHandler } from './digifood-webhook.handler';

/**
 * Réception d'un webhook Digifood : contrôle de l'intégration et de la signature, rotation de clé, déduplication, journalisation puis traitement asynchrone.
 */
@Injectable()
export class DigifoodWebhookIngestService {
    private readonly logger = new Logger(DigifoodWebhookIngestService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly encryption: EncryptionService,
        private readonly signature: DigifoodSignatureService,
        private readonly handler: DigifoodWebhookHandler,
    ) { }

    /**
     * POST /webhooks/digifood/:tenantId/:integrationId
     * Réception order.completed / order.refunded. Ack < 1 s (traitement async),
     * dédup sur payload.id (retries Digifood pendant 24 h).
     */
    async receiveWebhook(tenantId: string, integrationId: string, signatureHeader: string | undefined, keyVersionHeader: string | undefined, body: Record<string, unknown>): Promise<{ received: boolean; eventId?: string; duplicate?: boolean }> {
        // 1. Intégration : existe, appartient au tenant, provider DIGIFOOD, active, configurée
        const integration = await this.prisma.integration.findUnique({
            where: { id: integrationId },
            include: { digifood: true },
        });
        if (!integration || integration.tenantId !== tenantId || integration.provider !== 'DIGIFOOD') {
            throw new BadRequestException('Integration not found');
        }
        if (!integration.enabled) {
            throw new UnauthorizedException('Integration disabled');
        }

        // 2. Signature — FAIL-CLOSED : pas de secret, pas de header, pas de match → 401.
        //    (401 = Digifood retentera : voulu, une signature invalide est une anomalie
        //    de config à corriger, pas un payload à perdre.)
        if (!integration.digifood?.webhookSecret) {
            this.logger.warn(`Webhook Digifood sans secret configuré (integration ${integrationId})`);
            throw new UnauthorizedException('Webhook secret not configured');
        }
        if (!signatureHeader) {
            throw new UnauthorizedException('Signature header missing');
        }
        const secret = this.encryption.decrypt(integration.digifood.webhookSecret);
        if (!this.signature.validateSignature(body, signatureHeader, secret)) {
            this.logger.warn(`Signature Digifood invalide (integration ${integrationId})`);
            throw new UnauthorizedException('Invalid signature');
        }

        // 3. Rotation de clé : mémorise la dernière key-version vue, log warn si elle change
        if (keyVersionHeader && keyVersionHeader !== integration.digifood.keyVersion) {
            this.logger.warn(
                `Rotation de clé Digifood détectée (integration ${integrationId}) : ${integration.digifood.keyVersion ?? '∅'} → ${keyVersionHeader}`,
            );
            await this.prisma.digifoodIntegrationConfig
                .update({ where: { integrationId }, data: { keyVersion: keyVersionHeader } })
                .catch(() => undefined);
        }

        // 4. Enveloppe minimale (§5.7 : validation souple, champs inconnus tolérés)
        const event = typeof body.event === 'string' ? body.event : null;
        const deliveryId = body.id != null ? String(body.id) : null;
        const data = body.data as Record<string, unknown> | undefined;
        if (!event || !['order.completed', 'order.refunded'].includes(event)) {
            throw new BadRequestException(`Unsupported event: ${event ?? '∅'}`);
        }
        if (!deliveryId || !data || typeof data !== 'object' || data.id == null) {
            throw new BadRequestException('Invalid payload envelope (id / data.id required)');
        }

        // 5. Dédup sur l'UUID de livraison (stable entre retries 24 h) — §2.4
        const existing = await this.prisma.integrationWebhookEvent.findUnique({
            where: {
                integrationId_externalDeliveryId: { integrationId, externalDeliveryId: deliveryId },
            },
            select: { id: true, processed: true },
        });
        if (existing) {
            if (existing.processed) {
                this.logger.log(`Retry Digifood ${deliveryId} déjà traité — ack immédiat`);
                return { received: true, eventId: existing.id, duplicate: true };
            }
            // Journalisé mais pas (encore) traité : retente le traitement async
            this.processEventAsync(existing.id);
            return { received: true, eventId: existing.id, duplicate: true };
        }

        // 6. Journalisation puis ack rapide, traitement asynchrone (patron Weezevent)
        const webhookEvent = await this.prisma.integrationWebhookEvent.create({
            data: {
                tenantId,
                integrationId,
                provider: 'DIGIFOOD',
                eventType: event,
                method: this.normalizedMethod(event, data),
                payload: body as any,
                signature: signatureHeader,
                externalDeliveryId: deliveryId,
                processed: false,
            },
        });

        this.processEventAsync(webhookEvent.id);
        return { received: true, eventId: webhookEvent.id };
    }

    /** method = data.type normalisé : sale | refund | order (§2.4) */
    private normalizedMethod(event: string, data: Record<string, unknown>): string {
        if (event === 'order.refunded') return 'refund';
        const type = String(data.type ?? 'sale');
        return ['sale', 'refund', 'order'].includes(type) ? type : 'sale';
    }

    /** Erreurs de traitement ≠ erreurs de réception : l'async n'affecte jamais le 200. */
    private processEventAsync(eventId: string): void {
        setImmediate(async () => {
            try {
                await this.handler.processEvent(eventId);
            } catch (error) {
                this.logger.error(
                    `Traitement async du webhook Digifood ${eventId} échoué`,
                    error instanceof Error ? error.stack : String(error),
                );
            }
        });
    }
}
