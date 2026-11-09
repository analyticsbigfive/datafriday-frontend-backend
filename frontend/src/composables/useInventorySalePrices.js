// Prix de vente HT unitaires d'un event, pour valoriser le « Résumé Inventaire ».
// Chargement silencieux : route absente (404), erreur ou réponse inattendue donnent une
// map vide, donc aucune valeur HT affichée, jamais d'erreur visible. Cache par event
// (échecs compris, pour ne pas relancer une route absente à chaque rendu).
import { ref, computed, watch, unref } from 'vue'
import { getEventSalePrices } from '@/api/endpoints/inventory.api'

const cache = new Map()

/** Vide le cache (tests, changement de session). */
export function clearInventorySalePricesCache() {
  cache.clear()
}

/** Réponse API -> objet { itemId: unitPriceHt } ; ignore les prix absents ou <= 0. */
export function pricesToMap(payload) {
  const map = {}
  for (const p of payload?.prices || []) {
    const n = Number(p?.unitPriceHt)
    if (p?.itemId != null && p.unitPriceHt != null && Number.isFinite(n) && n > 0) {
      map[String(p.itemId)] = n
    }
  }
  return map
}

async function load(spaceId, eventId) {
  const key = `${spaceId}:${eventId}`
  if (!cache.has(key)) {
    cache.set(
      key,
      getEventSalePrices(spaceId, eventId).then(pricesToMap, () => ({})),
    )
  }
  return cache.get(key)
}

/**
 * @param {import('vue').Ref|string} spaceId
 * @param {import('vue').Ref|string} eventId
 * @param {import('vue').Ref|boolean} enabled false pour un document figé
 */
export function useInventorySalePrices(spaceId, eventId, enabled = true) {
  const prices = ref({})
  const loading = ref(false)
  let seq = 0

  async function refresh() {
    const sp = unref(spaceId)
    const ev = unref(eventId)
    const run = ++seq
    if (!unref(enabled) || !sp || !ev) {
      prices.value = {}
      loading.value = false
      return
    }
    loading.value = true
    const map = await load(sp, ev)
    if (run !== seq) return
    prices.value = map
    loading.value = false
  }

  watch([() => unref(spaceId), () => unref(eventId), () => unref(enabled)], refresh, { immediate: true })

  return { prices, loading, hasPrices: computed(() => Object.keys(prices.value).length > 0) }
}
