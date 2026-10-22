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

describe('CostTrackingSnapshotReaderService.readAsOfMany', () => {
  const at = (iso: string) => new Date(iso);

  it('résout chaque instant en mémoire comme readAsOf, avec une requête de versions et une de repli', async () => {
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([
        row('a', '2026-03-01T00:00:00Z', 1),
        row('a', '2026-05-01T00:00:00Z', 2),
        row('b', '2026-04-15T00:00:00Z', 3),
      ])
      .mockResolvedValueOnce([row('b', '2026-04-15T00:00:00Z', 3)]); // repli : b n'a rien avant le 1er avril
    const reader = new CostTrackingSnapshotReaderService({ $queryRaw: queryRaw } as any);

    const res = await reader.readAsOfMany('tn', ['a', 'b', 'c'], [at('2026-04-01T00:00:00Z'), at('2026-06-01T00:00:00Z'), at('2026-04-01T00:00:00Z')]);

    const early = res.get(at('2026-04-01T00:00:00Z').getTime())!;
    const late = res.get(at('2026-06-01T00:00:00Z').getTime())!;
    expect(early.get('a')).toMatchObject({ source: 'snapshot', snapshot: { costPerPiece: 1 } });
    expect(early.get('b')).toMatchObject({ source: 'baseline', snapshot: { costPerPiece: 3 } });
    expect(late.get('a')).toMatchObject({ source: 'snapshot', snapshot: { costPerPiece: 2 } });
    expect(late.get('b')).toMatchObject({ source: 'snapshot', snapshot: { costPerPiece: 3 } });
    expect(early.has('c')).toBe(false);
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('un snapshot daté exactement de l instant est retenu (<=)', async () => {
    const queryRaw = jest.fn().mockResolvedValueOnce([row('a', '2026-04-01T00:00:00Z', 7)]);
    const reader = new CostTrackingSnapshotReaderService({ $queryRaw: queryRaw } as any);
    const res = await reader.readAsOfMany('tn', ['a'], [at('2026-04-01T00:00:00Z')]);
    expect(res.get(at('2026-04-01T00:00:00Z').getTime())!.get('a')?.source).toBe('snapshot');
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('sans article ou sans instant : aucune requête', async () => {
    const queryRaw = jest.fn();
    const reader = new CostTrackingSnapshotReaderService({ $queryRaw: queryRaw } as any);
    await reader.readAsOfMany('tn', [], [at('2026-04-01T00:00:00Z')]);
    await reader.readAsOfMany('tn', ['a'], []);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
