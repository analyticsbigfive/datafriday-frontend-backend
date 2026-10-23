import { Injectable } from '@nestjs/common';
import {
  articlesUsing, articlesWithComponent, brickKey, collectRecipeBricks, listSuppliers, ResolvedBrick, resolveBricks, ScopeBrick, SupplierOption,
} from '../cost-tracking-brick-scope.util';
import { BrickKind, BrickSnapshotPoint, ScopeArticle } from '../cost-tracking.types';
import { CostTrackingBrickReaderService } from './cost-tracking-brick-reader.service';
import { CostTrackingRecipeReaderService } from './cost-tracking-recipe-reader.service';

export interface BrickScopeFilters {
  supplierKey?: string;
  componentId?: string;
}

export interface BrickScope {
  /** Articles restants après les filtres Composant et Fournisseur. */
  articles: ScopeArticle[];
  /** Briques de ces articles (après filtre Fournisseur). */
  bricks: ResolvedBrick[];
}

export interface CostTrackingOptions {
  spaceId: string;
  suppliers: SupplierOption[];
  components: Array<{ id: string; name: string; articleCount: number }>;
}

const KINDS: BrickKind[] = ['ingredient', 'packaging', 'component'];
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

/**
 * Périmètre de briques de la page : les briques utilisées par la recette ACTUELLE (dernier snapshot)
 * des articles filtrés, avec leurs versions de coût lues dans `BrickCostSnapshot`. Choix de la
 * recette actuelle : une seule lecture par article, et le Json `recipe` figé porte déjà les ids
 * de brique. Une brique retirée depuis de toutes les recettes n'apparaît plus.
 */
@Injectable()
export class CostTrackingBrickScopeService {
  constructor(
    private readonly recipes: CostTrackingRecipeReaderService,
    private readonly bricks: CostTrackingBrickReaderService,
  ) {}

  /**
   * Applique les filtres Composant (articles contenant le composant) et Fournisseur (briques dont le
   * fournisseur en vigueur en fin de période correspond ; articles qui en contiennent une).
   * `from` / `toExclusive` : la période de lecture des versions ; `withVersions` false les saute (sauf filtre Fournisseur qui en a besoin).
   */
  async resolve(tenantId: string, articles: ScopeArticle[], filters: BrickScopeFilters, from: Date, toExclusive: Date, withVersions = true): Promise<BrickScope> {
    const recipes = await this.recipes.latestRecipes(tenantId, articles.map((a) => a.id));
    let kept = articles;
    if (filters.componentId) {
      const withComponent = articlesWithComponent(recipes, filters.componentId);
      kept = articles.filter((a) => withComponent.has(a.id));
      for (const id of recipes.keys()) if (!withComponent.has(id)) recipes.delete(id);
    }
    const scopeBricks = collectRecipeBricks(recipes);
    const versions = withVersions || filters.supplierKey ? await this.readVersions(tenantId, scopeBricks, from, toExclusive) : new Map<string, BrickSnapshotPoint[]>();
    let resolved = resolveBricks(scopeBricks.values(), versions);
    if (filters.supplierKey) {
      resolved = resolved.filter((b) => b.supplierKey === filters.supplierKey);
      kept = articlesUsing(kept, resolved);
    }
    return { articles: kept, bricks: resolved };
  }

  /** Menus déroulants : fournisseurs (fournisseur actuel de chaque brique) et composants des articles filtrés. */
  async getOptions(tenantId: string, spaceId: string, articles: ScopeArticle[]): Promise<CostTrackingOptions> {
    const recipes = await this.recipes.latestRecipes(tenantId, articles.map((a) => a.id));
    const scopeBricks = collectRecipeBricks(recipes);
    const latest = new Map<string, BrickSnapshotPoint[]>();
    for (const kind of KINDS) {
      const ids = [...scopeBricks.values()].filter((b) => b.kind === kind).map((b) => b.refId);
      // eslint-disable-next-line no-await-in-loop -- lectures séquentielles pour ne pas saturer le pooler
      const rows = await this.bricks.latestForBricks(tenantId, kind, ids);
      for (const [refId, point] of rows) latest.set(brickKey(kind, refId), [point]);
    }
    const resolved = resolveBricks(scopeBricks.values(), latest);
    const components = resolved
      .filter((b) => b.kind === 'component')
      .map((b) => ({ id: b.refId, name: b.name, articleCount: b.articleIds.length }))
      .sort(byName);
    return { spaceId, suppliers: listSuppliers(resolved), components };
  }

  private async readVersions(tenantId: string, bricks: Map<string, ScopeBrick>, from: Date, toExclusive: Date) {
    const out = new Map<string, BrickSnapshotPoint[]>();
    for (const kind of KINDS) {
      const ids = [...bricks.values()].filter((b) => b.kind === kind).map((b) => b.refId);
      if (!ids.length) continue;
      // eslint-disable-next-line no-await-in-loop -- lectures séquentielles pour ne pas saturer le pooler
      const byRef = await this.bricks.readForPeriod(tenantId, kind, ids, from, toExclusive);
      for (const [refId, points] of byRef) out.set(brickKey(kind, refId), points);
    }
    return out;
  }
}
