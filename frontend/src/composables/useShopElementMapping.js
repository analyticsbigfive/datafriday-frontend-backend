// useShopElementMapping(spaceId) — spec composable #1.
// Charge getShopElementMappings et expose :
//   - mappingByElement : Map<elementId, shopName>
//   - suggestionsByElement / suggestedForElement : menu items suggérés par PDV
//     (= produits du shop mappé), pour la réconciliation souple (Règle 1).

import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import { getShopElementMappings } from '@/utils/api'
import { buildSuggestionsByElement } from '@/composables/useSpaceMenuReconciliation'

function unref(maybe) {
  if (typeof maybe === 'function') return maybe()
  if (maybe && maybe.value !== undefined) return maybe.value
  return maybe
}

export function useShopElementMapping(spaceIdRef) {
  const store = useStore()
  const mappings = ref([])
  const loading = ref(false)
  const error = ref(null)

  const mappingByElement = computed(() => {
    const m = new Map()
    mappings.value.forEach((r) => {
      const elementId = r.elementId || r.spaceElementId || r.element
      const shopName = r.shopName || r.shop?.name || r.shop
      if (elementId) m.set(elementId, shopName)
    })
    return m
  })

  const suggestionsByElement = computed(() =>
    buildSuggestionsByElement(mappings.value, (shopId) =>
      store.getters['shopMenuItems/forShop'](shopId),
    ),
  )

  async function load(spaceId) {
    const sid = spaceId || unref(spaceIdRef)
    if (!sid) {
      mappings.value = []
      return []
    }
    loading.value = true
    error.value = null
    try {
      const raw = await getShopElementMappings(sid)
      mappings.value = Array.isArray(raw) ? raw : []
      // Précharge les menu items des shops mappés (pour les suggestions).
      const shopIds = [
        ...new Set(
          mappings.value
            .map((m) => m.shopId || m.shop?.id || m.shopElementId || m.shop)
            .filter(Boolean),
        ),
      ]
      await Promise.all(
        shopIds.map((id) =>
          store.dispatch('shopMenuItems/fetchForShop', { shopId: id }).catch(() => {}),
        ),
      )
      return mappings.value
    } catch (e) {
      error.value = e?.message || 'mapping-error'
      mappings.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  function suggestedForElement(elementId) {
    return suggestionsByElement.value.get(elementId) || new Set()
  }

  return {
    mappings,
    mappingByElement,
    suggestionsByElement,
    loading,
    error,
    load,
    suggestedForElement,
  }
}
