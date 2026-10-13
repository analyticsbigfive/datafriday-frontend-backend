/**
 * useArticleDimensions : dimensions article « rendement » (endpoint A) en cache
 * partagé. Une requête par espace, quel que soit le nombre de consommateurs
 * (AnalyseView, panneau de filtres, donuts) : le cache vit au niveau du module.
 *
 * `index` reste null tant que l'endpoint n'a pas répondu (et en cas d'échec) : les
 * filtres marque / industriel / fournisseur / promotion ne filtrent alors rien et les
 * donuts correspondants affichent un squelette ou un état d'erreur, jamais une valeur
 * provisoire.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { getArticleDimensions } from '@/api/endpoints/analyse-rendement.api'
import { buildDimensionIndex, listDimensionOptions } from '@/utils/articleDimensionBreakdown'

// 'idle' | 'loading' | 'ready' | 'error'
const status = ref('idle')
const loadedSpaceId = ref(null)
const indexRef = shallowRef(null)
let inflight = null

/** Charge (une fois par espace) les dimensions article. Ne relance pas un chargement identique. */
async function load(spaceId, { force = false } = {}) {
  if (!spaceId) return
  if (!force && loadedSpaceId.value === spaceId && (status.value === 'ready' || status.value === 'loading')) {
    return inflight
  }
  loadedSpaceId.value = spaceId
  status.value = 'loading'
  indexRef.value = null
  const request = getArticleDimensions(spaceId)
    .then((res) => {
      // Réponse périmée (l'utilisateur a changé d'espace entre-temps) : on l'ignore.
      if (loadedSpaceId.value !== spaceId) return
      indexRef.value = buildDimensionIndex(res?.items)
      status.value = 'ready'
    })
    .catch((err) => {
      if (loadedSpaceId.value !== spaceId) return
      console.warn('[analyse] article-dimensions indisponible', err?.message || err)
      status.value = 'error'
    })
  inflight = request
  return request
}

/** Vide le cache (changement d'espace, déconnexion). */
function reset() {
  loadedSpaceId.value = null
  status.value = 'idle'
  indexRef.value = null
  inflight = null
}

/**
 * @param {Object} [opts]
 * @param {import('vue').Ref<string|null>} [opts.spaceId] avec `enabled`, charge automatiquement
 * @param {import('vue').Ref<boolean>} [opts.enabled] permission stats.financial.view
 */
export function useArticleDimensions({ spaceId = null, enabled = null } = {}) {
  if (spaceId && enabled) {
    watch(
      [spaceId, enabled],
      ([sid, ok]) => { if (ok && sid) load(sid) },
      { immediate: true },
    )
  }
  const index = computed(() => indexRef.value)
  const options = computed(() => listDimensionOptions(indexRef.value))
  return { index, status, options, load, reset }
}
