import { SalePriceInput, catalogPriceHt, computeSalePrices, eventSalesDayWindow } from './inventory-sale-prices.util';

const base = (over: Partial<SalePriceInput>): SalePriceInput => ({
  itemIds: [],
  menuItemIds: new Set(),
  marketPrices: new Map(),
  componentIds: new Set(),
  salesByMenuItem: new Map(),
  catalogPriceHtByMenuItem: new Map(),
  recipeLines: [],
  ...over,
});
const mp = (id: string, extra: Partial<{ unit: string | null; recipeUnit: string | null; purchaseUnitConversion: number | null }> = {}) => ({
  id,
  unit: 'Pc',
  recipeUnit: 'Pc',
  purchaseUnitConversion: null,
  ...extra,
});

describe('computeSalePrices', () => {
  it('plat pret a vendre : CA HT / quantite vendue', () => {
    const [p] = computeSalePrices(
      base({ itemIds: ['chips'], menuItemIds: new Set(['chips']), salesByMenuItem: new Map([['chips', { revenueHt: 237, quantity: 100 }]]) }),
    );
    expect(p).toEqual({ itemId: 'chips', unitPriceHt: 2.37, source: 'sales', soldQuantity: 100 });
  });

  it('plat sans vente : prix catalogue HT', () => {
    const [p] = computeSalePrices(
      base({ itemIds: ['pop'], menuItemIds: new Set(['pop']), catalogPriceHtByMenuItem: new Map([['pop', 4.74]]) }),
    );
    expect(p).toEqual({ itemId: 'pop', unitPriceHt: 4.74, source: 'catalog' });
  });

  it('plat sans vente ni catalogue : null, jamais 0', () => {
    const out = computeSalePrices(
      base({
        itemIds: ['a', 'b'],
        menuItemIds: new Set(['a', 'b']),
        salesByMenuItem: new Map([['b', { revenueHt: 0, quantity: 5 }]]),
        catalogPriceHtByMenuItem: new Map([['a', null]]),
      }),
    );
    expect(out.map((p) => [p.unitPriceHt, p.source])).toEqual([[null, null], [null, null]]);
  });

  it('ingredient : moyenne ponderee des plats mono-recette', () => {
    const [p] = computeSalePrices(
      base({
        itemIds: ['vittel'],
        marketPrices: new Map([['vittel', mp('vittel')]]),
        recipeLines: [
          { menuItemId: 'm1', marketPriceId: 'vittel', numberOfUnits: 1 },
          { menuItemId: 'm2', marketPriceId: 'vittel', numberOfUnits: 1 },
        ],
        salesByMenuItem: new Map([
          ['m1', { revenueHt: 284, quantity: 100 }],
          ['m2', { revenueHt: 142, quantity: 50 }],
        ]),
      }),
    );
    expect(p.source).toBe('sales');
    expect(p.unitPriceHt).toBeCloseTo(2.84, 4);
    expect(p.soldQuantity).toBe(150);
  });

  it('ingredient vendu seulement dans des recettes multi-ingredients : null', () => {
    const [p] = computeSalePrices(
      base({
        itemIds: ['bun'],
        marketPrices: new Map([['bun', mp('bun')]]),
        recipeLines: [
          { menuItemId: 'burger', marketPriceId: 'bun', numberOfUnits: 1 },
          { menuItemId: 'burger', marketPriceId: 'steak', numberOfUnits: 1 },
        ],
        salesByMenuItem: new Map([['burger', { revenueHt: 900, quantity: 100 }]]),
        catalogPriceHtByMenuItem: new Map([['burger', 9]]),
      }),
    );
    expect(p).toEqual({ itemId: 'bun', unitPriceHt: null, source: null });
  });

  it('ingredient : plat multi-ingredients ignore, mono-recette retenu', () => {
    const [p] = computeSalePrices(
      base({
        itemIds: ['cola'],
        marketPrices: new Map([['cola', mp('cola')]]),
        recipeLines: [
          { menuItemId: 'solo', marketPriceId: 'cola', numberOfUnits: 1 },
          { menuItemId: 'menu', marketPriceId: 'cola', numberOfUnits: 1 },
          { menuItemId: 'menu', marketPriceId: 'frites', numberOfUnits: 1 },
        ],
        salesByMenuItem: new Map([
          ['solo', { revenueHt: 379, quantity: 100 }],
          ['menu', { revenueHt: 5000, quantity: 500 }],
        ]),
      }),
    );
    expect(p.unitPriceHt).toBeCloseTo(3.79, 4);
  });

  it('ingredient sans vente : repli catalogue / numberOfUnits si un seul plat', () => {
    const [p] = computeSalePrices(
      base({
        itemIds: ['perrier'],
        marketPrices: new Map([['perrier', mp('perrier')]]),
        recipeLines: [{ menuItemId: 'm', marketPriceId: 'perrier', numberOfUnits: 2 }],
        catalogPriceHtByMenuItem: new Map([['m', 5.68]]),
      }),
    );
    expect(p).toEqual({ itemId: 'perrier', unitPriceHt: 2.84, source: 'catalog' });
  });

  it('ingredient sans vente et deux plats : pas de repli catalogue, null', () => {
    const [p] = computeSalePrices(
      base({
        itemIds: ['x'],
        marketPrices: new Map([['x', mp('x')]]),
        recipeLines: [
          { menuItemId: 'm1', marketPriceId: 'x', numberOfUnits: 1 },
          { menuItemId: 'm2', marketPriceId: 'x', numberOfUnits: 1 },
        ],
        catalogPriceHtByMenuItem: new Map([['m1', 3], ['m2', 4]]),
      }),
    );
    expect(p.unitPriceHt).toBeNull();
  });

  it("conversion d'unite : fut, recette en verres de 0,25 L (pricePerUnit au litre)", () => {
    // 400 verres vendus 1508 HT : consommation 400 x 1 x 0.25 = 100 L, prix HT au litre 15,08.
    const [p] = computeSalePrices(
      base({
        itemIds: ['fut'],
        marketPrices: new Map([['fut', mp('fut', { unit: 'L', recipeUnit: 'verre', purchaseUnitConversion: 0.25 })]]),
        recipeLines: [{ menuItemId: 'biere', marketPriceId: 'fut', numberOfUnits: 1 }],
        salesByMenuItem: new Map([['biere', { revenueHt: 1508, quantity: 400 }]]),
      }),
    );
    expect(p.unitPriceHt).toBeCloseTo(15.08, 4);
    expect(p.soldQuantity).toBe(100);
  });

  it('conversion absente avec unites differentes : ambigu, null', () => {
    const [p] = computeSalePrices(
      base({
        itemIds: ['fut'],
        marketPrices: new Map([['fut', mp('fut', { unit: 'L', recipeUnit: 'verre', purchaseUnitConversion: null })]]),
        recipeLines: [{ menuItemId: 'biere', marketPriceId: 'fut', numberOfUnits: 1 }],
        salesByMenuItem: new Map([['biere', { revenueHt: 1508, quantity: 400 }]]),
      }),
    );
    expect(p).toEqual({ itemId: 'fut', unitPriceHt: null, source: null });
  });

  it('composant et id inconnu : null, sans doublon', () => {
    const out = computeSalePrices(base({ itemIds: ['comp', 'zzz', 'comp'], componentIds: new Set(['comp']) }));
    expect(out).toEqual([
      { itemId: 'comp', unitPriceHt: null, source: null },
      { itemId: 'zzz', unitPriceHt: null, source: null },
    ]);
  });
});

describe('catalogPriceHt', () => {
  it('TTC vers HT, null si TVA ou prix inconnu', () => {
    expect(catalogPriceHt(5.5, 10)).toBe(5);
    expect(catalogPriceHt(5.5, null)).toBeNull();
    expect(catalogPriceHt(null, 20)).toBeNull();
  });
});

describe('eventSalesDayWindow', () => {
  it('un jour, deux jours, conteneur de saison', () => {
    const d = (s: string) => new Date(s);
    expect(eventSalesDayWindow({ eventDate: d('2026-10-31T00:00:00Z') }).tooWide).toBe(false);
    const two = eventSalesDayWindow({ eventDate: d('2026-10-31'), eventEndDate: d('2026-11-01') });
    expect(two.to.toISOString().slice(0, 10)).toBe('2026-11-01');
    expect(two.tooWide).toBe(false);
    expect(eventSalesDayWindow({ eventDate: d('2026-08-01'), eventEndDate: d('2027-06-01') }).tooWide).toBe(true);
  });
});
