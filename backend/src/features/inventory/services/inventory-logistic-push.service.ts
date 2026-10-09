import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { StockItemKind } from '../../logistics/dto/logistics.dto';
import { markInventoryCountsPushed } from '../inventory.queries';
import { SpaceAccessService } from '../../../core/auth/space-access.service';
import { StockReconciliationService } from '../../logistics/services/stock-reconciliation.service';
import { InventoryCountService } from './inventory-count.service';
import { InventoryUnitResolverService } from './inventory-unit-resolver.service';
import { StockLevelService } from '../../logistics/services/stock-level.service';
import { subtractSalesSinceCount } from '../sales-since-count';

/** État de push Logistic des lignes d'un match, clé `elementId::itemId` (cf. pushCountToLogistic). */
type LogisticPushState = Map<string, { id: string; updatedAt: Date; logisticPushedAt: Date | null }>;

/** Restreint un blob de comptages `{ elementId: { itemId: count } }` à certains PDV
 *  (undefined = tous). */
function pickElements<T>(
  blob: Record<string, T>,
  elementIds: string[] | undefined,
): Record<string, T> {
  if (!elementIds) return blob;
  const keep = new Set(elementIds);
  return Object.fromEntries(Object.entries(blob ?? {}).filter(([id]) => keep.has(id)));
}

/**
 * Report des comptages d'inventaire dans le stock Logistic, avec suivi de ce qui a déjà été poussé.
 */
@Injectable()
export class InventoryLogisticPushService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stockReconciliationService: StockReconciliationService,
    private readonly spaceAccess: SpaceAccessService,
    private readonly inventoryCountService: InventoryCountService,
    private readonly inventoryUnitResolverService: InventoryUnitResolverService,
    private readonly stockLevelService: StockLevelService,
  ) {}

  private readonly logger = new Logger(InventoryLogisticPushService.name);

  /**
   * Pousse un comptage d'inventaire dans le registre Logistic (PDF 2026-08-21 +
   * précision JLH : « idéalement, reset sur pre ou post event inventory quand ils
   * sont terminés et que la réconciliation est faite »).
   *
   * C'est ce qui rend la formule de l'attendu vraie par construction : le
   * registre repart toujours du dernier comptage physique, donc l'écran suivant
   * lit un total Logistic qui contient déjà le comptage (`logistic-only`) au lieu
   * de devoir l'additionner.
   *
   * ⚠️ Un reset MATÉRIALISE les ventes non couvertes en mouvements et DÉPLACE
   * l'ancre de dérivation des ventes de l'écran Logistic. La règle « documenter ≠
   * resetter » (module 10 §7.3) est donc levée ici, sciemment.
   *
   * Jamais bloquant : un échec de recalage ne doit pas empêcher la création du
   * document de réconciliation, qui est l'objet de la demande utilisateur.
   */
  async pushCountToLogistic(
    spaceId: string,
    tenantId: string,
    phase: 'pre-event' | 'post-event',
    event: { id: string; name?: string | null },
    countedBlob: Record<string, Record<string, any>>,
    userId?: string,
    // État de push des lignes (déjà chargé par l'appelant, sinon chargé ici).
    pushState?: LogisticPushState,
  ): Promise<{ ok: boolean; reason?: string; lineCount?: number }> {
    // BUG-383-02 (règle Bertrand 2026-09-15) : seul ce qui a été COMPTÉ (validé) met à jour
    // Logistic ; le reste garde sa valeur courante. Sans ce filtre, en post-event les
    // propositions reportées du pre-event (`carriedFromPreEvent`, isCounted=false) étaient
    // poussées comme un comptage, écrasant le stock d'articles jamais recomptés.
    //
    // Push INCRÉMENTAL : une ligne validée déjà poussée et inchangée depuis
    // (`logisticPushedAt >= updatedAt`) n'est pas repoussée. Un reset remet StockLevel à la
    // valeur comptée et déplace l'ancre des ventes : repousser un comptage de la veille
    // effacerait les livraisons saisies depuis, et repousser après l'ouverture des portes
    // effacerait les ventes du début de match.
    const state = pushState ?? (await this.loadLogisticPushState(spaceId, event.id, tenantId));
    const validated: Record<string, Record<string, any>> = {};
    const itemIds = new Set<string>();
    let validatedCount = 0;
    for (const [elementId, byItem] of Object.entries(countedBlob ?? {})) {
      for (const [itemId, count] of Object.entries(byItem ?? {})) {
        if ((count as any)?.isCounted !== true) continue;
        validatedCount += 1;
        if (!this.isPendingLogisticPush(state, elementId, itemId)) continue;
        (validated[elementId] ??= {})[itemId] = count;
        itemIds.add(itemId);
      }
    }
    if (!validatedCount) return { ok: false, reason: 'no-counts' };
    if (!itemIds.size) return { ok: false, reason: 'nothing-new' };

    const itemKeyById = await this.inventoryUnitResolverService.resolveItemKeysByIds([...itemIds], tenantId);
    const lines: Array<{
      elementId: string;
      itemKey: string;
      itemKind: StockItemKind;
      itemRefId: string;
      countedPacked: number;
      countedLoose: number;
    }> = [];
    for (const [elementId, byItem] of Object.entries(validated)) {
      for (const [itemId, count] of Object.entries(byItem)) {
        const resolved = itemKeyById.get(itemId);
        // Orphelin des catalogues (resolveItemKeysByIds) : non adressable côté
        // Logistic, la ligne est écartée.
        if (!resolved) continue;
        lines.push({
          elementId,
          itemKey: resolved.name,
          itemKind: resolved.kind,
          itemRefId: itemId,
          countedPacked: Number((count as any)?.packedUnits) || 0,
          countedLoose: Number((count as any)?.looseUnits) || 0,
        });
      }
    }
    if (!lines.length) return { ok: false, reason: 'no-addressable-lines' };

    // Ventes faites depuis le comptage retirées (envoi regroupé à la minute, D22) : sans
    // cela, le recalage effaçait du registre les ventes entre comptage et envoi.
    let pushLines = lines;
    let salesSinceCount: { adjusted: number; soldUnits: number } | null = null;
    try {
      const upp = await this.inventoryUnitResolverService.resolveInventoryUnitsPerPack([...itemIds], tenantId);
      const corrected = await subtractSalesSinceCount(
        lines,
        (l) => state.get(`${l.elementId}::${l.itemRefId}`)?.updatedAt ?? null,
        {
          consumption: async (sinceByElement) =>
            (await this.stockLevelService.deriveEventConsumption(spaceId, event.id, tenantId, { sinceByElement })).lines,
          unitsPerPack: upp,
          normalize: (v) => this.inventoryUnitResolverService.normalizeName(v),
        },
      );
      pushLines = corrected.lines;
      salesSinceCount = { adjusted: corrected.adjusted, soldUnits: corrected.soldUnits };
    } catch (error) {
      // Jamais bloquant : sans correction, le recalage part comme avant.
      this.logger.warn(`Ventes depuis le comptage non retirées (envoi non corrigé) : ${(error as Error)?.message}`);
    }

    try {
      await this.stockReconciliationService.reset(
        spaceId,
        { eventId: event.id, eventName: event.name ?? undefined, lines: pushLines },
        tenantId,
        userId ?? `system-${phase}-reconciliation`,
        { source: 'inventory-count', phase, eventId: event.id, ...(salesSinceCount ? { salesSinceCount } : {}) },
      );
      this.logger.log(
        `Stock Logistic recalé depuis le comptage ${phase} — space ${spaceId} / event ${event.id} (${lines.length} ligne(s))`,
      );
    } catch (error: any) {
      this.logger.warn(
        `Recalage Logistic depuis le comptage ${phase} échoué (document conservé) — space ${spaceId} / event ${event.id} : ${error?.message}`,
      );
      return { ok: false, reason: 'reset-failed' };
    }
    await this.markLogisticPushed(
      tenantId,
      lines.map((l) => state.get(`${l.elementId}::${l.itemRefId}`)?.id).filter((id): id is string => !!id),
    );
    return { ok: true, lineCount: lines.length };
  }

  /** État de push par ligne validée d'un match : clé `elementId::itemId`. */
  async loadLogisticPushState(
    spaceId: string,
    eventId: string,
    tenantId: string,
  ): Promise<LogisticPushState> {
    const rows = await this.prisma.inventoryCount.findMany({
      where: { tenantId, spaceId, eventId },
      select: { id: true, shopId: true, itemId: true, updatedAt: true, logisticPushedAt: true },
    });
    const state: LogisticPushState = new Map();
    for (const r of rows) {
      if (!r.shopId) continue;
      state.set(`${r.shopId}::${r.itemId}`, {
        id: r.id,
        updatedAt: r.updatedAt,
        logisticPushedAt: r.logisticPushedAt,
      });
    }
    return state;
  }

  /** Une ligne est à pousser si elle n'a jamais été poussée, ou a été modifiée depuis.
   *  Ligne absente de l'état (comptage issu d'un snapshot, sans `InventoryCount`) :
   *  jamais poussée, donc à pousser. */
  isPendingLogisticPush(state: LogisticPushState, elementId: string, itemId: string): boolean {
    const row = state.get(`${elementId}::${itemId}`);
    if (!row) return true;
    if (!row.logisticPushedAt) return true;
    return row.updatedAt.getTime() > row.logisticPushedAt.getTime();
  }

  /** Hors transaction du reset : un échec ici ne fait que repousser ces lignes au prochain
   *  push (delta 0). */
  private async markLogisticPushed(tenantId: string, ids: string[]): Promise<void> {
    if (!ids.length) return;
    try {
      await markInventoryCountsPushed(this.prisma, tenantId, ids);
    } catch (error: any) {
      this.logger.warn(`Marquage logisticPushedAt échoué (${ids.length} ligne(s)) : ${error?.message}`);
    }
  }

  /**
   * Déclenchement manuel du recalage Logistic (bouton "Update Logistic" des
   * écrans Pre/Post-event Inventory) — même chemin que le recalage automatique
   * de `createPostEventReconciliation`/`createPreEventReconciliation`
   * (`pushCountToLogistic` ci-dessus), mais sans créer de document de
   * réconciliation : permet de re-pousser un comptage mis à jour entre deux
   * réconciliations. Contrairement au recalage automatique, un échec ici est
   * remonté à l'appelant (l'utilisateur a explicitement demandé cette action).
   */
  async pushCurrentCountToLogistic(
    spaceId: string,
    eventId: string,
    tenantId: string,
    phase: 'pre-event' | 'post-event',
    userId?: string,
    // Un seul PDV (mise à jour manuelle par PDV, règle Bertrand 2026-09-29) ; sinon tous.
    elementId?: string | null,
  ) {
    await this.spaceAccess.assertSpaceInTenant(spaceId, tenantId);
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, name: true },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found in space ${spaceId}`);

    const result = await this.pushEventCountToLogistic(spaceId, event, tenantId, phase, userId, elementId);
    if (!result.ok) {
      throw new BadRequestException(
        result.reason === 'no-counts' || result.reason === 'no-addressable-lines'
          ? 'Aucun item compté à pousser vers Logistic'
          : result.reason === 'nothing-new'
            ? 'Registre Logistic déjà à jour : aucun comptage modifié depuis le dernier push'
            : 'Échec de la mise à jour du registre Logistic',
      );
    }
    return result;
  }

  /**
   * Envoi AUTOMATIQUE des articles marqués comptés depuis le dernier envoi (document
   * Bertrand 2026-10-06, D1) : même chemin incrémental que le bouton, sans exception.
   * `{ ok:false, reason:'nothing-new' }` est le cas normal quand rien n'a changé.
   */
  async pushPendingCountToLogistic(
    spaceId: string,
    eventId: string,
    tenantId: string,
    phase: 'pre-event' | 'post-event',
    userId?: string,
  ): Promise<{ ok: boolean; reason?: string; lineCount?: number }> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, spaceId, tenantId },
      select: { id: true, name: true },
    });
    if (!event) return { ok: false, reason: 'event-not-found' };
    return this.pushEventCountToLogistic(spaceId, event, tenantId, phase, userId);
  }

  private async pushEventCountToLogistic(
    spaceId: string,
    event: { id: string; name?: string | null },
    tenantId: string,
    phase: 'pre-event' | 'post-event',
    userId?: string,
    elementId?: string | null,
  ) {
    const merged = await this.inventoryCountService.getBySpaceAndEvent(spaceId, event.id, tenantId, phase);
    const countedBlob = pickElements(
      (merged?.inventoryCounts ?? {}) as Record<string, Record<string, any>>,
      elementId ? [elementId] : undefined,
    );
    return this.pushCountToLogistic(spaceId, tenantId, phase, event, countedBlob, userId);
  }
}
