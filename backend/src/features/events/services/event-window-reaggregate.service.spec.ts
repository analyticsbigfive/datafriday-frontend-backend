import { EventWindowReaggregateService } from './event-window-reaggregate.service';

describe('EventWindowReaggregateService', () => {
    const base = {
        id: 'ev1',
        tenantId: 't1',
        spaceId: 's1',
        eventDate: new Date('2026-11-01T00:00:00Z'),
        eventStartDate: new Date('2026-11-01T00:00:00Z'),
        eventEndDate: new Date('2026-11-01T00:00:00Z'),
        eventEndTime: '16:30',
    };
    const now = new Date('2026-11-02T09:00:00Z');

    const build = () => {
        const prisma = { space: { findUnique: jest.fn().mockResolvedValue({ timezone: 'Europe/Paris' }) } };
        const aggregation = { processEvents: jest.fn().mockResolvedValue({ jobId: 'j1' }) };
        return { prisma, aggregation, service: new EventWindowReaggregateService(prisma as any, { get: () => aggregation } as any) };
    };

    it('windowChanged : heure de fin ou date modifiée, pas un autre champ', () => {
        expect(EventWindowReaggregateService.windowChanged(base, { ...base, eventEndTime: '23:30' })).toBe(true);
        expect(EventWindowReaggregateService.windowChanged(base, { ...base, eventEndDate: new Date('2026-11-02T00:00:00Z') })).toBe(true);
        expect(EventWindowReaggregateService.windowChanged(base, { ...base, eventEndTime: null })).toBe(true);
        expect(EventWindowReaggregateService.windowChanged(base, { ...base, eventDate: new Date(base.eventDate) })).toBe(false);
    });

    it('met l’event en file quand l’heure de fin change sur un match commencé', async () => {
        const { service, aggregation } = build();
        await expect(service.reaggregateIfWindowChanged(base, { ...base, eventEndTime: '23:30' }, now)).resolves.toBe(true);
        expect(aggregation.processEvents).toHaveBeenCalledWith('t1', 's1', ['ev1']);
    });

    it('rien à faire sans changement de fenêtre, sans espace, ou pour un match à venir', async () => {
        const { service, aggregation } = build();
        await expect(service.reaggregateIfWindowChanged(base, { ...base }, now)).resolves.toBe(false);
        await expect(service.reaggregateIfWindowChanged(base, { ...base, eventEndTime: '23:30', spaceId: null }, now)).resolves.toBe(false);
        const future = { ...base, eventDate: new Date('2026-12-05T00:00:00Z'), eventStartDate: new Date('2026-12-05T00:00:00Z'), eventEndDate: new Date('2026-12-05T00:00:00Z') };
        await expect(service.reaggregateIfWindowChanged(future, { ...future, eventEndTime: '23:30' }, now)).resolves.toBe(false);
        expect(aggregation.processEvents).not.toHaveBeenCalled();
    });

    it('ne lève jamais si la mise en file échoue', async () => {
        const { service, aggregation } = build();
        aggregation.processEvents.mockRejectedValue(new Error('redis down'));
        await expect(service.reaggregateIfWindowChanged(base, { ...base, eventEndTime: '23:30' }, now)).resolves.toBe(false);
    });
});
