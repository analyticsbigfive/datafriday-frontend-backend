import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { getMarketPriceRecipeUsage } from '@/api/endpoints/market.price.api'
import { buildStorageProducts } from '@/components/menu-fb/views/storage/utils/storageProducts'
import { pickerProducts } from '@/utils/restockStoragePicker'

/**
 * Produits de la page Stockage (Market Prices hors produits utilisés en recette), sans les
 * filtres persistés de cette page : sert au sélecteur de l'onglet STOCK de Commande.
 * Chargement paresseux (appeler `ensureLoaded` à l'ouverture du sélecteur).
 */
export function useStorageProductOptions() {
  const store = useStore()
  const loading = ref(false)
  const error = ref(false)
  const loaded = ref(false)
  const usedIds = ref([])

  const products = computed(() => {
    if (!loaded.value) return []
    const cards = buildStorageProducts(store.getters['marketPrices/rows'] || [], {
      suppliers: store.getters['suppliers/suppliers'] || [],
      industrials: store.getters['industrials/industrials'] || [],
      usedIds: usedIds.value,
    })
    return pickerProducts(cards)
  })

  async function ensureLoaded() {
    if (loaded.value || loading.value) return
    loading.value = true
    error.value = false
    try {
      const [usage] = await Promise.all([
        getMarketPriceRecipeUsage().catch(() => null),
        store.dispatch('marketPrices/fetchRows', { forceRefresh: false }),
        store.dispatch('suppliers/fetchSuppliers'),
        store.dispatch('industrials/fetchIndustrials'),
      ])
      if (!Array.isArray(usage?.marketPriceIds)) throw new Error('usage-error')
      usedIds.value = usage.marketPriceIds
      loaded.value = true
    } catch (e) {
      error.value = true
    } finally {
      loading.value = false
    }
  }

  return { products, loading, error, ensureLoaded }
}
