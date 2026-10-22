import { Injectable } from '@nestjs/common';
import { CostTrackingSeriesQueryDto } from '../dto/cost-tracking.query.dto';
import { constantBasket, ConstantBasket } from '../cost-tracking-basket.util';
import { averageStaircase, buildArticlePoints, buildIngredientSeries } from '../cost-tracking-series.util';
import { CostTrackingGroupBy, ScopeArticle, SeriesPoint } from '../cost-tracking.types';
import { CostTrackingCatalogService } from './cost-tracking-catalog.service';
import { CostTrackingEvent, CostTrackingEventsService } from './cost-tracking-events.service';
import { CostTrackingRevenueService, ItemRevenue } from './cost-tracking-revenue.service';
import { CostTrackingSnapshotReaderService } from './cost-tracking-snapshot-reader.service';

/** Nombre maximal de lignes en mode article. */
export const MAX_ARTICLE_LINES = 10;

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
  ) {}

  /** Sans groupBy explicite : article si un article ou une catégorie est filtré, catégorie si seul le type l'est, sinon article (top 10). */
  resolveGroupBy(query: CostTrackingSeriesQueryDto): CostTrackingGroupBy {
    // Le mode ingrédient n'a de sens que pour un article précis : sinon retour au mode article.
    if (query.groupBy === 'ingredient') return query.menuItemId ? 'ingredient' : this.resolveGroupBy({ ...query, groupBy: undefined });
    if (query.groupBy) return query.groupBy;
    if (query.menuItemId || query.categoryId) return 'article';
    if (query.typeId) return 'category';
    return 'article';
  }

  async getSeries(tenantId: string, spaceId: string, query: CostTrackingSeriesQueryDto): Promise<CostTrackingSeriesResponse> {
    const groupBy = this.resolveGroupBy(query);
    const period = await this.events.resolvePeriod(tenantId, spaceId, query.from, query.to);
    const [articles, events] = await Promise.all([
      this.catalog.listArticles(tenantId, spaceId, query),
      this.events.listEvents(tenantId, spaceId, period),
    ]);
    const [trackingStartedAt, vatRate] = await Promise.all([
      this.reader.trackingStartedAt(tenantId, articles.map((a) => a.id)),
      this.reader.tenantDefaultVatRate(tenantId),
    ]);
    const base = {
      spaceId, from: period.fromDay, to: period.toDay, timezone: period.timezone, groupBy,
      trackingStartedAt: trackingStartedAt?.toISOString() ?? null, events,
    };

    if (groupBy === 'ingredient') {
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
      const snaps = await this.reader.readForPeriod(tenantId, selected.map((a) => a.id), period.from, period.toExclusive);
      const lines = selected.map((a): CostTrackingLine => {
        const rev = revenueById.get(a.id);
        return {
          key: `article:${a.id}`, kind: 'article', id: a.id, name: a.name, typeName: a.typeName, categoryName: a.categoryName,
          articleCount: 1, revenueHt: rev?.revenueHt ?? null, quantity: rev?.quantity ?? null,
          points: buildArticlePoints(snaps.get(a.id) ?? [], period.from, vatRate),
        };
      });
      return { ...base, truncated, rankedByRevenue: ranked, eventsConsidered: considered, lines };
    }

    const snaps = await this.reader.readForPeriod(tenantId, articles.map((a) => a.id), period.from, period.toExclusive);
    const groups = this.groupArticles(articles, groupBy);
    const aggregate = query.aggregate ?? 'avg';
    const lines = groups
      .map((g): CostTrackingLine => {
        const memberPoints = g.members.map((m) => buildArticlePoints(snaps.get(m.id) ?? [], period.from, vatRate));
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

  /** Mode article : tous si au plus 10, sinon les 10 premiers par CA (repli alphabétique sans vente). */
  private async pickArticles(tenantId: string, spaceId: string, query: CostTrackingSeriesQueryDto, articles: ScopeArticle[], events: CostTrackingEvent[], toExclusive: Date) {
    const empty = new Map<string, ItemRevenue>();
    if (articles.length <= MAX_ARTICLE_LINES || query.menuItemId) {
      return { selected: articles, revenueById: empty, considered: 0, truncated: false, ranked: false };
    }
    const { byItem, considered } = await this.revenue.revenueByItem(tenantId, spaceId, events.map((e) => e.id), toExclusive.getTime() < Date.now());
    const allowed = new Set(articles.map((a) => a.id));
    const ranked = articles
      .filter((a) => allowed.has(a.id) && (byItem.get(a.id)?.revenueHt ?? 0) > 0)
      .sort((a, b) => (byItem.get(b.id)!.revenueHt - byItem.get(a.id)!.revenueHt) || byName(a, b));
    const selected = (ranked.length ? ranked : articles).slice(0, MAX_ARTICLE_LINES);
    return { selected, revenueById: byItem, considered, truncated: true, ranked: ranked.length > 0 };
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
