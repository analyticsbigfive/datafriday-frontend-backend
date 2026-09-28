import { countEndedEventsBySpace } from './count-ended-events';

const day = (d: string) => new Date(`${d}T00:00:00.000Z`);
const paris = { timezone: 'Europe/Paris' };

describe('countEndedEventsBySpace', () => {
  const setup = (old: any[], recent: any[]) => ({
    event: {
      groupBy: jest.fn().mockResolvedValue(old),
      findMany: jest.fn().mockResolvedValue(recent),
    },
  });

  it("ne compte pas le match du jour avant sa fin réelle (SFP-Lyon 26/09, fin 23:00)", async () => {
    const prisma = setup(
      [{ spaceId: 's1', _count: 4 }],
      [{ spaceId: 's1', eventDate: day('2026-09-26'), eventEndTime: '23:00', space: paris }],
    );
    const during = await countEndedEventsBySpace(prisma as any, { tenantId: 't' }, new Date('2026-09-26T14:15:00Z'));
    expect(during.get('s1')).toBe(4);
    const after = await countEndedEventsBySpace(prisma as any, { tenantId: 't' }, new Date('2026-09-26T21:00:00Z'));
    expect(after.get('s1')).toBe(5);
  });

  it('un match fini à 03:00 le lendemain reste en cours après minuit', async () => {
    const vannes = {
      spaceId: 's1',
      eventDate: day('2026-11-28'),
      eventEndDate: day('2026-11-29'),
      eventEndTime: '03:00',
      space: paris,
    };
    const prisma = setup([], [vannes]);
    const res = await countEndedEventsBySpace(prisma as any, {}, new Date('2026-11-29T00:30:00Z'));
    expect(res.get('s1') ?? 0).toBe(0);
  });
});
