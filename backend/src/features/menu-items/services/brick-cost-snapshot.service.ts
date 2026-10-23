import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../core/database/prisma.service';

/** Nature d'une brique suivie (texte libre en base). */
export type BrickKind = 'ingredient' | 'packaging' | 'component';

/** Causes d'une version de brique (texte libre en base, pas d'enum : pas de migration par cause). */
export type BrickCostReason =
  | 'baseline'
  | 'created'
  | 'market_price'
  | 'ingredient_edit'
  | 'packaging_edit'
  | 'component_edit'
  | 'manual_refresh';

/** Taille de lot : borne le nombre de briques chargées par requête. */
const BRICK_BATCH_SIZE = 500;

/** État courant d'une brique, tel qu'il serait figé dans une version. */
interface BrickState {
  refId: string;
  name: string;
  unitCost: number;
  recipeUnit: string | null;
  supplierId: string | null;
  supplierName: string | null;
  marketPriceId: string | null;
}

type LastRow = { refId: string; unitCost: Prisma.Decimal | number | string; supplierId: string | null; supplierName: string | null };

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Historique des coûts des briques (ingrédients, emballages, composants) : une version immuable
 * (`BrickCostSnapshot`) est insérée quand le coût unitaire ou le fournisseur d'une brique change,
 * jamais mise à jour. Le snapshot relit l'état PERSISTÉ de la brique (pas le DTO de l'appelant).
 * Un échec d'écriture ne remonte jamais à l'appelant.
 */
@Injectable()
export class BrickCostSnapshotService {
  constructor(private prisma: PrismaService) {}

  private readonly logger = new Logger(BrickCostSnapshotService.name);

  /**
   * Insère une version pour chaque brique dont le coût unitaire ou le fournisseur diffère de la
   * dernière version (ou qui n'en a pas). Idempotent : un second appel sans changement n'écrit
   * rien. Un seul `createMany` par lot de 500. Une brique sans coût renseigné est ignorée (pas de
   * faux zéro dans la courbe). Retourne le nombre de versions créées (0 en cas d'échec, jamais
   * d'exception).
   */
  async recordIfChanged(
    tenantId: string,
    kind: BrickKind,
    refIds: string[],
    reason: BrickCostReason,
    sourceRef?: Record<string, unknown>,
  ): Promise<number> {
    const ids = [...new Set((refIds ?? []).filter(Boolean))];
    if (!ids.length) return 0;
    let created = 0;
    try {
      for (let i = 0; i < ids.length; i += BRICK_BATCH_SIZE) {
        // eslint-disable-next-line no-await-in-loop -- lots séquentiels pour ne pas saturer le pooler
        created += await this.recordBatch(tenantId, kind, ids.slice(i, i + BRICK_BATCH_SIZE), reason, sourceRef);
      }
    } catch (error) {
      // Non bloquant : le coût est déjà persisté, une version manquante se rattrape à la prochaine propagation.
      this.logger.warn(`Brick cost snapshot failed for ${ids.length} ${kind}(s) (${reason}): ${error?.message}`);
    }
    return created;
  }

  private async recordBatch(
    tenantId: string,
    kind: BrickKind,
    ids: string[],
    reason: BrickCostReason,
    sourceRef?: Record<string, unknown>,
  ): Promise<number> {
    const states = await this.loadStates(tenantId, kind, ids);
    if (!states.length) return 0;
    const last = await this.latestRows(tenantId, kind, states.map((s) => s.refId));
    const now = new Date();
    const rows: Prisma.BrickCostSnapshotCreateManyInput[] = [];
    for (const state of states) {
      const previous = last.get(state.refId);
      if (previous && round4(Number(previous.unitCost)) === state.unitCost && previous.supplierId === state.supplierId && previous.supplierName === state.supplierName) continue;
      rows.push({
        tenantId,
        kind,
        refId: state.refId,
        name: state.name,
        unitCost: state.unitCost,
        recipeUnit: state.recipeUnit,
        supplierId: state.supplierId,
        supplierName: state.supplierName,
        marketPriceId: state.marketPriceId,
        effectiveFrom: now,
        reason,
        ...(sourceRef ? { sourceRef: sourceRef as Prisma.InputJsonValue } : {}),
      });
    }
    if (!rows.length) return 0;
    const { count } = await this.prisma.brickCostSnapshot.createMany({ data: rows });
    return count;
  }

  /** État courant des briques non supprimées du tenant ; celles sans coût renseigné sont écartées. */
  private async loadStates(tenantId: string, kind: BrickKind, ids: string[]): Promise<BrickState[]> {
    if (kind === 'component') {
      const components = await this.prisma.menuComponent.findMany({
        where: { id: { in: ids }, tenantId, deletedAt: null },
        select: { id: true, name: true, unitCost: true },
      });
      return components.flatMap((c) => {
        const unitCost = this.cost(c.unitCost);
        if (unitCost == null) return [];
        return [{ refId: c.id, name: c.name, unitCost, recipeUnit: null, supplierId: null, supplierName: null, marketPriceId: null }];
      });
    }
    const select = {
      id: true,
      name: true,
      recipeUnit: true,
      supplier: true,
      costPerRecipeUnit: true,
      marketPriceId: true,
      marketPrice: { select: { supplierId: true, supplier: true, supplierRel: { select: { name: true } } } },
    } as const;
    const where = { id: { in: ids }, tenantId, deletedAt: null };
    const bricks: any[] = kind === 'ingredient'
      ? await this.prisma.ingredient.findMany({ where, select })
      : await this.prisma.packaging.findMany({ where, select });
    return bricks.flatMap((b) => {
      const unitCost = this.cost(b.costPerRecipeUnit);
      if (unitCost == null) return [];
      // Le fournisseur du prix du marché fait foi ; le nom saisi sur la brique sert de repli.
      const supplierName = b.marketPrice?.supplierRel?.name || b.marketPrice?.supplier || b.supplier || null;
      return [{
        refId: b.id,
        name: b.name,
        unitCost,
        recipeUnit: b.recipeUnit ?? null,
        supplierId: b.marketPrice?.supplierId ?? null,
        supplierName,
        marketPriceId: b.marketPriceId ?? null,
      }];
    });
  }

  /** Dernière version de chaque brique, en une requête (index tenant, nature, brique, date). */
  private async latestRows(tenantId: string, kind: BrickKind, refIds: string[]): Promise<Map<string, LastRow>> {
    const rows = await this.prisma.$queryRaw<LastRow[]>(Prisma.sql`
      SELECT DISTINCT ON ("refId") "refId", "unitCost", "supplierId", "supplierName"
      FROM "BrickCostSnapshot"
      WHERE "tenantId" = ${tenantId} AND "kind" = ${kind} AND "refId" IN (${Prisma.join(refIds)})
      ORDER BY "refId", "effectiveFrom" DESC, "createdAt" DESC
    `);
    return new Map(rows.map((r) => [r.refId, r]));
  }

  private cost(value: unknown): number | null {
    if (value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? round4(n) : null;
  }
}
