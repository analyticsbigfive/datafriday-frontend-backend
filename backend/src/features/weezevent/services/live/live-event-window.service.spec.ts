import { LiveEventWindowService } from './live-event-window.service';

describe('LiveEventWindowService (BUG-379-02)', () => {
    const prisma = {
        event: { findMany: jest.fn() },
        integration: { findMany: jest.fn() },
    };
    const service = new LiveEventWindowService(prisma as any);

    // PFC-Lyon 12/09 : eventDate/eventEndDate à minuit, eventEndTime 23:50 (fuseau Paris, UTC+2).
    const pfcLyon = {
        id: 'pfc-lyon',
        tenantId: 'tenant',
        spaceId: 'jean-bouin',
        eventDate: new Date('2026-09-12T00:00:00Z'),
        eventStartDate: new Date('2026-09-12T00:00:00Z'),
        eventEndDate: new Date('2026-09-12T00:00:00Z'),
        eventEndTime: '23:50',
        integrationId: 'pfc',
        space: { timezone: 'Europe/Paris' },
        weezeventEvent: null,
    };

    beforeEach(() => jest.clearAllMocks());

    it('considers a match live during the match itself, not only between midnight and 3am', async () => {
        prisma.event.findMany.mockResolvedValue([pfcLyon]);

        const during = await service.findLiveEvents(new Date('2026-09-12T17:30:00Z'));
        expect(during.map((e) => e.id)).toEqual(['pfc-lyon']);
        expect(during[0].windowStart.toISOString()).toBe('2026-09-11T22:00:00.000Z');
        expect(during[0].windowEnd.toISOString()).toBe('2026-09-12T21:50:00.000Z');
        expect(during[0].graceEnd.toISOString()).toBe('2026-09-13T00:50:00.000Z');
    });

    it('keeps the grace period after the declared end, then stops', async () => {
        prisma.event.findMany.mockResolvedValue([pfcLyon]);
        expect(await service.findLiveEvents(new Date('2026-09-12T23:30:00Z'))).toHaveLength(1);
        expect(await service.findLiveEvents(new Date('2026-09-13T01:00:00Z'))).toHaveLength(0);
    });

    it('is not live before local midnight of the event day', async () => {
        prisma.event.findMany.mockResolvedValue([pfcLyon]);
        expect(await service.findLiveEvents(new Date('2026-09-11T21:00:00Z'))).toHaveLength(0);
    });

    it('falls back to the linked SalesEvent integration and groups by (space, integration)', async () => {
        prisma.event.findMany.mockResolvedValue([
            { ...pfcLyon, integrationId: null, weezeventEvent: { integrationId: 'pfc-via-sales-event' } },
            { ...pfcLyon, id: 'sfp', integrationId: 'sfp' },
            { ...pfcLyon, id: 'aja', spaceId: 'auxerre', integrationId: null },
        ]);

        const live = await service.findLiveEvents(new Date('2026-09-12T17:30:00Z'));
        const groups = LiveEventWindowService.groupBySpaceAndIntegration(live);

        expect(groups).toEqual([
            { tenantId: 'tenant', spaceId: 'jean-bouin', integrationId: 'pfc-via-sales-event', eventIds: ['pfc-lyon'] },
            { tenantId: 'tenant', spaceId: 'jean-bouin', integrationId: 'sfp', eventIds: ['sfp'] },
            { tenantId: 'tenant', spaceId: 'auxerre', integrationId: null, eventIds: ['aja'] },
        ]);
    });

    it('puts every Weezevent integration of the tenant live when an event has no known integration', async () => {
        prisma.integration.findMany.mockResolvedValue([{ id: 'aja-int' }, { id: 'other-int' }]);
        const ids = await service.findLiveIntegrationIds([
            { id: 'aja', tenantId: 'tenant', spaceId: 'auxerre', integrationId: null } as any,
            { id: 'pfc', tenantId: 'tenant', spaceId: 'jb', integrationId: 'pfc' } as any,
        ]);
        expect([...ids].sort()).toEqual(['aja-int', 'other-int', 'pfc']);
        expect(prisma.integration.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: expect.objectContaining({ tenantId: { in: ['tenant'] }, provider: 'WEEZEVENT' }) }),
        );
    });
});
