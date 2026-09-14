import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../core/database/prisma.service';
import { WebhookHealthService } from '../../weezevent/services/live/webhook-health.service';
import { LiveHeartbeatService, LiveSyncState } from '../../weezevent/services/live/live-heartbeat.service';
import { WEBHOOK_HEALTHY_WINDOW_MS } from '../../../shared/constants/live-aggregation';

export interface WeezeventWebhookStatus {
    webhookUrl: string;
    enabled: boolean;
    configured: boolean;
    healthy: boolean;
    healthyWindowSec: number;
    lastWebhook: {
        id: string;
        eventType: string;
        method: string;
        createdAt: Date;
        processed: boolean;
        processedAt: Date | null;
        error: string | null;
    } | null;
    last24h: { received: number; failed: number };
    sync: LiveSyncState | null;
}

/**
 * BUG-379-02 : équivalent Weezevent du "test" Digifood. Sans cet écran, impossible de savoir
 * si Weezevent appelle réellement notre URL ni dans quel mode tourne le polling.
 */
@Injectable()
export class WeezeventWebhookStatusService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly config: ConfigService,
        private readonly webhookHealth: WebhookHealthService,
        private readonly heartbeat: LiveHeartbeatService,
    ) {}

    /** {API_PUBLIC_URL}/webhooks/weezevent/{tenantId}/{integrationId}, chemin relatif si l'env n'est pas posée. */
    webhookUrl(tenantId: string, integrationId: string): string {
        const base = (this.config.get<string>('API_PUBLIC_URL') ?? '').replace(/\/+$/, '');
        return `${base}/webhooks/weezevent/${tenantId}/${integrationId}`;
    }

    async getStatus(tenantId: string, instanceId: string): Promise<WeezeventWebhookStatus> {
        const row = await this.prisma.integration.findFirst({
            where: { id: instanceId, tenantId, provider: 'WEEZEVENT' },
            select: { id: true, weezevent: { select: { webhookEnabled: true, webhookSecret: true } } },
        });
        if (!row) {
            throw new NotFoundException(`Weezevent instance ${instanceId} not found`);
        }

        const since = new Date(Date.now() - 24 * 3600 * 1000);
        const [lastWebhook, received, failed, healthy, sync] = await Promise.all([
            this.prisma.integrationWebhookEvent.findFirst({
                where: { tenantId, integrationId: instanceId, provider: 'WEEZEVENT' },
                orderBy: { createdAt: 'desc' },
                select: { id: true, eventType: true, method: true, createdAt: true, processed: true, processedAt: true, error: true },
            }),
            this.prisma.integrationWebhookEvent.count({ where: { tenantId, integrationId: instanceId, provider: 'WEEZEVENT', createdAt: { gte: since } } }),
            this.prisma.integrationWebhookEvent.count({
                where: { tenantId, integrationId: instanceId, provider: 'WEEZEVENT', createdAt: { gte: since }, error: { not: null } },
            }),
            this.webhookHealth.isHealthy(instanceId),
            this.heartbeat.readSyncState(instanceId),
        ]);

        return {
            webhookUrl: this.webhookUrl(tenantId, instanceId),
            enabled: row.weezevent?.webhookEnabled ?? false,
            configured: !!row.weezevent?.webhookSecret,
            healthy,
            healthyWindowSec: WEBHOOK_HEALTHY_WINDOW_MS / 1000,
            lastWebhook,
            last24h: { received, failed },
            sync,
        };
    }
}
