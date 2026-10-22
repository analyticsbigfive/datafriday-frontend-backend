import { CostTrackingSnapshotReaderService } from './cost-tracking-snapshot-reader.service';

const row = (menuItemId: string, at: string, cost: number) => ({
  id: `${menuItemId}-${at}`, menuItemId, effectiveFrom: new Date(at), costPerPiece: String(cost), totalCost: String(cost), numberOfPieces: 1, basePrice: '10', reason: 'baseline',
});

describe('CostTrackingSnapshotReaderService.readAsOf', () => {
  it('replie sur le premier snapshot (baseline) pour les articles sans version antérieure', async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([row('a', '2026-03-01T00:00:00Z', 1)]) // version <= instant
      .mockResolvedValueOnce([row('b', '2026-09-01T00:00:00Z', 2)]); // premier snapshot de b
    const reader = new CostTrackingSnapshotReaderService({ $queryRaw: queryRaw } as any);

    const res = await reader.readAsOf('tn', ['a', 'b', 'c'], new Date('2026-04-01T00:00:00Z'));

    expect(res.get('a')?.source).toBe('snapshot');
    expect(res.get('b')).toMatchObject({ source: 'baseline' });
    expect(res.get('b')?.snapshot.costPerPiece).toBe(2);
    expect(res.has('c')).toBe(false);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('ne lance pas la requête de repli quand tous les articles ont une version', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([row('a', '2026-03-01T00:00:00Z', 1)]);
    const reader = new CostTrackingSnapshotReaderService({ $queryRaw: queryRaw } as any);
    await reader.readAsOf('tn', ['a'], new Date('2026-04-01T00:00:00Z'));
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });
});
