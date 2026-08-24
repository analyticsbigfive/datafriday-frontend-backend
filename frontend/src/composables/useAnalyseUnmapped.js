import { shallowRef, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getSpaceAnalyseUnmappedBatch } from '@/api/endpoints/space.api'
import { ITEM_LEVEL_EVENT_CAP } from '@/composables/useAnalyseItemRecords'

// Même cap que les deux sources de la page (item-level, paniers) : le bandeau doit
// décrire le MÊME périmètre d'events que les chiffres qu'il commente.
const MAX_EVENTS = ITEM_LEVEL_EVENT_CAP

/**
 * Volume NON MAPPÉ des ventes de la page (BUG-356-01) — produits sans
 * WeezeventProductMapping, PdV sans WeezeventLocationShopMapping.
 *
 * INFORMATIF : ces ventes restent COMPTÉES dans toutes les vues, sous « Non
 * mappées » (décision JLH 2026-08-24, après aller-retour — l'exclusion a été
 * envisagée puis écartée). Alimente le bandeau de la page, qui distingue « rien
 * vendu » de « rien de mappé » (piège BUG-300-01) et pointe le travail restant en
 * Data Integration. Structure calquée sur `useTransactionBaskets` : cache par
 * eventId, un appel batch pour les events manquants, jamais de refetch d'un event
 * déjà tenté.
 *
 * Un échec réseau met `null` en cache (≠ zéros) : le bandeau se tait plutôt que
 * d'affirmer « tout est mappé » sans l'avoir vérifié.
 *
 * @param {import('vue').ComputedRef<Array<{id:string}>>} filteredEvents
 */
export function useAnalyseUnmapped(filteredEvents) {
  const route = useRoute()
  // eventId -> { unmappedLines, unmappedUnits, unmappedRevenueHt, ... } | null (tenté, KO)
  const cache = shallowRef({})
  let abortKey = 0

  async function load(events) {
    const list = (events || []).filter((e) => e?.id).slice(0, MAX_EVENTS)
    const targets = list.filter((e) => !(e.id in cache.value))
    if (!targets.length) return

    const spaceId = route.params.spaceId
    const ids = targets.map((e) => e.id)
    const myKey = ++abortKey
    try {
      const byEventId = await getSpaceAnalyseUnmappedBatch(spaceId, ids)
      if (myKey !== abortKey) return
      const patch = {}
      for (const id of ids) patch[id] = byEventId.get(id) || null
      cache.value = { ...cache.value, ...patch }
    } catch (err) {
      if (myKey !== abortKey) return
      console.warn(`[useAnalyseUnmapped] batch KO (${err?.message})`)
      const patch = {}
      for (const id of ids) patch[id] = null
      cache.value = { ...cache.value, ...patch }
    }
  }

  watch(
    filteredEvents,
    (evs) => { load(evs) },
    { immediate: true },
  )

  /** Totaux non mappés sur les events VISIBLES. `known` = au moins une réponse exploitable. */
  const unmapped = computed(() => {
    const agg = { lines: 0, units: 0, revenueHt: 0, productLines: 0, posLines: 0 }
    let known = false
    for (const e of filteredEvents.value || []) {
      const x = cache.value[e?.id]
      if (!x) continue
      known = true
      agg.lines += x.unmappedLines || 0
      agg.units += x.unmappedUnits || 0
      agg.revenueHt += x.unmappedRevenueHt || 0
      agg.productLines += x.unmappedProductLines || 0
      agg.posLines += x.unmappedPosLines || 0
    }
    return { ...agg, known }
  })

  /** BUG-285 pattern : purge au changement d'espace in-page. */
  function clearCache() {
    cache.value = {}
  }

  return { unmapped, clearCache }
}
