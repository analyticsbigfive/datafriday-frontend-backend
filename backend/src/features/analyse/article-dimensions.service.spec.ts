import { ArticleDimensionsService } from './article-dimensions.service';
import { spaceAccessStub } from '../../core/auth/space-access.testing';

describe('ArticleDimensionsService', () => {
  const prisma: any = {
    menuItem: { findMany: jest.fn() },
    menuComponent: { findMany: jest.fn() },
  };
  const service = new ArticleDimensionsService(prisma, spaceAccessStub());

  const mp = (o: any) => ({ id: 'mp', supplier: null, supplierId: null, industrialId: null, supplierRel: null, industrial: null, ...o });
  const item = (o: any) => ({
    id: 'mi', basePrice: 5, numberOfPiecesRecipe: 1, isCombo: false, brand: null, spaceLinks: [],
    ingredients: [], packagings: [], components: [], comboChildren: [], promotion: null, ...o,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.menuComponent.findMany.mockResolvedValue([]);
  });

  it('renvoie marque, industriel, fournisseur par unité vendue', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      item({
        id: 'burger', brand: { name: 'Maison' }, numberOfPiecesRecipe: 2,
        ingredients: [
          { numberOfUnits: 2, ingredient: { costPerRecipeUnit: 1, marketPrice: mp({ supplierId: 's1', supplierRel: { name: 'Metro' }, industrialId: 'i1', industrial: { name: 'Bridor' } }) } },
        ],
        packagings: [{ numberOfUnits: 2, packaging: { costPerRecipeUnit: 1, marketPrice: null } }],
      }),
    ]);
    const { items } = await service.getDimensions('t1');
    expect(items[0]).toMatchObject({
      menuItemId: 'burger',
      brandName: 'Maison',
      industrialShares: [{ industrialId: 'i1', name: 'Bridor', share: 1 }],
      supplierCosts: [{ supplierId: 's1', name: 'Metro', unitCost: 1 }, { supplierId: null, name: null, unitCost: 1 }],
      promotion: null,
      comboChildren: [],
    });
  });

  it('promotion active avec prix de référence ; promotion inactive ignorée', async () => {
    prisma.menuItem.findMany
      .mockResolvedValueOnce([
        item({ id: 'promo', basePrice: 4, promotion: { isActive: true, discountedProductId: 'ref', promotionTypeId: 'pt', promotionType: { name: '2 pour 1' } } }),
        item({ id: 'off', promotion: { isActive: false, discountedProductId: 'ref', promotionTypeId: 'pt', promotionType: { name: 'x' } } }),
      ])
      .mockResolvedValueOnce([{ id: 'ref', basePrice: 6, spaceLinks: [] }]);
    const { items } = await service.getDimensions('t1');
    expect(items[0].promotion).toEqual({ typeId: 'pt', typeName: '2 pour 1', referenceMenuItemId: 'ref', referencePrice: 6, price: 4 });
    expect(items[1].promotion).toBeNull();
  });

  it('combo : poids des enfants au prorata de leur prix', async () => {
    prisma.menuItem.findMany.mockResolvedValue([
      item({ id: 'menu', isCombo: true, comboChildren: [{ childId: 'burger', quantity: 1 }, { childId: 'frites', quantity: 1 }] }),
      item({ id: 'burger', basePrice: 9 }),
      item({ id: 'frites', basePrice: 3 }),
    ]);
    const { items } = await service.getDimensions('t1');
    expect(items[0].comboChildren).toEqual([{ menuItemId: 'burger', weight: 0.75, quantity: 1 }, { menuItemId: 'frites', weight: 0.25, quantity: 1 }]);
  });

  it('avec spaceId : restreint à l\'espace, complète les enfants de combo, prix d\'espace prioritaire', async () => {
    prisma.menuItem.findMany
      .mockResolvedValueOnce([item({ id: 'menu', comboChildren: [{ childId: 'burger', quantity: 1 }] })])
      .mockResolvedValueOnce([item({ id: 'burger', basePrice: 9, spaceLinks: [{ priceTtc: 7 }] })]);
    const { items } = await service.getDimensions('t1', 's1');
    expect(items.map((i) => i.menuItemId)).toEqual(['menu', 'burger']);
    expect(prisma.menuItem.findMany.mock.calls[0][0].where).toMatchObject({ spaceLinks: { some: { spaceId: 's1' } } });
  });

  it('composant : coût ventilé sur les ingrédients du composant', async () => {
    prisma.menuItem.findMany.mockResolvedValue([item({ id: 'a', components: [{ numberOfUnits: 1, componentId: 'c1' }] })]);
    prisma.menuComponent.findMany.mockResolvedValue([
      {
        id: 'c1', unitCost: 4, children: [],
        ingredients: [{ quantity: 1, ingredient: { costPerRecipeUnit: 1, marketPrice: mp({ supplierId: 's9', supplierRel: { name: 'Pomona' }, industrialId: 'i9', industrial: { name: 'McCain' } }) } }],
      },
    ]);
    const { items } = await service.getDimensions('t1');
    expect(items[0].supplierCosts).toEqual([{ supplierId: 's9', name: 'Pomona', unitCost: 4 }]);
    expect(items[0].industrialShares).toEqual([{ industrialId: 'i9', name: 'McCain', share: 1 }]);
  });
});
