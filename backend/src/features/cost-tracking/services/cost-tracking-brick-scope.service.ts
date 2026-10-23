import { Injectable } from '@nestjs/common';
import {
  articlesUsing, articlesWithComponent, brickKey, collectRecipeBricks, ResolvedBrick, resolveBricks, ScopeBrick, SupplierOption,
} from '../cost-tracking-brick-scope.util';
import { ComponentLeaf } from '../cost-tracking-component-leaves.util';
import { collectSupplierScope, componentIdsOf, leafIngredientIds, SupplierScopeEntry, supplierOptionsOf } from '../cost-tracking-supplier-scope.util';
import { BrickKind, BrickSnapshotPoint, RecipeLine, ScopeArticle } from '../cost-tracking.types';
import { CostTrackingBrickReaderService } from './cost-tracking-brick-reader.service';
import { CostTrackingComponentGraphService } from './cost-tracking-component-graph.service';
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
  /**
   * Fournisseurs actifs sur la période (clé de fournisseur) avec leurs articles, null si le périmètre
   * fournisseur n'a pas été demandé. Contient toutes les versions lues (ingrédients des composants compris).
   */
  suppliers: Map<string, SupplierScopeEntry> | null;
  /** Versions de brique lues (clé `kind:refId`), vide si `suppliers` est null et versions non demandées. */
  versions: Map<string, BrickSnapshotPoint[]>;
  /** Ingrédients porteurs de chaque composant (composition actuelle), vide si `suppliers` est null. */
  leaves: Map<string, ComponentLeaf[]>;
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
    private readonly graph: CostTrackingComponentGraphService,
  ) {}

  /**
   * Applique les filtres Composant (articles contenant le composant) et Fournisseur (articles dont une
   * brique, ou un ingrédient d'un composant, a eu ce fournisseur à un moment de la période ; briques
   * concernées). `from` / `toExclusive` : la période de lecture des versions ; `withVersions` false les
   * saute. `withSuppliers` (ou le filtre Fournisseur) calcule aussi `suppliers`, `leaves` et lit les versions.
   */
  async resolve(
    tenantId: string, articles: ScopeArticle[], filters: BrickScopeFilters, from: Date, toExclusive: Date, withVersions = true, withSuppliers = false,
  ): Promise<BrickScope> {
    const recipes = await this.recipes.latestRecipes(tenantId, articles.map((a) => a.id));
    let kept = articles;
    if (filters.componentId) {
      const withComponent = articlesWithComponent(recipes, filters.componentId);
      kept = articles.filter((a) => withComponent.has(a.id));
      for (const id of recipes.keys()) if (!withComponent.has(id)) recipes.delete(id);
    }
    const scopeBricks = collectRecipeBricks(recipes);
    const needSuppliers = withSuppliers || !!filters.supplierKey;
    const versions = withVersions || needSuppliers ? await this.readVersions(tenantId, scopeBricks, from, toExclusive) : new Map<string, BrickSnapshotPoint[]>();
    let resolved = resolveBricks(scopeBricks.values(), versions);
    let suppliers: Map<string, SupplierScopeEntry> | null = null;
    let leaves = new Map<string, ComponentLeaf[]>();
    if (needSuppliers) {
      ({ suppliers, leaves } = await this.supplierScope(tenantId, recipes, versions, from, toExclusive));
      if (filters.supplierKey) {
        const entry = suppliers.get(filters.supplierKey);
        resolved = resolved.filter((b) => entry?.brickKeys.has(brickKey(b.kind, b.refId)));
        kept = kept.filter((a) => entry?.articleIds.has(a.id));
      }
    }
    return { articles: kept, bricks: resolved, suppliers, versions, leaves };
  }

  /** Menus déroulants : fournisseurs actifs sur la période et composants des articles filtrés. */
  async getOptions(tenantId: string, spaceId: string, articles: ScopeArticle[], from: Date, toExclusive: Date): Promise<CostTrackingOptions> {
    const recipes = await this.recipes.latestRecipes(tenantId, articles.map((a) => a.id));
    const scopeBricks = collectRecipeBricks(recipes);
    const versions = await this.readVersions(tenantId, scopeBricks, from, toExclusive);
    const { suppliers } = await this.supplierScope(tenantId, recipes, versions, from, toExclusive);
    const components = resolveBricks(scopeBricks.values(), versions)
      .filter((b) => b.kind === 'component')
      .map((b) => ({ id: b.refId, name: b.name, articleCount: b.articleIds.length }))
      .sort(byName);
    return { spaceId, suppliers: supplierOptionsOf(suppliers), components };
  }

  /** Charge la composition des composants, lit les versions de leurs ingrédients (ajoutées à `versions`) et calcule les fournisseurs. */
  private async supplierScope(tenantId: string, recipes: Map<string, RecipeLine[]>, versions: Map<string, BrickSnapshotPoint[]>, from: Date, toExclusive: Date) {
    const leaves = await this.graph.leavesFor(componentIdsOf(recipes));
    const extra = new Map<string, ScopeBrick>();
    for (const refId of leafIngredientIds(leaves)) {
      const key = brickKey('ingredient', refId);
      if (!versions.has(key)) extra.set(key, { kind: 'ingredient', refId, name: '', articleIds: [] });
    }
    for (const [key, points] of await this.readVersions(tenantId, extra, from, toExclusive)) versions.set(key, points);
    return { suppliers: collectSupplierScope(recipes, versions, leaves), leaves };
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
