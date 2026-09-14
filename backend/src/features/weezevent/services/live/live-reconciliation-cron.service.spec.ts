import { LiveReconciliationCronService } from './live-reconciliation-cron.service';

describe('LiveReconciliationCronService (BUG-379-02)', () => {
    const event = {
        id: 'pfc-lyon',
        tenantId: 'tenant',
        spaceId: 'jean-bouin',
        integrationId: 'pfc',
        windowStart: new Date('2026-09-11T22:00:00Z'),
        windowEnd: new Date('2026-09-12T21:50:00Z'),
        graceEnd: new Date('2026-09-13T00:50:00Z'),
    };
    let liveWindow: any;
    let trigger: any;
    let heartbeat: any;
    let service: LiveReconciliationCronService;

    beforeEach(() => {
        liveWindow = { findLiveEvents: jest.fn().mockResolvedValue([event]) };
        trigger = { queueFullRebuild: jest.fn(), lastFullRebuildAt: jest.fn().mockResolvedValue(null) };
        heartbeat = { beat: jest.fn() };
        delete process.env.WEEZEVENT_CRON_ENABLED;
        service = new LiveReconciliationCronService(liveWindow, trigger, heartbeat);
        service.onModuleInit();
    });

    it('queues a first full rebuild during the match when none happened yet', async () => {
        await service.run(new Date('2026-09-12T17:00:00Z'));
        expect(trigger.queueFullRebuild).toHaveBeenCalledWith(
            { tenantId: 'tenant', spaceId: 'jean-bouin', integrationId: 'pfc', eventIds: ['pfc-lyon'] },
            'live-reconciliation',
        );
    });

    it('waits 30 min between two reconciliations during the match', async () => {
        trigger.lastFullRebuildAt.mockResolvedValue(new Date('2026-09-12T17:00:00Z'));
        await service.run(new Date('2026-09-12T17:20:00Z'));
        expect(trigger.queueFullRebuild).not.toHaveBeenCalled();
        await service.run(new Date('2026-09-12T17:30:00Z'));
        expect(trigger.queueFullRebuild).toHaveBeenCalledTimes(1);
    });

    it('runs one final rebuild 10 min after the declared end, then nothing more', async () => {
        trigger.lastFullRebuildAt.mockResolvedValue(new Date('2026-09-12T21:45:00Z'));
        await service.run(new Date('2026-09-12T21:55:00Z'));
        expect(trigger.queueFullRebuild).not.toHaveBeenCalled();

        await service.run(new Date('2026-09-12T22:00:00Z'));
        expect(trigger.queueFullRebuild).toHaveBeenCalledWith(expect.objectContaining({ eventIds: ['pfc-lyon'] }), 'live-final');

        trigger.lastFullRebuildAt.mockResolvedValue(new Date('2026-09-12T22:00:00Z'));
        trigger.queueFullRebuild.mockClear();
        await service.run(new Date('2026-09-12T23:30:00Z'));
        expect(trigger.queueFullRebuild).not.toHaveBeenCalled();
    });

    it('does nothing when disabled', async () => {
        process.env.WEEZEVENT_CRON_ENABLED = 'false';
        service.onModuleInit();
        await service.run();
        expect(liveWindow.findLiveEvents).not.toHaveBeenCalled();
        delete process.env.WEEZEVENT_CRON_ENABLED;
    });
});
