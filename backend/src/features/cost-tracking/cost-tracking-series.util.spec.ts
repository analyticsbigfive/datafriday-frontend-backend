import { averageStaircase, buildArticlePoints } from './cost-tracking-series.util';
import { SnapshotPoint } from './cost-tracking.types';

const snap = (id: string, at: string, cost: number, price: number | null = 10, menuItemId = 'a'): SnapshotPoint => ({
  id, menuItemId, effectiveFrom: new Date(at), costPerPiece: cost, totalCost: cost * 2, numberOfPieces: 2, basePrice: price, reason: 'market_price',
});
const FROM = new Date('2026-03-01T00:00:00Z');

describe('buildArticlePoints', () => {
  it('ramène le dernier snapshot antérieur à from au début de la période (carried)', () => {
    const pts = buildArticlePoints([snap('s0', '2026-01-01T00:00:00Z', 1), snap('s1', '2026-04-01T00:00:00Z', 1.5)], FROM);
    expect(pts.map((p) => [p.at, p.costPerPiece, p.carried])).toEqual([
      [FROM.toISOString(), 1, true],
      ['2026-04-01T00:00:00.000Z', 1.5, false],
    ]);
  });

  it('ne garde que le dernier de deux snapshots antérieurs à from', () => {
    const pts = buildArticlePoints([snap('s0', '2026-01-01T00:00:00Z', 1), snap('s1', '2026-02-01T00:00:00Z', 2)], FROM);
    expect(pts).toHaveLength(1);
    expect(pts[0]).toMatchObject({ snapshotId: 's1', costPerPiece: 2, carried: true });
  });

  it('ignore une version qui ne change ni le coût par pièce ni le prix', () => {
    const pts = buildArticlePoints([snap('s1', '2026-04-01T00:00:00Z', 1), snap('s2', '2026-05-01T00:00:00Z', 1), snap('s3', '2026-06-01T00:00:00Z', 1, 12)], FROM);
    expect(pts.map((p) => p.snapshotId)).toEqual(['s1', 's3']);
  });

  it('sans snapshot antérieur, la série commence à la première version', () => {
    const pts = buildArticlePoints([snap('s1', '2026-04-01T00:00:00Z', 1)], FROM);
    expect(pts[0]).toMatchObject({ at: '2026-04-01T00:00:00.000Z', carried: false });
  });
});

describe('averageStaircase', () => {
  it('moyenne simple du coût par pièce, un membre sans valeur n entre pas dans la moyenne', () => {
    const a = buildArticlePoints([snap('a1', '2026-04-01T00:00:00Z', 1, 10, 'a')], FROM);
    const b = buildArticlePoints([snap('b1', '2026-05-01T00:00:00Z', 3, 20, 'b')], FROM);
    const avg = averageStaircase([a, b]);
    expect(avg.map((p) => [p.at, p.costPerPiece, p.price, p.articleCount])).toEqual([
      ['2026-04-01T00:00:00.000Z', 1, 10, 1],
      ['2026-05-01T00:00:00.000Z', 2, 15, 2],
    ]);
  });

  it('un changement d un seul membre déplace la moyenne', () => {
    const a = buildArticlePoints([snap('a0', '2026-01-01T00:00:00Z', 2, 10, 'a'), snap('a1', '2026-04-01T00:00:00Z', 4, 10, 'a')], FROM);
    const b = buildArticlePoints([snap('b0', '2026-01-01T00:00:00Z', 2, 10, 'b')], FROM);
    const avg = averageStaircase([a, b]);
    expect(avg.map((p) => p.costPerPiece)).toEqual([2, 3]);
    expect(avg[0].carried).toBe(true);
  });

  it('retourne [] sans aucun membre avec historique', () => {
    expect(averageStaircase([[], []])).toEqual([]);
  });
});
