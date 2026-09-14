import { LiveSyncMode } from './live-heartbeat.service';

export interface LiveSyncCadenceConfig {
    /** Event en direct, webhook absent ou muet : cible 10 s (BUG-379-02, décision Ulrich 14/09). */
    liveIntervalSec: number;
    /** Event en direct, webhook sain : le polling n'est plus qu'un filet. */
    liveWithWebhookIntervalSec: number;
    /** Repli quand Weezevent renvoie 429 pendant un event. */
    rateLimitedIntervalSec: number;
    /** Aucun event en direct : rattrapage des ventes hors match uniquement. */
    idleIntervalSec: number;
}

export const DEFAULT_LIVE_SYNC_CADENCE: LiveSyncCadenceConfig = {
    liveIntervalSec: 10,
    liveWithWebhookIntervalSec: 120,
    rateLimitedIntervalSec: 30,
    idleIntervalSec: 1800,
};

export function readCadenceConfig(env: Record<string, string | undefined>): LiveSyncCadenceConfig {
    const num = (key: string, fallback: number) => {
        const raw = env[key];
        const parsed = raw ? Number(raw) : NaN;
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };
    return {
        liveIntervalSec: num('LIVE_SYNC_INTERVAL_SEC', DEFAULT_LIVE_SYNC_CADENCE.liveIntervalSec),
        liveWithWebhookIntervalSec: num('LIVE_SYNC_INTERVAL_WEBHOOK_SEC', DEFAULT_LIVE_SYNC_CADENCE.liveWithWebhookIntervalSec),
        rateLimitedIntervalSec: num('LIVE_SYNC_INTERVAL_RATE_LIMITED_SEC', DEFAULT_LIVE_SYNC_CADENCE.rateLimitedIntervalSec),
        idleIntervalSec: num('IDLE_SYNC_INTERVAL_SEC', DEFAULT_LIVE_SYNC_CADENCE.idleIntervalSec),
    };
}

export function resolveSyncCadence(
    input: { isLive: boolean; webhookHealthy: boolean; rateLimited: boolean },
    cfg: LiveSyncCadenceConfig,
): { mode: LiveSyncMode; intervalSec: number } {
    if (!input.isLive) return { mode: 'idle', intervalSec: cfg.idleIntervalSec };
    if (input.webhookHealthy) return { mode: 'live-webhook', intervalSec: cfg.liveWithWebhookIntervalSec };
    if (input.rateLimited) return { mode: 'live-polling', intervalSec: cfg.rateLimitedIntervalSec };
    return { mode: 'live-polling', intervalSec: cfg.liveIntervalSec };
}
