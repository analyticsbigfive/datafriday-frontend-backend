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
    /** Event en direct mais aucune vente nouvelle depuis ce délai : période calme. */
    quietAfterSec: number;
    /** Cadence en période calme (première vente vue au plus tard après ce délai, puis retour à 10 s). */
    quietIntervalSec: number;
}

export const DEFAULT_LIVE_SYNC_CADENCE: LiveSyncCadenceConfig = {
    liveIntervalSec: 10,
    liveWithWebhookIntervalSec: 120,
    rateLimitedIntervalSec: 30,
    idleIntervalSec: 1800,
    quietAfterSec: 10 * 60,
    quietIntervalSec: 60,
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
        quietAfterSec: num('LIVE_SYNC_QUIET_AFTER_MIN', DEFAULT_LIVE_SYNC_CADENCE.quietAfterSec / 60) * 60,
        quietIntervalSec: num('LIVE_SYNC_INTERVAL_QUIET_SEC', DEFAULT_LIVE_SYNC_CADENCE.quietIntervalSec),
    };
}

export function resolveSyncCadence(
    input: { isLive: boolean; webhookHealthy: boolean; rateLimited: boolean; quiet?: boolean },
    cfg: LiveSyncCadenceConfig,
): { mode: LiveSyncMode; intervalSec: number } {
    if (!input.isLive) return { mode: 'idle', intervalSec: cfg.idleIntervalSec };
    if (input.webhookHealthy) return { mode: 'live-webhook', intervalSec: cfg.liveWithWebhookIntervalSec };
    const rateLimitedSec = input.rateLimited ? cfg.rateLimitedIntervalSec : 0;
    if (input.quiet) return { mode: 'live-quiet', intervalSec: Math.max(cfg.quietIntervalSec, rateLimitedSec) };
    if (input.rateLimited) return { mode: 'live-polling', intervalSec: rateLimitedSec };
    return { mode: 'live-polling', intervalSec: cfg.liveIntervalSec };
}

/** Période calme = aucune vente nouvelle vue depuis quietAfterSec (jamais vue = calme). */
export function isQuietPeriod(lastNewSalesAt: Date | null, now: Date, cfg: LiveSyncCadenceConfig): boolean {
    return !lastNewSalesAt || now.getTime() - lastNewSalesAt.getTime() >= cfg.quietAfterSec * 1000;
}
