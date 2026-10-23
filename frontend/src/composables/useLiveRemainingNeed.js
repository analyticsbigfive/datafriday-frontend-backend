// Besoin « ventes prévues restantes » de l'onglet Inventaire live, exprimé au grain
// de l'inventaire (ingrédient / composant / packaging) par PdV.
//
// Chaîne : version Event Predict par défaut -> restant par Menu Item (prédit ajusté
// moins vendu, utils/liveRemainingSales) -> conversion par les recettes via
// `buildPredictedNeedIndex` (même code que Pre-event Inventory / Logistic).
//
// Le catalogue de recettes n'est pas chargé par la page Live (skipRecipeCatalog) :
// on déclenche UN chargement complet depuis ici, et tant qu'il n'est pas prêt
// l'index reste null (rien de fabriqué, colonne vide).

import { computed, ref, watch } from 'vue'
import { useStore } from 'vuex'
import {
  buildPredictedNeedIndex,
  loadPredictedNeed,
  lookupPredictedNeed,
  lookupPredictedNeedSources,
} from '@/composables/usePredictedNeed'
import { buildRemainingRecords, buildSalesIndex } from '@/utils/liveRemainingSales'

/**
 * @param {Object} p
 * @param {import('vue').Ref<string>|(() => string)} p.eventId
 * @param {import('vue').Ref<string>|(() => string)} p.spaceId
 * @param {() => Array<{id:string,name:string}>} p.shops PdV de l'inventaire live
 * @param {() => Array<object>} p.timelineRows ventes réalisées (useLiveData)
 */
export function useLiveRemainingNeed({ eventId, spaceId, shops, timelineRows }) {
  const store = useStore()
  const read = (v) => (typeof v === 'function' ? v() : v?.value)

  const version = ref(null)
  let loadedFor = null
  let catalogRequested = false

  async function loadVersion(id) {
    if (!id || loadedFor === id) return
    loadedFor = id
    version.value = null
    try {
      // elements vide : on ne veut que la version (repli miroir local inclus).
      const res = await loadPredictedNeed({ eventId: id, elements: [], menuItems: [], components: [] })
      if (loadedFor === id) version.value = res?.version || null
    } catch (e) {
      console.warn('[liveRemainingNeed] version Event Predict indisponible:', e?.message)
    }
  }
  watch(() => read(eventId), loadVersion, { immediate: true })

  const analyse = computed(() => store.state.analyse)
  const catalogReady = computed(() => {
    const st = analyse.value
    return !!st?.space && String(st.space.id) === String(read(spaceId)) && !!st.recipeCatalogLoaded
  })

  // Une seule fois : l'espace est celui de l'onglet mais sans recettes.
  watch(
    () => [analyse.value?.space?.id, analyse.value?.recipeCatalogLoaded, version.value],
    () => {
      const st = analyse.value
      const sid = read(spaceId)
      if (catalogRequested || !version.value || !sid || catalogReady.value) return
      if (!st?.space || String(st.space.id) !== String(sid)) return
      catalogRequested = true
      store.dispatch('analyse/loadSpace', { spaceId: sid }).catch((e) => {
        console.warn('[liveRemainingNeed] chargement du catalogue recettes KO:', e?.message)
      })
    },
    { immediate: true },
  )

  function buildIndex(salesIndex) {
    if (!version.value || !catalogReady.value) return null
    const list = read(shops) || []
    const st = analyse.value
    const records = buildRemainingRecords({
      version: version.value,
      shops: list,
      menuItems: st.menuItems,
      salesIndex,
    })
    if (!records.length) return null
    return buildPredictedNeedIndex({
      elements: list,
      menuItems: st.menuItems,
      components: st.components,
      // Records déjà ajustés (isManual) : on neutralise les ajustements de la version.
      version: { predictedRecords: records, menuConfig: version.value.menuConfig, quantityAdjustments: {} },
    })
  }

  // Prédit complet (sans les ventes) : distingue « rien de prévu » (null) de
  // « tout est déjà vendu » (0 à réarmer).
  const fullIndex = computed(() => buildIndex(null))
  const remainingIndex = computed(() => buildIndex(buildSalesIndex(read(timelineRows))))

  const hasPredict = computed(() => !!fullIndex.value)

  /**
   * @returns {{units:number, sources:Array}|null} null = pas de predict pour cette ligne
   */
  function needLookup(shopId, itemKey, itemRefId) {
    const full = fullIndex.value
    if (!full) return null
    const item = { id: itemRefId, name: itemKey }
    if (lookupPredictedNeed(full, shopId, item) == null) return null
    const rem = remainingIndex.value
    const units = rem ? lookupPredictedNeed(rem, shopId, item) : null
    if (units == null) return { units: 0, sources: [] }
    return { units, sources: lookupPredictedNeedSources(rem, shopId, item) }
  }

  return { needLookup, hasPredict, catalogReady }
}
