import { CostTrackingSeriesService } from './cost-tracking-series.service';
import { SnapshotPoint } from '../cost-tracking.types';

const article = (id: string, name: string, typeId = 't1', categoryId = 'c1') => ({
  id, name, typeId, typeName: 'Food', categoryId, categoryName: categoryId === 'c1' ? 'Burgers' : 'Frites',
});
const snap = (menuItemId: string, at: string, cost: number): SnapshotPoint => ({
  id: `${menuItemId}-${at}`, menuItemId, effectiveFrom: new Date(at), costPerPiece: cost, totalCost: cost, numberOfPieces: 1, basePrice: 10, reason: 'market_price',
});

function build(articles: any[], snaps: Record<string, SnapshotPoint[]>, revenue: Record<string, number> = {}) {
  const catalog: any = { listArticles: jest.fn().mockResolvedValue(articles) };
  const events: any = {
    resolvePeriod: jest.fn().mockResolvedValue({ fromDay: '2026-03-01', toDay: '2026-06-30', from: new Date('2026-03-01T00:00:00Z'), toExclusive: new Date('2026-07-01T00:00:00Z'), timezone: 'Europe/Paris' }),
    listEvents: jest.fn().mockResolvedValue([{ id: 'e1', name: 'A vs B', eventDate: '2026-04-10', referenceAt: '2026-04-10T00:00:00.000Z', referenceSource: 'midnight' }]),
  };
  const revenueSvc: any = {
    revenueByItem: jest.fn().mockResolvedValue({ byItem: new Map(Object.entries(revenue).map(([k, v]) => [k, { revenueHt: v, quantity: 1 }])), considered: 1 }),
  };
  const reader: any = {
    trackingStartedAt: jest.fn().mockResolvedValue(new Date('2026-01-01T00:00:00Z')),
    readForPeriod: jest.fn().mockImplementation(async (_t: string, ids: string[]) => new Map(ids.map((id) => [id, snaps[id] ?? []]))),
  };
  return { service: new CostTrackingSeriesService(catalog, events, revenueSvc, reader), revenueSvc, reader, catalog };
}

describe('CostTrackingSeriesService', () => {
  it('resolveGroupBy déduit le mode des filtres', () => {
    const { service } = build([], {});
    expect(service.resolveGroupBy({})).toBe('article');
    expect(service.resolveGroupBy({ typeId: 't1' })).toBe('category');
    expect(service.resolveGroupBy({ categoryId: 'c1' })).toBe('article');
    expect(service.resolveGroupBy({ typeId: 't1', groupBy: 'type' })).toBe('type');
  });

  it('sans filtre, garde les 10 articles au plus gros CA, classés par CA décroissant', async () => {
    const articles = Array.from({ length: 12 }, (_, i) => article(`m${i}`, `Art ${i}`));
    const revenue = Object.fromEntries(articles.map((a, i) => [a.id, (i + 1) * 100]));
    const { service, reader } = build(articles, {}, revenue);

    const res = await service.getSeries('tn', 'sp', {});

    expect(res.lines).toHaveLength(10);
    expect(res.lines[0].id).toBe('m11');
    expect(res.lines.map((l) => l.id)).not.toContain('m0');
    expect(res.truncated).toBe(true);
    expect(res.rankedByRevenue).toBe(true);
    expect(reader.readForPeriod.mock.calls[0][1]).toHaveLength(10);
    expect(res.events).toHaveLength(1);
  });

  it('un article filtré ne déclenche aucune lecture de CA', async () => {
    const { service, revenueSvc } = build([article('m1', 'Burger')], { m1: [snap('m1', '2026-04-01T00:00:00Z', 2)] });
    const res = await service.getSeries('tn', 'sp', { menuItemId: 'm1' });
    expect(revenueSvc.revenueByItem).not.toHaveBeenCalled();
    expect(res.lines[0].points).toHaveLength(1);
    expect(res.trackingStartedAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('mode catégorie : moyenne simple des articles actifs, sans lecture de CA', async () => {
    const articles = [article('m1', 'Cheese', 't1', 'c1'), article('m2', 'Bacon', 't1', 'c1'), article('m3', 'Fries', 't1', 'c2')];
    const snaps = {
      m1: [snap('m1', '2026-04-01T00:00:00Z', 2)],
      m2: [snap('m2', '2026-04-01T00:00:00Z', 4)],
      m3: [snap('m3', '2026-04-01T00:00:00Z', 1)],
    };
    const { service, revenueSvc } = build(articles, snaps);
    const res = await service.getSeries('tn', 'sp', { typeId: 't1' });

    expect(res.groupBy).toBe('category');
    expect(revenueSvc.revenueByItem).not.toHaveBeenCalled();
    const burgers = res.lines.find((l) => l.id === 'c1')!;
    expect(burgers.articleCount).toBe(2);
    expect(burgers.points[0].costPerPiece).toBe(3);
  });

  it('aucune vente sur la période : repli alphabétique sur 10 articles, non classé', async () => {
    const articles = Array.from({ length: 11 }, (_, i) => article(`m${i}`, `Art ${String(i).padStart(2, '0')}`));
    const { service } = build(articles, {});
    const res = await service.getSeries('tn', 'sp', {});
    expect(res.lines).toHaveLength(10);
    expect(res.rankedByRevenue).toBe(false);
    expect(res.lines[0].name).toBe('Art 00');
  });
});
