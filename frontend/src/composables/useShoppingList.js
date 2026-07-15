// useShoppingList (Règle 3) — liste de courses / réarmement.
//
// Pipeline :
//   1. ventes de l'event de référence (useReferenceSales)            -> rows
//   2. agrégation par menu item + PDV via shop-element-mapping       -> predictedRecords
//   3. besoin théorique par article/PDV (buildStockRequirements,       -> stockRows
//      expansion Règle 2, packaging inclus)
//   4. restant compté (inventoryCounts) + gap = max(0, besoin-restant) -> lines
//   5. agrégat global (somme des gaps tous PDV) + breakdown par PDV    -> aggregated
//
// Toute la logique de calcul vit dans des utils purs (salesAggregation, shoppingList,
// stockPlanning) ; ce composable se contente de brancher store + fetch.

import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import { fetchReferenceSales } from '@/composables/useReferenceSales'
import { aggregateSalesToPredictedRecords } from '@/utils/salesAggregation'
import { buildStockRequirements, isPackagingComponent } from '@/utils/stockPlanning'
import { buildShoppingList } from '@/utils/shoppingList'
import { getShopElementMappings } from '@/utils/api'

/**
 * Construit un index id|name -> inventoryQuantityPackaged depuis les market prices
 * (ingrédients + packaging) et les component definitions.
 */
export function buildQuantityPackagedIndex(marketPrices = [], components = []) {
  const byId = new Map()
  const byName = new Map()
  const put = (id, name, qty) => {
    const q = Number(qty)
    if (!Number.isFinite(q) || q <= 0) return
    if (id) byId.set(String(id), q)
    if (name) byName.set(String(name).toLowerCase(), q)
  }
  ;(marketPrices || []).forEach((mp) =>
    put(mp.id, mp.itemName, mp.inventoryQuantityPackaged),
  )
  ;(components || []).forEach((c) =>
    put(c.id, c.name, c.inventoryQuantityPackaged),
  )
  return {
    get(row) {
      const byIdHit =
        (row.itemId && byId.get(String(row.itemId))) ||
        (row.sourceId && byId.get(String(row.sourceId)))
      if (byIdHit) return byIdHit
      const byNameHit = row.itemName && byName.get(String(row.itemName).toLowerCase())
      return byNameHit || 1
    },
  }
}

export function useShoppingList(options = {}) {
  const store = useStore()

  const referenceEvent = ref(options.referenceEvent || null)
  const lines = ref([])
  const aggregated = ref([])
  const loading = ref(false)
  const degraded = ref(false)
  const error = ref(null)

  const menuItems = computed(() => store.state.analyse?.menuItems || [])
  const components = computed(() => store.state.analyse?.components || [])
  const marketPrices = computed(() => store.state.inventory?.marketPrices || [])
  const inventoryCounts = computed(() => store.state.inventory?.inventoryCounts || {})

  function resolveConfiguration() {
    if (typeof options.configuration === 'function') return options.configuration()
    if (options.configuration?.value !== undefined) return options.configuration.value
    if (options.configuration) return options.configuration
    const configs = store.state.analyse?.configurations || []
    return configs.find((c) => c.id !== 'cfg-all') || configs[0] || store.state.analyse?.space || null
  }

  /**
   * Calcule la liste de courses pour un event de référence donné.
   * @param {{id?:string, start?:string, end?:string, fromDate?:string, toDate?:string}} refEvent
   */
  async function compute(refEvent) {
    const ev = refEvent || referenceEvent.value
    referenceEvent.value = ev
    const spaceId = options.spaceId || store.state.analyse?.space?.id || null
    if (!spaceId || !ev) {
      lines.value = []
      aggregated.value = []
      return { lines: [], aggregated: [] }
    }

    loading.value = true
    error.value = null
    degraded.value = false
    try {
      const fromDate = ev.start || ev.fromDate || ev.eventDate || ev.date
      const toDate = ev.end || ev.toDate || ev.eventEndDate || fromDate

      // 1. ventes de référence (+ fallback)
      const salesRes = await fetchReferenceSales(spaceId, { fromDate, toDate })
      degraded.value = !!salesRes.degraded
      if (salesRes.error) error.value = salesRes.error

      // 2. shop-element-mapping -> agrégation par menu item + PDV
      let mappings = []
      try {
        mappings = await getShopElementMappings(spaceId)
      } catch (e) {
        console.warn('[useShoppingList] getShopElementMappings failed:', e?.message)
      }
      const predictedRecords = aggregateSalesToPredictedRecords(salesRes.rows, {
        mappings,
        menuItems: menuItems.value,
      })

      // 3. besoin théorique par article/PDV (packaging inclus via expandMenuItemStock)
      const stockRows = buildStockRequirements({
        configuration: resolveConfiguration(),
        menuItems: menuItems.value,
        components: components.value,
        predictedRecords,
      })

      // 4 + 5. gap + agrégat
      const qtyIndex = buildQuantityPackagedIndex(marketPrices.value, components.value)
      const result = buildShoppingList({
        stockRows,
        inventoryCounts: inventoryCounts.value,
        getQuantityPackaged: (row) => qtyIndex.get(row),
      })
      lines.value = result.lines
      aggregated.value = result.aggregated
      return result
    } catch (e) {
      error.value = e?.message || 'shopping-list-error'
      lines.value = []
      aggregated.value = []
      return { lines: [], aggregated: [] }
    } finally {
      loading.value = false
    }
  }

  return {
    referenceEvent,
    lines,
    aggregated,
    loading,
    degraded,
    error,
    compute,
    // ré-exports utilitaires
    isPackagingComponent,
  }
}
