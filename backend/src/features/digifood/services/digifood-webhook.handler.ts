import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { DigifoodIngestionService } from './digifood-ingestion.service';
import { normalizeOrder } from './digifood-order-normalizer';

/**
 * Traitement asynchrone d'un webhook Digifood journalisé (PLAN §4.5/§4.6).
 * Contrairement à Weezevent (webhook = déclencheur d'un re-fetch API), le payload
 * Digifood EST la source unique de données → normalisation puis ingestion directe.
 * Un échec marque le journal en erreur (retryCount++) sans jamais renvoyer d'erreur
 * HTTP à Digifood : le replay se fait depuis le journal, pas via leurs retries.
 */
@Injectable()
export class DigifoodWebhookHandler {
    private readonly logger = new Logger(DigifoodWebhookHandler.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly ingestion: DigifoodIngestionService,
    ) { }

    async processEvent(webhookEventId: string): Promise<void> {
        const event = await this.prisma.integrationWebhookEvent.findUnique({
            where: { id: webhookEventId },
        });
        if (!event) {
            this.logger.error(`Webhook Digifood ${webhookEventId} introuvable dans le journal`);
            return;
        }
        if (event.processed) {
            this.logger.warn(`Webhook Digifood ${webhookEventId} déjà traité — ignoré`);
            return;
        }

        try {
            const payload = event.payload as Record<string, unknown>;
            const order = normalizeOrder(payload);

            // §5.6 — détection de version POS, purement informative
            await this.updatePosVersion(event.integrationId, order.softwareVersion);

            await this.ingestion.ingestOrder(event.tenantId, event.integrationId, order, 'webhook');

            await this.prisma.integrationWebhookEvent.update({
                where: { id: event.id },
                data: { processed: true, processedAt: new Date(), error: null },
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Échec de traitement du webhook Digifood ${event.id} : ${message}`);
            await this.prisma.integrationWebhookEvent.update({
                where: { id: event.id },
                data: { error: message, retryCount: { increment: 1 } },
            });
        }
    }

    /** software.version majeure ≥ 26 → "26", sinon "24" (affichage config + support). */
    private async updatePosVersion(integrationId: string, softwareVersion: string | null): Promise<void> {
        if (!softwareVersion) return;
        const major = parseInt(softwareVersion.split('.')[0] ?? '', 10);
        if (!Number.isFinite(major)) return;
        const posVersion = major >= 26 ? '26' : '24';
        await this.prisma.digifoodIntegrationConfig
            .updateMany({ where: { integrationId }, data: { posVersion } })
            .catch(() => undefined); // informatif : ne doit jamais faire échouer l'ingestion
    }
}
