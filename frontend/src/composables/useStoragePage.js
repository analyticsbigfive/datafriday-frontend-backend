import { computed, ref } from 'vue'
import { useStore } from 'vuex'
import { usePersistedFilters } from '@/composables/usePersistedFilters'
import { getMarketPriceRecipeUsage } from '@/api/endpoints/market.price.api'
import {
  buildStorageProducts, spaceFilterOptions, filterStorageProducts,
} from '@/components/menu-fb/views/storage/utils/storageProducts'

/**
 * Données et filtres de la page Stockage : Market Prices (store, en cache) hors produits
 * utilisés en recette, une carte par produit et ensemble d'espaces.
 */
export function useStoragePage({ allSpacesLabel }) {
  const store = useStore()
  const loading = ref(false)
  const error = ref('')
  const usedIds = ref([])

  const search = ref('')
  const type = ref('All Types')
  const category = ref('All Categories')
  const spaceName = ref('')
  usePersistedFilters('storage.filters.v1', { search, type, category, spaceName })

  const suppliers = computed(() => store.getters['suppliers/suppliers'] || [])
  const industrials = computed(() => store.getters['industrials/industrials'] || [])
  const spaces = computed(() => store.getters['spaces/spaces'] || [])
  const rows = computed(() => store.getters['marketPrices/rows'] || [])

  const cards = computed(() =>
    buildStorageProducts(rows.value, { suppliers: suppliers.value, industrials: industrials.value, usedIds: usedIds.value }),
  )
  const uniqSorted = (list) => Array.from(new Set(list.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)))
  const typeOptions = computed(() => ['All Types', ...uniqSorted(cards.value.map((c) => c.type))])
  const categoryOptions = computed(() => ['All Categories', ...uniqSorted(cards.value.map((c) => c.category))])
  const spaceOptions = computed(() => [allSpacesLabel(), ...spaceFilterOptions(suppliers.value, spaces.value)])
  const filtered = computed(() =>
    filterStorageProducts(cards.value, {
      search: search.value,
      type: type.value,
      category: category.value,
      spaceName: spaceName.value,
      allSpaces: allSpacesLabel(),
      spaces: spaces.value,
    }),
  )
  const hasFilters = computed(() =>
    !!search.value || type.value !== 'All Types' || category.value !== 'All Categories'
    || (!!spaceName.value && spaceName.value !== allSpacesLabel()),
  )
  const spaceNameOf = (id) => spaces.value.find((s) => String(s.id) === String(id))?.name || ''

  function clearFilters() {
    search.value = ''
    type.value = 'All Types'
    category.value = 'All Categories'
    spaceName.value = ''
  }

  async function load({ force = false } = {}) {
    loading.value = true
    error.value = ''
    try {
      const [usage] = await Promise.all([
        getMarketPriceRecipeUsage(),
        store.dispatch('marketPrices/fetchRows', { forceRefresh: force }),
        store.dispatch('suppliers/fetchSuppliers'),
        store.dispatch('industrials/fetchIndustrials'),
        store.dispatch('spaces/fetchSpaces'),
      ])
      usedIds.value = Array.isArray(usage?.marketPriceIds) ? usage.marketPriceIds : []
    } catch (e) {
      error.value = e?.response?.data?.message || e?.message || 'load-error'
    } finally {
      loading.value = false
    }
  }

  return {
    loading, error, search, type, category, spaceName,
    cards, filtered, typeOptions, categoryOptions, spaceOptions, hasFilters,
    spaceNameOf, clearFilters, load,
  }
}
