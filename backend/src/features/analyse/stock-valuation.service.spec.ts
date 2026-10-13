import { StockValuationService } from './stock-valuation.service';
import { StockCostResolverService } from './stock-cost-resolver.service';
import { spaceAccessStub } from '../../core/auth/space-access.testing';

describe('StockValuationService', () => {
  const prisma: any = {
    stockLevel: { findMany: jest.fn() },
    spaceElement: { findMany: jest.fn() },
  };
  const resolver = { resolve: jest.fn() } as unknown as StockCostResolverService;
  const stockLevelService = { getExpectedStockIndex: jest.fn() };
  const service = new StockValuationService(prisma, spaceAccessStub(), resolver, stockLevelService as any);

  const level = (o: any) => ({
    elementId: 'pdv1', itemKey: 'x', itemKind: 'marketPrice', itemRefId: 'mp1',
    packedUnits: 0, looseUnits: 0, unitsPerPack: null, marketPriceId: null, ...o,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.spaceElement.findMany.mockResolvedValue([
      { id: 'pdv1', type: 'shop', subtypes: ['food'], shopTypes: [], area: 'nord' },
      { id: 'pdv2', type: 'shop', subtypes: ['beer'], shopTypes: [], area: 'sud' },
      { id: 'sto1', type: 'storage', subtypes: [], shopTypes: [], area: null },
    ]);
  });

  const mockLevels = (levels: any[], costs: Record<number, any>) => {
    // Identité de coût lue sur les StockLevel, quantités lues dans l'index Logistique (déjà nettées).
    prisma.stockLevel.findMany.mockResolvedValue(levels.map((l, i) => ({ ...l, itemKey: l.itemKey + i })));
    stockLevelService.getExpectedStockIndex.mockResolvedValue({
      index: new Map(
        levels.map((l, i) => [
          `${l.elementId}::${l.itemKey + i}`,
          { elementId: l.elementId, itemKey: l.itemKey + i, packed: l.packedUnits, loose: l.looseUnits, unitsPerPack: l.unitsPerPack },
        ]),
      ),
    });
    (resolver.resolve as jest.Mock).mockImplementation(async (_t: string, refs: any[]) => {
      const m = new Map();
      refs.forEach((r, i) => m.set(r.key, costs[i] ?? { unitCost: null, marketPrice: null }));
      return m;
    });
  };

  it('valorise packed × unitsPerPack + loose et sépare les stockages', async () => {
    mockLevels(
      [level({ packedUnits: 2, unitsPerPack: 10, looseUnits: 5 }), level({ elementId: 'sto1', looseUnits: 4 })],
      { 0: { unitCost: 2, marketPrice: null }, 1: { unitCost: 3, marketPrice: null } },
    );
    const res = await service.getValuation('t1', { spaceId: 's1' });
    expect(res.total).toBe(50 + 12);
    expect(res.storagesValue).toBe(12);
    expect(res.storagesExcluded).toBe(false);
    expect(res.byElement.find((e) => e.elementId === 'sto1')).toMatchObject({ value: 12, isStorage: true });
  });

  it('compte à part les lignes sans coût, sans les valoriser à 0', async () => {
    mockLevels([level({ looseUnits: 3 }), level({ itemRefId: 'mp2', looseUnits: 1 })], { 0: { unitCost: 2, marketPrice: null } });
    const res = await service.getValuation('t1', { spaceId: 's1' });
    expect(res.total).toBe(6);
    expect(res.linesWithoutCost).toBe(1);
  });

  it('ignore les lignes vides et les quantités négatives', async () => {
    mockLevels([level({ looseUnits: 0 }), level({ looseUnits: -4 })], {});
    const res = await service.getValuation('t1', { spaceId: 's1' });
    expect(res).toMatchObject({ total: 0, linesWithoutCost: 0 });
  });

  it('un filtre PdV, type ou zone exclut les stockages et filtre les PdV', async () => {
    mockLevels(
      [level({ looseUnits: 1 }), level({ elementId: 'pdv2', looseUnits: 1 }), level({ elementId: 'sto1', looseUnits: 1 })],
      { 0: { unitCost: 5, marketPrice: null } },
    );
    const res = await service.getValuation('t1', { spaceId: 's1', shopTypes: ['food'] });
    expect(res.storagesExcluded).toBe(true);
    expect(res.byElement.map((e) => e.elementId)).toEqual(['pdv1']);
    expect(res.storagesValue).toBe(0);
  });

  it('shopAreas ne garde que les PdV de la zone', async () => {
    mockLevels([level({ looseUnits: 1 }), level({ elementId: 'pdv2', looseUnits: 1 })], { 0: { unitCost: 5, marketPrice: null } });
    const res = await service.getValuation('t1', { spaceId: 's1', shopAreas: ['sud'] });
    expect(res.byElement.map((e) => e.elementId)).toEqual(['pdv2']);
  });

  it('filtres industriel / fournisseur portés par la Market Price (composants et articles exclus)', async () => {
    mockLevels(
      [level({ looseUnits: 1 }), level({ itemKind: 'menuItem', itemRefId: 'mi1', looseUnits: 1 }), level({ itemRefId: 'mp3', looseUnits: 1 })],
      {
        0: { unitCost: 2, marketPrice: { id: 'mp1', supplierId: 's1', industrialId: 'i1' } },
        1: { unitCost: 9, marketPrice: null },
        2: { unitCost: 7, marketPrice: { id: 'mp3', supplierId: 's2', industrialId: 'i2' } },
      },
    );
    const res = await service.getValuation('t1', { spaceId: 's1', industrialIds: ['i1'], supplierIds: ['s1'] });
    expect(res.total).toBe(2);
  });

  it('part de l\'index Logistique nettoyé des ventes, jamais négatif, clé de consommation seule à 0', async () => {
    mockLevels([level({ looseUnits: 3 })], { 0: { unitCost: 2, marketPrice: null } });
    stockLevelService.getExpectedStockIndex.mockResolvedValue({
      index: new Map([
        ['pdv1::x0', { elementId: 'pdv1', itemKey: 'x0', packed: 0, loose: 3, unitsPerPack: null }],
        ['pdv1::vendu', { elementId: 'pdv1', itemKey: 'vendu', packed: 0, loose: 0, unitsPerPack: null }],
        ['pdv1::neg', { elementId: 'pdv1', itemKey: 'neg', packed: 0, loose: -5, unitsPerPack: null }],
      ]),
    });
    const res = await service.getValuation('t1', { spaceId: 's1' });
    expect(stockLevelService.getExpectedStockIndex).toHaveBeenCalledWith('s1', 't1');
    expect(res).toMatchObject({ total: 6, linesWithoutCost: 0 });
  });

  it('shopIds filtre dès la requête Prisma', async () => {
    mockLevels([], {});
    await service.getValuation('t1', { spaceId: 's1', shopIds: ['pdv1'] });
    expect(prisma.stockLevel.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', spaceId: 's1', elementId: { in: ['pdv1'] } });
  });

  it('shopNames : nom normalisé (casse, accents, espaces) résolu en SpaceElement du périmètre', async () => {
    prisma.spaceElement.findMany.mockResolvedValueOnce([
      { id: 'pdv1', name: 'Buvette  Parvis' },
      { id: 'pdv2', name: 'Bar Nord' },
    ]);
    mockLevels([], {});
    prisma.spaceElement.findMany.mockResolvedValue([]);
    const res = await service.getValuation('t1', { spaceId: 's1', shopNames: ['buvette parvis', 'Écurie Inconnue'] });
    expect(prisma.stockLevel.findMany.mock.calls[0][0].where).toMatchObject({ elementId: { in: ['pdv1'] } });
    expect(res.storagesExcluded).toBe(true);
    expect(res.unresolvedShopNames).toEqual(['Écurie Inconnue']);
  });

  it('shopNames sans aucune correspondance : total vide marqué, jamais le stock de tous les PdV', async () => {
    prisma.spaceElement.findMany.mockResolvedValueOnce([{ id: 'pdv1', name: 'Bar Nord' }]);
    const res = await service.getValuation('t1', { spaceId: 's1', shopNames: ['Inconnu'] });
    expect(res).toMatchObject({ total: 0, byElement: [], storagesExcluded: true, unresolvedShopNames: ['Inconnu'] });
    expect(prisma.stockLevel.findMany).not.toHaveBeenCalled();
    expect(stockLevelService.getExpectedStockIndex).not.toHaveBeenCalled();
  });
});
