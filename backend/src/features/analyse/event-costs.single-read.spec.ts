import { EventCostsService } from './event-costs.service';
import { spaceAccessStub } from '../../core/auth/space-access.testing';

/**
 * Lecture unique des coûts courants (event-costs) : prouve que le résultat est identique à
 * l'ancienne version en deux requêtes (ProductMapping puis MenuItem) et que le nombre de
 * requêtes sur ces deux tables passe de 2 à 1.
 */

type Mapping = { tenantId: string; menuItemId: string };
type Item = { id: string; tenantId: string; totalCost: string | null };

const MAPPINGS: Mapping[] = [
  { tenantId: 't1', menuItemId: 'm1' },
  { tenantId: 't1', menuItemId: 'm1' }, // doublon : l'ancien `distinct` le replie
  { tenantId: 't1', menuItemId: 'm2' },
  { tenantId: 't1', menuItemId: 'm3' }, // coût null : exclu
  { tenantId: 't1', menuItemId: 'mX' }, // article d'un autre tenant : exclu par MenuItem.tenantId
  { tenantId: 't2', menuItemId: 'm4' }, // rattachement d'un autre tenant : exclu
  { tenantId: 't2', menuItemId: 'm1' }, // m1 rattaché aussi par t2 : sans effet sur t1
];
const ITEMS: Item[] = [
  { id: 'm1', tenantId: 't1', totalCost: '5.0000' },
  { id: 'm2', tenantId: 't1', totalCost: '3.5000' },
  { id: 'm3', tenantId: 't1', totalCost: null },
  { id: 'm4', tenantId: 't1', totalCost: '9.0000' }, // article t1 sans aucun rattachement t1 : exclu
  { id: 'm5', tenantId: 't1', totalCost: '1.0000' }, // article t1 sans aucun rattachement : exclu
  { id: 'mX', tenantId: 't9', totalCost: '2.0000' },
];

/** Base simulée : interprète les deux formes de `where` (ancienne par ids, nouvelle par relation). */
function fakePrisma() {
  const calls = { productMapping: 0, menuItem: 0 };
  return {
    calls,
    event: { findMany: jest.fn().mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]) },
    space: { findFirst: jest.fn().mockResolvedValue({ timezone: 'Europe/Paris' }) },
    productMapping: {
      findMany: jest.fn(async ({ where }: any) => {
        calls.productMapping += 1;
        const seen = new Set<string>();
        return MAPPINGS.filter((m) => m.tenantId === where.tenantId)
          .filter((m) => (seen.has(m.menuItemId) ? false : (seen.add(m.menuItemId), true)))
          .map((m) => ({ menuItemId: m.menuItemId }));
      }),
    },
    menuItem: {
      findMany: jest.fn(async ({ where }: any) => {
        calls.menuItem += 1;
        return ITEMS.filter((it) => it.tenantId === where.tenantId)
          .filter((it) => it.totalCost !== null)
          .filter((it) => (where.id?.in ? where.id.in.includes(it.id) : true))
          .filter((it) =>
            where.salesMappings?.some
              ? MAPPINGS.some((m) => m.menuItemId === it.id && m.tenantId === where.salesMappings.some.tenantId)
              : true,
          )
          .map((it) => ({ id: it.id, totalCost: it.totalCost }));
      }),
    },
  };
}

/** Ancienne implémentation (deux lectures en série), conservée ici comme référence. */
async function legacyCurrentCosts(prisma: any, tenantId: string): Promise<Map<string, number>> {
  const mappings = await prisma.productMapping.findMany({ where: { tenantId }, select: { menuItemId: true }, distinct: ['menuItemId'] });
  const ids = mappings.map((m: any) => m.menuItemId);
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const items = await prisma.menuItem.findMany({ where: { id: { in: ids }, tenantId, totalCost: { not: null } }, select: { id: true, totalCost: true } });
  for (const it of items) out.set(it.id, Number(it.totalCost));
  return out;
}

describe('EventCostsService, lecture unique des coûts courants', () => {
  const asOfCosts = { m1: { totalCost: 4, versionAt: '2026-01-01T00:00:00.000Z', source: 'snapshot' } };
  const makeAsOf = () => ({
    costsAsOfMany: jest.fn(async (_t: string, { events }: any) => events.map(({ id }: any) => ({ eventId: id, costs: asOfCosts }))),
  });

  it('même carte de coûts que l ancienne version, avec une requête de moins', async () => {
    const legacyDb = fakePrisma();
    const legacy = await legacyCurrentCosts(legacyDb, 't1');
    expect(legacyDb.calls).toEqual({ productMapping: 1, menuItem: 1 });

    const db = fakePrisma();
    const asOf = makeAsOf();
    const service = new EventCostsService(db as any, spaceAccessStub(), asOf as any);
    const res = await service.getEventCosts('t1', 's1', ['e1', 'e2']);

    // Une seule lecture sur ces deux tables (avant : deux, l'une après l'autre).
    expect(db.calls).toEqual({ productMapping: 0, menuItem: 1 });

    // Mêmes articles que l'ancienne lecture, dans le même ordre, transmis au lecteur de snapshots.
    const sentIds = asOf.costsAsOfMany.mock.calls[0][1].menuItemIds;
    expect(sentIds).toEqual([...legacy.keys()]);
    expect(sentIds).toEqual(['m1', 'm2']);

    // Mêmes coûts qu'avant pour chaque event : snapshot si présent, sinon coût courant.
    for (const eventId of ['e1', 'e2']) {
      expect(Object.keys(res.events[eventId])).toEqual([...legacy.keys()]);
      expect(res.events[eventId].m1).toEqual({ totalCost: 4, source: 'snapshot', versionAt: '2026-01-01T00:00:00.000Z' });
      expect(res.events[eventId].m2).toEqual({ totalCost: legacy.get('m2'), source: 'current', versionAt: null });
    }
    expect(res.unknownEventIds).toEqual([]);
  });

  it('la requête est bornée au tenant, au coût renseigné et aux rattachements du tenant', async () => {
    const db = fakePrisma();
    const service = new EventCostsService(db as any, spaceAccessStub(), makeAsOf() as any);
    await service.getEventCosts('t1', 's1', ['e1']);
    expect(db.menuItem.findMany).toHaveBeenCalledTimes(1);
    expect(db.menuItem.findMany).toHaveBeenCalledWith({
      where: { tenantId: 't1', totalCost: { not: null }, salesMappings: { some: { tenantId: 't1' } } },
      select: { id: true, totalCost: true },
    });
  });

  it('aucun article rattaché : carte vide comme avant, sans lecture de snapshots utile', async () => {
    const db = fakePrisma();
    const asOf = makeAsOf();
    asOf.costsAsOfMany.mockResolvedValue([{ eventId: 'e1', costs: {} }, { eventId: 'e2', costs: {} }]);
    const service = new EventCostsService(db as any, spaceAccessStub(), asOf as any);
    const legacy = await legacyCurrentCosts(fakePrisma(), 't-vide');
    const res = await service.getEventCosts('t-vide', 's1', ['e1', 'e2']);
    expect(legacy.size).toBe(0);
    expect(res.events).toEqual({ e1: {}, e2: {} });
    expect(asOf.costsAsOfMany.mock.calls[0][1].menuItemIds).toEqual([]);
  });
});
