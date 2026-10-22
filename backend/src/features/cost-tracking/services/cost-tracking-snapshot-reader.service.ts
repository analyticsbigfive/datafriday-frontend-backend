import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { SnapshotPoint } from '../cost-tracking.types';

/** Taille de lot : borne le nombre d'identifiants passés à une requête. */
const READ_BATCH_SIZE = 500;

type RawSnapshot = {
  id: string;
  menuItemId: string;
  effectiveFrom: Date;
  costPerPiece: Prisma.Decimal | number | string;
  totalCost: Prisma.Decimal | number | string;
  numberOfPieces: number;
  basePrice: Prisma.Decimal | number | string | null;
  reason: string;
};

const SNAPSHOT_COLUMNS = Prisma.sql`"id", "menuItemId", "effectiveFrom", "costPerPiece", "totalCost", "numberOfPieces", "basePrice", "reason"`;

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
      reason: row.reason,
    };
  }
}
