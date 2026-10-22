import { ConflictException } from '@nestjs/common';
import { assertBrickUnused, getComponentUsage, getIngredientUsage, getPackagingUsage } from './brick-usage';

function build(counts: Record<string, number>, names: Record<string, string[]>) {
  const table = (key: string, nameField: string) => ({
    count: jest.fn().mockResolvedValue(counts[key] ?? 0),
    findMany: jest.fn().mockResolvedValue((names[key] ?? []).map((name) => ({ [nameField]: { name } }))),
  });
  return {
    componentComponent: table('cc', 'parent'),
    componentIngredient: table('ci', 'component'),
    menuItemComponent: table('mic', 'menuItem'),
    menuItemIngredient: table('mii', 'menuItem'),
    menuItemPackaging: table('mip', 'menuItem'),
  } as any;
}

describe('brick-usage', () => {
  it('composant : cumule parents et articles non supprimés', async () => {
    const prisma = build({ cc: 1, mic: 2 }, { cc: ['Sauce'], mic: ['Burger', 'Menu'] });
    const usage = await getComponentUsage(prisma, 'c1');
    expect(usage).toEqual({ count: 3, examples: ['Sauce', 'Burger', 'Menu'] });
    expect(prisma.componentComponent.count).toHaveBeenCalledWith({ where: { childId: 'c1', parent: { deletedAt: null } } });
    expect(prisma.menuItemComponent.count).toHaveBeenCalledWith({ where: { componentId: 'c1', menuItem: { deletedAt: null } } });
  });

  it('ingrédient : composants et articles, exemples limités à 5 et dédoublonnés', async () => {
    const prisma = build({ ci: 4, mii: 4 }, { ci: ['A', 'B', 'C', 'D'], mii: ['A', 'E', 'F', 'G'] });
    const usage = await getIngredientUsage(prisma, 'i1');
    expect(usage.count).toBe(8);
    expect(usage.examples).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  it('emballage : articles', async () => {
    const usage = await getPackagingUsage(build({ mip: 1 }, { mip: ['Burger'] }), 'p1');
    expect(usage).toEqual({ count: 1, examples: ['Burger'] });
  });

  it('assertBrickUnused : 409 avec message en français, sans effet si inutilisé', () => {
    expect(() => assertBrickUnused({ count: 0, examples: [] })).not.toThrow();
    try {
      assertBrickUnused({ count: 2, examples: ['A', 'B'] });
      fail('doit lever');
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.message).toBe("Utilisé dans 2 élément(s) (exemples : A, B) : retirez-le d'abord des recettes.");
    }
  });
});
