import { PrismaService } from '../../../core/database/prisma.service';
import { assertIngredientsAllowedForSpaces } from '../../../shared/utils/ingredient-space-rule';

/**
 * Contrôle espace/fournisseur des lignes d'ingrédients d'un Menu Item.
 * Espaces : ceux du payload s'il en porte, sinon ceux de SpaceMenuItem (source de vérité).
 * Création (menuItemId absent) : toutes les lignes sont nouvelles, sauf en duplication
 * (sourceMenuItemId) où la recette de la fiche source compte comme existante.
 */
export async function assertMenuItemIngredientSpaces(
  prisma: PrismaService,
  args: { tenantId: string; menuItemId?: string; sourceMenuItemId?: unknown; spaceIds?: unknown; ingredientLines: unknown },
): Promise<void> {
  const lines = Array.isArray(args.ingredientLines) ? args.ingredientLines : [];
  const ingredientIds = lines.map((l: any) => l?.ingredientId);
  if (!ingredientIds.length) return;

  let spaceIds: unknown = args.spaceIds;
  if (!Array.isArray(spaceIds) && args.menuItemId) {
    spaceIds = (
      await prisma.spaceMenuItem.findMany({ where: { menuItemId: args.menuItemId }, select: { spaceId: true } })
    ).map((r) => r.spaceId);
  }
  if (!Array.isArray(spaceIds) || !spaceIds.length) return;

  const recipeOf =
    args.menuItemId ?? (typeof args.sourceMenuItemId === 'string' && args.sourceMenuItemId ? args.sourceMenuItemId : undefined);
  const existingIngredientIds = recipeOf
    ? (
        await prisma.menuItemIngredient.findMany({
          where: { menuItemId: recipeOf, menuItem: { tenantId: args.tenantId } },
          select: { ingredientId: true },
        })
      ).map((r) => r.ingredientId)
    : [];

  await assertIngredientsAllowedForSpaces(prisma, { tenantId: args.tenantId, spaceIds, ingredientIds, existingIngredientIds });
}
