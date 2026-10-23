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

import { computed, onBeforeUnmount, ref, watch } from 'vue'
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
  const versionLoaded = ref(false) // true une fois la réponse (même vide) reçue
  const catalogFailed = ref(false)
  let loadedFor = null
  let catalogRequested = false

  async function loadVersion(id) {
    if (!id || loadedFor === id) return
    loadedFor = id
    version.value = null
    versionLoaded.value = false
    try {
      // elements vide : on ne veut que la version (repli miroir local inclus).
      const res = await loadPredictedNeed({ eventId: id, elements: [], menuItems: [], components: [] })
      if (loadedFor === id) {
        version.value = res?.version || null
        versionLoaded.value = true
      }
    } catch (e) {
      console.warn('[liveRemainingNeed] version Event Predict indisponible:', e?.message)
      loadedFor = null // permet une nouvelle tentative au prochain changement d'événement
      versionLoaded.value = true
    }
  }
  watch(() => read(eventId), loadVersion, { immediate: true })

  const analyse = computed(() => store.state.analyse)
  const catalogReady = computed(() => {
    const st = analyse.value
    return !!st?.space && String(st.space.id) === String(read(spaceId)) && !!st.recipeCatalogLoaded
  })

  // Le catalogue arrive en tâche de fond (vague 2b de loadSpace, qui résout silencieusement
  // en cas d'échec) : `loadSpace` rend la main avant. On surveille donc `recipeCatalogLoaded`
  // avec un délai, une seconde tentative forcée, puis l'état « catalog-error » (plus de
  // chargement infini muet).
  const CATALOG_WAIT_MS = 45000
  let attempts = 0
  let catalogTimer = null

  function requestCatalog(force) {
    const sid = read(spaceId)
    attempts += 1
    store
      .dispatch('analyse/loadSpace', force ? { spaceId: sid, force: true } : { spaceId: sid })
      .catch((e) => {
        console.warn('[liveRemainingNeed] chargement du catalogue recettes KO:', e?.message)
        catalogFailed.value = true
      })
    clearTimeout(catalogTimer)
    catalogTimer = setTimeout(() => {
      if (catalogReady.value) return
      if (attempts < 2) requestCatalog(true)
      else catalogFailed.value = true
    }, CATALOG_WAIT_MS)
  }
  onBeforeUnmount(() => clearTimeout(catalogTimer))

  // Déclenché une fois : l'espace est celui de l'onglet mais sans recettes.
  watch(
    () => [analyse.value?.space?.id, analyse.value?.recipeCatalogLoaded, version.value],
    () => {
      const st = analyse.value
      const sid = read(spaceId)
      if (catalogReady.value) {
        clearTimeout(catalogTimer)
        catalogFailed.value = false
        return
      }
      if (catalogRequested || !version.value || !sid) return
      if (!st?.space || String(st.space.id) !== String(sid)) return
      catalogRequested = true
      requestCatalog(false)
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
   * Pourquoi la colonne « Prévu restant » est (ou n'est pas) renseignée :
   * 'ready' | 'loading' | 'no-event' | 'no-version' | 'catalog-error' | 'no-coverage'.
   * Sert à afficher UNE explication au lieu de répéter des tirets muets.
   */
  const status = computed(() => {
    if (!read(eventId)) return 'no-event'
    if (!versionLoaded.value) return 'loading'
    if (!version.value) return 'no-version'
    if (!catalogReady.value) return catalogFailed.value ? 'catalog-error' : 'loading'
    if (!(read(shops) || []).length) return 'loading'
    return hasPredict.value ? 'ready' : 'no-coverage'
  })

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

  // Trace de diagnostic (console) à chaque changement d'état : de quoi lire pourquoi la
  // colonne est vide sans ouvrir le code.
  watch(
    status,
    (v) => {
      const st = analyse.value
      console.info('[liveRemainingNeed]', v, {
        eventId: read(eventId),
        versionRecords: version.value?.predictedRecords?.length ?? null,
        shops: (read(shops) || []).length,
        menuItems: st?.menuItems?.length ?? 0,
        components: st?.components?.length ?? 0,
        catalogReady: catalogReady.value,
        indexRows: fullIndex.value?.rows?.length ?? 0,
      })
    },
    { immediate: true },
  )

  return { needLookup, hasPredict, catalogReady, status }
}
