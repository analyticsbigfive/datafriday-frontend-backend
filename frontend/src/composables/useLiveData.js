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

  // onMessage : un message SSE ne porte aucune donnée utile en soi (juste "ça vient de
  // changer pour cet espace", cf. backend liveStream) — on redemande simplement les
  // données habituelles, mêmes endpoints que le polling.
  const stream = useLiveStream(`/spaces/${spaceId}/live/stream`, () => { refresh() })

  // Repli quand aucune vente n'est tombée dans les 30 dernières minutes (isLive=false) :
  // même logique que findTodayEventId() d'AnalyseView.vue, réimplémentée ici pour ne
  // dépendre d'aucun état déjà chargé côté store Analyse (zéro couplage, décision
  // utilisateur 2026-09-01).
  function findTodayEvent(events) {
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
    // Toujours résoudre l'objet event complet (nom affiché dans le header) — un
    // retour anticipé sur status.eventId seul ne peuplait jamais event.value,
    // le header affichait "Aucun event live" même avec un event valide.
    const res = await getEvents({ spaceId, limit: 200, excludeSimulated: false })
    const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : [])
    if (status?.eventId) {
      event.value = list.find((e) => e.id === status.eventId) || null
      return status.eventId
    }
    const todayEvent = findTodayEvent(list)
    event.value = todayEvent
    return todayEvent?.id || null
  }

  async function refresh() {
    const myReqId = ++reqId
    error.value = null
    try {
      const evId = await resolveEvent()
      eventId.value = evId
      if (evId) {
        const [timelineMap, basketMap] = await Promise.all([
          getSpaceEventTimelineBatch(spaceId, [evId], { bypassCache: true, granularity: 'minute' }),
          getSpaceTransactionBasketsBatch(spaceId, [evId], { bypassCache: true }),
        ])
        if (myReqId !== reqId) return // réponse périmée (jeton), une plus récente est déjà en vol
        timelineRows.value = timelineMap?.get ? (timelineMap.get(evId) || []) : (timelineMap?.[evId] || [])
        basketRows.value = basketMap?.get ? (basketMap.get(evId) || []) : (basketMap?.[evId] || [])
      } else {
        timelineRows.value = []
        basketRows.value = []
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
      if (!stream.connected.value) refresh()
    }, FALLBACK_POLL_MS)
  }

  function clearTimers() {
    if (fallbackTimer) { clearInterval(fallbackTimer); fallbackTimer = null }
  }

  function startPolling() {
    stopped = false
    refresh()
  }
  function stopPolling() {
    stopped = true
    clearTimers()
    stream.disconnect()
  }

  // ── Par shop, dérivé de timelineRows (déjà scopé au seul event live) — remplace
  // shop-details (RPC all-time, cf. note d'en-tête), une seule passe de regroupement.
  const shopTotals = computed(() => {
    const byShop = new Map()
    for (const r of timelineRows.value) {
      if (!byShop.has(r.shopId)) byShop.set(r.shopId, { shopId: r.shopId, shopName: r.shopName, revenue: 0, transactionCount: 0, itemsCount: 0 })
      const s = byShop.get(r.shopId)
      s.revenue += Number(r.revenueHt ?? r.revenue) || 0
      s.transactionCount += Number(r.transactionCount ?? r.transactionsCount) || 0
      s.itemsCount += Number(r.quantity) || 0
    }
    return [...byShop.values()]
  })

  const revenue = computed(() => shopTotals.value.reduce((s, sh) => s + sh.revenue, 0))
  const transactionCount = computed(() => shopTotals.value.reduce((s, sh) => s + sh.transactionCount, 0))
  const itemsCount = computed(() => shopTotals.value.reduce((s, sh) => s + sh.itemsCount, 0))
  const avgSpendPerTx = computed(() => (transactionCount.value > 0 ? revenue.value / transactionCount.value : 0))

  // TX/min : nombre de minutes distinctes couvertes par la timeline, transactions sur
  // les 5 dernières minutes connues (fenêtre glissante courte, cohérent avec un "rythme
  // actuel" plutôt qu'une moyenne depuis l'ouverture des portes).
  const txPerMinute = computed(() => {
    const rows = timelineRows.value
    if (!rows.length) return 0
    const byMinute = new Map()
    for (const r of rows) {
      const key = r.minuteLocal || r.minute
      byMinute.set(key, (byMinute.get(key) || 0) + (Number(r.transactionsCount ?? r.transactionCount) || 0))
    }
    const minutes = [...byMinute.keys()].sort()
    const lastMinutes = minutes.slice(-5)
    if (!lastMinutes.length) return 0
    const total = lastMinutes.reduce((s, m) => s + byMinute.get(m), 0)
    return total / lastMinutes.length
  })

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

  // Timeline agrégée par minute (toutes lignes shop/produit confondues) — pour le
  // graphique TX/min, pas besoin du détail par produit à ce niveau d'affichage.
  const timelineByMinute = computed(() => {
    const byMinute = new Map()
    for (const r of timelineRows.value) {
      const key = r.minuteLocal || r.minute
      if (!byMinute.has(key)) byMinute.set(key, { minute: key, transactions: 0, revenue: 0 })
      const bucket = byMinute.get(key)
      bucket.transactions += Number(r.transactionsCount ?? r.transactionCount) || 0
      bucket.revenue += Number(r.revenueHt) || 0
    }
    return [...byMinute.values()].sort((a, b) => (a.minute > b.minute ? 1 : -1))
  })

  return {
    isLive, liveSince, eventId, event, shopTotals, loading, error,
    revenue, transactionCount, itemsCount, avgSpendPerTx, txPerMinute,
    categoryBreakdown, timelineByMinute,
    refresh, startPolling, stopPolling,
  }
}
