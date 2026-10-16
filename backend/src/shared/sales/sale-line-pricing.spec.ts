import { Prisma } from '@prisma/client';
import { resolveListUnitPrice, resolveSaleLinePrice, resolveVatRate } from './sale-line-pricing';

describe('sale-line-pricing (fonctions pures)', () => {
  describe('resolveListUnitPrice : parité avec simulateSale', () => {
    it("prend le prix de l'espace avant le prix de base", () => {
      expect(Number(resolveListUnitPrice({ priceTtc: new Prisma.Decimal('6.5') }, { basePrice: new Prisma.Decimal('5') }))).toBe(6.5);
    });
    it('retombe sur le prix de base sans prix espace', () => {
      expect(Number(resolveListUnitPrice({ priceTtc: null }, { basePrice: new Prisma.Decimal('5') }))).toBe(5);
      expect(Number(resolveListUnitPrice(undefined, { basePrice: new Prisma.Decimal('5') }))).toBe(5);
    });
    it('vaut 0 sans aucun prix (vente gratuite plutôt que NaN)', () => {
      expect(Number(resolveListUnitPrice(undefined, undefined))).toBe(0);
    });
    it('un prix espace à 0 reste 0 (pas de repli sur le prix de base)', () => {
      expect(Number(resolveListUnitPrice({ priceTtc: new Prisma.Decimal(0) }, { basePrice: new Prisma.Decimal('5') }))).toBe(0);
    });
  });

  describe('resolveVatRate : espace, puis article, puis défaut du tenant', () => {
    it('suit la cascade', () => {
      expect(Number(resolveVatRate({ vatRate: 5.5 }, { vatRate: 10 }, 20))).toBe(5.5);
      expect(Number(resolveVatRate({ vatRate: null }, { vatRate: 10 }, 20))).toBe(10);
      expect(Number(resolveVatRate(undefined, { vatRate: null }, 20))).toBe(20);
      expect(Number(resolveVatRate(undefined, undefined, null))).toBe(0);
    });
    it('une TVA à 0 (consigne) est respectée et ne retombe pas sur le défaut', () => {
      expect(Number(resolveVatRate({ vatRate: 0 }, { vatRate: 10 }, 20))).toBe(0);
    });
  });

  describe('resolveSaleLinePrice', () => {
    it('sans promotion : prix de la liste, rien à barrer', () => {
      expect(resolveSaleLinePrice({ priceTtc: 6 }, { basePrice: 5 }, null, true)).toEqual({
        unitPrice: 6,
        originalUnitPrice: null,
        promotionLabel: null,
      });
    });

    it("remise catalogue en pourcentage sur le prix de l'article", () => {
      const r = resolveSaleLinePrice(null, { basePrice: 8, discountType: 'percent', discountValue: 25 }, null, true);
      expect(r).toEqual({ unitPrice: 6, originalUnitPrice: 8, promotionLabel: 'Promo' });
    });

    it('remise catalogue en montant, bornée au prix', () => {
      expect(resolveSaleLinePrice(null, { basePrice: 5, discountType: 'amount', discountValue: 1.5 }, null, true).unitPrice).toBe(3.5);
      expect(resolveSaleLinePrice(null, { basePrice: 5, discountType: 'amount', discountValue: 99 }, null, true).unitPrice).toBe(0);
    });

    it('combo : SpaceMenuItem.priceTtc est déjà APRÈS promo, le prix d\'origine est déduit', () => {
      const r = resolveSaleLinePrice({ priceTtc: 9, discountType: 'percent', discountValue: 10 }, { basePrice: 12 }, null, true);
      expect(r.unitPrice).toBe(9);
      expect(r.originalUnitPrice).toBe(10);
      expect(r.promotionLabel).toBe('Promo');
      const amount = resolveSaleLinePrice({ priceTtc: 9, discountType: 'amount', discountValue: 2 }, { basePrice: 12 }, null, true);
      expect(amount.originalUnitPrice).toBe(11);
    });

    it("la promo de l'espace prime sur la remise de l'article", () => {
      const r = resolveSaleLinePrice(
        { discountType: 'percent', discountValue: 50 },
        { basePrice: 10, discountType: 'percent', discountValue: 10 },
        null,
        true,
      );
      expect(r.unitPrice).toBe(5);
    });

    it('libellé du type de promotion (Happy-Hour), même sans remise de prix', () => {
      const r = resolveSaleLinePrice(null, { basePrice: 4 }, { isActive: true, typeName: 'Happy-Hour' }, true);
      expect(r).toEqual({ unitPrice: 4, originalUnitPrice: null, promotionLabel: 'Happy-Hour' });
    });

    it('une promotion inactive ne donne pas de libellé', () => {
      expect(resolveSaleLinePrice(null, { basePrice: 4 }, { isActive: false, typeName: 'Pack x4' }, true).promotionLabel).toBeNull();
    });

    it("promos désactivées pour l'évènement : prix d'origine, aucun libellé", () => {
      const direct = resolveSaleLinePrice(null, { basePrice: 8, discountType: 'percent', discountValue: 25 }, { isActive: true, typeName: 'Happy-Hour' }, false);
      expect(direct).toEqual({ unitPrice: 8, originalUnitPrice: null, promotionLabel: null });
      const combo = resolveSaleLinePrice({ priceTtc: 9, discountType: 'percent', discountValue: 10 }, { basePrice: 12 }, null, false);
      expect(combo).toEqual({ unitPrice: 10, originalUnitPrice: null, promotionLabel: null });
    });

    it('un prix négatif (déconsigne) ne reçoit jamais de remise', () => {
      const r = resolveSaleLinePrice(null, { basePrice: -1, discountType: 'percent', discountValue: 50 }, null, true);
      expect(r.unitPrice).toBe(-1);
      expect(r.originalUnitPrice).toBeNull();
    });
  });
});
