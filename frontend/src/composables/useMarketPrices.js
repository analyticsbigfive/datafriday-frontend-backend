import { computed } from 'vue'
import { useStore } from 'vuex'

export function useMarketPrices() {
  const store = useStore()

  const marketPrices = computed(() => store.state.inventory?.marketPrices || [])
  const isLoaded = computed(() => marketPrices.value.length > 0)

  async function ensureLoaded() {
    if (!isLoaded.value) {
      await store.dispatch('inventory/loadMarketPrices')
    }
    return marketPrices.value
  }

  return {
    marketPrices,
    isLoaded,
    ensureLoaded,
  }
}
