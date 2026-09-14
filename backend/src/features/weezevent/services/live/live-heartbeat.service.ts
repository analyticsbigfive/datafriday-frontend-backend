import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../../../core/redis/redis.service';
import { liveHeartbeatKey, liveSyncStateKey } from '../../../../shared/constants/live-aggregation';

export type LiveSyncMode = 'idle' | 'live-polling' | 'live-quiet' | 'live-webhook';

export interface LiveSyncState {
    mode: LiveSyncMode;
    intervalSec: number;
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastCreated: number;
    nextRunAt: string | null;
}

/**
 * BUG-379-02 : état observable du pipeline live (Redis), lu par /health/detailed et par le
 * statut webhook de Data Integration. Sans ça, un cron mort ou un event ignoré restent
 * invisibles jusqu'à ce qu'un client s'en plaigne.
 */
@Injectable()
export class LiveHeartbeatService {
    private readonly logger = new Logger(LiveHeartbeatService.name);
    private static readonly TTL_SEC = 24 * 3600;
    /** Une alerte par intégration au plus toutes les 15 min. */
    private static readonly ALERT_THROTTLE_SEC = 15 * 60;

    constructor(
        private readonly redis: RedisService,
        private readonly config: ConfigService,
    ) {}

    async beat(name: string): Promise<void> {
        await this.redis.set(liveHeartbeatKey(name), new Date().toISOString(), { ttl: LiveHeartbeatService.TTL_SEC });
    }

    async lastBeat(name: string): Promise<Date | null> {
        const stored = await this.redis.get<string>(liveHeartbeatKey(name));
        return stored ? new Date(stored) : null;
    }

    async writeSyncState(integrationId: string, state: LiveSyncState): Promise<void> {
        await this.redis.set(liveSyncStateKey(integrationId), state, { ttl: LiveHeartbeatService.TTL_SEC });
    }

    async readSyncState(integrationId: string): Promise<LiveSyncState | null> {
        return this.redis.get<LiveSyncState>(liveSyncStateKey(integrationId));
    }

    /**
     * Alerte opérationnelle : log error toujours, POST sur ALERT_WEBHOOK_URL (Slack incoming
     * webhook ou équivalent) si configuré. Throttlée par clé pour ne pas spammer un soir de match.
     */
    async alert(key: string, message: string): Promise<void> {
        const throttleKey = `live:alert:${key}`;
        if (await this.redis.has(throttleKey)) return;
        await this.redis.set(throttleKey, '1', { ttl: LiveHeartbeatService.ALERT_THROTTLE_SEC });
        this.logger.error(`[LIVE ALERT] ${message}`);

        const url = this.config.get<string>('ALERT_WEBHOOK_URL');
        if (!url) return;
        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ text: `[DataFriday live] ${message}` }),
            });
        } catch (err) {
            this.logger.warn(`Alert webhook failed: ${(err as Error).message}`);
        }
    }
}
