import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { MarketPriceQueryService } from './market-price-query.service';

/** Profil minimal nécessaire pour scoper une requête par espace accessible. */
type SpaceScopedUser = { id: string; isSuperAdmin: boolean; isOwner: boolean; allSpacesAccess: boolean };

/**
 * Détecte les prix du marché réellement utilisés dans une recette (composant ou item de menu),
 * via leurs ingrédients ou emballages. Sert à la page Stockage, qui ne liste que les produits hors recette.
 */
@Injectable()
export class MarketPriceRecipeUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queryService: MarketPriceQueryService,
  ) {}

  /** Ids des prix du marché du tenant (et de l'espace accessible) présents dans au moins une recette. */
  async findUsedMarketPriceIds(tenantId: string, user?: SpaceScopedUser): Promise<{ marketPriceIds: string[] }> {
    const [ingredients, packagings] = await Promise.all([
      this.prisma.ingredient.findMany({
        where: {
          tenantId,
          deletedAt: null,
          marketPriceId: { not: null },
          OR: [{ componentIngredients: { some: {} } }, { menuItemIngredients: { some: {} } }],
        },
        select: { marketPriceId: true },
        distinct: ['marketPriceId'],
      }),
      this.prisma.packaging.findMany({
        where: {
          tenantId,
          deletedAt: null,
          marketPriceId: { not: null },
          menuItemPackagings: { some: {} },
        },
        select: { marketPriceId: true },
        distinct: ['marketPriceId'],
      }),
    ]);

    const candidateIds = [...new Set([...ingredients, ...packagings].map((r) => r.marketPriceId as string))];
    if (!candidateIds.length) return { marketPriceIds: [] };

    const scope = await this.queryService.spaceScopeFilter(user);
    const prices = await this.prisma.marketPrice.findMany({
      where: { ...scope, tenantId, deletedAt: null, id: { in: candidateIds } },
      select: { id: true },
    });
    return { marketPriceIds: prices.map((p) => p.id) };
  }
}
