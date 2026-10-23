import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';
import { BrickKind, BrickSnapshotPoint } from '../cost-tracking.types';

/** Taille de lot : borne le nombre d'identifiants passés à une requête. */
const READ_BATCH_SIZE = 500;

type RawBrickSnapshot = {
  id: string;
  kind: string;
  refId: string;
  name: string;
  unitCost: Prisma.Decimal | number | string;
  recipeUnit: string | null;
  supplierId: string | null;
  supplierName: string | null;
  marketPriceId: string | null;
  effectiveFrom: Date;
  reason: string;
};

const COLUMNS = Prisma.sql`"id", "kind", "refId", "name", "unitCost", "recipeUnit", "supplierId", "supplierName", "marketPriceId", "effectiveFrom", "reason"`;

/**
 * Lectures de l'historique `BrickCostSnapshot` (ingrédients, emballages, composants), par lots.
 * Toutes les requêtes passent par l'index (tenantId, kind, refId, effectiveFrom desc).
 */
@Injectable()
export class CostTrackingBrickReaderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Versions utiles à une période : la dernière antérieure à `from` (valeur déjà en vigueur) puis
   * toutes celles de [from, toExclusive). Triées par brique puis date croissante.
   */
  async readForPeriod(tenantId: string, kind: BrickKind, refIds: string[], from: Date, toExclusive: Date): Promise<Map<string, BrickSnapshotPoint[]>> {
    const out = new Map<string, BrickSnapshotPoint[]>();
    const unique = [...new Set(refIds.filter(Boolean))];
    for (let i = 0; i < unique.length; i += READ_BATCH_SIZE) {
      const ids = unique.slice(i, i + READ_BATCH_SIZE);
      // eslint-disable-next-line no-await-in-loop -- lots séquentiels pour ne pas saturer le pooler
      const [carry, changes] = await Promise.all([
        this.prisma.$queryRaw<RawBrickSnapshot[]>(Prisma.sql`
          SELECT DISTINCT ON ("refId") ${COLUMNS}
          FROM "BrickCostSnapshot"
          WHERE "tenantId" = ${tenantId} AND "kind" = ${kind} AND "refId" = ANY(${ids}::text[]) AND "effectiveFrom" < ${from}
          ORDER BY "refId", "effectiveFrom" DESC, "createdAt" DESC
        `),
        this.prisma.$queryRaw<RawBrickSnapshot[]>(Prisma.sql`
          SELECT ${COLUMNS}
          FROM "BrickCostSnapshot"
          WHERE "tenantId" = ${tenantId} AND "kind" = ${kind} AND "refId" = ANY(${ids}::text[])
            AND "effectiveFrom" >= ${from} AND "effectiveFrom" < ${toExclusive}
          ORDER BY "refId", "effectiveFrom", "createdAt"
        `),
      ]);
      for (const row of [...carry, ...changes]) {
        const point = this.toPoint(row);
        const list = out.get(point.refId);
        if (list) list.push(point);
        else out.set(point.refId, [point]);
      }
    }
    return out;
  }

  private toPoint(row: RawBrickSnapshot): BrickSnapshotPoint {
    return {
      id: row.id,
      kind: row.kind as BrickKind,
      refId: row.refId,
      name: row.name,
      unitCost: Number(row.unitCost),
      recipeUnit: row.recipeUnit,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      marketPriceId: row.marketPriceId,
      effectiveFrom: new Date(row.effectiveFrom),
      reason: row.reason,
    };
  }
}
