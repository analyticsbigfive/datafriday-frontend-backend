import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { parseRecipe } from '../cost-tracking-recipe.util';
import { RecipeLine } from '../cost-tracking.types';

/** Lot réduit : chaque ligne porte un Json `recipe`. */
const RECIPE_BATCH_SIZE = 200;

/** Recettes actuelles (dernier snapshot) de plusieurs articles, pour retrouver les briques du périmètre. */
@Injectable()
export class CostTrackingRecipeReaderService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recette de la version la plus récente de chaque article (clé : menuItemId). Les articles sans snapshot sont absents. */
  async latestRecipes(tenantId: string, itemIds: string[]): Promise<Map<string, RecipeLine[]>> {
    const out = new Map<string, RecipeLine[]>();
    const unique = [...new Set(itemIds.filter(Boolean))];
    for (let i = 0; i < unique.length; i += RECIPE_BATCH_SIZE) {
      const ids = unique.slice(i, i + RECIPE_BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop -- lots séquentiels pour ne pas saturer le pooler
      const rows = await this.prisma.$queryRaw<Array<{ menuItemId: string; recipe: unknown }>>(Prisma.sql`
        SELECT DISTINCT ON ("menuItemId") "menuItemId", "recipe"
        FROM "MenuItemCostSnapshot"
        WHERE "tenantId" = ${tenantId} AND "menuItemId" = ANY(${ids}::text[])
        ORDER BY "menuItemId", "effectiveFrom" DESC, "createdAt" DESC
      `);
      for (const row of rows) out.set(row.menuItemId, parseRecipe(row.recipe));
    }
    return out;
  }
}
