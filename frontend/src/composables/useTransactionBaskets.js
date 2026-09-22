import { ref, shallowRef, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getSpaceTransactionBasketsBatch } from '@/api/endpoints/space.api'
import { ITEM_LEVEL_EVENT_CAP } from '@/composables/useAnalyseItemRecords'

// BUG-354-01 : MÊME cap que l'item-level. Depuis que les paniers alimentent le KPI
// transactions (et le txn/min), deux caps différents (50 ici, 100 là) publieraient un
// CA calculé sur 100 events et des transactions calculées sur 50 — un sous-comptage
// silencieux, et un panier moyen faux, exactement ce qu'interdit BUG-350-01.
const MAX_EVENTS = ITEM_LEVEL_EVENT_CAP

/** BUG-386-02 : échecs tolérés par event avant d'abandonner (voir `failedIds`). */
const MAX_ATTEMPTS = 2

/** Cap exposé pour l'affichage du message de troncature (cf. ITEM_LEVEL_EVENT_CAP). */
export const BASKET_EVENT_CAP = MAX_EVENTS

// Une seule alerte par session, tous consommateurs confondus — même pattern que
// `_warnedBatchKo` dans useAnalyseItemRecords.
let _warnedBatchKo = false

/**
 * Combinaisons de catégories/articles PAR TRANSACTION pour les events visibles.
 *
 * Alimente `TransactionCategoryMixChart` (donut « Répartition des catégories de
 * produits par transaction »). Structure identique à `useAnalyseItemRecords` :
 * cache par eventId, un seul appel batch pour les events manquants, `refresh()`
 * qui bypasse le cache session pour le module Live.
 *
 * Pourquoi une source dédiée plutôt que de dériver des records item-level : ces
 * derniers sont agrégés par (minute × PdV × article) et ont PERDU l'identité du
 * panier — impossible de savoir a posteriori quelles lignes ont été achetées
 * ensemble. Seul cet endpoint la préserve.
 *
 * @param {import('vue').ComputedRef<Array<{id:string}>>} filteredEvents
 * @param {{ maxEvents?: number }} [options]
 */
export function useTransactionBaskets(filteredEvents, { maxEvents = MAX_EVENTS } = {}) {
  const route = useRoute()
  // eventId -> BasketComboRecord[] (GELÉS). [] = tenté/vide.
  // BUG-285 : shallowRef + Object.freeze, même traitement que useAnalyseItemRecords
  // (BUG-284) — écritures exclusivement par réassignation, les consommateurs ne
  // mutent jamais les lignes (reconcileRecord → objets neufs).
  const cache = shallowRef({})
  const loading = ref(false)
  const fetchError = ref(null)
  let abortController = null
  // BUG-386-02 : events dont le batch a ÉCHOUÉ. Ils ne sont PLUS écrits `[]` dans le
  // cache. L'ancien marquage « tenté = [] » rendait un échec réseau indistinguable d'un
  // « aucune vente » pour TOUS les consommateurs : la carte TX/MIN, dont les paniers sont
  // la seule source, publiait 0,00/min comme une valeur terminale et ne bougeait plus de
  // la session (aucun refetch possible, la clé étant dans le cache), pendant que le CA,
  // lu sur le rollup `Event.revenue`, restait juste. Un échec doit rester VISIBLE
  // (`sourceState === 'error'` → la carte rend « — ») et RATTRAPABLE.
  const failedIds = shallowRef(new Set())
  // Nombre d'ÉCHECS par event. Borne le rattrapage : le watcher `filteredEvents` tire à
  // chaque recalcul de la liste, sans ce plafond un endpoint durablement KO repartirait
  // en boucle (ce que l'ancien marquage `[]` évitait, au prix du 0 muet). On compte les
  // échecs et NON les tentatives : un chargement ANNULÉ (sélection élargie pendant le
  // vol) ne conclut rien, consommer le budget sur son dos laisserait l'event ni livré ni
  // marqué, donc en 'loading' pour toujours.
  const failures = new Map()

  /**
   * Charge les events absents du cache. Un event LIVRÉ n'est jamais refetché ; un event
   * en ÉCHEC l'est tant qu'il n'a pas épuisé MAX_ATTEMPTS échecs (BUG-386-02).
   */
  async function load(events, { bypassCache = false } = {}) {
    const list = (events || []).filter((e) => e?.id).slice(0, maxEvents)
    const targets = bypassCache
      ? list
      : list.filter((e) => !(e.id in cache.value) && (failures.get(e.id) || 0) < MAX_ATTEMPTS)
    if (!targets.length) return

    if (abortController) abortController.abort()
    const controller = new AbortController()
    abortController = controller
    loading.value = true

    const spaceId = route.params.spaceId
    // BUG-363-01 : récents d'abord + patch du cache PAR EVENT dès que son paquet
    // répond — même mécanique que useAnalyseItemRecords.ensureLoaded. `sourceState`
    // ne publie 'ready' qu'à complétude (déjà le cas ci-dessous), donc les KPI
    // dérivés des paniers ne voient jamais de somme partielle.
    const ids = [...targets]
      .sort((a, b) => new Date(b.date || b.eventDate || 0) - new Date(a.date || a.eventDate || 0))
      .map((e) => e.id)
    const processed = new Set()
    const applyEvent = (id, data) => {
      if (controller.signal.aborted || processed.has(id)) return
      processed.add(id)
      const rows = Array.isArray(data) ? data.map((r) => Object.freeze({ ...r, eventId: id })) : []
      // Nouvelle référence pour déclencher la réactivité du computed.
      cache.value = { ...cache.value, [id]: Object.freeze(rows) }
      // Livré : l'event sort de l'ensemble en échec (cas du rattrapage réussi).
      failures.delete(id)
      if (failedIds.value.has(id)) {
        const next = new Set(failedIds.value)
        next.delete(id)
        failedIds.value = next
      }
    }
    try {
      const byEventId = await getSpaceTransactionBasketsBatch(spaceId, ids, { bypassCache, onEvent: applyEvent })
      if (controller.signal.aborted) return
      // Events servis depuis le cache session de l'API (pas de paquet HTTP, donc
      // pas d'onEvent) — appliqués depuis le résultat final.
      for (const id of ids) {
        if (!processed.has(id)) applyEvent(id, byEventId.get(id) || [])
      }
      if (bypassCache) _warnedBatchKo = false
    } catch (err) {
      if (controller.signal.aborted) return
      console.warn(`[useTransactionBaskets] transaction-baskets batch KO (${err?.message})`)
      // Sans signalement, un échec réseau est indistinguable d'un « aucune vente sur
      // ce périmètre » — et le donut afficherait un vide silencieux.
      if (!_warnedBatchKo) {
        _warnedBatchKo = true
        fetchError.value = err?.message || 'transaction-baskets batch failed'
      }
      // BUG-386-02 : les events non livrés sont marqués EN ÉCHEC, pas `[]`. Écrire un
      // tableau vide dans le cache publiait un résultat terminal faux (0 ticket, donc
      // TX/MIN à 0,00/min) et interdisait tout rattrapage. Ici la boucle est bornée par
      // `failures`/MAX_ATTEMPTS et l'état est lisible par les consommateurs.
      const next = new Set(failedIds.value)
      for (const id of ids) {
        if (processed.has(id)) continue
        next.add(id)
        failures.set(id, (failures.get(id) || 0) + 1)
      }
      failedIds.value = next
    } finally {
      if (!controller.signal.aborted) loading.value = false
      if (abortController === controller) abortController = null
    }
  }

  watch(
    filteredEvents,
    (evs) => { load(evs) },
    { immediate: true },
  )

  /**
   * Module Live : re-fetch en bypassant le cache session — un event EN COURS n'est
   * pas immuable, contrairement à l'hypothèse qui justifie ce cache pour un event
   * passé. Branché sur `livePoll` dans AnalyseView ; sans ça le donut se figerait
   * pendant que le reste de la page tique.
   */
  function refresh() {
    return load(filteredEvents.value, { bypassCache: true })
  }

  /** Records de tous les events VISIBLES, recomposés depuis le cache. */
  const basketRecords = computed(() => {
    const out = []
    for (const e of filteredEvents.value || []) {
      const recs = cache.value[e?.id]
      if (recs && recs.length) out.push(...recs)
    }
    return out
  })

  /** Events réellement chargés — permet d'aligner un comptage sur le réel. */
  const loadedEventIds = computed(() => new Set(Object.keys(cache.value)))

  // BUG-354-01 — events du périmètre écartés par le cap, remontés comme le fait déjà
  // `useAnalyseItemRecords` : un total tronqué doit le dire.
  const truncatedEventCount = computed(() =>
    Math.max(0, (filteredEvents.value || []).length - maxEvents),
  )

  // BUG-354-01 — état de la source paniers, MÊME contrat à 3 valeurs que l'item-level
  // (`useAnalyseItemRecords.sourceState`). Depuis que les paniers sont la source des
  // transactions, la bande KPI doit pouvoir afficher son squelette pendant leur
  // chargement : sans ça, elle publierait la somme item-level — le nombre surcompté
  // que ce lot retire — puis le remplacerait. C'est la valeur provisoire interdite par
  // BUG-350-01. `[]` (chargé, aucun panier) est TERMINAL et ne doit pas figer l'écran.
  // Décision JLH 2026-08-24 (carte TX/MIN) : 'ready' n'est publié que lorsque TOUS
  // les events scopés ont été tentés. L'ancien ordre (`if (basketRecords.length)
  // return 'ready'`) publiait 'ready' dès le premier record en cache alors que
  // d'autres events étaient encore en vol (sélection élargie, cache partiel d'un
  // autre consommateur) → les KPI dérivés (Σ des taux par PdV, transactions,
  // panier moyen) affichaient une somme PARTIELLE destinée à bouger — la valeur
  // provisoire interdite par BUG-350-01.
  // BUG-386-02 — QUATRIÈME valeur, 'error' : des events du périmètre ne seront pas
  // livrés (batch KO, tentatives épuisées). Auparavant ces events étaient écrits `[]`
  // et l'état retombait sur 'empty', c'est-à-dire sur « chargé, aucun panier » : la
  // carte TX/MIN publiait alors 0,00/min comme une valeur exacte. 'error' n'est PAS
  // 'loading' (pas de squelette éternel) et n'est PAS 'empty' (pas de faux zéro) :
  // les consommateurs rendent « — ».
  const sourceState = computed(() => {
    const scoped = (filteredEvents.value || []).slice(0, maxEvents).filter((e) => e?.id)
    if (!scoped.length) return 'empty'
    if (loading.value) return 'loading'
    const attempted = loadedEventIds.value
    const missing = scoped.filter((e) => !attempted.has(e.id))
    if (missing.length) {
      // Rien n'est plus en vol (`loading` est déjà false ici) : si TOUS les manquants
      // sont en échec, l'état est terminal et vaut 'error'. Un manquant non marqué en
      // échec signifie qu'un chargement est encore attendu.
      const failed = failedIds.value
      return missing.every((e) => failed.has(e.id)) ? 'error' : 'loading'
    }
    return basketRecords.value.length ? 'ready' : 'empty'
  })

  /** BUG-285 : purge (changement d'espace in-page — les eventIds de l'ancien espace
      ne seront plus jamais demandés, leurs lignes resteraient en mémoire). */
  function clearCache() {
    cache.value = {}
    // Même raison qu'au-dessus : les ids de l'ancien espace ne seront plus demandés,
    // et un event homonyme du nouvel espace ne doit pas hériter de leur échec.
    failedIds.value = new Set()
    failures.clear()
  }

  return {
    basketRecords,
    loading,
    fetchError,
    loadedEventIds,
    truncatedEventCount,
    sourceState,
    refresh,
    clearCache,
  }
}
