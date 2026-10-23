import { CostTrackingBrickScopeService } from './cost-tracking-brick-scope.service';
import { BrickKind, RecipeLine } from '../cost-tracking.types';

const line = (kind: RecipeLine['kind'], refId: string): RecipeLine => ({ kind, refId, name: `N ${refId}`, quantity: 1, unitCost: 1 });
const art = (id: string) => ({ id, name: id, typeId: 't', typeName: 'T', categoryId: 'c', categoryName: 'C' });
const pt = (kind: BrickKind, refId: string, supplierId: string | null, supplierName: string | null = null) => ({
  id: `${kind}-${refId}`, kind, refId, name: `N ${refId}`, unitCost: 1, recipeUnit: null, supplierId, supplierName, marketPriceId: null,
  effectiveFrom: new Date('2026-04-01T00:00:00Z'), reason: 'baseline',
});

function build() {
  const recipes: any = {
    latestRecipes: jest.fn().mockResolvedValue(new Map([
      ['m1', [line('ingredient', 'i1'), line('component', 'c1')]],
      ['m2', [line('ingredient', 'i2')]],
      ['m3', [line('component', 'c1'), line('ingredient', 'i2')]],
    ])),
  };
  const bricks: any = {
    readForPeriod: jest.fn().mockImplementation(async (_t: string, kind: BrickKind, ids: string[]) =>
      new Map(ids.map((id) => [id, [pt(kind, id, id === 'i2' ? 's2' : id === 'i3' ? 's3' : 's1', id === 'i2' ? 'Promocash' : id === 'i3' ? 'Sysco' : 'Metro')]]))),
    latestForBricks: jest.fn().mockImplementation(async (_t: string, kind: BrickKind, ids: string[]) =>
      new Map(ids.map((id) => [id, pt(kind, id, id === 'i2' ? 's2' : 's1', id === 'i2' ? 'Promocash' : 'Metro')]))),
  };
  const graph: any = { leavesFor: jest.fn().mockResolvedValue(new Map([['c1', [{ ingredientId: 'i3', share: 1 }]]])) };
  return { service: new CostTrackingBrickScopeService(recipes, bricks, graph), recipes, bricks, graph };
}
const from = new Date('2026-04-01T00:00:00Z');
const to = new Date('2026-07-01T00:00:00Z');
const all = [art('m1'), art('m2'), art('m3')];

describe('CostTrackingBrickScopeService.resolve', () => {
  it('sans filtre : toutes les briques des recettes, versions lues par nature', async () => {
    const { service, bricks } = build();
    const res = await service.resolve('tn', all, {}, from, to);
    expect(res.articles).toHaveLength(3);
    expect(res.bricks.map((b) => b.refId).sort()).toEqual(['c1', 'i1', 'i2']);
    expect(bricks.readForPeriod).toHaveBeenCalledTimes(2);
  });

  it('filtre Composant : seuls les articles qui contiennent le composant, et leurs briques', async () => {
    const { service } = build();
    const res = await service.resolve('tn', all, { componentId: 'c1' }, from, to);
    expect(res.articles.map((a) => a.id)).toEqual(['m1', 'm3']);
    expect(res.bricks.map((b) => b.refId).sort()).toEqual(['c1', 'i1', 'i2']);
    const none = await service.resolve('tn', all, { componentId: 'zz' }, from, to);
    expect(none.articles).toEqual([]);
    expect(none.bricks).toEqual([]);
  });

  it('filtre Fournisseur : articles qui utilisent le fournisseur, ingrédients des composants compris', async () => {
    const { service } = build();
    const res = await service.resolve('tn', all, { supplierKey: 's2' }, from, to, false);
    expect(res.bricks.map((b) => b.refId)).toEqual(['i2']);
    expect(res.articles.map((a) => a.id)).toEqual(['m2', 'm3']);
    // s3 n'est fourni que par un ingrédient du composant c1 : les articles m1 et m3 le contiennent.
    const viaComponent = await service.resolve('tn', all, { supplierKey: 's3' }, from, to, false);
    expect(viaComponent.articles.map((a) => a.id)).toEqual(['m1', 'm3']);
    expect(viaComponent.bricks.map((b) => b.refId)).toEqual(['c1']);
  });

  it('filtre Fournisseur : un ancien fournisseur de la période compte, pas seulement le dernier', async () => {
    const { service, bricks } = build();
    bricks.readForPeriod.mockImplementation(async (_t: string, kind: BrickKind, ids: string[]) =>
      new Map(ids.map((id) => [id, id === 'i2'
        ? [{ ...pt(kind, id, 's9', 'Ancien'), effectiveFrom: new Date('2026-03-01T00:00:00Z') }, pt(kind, id, 's2', 'Promocash')]
        : [pt(kind, id, 's1', 'Metro')]])));
    const res = await service.resolve('tn', all, { supplierKey: 's9' }, from, to, false);
    expect(res.articles.map((a) => a.id)).toEqual(['m2', 'm3']);
  });

  it('withSuppliers : fournisseurs et composition chargés, versions des ingrédients de composants lues', async () => {
    const { service, bricks } = build();
    const res = await service.resolve('tn', all, {}, from, to, true, true);
    expect([...res.suppliers!.keys()].sort()).toEqual(['s1', 's2', 's3']);
    expect(res.leaves.get('c1')).toEqual([{ ingredientId: 'i3', share: 1 }]);
    expect(res.versions.has('ingredient:i3')).toBe(true);
    expect(bricks.readForPeriod.mock.calls.some((c: any[]) => c[1] === 'ingredient' && c[2].includes('i3'))).toBe(true);
  });

  it('withVersions false sans filtre Fournisseur : aucune lecture de versions', async () => {
    const { service, bricks } = build();
    await service.resolve('tn', all, { componentId: 'c1' }, from, to, false);
    expect(bricks.readForPeriod).not.toHaveBeenCalled();
  });
});

describe('CostTrackingBrickScopeService.getOptions', () => {
  it('liste les fournisseurs de la période (composition comprise) et les composants du périmètre', async () => {
    const { service, bricks } = build();
    const res = await service.getOptions('tn', 'sp', all, from, to);
    expect(res.suppliers.map((s) => [s.key, s.name])).toEqual([['s1', 'Metro'], ['s2', 'Promocash'], ['s3', 'Sysco']]);
    expect(res.components).toEqual([{ id: 'c1', name: 'N c1', articleCount: 2 }]);
    expect(bricks.readForPeriod.mock.calls[0][3]).toBe(from);
  });
});
