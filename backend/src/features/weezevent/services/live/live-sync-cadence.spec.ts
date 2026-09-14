import { DEFAULT_LIVE_SYNC_CADENCE, isQuietPeriod, readCadenceConfig, resolveSyncCadence } from './live-sync-cadence';

describe('resolveSyncCadence (BUG-379-02)', () => {
    const cfg = DEFAULT_LIVE_SYNC_CADENCE;

    it('polls every 30 min when nothing is live', () => {
        expect(resolveSyncCadence({ isLive: false, webhookHealthy: true, rateLimited: false }, cfg)).toEqual({ mode: 'idle', intervalSec: 1800 });
    });

    it('polls every 10 s during a match when the webhook is absent or silent (fallback)', () => {
        expect(resolveSyncCadence({ isLive: true, webhookHealthy: false, rateLimited: false }, cfg)).toEqual({ mode: 'live-polling', intervalSec: 10 });
    });

    it('backs off to 30 s during a match after a 429', () => {
        expect(resolveSyncCadence({ isLive: true, webhookHealthy: false, rateLimited: true }, cfg)).toEqual({ mode: 'live-polling', intervalSec: 30 });
    });

    it('keeps polling as a 2 min safety net when the webhook is healthy', () => {
        expect(resolveSyncCadence({ isLive: true, webhookHealthy: true, rateLimited: true }, cfg)).toEqual({ mode: 'live-webhook', intervalSec: 120 });
    });

    it('polls every 60 s during a quiet period of a live event, never below the 429 backoff', () => {
        expect(resolveSyncCadence({ isLive: true, webhookHealthy: false, rateLimited: false, quiet: true }, cfg)).toEqual({ mode: 'live-quiet', intervalSec: 60 });
        expect(resolveSyncCadence({ isLive: true, webhookHealthy: false, rateLimited: true, quiet: true }, { ...cfg, quietIntervalSec: 20 })).toEqual({ mode: 'live-quiet', intervalSec: 30 });
    });

    it('a quiet period starts after 10 min without new sales, and immediately when none were ever seen', () => {
        const now = new Date('2026-09-12T17:10:00Z');
        expect(isQuietPeriod(null, now, cfg)).toBe(true);
        expect(isQuietPeriod(new Date('2026-09-12T17:01:00Z'), now, cfg)).toBe(false);
        expect(isQuietPeriod(new Date('2026-09-12T17:00:00Z'), now, cfg)).toBe(true);
    });

    it('reads overrides from the environment and ignores invalid values', () => {
        expect(readCadenceConfig({ LIVE_SYNC_INTERVAL_SEC: '30', IDLE_SYNC_INTERVAL_SEC: 'abc', LIVE_SYNC_INTERVAL_WEBHOOK_SEC: '-5', LIVE_SYNC_QUIET_AFTER_MIN: '5' })).toEqual({
            ...cfg,
            liveIntervalSec: 30,
            quietAfterSec: 300,
        });
    });
});
