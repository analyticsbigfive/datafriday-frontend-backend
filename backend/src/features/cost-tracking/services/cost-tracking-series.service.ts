import { Injectable } from '@nestjs/common';
import { CostTrackingSeriesQueryDto } from '../dto/cost-tracking.query.dto';
import { constantBasket, ConstantBasket } from '../cost-tracking-basket.util';
import { averageStaircase, buildArticlePoints, buildIngredientSeries } from '../cost-tracking-series.util';
import { CostTrackingAggregate, CostTrackingGroupBy, ScopeArticle, SeriesPoint } from '../cost-tracking.types';
import { buildBrickLines } from '../cost-tracking-brick-lines.util';
import { capLines, MAX_ARTICLE_LINES } from '../cost-tracking-line-cap.util';
import { buildSupplierShareLines } from '../cost-tracking-supplier-lines.util';
import { CostTrackingBrickScopeService, BrickScope } from './cost-tracking-brick-scope.service';
import { CostTrackingCatalogService } from './cost-tracking-catalog.service';
import { CostTrackingEvent, CostTrackingEventsService } from './cost-tracking-events.service';
import { CostTrackingRevenueService, ItemRevenue } from './cost-tracking-revenue.service';
import { CostTrackingSnapshotReaderService } from './cost-tracking-snapshot-reader.service';
import { CostTrackingSupplierShareService } from './cost-tracking-supplier-share.service';

export { MAX_ARTICLE_LINES };

export interface CostTrackingLine {
  key: string;
  kind: CostTrackingGroupBy;
  id: string;
  name: string;
  typeName: string | null;
  categoryName: string | null;
  articleCount: number;
  /** CA HT sur la période (mode article classé par CA), sinon null. */
  revenueHt: number | null;
  quantity: number | null;
  /** Mode ingrédient : nature de la ligne de recette (ingrédient, composant, emballage, combo). */
  lineKind?: string;
  /** Type et Catégorie : coûts de début et de fin à panier constant (sert à la variation). */
  basket?: ConstantBasket | null;
  points: SeriesPoint[];
}

export interface CostTrackingSeriesResponse {
  spaceId: string;
  from: string;
  to: string;
  timezone: string;
  groupBy: CostTrackingGroupBy;
  /** Début du suivi (premier snapshot du périmètre), null si aucun : sert à la notice « suivi actif depuis ». */
  trackingStartedAt: string | null;
  /** true : plus de 10 articles correspondaient aux filtres, seuls les 10 premiers sont renvoyés. */
  truncated: boolean;
  rankedByRevenue: boolean;
  eventsConsidered: number;
  lines: CostTrackingLine[];
  events: CostTrackingEvent[];
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' });

/** Séries de coût par pièce et de prix pour le graphique Cost tracking. */
@Injectable()
export class CostTrackingSeriesService {
  constructor(
    private readonly catalog: CostTrackingCatalogService,
    private readonly events: CostTrackingEventsService,
    private readonly revenue: CostTrackingRevenueService,
    private readonly reader: CostTrackingSnapshotReaderService,
    private readonly brickScope: CostTrackingBrickScopeService,
    private readonly shares: CostTrackingSupplierShareService,
  ) {}

  /** Sans groupBy explicite : article si un article ou une catégorie est filtré, catégorie si seul le type l'est, sinon article (top 10). */
  resolveGroupBy(query: CostTrackingSeriesQueryDto): CostTrackingGroupBy {
    // Ingrédient avec un article : recette de cet article. Sans article : briques de tout le périmètre.
    if (query.groupBy) return query.groupBy;
    if (query.menuItemId || query.categoryId) return 'article';
    if (query.typeId) return 'category';
    return 'article';
  }

  async getSeries(tenantId: string, spaceId: string, query: CostTrackingSeriesQueryDto): Promise<CostTrackingSeriesResponse> {
    const groupBy = this.resolveGroupBy(query);
    const period = await this.events.resolvePeriod(tenantId, spaceId, query.from, query.to);
    const [listed, events] = await Promise.all([
      this.catalog.listArticles(tenantId, spaceId, query),
      this.events.listEvents(tenantId, spaceId, period),
    ]);
    // Mode recette d'un article : les filtres Fournisseur et Composant ne s'appliquent pas.
    const recipeMode = groupBy === 'ingredient' && !!query.menuItemId;
    const brickMode = !recipeMode && (groupBy === 'ingredient' || groupBy === 'supplier' || groupBy === 'component');
    let scope: BrickScope | null = null;
    let articles = listed;
    if (!recipeMode && (brickMode || query.supplierKey || query.componentId)) {
      scope = await this.brickScope.resolve(tenantId, listed, query, period.from, period.toExclusive, brickMode, groupBy === 'supplier');
      articles = scope.articles;
    }
    const [trackingStartedAt, vatRate] = await Promise.all([
      this.reader.trackingStartedAt(tenantId, articles.map((a) => a.id)),
      this.reader.tenantDefaultVatRate(tenantId),
    ]);
    const base = {
      spaceId, from: period.fromDay, to: period.toDay, timezone: period.timezone, groupBy,
      trackingStartedAt: trackingStartedAt?.toISOString() ?? null, events,
    };

    if (scope && brickMode) {
      const aggregate = query.aggregate ?? 'avg';
      if (groupBy === 'supplier') return { ...base, ...(await this.supplierLines(tenantId, spaceId, query, scope, events, period, aggregate, vatRate)) };
      const mode = groupBy as 'ingredient' | 'component';
      const only = mode === 'ingredient' ? query.ingredientId : query.componentId;
      const candidates = scope.bricks
        .filter((b) => (mode === 'component' ? b.kind === 'component' : b.kind !== 'component'))
        .filter((b) => !only || b.refId === only);
      const capped = only ? { selected: candidates, truncated: false, ranked: false, considered: 0 } : await this.capByRevenue(tenantId, spaceId, candidates, events, period.toExclusive);
      let lines = buildBrickLines(capped.selected, mode, period.from);
      if (capped.truncated) lines = this.inOrder(lines, capped.selected.map((b) => `${mode}:${b.refId}`));
      return { ...base, truncated: capped.truncated, rankedByRevenue: capped.ranked, eventsConsidered: capped.considered, lines };
    }

    if (recipeMode) {
      const article = articles[0];
      const snaps = article ? await this.reader.readRecipesForPeriod(tenantId, article.id, period.from, period.toExclusive) : [];
      const lines = buildIngredientSeries(snaps, period.from)
        .filter((l) => !query.ingredientId || l.refId === query.ingredientId)
        .map((l): CostTrackingLine => ({
          key: `ingredient:${l.refId}`, kind: 'ingredient', id: l.refId, name: l.name, lineKind: l.kind,
          typeName: article?.typeName ?? null, categoryName: article?.categoryName ?? null,
          articleCount: 1, revenueHt: null, quantity: null, points: l.points,
        }))
        .sort(byName);
      return { ...base, truncated: false, rankedByRevenue: false, eventsConsidered: 0, lines };
    }

    if (groupBy === 'article') {
      const { selected, revenueById, considered, truncated, ranked } = await this.pickArticles(tenantId, spaceId, query, articles, events, period.toExclusive);
      const pointsById = await this.articlePoints(tenantId, selected.map((a) => a.id), query.supplierKey, scope, period, vatRate);
      const lines = selected.map((a): CostTrackingLine => {
        const rev = revenueById.get(a.id);
        return {
          key: `article:${a.id}`, kind: 'article', id: a.id, name: a.name, typeName: a.typeName, categoryName: a.categoryName,
          articleCount: 1, revenueHt: rev?.revenueHt ?? null, quantity: rev?.quantity ?? null,
          points: pointsById.get(a.id) ?? [],
        };
      }).filter((l) => !query.supplierKey || l.points.length > 0);
      return { ...base, truncated, rankedByRevenue: ranked, eventsConsidered: considered, lines };
    }

    const pointsById = await this.articlePoints(tenantId, articles.map((a) => a.id), query.supplierKey, scope, period, vatRate);
    const groups = this.groupArticles(articles, groupBy as 'category' | 'type');
    const aggregate = query.aggregate ?? 'avg';
    const lines = groups
      .map((g): CostTrackingLine => {
        const memberPoints = g.members.map((m) => pointsById.get(m.id) ?? []);
        return {
          key: `${groupBy}:${g.id}`, kind: groupBy, id: g.id, name: g.name,
          typeName: g.typeName, categoryName: groupBy === 'category' ? g.name : null,
          articleCount: g.members.length, revenueHt: null, quantity: null,
          basket: constantBasket(memberPoints, aggregate),
          points: averageStaircase(memberPoints, aggregate),
        };
      })
      .filter((l) => l.points.length > 0)
      .sort(byName);
    return { ...base, truncated: false, rankedByRevenue: false, eventsConsidered: 0, lines };
  }

  /**
   * Points de coût par pièce de chaque article. Avec un filtre Fournisseur, le coût d'un article est sa
   * part venant de ce fournisseur (à chaque date), sinon son coût entier.
   */
  private async articlePoints(
    tenantId: string, ids: string[], supplierKey: string | undefined, scope: BrickScope | null, period: { from: Date; toExclusive: Date }, vatRate: number | null,
  ): Promise<Map<string, SeriesPoint[]>> {
    const out = new Map<string, SeriesPoint[]>();
    if (supplierKey && scope) {
      const shares = await this.shares.articleShares(tenantId, ids, scope, period.from, period.toExclusive, vatRate);
      for (const id of ids) out.set(id, shares.get(id)?.get(supplierKey)?.points ?? []);
      return out;
    }
    const snaps = await this.reader.readForPeriod(tenantId, ids, period.from, period.toExclusive);
    for (const id of ids) out.set(id, buildArticlePoints(snaps.get(id) ?? [], period.from, vatRate));
    return out;
  }

  /** Mode fournisseur : part de coût de chaque fournisseur, plafonnée comme le mode article (CA des articles concernés). */
  private async supplierLines(
    tenantId: string, spaceId: string, query: CostTrackingSeriesQueryDto, scope: BrickScope, events: CostTrackingEvent[],
    period: { from: Date; toExclusive: Date }, aggregate: CostTrackingAggregate, vatRate: number | null,
  ) {
    let entries = [...(scope.suppliers?.values() ?? [])].map((e) => ({ key: e.key, name: e.name, articleIds: [...e.articleIds] }));
    if (query.supplierKey) entries = entries.filter((e) => e.key === query.supplierKey);
    const capped = await this.capByRevenue(tenantId, spaceId, entries, events, period.toExclusive);
    const ids = [...new Set(capped.selected.flatMap((e) => e.articleIds))];
    const shares = await this.shares.articleShares(tenantId, ids, scope, period.from, period.toExclusive, vatRate);
    const lines = buildSupplierShareLines(capped.selected, shares, aggregate);
    return { truncated: capped.truncated, rankedByRevenue: capped.ranked, eventsConsidered: capped.considered, lines };
  }

  /** Plafond de lignes commun aux modes fournisseur, composant et ingrédient : lit le CA seulement s'il y a trop de lignes. */
  private async capByRevenue<T extends { name: string; articleIds: string[] }>(
    tenantId: string, spaceId: string, candidates: T[], events: CostTrackingEvent[], toExclusive: Date,
  ) {
    if (candidates.length <= MAX_ARTICLE_LINES) return { selected: candidates, truncated: false, ranked: false, considered: 0 };
    const { byItem, considered } = await this.revenue.revenueByItem(tenantId, spaceId, events.map((e) => e.id), toExclusive.getTime() < Date.now());
    const capped = capLines(candidates, new Map([...byItem].map(([id, r]) => [id, r.revenueHt])));
    return { ...capped, considered };
  }

  private inOrder(lines: CostTrackingLine[], keys: string[]): CostTrackingLine[] {
    const rank = new Map(keys.map((k, i) => [k, i]));
    return [...lines].sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0));
  }

  /** Mode article : tous si au plus 10, sinon les 10 premiers par CA (repli alphabétique sans vente). */
  private async pickArticles(tenantId: string, spaceId: string, query: CostTrackingSeriesQueryDto, articles: ScopeArticle[], events: CostTrackingEvent[], toExclusive: Date) {
    const empty = new Map<string, ItemRevenue>();
    if (articles.length <= MAX_ARTICLE_LINES || query.menuItemId) {
      return { selected: articles, revenueById: empty, considered: 0, truncated: false, ranked: false };
    }
    const { byItem, considered } = await this.revenue.revenueByItem(tenantId, spaceId, events.map((e) => e.id), toExclusive.getTime() < Date.now());
    const capped = capLines(articles.map((a) => ({ a, name: a.name, articleIds: [a.id] })), new Map([...byItem].map(([id, r]) => [id, r.revenueHt])));
    return { selected: capped.selected.map((c) => c.a), revenueById: byItem, considered, truncated: true, ranked: capped.ranked };
  }

  private groupArticles(articles: ScopeArticle[], groupBy: 'category' | 'type') {
    const groups = new Map<string, { id: string; name: string; typeName: string | null; members: ScopeArticle[] }>();
    for (const a of articles) {
      const id = groupBy === 'type' ? a.typeId : a.categoryId;
      if (!id) continue;
      const entry = groups.get(id) ?? { id, name: (groupBy === 'type' ? a.typeName : a.categoryName) ?? '', typeName: a.typeName, members: [] };
      entry.members.push(a);
      groups.set(id, entry);
    }
    return [...groups.values()];
  }
}
