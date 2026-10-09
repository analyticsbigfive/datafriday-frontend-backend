import { MenuItemWeezeventPriceService } from './menu-item-weezevent-price.service';

/** Choix du produit Weezevent par article dans l'application en masse (rattachements lus en une fois). */
describe('MenuItemWeezeventPriceService.applyWeezeventPricesBulk : résolution des rattachements', () => {
  it('une seule lecture des rattachements, une erreur par article non résolu', async () => {
    const prisma = {
      productMapping: {
        findMany: jest.fn().mockResolvedValue([
          { menuItemId: 'mi-2', salesProductId: 'p-a' },
          { menuItemId: 'mi-2', salesProductId: 'p-b' },
          { menuItemId: 'mi-3', salesProductId: 'p-c' },
        ]),
      },
    };
    const service = new MenuItemWeezeventPriceService(prisma as any, {} as any, {} as any, {} as any, {} as any);

    const out = await service.applyWeezeventPricesBulk(
      [{ menuItemId: 'mi-1' }, { menuItemId: 'mi-2' }, { menuItemId: 'mi-3', weezeventProductId: 'p-z' }],
      't1',
    );

    expect(prisma.productMapping.findMany).toHaveBeenCalledTimes(1);
    expect(out.changed).toBe(0);
    expect(out.results.map((r) => r.error)).toEqual([
      'Aucun produit Weezevent mappé à cet article',
      'Plusieurs produits Weezevent mappés à cet article — précisez weezeventProductId',
      "Le produit Weezevent p-z n'est pas mappé à cet article",
    ]);
  });
});
