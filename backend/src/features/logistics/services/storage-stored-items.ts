import { ElementItem } from '../logistics.types';

/** Ligne ElementInventory minimale utile à la règle « stockée ». */
export type StorageInventoryRow = {
  elementId: string;
  configId: string | null;
  name: string;
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
 * boutiques liées. Résolus sur le Market Price de même nom (name = itemName du MP,
 * clé du ledger Logistic) ; sans MP, item minimal à id stable `custom:<nom normalisé>`.
 */
export function buildStoredOnlyItems(
  storedRows: Array<Pick<StorageInventoryRow, 'name'>>,
  existing: Iterable<ElementItem>,
  mpByNormalizedName: Map<string, MarketPriceLite>,
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
    if (!key || seenNames.has(key)) continue;
    const mp = mpByNormalizedName.get(key);
    if (mp && seenMpIds.has(mp.id)) continue;
    seenNames.add(key);
    if (mp) {
      seenNames.add(normalizeItemName(mp.itemName));
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
    } else {
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
  }
  return out;
}
