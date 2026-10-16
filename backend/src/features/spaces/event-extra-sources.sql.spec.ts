import { Prisma } from '@prisma/client';
import { hasExtraSources, orDeclaredSource, rawEvColumns, rawEvValues } from './event-extra-sources.sql';

const text = (sql: Prisma.Sql) => sql.strings.join('?');
const w = (over: Record<string, unknown> = {}) => ({ id: 'e1', windowStart: new Date('2026-09-12T00:00:00Z'), windowEnd: new Date('2026-09-13T00:00:00Z'), tagId: null, eventIntegrationId: 'int-W', ...over });

describe('lecteurs bruts : sources déclarées (ADR 4.5)', () => {
  it('sans source déclarée, le SQL est strictement celui d\'avant (fragments vides, 5 colonnes)', () => {
    const windows = [w()];
    expect(hasExtraSources(windows)).toBe(false);
    const legacy = Prisma.sql`WITH ev("eventId", "windowStart", "windowEnd", "tagId", "eventIntegrationId") AS (VALUES ${Prisma.join(
      windows.map((x) => Prisma.sql`(${x.id}::text, ${x.windowStart}::timestamp, ${x.windowEnd}::timestamp, ${x.tagId}::text, ${x.eventIntegrationId}::text)`), ', ')}) AND (a OR t."eventId" = ev."tagId")`;
    const now = Prisma.sql`WITH ev(${rawEvColumns(false)}) AS (VALUES ${rawEvValues(windows, false)}) AND (a OR t."eventId" = ev."tagId"${orDeclaredSource(false)})`;
    expect(now.strings).toEqual(legacy.strings);
    expect(now.values).toEqual(legacy.values);
  });

  it('avec une source déclarée : 6e colonne, liste des SalesEvent, OR sur le rattachement', () => {
    const windows = [w({ extraSalesEventIds: ['se-pos'] }), w({ id: 'e2' })];
    expect(hasExtraSources(windows)).toBe(true);
    expect(text(Prisma.sql`ev(${rawEvColumns(true)})`)).toContain('"extraSalesEventIds"');
    const values = rawEvValues(windows, true);
    expect(text(values)).toContain('::text[]');
    expect(values.values).toContainEqual(['se-pos']);
    expect(values.values).toContainEqual([]);
    expect(text(Prisma.sql`${orDeclaredSource(true)}`)).toBe(' OR t."eventId" = ANY(ev."extraSalesEventIds")');
  });
});
