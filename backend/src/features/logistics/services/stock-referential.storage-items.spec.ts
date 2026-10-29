import { StockReferentialService } from './stock-referential.service';
import { LogisticsElementScopeService } from './logistics-element-scope.service';

const mpPaille = { id: 'mp-paille', itemName: 'Paille  Bio', unit: 'box', recipeUnit: 'unit', packedUnits: 100, inventoryPackaging: 'Box' };
const mpBiere = { id: 'mp-biere', itemName: 'Bière', unit: 'L', recipeUnit: null, packedUnits: 24, inventoryPackaging: 'Caisse' };

function build(opts: { inventory: any[]; storageAttrs?: any; recipeItems?: any[]; shopMenuAssignments?: any[] }) {
  const storage = {
    id: 'st-1', name: 'Réserve', type: 'storage', attributes: opts.storageAttrs ?? {},
    floor: null, forecourt: null, externalMerch: null,
    configurationElements: [{ configId: 'cfg-a' }], menuAssignments: [],
  };
  const shop = {
    id: 'shop-1', name: 'Buvette', type: 'shop', attributes: {},
    floor: null, forecourt: null, externalMerch: null,
    configurationElements: [{ configId: 'cfg-a' }],
    menuAssignments: opts.shopMenuAssignments ?? [{ menuItemId: 'mi-1', enabled: true, configId: 'cfg-a' }],
  };
  const prisma: any = {
    spaceElement: { findMany: jest.fn().mockResolvedValue([storage, shop]) },
    menuItem: { findMany: jest.fn().mockResolvedValue([{ id: 'mi-1' }]) },
    elementInventory: { findMany: jest.fn().mockResolvedValue(opts.inventory) },
    marketPrice: { findMany: jest.fn().mockResolvedValue([mpPaille, mpBiere]) },
  };
  const scope = Object.create(LogisticsElementScopeService.prototype) as LogisticsElementScopeService;
  (scope as any).spaceElementScopeWhere = () => ({});
  (scope as any).getProviderByShopElementId = jest.fn().mockResolvedValue(new Map());
  (scope as any).floorGroupIdOf = () => null;
  const recipeItems = opts.recipeItems ?? [
    { name: 'Bière', id: 'mp-biere', kind: 'ingredient', refKind: 'marketPrice', unit: 'L', marketPriceId: 'mp-biere', unitsPerPack: 24, packagingType: 'Caisse', picture: null, usedIn: [{ id: 'mi-1', name: 'Pinte' }] },
  ];
  const recipe: any = {
    recipeSelect: () => ({}),
    loadRecipeContext: jest.fn().mockResolvedValue({}),
    aggregateItems: (menuItems: any[]) => new Map(menuItems.length ? recipeItems.map((i) => [i.name, i]) : []),
  };
  const service = new StockReferentialService(prisma, {} as any, scope, recipe);
  return { service, prisma };
}

const row = (over: any) => ({ elementId: 'st-1', configId: 'cfg-a', name: 'Paille Bio', marketPriceId: null, quantity: 0, minStock: null, maxStock: null, isStored: true, ...over });
const storageItems = (els: any[]) => els.find((e) => e.id === 'st-1').items;

describe('StockReferentialService.getSpaceElementsWithItems : articles de stockage hors recettes', () => {
  it('stockage sans boutique liée + ligne stockée MP : 1 item adossé au Market Price', async () => {
    const { service, prisma } = build({ inventory: [row({})] });
    const items = storageItems(await service.getSpaceElementsWithItems('sp', 't', 'cfg-a'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Paille  Bio', id: 'mp-paille', refKind: 'marketPrice', marketPriceId: 'mp-paille', unitsPerPack: 100, packagingType: 'Box', usedIn: [] });
    expect(prisma.elementInventory.findMany).toHaveBeenCalledTimes(1);
  });

  it('pas de doublon avec un article de recette (nom normalisé)', async () => {
    const { service } = build({
      storageAttrs: { storageShopIds: ['shop-1'] },
      inventory: [row({ name: '  bière ' })],
    });
    const items = storageItems(await service.getSpaceElementsWithItems('sp', 't', 'cfg-a'));
    expect(items.map((i: any) => i.name)).toEqual(['Bière']);
  });

  it('ligne isStored=false absente ; ligne historique (isStored null) stockée si quantité > 0', async () => {
    const { service } = build({
      inventory: [row({ isStored: false }), row({ name: 'Inconnu', isStored: null, quantity: 3 })],
    });
    const items = storageItems(await service.getSpaceElementsWithItems('sp', 't', 'cfg-a'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Inconnu', id: 'custom:inconnu', refKind: null, marketPriceId: null });
  });

  it('scope config : config demandée, repli sur configId null, ignore les autres configs', async () => {
    const inv = [
      row({ configId: 'cfg-b', name: 'Paille Bio' }),
      row({ configId: null, name: 'Inconnu' }),
    ];
    const { service } = build({ inventory: inv });
    const onB = storageItems(await service.getSpaceElementsWithItems('sp', 't', 'cfg-b'));
    expect(onB.map((i: any) => i.id)).toEqual(['mp-paille']);
    const onA = storageItems(await service.getSpaceElementsWithItems('sp', 't', 'cfg-a'));
    expect(onA.map((i: any) => i.id)).toEqual(['custom:inconnu']);
  });

  it('mode agrégé : union de toutes les configs, configIds du stockage complétés', async () => {
    const { service } = build({
      inventory: [row({ configId: 'cfg-b' }), row({ configId: 'cfg-a', name: 'Inconnu' })],
    });
    const els = await service.getSpaceElementsWithItems('sp', 't', undefined, { aggregateAllConfigs: true });
    const st = els.find((e) => e.id === 'st-1')!;
    expect(st.items).toHaveLength(2);
    expect([...(st.configIds ?? [])].sort()).toEqual(['cfg-a', 'cfg-b']);
  });

  it('ligne liée par marketPriceId dont le nom est obsolète : item résolu sur le MP par id, nom actuel du MP', async () => {
    const { service } = build({ inventory: [row({ name: 'Ancien nom de paille', marketPriceId: 'mp-paille' })] });
    const items = storageItems(await service.getSpaceElementsWithItems('sp', 't', 'cfg-a'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Paille  Bio', id: 'mp-paille', marketPriceId: 'mp-paille' });
  });

  it('dédoublonne par marketPriceId : deux lignes (noms différents) sur le même MP donnent un seul item', async () => {
    const { service } = build({
      inventory: [
        row({ name: 'Ancien nom', marketPriceId: 'mp-paille' }),
        row({ name: 'Paille Bio', marketPriceId: null }),
      ],
    });
    const items = storageItems(await service.getSpaceElementsWithItems('sp', 't', 'cfg-a'));
    expect(items.map((i: any) => i.id)).toEqual(['mp-paille']);
  });

  it('MP supprimé (absent de la liste active) : item gardé avec son id grâce au chargement par id', async () => {
    const deleted = { id: 'mp-old', itemName: 'Supprimé', unit: 'kg', recipeUnit: null, packedUnits: null, inventoryPackaging: null };
    const { service, prisma } = build({ inventory: [row({ name: 'Supprimé', marketPriceId: 'mp-old' })] });
    prisma.marketPrice.findMany.mockResolvedValueOnce([mpPaille]).mockResolvedValueOnce([deleted]);
    const items = storageItems(await service.getSpaceElementsWithItems('sp', 't', 'cfg-a'));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'mp-old', marketPriceId: 'mp-old', name: 'Supprimé' });
  });
});


const shopRow = (over: any) => row({ elementId: 'shop-1', ...over });
const shopItems = (els: any[]) => els.find((e) => e.id === 'shop-1')?.items;

describe('StockReferentialService.getSpaceElementsWithItems : produits en tampon sur un PDV', () => {
  it('PDV avec recette + produit en tampon absent des recettes : ajouté, recette inchangée', async () => {
    const { service, prisma } = build({ inventory: [shopRow({ quantity: 5 })] });
    const items = shopItems(await service.getSpaceElementsWithItems('sp', 't', 'cfg-a'));
    expect(items.map((i: any) => i.name)).toEqual(['Bière', 'Paille  Bio']);
    expect(items[1]).toMatchObject({ id: 'mp-paille', marketPriceId: 'mp-paille', usedIn: [] });
    expect(prisma.elementInventory.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.elementInventory.findMany.mock.calls[0][0].where.elementId.in.sort()).toEqual(['shop-1', 'st-1']);
  });

  it('pas de doublon avec un ingrédient de recette (nom normalisé ou marketPriceId)', async () => {
    const { service } = build({
      inventory: [shopRow({ name: '  bière ', quantity: 2 }), shopRow({ name: 'Autre nom', marketPriceId: 'mp-biere', quantity: 2 })],
    });
    const items = shopItems(await service.getSpaceElementsWithItems('sp', 't', 'cfg-a'));
    expect(items.map((i: any) => i.name)).toEqual(['Bière']);
  });

  it('isStored false ou quantité 0 : absent (pas de repli sur min/max)', async () => {
    const { service } = build({
      inventory: [
        shopRow({ quantity: 5, isStored: false }),
        shopRow({ name: 'Inconnu', quantity: 0, isStored: true, minStock: 2 }),
      ],
    });
    const items = shopItems(await service.getSpaceElementsWithItems('sp', 't', 'cfg-a'));
    expect(items.map((i: any) => i.name)).toEqual(['Bière']);
  });

  it('PDV sans menu activé mais avec un tampon : affiché ; sans tampon : masqué', async () => {
    const withBuffer = build({ shopMenuAssignments: [], inventory: [shopRow({ quantity: 3 })] });
    const items = shopItems(await withBuffer.service.getSpaceElementsWithItems('sp', 't', 'cfg-a'));
    expect(items.map((i: any) => i.id)).toEqual(['mp-paille']);
    const without = build({ shopMenuAssignments: [], inventory: [shopRow({ quantity: 0 })] });
    expect(shopItems(await without.service.getSpaceElementsWithItems('sp', 't', 'cfg-a'))).toBeUndefined();
  });

  it('mode agrégé : union des configs, configIds du PDV complétés', async () => {
    const { service } = build({
      inventory: [shopRow({ configId: 'cfg-b', quantity: 1 }), shopRow({ configId: 'cfg-a', name: 'Inconnu', quantity: 1 })],
    });
    const els = await service.getSpaceElementsWithItems('sp', 't', undefined, { aggregateAllConfigs: true });
    const shop = els.find((e) => e.id === 'shop-1')!;
    expect(shop.items).toHaveLength(3);
    expect([...(shop.configIds ?? [])].sort()).toEqual(['cfg-a', 'cfg-b']);
  });

  it('stockage lié inchangé : n\'hérite pas du tampon du PDV', async () => {
    const { service } = build({ storageAttrs: { storageShopIds: ['shop-1'] }, inventory: [shopRow({ quantity: 5 })] });
    const items = storageItems(await service.getSpaceElementsWithItems('sp', 't', 'cfg-a'));
    expect(items.map((i: any) => i.name)).toEqual(['Bière']);
  });
});
