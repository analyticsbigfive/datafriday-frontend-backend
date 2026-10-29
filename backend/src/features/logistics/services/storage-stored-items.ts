import { ElementItem } from '../logistics.types';

/** Ligne ElementInventory minimale utile à la règle « stockée ». */
export type StorageInventoryRow = {
  elementId: string;
  configId: string | null;
  name: string;
  /** Lien robuste vers le Market Price (prioritaire sur le nom). */
  marketPriceId?: string | null;
  quantity: number | null;
  minStock: number | null;
  maxStock: number | null;
  isStored: boolean | null;
};

/** Miroir de frontend/src/utils/storageStoredFilter.js (normalizeItemName). */
export function normalizeItemName(name: unknown): string {
  return String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Miroir de frontend/src/utils/storageRowStored.js (isRowStored). */
export function isRowStored(row: Pick<StorageInventoryRow, 'isStored' | 'quantity' | 'minStock' | 'maxStock'> | null | undefined): boolean {
  if (!row) return false;
  if (row.isStored === true || row.isStored === false) return row.isStored;
  return (Number(row.quantity) || 0) > 0 || row.minStock != null || row.maxStock != null;
}

/**
 * Tampon d'un PDV : quantité > 0 ET isStored !== false. Miroir exact de
 * frontend/src/utils/pdvBufferRequirements.js (collectPdvBuffers) : pas de repli
 * sur les seuils min/max, contrairement à isRowStored.
 */
export function isPdvBufferRow(row: Pick<StorageInventoryRow, 'isStored' | 'quantity'> | null | undefined): boolean {
  if (!row) return false;
  return (Number(row.quantity) || 0) > 0 && row.isStored !== false;
}

/**
 * Lignes d'un stockage pour une config : config demandée, repli sur les lignes
 * configId null. En vue agrégée (effectiveConfigId === 'all') : union de toutes.
 */
export function scopeStorageRows<T extends { configId: string | null }>(
  rows: T[],
  effectiveConfigId: string | null | 'all',
): T[] {
  if (effectiveConfigId === 'all') return rows;
  const exact = effectiveConfigId ? rows.filter((r) => r.configId === effectiveConfigId) : [];
  return exact.length ? exact : rows.filter((r) => r.configId == null);
}

type MarketPriceLite = {
  id: string;
  itemName: string;
  unit?: string | null;
  recipeUnit?: string | null;
  packedUnits: number | null;
  inventoryPackaging: string | null;
};

/**
 * Items à AJOUTER à un stockage : lignes stockées absentes des articles issus des
 * boutiques liées. Résolus sur le Market Price par `marketPriceId` d'abord (survit au
 * renommage, même si le MP est supprimé : la trace du stock est gardée), puis par nom
 * normalisé (name = itemName du MP, clé du ledger Logistic) ; sans MP, item minimal à id
 * stable `custom:<nom normalisé>`. Dédoublonnage par marketPriceId puis par nom.
 */
export function buildStoredOnlyItems(
  storedRows: Array<Pick<StorageInventoryRow, 'name' | 'marketPriceId'>>,
  existing: Iterable<ElementItem>,
  mpByNormalizedName: Map<string, MarketPriceLite>,
  mpById: Map<string, MarketPriceLite> = new Map(),
): ElementItem[] {
  const seenNames = new Set<string>();
  const seenMpIds = new Set<string>();
  for (const it of existing) {
    seenNames.add(normalizeItemName(it.name));
    if (it.marketPriceId) seenMpIds.add(it.marketPriceId);
  }
  const out: ElementItem[] = [];
  for (const row of storedRows) {
    const key = normalizeItemName(row.name);
    const mp = (row.marketPriceId ? mpById.get(row.marketPriceId) : undefined) ?? (key ? mpByNormalizedName.get(key) : undefined);
    if (mp) {
      const mpKey = normalizeItemName(mp.itemName);
      if (seenMpIds.has(mp.id) || seenNames.has(mpKey)) continue;
      seenNames.add(mpKey);
      if (key) seenNames.add(key);
      seenMpIds.add(mp.id);
      out.push({
        name: mp.itemName.trim(),
        id: mp.id,
        kind: 'ingredient',
        refKind: 'marketPrice',
        unit: mp.recipeUnit ?? mp.unit ?? null,
        marketPriceId: mp.id,
        unitsPerPack: mp.packedUnits ?? null,
        packagingType: mp.inventoryPackaging ?? null,
        picture: null,
        usedIn: [],
      });
      continue;
    }
    if (!key || seenNames.has(key)) continue;
    seenNames.add(key);
    out.push({
      name: String(row.name).trim(),
      id: `custom:${key}`,
      kind: 'ingredient',
      refKind: null,
      unit: null,
      marketPriceId: null,
      unitsPerPack: null,
      packagingType: null,
      picture: null,
      usedIn: [],
    });
  }
  return out;
}
