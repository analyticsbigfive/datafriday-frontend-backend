import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { parseRecipe } from '../cost-tracking-recipe.util';
import { RecipeLine, SnapshotPoint, SnapshotWithRecipe } from '../cost-tracking.types';

/** Taille de lot : borne le nombre d'identifiants passés à une requête. */
const READ_BATCH_SIZE = 500;
/** Lot de la lecture multi-instants : un seul paramètre tableau, donc un lot plus large reste sûr. */
const MANY_BATCH_SIZE = 2000;
/** Lot réduit des lectures avec Json `recipe`. */
const RECIPE_BATCH_SIZE = 100;

type RawSnapshot = {
  id: string;
  menuItemId: string;
  effectiveFrom: Date;
  costPerPiece: Prisma.Decimal | number | string;
  totalCost: Prisma.Decimal | number | string;
  numberOfPieces: number;
  basePrice: Prisma.Decimal | number | string | null;
  vatRate?: Prisma.Decimal | number | string | null;
  reason: string;
};

const SNAPSHOT_COLUMNS = Prisma.sql`"id", "menuItemId", "effectiveFrom", "costPerPiece", "totalCost", "numberOfPieces", "basePrice", "vatRate", "reason"`;

/**
 * Lectures de l'historique `MenuItemCostSnapshot`, sans jamais charger le Json `recipe`.
 * Toutes les requêtes passent par l'index (tenantId, menuItemId, effectiveFrom desc).
 */
@Injectable()
export class CostTrackingSnapshotReaderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Versions utiles à une période : le dernier snapshot antérieur à `from` (valeur déjà en
   * vigueur) puis tous ceux de [from, toExclusive). Triées par article puis date croissante.
   */
  async readForPeriod(tenantId: string, itemIds: string[], from: Date, toExclusive: Date): Promise<Map<string, SnapshotPoint[]>> {
    const out = new Map<string, SnapshotPoint[]>();
    for (let i = 0; i < itemIds.length; i += READ_BATCH_SIZE) {
      const ids = itemIds.slice(i, i + READ_BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop -- lots séquentiels pour ne pas saturer le pooler
      const [carry, changes] = await Promise.all([
        this.latestBefore(tenantId, ids, from),
        this.prisma.$queryRaw<RawSnapshot[]>(Prisma.sql`
          SELECT ${SNAPSHOT_COLUMNS}
          FROM "MenuItemCostSnapshot"
          WHERE "tenantId" = ${tenantId} AND "menuItemId" = ANY(${ids}::text[])
            AND "effectiveFrom" >= ${from} AND "effectiveFrom" < ${toExclusive}
          ORDER BY "menuItemId", "effectiveFrom", "createdAt"
        `),
      ]);
      for (const row of [...carry, ...changes]) {
        const point = this.toPoint(row);
        const list = out.get(point.menuItemId);
        if (list) list.push(point);
        else out.set(point.menuItemId, [point]);
      }
    }
    return out;
  }

  /**
   * Version en vigueur à l'instant `at` pour chaque article : le dernier snapshot de date <= `at`,
   * sinon (event antérieur au suivi) le TOUT PREMIER snapshot, marqué `baseline`. Deux
   * `DISTINCT ON` par lot de 500 articles au plus.
   */
  async readAsOf(tenantId: string, itemIds: string[], at: Date): Promise<Map<string, { snapshot: SnapshotPoint; source: 'snapshot' | 'baseline' }>> {
    const out = new Map<string, { snapshot: SnapshotPoint; source: 'snapshot' | 'baseline' }>();
    const unique = [...new Set(itemIds.filter(Boolean))];
    for (let i = 0; i < unique.length; i += READ_BATCH_SIZE) {
      const ids = unique.slice(i, i + READ_BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop -- lots séquentiels pour ne pas saturer le pooler
      const current = await this.latestBefore(tenantId, ids, at, true);
      for (const row of current) out.set(row.menuItemId, { snapshot: this.toPoint(row), source: 'snapshot' });
      const missing = ids.filter((id) => !out.has(id));
      if (!missing.length) continue;
      // eslint-disable-next-line no-await-in-loop
      const firsts = await this.firstOf(tenantId, missing);
      for (const row of firsts) out.set(row.menuItemId, { snapshot: this.toPoint(row), source: 'baseline' });
    }
    return out;
  }

  /**
   * Même résultat que `readAsOf`, pour plusieurs instants à la fois (rapports par event) : une
   * seule lecture des versions <= au plus tardif des instants, résolue en mémoire pour chaque
   * instant, plus une lecture de repli (premier snapshot) pour les articles sans version. Deux
   * requêtes par lot de 2000 articles, quel que soit le nombre d'instants. Clé du résultat :
   * `Date.getTime()` de l'instant.
   */
  async readAsOfMany(
    tenantId: string,
    itemIds: string[],
    instants: Date[],
  ): Promise<Map<number, Map<string, { snapshot: SnapshotPoint; source: 'snapshot' | 'baseline' }>>> {
    const times = [...new Set(instants.map((d) => d.getTime()))].sort((a, b) => a - b);
    const out = new Map<number, Map<string, { snapshot: SnapshotPoint; source: 'snapshot' | 'baseline' }>>();
    for (const t of times) out.set(t, new Map());
    const unique = [...new Set(itemIds.filter(Boolean))];
    if (!times.length || !unique.length) return out;
    const latest = new Date(times[times.length - 1]);
    for (let i = 0; i < unique.length; i += MANY_BATCH_SIZE) {
      const ids = unique.slice(i, i + MANY_BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop -- lots séquentiels pour ne pas saturer le pooler
      const rows = await this.prisma.$queryRaw<RawSnapshot[]>(Prisma.sql`
        SELECT ${SNAPSHOT_COLUMNS}
        FROM "MenuItemCostSnapshot"
        WHERE "tenantId" = ${tenantId} AND "menuItemId" = ANY(${ids}::text[]) AND "effectiveFrom" <= ${latest}
        ORDER BY "menuItemId", "effectiveFrom", "createdAt"
      `);
      // Par article, versions triées par date croissante (à égalité, la plus récente créée en dernier).
      const byItem = new Map<string, SnapshotPoint[]>();
      for (const row of rows) {
        const point = this.toPoint(row);
        const list = byItem.get(point.menuItemId);
        if (list) list.push(point);
        else byItem.set(point.menuItemId, [point]);
      }
      for (const [menuItemId, list] of byItem) {
        for (const t of times) {
          // Dernière version de date <= t (recherche dichotomique sur la liste triée).
          let lo = 0;
          let hi = list.length;
          while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (list[mid].effectiveFrom.getTime() <= t) lo = mid + 1;
            else hi = mid;
          }
          if (lo > 0) out.get(t)!.set(menuItemId, { snapshot: list[lo - 1], source: 'snapshot' });
        }
      }
      // Repli : un article sans version à au moins un des instants prend sa toute première version.
      const needFallback = ids.filter((id) => times.some((t) => !out.get(t)!.has(id)));
      if (!needFallback.length) continue;
      // eslint-disable-next-line no-await-in-loop
      const firsts = await this.firstOf(tenantId, needFallback);
      for (const row of firsts) {
        const point = this.toPoint(row);
        for (const t of times) {
          const m = out.get(t)!;
          if (!m.has(point.menuItemId)) m.set(point.menuItemId, { snapshot: point, source: 'baseline' });
        }
      }
    }
    return out;
  }


  /**
   * Versions d'UN article avec leur recette figée (mode ingrédient) : le dernier snapshot
   * antérieur à `from` puis ceux de [from, toExclusive), par date croissante. Un seul article,
   * donc le Json `recipe` reste borné.
   */
  async readRecipesForPeriod(tenantId: string, itemId: string, from: Date, toExclusive: Date): Promise<SnapshotWithRecipe[]> {
    const columns = Prisma.sql`${SNAPSHOT_COLUMNS}, "recipe"`;
    const [carry, changes] = await Promise.all([
      this.prisma.$queryRaw<Array<RawSnapshot & { recipe: unknown }>>(Prisma.sql`
        SELECT ${columns} FROM "MenuItemCostSnapshot"
        WHERE "tenantId" = ${tenantId} AND "menuItemId" = ${itemId} AND "effectiveFrom" < ${from}
        ORDER BY "effectiveFrom" DESC, "createdAt" DESC LIMIT 1
      `),
      this.prisma.$queryRaw<Array<RawSnapshot & { recipe: unknown }>>(Prisma.sql`
        SELECT ${columns} FROM "MenuItemCostSnapshot"
        WHERE "tenantId" = ${tenantId} AND "menuItemId" = ${itemId}
          AND "effectiveFrom" >= ${from} AND "effectiveFrom" < ${toExclusive}
        ORDER BY "effectiveFrom", "createdAt"
      `),
    ]);
    return [...carry, ...changes].map((row) => ({ ...this.toPoint(row), recipe: this.toRecipe(row.recipe) }));
  }

  /**
   * Même lecture que `readRecipesForPeriod` pour plusieurs articles (part fournisseur). Lots réduits :
   * chaque ligne porte un Json `recipe`. Clé du résultat : menuItemId.
   */
  async readRecipesForPeriodMany(tenantId: string, itemIds: string[], from: Date, toExclusive: Date): Promise<Map<string, SnapshotWithRecipe[]>> {
    const out = new Map<string, SnapshotWithRecipe[]>();
    const unique = [...new Set(itemIds.filter(Boolean))];
    const columns = Prisma.sql`${SNAPSHOT_COLUMNS}, "recipe"`;
    for (let i = 0; i < unique.length; i += RECIPE_BATCH_SIZE) {
      const ids = unique.slice(i, i + RECIPE_BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop -- lots séquentiels pour ne pas saturer le pooler
      const [carry, changes] = await Promise.all([
        this.prisma.$queryRaw<Array<RawSnapshot & { recipe: unknown }>>(Prisma.sql`
          SELECT DISTINCT ON ("menuItemId") ${columns} FROM "MenuItemCostSnapshot"
          WHERE "tenantId" = ${tenantId} AND "menuItemId" = ANY(${ids}::text[]) AND "effectiveFrom" < ${from}
          ORDER BY "menuItemId", "effectiveFrom" DESC, "createdAt" DESC
        `),
        this.prisma.$queryRaw<Array<RawSnapshot & { recipe: unknown }>>(Prisma.sql`
          SELECT ${columns} FROM "MenuItemCostSnapshot"
          WHERE "tenantId" = ${tenantId} AND "menuItemId" = ANY(${ids}::text[])
            AND "effectiveFrom" >= ${from} AND "effectiveFrom" < ${toExclusive}
          ORDER BY "menuItemId", "effectiveFrom", "createdAt"
        `),
      ]);
      for (const row of [...carry, ...changes]) {
        const point: SnapshotWithRecipe = { ...this.toPoint(row), recipe: this.toRecipe(row.recipe) };
        const list = out.get(point.menuItemId);
        if (list) list.push(point);
        else out.set(point.menuItemId, [point]);
      }
    }
    return out;
  }

  /** Recette de la version la plus récente d'un article (lignes disponibles pour le filtre ingrédient). */
  async latestRecipe(tenantId: string, itemId: string): Promise<RecipeLine[]> {
    const row = await this.prisma.menuItemCostSnapshot.findFirst({
      where: { tenantId, menuItemId: itemId },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      select: { recipe: true },
    });
    return this.toRecipe(row?.recipe);
  }

  private toRecipe(value: unknown): RecipeLine[] {
    return parseRecipe(value);
  }

  /** Taux de TVA par défaut du tenant (dernière configuration), null s'il n'y en a pas. */
  async tenantDefaultVatRate(tenantId: string): Promise<number | null> {
    const cfg = await this.prisma.tenantVatConfig.findFirst({
      where: { tenantId },
      orderBy: { effectiveFrom: 'desc' },
      select: { defaultVatRate: true },
    });
    const n = cfg ? Number(cfg.defaultVatRate) : NaN;
    return Number.isFinite(n) ? n : null;
  }

  /** Date du tout premier snapshot du périmètre (début du suivi), null si aucun. */
  async trackingStartedAt(tenantId: string, itemIds: string[]): Promise<Date | null> {
    if (!itemIds.length) return null;
    let min: Date | null = null;
    for (let i = 0; i < itemIds.length; i += READ_BATCH_SIZE) {
      const ids = itemIds.slice(i, i + READ_BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop -- lots séquentiels
      const agg = await this.prisma.menuItemCostSnapshot.aggregate({
        where: { tenantId, menuItemId: { in: ids } },
        _min: { effectiveFrom: true },
      });
      const d = agg._min.effectiveFrom;
      if (d && (!min || d < min)) min = d;
    }
    return min;
  }

  /** Dernier snapshot de date < `at` (ou <= `at` si `inclusive`) pour chaque article. */
  private latestBefore(tenantId: string, ids: string[], at: Date, inclusive = false): Promise<RawSnapshot[]> {
    const cmp = inclusive ? Prisma.sql`<=` : Prisma.sql`<`;
    return this.prisma.$queryRaw<RawSnapshot[]>(Prisma.sql`
      SELECT DISTINCT ON ("menuItemId") ${SNAPSHOT_COLUMNS}
      FROM "MenuItemCostSnapshot"
      WHERE "tenantId" = ${tenantId} AND "menuItemId" = ANY(${ids}::text[]) AND "effectiveFrom" ${cmp} ${at}
      ORDER BY "menuItemId", "effectiveFrom" DESC, "createdAt" DESC
    `);
  }

  private firstOf(tenantId: string, ids: string[]): Promise<RawSnapshot[]> {
    return this.prisma.$queryRaw<RawSnapshot[]>(Prisma.sql`
      SELECT DISTINCT ON ("menuItemId") ${SNAPSHOT_COLUMNS}
      FROM "MenuItemCostSnapshot"
      WHERE "tenantId" = ${tenantId} AND "menuItemId" = ANY(${ids}::text[])
      ORDER BY "menuItemId", "effectiveFrom" ASC, "createdAt" ASC
    `);
  }

  private toPoint(row: RawSnapshot): SnapshotPoint {
    return {
      id: row.id,
      menuItemId: row.menuItemId,
      effectiveFrom: new Date(row.effectiveFrom),
      costPerPiece: Number(row.costPerPiece),
      totalCost: Number(row.totalCost),
      numberOfPieces: Number(row.numberOfPieces),
      basePrice: row.basePrice == null ? null : Number(row.basePrice),
      vatRate: row.vatRate == null ? null : Number(row.vatRate),
      reason: row.reason,
    };
  }
}
