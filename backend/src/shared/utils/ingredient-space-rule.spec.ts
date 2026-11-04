import { BadRequestException } from '@nestjs/common';
import {
  assertIngredientsAllowedForSpaces,
  findRejectedIngredientNames,
  IngredientSupplierInfo,
} from './ingredient-space-rule';

const ing = (id: string, supplierId: string | null, sites: string[] = [], marketPriceId: string | null = `mp-${id}`): IngredientSupplierInfo => ({
  id,
  name: `Ing ${id}`,
  marketPriceId,
  supplierId,
  supplierSites: sites,
});

describe('findRejectedIngredientNames', () => {
  it('fiche sans espace : aucun contrôle', () => {
    expect(findRejectedIngredientNames([ing('a', null)], [], [])).toEqual([]);
  });
  it('fournisseur sans site : commun, autorisé', () => {
    expect(findRejectedIngredientNames([ing('a', 's1', [])], [], ['sp1'])).toEqual([]);
  });
  it('fournisseur dont un site croise un espace : autorisé', () => {
    expect(findRejectedIngredientNames([ing('a', 's1', ['x', 'sp2'])], [], ['sp1', 'sp2'])).toEqual([]);
  });
  it('fournisseur hors espace : refusé', () => {
    expect(findRejectedIngredientNames([ing('a', 's1', ['x'])], [], ['sp1'])).toEqual(['Ing a']);
  });
  it('ingrédient sans fournisseur : refusé', () => {
    expect(findRejectedIngredientNames([ing('a', null)], [], ['sp1'])).toEqual(['Ing a']);
  });
  it('lignes existantes ignorées (ingrédient ou marketPrice déjà dans la recette)', () => {
    const existing = [ing('a', null), ing('b', 's1', ['x'], 'mp-shared')];
    const lines = [ing('a', null), ing('c', 's1', ['x'], 'mp-shared'), ing('d', null)];
    expect(findRejectedIngredientNames(lines, existing, ['sp1'])).toEqual(['Ing d']);
  });
});

describe('assertIngredientsAllowedForSpaces', () => {
  const rows = [
    { id: 'ok', name: 'Tomate', marketPriceId: 'm1', marketPrice: { supplierId: 's1', supplierRel: { sites: [] } } },
    { id: 'bad', name: 'Beurre', marketPriceId: 'm2', marketPrice: { supplierId: 's2', supplierRel: { sites: ['other'] } } },
    { id: 'none', name: 'Sel', marketPriceId: null, marketPrice: null },
  ];
  const prisma = (): any => ({ ingredient: { findMany: jest.fn().mockResolvedValue(rows) } });

  it('une seule requête, liste les noms refusés', async () => {
    const p = prisma();
    await expect(
      assertIngredientsAllowedForSpaces(p, { tenantId: 't', spaceIds: ['sp1'], ingredientIds: ['ok', 'bad', 'none'] }),
    ).rejects.toThrow(/Beurre, Sel/);
    expect(p.ingredient.findMany).toHaveBeenCalledTimes(1);
  });
  it('lance une BadRequestException en français', async () => {
    await expect(
      assertIngredientsAllowedForSpaces(prisma(), { tenantId: 't', spaceIds: ['sp1'], ingredientIds: ['bad'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('sans espace ou sans ligne : aucune requête', async () => {
    const p = prisma();
    await assertIngredientsAllowedForSpaces(p, { tenantId: 't', spaceIds: [], ingredientIds: ['bad'] });
    await assertIngredientsAllowedForSpaces(p, { tenantId: 't', spaceIds: ['sp1'], ingredientIds: [] });
    expect(p.ingredient.findMany).not.toHaveBeenCalled();
  });
  it('ligne déjà présente en base : acceptée', async () => {
    await expect(
      assertIngredientsAllowedForSpaces(prisma(), {
        tenantId: 't', spaceIds: ['sp1'], ingredientIds: ['bad', 'none'], existingIngredientIds: ['bad', 'none'],
      }),
    ).resolves.toBeUndefined();
  });
});
