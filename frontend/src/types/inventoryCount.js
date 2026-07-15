/**
 * Inventory count data shape (Space Inventory).
 *
 * Used as the canonical structure for counts produced by
 * `InventoryCountingInterface` and consumed by `InventoryView` /
 * `InventoryAggregateView`. Includes the optional `eventId`,
 * `storageLocation`, and `countingStatus` fields. Mirrors the React
 * `InventoryCount` interface (itemId / packedUnits / looseUnits / isCounted) —
 * no "discarded / jetés" concept exists in the React version.
 *
 * Shape:
 *   InventoryCount = {
 *     itemId: string,
 *     packedUnits: number,
 *     looseUnits: number,
 *     isCounted: boolean,
 *
 *     // Linking the count to a specific event / inventory campaign
 *     eventId?: string | null,
 *
 *     // Where the item is physically stored (shop floor, back-of-house, etc.)
 *     storageLocation?: string | null,
 *
 *     // Aggregated counting status for the parent shop / storage
 *     countingStatus?: 'pending' | 'in-progress' | 'counted',
 *   }
 *
 * Container shape:
 *   InventoryCountsByShop = Record<shopId, Record<itemId, InventoryCount>>
 */

export const COUNTING_STATUS = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in-progress',
  COUNTED: 'counted',
})

export const COUNTING_TABS = Object.freeze([
  { value: 'to-count', label: 'À compter' },
  { value: 'counted', label: 'Comptés' },
])

/** Build a normalized empty inventory count entry. */
export function emptyInventoryCount(overrides = {}) {
  return {
    itemId: null,
    packedUnits: 0,
    looseUnits: 0,
    isCounted: false,
    eventId: null,
    storageLocation: null,
    countingStatus: COUNTING_STATUS.PENDING,
    ...overrides,
  }
}

/** Derive the shop's counting status from its item counts. */
export function deriveShopCountingStatus(itemCounts = {}) {
  const entries = Object.values(itemCounts || {})
  if (!entries.length) return COUNTING_STATUS.PENDING
  const allCounted = entries.every((c) => c?.isCounted)
  const anyCounted = entries.some((c) => c?.isCounted)
  if (allCounted) return COUNTING_STATUS.COUNTED
  if (anyCounted) return COUNTING_STATUS.IN_PROGRESS
  return COUNTING_STATUS.PENDING
}
