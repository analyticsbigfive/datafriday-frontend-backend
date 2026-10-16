import { weezeventEventIdsOnDate } from './event-weezevent-link.queries';

describe('weezeventEventIdsOnDate (ADR multi-source, auto-lien)', () => {
  it('exclut les SalesEvent déclarés comme source non auto, sans test sur le nom d\'un logiciel', async () => {
    const db: any = { $queryRaw: jest.fn().mockResolvedValue([{ id: 'we-1' }]) };

    const result = await weezeventEventIdsOnDate(db, 'tenant-1', new Date('2026-07-15'));

    const strings: string[] = db.$queryRaw.mock.calls[0][0];
    const sql = strings.join('?').replace(/\s+/g, ' ');
    expect(result).toEqual([{ id: 'we-1' }]);
    expect(sql).toContain('NOT EXISTS ( SELECT 1 FROM "EventSalesSource" s');
    expect(sql).toContain(`s."salesEventId" = we.id AND s."active" = true AND s."origin" <> 'auto' )`);
    expect(sql.toLowerCase()).not.toContain('pos');
    expect(db.$queryRaw.mock.calls[0][1]).toBe('tenant-1');
  });
});
