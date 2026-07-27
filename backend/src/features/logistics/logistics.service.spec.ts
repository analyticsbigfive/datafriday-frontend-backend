import { Test, TestingModule } from '@nestjs/testing';
import { LogisticsService } from './logistics.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('LogisticsService — readyForSale display logic', () => {
  let service: any;

  const mockPrisma: any = {
    menuItem: { findMany: jest.fn(), findFirst: jest.fn() },
    menuComponent: { findMany: jest.fn() },
    marketPrice: { findMany: jest.fn(), findFirst: jest.fn() },
    spaceElement: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  };

  // itemRefsCache/componentRefsCache/perUnitCache : caches par requête ajoutés à
  // RecipeCtx après l'écriture de cette spec — sans eux, `ctx.itemRefsCache.get`
  // jetait TypeError (10 tests cassés).
  const emptyCtx = () => ({
    comboByName: new Map(),
    mpByName: new Map(),
    componentById: new Map(),
    itemRefsCache: new Map(),
    componentRefsCache: new Map(),
    perUnitCache: new Map(),
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [LogisticsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get<LogisticsService>(LogisticsService);
    jest.clearAllMocks();
  });

  describe('itemRefsForMenuItem — Gap 1 (MenuItem readyForSale=Yes counted as itself)', () => {
    it('uses the MenuItem own inventoryPackagingType/inventoryNumberOfUnits when it is not collapsed to a single ingredient', () => {
      const item = {
        id: 'mi-1',
        name: 'Coca-Cola CAN',
        picture: null,
        readyForSale: 'Yes',
        ingredients: [], // 0 ingredients -> no single-ingredient collapse
        components: [],
        packagings: [],
        inventoryPackagingType: 'Box',
        inventoryNumberOfUnits: 24,
      };

      const refs = service.itemRefsForMenuItem(item, emptyCtx());

      expect(refs).toEqual([
        { key: 'Coca-Cola CAN', id: 'mi-1', kind: 'product', unit: null, marketPriceId: null, unitsPerPack: 24, packagingType: 'Box', picture: null },
      ]);
    });

    it('uses the MenuItem own packaging on the degenerate fallback (no ingredients/components/packagings at all)', () => {
      const item = {
        id: 'mi-2', name: 'Empty Product', picture: null, readyForSale: 'No',
        ingredients: [], components: [], packagings: [],
        inventoryPackagingType: 'Bag', inventoryNumberOfUnits: 10,
      };

      const refs = service.itemRefsForMenuItem(item, emptyCtx());

      expect(refs).toEqual([
        { key: 'Empty Product', id: 'mi-2', kind: 'product', unit: null, marketPriceId: null, unitsPerPack: 10, packagingType: 'Bag', picture: null },
      ]);
    });
  });

  describe('componentRefsForComponent — Gap 2 (Component own readyForSale)', () => {
    it('counts a readyForSale=Yes component as itself, using its own packedUnits/inventoryPackaging', () => {
      const comp = {
        id: 'comp-1', name: 'Cheddar Tranche', unit: 'Pc', readyForSale: 'Yes',
        packedUnits: 12, inventoryPackaging: 'Sac', ingredients: [], children: [],
      };

      const refs = service.componentRefsForComponent(comp, emptyCtx());

      expect(refs).toEqual([
        { key: 'Cheddar Tranche', id: 'comp-1', kind: 'component', unit: 'Pc', marketPriceId: null, unitsPerPack: 12, packagingType: 'Sac', picture: null },
      ]);
    });

    it('explodes a readyForSale=No component into its own ingredients', () => {
      const comp = {
        id: 'comp-2', name: 'Sauce Base', unit: 'L', readyForSale: 'No',
        packedUnits: null, inventoryPackaging: null,
        ingredients: [
          { quantity: 1, ingredient: { id: 'ing-1', name: 'Sugar', recipeUnit: 'g', marketPrice: { id: 'mp-1', itemName: 'Sugar', packedUnits: 5, inventoryPackaging: 'Bag' } } },
        ],
        children: [],
      };

      const refs = service.componentRefsForComponent(comp, emptyCtx());

      expect(refs).toEqual([
        { key: 'Sugar', id: 'mp-1', kind: 'ingredient', unit: 'g', marketPriceId: 'mp-1', unitsPerPack: 5, packagingType: 'Bag', picture: null },
      ]);
    });

    it('recurses into a sub-component (readyForSale=No) reachable via componentById, and stops recursing once a descendant is readyForSale=Yes', () => {
      const grandchildYes = {
        id: 'comp-4', name: 'Ready Sub', unit: 'Pc', readyForSale: 'Yes',
        packedUnits: 6, inventoryPackaging: 'Carton', ingredients: [], children: [],
      };
      const child = {
        id: 'comp-3', name: 'Sub Component', unit: 'Pc', readyForSale: 'No',
        packedUnits: null, inventoryPackaging: null,
        ingredients: [],
        children: [{ quantity: 1, child: { id: 'comp-4', name: 'Ready Sub', unit: 'Pc' } }],
      };
      const parent = {
        id: 'comp-2', name: 'Parent Component', unit: 'Pc', readyForSale: 'No',
        packedUnits: null, inventoryPackaging: null,
        ingredients: [],
        children: [{ quantity: 1, child: { id: 'comp-3', name: 'Sub Component', unit: 'Pc' } }],
      };
      const ctx = emptyCtx();
      ctx.componentById.set('comp-3', child);
      ctx.componentById.set('comp-4', grandchildYes);

      const refs = service.componentRefsForComponent(parent, ctx);

      expect(refs).toEqual([
        { key: 'Ready Sub', id: 'comp-4', kind: 'component', unit: 'Pc', marketPriceId: null, unitsPerPack: 6, packagingType: 'Carton', picture: null },
      ]);
    });

    it('falls back to a flat leaf on a ComponentComponent cycle instead of looping forever', () => {
      const compA: any = {
        id: 'comp-a', name: 'A', unit: 'Pc', readyForSale: 'No',
        packedUnits: 3, inventoryPackaging: 'Box', ingredients: [],
        children: [{ quantity: 1, child: { id: 'comp-b', name: 'B', unit: 'Pc' } }],
      };
      const compB: any = {
        id: 'comp-b', name: 'B', unit: 'Pc', readyForSale: 'No',
        packedUnits: null, inventoryPackaging: null, ingredients: [],
        children: [{ quantity: 1, child: { id: 'comp-a', name: 'A', unit: 'Pc' } }], // cycle back to A
      };
      const ctx = emptyCtx();
      ctx.componentById.set('comp-a', compA);
      ctx.componentById.set('comp-b', compB);

      const refs = service.componentRefsForComponent(compA, ctx);

      // Doesn't hang; A is re-encountered via the cycle and falls back to a flat leaf.
      expect(refs.some((r: any) => r.id === 'comp-a' && r.kind === 'component')).toBe(true);
    });
  });

  describe('itemRefsForMenuItem — Gap 2 wiring (MenuItem readyForSale=No exploding a component)', () => {
    it('delegates to componentRefsForComponent instead of emitting a flat component leaf', () => {
      const fullComp = {
        id: 'comp-5', name: 'Bun - Burger', unit: 'Pc', readyForSale: 'No',
        packedUnits: null, inventoryPackaging: null,
        ingredients: [
          { quantity: 1, ingredient: { id: 'ing-2', name: 'Flour', recipeUnit: 'kg', marketPrice: { id: 'mp-2', itemName: 'Flour', packedUnits: 25, inventoryPackaging: 'Sac' } } },
        ],
        children: [],
      };
      const item = {
        id: 'mi-3', name: 'Burger Seul', picture: null, readyForSale: 'No',
        ingredients: [], packagings: [],
        components: [{ numberOfUnits: 1, component: { id: 'comp-5', name: 'Bun - Burger', unit: 'Pc' } }],
      };
      const ctx = emptyCtx();
      ctx.componentById.set('comp-5', fullComp);

      const refs = service.itemRefsForMenuItem(item, ctx);

      expect(refs).toEqual([
        { key: 'Flour', id: 'mp-2', kind: 'ingredient', unit: 'kg', marketPriceId: 'mp-2', unitsPerPack: 25, packagingType: 'Sac', picture: null },
      ]);
    });
  });

  describe('itemRefsForMenuItem — BUG-002/Q18 (comboItem=Yes always explodes, independent of readyForSale)', () => {
    it('explodes a comboItem=Yes item into its ingredients even when readyForSale=Yes', () => {
      const combo = {
        id: 'mi-combo-1', name: 'Menu Burger', picture: null,
        comboItem: 'Yes', readyForSale: 'Yes',
        ingredients: [
          { numberOfUnits: 1, ingredient: { id: 'ing-3', name: 'Bun', recipeUnit: 'pc', marketPrice: { id: 'mp-3', itemName: 'Bun', packedUnits: 1, inventoryPackaging: null } } },
        ],
        components: [],
        packagings: [],
      };

      const refs = service.itemRefsForMenuItem(combo, emptyCtx());

      expect(refs).toEqual([
        { key: 'Bun', id: 'mp-3', kind: 'ingredient', unit: 'pc', marketPriceId: 'mp-3', unitsPerPack: 1, packagingType: null, picture: null },
      ]);
      // Ne doit PLUS être compté comme son propre produit.
      expect(refs.some((r: any) => r.key === 'Menu Burger')).toBe(false);
    });
  });

  describe('explodeSalesToConsumption — BUG-002/Q18 (comboItem=Yes always explodes)', () => {
    it('explodes a sold comboItem=Yes/readyForSale=Yes item into its constituents instead of counting it as itself', async () => {
      mockPrisma.menuItem.findMany.mockResolvedValueOnce([
        {
          id: 'mi-combo-2', name: 'Menu Burger', readyForSale: 'Yes', comboItem: 'Yes', numberOfPiecesRecipe: 1,
          ingredients: [{ numberOfUnits: 1, ingredient: { name: 'Bun' } }],
          components: [],
        },
      ]);
      // Pas de components -> aucun nom à widen pour les combos, pas de 2e appel findMany.
      mockPrisma.menuComponent.findMany.mockResolvedValue([]);

      const raw = [{ elementId: 'el-1', menuItemId: 'mi-combo-2', eventId: null, eventName: null, qty: 2, lastAt: new Date('2026-07-24') }];
      const consumption = await service.explodeSalesToConsumption(raw, 'tenant-1');

      expect(consumption).toEqual([{ elementId: 'el-1', itemKey: 'Bun', quantity: 2 }]);
    });
  });

  describe('explodeSalesToConsumption — Path B parity with Path A', () => {
    it('explodes sales through a readyForSale=No component into its ingredient (not a flat component key)', async () => {
      mockPrisma.menuItem.findMany.mockResolvedValueOnce([
        {
          id: 'mi-4', name: 'Burger Seul', readyForSale: 'No', comboItem: 'No', numberOfPiecesRecipe: 1,
          ingredients: [],
          components: [{
            numberOfUnits: 1,
            component: {
              id: 'comp-6', name: 'Bun - Burger', readyForSale: 'No', numberOfUnitsRecipe: 1,
              ingredients: [{ quantity: 1, ingredient: { name: 'Flour', marketPrice: { itemName: 'Flour' } } }],
              children: [],
            },
          }],
        },
      ]);
      // No combo names referenced -> loop over components finds nothing new to widen for combos.
      mockPrisma.menuItem.findMany.mockResolvedValueOnce([]);
      // No cycle/grandchildren to widen for components.
      mockPrisma.menuComponent.findMany.mockResolvedValue([]);

      const raw = [{ elementId: 'el-1', menuItemId: 'mi-4', eventId: null, eventName: null, qty: 3, lastAt: new Date('2026-07-15') }];
      const consumption = await service.explodeSalesToConsumption(raw, 'tenant-1');

      expect(consumption).toEqual([{ elementId: 'el-1', itemKey: 'Flour', quantity: 3 }]);
    });
  });

  // Onglet Inventaire live (tracker front #22, LIVE_API_GUIDE.md §3) : reformate getStock() en
  // arbre Shop→items + index inversé Item→shops. Pas de nouvelle source/formule — on spy sur
  // getStock (déjà réel en production, non testé unitairement ici faute de mocks Prisma pour ses
  // nombreuses dépendances) pour isoler la seule logique neuve : le reformatage.
  describe('getLiveInventory', () => {
    it('builds the shop→items tree, enriching each item with its StockLevel and derived consumption', async () => {
      jest.spyOn(service, 'getStock').mockResolvedValue({
        elements: [
          {
            id: 'shop-1', name: 'Bar Nord', type: 'fnb_bar',
            items: [{ name: 'Heineken 33cl', id: 'mi-1', kind: 'product', unitsPerPack: 24, marketPriceId: 'mp-1' }],
          },
          {
            id: 'storage-1', name: 'Réserve', type: 'storage',
            items: [{ name: 'Heineken 33cl', id: 'mi-1', kind: 'product', unitsPerPack: 24, marketPriceId: 'mp-1' }],
          },
        ],
        levels: [{ elementId: 'shop-1', itemKey: 'Heineken 33cl', packedUnits: 5, looseUnits: 3, unitsPerPack: 24, marketPriceId: 'mp-1' }],
        consumption: [{ elementId: 'shop-1', itemKey: 'Heineken 33cl', quantity: 12 }],
      } as any);

      const result = await service.getLiveInventory('space-1', 'tenant-1');

      // Storage exclu — l'onglet Live est scopé aux shops (11_LIVE.md §3 : "par Shop", pas storage).
      expect(result.shops).toEqual([
        {
          shopId: 'shop-1',
          shopName: 'Bar Nord',
          items: [{
            itemKey: 'Heineken 33cl',
            packedUnits: 5,
            looseUnits: 3,
            unitsPerPack: 24,
            marketPriceId: 'mp-1',
            consumedLoose: 12,
          }],
        },
      ]);
    });

    it('defaults packedUnits/looseUnits/consumedLoose to 0 when no StockLevel/consumption row exists yet', async () => {
      jest.spyOn(service, 'getStock').mockResolvedValue({
        elements: [
          { id: 'shop-1', name: 'Bar Nord', type: 'fnb_bar', items: [{ name: 'Nouveau Cocktail', id: 'mi-2', kind: 'product', unitsPerPack: null, marketPriceId: null }] },
        ],
        levels: [],
        consumption: [],
      } as any);

      const result = await service.getLiveInventory('space-1', 'tenant-1');

      expect(result.shops[0].items[0]).toEqual({
        itemKey: 'Nouveau Cocktail',
        packedUnits: 0,
        looseUnits: 0,
        unitsPerPack: null,
        marketPriceId: null,
        consumedLoose: 0,
      });
    });

    it('builds the inverted item→shops index from the same data, sorted by itemKey', async () => {
      jest.spyOn(service, 'getStock').mockResolvedValue({
        elements: [
          { id: 'shop-1', name: 'Bar Nord', type: 'fnb_bar', items: [{ name: 'Heineken 33cl', id: 'mi-1', kind: 'product', unitsPerPack: 24, marketPriceId: 'mp-1' }] },
          { id: 'shop-2', name: 'Bar Sud', type: 'fnb_bar', items: [{ name: 'Heineken 33cl', id: 'mi-1', kind: 'product', unitsPerPack: 24, marketPriceId: 'mp-1' }, { name: 'Coca-Cola', id: 'mi-3', kind: 'product', unitsPerPack: null, marketPriceId: null }] },
        ],
        levels: [
          { elementId: 'shop-1', itemKey: 'Heineken 33cl', packedUnits: 5, looseUnits: 0, unitsPerPack: 24, marketPriceId: 'mp-1' },
          { elementId: 'shop-2', itemKey: 'Heineken 33cl', packedUnits: 2, looseUnits: 1, unitsPerPack: 24, marketPriceId: 'mp-1' },
        ],
        consumption: [],
      } as any);

      const result = await service.getLiveInventory('space-1', 'tenant-1');

      expect(result.items).toEqual([
        { itemKey: 'Coca-Cola', shops: [{ shopId: 'shop-2', shopName: 'Bar Sud', packedUnits: 0, looseUnits: 0, unitsPerPack: null, marketPriceId: null, consumedLoose: 0 }] },
        {
          itemKey: 'Heineken 33cl',
          shops: [
            { shopId: 'shop-1', shopName: 'Bar Nord', packedUnits: 5, looseUnits: 0, unitsPerPack: 24, marketPriceId: 'mp-1', consumedLoose: 0 },
            { shopId: 'shop-2', shopName: 'Bar Sud', packedUnits: 2, looseUnits: 1, unitsPerPack: 24, marketPriceId: 'mp-1', consumedLoose: 0 },
          ],
        },
      ]);
    });
  });

  describe('createMovement — BUG-049 (marketPriceId must match itemKey)', () => {
    const validElement = {
      id: 'el-1',
      name: 'Bar Nord',
      floor: { config: { spaceId: 'space-1' } },
      forecourt: null,
      externalMerch: null,
      zone: null,
    };
    const baseDto = {
      spaceId: 'space-1',
      elementId: 'el-1',
      itemKey: 'Heineken 33cl',
      direction: 'add' as const,
      packed: 1,
      loose: 0,
      reason: 'DELIVERY' as const,
    };

    it('rejects a marketPriceId whose itemName does not match the itemKey', async () => {
      mockPrisma.spaceElement.findFirst.mockResolvedValueOnce(validElement);
      mockPrisma.marketPrice.findFirst.mockResolvedValueOnce({ packedUnits: 24, itemName: 'Coca 33cl' });

      await expect(
        service.createMovement({ ...baseDto, marketPriceId: 'mp-mismatch' }, 'tenant-1'),
      ).rejects.toThrow('ne correspond pas');
    });

    it('accepts a marketPriceId whose itemName matches the itemKey (case/whitespace-insensitive)', async () => {
      mockPrisma.spaceElement.findFirst.mockResolvedValueOnce(validElement);
      mockPrisma.marketPrice.findFirst.mockResolvedValueOnce({ packedUnits: 24, itemName: '  heineken 33cl  ' });
      const tx = {
        stockLevel: {
          findUnique: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({ id: 'level-1' }),
        },
        stockMovement: { create: jest.fn().mockResolvedValue({ id: 'mv-1' }) },
      };
      mockPrisma.$transaction = jest.fn((cb: any) => cb(tx));

      await expect(
        service.createMovement({ ...baseDto, marketPriceId: 'mp-ok' }, 'tenant-1'),
      ).resolves.toBeDefined();
    });
  });

  describe('deriveEventConsumption — ventes d’un event explosées (Q35 Option 1)', () => {
    // Le mock partagé du haut de fichier ne porte que menuItem/menuComponent/
    // marketPrice — on greffe ici les tables de la méthode (cast any : objet
    // littéral figé par l'inférence TS).
    const p = mockPrisma as any;
    const mockPrismaFull = () => {
      p.space = { findFirst: jest.fn().mockResolvedValue({ id: 'space-1' }) };
      p.event = {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ev-1',
          name: 'Match test',
          eventDate: new Date('2026-07-30T00:00:00Z'),
          eventEndDate: null,
        }),
      };
      p.spaceElement = { findMany: jest.fn().mockResolvedValue([{ id: 'shop-1' }, { id: 'shop-2' }]) };
      p.locationSpaceMapping = { findFirst: jest.fn().mockResolvedValue({ salesLocationId: 'integ-1' }) };
      p.$queryRaw = jest.fn().mockResolvedValue([]);
    };

    beforeEach(() => mockPrismaFull());

    it('404 quand l’event n’appartient pas au space/tenant (pas de fenêtre arbitraire)', async () => {
      p.event.findFirst.mockResolvedValueOnce(null);
      await expect(service.deriveEventConsumption('space-1', 'ev-x', 'tenant-1')).rejects.toThrow(
        'Event ev-x not found in space space-1',
      );
    });

    it('partitionne : ligne mappée → explosion ; PdV hors espace et produit non mappé → unjoined, jamais avalés', async () => {
      p.$queryRaw.mockResolvedValueOnce([
        { elementId: 'shop-1', menuItemId: 'mi-1', locationName: 'Buvette Nord', productName: 'PINTE', qty: 140 },
        { elementId: null, menuItemId: 'mi-1', locationName: 'POS fantôme', productName: 'PINTE', qty: 3 },
        { elementId: 'shop-1', menuItemId: null, locationName: 'Buvette Nord', productName: 'Produit inconnu', qty: 2 },
      ]);
      const explode = jest
        .spyOn(service, 'explodeSalesToConsumption')
        .mockResolvedValue([{ elementId: 'shop-1', itemKey: 'Budweiser Fût', quantity: 7 }]);

      const result = await service.deriveEventConsumption('space-1', 'ev-1', 'tenant-1');

      expect(explode).toHaveBeenCalledWith(
        [expect.objectContaining({ elementId: 'shop-1', menuItemId: 'mi-1', qty: 140 })],
        'tenant-1',
      );
      expect(result.lines).toEqual([{ elementId: 'shop-1', itemKey: 'Budweiser Fût', quantity: 7 }]);
      expect(result.unjoined).toEqual({
        shopNames: ['POS fantôme'],
        productNames: ['Produit inconnu'],
        units: 5,
      });
    });

    it('aucune vente → lines vides, unjoined null (le front distingue « 0 vente » de « échec réseau »)', async () => {
      const explode = jest.spyOn(service, 'explodeSalesToConsumption').mockResolvedValue([]);
      const result = await service.deriveEventConsumption('space-1', 'ev-1', 'tenant-1');
      expect(explode).toHaveBeenCalledWith([], 'tenant-1');
      expect(result).toEqual({ eventId: 'ev-1', eventName: 'Match test', lines: [], unjoined: null });
    });

    it('espace sans PdV → réponse vide sans requête ventes (pas de fenêtre tenant-wide)', async () => {
      p.spaceElement.findMany.mockResolvedValueOnce([]);
      const result = await service.deriveEventConsumption('space-1', 'ev-1', 'tenant-1');
      expect(p.$queryRaw).not.toHaveBeenCalled();
      expect(result.lines).toEqual([]);
    });
  });
});
