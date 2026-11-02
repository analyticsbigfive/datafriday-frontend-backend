import { EventWindowAuditService } from './event-window-audit.service';

describe('EventWindowAuditService', () => {
    const before = {
        id: 'ev1',
        eventDate: new Date('2026-11-01T00:00:00Z'),
        eventStartDate: new Date('2026-11-01T00:00:00Z'),
        eventEndDate: new Date('2026-11-01T00:00:00Z'),
        eventEndTime: '16:30',
    };
    const build = () => {
        const audit = { log: jest.fn().mockResolvedValue(undefined) };
        return { audit, service: new EventWindowAuditService(audit as any) };
    };

    it('écrit l’ancienne et la nouvelle valeur quand l’heure de fin change', async () => {
        const { service, audit } = build();
        await expect(service.recordIfWindowChanged('t1', 'u1', before, { ...before, eventEndTime: '23:30' })).resolves.toBe(true);
        expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
            tenantId: 't1', userId: 'u1', action: 'UPDATE', entity: 'Event', entityId: 'ev1',
            changes: {
                before: expect.objectContaining({ eventEndTime: '16:30' }),
                after: expect.objectContaining({ eventEndTime: '23:30' }),
            },
        }));
    });

    it('rien à écrire sans changement de fenêtre ni auteur', async () => {
        const { service, audit } = build();
        await expect(service.recordIfWindowChanged('t1', 'u1', before, { ...before })).resolves.toBe(false);
        await expect(service.recordIfWindowChanged('t1', null, before, { ...before, eventEndTime: '23:30' })).resolves.toBe(false);
        expect(audit.log).not.toHaveBeenCalled();
    });
});
