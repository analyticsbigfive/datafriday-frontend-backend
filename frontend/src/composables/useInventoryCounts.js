import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { emptyInventoryCount, COUNTING_STATUS } from '@/types/inventoryCount'

export function useInventoryCounts(selectedEventIdRef) {
  const store = useStore()
  const debounceTimers = new Map()
  const debounceMs = ref(500)

  const inventoryCounts = computed(() => store.state.inventory?.inventoryCounts || {})

  function getCount(shopId, itemId) {
    const shopCounts = inventoryCounts.value?.[shopId] || {}
    return shopCounts[itemId] || emptyInventoryCount({ itemId, eventId: selectedEventIdRef?.value || null })
  }

  function totalForItem(shopId, item) {
    const c = getCount(shopId, item.id)
    const q = Number(item?.inventoryQuantityPackaged || 1)
    return Number(c.packedUnits || 0) * q + Number(c.looseUnits || 0)
  }

  function upsertCount(shopId, itemId, patch) {
    store.dispatch('inventory/upsertCount', { shopId, itemId, patch })

    const key = `${shopId}:${itemId}`
    if (debounceTimers.has(key)) clearTimeout(debounceTimers.get(key))
    const timer = setTimeout(() => {
      debounceTimers.delete(key)
    }, debounceMs.value)
    debounceTimers.set(key, timer)
  }

  function markCounted(shopId, itemId, counted) {
    upsertCount(shopId, itemId, {
      isCounted: !!counted,
      countingStatus: counted ? COUNTING_STATUS.COUNTED : COUNTING_STATUS.PENDING,
    })
  }

  return {
    inventoryCounts,
    getCount,
    totalForItem,
    upsertCount,
    markCounted,
  }
}
