import { CostTrackingSeriesService } from './cost-tracking-series.service';
import { SeriesPoint, SnapshotPoint } from '../cost-tracking.types';

const article = (id: string, name: string, typeId = 't1', categoryId = 'c1') => ({
  id, name, typeId, typeName: 'Food', categoryId, categoryName: categoryId === 'c1' ? 'Burgers' : 'Frites',
});
const pt = (at: string, costPerPiece: number, extra: Partial<SeriesPoint> = {}): SeriesPoint => ({ at, costPerPiece, price: 10, articleCount: 1, carried: false, ...extra });
const snap = (menuItemId: string, at: string, cost: number): SnapshotPoint => ({
  id: `${menuItemId}-${at}`, menuItemId, effectiveFrom: new Date(at), costPerPiece: cost, totalCost: cost, numberOfPieces: 1, basePrice: 10, reason: 'market_price',
});

function build(articles: any[], snaps: Record<string, SnapshotPoint[]>, revenue: Record<string, number> = {}, scope: any = { articles, bricks: [] }, shareSeries: Record<string, Record<string, SeriesPoint[]>> = {}) {
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
    tenantDefaultVatRate: jest.fn().mockResolvedValue(10),
    readForPeriod: jest.fn().mockImplementation(async (_t: string, ids: string[]) => new Map(ids.map((id) => [id, snaps[id] ?? []]))),
  };
  const brickScope: any = { resolve: jest.fn().mockResolvedValue(scope) };
  const shares: any = {
    articleShares: jest.fn().mockImplementation(async (_t: string, ids: string[]) =>
      new Map(ids.map((id) => [id, new Map(Object.entries(shareSeries[id] ?? {}).map(([k, points]) => [k, { name: k, points }]))]))),
  };
  return { service: new CostTrackingSeriesService(catalog, events, revenueSvc, reader, brickScope, shares), revenueSvc, reader, catalog, brickScope, shares };
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

  const brick = (refId: string, kind: 'ingredient' | 'packaging' | 'component', supplierKey: string | null, costs: Array<[string, number]>) => ({
    kind, refId, name: `B ${refId}`, articleIds: ['m1'], supplierKey, supplierName: supplierKey ? `Fourn ${supplierKey}` : null,
    versions: costs.map(([at, unitCost], i) => ({
      id: `${refId}-${i}`, kind, refId, name: `B ${refId}`, unitCost, recipeUnit: 'kg', supplierId: supplierKey, supplierName: null,
      marketPriceId: null, effectiveFrom: new Date(at), reason: 'market_price',
    })),
  });

  it('resolveGroupBy garde supplier, component et ingredient sans article', () => {
    const { service } = build([], {});
    expect(service.resolveGroupBy({ groupBy: 'supplier' })).toBe('supplier');
    expect(service.resolveGroupBy({ groupBy: 'component' })).toBe('component');
    expect(service.resolveGroupBy({ groupBy: 'ingredient' })).toBe('ingredient');
  });

  const supplierScope = (entries: Array<[string, string[]]>) => new Map(entries.map(([key, ids]) => [key, { key, name: `Fourn ${key}`, articleIds: new Set(ids), brickKeys: new Set<string>() }]));

  it('mode fournisseur : part de coût de chaque article chez le fournisseur, moyenne et panier constant', async () => {
    const arts = [article('m1', 'Burger'), article('m2', 'Wrap')];
    const scope = { articles: arts, bricks: [], suppliers: supplierScope([['s1', ['m1', 'm2']], ['s2', ['m1']]]), versions: new Map(), leaves: new Map() };
    const { service, shares } = build(arts, {}, {}, scope, {
      m1: { s1: [pt('2026-04-01T00:00:00.000Z', 1.1), pt('2026-05-01T00:00:00.000Z', 1.3)], s2: [pt('2026-04-01T00:00:00.000Z', 0.5)] },
      m2: { s1: [pt('2026-04-01T00:00:00.000Z', 0.5)] },
    });
    const res = await service.getSeries('tn', 'sp', { groupBy: 'supplier' });

    expect(res.groupBy).toBe('supplier');
    expect(res.lines.map((l) => l.id)).toEqual(['s1', 's2']);
    const s1 = res.lines[0];
    expect(s1.points.map((p) => p.costPerPiece)).toEqual([0.8, 0.9]);
    expect(s1.basket).toMatchObject({ startCost: 0.8, endCost: 0.9, articleCount: 2 });
    expect(s1.articleCount).toBe(2);
    expect(shares.articleShares.mock.calls[0][1].sort()).toEqual(['m1', 'm2']);
    const sum = await service.getSeries('tn', 'sp', { groupBy: 'supplier', aggregate: 'sum' });
    expect(sum.lines[0].points.map((p) => p.costPerPiece)).toEqual([1.6, 1.8]);
  });

  it('mode fournisseur avec filtre Fournisseur : une seule ligne', async () => {
    const arts = [article('m1', 'Burger')];
    const scope = { articles: arts, bricks: [], suppliers: supplierScope([['s1', ['m1']], ['s2', ['m1']]]), versions: new Map(), leaves: new Map() };
    const { service, brickScope } = build(arts, {}, {}, scope, { m1: { s1: [pt('2026-04-01T00:00:00.000Z', 1)], s2: [pt('2026-04-01T00:00:00.000Z', 2)] } });
    const res = await service.getSeries('tn', 'sp', { groupBy: 'supplier', supplierKey: 's2' });
    expect(brickScope.resolve.mock.calls[0][2]).toMatchObject({ supplierKey: 's2' });
    expect(res.lines.map((l) => l.id)).toEqual(['s2']);
  });

  it('mode fournisseur : plafond de 10 lignes, classées par CA des articles concernés', async () => {
    const arts = Array.from({ length: 12 }, (_, i) => article(`m${i}`, `Art ${i}`));
    const scope = { articles: arts, bricks: [], suppliers: supplierScope(arts.map((a): [string, string[]] => [`s${a.id}`, [a.id]])), versions: new Map(), leaves: new Map() };
    const series = Object.fromEntries(arts.map((a) => [a.id, { [`s${a.id}`]: [pt('2026-04-01T00:00:00.000Z', 1)] }]));
    const revenue = Object.fromEntries(arts.map((a, i) => [a.id, (i + 1) * 100]));
    const { service, shares } = build(arts, {}, revenue, scope, series);
    const res = await service.getSeries('tn', 'sp', { groupBy: 'supplier' });
    expect(res.lines).toHaveLength(10);
    expect(res.lines[0].id).toBe('sm11');
    expect(res.truncated).toBe(true);
    expect(res.rankedByRevenue).toBe(true);
    expect(shares.articleShares.mock.calls[0][1]).toHaveLength(10);
  });

  it('mode composant : plafond de 10 lignes et tri par CA comme le mode article', async () => {
    const bricks = Array.from({ length: 12 }, (_, i) => ({ ...brick(`c${i}`, 'component', 's1', [['2026-04-01T00:00:00Z', 5]]), articleIds: [`m${i}`] }));
    const arts = bricks.map((b, i) => article(`m${i}`, `Art ${i}`));
    const revenue = Object.fromEntries(arts.map((a, i) => [a.id, (i + 1) * 100]));
    const { service } = build(arts, {}, revenue, { articles: arts, bricks });
    const res = await service.getSeries('tn', 'sp', { groupBy: 'component' });
    expect(res.lines).toHaveLength(10);
    expect(res.lines[0].id).toBe('c11');
    expect(res.truncated).toBe(true);
    expect(res.rankedByRevenue).toBe(true);
    const one = await service.getSeries('tn', 'sp', { groupBy: 'component', componentId: 'c2' });
    expect(one.truncated).toBe(false);
    expect(one.lines.map((l) => l.id)).toEqual(['c2']);
  });

  it('mode composant : ne garde que les composants, filtrés par componentId', async () => {
    const bricks = [
      brick('c1', 'component', 's1', [['2026-04-01T00:00:00Z', 5]]),
      brick('c2', 'component', 's1', [['2026-04-01T00:00:00Z', 6]]),
      brick('i1', 'ingredient', 's1', [['2026-04-01T00:00:00Z', 2]]),
    ];
    const { service } = build([article('m1', 'Burger')], {}, {}, { articles: [article('m1', 'Burger')], bricks });
    const all = await service.getSeries('tn', 'sp', { groupBy: 'component' });
    expect(all.lines.map((l) => l.id)).toEqual(['c1', 'c2']);
    const one = await service.getSeries('tn', 'sp', { groupBy: 'component', componentId: 'c2' });
    expect(one.lines.map((l) => l.id)).toEqual(['c2']);
  });

  it('mode ingrédient sur le périmètre : ingrédients et emballages ensemble, avec lineKind', async () => {
    const bricks = [
      brick('i1', 'ingredient', 's1', [['2026-04-01T00:00:00Z', 2]]),
      brick('p1', 'packaging', 's1', [['2026-04-01T00:00:00Z', 1]]),
      brick('c1', 'component', 's1', [['2026-04-01T00:00:00Z', 5]]),
    ];
    const { service } = build([article('m1', 'Burger')], {}, {}, { articles: [article('m1', 'Burger')], bricks });
    const res = await service.getSeries('tn', 'sp', { groupBy: 'ingredient' });
    expect(res.lines.map((l) => [l.id, l.lineKind])).toEqual([['i1', 'ingredient'], ['p1', 'packaging']]);
  });

  it('filtre Fournisseur en mode article : le coût affiché est la part du fournisseur', async () => {
    const kept = [article('m1', 'Burger')];
    const { service, brickScope, reader, shares } = build([article('m1', 'Burger'), article('m2', 'Frites')], { m1: [snap('m1', '2026-04-01T00:00:00Z', 2.4)] }, {}, { articles: kept, bricks: [], suppliers: new Map(), versions: new Map(), leaves: new Map() }, {
      m1: { s1: [pt('2026-04-01T00:00:00.000Z', 1.1)] },
    });
    const res = await service.getSeries('tn', 'sp', { supplierKey: 's1' });
    expect(brickScope.resolve.mock.calls[0][5]).toBe(false);
    expect(res.lines.map((l) => l.id)).toEqual(['m1']);
    expect(res.lines[0].points[0].costPerPiece).toBe(1.1);
    expect(shares.articleShares.mock.calls[0][1]).toEqual(['m1']);
    expect(reader.readForPeriod).not.toHaveBeenCalled();
  });

  it('filtre Fournisseur en mode catégorie : les groupes agrègent les parts', async () => {
    const arts = [article('m1', 'Cheese', 't1', 'c1'), article('m2', 'Bacon', 't1', 'c1')];
    const { service } = build(arts, {}, {}, { articles: arts, bricks: [], suppliers: new Map(), versions: new Map(), leaves: new Map() }, {
      m1: { s1: [pt('2026-04-01T00:00:00.000Z', 1)] }, m2: { s1: [pt('2026-04-01T00:00:00.000Z', 0.5)] },
    });
    const res = await service.getSeries('tn', 'sp', { typeId: 't1', supplierKey: 's1', aggregate: 'sum' });
    expect(res.groupBy).toBe('category');
    expect(res.lines[0].points[0].costPerPiece).toBe(1.5);
  });

  it('sans filtre Fournisseur ni Composant, le mode article ne touche pas aux briques', async () => {
    const { service, brickScope } = build([article('m1', 'Burger')], {});
    await service.getSeries('tn', 'sp', {});
    expect(brickScope.resolve).not.toHaveBeenCalled();
  });
});
