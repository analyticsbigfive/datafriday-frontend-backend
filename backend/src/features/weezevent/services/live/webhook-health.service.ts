import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../../core/redis/redis.service';
import { WEBHOOK_HEALTHY_WINDOW_MS, webhookLastOkKey } from '../../../../shared/constants/live-aggregation';

/**
 * BUG-379-02 : "le webhook Weezevent fonctionne" = un webhook traité sans erreur il y a moins
 * de WEBHOOK_HEALTHY_WINDOW_MS pour cette intégration. Tant que ce n'est pas le cas, le
 * polling reste en cadence live : un webhook enregistré chez Weezevent mais cassé (secret,
 * API endormie) ne doit jamais dégrader le Live en dessous de ce que fait le polling.
 */
@Injectable()
export class WebhookHealthService {
    constructor(private readonly redis: RedisService) {}

    async markProcessed(integrationId: string, at: Date = new Date()): Promise<void> {
        await this.redis.set(webhookLastOkKey(integrationId), at.toISOString(), { ttl: 24 * 3600 });
    }

    async lastProcessedAt(integrationId: string): Promise<Date | null> {
        const stored = await this.redis.get<string>(webhookLastOkKey(integrationId));
        return stored ? new Date(stored) : null;
    }

    async isHealthy(integrationId: string, now: Date = new Date()): Promise<boolean> {
        const last = await this.lastProcessedAt(integrationId);
        return !!last && now.getTime() - last.getTime() <= WEBHOOK_HEALTHY_WINDOW_MS;
    }
}
