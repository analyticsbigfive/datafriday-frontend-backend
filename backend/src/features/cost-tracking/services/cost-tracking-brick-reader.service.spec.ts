import { CostTrackingBrickReaderService } from './cost-tracking-brick-reader.service';

const row = (id: string, refId: string, at: string, cost: number) => ({
  id, kind: 'ingredient', refId, name: refId, unitCost: String(cost), recipeUnit: 'kg', supplierId: 's1', supplierName: 'Metro', marketPriceId: null,
  effectiveFrom: new Date(at), reason: 'baseline',
});

describe('CostTrackingBrickReaderService.readForPeriod', () => {
  it('regroupe par brique : version reportée puis changements de la période', async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([row('a', 'i1', '2026-09-01T00:00:00Z', 2)])
      .mockResolvedValueOnce([row('b', 'i1', '2026-10-10T00:00:00Z', 3), row('c', 'i2', '2026-10-12T00:00:00Z', 5)]);
    const reader = new CostTrackingBrickReaderService({ $queryRaw: queryRaw } as any);

    const res = await reader.readForPeriod('tn', 'ingredient', ['i1', 'i2', 'i1'], new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z'));

    expect(res.get('i1')?.map((p) => [p.id, p.unitCost])).toEqual([['a', 2], ['b', 3]]);
    expect(res.get('i2')?.map((p) => p.id)).toEqual(['c']);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('ne lit rien sans identifiant', async () => {
    const queryRaw = jest.fn();
    const reader = new CostTrackingBrickReaderService({ $queryRaw: queryRaw } as any);
    expect((await reader.readForPeriod('tn', 'component', [], new Date(), new Date())).size).toBe(0);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
