import { DEFAULT_LIVE_SYNC_CADENCE, readCadenceConfig, resolveSyncCadence } from './live-sync-cadence';

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

    it('reads overrides from the environment and ignores invalid values', () => {
        expect(readCadenceConfig({ LIVE_SYNC_INTERVAL_SEC: '30', IDLE_SYNC_INTERVAL_SEC: 'abc', LIVE_SYNC_INTERVAL_WEBHOOK_SEC: '-5' })).toEqual({
            ...cfg,
            liveIntervalSec: 30,
        });
    });
});
