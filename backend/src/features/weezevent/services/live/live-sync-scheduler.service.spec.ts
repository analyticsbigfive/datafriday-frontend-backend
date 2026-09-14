import { LiveSyncSchedulerService } from './live-sync-scheduler.service';

const flush = () => new Promise((r) => setImmediate(r));

describe('LiveSyncSchedulerService (BUG-379-02)', () => {
    const liveEvent = { id: 'pfc-lyon', tenantId: 'tenant', spaceId: 'jean-bouin', integrationId: 'pfc' };
    let prisma: any;
    let liveWindow: any;
    let runner: any;
    let trigger: any;
    let webhookHealth: any;
    let heartbeat: any;
    let service: LiveSyncSchedulerService;

    beforeEach(() => {
        prisma = { integration: { findMany: jest.fn().mockResolvedValue([{ id: 'pfc', tenantId: 'tenant' }, { id: 'aix', tenantId: 'tenant' }]) } };
        liveWindow = {
            findLiveEvents: jest.fn().mockResolvedValue([liveEvent]),
            findLiveIntegrationIds: jest.fn().mockResolvedValue(new Set(['pfc'])),
        };
        runner = { run: jest.fn().mockResolvedValue({ status: 'ok', result: { itemsCreated: 3, itemsUpdated: 0 } }) };
        trigger = { queueMinuteAggregation: jest.fn().mockResolvedValue(true) };
        webhookHealth = { isHealthy: jest.fn().mockResolvedValue(false) };
        heartbeat = { beat: jest.fn(), writeSyncState: jest.fn(), alert: jest.fn() };
        delete process.env.WEEZEVENT_CRON_ENABLED;
        service = new LiveSyncSchedulerService(prisma, liveWindow, runner, trigger, webhookHealth, heartbeat);
        service.onModuleInit();
    });

    it('syncs every eligible integration on the first tick, then queues live aggregation only for live ones', async () => {
        await service.tick(new Date('2026-09-12T17:00:00Z'));
        await flush();

        expect(runner.run).toHaveBeenCalledTimes(2);
        expect(trigger.queueMinuteAggregation).toHaveBeenCalledTimes(1);
        expect(trigger.queueMinuteAggregation).toHaveBeenCalledWith(
            { tenantId: 'tenant', spaceId: 'jean-bouin', integrationId: 'pfc', eventIds: ['pfc-lyon'] },
            'live-sync',
        );
        expect(heartbeat.writeSyncState).toHaveBeenCalledWith('pfc', expect.objectContaining({ mode: 'live-polling', intervalSec: 10 }));
        expect(heartbeat.writeSyncState).toHaveBeenCalledWith('aix', expect.objectContaining({ mode: 'idle', intervalSec: 1800 }));
    });

    it('re-syncs a live integration after 10 s but leaves an idle one alone for 30 min', async () => {
        await service.tick(new Date('2026-09-12T17:00:00Z'));
        await flush();
        runner.run.mockClear();

        await service.tick(new Date('2026-09-12T17:00:10Z'));
        await flush();
        expect(runner.run).toHaveBeenCalledTimes(1);
        expect(runner.run).toHaveBeenCalledWith('tenant', 'pfc');

        runner.run.mockClear();
        await service.tick(new Date('2026-09-12T17:30:00Z'));
        await flush();
        expect(runner.run.mock.calls.map((c: any[]) => c[1]).sort()).toEqual(['aix', 'pfc']);
    });

    it('switches an idle integration to the live cadence on the very next tick, without waiting the 30 min', async () => {
        liveWindow.findLiveEvents.mockResolvedValue([]);
        liveWindow.findLiveIntegrationIds.mockResolvedValue(new Set());
        await service.tick(new Date('2026-09-12T11:40:00Z'));
        await flush();
        expect(heartbeat.writeSyncState).toHaveBeenCalledWith('pfc', expect.objectContaining({ mode: 'idle' }));
        runner.run.mockClear();

        // L'event passe en direct à 12:05 : le snapshot live (30 s) est rafraîchi au tick suivant.
        liveWindow.findLiveEvents.mockResolvedValue([liveEvent]);
        liveWindow.findLiveIntegrationIds.mockResolvedValue(new Set(['pfc']));
        await service.tick(new Date('2026-09-12T12:05:00Z'));
        await flush();

        expect(runner.run).toHaveBeenCalledWith('tenant', 'pfc');
        expect(heartbeat.writeSyncState).toHaveBeenLastCalledWith('pfc', expect.objectContaining({ mode: 'live-polling', intervalSec: 10 }));
    });

    it('drops to a 2 min safety-net cadence while the webhook is healthy (polling = fallback only)', async () => {
        webhookHealth.isHealthy.mockResolvedValue(true);
        await service.tick(new Date('2026-09-12T17:00:00Z'));
        await flush();
        runner.run.mockClear();

        await service.tick(new Date('2026-09-12T17:00:30Z'));
        await flush();
        expect(runner.run).not.toHaveBeenCalled();

        await service.tick(new Date('2026-09-12T17:02:00Z'));
        await flush();
        expect(runner.run).toHaveBeenCalledWith('tenant', 'pfc');
        expect(heartbeat.writeSyncState).toHaveBeenCalledWith('pfc', expect.objectContaining({ mode: 'live-webhook', intervalSec: 120 }));
    });

    it('does not queue aggregation when the sync created nothing', async () => {
        runner.run.mockResolvedValue({ status: 'ok', result: { itemsCreated: 0, itemsUpdated: 0 } });
        await service.tick(new Date('2026-09-12T17:00:00Z'));
        await flush();
        expect(trigger.queueMinuteAggregation).not.toHaveBeenCalled();
    });

    it('backs off after a rate limit and alerts after repeated failures during a match', async () => {
        runner.run.mockResolvedValue({ status: 'error', message: 'Rate limit exceeded: 429', rateLimited: true });
        for (let i = 0; i < 3; i++) {
            await service.tick(new Date(Date.parse('2026-09-12T17:00:00Z') + i * 30_000));
            await flush();
        }
        expect(heartbeat.writeSyncState).toHaveBeenLastCalledWith('pfc', expect.objectContaining({ intervalSec: 30, lastError: 'Rate limit exceeded: 429' }));
        expect(heartbeat.alert).toHaveBeenCalledWith('sync:pfc', expect.stringContaining('pfc'));
    });

    it('never overlaps two syncs of the same integration', async () => {
        let release: () => void = () => undefined;
        runner.run.mockImplementation(() => new Promise((r) => { release = () => r({ status: 'ok', result: { itemsCreated: 0, itemsUpdated: 0 } }); }));
        await service.tick(new Date('2026-09-12T17:00:00Z'));
        await service.tick(new Date('2026-09-12T17:00:20Z'));
        expect(runner.run).toHaveBeenCalledTimes(2);
        release();
        await flush();
    });

    it('does nothing when disabled (web process)', async () => {
        process.env.WEEZEVENT_CRON_ENABLED = 'false';
        service.onModuleInit();
        await service.tick();
        expect(runner.run).not.toHaveBeenCalled();
        delete process.env.WEEZEVENT_CRON_ENABLED;
    });
});
