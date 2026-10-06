import { subtractSalesSinceCount } from './sales-since-count';

/** Ventes faites depuis le comptage retirées avant l'envoi vers Logistic (2026-10-06). */
describe('subtractSalesSinceCount', () => {
  const normalize = (v: unknown) => String(v ?? '').trim().toLowerCase();
  const line = (over: Record<string, unknown> = {}) => ({
    elementId: 'pdv1',
    itemKey: 'Coca',
    itemRefId: 'mp-coca',
    countedPacked: 3,
    countedLoose: 13,
    ...over,
  });

  it('retire les ventes faites depuis le comptage, en entamant un colis si besoin', async () => {
    const consumption = jest.fn().mockResolvedValue([{ elementId: 'pdv1', itemKey: 'Coca', quantity: 20, itemRefId: 'mp-coca' }]);
    const at = new Date('2026-10-10T20:00:05Z');
    const { lines, adjusted, soldUnits } = await subtractSalesSinceCount([line()], () => at, {
      consumption,
      unitsPerPack: new Map([['mp-coca', 24]]),
      normalize,
    });
    // 3 × 24 + 13 = 85 ; − 20 = 65 = 2 × 24 + 17.
    expect(lines[0]).toMatchObject({ countedPacked: 2, countedLoose: 17 });
    expect({ adjusted, soldUnits }).toEqual({ adjusted: 1, soldUnits: 20 });
    expect(consumption).toHaveBeenCalledWith(new Map([['pdv1', at]]));
  });

  it('aucune vente depuis le comptage : ligne inchangée', async () => {
    const original = line();
    const { lines, adjusted } = await subtractSalesSinceCount([original], () => new Date(), {
      consumption: jest.fn().mockResolvedValue([]),
      unitsPerPack: new Map(),
      normalize,
    });
    expect(lines[0]).toBe(original);
    expect(adjusted).toBe(0);
  });

  it('une requête par tranche de 10 s et par PDV, chaque ligne avec ses propres ventes', async () => {
    const early = line({ itemKey: 'Eau', itemRefId: 'mp-eau', countedPacked: 0, countedLoose: 30 });
    const late = line({ countedPacked: 0, countedLoose: 50 });
    const atOf = (l: any) => (l === early ? new Date('2026-10-10T20:00:00Z') : new Date('2026-10-10T20:00:40Z'));
    const consumption = jest
      .fn()
      .mockResolvedValueOnce([{ elementId: 'pdv1', itemKey: 'Eau', quantity: 4 }])
      .mockResolvedValueOnce([{ elementId: 'pdv1', itemKey: 'Coca', quantity: 2 }]);
    const { lines } = await subtractSalesSinceCount([early, late], atOf, {
      consumption,
      unitsPerPack: new Map(),
      normalize,
    });
    expect(consumption).toHaveBeenCalledTimes(2);
    expect(lines.map((l) => l.countedLoose)).toEqual([26, 48]);
  });

  it('jamais de stock négatif, même sans conditionnement connu', async () => {
    const { lines } = await subtractSalesSinceCount([line({ countedPacked: 0, countedLoose: 5 })], () => new Date(), {
      consumption: jest.fn().mockResolvedValue([{ elementId: 'pdv1', itemKey: 'Coca', quantity: 9 }]),
      unitsPerPack: new Map(),
      normalize,
    });
    expect(lines[0]).toMatchObject({ countedPacked: 0, countedLoose: 0 });
  });
});
