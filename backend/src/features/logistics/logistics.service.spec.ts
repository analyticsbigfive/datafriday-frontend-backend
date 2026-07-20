import { Test, TestingModule } from '@nestjs/testing';
import { LogisticsService } from './logistics.service';
import { PrismaService } from '../../core/database/prisma.service';

describe('LogisticsService — readyForSale display logic', () => {
  let service: any;

  const mockPrisma = {
    menuItem: { findMany: jest.fn() },
    menuComponent: { findMany: jest.fn() },
    marketPrice: { findMany: jest.fn() },
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
});
