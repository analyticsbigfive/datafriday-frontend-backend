import { capLines, MAX_ARTICLE_LINES } from './cost-tracking-line-cap.util';

const lines = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `L${String(i).padStart(2, '0')}`, articleIds: [`m${i}`] }));

describe('capLines', () => {
  it('tout garder jusqu au plafond', () => {
    const res = capLines(lines(MAX_ARTICLE_LINES), new Map());
    expect(res).toMatchObject({ truncated: false, ranked: false });
    expect(res.selected).toHaveLength(MAX_ARTICLE_LINES);
  });

  it('au dessus : classe par CA cumulé des articles de la ligne', () => {
    const l = lines(12);
    l[0].articleIds.push('m1');
    const res = capLines(l, new Map(l.map((x, i) => [x.articleIds[0], (i + 1) * 10])));
    expect(res.truncated).toBe(true);
    expect(res.ranked).toBe(true);
    expect(res.selected[0].name).toBe('L11');
    expect(res.selected).toHaveLength(10);
  });

  it('sans vente : repli alphabétique, non classé', () => {
    const res = capLines(lines(12).reverse(), new Map());
    expect(res.ranked).toBe(false);
    expect(res.selected[0].name).toBe('L00');
    expect(res.truncated).toBe(true);
  });
});
