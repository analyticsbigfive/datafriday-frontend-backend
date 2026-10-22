import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { ScopeArticle } from '../cost-tracking.types';
import { CostTrackingSnapshotReaderService } from './cost-tracking-snapshot-reader.service';

export interface CostTrackingCatalog {
  spaceId: string;
  types: Array<{
    id: string;
    name: string;
    categories: Array<{ id: string; name: string; articles: Array<{ id: string; name: string }> }>;
    /** Articles du type sans catégorie. */
    articlesWithoutCategory: Array<{ id: string; name: string }>;
  }>;
  /** Articles du Space Menu sans type. */
  articlesWithoutType: Array<{ id: string; name: string }>;
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

/** Périmètre d'articles de la page (Space Menu de l'espace) et hiérarchie Type > Catégorie > Article. */
@Injectable()
export class CostTrackingCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reader: CostTrackingSnapshotReaderService,
  ) {}

  /** Articles actifs du Space Menu, filtrés par type, catégorie ou article. */
  async listArticles(tenantId: string, spaceId: string, filters: { typeId?: string; categoryId?: string; menuItemId?: string } = {}): Promise<ScopeArticle[]> {
    const rows = await this.prisma.menuItem.findMany({
      where: {
        tenantId,
        deletedAt: null,
        spaceLinks: { some: { spaceId } },
        ...(filters.typeId ? { typeId: filters.typeId } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.menuItemId ? { id: filters.menuItemId } : {}),
      },
      select: {
        id: true,
        name: true,
        typeId: true,
        categoryId: true,
        productType: { select: { name: true } },
        productCategory: { select: { name: true } },
      },
    });
    return rows
      .map((r) => ({
        id: r.id,
        name: r.name,
        typeId: r.typeId,
        typeName: r.productType?.name ?? null,
        categoryId: r.categoryId,
        categoryName: r.productCategory?.name ?? null,
      }))
      .sort(byName);
  }

  /** Lignes de la recette actuelle d'un article (ingrédients, composants, emballages, fils de combo) pour le filtre ingrédient. */
  async getArticleIngredients(tenantId: string, spaceId: string, menuItemId: string) {
    const [article] = await this.listArticles(tenantId, spaceId, { menuItemId });
    if (!article) throw new NotFoundException('Article introuvable dans le menu de cet espace.');
    const recipe = await this.reader.latestRecipe(tenantId, menuItemId);
    const seen = new Set<string>();
    const lines = recipe
      .filter((l) => (seen.has(l.refId) ? false : (seen.add(l.refId), true)))
      .map((l) => ({ id: l.refId, name: l.name ?? '', lineKind: l.kind }))
      .sort(byName);
    return { spaceId, article: { id: article.id, name: article.name }, lines };
  }

  async getCatalog(tenantId: string, spaceId: string): Promise<CostTrackingCatalog> {
    const articles = await this.listArticles(tenantId, spaceId);
    const types = new Map<string, CostTrackingCatalog['types'][number]>();
    const articlesWithoutType: Array<{ id: string; name: string }> = [];
    for (const a of articles) {
      const entry = { id: a.id, name: a.name };
      if (!a.typeId) {
        articlesWithoutType.push(entry);
        continue;
      }
      let type = types.get(a.typeId);
      if (!type) {
        type = { id: a.typeId, name: a.typeName ?? '', categories: [], articlesWithoutCategory: [] };
        types.set(a.typeId, type);
      }
      if (!a.categoryId) {
        type.articlesWithoutCategory.push(entry);
        continue;
      }
      let category = type.categories.find((c) => c.id === a.categoryId);
      if (!category) {
        category = { id: a.categoryId, name: a.categoryName ?? '', articles: [] };
        type.categories.push(category);
      }
      category.articles.push(entry);
    }
    const sorted = [...types.values()].sort(byName);
    for (const t of sorted) t.categories.sort(byName);
    return { spaceId, types: sorted, articlesWithoutType };
  }
}
