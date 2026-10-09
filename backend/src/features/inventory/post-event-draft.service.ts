import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../core/database/prisma.service';
import { CreatePostEventReconciliationDto } from './dto/create-post-event-reconciliation.dto';
import { StockLevelService } from '../logistics/services/stock-level.service';
import { InventoryBaselineService } from './services/inventory-baseline.service';
import { InventoryCountService } from './services/inventory-count.service';
import { InventoryReconciliationService } from './services/inventory-reconciliation.service';
import { InventoryUnitResolverService } from './services/inventory-unit-resolver.service';
import {
  buildPostEventLines,
  postEventKey,
  previousLineInfo,
  type PostEventCountedLine,
} from './post-event-reconciliation.builder';

/** Contexte envoyé par l'écran staff : colonnes que seul le navigateur sait calculer. */
export interface PostEventContextInput {
  eventId: string;
  /** [{ elementId, itemKey, predictedUnits, unitCost, unit, unitsPerPack, packaging }] */
  lines: Array<Record<string, unknown>>;
  predictedSource?: string | null;
}

/**
 * Réconciliation post-event tenue À JOUR PAR LE SERVEUR (document Bertrand « Pre et Post
 * event Inventory cycle », 2026-10-06 : « la réconciliation est générée en brouillon avec
 * les valeurs comptées qui se mettent à jour au fur et à mesure », lot 4b).
 *
 * Reconstruite à chaque envoi Logistic de la minute (staff ET invité PIN), à l'arrêt du
 * post-event et à la réception du contexte de l'écran. Le brouillon EST le document de
 * référence (D2) : plus de bouton « Générer la réconciliation ».
 */
@Injectable()
export class PostEventDraftService {
  private readonly logger = new Logger(PostEventDraftService.name);
  static readonly CONTEXT_PREFIX = 'post-event-reco-context';
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryCountService: InventoryCountService,
    private readonly inventoryBaselineService: InventoryBaselineService,
    private readonly inventoryReconciliationService: InventoryReconciliationService,
    private readonly inventoryUnitResolverService: InventoryUnitResolverService,
    private readonly stockLevelService: StockLevelService,
  ) {}

  private contextKey(spaceId: string, eventId: string) {
    return `${PostEventDraftService.CONTEXT_PREFIX}:${spaceId}:${eventId}`;
  }

  /** Contexte de l'écran (prédit, coût, unité par ligne) gardé puis brouillon reconstruit. */
  async saveContext(spaceId: string, dto: PostEventContextInput, tenantId: string, userId?: string) {
    const key = this.contextKey(spaceId, dto.eventId);
    const value = {
      lines: (dto.lines ?? []).map((l) => ({
        elementId: l.elementId,
        itemKey: l.itemKey,
        predictedUnits: l.predictedUnits ?? null,
        unitCost: l.unitCost ?? null,
        unit: l.unit ?? null,
        unitsPerPack: l.unitsPerPack ?? null,
        packaging: l.packaging ?? null,
      })),
      predictedSource: dto.predictedSource ?? null,
      at: new Date().toISOString(),
    };
    await this.prisma.kvStore.upsert({
      where: { uniq_kv_store: { tenantId, key } },
      create: { tenantId, key, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
    return this.rebuild(spaceId, dto.eventId, tenantId, userId);
  }

  /** Reconstruit le brouillon du match, sérialisé par match (création puis suppression
   *  des feuilles précédentes : deux reconstructions concurrentes s'entremêleraient). */
  rebuild(spaceId: string, eventId: string, tenantId: string, userId?: string) {
    const key = `${tenantId}:${spaceId}:${eventId}`;
    const previous = this.queues.get(key) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(() => this.rebuildNow(spaceId, eventId, tenantId, userId));
    this.queues.set(key, run);
    run
      .finally(() => {
        if (this.queues.get(key) === run) this.queues.delete(key);
      })
      .catch(() => undefined);
    return run;
  }

  private async rebuildNow(spaceId: string, eventId: string, tenantId: string, userId?: string) {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, name: true, eventDate: true, eventEndDate: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    // ── Compté : articles MARQUÉS comptés seulement (BUG-237 : les reprises d'avant-match
    //    sont requalifiées « à compter » par getBySpaceAndEvent).
    const merged = await this.inventoryCountService.getBySpaceAndEvent(spaceId, eventId, tenantId, 'post-event');
    const blob = (merged?.inventoryCounts ?? {}) as Record<
      string,
      Record<string, { isCounted?: boolean; packedUnits?: unknown; looseUnits?: unknown } | null>
    >;
    const countedRaw: Array<{ elementId: string; itemId: string; packed: number; loose: number }> = [];
    for (const [elementId, byItem] of Object.entries(blob)) {
      for (const [itemId, c] of Object.entries(byItem ?? {})) {
        if (c?.isCounted !== true) continue;
        countedRaw.push({ elementId, itemId, packed: Number(c.packedUnits) || 0, loose: Number(c.looseUnits) || 0 });
      }
    }
    if (!countedRaw.length) return { ok: false as const, reason: 'no-counts' };

    // ── Avant-match du même event (repli : post-event du match précédent).
    const pre = await this.inventoryBaselineService.getPreEventInventory(spaceId, eventId, tenantId);
    const preBlob = (pre?.inventoryCounts ?? null) as Record<
      string,
      Record<string, { packedUnits?: unknown; looseUnits?: unknown } | null>
    > | null;

    const itemIds = new Set(countedRaw.map((c) => c.itemId));
    for (const byItem of Object.values(preBlob ?? {})) for (const id of Object.keys(byItem ?? {})) itemIds.add(id);
    const upp = await this.inventoryUnitResolverService.resolveInventoryUnitsPerPack([...itemIds], tenantId);
    const toUnits = (itemId: string, packed: number, loose: number) => packed * (upp.get(itemId) || 1) + loose;

    const counted: PostEventCountedLine[] = countedRaw.map((c) => ({
      elementId: c.elementId,
      itemId: c.itemId,
      units: toUnits(c.itemId, c.packed, c.loose),
    }));

    let preEventUnitsByKey: Map<string, number> | null = null;
    if (preBlob) {
      preEventUnitsByKey = new Map();
      for (const [elementId, byItem] of Object.entries(preBlob)) {
        for (const [itemId, c] of Object.entries(byItem ?? {})) {
          preEventUnitsByKey.set(
            postEventKey(elementId, itemId),
            toUnits(itemId, Number(c?.packedUnits) || 0, Number(c?.looseUnits) || 0),
          );
        }
      }
    }

    // ── Mouvements du match : seulement sur un avant-match du MÊME event (sinon les deux
    //    termes porteraient sur des matchs différents, même règle que l'écran).
    let movementUnitsByKey: Map<string, number> | null = null;
    if (pre?.source === 'pre-event') {
      const movements = await this.inventoryBaselineService.netMovementUnitsForEventWindow(spaceId, tenantId, event);
      movementUnitsByKey = new Map();
      for (const [k, v] of movements.net) {
        const [elementId, itemId] = k.split('::');
        movementUnitsByKey.set(postEventKey(elementId, itemId), v);
      }
    }

    // ── Vendu : ventes explosées par ingrédient, arrêtées pour chaque PDV à son dernier
    //    « Marquer compté » (D19, choix Ulrich 2026-10-06).
    const countedKeys = new Set(counted.map((c) => postEventKey(c.elementId, c.itemId)));
    const countedRows = await this.prisma.inventoryCount.findMany({
      where: { tenantId, spaceId, eventId, isCounted: true, shopId: { in: [...new Set(counted.map((c) => c.elementId))] } },
      select: { shopId: true, itemId: true, updatedAt: true },
    });
    const untilByElement = new Map<string, Date>();
    for (const r of countedRows) {
      if (!r.shopId || !countedKeys.has(postEventKey(r.shopId, r.itemId))) continue;
      const current = untilByElement.get(r.shopId);
      if (!current || r.updatedAt > current) untilByElement.set(r.shopId, r.updatedAt);
    }
    const consumption = await this.stockLevelService.deriveEventConsumption(spaceId, eventId, tenantId, { untilByElement });

    const names = await this.inventoryUnitResolverService.resolveItemKeysByIds([...itemIds], tenantId);
    const itemNameById = new Map([...names.entries()].map(([id, v]) => [id, v.name]));
    const countedItemsByElement = new Map<string, Set<string>>();
    for (const c of counted) {
      if (!countedItemsByElement.has(c.elementId)) countedItemsByElement.set(c.elementId, new Set());
      countedItemsByElement.get(c.elementId)!.add(c.itemId);
    }
    const soldUnitsByKey = new Map<string, number>();
    const unjoinedItems = new Set<string>();
    let unjoinedUnits = 0;
    for (const line of consumption.lines as Array<{ elementId: string; itemKey: string; quantity: number; itemRefId?: string | null }>) {
      const items = countedItemsByElement.get(line.elementId);
      if (!items) continue; // PDV sans article compté : aucune ligne à alimenter
      let itemId: string | null = line.itemRefId && items.has(line.itemRefId) ? line.itemRefId : null;
      if (!itemId) {
        const wanted = this.inventoryUnitResolverService.normalizeName(line.itemKey);
        itemId = [...items].find((id) => this.inventoryUnitResolverService.normalizeName(itemNameById.get(id)) === wanted) ?? null;
      }
      if (!itemId) {
        // Vendu mais pas compté sur ce PDV : rien à réconcilier (pas de ligne).
        continue;
      }
      const key = postEventKey(line.elementId, itemId);
      soldUnitsByKey.set(key, (soldUnitsByKey.get(key) ?? 0) + (Number(line.quantity) || 0));
    }
    if (consumption.unjoined) {
      for (const n of consumption.unjoined.productNames ?? []) unjoinedItems.add(String(n));
      unjoinedUnits += Number(consumption.unjoined.units) || 0;
    }

    // ── Noms, coûts (ingrédient : prix marché ; composant : coût unitaire), contexte écran.
    const [elements, marketPrices, components, contextRow, lastDoc] = await Promise.all([
      this.prisma.spaceElement.findMany({
        where: { id: { in: [...countedItemsByElement.keys()] } },
        select: { id: true, name: true },
      }),
      this.prisma.marketPrice.findMany({
        where: { tenantId, id: { in: [...itemIds] } },
        select: { id: true, pricePerUnit: true },
      }),
      this.prisma.menuComponent.findMany({
        where: { tenantId, id: { in: [...itemIds] } },
        select: { id: true, unitCost: true },
      }),
      this.prisma.kvStore.findUnique({
        where: { uniq_kv_store: { tenantId, key: this.contextKey(spaceId, eventId) } },
      }),
      this.prisma.stockReconciliation.findFirst({
        where: { tenantId, spaceId, eventId, kind: 'post-event' },
        orderBy: { createdAt: 'desc' },
        select: { lines: true, meta: true },
      }),
    ]);
    const unitCostByItemId = new Map<string, number>();
    for (const mp of marketPrices) {
      const c = Number(mp.pricePerUnit);
      if (mp.pricePerUnit != null && c > 0) unitCostByItemId.set(mp.id, c);
    }
    for (const comp of components) {
      const c = Number(comp.unitCost);
      if (comp.unitCost != null && c > 0 && !unitCostByItemId.has(comp.id)) unitCostByItemId.set(comp.id, c);
    }
    const context = (contextRow?.value ?? null) as { lines?: unknown; predictedSource?: string | null } | null;
    // Contexte de l'écran d'abord ; à défaut, colonnes du dernier document.
    const previousByKey = previousLineInfo(context?.lines ?? lastDoc?.lines ?? null);
    const predictedSource =
      context?.predictedSource ?? ((lastDoc?.meta as { predictedSource?: string } | null)?.predictedSource) ?? null;

    const lines = buildPostEventLines({
      counted,
      preEventUnitsByKey,
      preEventElementIds: preBlob ? new Set(Object.keys(preBlob)) : null,
      movementUnitsByKey,
      soldUnitsByKey,
      previousByKey,
      unitCostByItemId,
      unitsPerPackByItemId: upp,
      elementNameById: new Map(elements.map((e) => [e.id, e.name ?? ''])),
      itemNameById,
    });

    const created = await this.inventoryReconciliationService.createPostEventReconciliation(
      spaceId,
      {
        eventId,
        eventName: event.name ?? undefined,
        lines,
        preEventSource: pre?.source ?? 'none',
        salesSource: 'consumption',
        salesUnjoined:
          unjoinedItems.size || unjoinedUnits
            ? { shopNames: (consumption.unjoined?.shopNames ?? []).slice(0, 50), itemNames: [...unjoinedItems].slice(0, 50), units: Math.round(unjoinedUnits * 100) / 100 }
            : undefined,
        predictedSource: predictedSource ?? undefined,
      } as CreatePostEventReconciliationDto,
      tenantId,
      userId,
      {
        draft: true,
        extraMeta: {
          builtBy: 'server',
          // Lignes : articles marqués comptés seulement (choix Ulrich 2026-10-06).
          scope: 'counted-only',
          movementsSource: movementUnitsByKey ? 'post-event-baseline' : pre?.source === 'pre-event' ? 'none' : 'skipped-legacy-baseline',
          salesBoundedByElement: Object.fromEntries([...untilByElement].map(([id, at]) => [id, at.toISOString()])),
        },
      },
    );
    this.logger.log(`Brouillon post-event reconstruit : space ${spaceId} / event ${eventId} (${lines.length} ligne(s))`);
    return { ok: true as const, document: created, lineCount: lines.length };
  }
}
