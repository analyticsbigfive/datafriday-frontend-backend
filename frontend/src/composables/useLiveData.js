// Chantier 379 (frontend/docs/chantiers/379_live_standalone_backend_driven) — données du
// nouvel écran Live, autonome : appelle directement les endpoints déjà backend-driven
// (live-status, event-timeline, transaction-baskets), sans dépendre du store Vuex
// `analyse` ni d'AnalyseView.vue. Marge %/per-cap volontairement absents de cette 1ère
// version (calcul encore frontend dans Analyse, cf. PLAN.md §"encore frontend") — à
// ajouter une fois le calcul déplacé côté backend, pas avant.
//
// `shop-details` (get_space_shop_details, RPC) volontairement PAS utilisé ici — vérifié
// en base : c'est un total ALL-TIME par shop, aucun filtre par event. `event-timeline`
// (déjà appelé, déjà scopé au seul event live) porte exactement les mêmes champs par
// ligne (shopId/shopName/revenue/transactionCount) — une seule source de vérité, pas
// deux endpoints à garder synchronisés sur des scopes différents.
//
// `revenue`/`revenueHt` peuvent revenir à 0 pour un utilisateur sans la permission
// `stats.financial.view` — le backend les retire volontairement de la réponse
// (spaces.service.ts:1818-1821, même garde que shop-details) : comportement RBAC voulu,
// pas un bug de ce composable.
import { ref, computed } from 'vue'
import { getSpaceLiveStatus, getSpaceEventTimelineBatch, getSpaceTransactionBasketsBatch } from '@/api/endpoints/space.api'
import { getEvents } from '@/api/endpoints/event.api'
import { useLiveStream } from '@/composables/useLiveStream'
import { buildShopTotals, buildTimelineByMinute, sumBasketTransactions, txPerMinuteFromBaskets } from '@/utils/liveKpis'
import { isEventInProgress } from '@/utils/eventLifecycle'
import { getLiveDelta } from '@/api/endpoints/liveDelta.api'
import { latestMinuteLocal, mergeSince, minuteLocalMinus } from '@/utils/liveDelta'
import { createThrottledRunner } from '@/utils/throttledRunner'

// Décision utilisateur (2026-09-01) : pas de "front qui va demander" en boucle, même
// espacé — le backend sait déjà exactement quand quelque chose change (il publie sur
// Redis à CHAQUE agrégation terminée pour l'espace, cf. AggregationProcessor::onCompleted
// — y compris la toute première d'un event qui vient de démarrer, pas seulement les
// mises à jour d'un event déjà connu comme live). Le front n'a donc besoin QUE d'écouter
// en continu : SSE reste connecté tant que la page est montée, "live" ou pas — aucun
// idle-poll périodique. FALLBACK_POLL_MS ne sert que de filet de sécurité si la
// connexion SSE elle-même est tombée (mêmes raisons que
// WeezeventCronService.triggerLiveAggregationSafetyNet côté backend).
const FALLBACK_POLL_MS = 30000

// Bande passante (mesure du 2026-09-26 : 90 % du trafic d'un match venait de cet écran) :
// - au plus un rafraîchissement toutes les 30 s, même si les agrégations s'enchaînent ;
// - seules les dernières minutes sont redemandées (paramètre `since`), avec un recouvrement
//   pour absorber les ventes arrivées en retard sur les minutes récentes ;
// - rechargement complet toutes les 10 min (ventes très tardives, corrections) ;
// - liste des events de l'espace rechargée seulement si l'event change, ou toutes les 10 min.
const MIN_REFRESH_MS = 30000
const DELTA_OVERLAP_MIN = 5
const FULL_RESYNC_MS = 10 * 60 * 1000
const EVENTS_LIST_TTL_MS = 10 * 60 * 1000

export function useLiveData(spaceId) {
  const isLive = ref(false)
  const liveSince = ref(null)
  const eventId = ref(null)
  const event = ref(null)
  const timelineRows = ref([])
  const basketRows = ref([])
  const loading = ref(true)
  const error = ref(null)

  let fallbackTimer = null
  let stopped = true
  let reqId = 0
  // Event dont les lignes sont chargées, et date du dernier chargement complet.
  let loadedEventId = null
  let lastFullAt = 0
  // Résolution de l'event (liste des events de l'espace) mise en cache.
  let resolvedKey = null
  let resolvedId = null
  let eventsFetchedAt = 0
  // Rafraîchissement manuel (event modifié dans le drawer) : tout est relu, event compris.
  let forceNext = false
  const throttled = createThrottledRunner(() => refresh(), MIN_REFRESH_MS)

  // onMessage : un message SSE ne porte aucune donnée utile en soi (juste "ça vient de
  // changer pour cet espace", cf. backend liveStream) — on redemande simplement les
  // données habituelles, mêmes endpoints que le polling.
  const stream = useLiveStream(`/spaces/${spaceId}/live/stream`, () => { throttled.request() })

  // Repli quand aucune vente n'est tombée dans les 30 dernières minutes (isLive=false) :
  // même logique que findTodayEventId() d'AnalyseView.vue, réimplémentée ici pour ne
  // dépendre d'aucun état déjà chargé côté store Analyse (zéro couplage, décision
  // utilisateur 2026-09-01).
  function findTodayEvent(events) {
    // D'abord l'event EN COURS (minuit local du jour → fin réelle, cf.
    // utils/eventLifecycle.js) : un match fini à 03:00 le lendemain reste l'event du
    // Live après minuit. Repli jour calendaire : après la fin, le Live montre encore
    // le match du jour.
    const now = new Date()
    const inProgress = (events || []).find((e) => isEventInProgress(e, now))
    if (inProgress) return inProgress
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999)
    for (const e of events || []) {
      const start = e.eventStartDate ? new Date(e.eventStartDate) : (e.eventDate ? new Date(e.eventDate) : null)
      if (!start) continue
      const end = e.eventEndDate ? new Date(e.eventEndDate) : start
      if (start <= todayEnd && end >= today) return e
    }
    return null
  }

  async function resolveEvent() {
    const status = await getSpaceLiveStatus(spaceId)
    isLive.value = !!(status?.isLive && status?.eventId)
    liveSince.value = status?.since || null
    // Le même event live reste résolu d'un tick à l'autre (nom/date ne changent
    // pratiquement jamais en cours de vente) — pas besoin de retélécharger les 200
    // events de l'espace À CHAQUE tick SSE juste pour retrouver le même objet.
    // Seul un event qui vient de démarrer/changer justifie le fetch.
    const forced = forceNext
    forceNext = false
    if (!forced && status?.eventId && event.value?.id === status.eventId) {
      return status.eventId
    }
    // Même résolution que la précédente (event live absent de la liste, ou pas de live) :
    // la liste n'est pas retéléchargée avant EVENTS_LIST_TTL_MS. Avant, un event live
    // introuvable dans les 200 premiers la faisait recharger à chaque signal.
    const key = status?.eventId || 'today'
    if (!forced && key === resolvedKey && Date.now() - eventsFetchedAt < EVENTS_LIST_TTL_MS) {
      return resolvedId
    }
    const res = await getEvents({ spaceId, limit: 200, excludeSimulated: false })
    const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])
    if (status?.eventId) {
      event.value = list.find((e) => e.id === status.eventId) || null
    } else {
      event.value = findTodayEvent(list)
    }
    resolvedKey = key
    resolvedId = status?.eventId || event.value?.id || null
    eventsFetchedAt = Date.now()
    return resolvedId
  }

  /** Lignes de l'event : complètes au premier chargement, au changement d'event et toutes
   *  les FULL_RESYNC_MS ; sinon seulement les dernières minutes, fusionnées. */
  async function loadRows(evId, myReqId) {
    const latest = evId === loadedEventId ? latestMinuteLocal(timelineRows.value) : null
    const since = latest && Date.now() - lastFullAt < FULL_RESYNC_MS ? minuteLocalMinus(latest, DELTA_OVERLAP_MIN) : null
    if (since) {
      const delta = await getLiveDelta(spaceId, evId, since)
      if (myReqId !== reqId) return
      timelineRows.value = mergeSince(timelineRows.value, delta.timelineRows, since)
      basketRows.value = mergeSince(basketRows.value, delta.basketRows, since)
      return
    }
    const [timelineMap, basketMap] = await Promise.all([
      getSpaceEventTimelineBatch(spaceId, [evId], { bypassCache: true, granularity: 'minute' }),
      getSpaceTransactionBasketsBatch(spaceId, [evId], { bypassCache: true }),
    ])
    if (myReqId !== reqId) return // réponse périmée (jeton), une plus récente est déjà en vol
    timelineRows.value = timelineMap?.get ? (timelineMap.get(evId) || []) : (timelineMap?.[evId] || [])
    basketRows.value = basketMap?.get ? (basketMap.get(evId) || []) : (basketMap?.[evId] || [])
    loadedEventId = evId
    lastFullAt = Date.now()
  }

  async function refresh() {
    const myReqId = ++reqId
    error.value = null
    try {
      const evId = await resolveEvent()
      eventId.value = evId
      if (evId) {
        await loadRows(evId, myReqId)
      } else {
        timelineRows.value = []
        basketRows.value = []
        loadedEventId = null
      }
    } catch (e) {
      if (myReqId !== reqId) return
      error.value = e?.message || String(e)
    } finally {
      if (myReqId === reqId) {
        loading.value = false
        scheduleNext()
      }
    }
  }

  // SSE reste connecté en continu (live ou pas — le backend publie dès la 1ère
  // agrégation d'un event qui démarre, cf. note d'en-tête) ; le seul timer restant est
  // un filet de sécurité qui ne tape le serveur QUE si la connexion SSE est indisponible.
  function scheduleNext() {
    clearTimers()
    if (stopped) return
    stream.connect()
    fallbackTimer = setInterval(() => {
      if (!stream.connected.value) throttled.request()
    }, FALLBACK_POLL_MS)
  }

  function clearTimers() {
    if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null }
  }

  /** Appel manuel : event relu et lignes rechargées en entier, hors limiteur de cadence. */
  function forceRefresh() {
    forceNext = true
    lastFullAt = 0
    return refresh()
  }

  function startPolling() {
    stopped = false
    throttled.request() // immédiat au premier appel, puis cadence limitée
  }
  function stopPolling() {
    stopped = true
    throttled.cancel()
    clearTimers()
    stream.disconnect()
  }

  // ── Par shop, dérivé de timelineRows (déjà scopé au seul event live) pour le CA et
  // les quantités, et des PANIERS pour les tickets (BUG-382-02 : le grain article compte
  // un panier à N articles N fois, cf. utils/liveKpis.js).
  const shopTotals = computed(() => buildShopTotals(timelineRows.value, basketRows.value))

  const revenue = computed(() => shopTotals.value.reduce((s, sh) => s + sh.revenue, 0))
  const transactionCount = computed(() => sumBasketTransactions(basketRows.value))
  const itemsCount = computed(() => shopTotals.value.reduce((s, sh) => s + sh.itemsCount, 0))
  const avgSpendPerTx = computed(() => (transactionCount.value > 0 ? revenue.value / transactionCount.value : 0))

  // TX/min : tickets (paniers) sur les 5 dernières minutes connues, fenêtre glissante
  // courte, cohérent avec un "rythme actuel" plutôt qu'une moyenne depuis l'ouverture.
  const txPerMinute = computed(() => txPerMinuteFromBaskets(basketRows.value))

  // Répartition par catégories : chaque panier (categoryCombo) crédite ses catégories
  // du nombre de transactions portant cette combinaison — combo null/vide → "Non mappées"
  // (même convention que le backend, jamais écarté silencieusement).
  const categoryBreakdown = computed(() => {
    const totals = new Map()
    for (const r of basketRows.value) {
      const cats = (r.categoryCombo || []).filter(Boolean)
      const keys = cats.length ? cats : ['Non mappées']
      for (const cat of keys) {
        totals.set(cat, (totals.get(cat) || 0) + (Number(r.transactionCount) || 0))
      }
    }
    return [...totals.entries()]
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
  })

  // Timeline agrégée par minute : CA depuis le grain article, tickets depuis les paniers.
  const timelineByMinute = computed(() => buildTimelineByMinute(timelineRows.value, basketRows.value))

  return {
    isLive, liveSince, eventId, event, shopTotals, loading, error,
    revenue, transactionCount, itemsCount, avgSpendPerTx, txPerMinute,
    categoryBreakdown, timelineByMinute, basketRows, timelineRows,
    refresh: forceRefresh, startPolling, stopPolling,
  }
}
