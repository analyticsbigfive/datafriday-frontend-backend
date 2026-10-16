import { PosAvailabilityService } from './pos-availability.service';
import { classifyAvailability, POS_DEFAULT_LOW_STOCK_UNITS, remainingUnitsFor, resolveLowThreshold, totalUnitsOf } from './pos-availability-rules';
import { PosRecipeRequirementsService } from './pos-recipe-requirements.service';
import { PosStockSnapshotService } from './pos-stock-snapshot.service';

/** Disponibilité caisse (L5) : stock Logistic du PdV inversé par la recette. */
describe('PosAvailabilityService', () => {
  const EL = 'pdv-1';
  let stockLevels: { getExpectedStockIndex: jest.Mock };
  let prisma: { stockLevel: { findMany: jest.Mock }; posEventSetting: { findFirst: jest.Mock } };
  let recipes: { explodeSalesToConsumption: jest.Mock };
  let service: PosAvailabilityService;

  const idx = (rows: Array<{ itemKey: string; packed?: number; loose?: number; unitsPerPack?: number | null }>) =>
    new Map(rows.map((r) => [`${EL}::${r.itemKey}`, { elementId: EL, itemKey: r.itemKey, packed: r.packed ?? 0, loose: r.loose ?? 0, unitsPerPack: r.unitsPerPack ?? null }]));

  /** `lines` : consommation de 1000 unités fictives par article (quantité par unité x 1000). */
  const setup = (levels: ReturnType<typeof idx>, tracked: string[], lines: Array<{ menuItemId: string; key: string; perUnit: number }>) => {
    stockLevels.getExpectedStockIndex.mockResolvedValue({ index: levels, asOf: new Date(), anchorAt: null });
    prisma.stockLevel.findMany.mockResolvedValue(tracked.map((itemKey) => ({ elementId: EL, itemKey })));
    recipes.explodeSalesToConsumption.mockResolvedValue(
      lines.map((l) => ({ elementId: l.menuItemId, itemKey: l.key, quantity: l.perUnit * 1000 })),
    );
  };

  let spaceCounter = 0;
  let spaceId: string;
  beforeEach(() => {
    process.env.POS_STOCK_CACHE_MS = '0';
    delete process.env.POS_LOW_STOCK_UNITS;
    spaceId = `space-${++spaceCounter}`;
    stockLevels = { getExpectedStockIndex: jest.fn() };
    prisma = { stockLevel: { findMany: jest.fn() }, posEventSetting: { findFirst: jest.fn().mockResolvedValue(null) } };
    recipes = { explodeSalesToConsumption: jest.fn() };
    const snapshot = new PosStockSnapshotService(prisma as any, stockLevels as any);
    const requirements = new PosRecipeRequirementsService(recipes as any);
    service = new PosAvailabilityService(snapshot, requirements, prisma as any);
  });

  it('article simple (readyForSale=Yes, clé = son nom) : unités = stock', async () => {
    setup(idx([{ itemKey: 'Coca 33cl', loose: 40 }]), ['Coca 33cl'], [{ menuItemId: 'mi-coca', key: 'Coca 33cl', perUnit: 1 }]);
    const out = await service.computeForPdv('t', spaceId, 'ev', EL, ['mi-coca']);
    expect(out.get('mi-coca')).toEqual({ availability: 'available', remainingUnits: 40 });
  });

  it('recette : minimum sur les composants, arrondi à l\'entier inférieur', async () => {
    setup(
      idx([{ itemKey: 'Pain', loose: 30 }, { itemKey: 'Saucisse', loose: 9 }]),
      ['Pain', 'Saucisse'],
      [{ menuItemId: 'mi-hotdog', key: 'Pain', perUnit: 1 }, { menuItemId: 'mi-hotdog', key: 'Saucisse', perUnit: 2 }],
    );
    const out = await service.computeForPdv('t', spaceId, 'ev', EL, ['mi-hotdog']);
    expect(out.get('mi-hotdog')).toEqual({ availability: 'low', remainingUnits: 4 });
  });

  it('combo déplié : le composant le plus rare borne le combo', async () => {
    setup(
      idx([{ itemKey: 'Croque', loose: 12 }, { itemKey: 'Chips', loose: 3 }, { itemKey: 'Coca 33cl', loose: 50 }]),
      ['Croque', 'Chips', 'Coca 33cl'],
      [
        { menuItemId: 'mi-combo', key: 'Croque', perUnit: 1 },
        { menuItemId: 'mi-combo', key: 'Chips', perUnit: 1 },
        { menuItemId: 'mi-combo', key: 'Coca 33cl', perUnit: 1 },
      ],
    );
    const out = await service.computeForPdv('t', spaceId, 'ev', EL, ['mi-combo']);
    expect(out.get('mi-combo')).toEqual({ availability: 'low', remainingUnits: 3 });
  });

  it('composant non suivi : ne borne pas ; aucun composant suivi : non calculable (reste disponible)', async () => {
    setup(
      idx([{ itemKey: 'Pain', loose: 10 }, { itemKey: 'Sauce', loose: 0 }]),
      ['Pain'], // Sauce n'a que des ventes, pas de StockLevel
      [
        { menuItemId: 'mi-a', key: 'Pain', perUnit: 1 },
        { menuItemId: 'mi-a', key: 'Sauce', perUnit: 1 },
        { menuItemId: 'mi-b', key: 'Sauce', perUnit: 1 },
        { menuItemId: 'mi-c', key: 'Inconnu', perUnit: 1 },
      ],
    );
    const out = await service.computeForPdv('t', spaceId, 'ev', EL, ['mi-a', 'mi-b', 'mi-c', 'mi-sans-recette']);
    expect(out.get('mi-a')).toEqual({ availability: 'available', remainingUnits: 10 });
    expect(out.get('mi-b')).toEqual({ availability: 'available', remainingUnits: null });
    expect(out.get('mi-c')).toEqual({ availability: 'available', remainingUnits: null });
    expect(out.get('mi-sans-recette')).toEqual({ availability: 'available', remainingUnits: null });
  });

  it('composant suivi à stock nul : article épuisé', async () => {
    setup(idx([{ itemKey: 'Pain', loose: 10 }, { itemKey: 'Saucisse', loose: 0 }]), ['Pain', 'Saucisse'], [
      { menuItemId: 'mi-hotdog', key: 'Pain', perUnit: 1 },
      { menuItemId: 'mi-hotdog', key: 'Saucisse', perUnit: 1 },
    ]);
    const out = await service.computeForPdv('t', spaceId, 'ev', EL, ['mi-hotdog']);
    expect(out.get('mi-hotdog')).toEqual({ availability: 'out', remainingUnits: 0 });
  });

  it('casse de pack : packs entiers et vrac s\'additionnent en unités de vente', async () => {
    setup(idx([{ itemKey: 'Bière 25cl', packed: 2, loose: 5, unitsPerPack: 24 }]), ['Bière 25cl'], [{ menuItemId: 'mi-biere', key: 'Bière 25cl', perUnit: 1 }]);
    const out = await service.computeForPdv('t', spaceId, 'ev', EL, ['mi-biere']);
    expect(out.get('mi-biere')).toEqual({ availability: 'available', remainingUnits: 53 });
  });

  it('besoin fractionnaire (recette pour N pièces) : floor(stock / besoin)', async () => {
    setup(idx([{ itemKey: 'Farine', loose: 1 }]), ['Farine'], [{ menuItemId: 'mi-pizza', key: 'Farine', perUnit: 0.3 }]);
    const out = await service.computeForPdv('t', spaceId, 'ev', EL, ['mi-pizza']);
    expect(out.get('mi-pizza')?.remainingUnits).toBe(3);
  });

  it('une seule passe : un appel de stock et un appel de recettes pour tous les articles', async () => {
    setup(idx([{ itemKey: 'A', loose: 8 }]), ['A'], [
      { menuItemId: 'm1', key: 'A', perUnit: 1 },
      { menuItemId: 'm2', key: 'A', perUnit: 2 },
      { menuItemId: 'm3', key: 'A', perUnit: 4 },
    ]);
    await service.computeForPdv('t', spaceId, 'ev', EL, ['m1', 'm2', 'm3', 'm1']);
    expect(stockLevels.getExpectedStockIndex).toHaveBeenCalledTimes(1);
    expect(prisma.stockLevel.findMany).toHaveBeenCalledTimes(1);
    expect(recipes.explodeSalesToConsumption).toHaveBeenCalledTimes(1);
    expect(recipes.explodeSalesToConsumption.mock.calls[0][0]).toHaveLength(3);
  });

  it('seuil low : par défaut 5, réglable par variable d\'environnement et par option', async () => {
    setup(idx([{ itemKey: 'A', loose: 6 }]), ['A'], [{ menuItemId: 'm1', key: 'A', perUnit: 1 }]);
    expect((await service.computeForPdv('t', spaceId, 'ev', EL, ['m1'])).get('m1')?.availability).toBe('available');
    process.env.POS_LOW_STOCK_UNITS = '10';
    expect((await service.computeForPdv('t', spaceId, 'ev', EL, ['m1'])).get('m1')?.availability).toBe('low');
    expect((await service.computeForPdv('t', spaceId, 'ev', EL, ['m1'], { lowThreshold: 0 })).get('m1')?.availability).toBe('available');
  });

  it('cliché de stock partagé quelques secondes entre appels du même espace', async () => {
    process.env.POS_STOCK_CACHE_MS = '60000';
    setup(idx([{ itemKey: 'A', loose: 8 }]), ['A'], [{ menuItemId: 'm1', key: 'A', perUnit: 1 }]);
    await Promise.all([service.computeForPdv('t', spaceId, 'ev', EL, ['m1']), service.computeForPdv('t', spaceId, 'ev', EL, ['m1'])]);
    expect(stockLevels.getExpectedStockIndex).toHaveBeenCalledTimes(1);
  });
});

describe('pos-availability-rules', () => {
  it('classifyAvailability : out à 0, low au seuil inclus, available au dessus, null disponible', () => {
    expect(classifyAvailability(0, 5)).toBe('out');
    expect(classifyAvailability(1, 5)).toBe('low');
    expect(classifyAvailability(5, 5)).toBe('low');
    expect(classifyAvailability(6, 5)).toBe('available');
    expect(classifyAvailability(null, 5)).toBe('available');
    expect(classifyAvailability(1, 0)).toBe('available');
  });

  it('resolveLowThreshold : option > environnement > défaut, valeurs invalides ignorées', () => {
    expect(resolveLowThreshold(undefined, {})).toBe(POS_DEFAULT_LOW_STOCK_UNITS);
    expect(resolveLowThreshold(undefined, { POS_LOW_STOCK_UNITS: '8' } as any)).toBe(8);
    expect(resolveLowThreshold({ lowThreshold: 2 }, { POS_LOW_STOCK_UNITS: '8' } as any)).toBe(2);
    expect(resolveLowThreshold(undefined, { POS_LOW_STOCK_UNITS: 'abc' } as any)).toBe(POS_DEFAULT_LOW_STOCK_UNITS);
    expect(resolveLowThreshold(undefined, { POS_LOW_STOCK_UNITS: '-3' } as any)).toBe(POS_DEFAULT_LOW_STOCK_UNITS);
  });

  it('totalUnitsOf : sans taille de pack, un pack compte pour une unité', () => {
    expect(totalUnitsOf({ packed: 3, loose: 2, unitsPerPack: null })).toBe(5);
    expect(totalUnitsOf({ packed: 2, loose: 1, unitsPerPack: 6 })).toBe(13);
  });

  it('remainingUnitsFor : tolérance flottante (0,3 x 3 = 0,9)', () => {
    expect(remainingUnitsFor(new Map([['x', 0.1]]), new Map([['x', 0.3]]))).toBe(3);
  });
});
