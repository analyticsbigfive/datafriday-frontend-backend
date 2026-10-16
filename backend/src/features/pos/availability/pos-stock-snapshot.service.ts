import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../core/database/prisma.service';
import { StockLevelService } from '../../logistics/services/stock-level.service';
import { totalUnitsOf } from './pos-availability-rules';

/** Durée de vie du cliché de stock d'un espace (ms). POS_STOCK_CACHE_MS=0 le désactive. */
const DEFAULT_CACHE_MS = 3000;

function cacheMs(): number {
  const raw = process.env.POS_STOCK_CACHE_MS;
  const value = raw == null || raw === '' ? DEFAULT_CACHE_MS : Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_CACHE_MS;
}

/**
 * Stock courant des PdV d'un espace, par clé (nom d'article de stock) : exactement l'attendu que
 * voit l'écran Logistic (`StockLevelService.getExpectedStockIndex` : StockLevel moins ventes
 * dérivées depuis l'ancre, casse de pack, plancher à 0), sans second calcul. Le calcul porte sur
 * l'espace entier (une passe), il est donc mis en cache quelques secondes et les appels
 * simultanés se partagent la même promesse : N tablettes d'un même espace ne font pas N calculs.
 *
 * Seules les clés SUIVIES (une ligne StockLevel existe pour le PdV) sont renvoyées : un article
 * seulement vu dans les ventes n'a pas de stock suivi, il n'est donc ni « épuisé » ni borné.
 */
@Injectable()
export class PosStockSnapshotService {
  private readonly inflight = new Map<string, { at: number; promise: Promise<Map<string, Map<string, number>>> }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly stockLevels: StockLevelService,
  ) {}

  /** itemKey -> unités disponibles, pour un PdV. */
  async forElement(tenantId: string, spaceId: string, elementId: string): Promise<Map<string, number>> {
    const bySpace = await this.snapshot(tenantId, spaceId);
    return bySpace.get(elementId) ?? new Map();
  }

  private snapshot(tenantId: string, spaceId: string) {
    const key = `${tenantId}:${spaceId}`;
    const ttl = cacheMs();
    const hit = this.inflight.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.promise;
    const promise = this.build(tenantId, spaceId);
    this.inflight.set(key, { at: Date.now(), promise });
    // Un échec ne reste pas en cache.
    promise.catch(() => {
      if (this.inflight.get(key)?.promise === promise) this.inflight.delete(key);
    });
    return promise;
  }

  private async build(tenantId: string, spaceId: string): Promise<Map<string, Map<string, number>>> {
    const [{ index }, tracked] = await Promise.all([
      this.stockLevels.getExpectedStockIndex(spaceId, tenantId),
      this.prisma.stockLevel.findMany({ where: { tenantId, spaceId }, select: { elementId: true, itemKey: true } }),
    ]);
    const trackedKeys = new Set(tracked.map((t) => `${t.elementId}::${t.itemKey}`));
    const out = new Map<string, Map<string, number>>();
    for (const [key, level] of index) {
      if (!trackedKeys.has(key)) continue;
      if (!out.has(level.elementId)) out.set(level.elementId, new Map());
      out.get(level.elementId)!.set(level.itemKey, totalUnitsOf(level));
    }
    return out;
  }
}
