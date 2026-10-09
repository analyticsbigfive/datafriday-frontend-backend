import { VentilationEventsService, eventMatchLabel } from './ventilation-events.service';

const ev = (id: string, day: string, endTime: string | null, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Match ${id}`,
  homeTeamName: null,
  visitingTeamName: null,
  eventDate: new Date(`${day}T00:00:00.000Z`),
  eventStartDate: null,
  eventEndDate: null,
  eventEndTime: endTime,
  sessions: null,
  configurationId: 'cfg-1',
  ...extra,
});

describe('VentilationEventsService', () => {
  const setup = (rows: any[]) => {
    const prisma = {
      space: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Europe/Paris' }) },
      event: { findMany: jest.fn().mockResolvedValue(rows) },
    };
    return { service: new VentilationEventsService(prisma as any), prisma };
  };

  it('garde le match du jour sélectionné jusqu’à sa fin réelle, puis passe au suivant', async () => {
    const rows = [ev('today', '2026-10-10', '22:00'), ev('next', '2026-10-17', '22:00')];
    const { service } = setup(rows);
    // 21:30 Paris (19:30Z) : portes ouvertes depuis longtemps, match pas fini.
    const during = await service.listOpenEvents('space-1', 't1', new Date('2026-10-10T19:30:00Z'));
    expect(during.defaultEventId).toBe('today');
    // 22:00 Paris (20:00Z) : fin réelle.
    const after = await service.listOpenEvents('space-1', 't1', new Date('2026-10-10T20:00:00Z'));
    expect(after.defaultEventId).toBe('next');
    expect(after.events.map((e) => e.id)).toEqual(['next']);
  });

  it('libellé « équipe vs équipe », sinon le nom', () => {
    expect(eventMatchLabel({ name: 'J8', homeTeamName: 'Nantes', visitingTeamName: 'Reims' })).toBe('Nantes vs Reims');
    expect(eventMatchLabel({ name: 'Concert', homeTeamName: 'Nantes', visitingTeamName: null })).toBe('Concert');
  });

  it('ordre chronologique de la sélection, limitée à l’espace du tenant', async () => {
    const { service, prisma } = setup([ev('b', '2026-10-17', null), ev('a', '2026-10-10', null)]);
    const out = await service.orderedEvents('space-1', 't1', ['b', 'a', 'b']);
    expect(out.map((e) => e.id)).toEqual(['a', 'b']);
    expect(prisma.event.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['b', 'a'] }, spaceId: 'space-1', tenantId: 't1' });
  });
});
