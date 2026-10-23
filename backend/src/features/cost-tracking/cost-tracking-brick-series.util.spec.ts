import { buildBrickPoints, buildBrickSeries, buildSupplierChanges } from './cost-tracking-brick-series.util';
import { averageStaircase } from './cost-tracking-series.util';
import { BrickSnapshotPoint } from './cost-tracking.types';

const snap = (id: string, refId: string, at: string, unitCost: number, supplierId: string | null = 's1', supplierName: string | null = 'Metro'): BrickSnapshotPoint => ({
  id, kind: 'ingredient', refId, name: `Brique ${refId}`, unitCost, recipeUnit: 'kg', supplierId, supplierName, marketPriceId: null,
  effectiveFrom: new Date(at), reason: 'market_price',
});

const from = new Date('2026-10-01T00:00:00Z');

describe('buildBrickPoints', () => {
  it('reporte la version d\'avant la période à `from` puis ajoute les changements de coût', () => {
    const points = buildBrickPoints([
      snap('a', 'i1', '2026-09-01T00:00:00Z', 2),
      snap('b', 'i1', '2026-10-10T00:00:00Z', 3),
    ], from);
    expect(points.map((p) => [p.at, p.costPerPiece, p.carried])).toEqual([
      ['2026-10-01T00:00:00.000Z', 2, true],
      ['2026-10-10T00:00:00.000Z', 3, false],
    ]);
    expect(points[1]).toMatchObject({ snapshotId: 'b', reason: 'market_price' });
  });

  it('ignore une version qui ne change que le fournisseur', () => {
    const points = buildBrickPoints([
      snap('a', 'i1', '2026-09-01T00:00:00Z', 2, 's1', 'Metro'),
      snap('b', 'i1', '2026-10-10T00:00:00Z', 2, 's2', 'Promocash'),
    ], from);
    expect(points).toHaveLength(1);
  });
});

describe('buildBrickSeries et moyenne', () => {
  it('omet les briques sans point et alimente averageStaircase', () => {
    const series = buildBrickSeries(new Map([
      ['i1', [snap('a', 'i1', '2026-09-01T00:00:00Z', 2), snap('b', 'i1', '2026-10-10T00:00:00Z', 4)]],
      ['i2', [snap('c', 'i2', '2026-09-15T00:00:00Z', 6)]],
      ['i3', []],
    ]), from);
    expect([...series.keys()]).toEqual(['i1', 'i2']);

    const avg = averageStaircase([...series.values()]);
    expect(avg.map((p) => [p.at, p.costPerPiece])).toEqual([
      ['2026-10-01T00:00:00.000Z', 4],
      ['2026-10-10T00:00:00.000Z', 5],
    ]);
  });
});

describe('buildSupplierChanges', () => {
  it('liste les changements de fournisseur dans la période, comparés à la version reportée', () => {
    const changes = buildSupplierChanges(new Map([
      ['i1', [
        snap('a', 'i1', '2026-09-01T00:00:00Z', 2, 's1', 'Metro'),
        snap('b', 'i1', '2026-10-10T00:00:00Z', 2, 's2', 'Promocash'),
        snap('c', 'i1', '2026-10-20T00:00:00Z', 3, 's2', 'Promocash'),
      ]],
      ['i2', [snap('d', 'i2', '2026-08-01T00:00:00Z', 1, 's1', 'Metro'), snap('e', 'i2', '2026-09-01T00:00:00Z', 1, 's3', 'Autre')]],
    ]), from);
    expect(changes).toEqual([
      expect.objectContaining({ refId: 'i1', at: '2026-10-10T00:00:00.000Z', fromSupplierName: 'Metro', toSupplierName: 'Promocash', snapshotId: 'b' }),
    ]);
  });
});
