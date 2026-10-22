import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../../core/database/prisma.service';

/** Causes d'un snapshot (texte libre en base, pas d'enum : pas de migration par nouvelle cause). */
export type CostSnapshotReason =
  | 'baseline'
  | 'created'
  | 'market_price'
  | 'recipe_edit'
  | 'component_edit'
  | 'ingredient_edit'
  | 'packaging_edit'
  | 'combo_edit'
  | 'manual_refresh'
  | 'price_sync';

/** Taille de lot : borne le nombre d'articles (et de lignes de recette) chargés par requête. */
const SNAPSHOT_BATCH_SIZE = 500;

interface FrozenLine {
  kind: 'component' | 'ingredient' | 'packaging' | 'combo';
  refId: string;
  name: string | null;
  quantity: number;
  unitCost: number | null;
}

/**
 * Historique des coûts des articles : une version immuable (`MenuItemCostSnapshot`) est insérée
 * quand le coût, la recette ou le prix d'un article change, jamais mise à jour. Les appelants
 * sont les services qui écrivent `MenuItem.totalCost` / `basePrice` ; le snapshot lit la valeur
 * PERSISTÉE (après refresh), pas le DTO. Un échec d'écriture ne remonte jamais à l'appelant.
 */
@Injectable()
export class MenuItemCostSnapshotService {
  constructor(private prisma: PrismaService) {}

  private readonly logger = new Logger(MenuItemCostSnapshotService.name);

  /**
   * Insère un snapshot pour chaque article dont l'empreinte diffère du dernier snapshot (ou qui
   * n'en a pas). Idempotent : un second appel sans changement n'écrit rien. Un seul `createMany`
   * par lot de 500. Retourne le nombre de snapshots créés (0 en cas d'échec, jamais d'exception).
   */
  async recordIfChanged(tenantId: string, itemIds: string[], reason: CostSnapshotReason, sourceRef?: Record<string, unknown>): Promise<number> {
    const ids = [...new Set((itemIds ?? []).filter(Boolean))];
    if (!ids.length) return 0;
    let created = 0;
    try {
      for (let i = 0; i < ids.length; i += SNAPSHOT_BATCH_SIZE) {
        // eslint-disable-next-line no-await-in-loop -- lots séquentiels pour ne pas saturer le pooler
        created += await this.recordBatch(tenantId, ids.slice(i, i + SNAPSHOT_BATCH_SIZE), reason, sourceRef);
      }
    } catch (error) {
      // Non bloquant : le coût est déjà persisté, un snapshot manquant se rattrape au prochain refresh.
      this.logger.warn(`Cost snapshot failed for ${ids.length} menu item(s) (${reason}): ${error?.message}`);
    }
    return created;
  }

  private async recordBatch(tenantId: string, ids: string[], reason: CostSnapshotReason, sourceRef?: Record<string, unknown>): Promise<number> {
    const items = await this.prisma.menuItem.findMany({
      where: { id: { in: ids }, tenantId, deletedAt: null },
      select: {
        id: true,
        totalCost: true,
        numberOfPiecesRecipe: true,
        basePrice: true,
        vatRate: true,
        components: { select: { componentId: true, numberOfUnits: true, unitCost: true, component: { select: { name: true } } } },
        ingredients: { select: { ingredientId: true, numberOfUnits: true, unitCost: true, ingredient: { select: { name: true } } } },
        packagings: { select: { packagingId: true, numberOfUnits: true, unitCost: true, packaging: { select: { name: true } } } },
        comboChildren: { select: { childId: true, quantity: true, child: { select: { name: true, totalCost: true } } } },
      },
    });
    if (!items.length) return 0;

    const lastHashes = await this.latestHashes(tenantId, items.map((it) => it.id));
    const now = new Date();
    const rows: Prisma.MenuItemCostSnapshotCreateManyInput[] = [];

    for (const item of items) {
      const totalCost = this.num(item.totalCost) ?? 0;
      const numberOfPieces = Math.max(Math.round(this.num(item.numberOfPiecesRecipe) ?? 1), 1);
      const basePrice = this.num(item.basePrice);
      const vatRate = this.num(item.vatRate);
      const recipe = this.freezeRecipe(item);
      const recipeHash = this.hash({ totalCost, numberOfPieces, basePrice, vatRate, recipe });
      if (lastHashes.get(item.id) === recipeHash) continue;
      rows.push({
        tenantId,
        menuItemId: item.id,
        effectiveFrom: now,
        totalCost,
        numberOfPieces,
        costPerPiece: Math.round((totalCost / numberOfPieces) * 10000) / 10000,
        basePrice,
        vatRate,
        recipe: recipe as unknown as Prisma.InputJsonValue,
        recipeHash,
        reason,
        ...(sourceRef ? { sourceRef: sourceRef as Prisma.InputJsonValue } : {}),
      });
    }
    if (!rows.length) return 0;
    const { count } = await this.prisma.menuItemCostSnapshot.createMany({ data: rows });
    return count;
  }

  /** Empreinte du dernier snapshot de chaque article, en une requête (index tenant, article, date). */
  private async latestHashes(tenantId: string, itemIds: string[]): Promise<Map<string, string>> {
    const rows = await this.prisma.$queryRaw<Array<{ menuItemId: string; recipeHash: string }>>(Prisma.sql`
      SELECT DISTINCT ON ("menuItemId") "menuItemId", "recipeHash"
      FROM "MenuItemCostSnapshot"
      WHERE "tenantId" = ${tenantId} AND "menuItemId" IN (${Prisma.join(itemIds)})
      ORDER BY "menuItemId", "effectiveFrom" DESC, "createdAt" DESC
    `);
    return new Map(rows.map((r) => [r.menuItemId, r.recipeHash]));
  }

  /** Lignes de recette figées, triées pour une empreinte stable. Coût de ligne = valeur persistée. */
  private freezeRecipe(item: any): FrozenLine[] {
    const lines: FrozenLine[] = [
      ...(item.components ?? []).map((l: any) => ({ kind: 'component' as const, refId: l.componentId, name: l.component?.name ?? null, quantity: this.num(l.numberOfUnits) ?? 0, unitCost: this.num(l.unitCost) })),
      ...(item.ingredients ?? []).map((l: any) => ({ kind: 'ingredient' as const, refId: l.ingredientId, name: l.ingredient?.name ?? null, quantity: this.num(l.numberOfUnits) ?? 0, unitCost: this.num(l.unitCost) })),
      ...(item.packagings ?? []).map((l: any) => ({ kind: 'packaging' as const, refId: l.packagingId, name: l.packaging?.name ?? null, quantity: this.num(l.numberOfUnits) ?? 0, unitCost: this.num(l.unitCost) })),
      ...(item.comboChildren ?? []).map((l: any) => ({ kind: 'combo' as const, refId: l.childId, name: l.child?.name ?? null, quantity: this.num(l.quantity) ?? 0, unitCost: this.num(l.child?.totalCost) })),
    ];
    return lines.sort((a, b) => (a.kind + a.refId).localeCompare(b.kind + b.refId));
  }

  /**
   * Empreinte SANS le coût du fils de combo ni les noms : le coût d'un fils bouge avant celui du
   * parent (recalculé ensuite par refreshComboCost), un faux snapshot serait sinon écrit.
   */
  private hash(payload: { totalCost: number; numberOfPieces: number; basePrice: number | null; vatRate: number | null; recipe: FrozenLine[] }): string {
    const stable = {
      ...payload,
      recipe: payload.recipe.map((l) => [l.kind, l.refId, l.quantity, l.kind === 'combo' ? null : l.unitCost]),
    };
    return createHash('sha1').update(JSON.stringify(stable)).digest('hex');
  }

  private num(value: unknown): number | null {
    if (value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
}
