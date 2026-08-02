import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateMenuItemDto } from './menu-items/dto/create-menu-item.dto';
import { CreateMarketPriceDto } from './market-prices/dto/create-market-price.dto';
import {
  CreateMenuComponentDto,
  MenuComponentIngredientLineDto,
  MenuComponentChildLineDto,
} from './menu-components/dto/create-menu-component.dto';
import { PutPerformanceDto } from './builder-v2/dto/builder-v2.dto';
import { parseAmount } from './digifood/services/digifood-csv-import.service';

/**
 * Chantier décimaux/prix (2026-08) : bornes @Min/@Max sur les montants,
 * transforms virgule-safe, alignement @IsInt sur les colonnes Int,
 * validation du blob spacePrices, parseAmount tolérant aux formats mixtes.
 */
describe('Champs monétaires — validation des DTOs', () => {
  const base = { name: 'Coca 50cl', basePrice: 3.5 };

  describe('CreateMenuItemDto', () => {
    it('accepte un prix décimal positif', async () => {
      const dto = plainToInstance(CreateMenuItemDto, { ...base, basePrice: 12.5 });
      expect(await validate(dto)).toHaveLength(0);
    });

    it('rejette un prix négatif', async () => {
      const dto = plainToInstance(CreateMenuItemDto, { ...base, basePrice: -1 });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'basePrice')?.constraints).toHaveProperty('min');
    });

    it('accepte une TVA à 0 % et rejette une TVA > 100 %', async () => {
      const zero = plainToInstance(CreateMenuItemDto, { ...base, vatRate: 0 });
      expect(await validate(zero)).toHaveLength(0);

      const over = plainToInstance(CreateMenuItemDto, { ...base, vatRate: 150 });
      const errors = await validate(over);
      expect(errors.find((e) => e.property === 'vatRate')?.constraints).toHaveProperty('max');
    });

    it('rejette numberOfPiecesRecipe à 0 (diviseur du coût)', async () => {
      const dto = plainToInstance(CreateMenuItemDto, { ...base, numberOfPiecesRecipe: 0 });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'numberOfPiecesRecipe')?.constraints).toHaveProperty('min');
    });

    it('rejette une remise négative', async () => {
      const dto = plainToInstance(CreateMenuItemDto, { ...base, discountValue: -2 });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'discountValue')?.constraints).toHaveProperty('min');
    });

    describe('spacePrices (blob historiquement non validé)', () => {
      it('accepte la forme { ttc, vatRate } et la forme legacy number', async () => {
        const dto = plainToInstance(CreateMenuItemDto, {
          ...base,
          spacePrices: { s1: { ttc: 6.5, vatRate: 10 }, s2: 4 },
        });
        expect(await validate(dto)).toHaveLength(0);
      });

      it('rejette un ttc négatif, une TVA > 100 et une valeur non numérique', async () => {
        for (const spacePrices of [
          { s1: { ttc: -1 } },
          { s1: { ttc: 5, vatRate: 200 } },
          { s1: 'douze' },
        ]) {
          const dto = plainToInstance(CreateMenuItemDto, { ...base, spacePrices });
          const errors = await validate(dto);
          expect(errors.find((e) => e.property === 'spacePrices')).toBeDefined();
        }
      });
    });
  });

  describe('CreateMarketPriceDto', () => {
    const mpBase = { itemName: 'Tomate', unit: 'kg', goodType: 'Food' };

    it('accepte un prix à 0 (produit offert) et un prix décimal', async () => {
      for (const price of [0, 11.64]) {
        const dto = plainToInstance(CreateMarketPriceDto, { ...mpBase, price });
        expect(await validate(dto)).toHaveLength(0);
      }
    });

    it('rejette un prix négatif et une conversion négative', async () => {
      const dto = plainToInstance(CreateMarketPriceDto, {
        ...mpBase,
        price: -3,
        purchaseUnitConversion: -0.5,
      });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'price')?.constraints).toHaveProperty('min');
      expect(errors.find((e) => e.property === 'purchaseUnitConversion')?.constraints).toHaveProperty('min');
    });
  });

  describe('PutPerformanceDto (colonnes Int vs @IsNumber)', () => {
    it('rejette numberOfPOS fractionnaire (colonne Int — évitait un 500 Postgres)', async () => {
      const dto = plainToInstance(PutPerformanceDto, { numberOfPOS: 2.5 });
      const errors = await validate(dto);
      expect(errors.find((e) => e.property === 'numberOfPOS')?.constraints).toHaveProperty('isInt');
    });

    it('rejette un staffCost négatif, accepte un revenue décimal', async () => {
      const bad = plainToInstance(PutPerformanceDto, { staffCost: -10 });
      expect((await validate(bad)).find((e) => e.property === 'staffCost')).toBeDefined();

      const ok = plainToInstance(PutPerformanceDto, { revenue: 1234.56 });
      expect(await validate(ok)).toHaveLength(0);
    });
  });
});

describe('Transforms virgule-safe (menu-components)', () => {
  it('parse "1,5" en 1.5 (avant : parseFloat tronquait à 1)', async () => {
    const dto = plainToInstance(MenuComponentIngredientLineDto, {
      ingredientId: 'ing-1',
      quantity: '1,5',
    });
    expect(dto.quantity).toBe(1.5);
    expect(await validate(dto)).toHaveLength(0);
  });

  it('parse un objet { numberOfUnits: "2,75" } côté children', () => {
    const dto = plainToInstance(MenuComponentChildLineDto, {
      childId: 'cmp-1',
      quantity: { numberOfUnits: '2,75' },
    });
    expect(dto.quantity).toBe(2.75);
  });

  it('garde le comportement existant sur les nombres et le point décimal', () => {
    expect(plainToInstance(MenuComponentIngredientLineDto, { ingredientId: 'i', quantity: 2.5 }).quantity).toBe(2.5);
    expect(plainToInstance(MenuComponentIngredientLineDto, { ingredientId: 'i', quantity: '2.5' }).quantity).toBe(2.5);
    expect(plainToInstance(MenuComponentIngredientLineDto, { ingredientId: 'i', quantity: 'abc' }).quantity).toBe(0);
  });

  it('rejette numberOfUnitsRecipe à 0 (diviseur), accepte 0.75 (rendement fractionnaire)', async () => {
    const zero = plainToInstance(CreateMenuComponentDto, {
      name: 'Sauce',
      unit: 'kg',
      category: 'Food',
      numberOfUnitsRecipe: 0,
    });
    const errors = await validate(zero);
    expect(errors.find((e) => e.property === 'numberOfUnitsRecipe')?.constraints).toHaveProperty('isPositive');

    const ok = plainToInstance(CreateMenuComponentDto, {
      name: 'Sauce',
      unit: 'kg',
      category: 'Food',
      numberOfUnitsRecipe: 0.75,
    });
    expect(await validate(ok)).toHaveLength(0);
  });
});

describe('parseAmount (import CSV Digifood)', () => {
  it.each([
    ['2,5', 2.5],
    ['2.5', 2.5],
    ['1 234,56', 1234.56],
    ['1 234,56', 1234.56],
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1,234,567', 1234567],
    ['1.234.567', 1234567],
    ['12', 12],
    ['0', 0],
    ['5,5%', 5.5],
    ['12,50€', 12.5],
  ])('parse %s → %s', (raw, expected) => {
    expect(parseAmount(raw as string)).toBe(expected);
  });

  it('retourne NaN pour vide/invalide', () => {
    expect(Number.isNaN(parseAmount(''))).toBe(true);
    expect(Number.isNaN(parseAmount('abc'))).toBe(true);
    expect(Number.isNaN(parseAmount(null as unknown as string))).toBe(true);
  });
});
