// Vue port of versionReact/Datafriday-main/src/app/hooks/usePredictiveTimeline.ts
//
// Composable Composition API qui reproduit la logique de la timeline prédictive.
// Le résultat (refs + fonctions) est destiné à être consommé par AnalyseView en
// mode predict et par EventPredictView.
//
// Différences vs React :
//   - useState/useRef → ref/shallowRef
//   - imports dynamiques → imports statiques (api/eventApi déjà packagés)
//   - signal AbortController conservé pour annuler les fetchs concurrents
//
// Référence section 9 du fichier
// docs/SPACE_ANALYSE_PREDICT_EVENT_PREDICT_REACT_LOGIC.md

import { ref, shallowRef } from 'vue'
import {
  findAndScorePastEvents,
  findAndScorePastEventsWithTrace,
} from '@/utils/predictiveAnalytics'
import { projectId, publicAnonKey } from '@/utils/supabase/info'
import { parseEventDate as parseEventDateFr } from '@/utils/dateFr'
import {
  TIMELINE_BUCKET_STRATEGIES,
  bucketMinute,
  formatMinute,
  parseMinuteToken,
  preprocessTimelineRecords,
} from '@/utils/timelineBucketing'
import { runWithConcurrency } from '@/utils/asyncPool'

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-eb31619c`

// Clé d'IDENTITÉ d'un tableau granular pour le mémo de résultat. Remplace le
// proxy « longueur » (`readGranular().length`) qui laissait le mémo servir un
// résultat périmé quand le CONTENU changeait à longueur égale (swap de source
// finishHeavyLoad). WeakMap → id stable par instance de tableau, déterministe,
// sans hash. Cas vide : readGranular() fabrique un `[]` NEUF à chaque appel →
// clé constante 'g0', sinon plus aucun memo-hit tant que le granular est vide.
let granularSeq = 0
const granularIdentityMap = new WeakMap()
export function granularIdentityKey(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 'g0'
  let id = granularIdentityMap.get(arr)
  if (id === undefined) {
    id = ++granularSeq
    granularIdentityMap.set(arr, id)
  }
  return `g${id}`
}
// Granularité native : 1 minute (cf. React
// `predictiveAnalyticsTimeline.ts`). Permet au slider du EventTimelineChart
// de filtrer le KPI strip et la breakdown shop/item à la minute près sans
// recalculer la pipeline de scoring. Délègue à l'utilitaire partagé
// `timelineBucketing` — source unique de vérité pour toutes les timelines.
const TIMELINE_BUCKET_MINUTES = TIMELINE_BUCKET_STRATEGIES.MINUTE_1

function parseEventDate(dateStr) {
  return parseEventDateFr(dateStr) || new Date()
}

function parseTime(timeStr) {
  return parseMinuteToken(timeStr) || 0
}

function formatTime(totalMinutes) {
  return formatMinute(totalMinutes)
}

function bucketTime(totalMinutes) {
  return bucketMinute(totalMinutes, TIMELINE_BUCKET_MINUTES) || formatMinute(totalMinutes)
}

/**
 * Aligne une minute de vente passée sur l'horaire du futur event :
 * minute décalée de timeOffset (= horaireCible − horairePassé), repliée sur
 * [0, 1440) (modulo — l'offset peut donner négatif ou > 24h), puis bucketée.
 * Exportée pour test (cœur de l'alignement temporel de la timeline prédictive).
 */
export function alignPastMinute(recMinutes, timeOffset) {
  const shifted = (((recMinutes + timeOffset) % 1440) + 1440) % 1440
  return bucketTime(shifted)
}

/**
 * Coerce une valeur "minute" hétérogène en "HH:MM". Indispensable : la pipeline
 * (parseMinuteToken / bucketMinute) n'accepte QUE "HH:MM" ancré ; or les ventes
 * granulaires du store portent un TIMESTAMP ISO (`2025-09-13T16:13:00.000Z`),
 * non parsable → tout s'écrasait sur 00:00 (timeline « pas minute par minute »).
 * Gère : "HH:MM" ; ISO / date (on lit l'heure stockée, sans conversion TZ) ;
 * nombre de minutes depuis minuit. Retourne null si rien d'exploitable.
 */
function toHHMM(value) {
  if (value == null) return null
  if (typeof value === 'number' && Number.isFinite(value)) return formatTime(value)
  const s = String(value).trim()
  // "HH:MM" en tête, ou heure d'un ISO ("...T16:13:..")
  const iso = s.match(/(?:^|T)(\d{2}):(\d{2})/)
  if (iso) return `${iso[1]}:${iso[2]}`
  const hhmm = s.match(/^(\d{1,2}):(\d{2})$/)
  if (hhmm) return `${hhmm[1].padStart(2, '0')}:${hhmm[2]}`
  return null
}

/**
 * @param {{
 *   events: import('vue').Ref<Array<object>> | Array<object>,
 *   getEventTypeName: (id:string) => string,
 *   getCategoryName: (id:string) => string,
 *   getSubcategoryName: (id:string) => string,
 *   shopGranularData?: import('vue').Ref<Array<object>> | Array<object>,
 * }} options
 */
export function usePredictiveTimeline(options) {
  const {
    events,
    getEventTypeName,
    getCategoryName,
    getSubcategoryName,
    shopGranularData,
    spaceId,
    isDebug,
  } = options

  // spaceId peut être une valeur ou un getter (props réactives).
  const readSpaceId = () => (typeof spaceId === 'function' ? spaceId() : spaceId)
  // Mode debug : getter OU valeur. Quand faux, AUCUNE trace n'est calculée
  // (coût nul en production) et les logs diag restent muets.
  const isDebugEnabled = () => (typeof isDebug === 'function' ? !!isDebug() : !!isDebug)

  const readEvents = () => (Array.isArray(events) ? events : events?.value || [])
  const readGranular = () =>
    Array.isArray(shopGranularData)
      ? shopGranularData
      : shopGranularData?.value || []

  // State
  const timelineLoading = ref(false)
  // État explicite du calcul de la timeline prédictive, pour distinguer
  // « pas encore calculé » (idle initial) de « calculé mais vide ». Sans ça, le
  // bandeau « Timeline indisponible » s'affichait au 1er rendu avant l'algo.
  const hasCalculated = ref(false) // true après TOUTE sortie de loadPredictiveTimeline
  const timelineError = ref(false) // true si le calcul a échoué (catch)
  const predictedTimelineData = shallowRef([])
  const candidateEvents = shallowRef([])
  const excludedSameSubcategoryEvents = shallowRef([])
  const excludedSameCategoryEvents = shallowRef([])
  const selectedPredictionEventIds = ref([])
  const predictiveShowTime = ref(null)
  const predictiveIsDefaultShowTime = ref(false)
  const predictiveFutureEventId = ref(null)
  const timelineEventsList = shallowRef([])
  const isLowConfidencePrediction = ref(false)
  const lowConfidenceBasedOnEventIds = ref([])
  // NEW RULES : aucun event comparable (gates) → pas de prédiction fabriquée.
  const insufficientData = ref(false)
  // NEW RULES : events comparables retenus mais aucun n'a de profil minute.
  const usedFallback = ref(false)
  // Courbes minute PRÉSENTES mais NON recalées : aucun event comparable n'avait
  // de showTime, l'alignement horaire est donc impossible et les ventes sont
  // affichées en heure brute. Distinct de `usedFallback` (= timeline VIDE) :
  // ici la timeline s'affiche, mais un bandeau invite l'utilisateur à renseigner
  // les Show Time pour un alignement précis.
  const unalignedTimeline = ref(false)
  // Plan de chargement séquencé : true dès que le SCORING (sélection des events
  // comparables) est terminé — la vue peut afficher la section « Prédiction
  // basée sur X événements » pendant que les timelines minute se chargent
  // encore. Piloté UNIQUEMENT par l'appel porteur du jeton de génération.
  const scoringReady = ref(false)

  // DEBUG (mode debug uniquement) : trace déterministe LECTURE SEULE du calcul.
  // predictionDebugTrace = { included, excluded, diagnostics } (scoring/gates).
  // timelineDebugTrace   = { targetEventId, timelineFetch[], fallback, selection }.
  // Null hors mode debug. Portés dans le mémo → présents en frais ET en cache.
  const predictionDebugTrace = shallowRef(null)
  const timelineDebugTrace = shallowRef(null)

  // Caches / control
  let originalGranularData = []
  let abortController = null
  // Jeton de génération : seul l'appel loadPredictiveTimeline le plus RÉCENT a
  // le droit d'écrire les refs partagées et les flags loading. Un appel plus
  // ancien qui se réveille après un await devient « stale » et sort sans rien
  // toucher. Corrige deux courses que l'AbortController seul ne couvrait pas :
  //   1. l'abort n'était créé qu'au moment du fan-out timeline (tard dans la
  //      fonction) → deux appels chevauchés pouvaient s'aborter dans le
  //      mauvais ordre (l'ancien écrasait le récent) ;
  //   2. le `finally` d'un appel avorté éteignait `timelineLoading` pendant
  //      que l'appel récent calculait encore (UI « prête » sur données stales).
  let loadGeneration = 0
  // Nombre d'invocations de loadPredictiveTimeline encore en vol. Le jeton
  // ci-dessus protège les DONNÉES (seul le porteur écrit les refs) mais pas le
  // SPINNER : le dernier run à se terminer n'est pas forcément le porteur (un
  // fetch lent d'un run avorté peut finir après), et un porteur rendu stale
  // par reset() ne repassait jamais les flags → spinner éternel. Règle : à
  // 0 run en vol, le spinner s'éteint quoi qu'il arrive.
  let activeLoadCount = 0
  // Filet ultime : un run suspendu au-delà de ce délai (promesse jamais
  // résolue, réseau figé) rend la main à l'UI au lieu d'un spinner infini.
  // Si le run aboutit après coup, il ré-écrit ses données normalement.
  const LOAD_WATCHDOG_MS = 45000
  let watchdogTimer = null
  // PERF: cache des timelines REST par `${spaceId}:${eventId}`. Les timelines des
  // events PASSÉS sont historiques (immuables) ; sans cache, chaque mount /
  // changement d'event / changement de config / apply de version re-fetchait
  // jusqu'à 10 GET `/spaces/:id/event-timeline/:eventId`. On mémoïse les lignes
  // déjà normalisées et on déduplique les requêtes in-flight (clé identique).
  const restTimelineCache = new Map()
  const restTimelineInFlight = new Map()

  // PERF: mémo du RÉSULTAT COMPLET de loadPredictiveTimeline (scoring CPU +
  // fetches + agrégation) — revenir sur le même event = restitution instantanée.
  // La clé porte TOUTES les entrées qui changent le résultat (event, config,
  // identité du granular, affluence, showTime, sélection forcée) : éditer l'affluence
  // ou la sélection → nouvelle clé → recalcul complet (règle user : éditer la
  // config doit recomputer le CA). Volontairement NON vidé par reset() (c'est
  // le but : le reset précède la re-sélection du même event).
  const resultMemo = new Map()
  const RESULT_MEMO_MAX = 20

  // PERF: mémo du SCORING SEUL (findAndScorePastEvents), clé SANS la sélection
  // (overridePredictionIds). But : un apply du drawer de sources change la
  // sélection → nouvelle clé de résultat mais MÊME set scoré → on réutilise le
  // scoring et on ne ré-applique que le filtre de sélection + la pondération +
  // l'agrégation timeline (fetches servis par restTimelineCache). Vrai
  // « recalcul partiel, pas de re-scoring ». `findAndScorePastEvents` est pur
  // (tie-breakers déterministes) → cache bit-identique. NON vidé par reset()
  // (même raison que resultMemo).
  const scoredEventsMemo = new Map()
  const SCORED_MEMO_MAX = 20
  function memoizeResult(memoKey) {
    resultMemo.set(memoKey, {
      predictedTimelineData: predictedTimelineData.value,
      timelineEventsList: timelineEventsList.value,
      candidateEvents: candidateEvents.value,
      excludedSub: excludedSameSubcategoryEvents.value,
      excludedCat: excludedSameCategoryEvents.value,
      selectedIds: selectedPredictionEventIds.value,
      insufficientData: insufficientData.value,
      usedFallback: usedFallback.value,
      unalignedTimeline: unalignedTimeline.value,
      isLowConf: isLowConfidencePrediction.value,
      lowConfIds: lowConfidenceBasedOnEventIds.value,
      // Debug trace mémoïsée → criterion 9 (frais == cache).
      predictionDebugTrace: predictionDebugTrace.value,
      timelineDebugTrace: timelineDebugTrace.value,
    })
    if (resultMemo.size > RESULT_MEMO_MAX) {
      resultMemo.delete(resultMemo.keys().next().value)
    }
  }

  function reset() {
    timelineLoading.value = false
    hasCalculated.value = false
    timelineError.value = false
    predictedTimelineData.value = []
    candidateEvents.value = []
    excludedSameSubcategoryEvents.value = []
    excludedSameCategoryEvents.value = []
    selectedPredictionEventIds.value = []
    predictiveShowTime.value = null
    predictiveIsDefaultShowTime.value = false
    predictiveFutureEventId.value = null
    timelineEventsList.value = []
    isLowConfidencePrediction.value = false
    lowConfidenceBasedOnEventIds.value = []
    insufficientData.value = false
    usedFallback.value = false
    unalignedTimeline.value = false
    scoringReady.value = false
    predictionDebugTrace.value = null
    timelineDebugTrace.value = null
    // Invalide tout load encore en vol : il ne doit plus écrire les refs
    // (le jeton de génération le rend stale, l'abort coupe ses fetchs).
    loadGeneration += 1
    if (abortController) {
      abortController.abort()
      abortController = null
    }
  }

  function setSelectedEvents(selectedIds) {
    selectedPredictionEventIds.value = Array.isArray(selectedIds)
      ? [...selectedIds]
      : []
  }

  async function persistSelection(eventId, eventIds) {
    try {
      await fetch(
        `${API_BASE}/predictive-event-selection/${encodeURIComponent(eventId)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${publicAnonKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ eventIds }),
        },
      )
    } catch (err) {
      console.error('[PREDICTIVE TIMELINE] error saving selection:', err)
    }
  }

  async function fetchEventTimeline(eventId, signal) {
    // Source locale (granular du store) : utilisée UNIQUEMENT si elle porte un
    // vrai horaire par record (minute ISO/HH:MM, ou `hour` mock). Sinon (granular
    // agrégé event-level, sans minute) on NE l'utilise PAS — on retombe sur la
    // source REST minute-level du backend, sans quoi tout s'écraserait sur une
    // seule minute (timeline plate).
    const computeLocalMinute = (r) => {
      const m = toHHMM(r.minute ?? r.time)
      if (m) return m
      if (r.hour != null) return `${String(r.hour).padStart(2, '0')}:00`
      return null
    }
    const localRecords = readGranular().filter((r) => r.eventId === eventId)
    const localHasMinute = localRecords.some((r) => computeLocalMinute(r) != null)
    if (localRecords.length > 0 && localHasMinute) {
      return localRecords.map((r) => {
        const minute = computeLocalMinute(r) ?? '19:00'
        return {
          minute,
          // shopId attendu par EventTimelineChart = registryElementId du shop
          // (cf. elementIdToShopNameMap). Prioriser `elementId` (registry id),
          // fallback sur shopId / shop / shopName pour couvrir API + variantes.
          shopId: r.elementId ?? r.shopId ?? r.shop ?? r.shopName ?? '',
          // Nom lisible du shop porté SUR le record (comme la page Analyse) :
          // le chart résout via record.shopName quand aucune map registry n'est
          // fournie → noms propres sans dépendre de getShopElementMappings.
          shopName: r.shopName ?? r.elementName ?? null,
          menuItemId: r.menuItemId ?? r.itemId ?? '',
          itemName: r.itemName ?? r.menuItemName ?? r.name ?? '',
          mappedMenuItemId: r.mappedMenuItemId ?? r.menuItemId ?? r.itemId ?? '',
          mappedMenuItemName: r.mappedMenuItemName ?? r.itemName ?? r.menuItemName ?? r.name ?? '',
          totalRevenue: Number(r.totalRevenue ?? r.revenue ?? 0),
          totalQuantity: Number(r.totalQuantity ?? r.quantity ?? 0),
          transactionCount: Number(r.transactionCount ?? r.transactions ?? 0),
        }
      })
    }

    // Source REST pré-agrégée du backend NestJS (rapide, même origine que le
    // reste de l'app) au lieu de l'Edge Function `/event-timeline` (lente /
    // souvent down → 5s de hang). Renvoie minute × shop × menuItem avec
    // `revenueHt`/`quantity` → on normalise vers la forme attendue par la
    // pipeline (`totalRevenue`/`totalQuantity`/`itemName`).
    const sid = readSpaceId()
    if (!sid) return null
    const cacheKey = `${sid}:${eventId}`
    // Cache hit → 0 réseau (la donnée historique ne change pas dans la session).
    if (restTimelineCache.has(cacheKey)) return restTimelineCache.get(cacheKey)
    // Dédup : si un fetch identique est déjà en vol, on réutilise sa promesse.
    let fetchPromise = restTimelineInFlight.get(cacheKey)
    if (!fetchPromise) {
      fetchPromise = (async () => {
        try {
          const { getSpaceEventTimeline } = await import('@/api/endpoints/space.api')
          const rows = await getSpaceEventTimeline(sid, eventId)
          if (!Array.isArray(rows)) return null
          const mapped = rows.map((r) => ({
            minute: toHHMM(r.minute) ?? '19:00',
            shopId: r.shopId ?? r.elementId ?? r.shop ?? r.shopName ?? '',
            shopName: r.shopName ?? r.elementName ?? null,
            weezeventProductId: r.weezeventProductId ?? null,
            menuItemId: r.menuItemId ?? r.mappedMenuItemId ?? r.itemId ?? '',
            itemName: r.menuItemName ?? r.itemName ?? r.name ?? '',
            mappedMenuItemId: r.mappedMenuItemId ?? r.menuItemId ?? r.itemId ?? '',
            mappedMenuItemName: r.mappedMenuItemName ?? r.menuItemName ?? r.itemName ?? r.name ?? '',
            totalRevenue: Number(r.revenueHt ?? r.totalRevenue ?? r.revenue ?? 0),
            totalQuantity: Number(r.quantity ?? r.totalQuantity ?? 0),
            transactionCount: Number(r.transactionCount ?? r.transactions ?? 0),
          }))
          // Ne cache QUE les succès (Array). Les échecs transitoires restent
          // re-tentables au prochain appel.
          restTimelineCache.set(cacheKey, mapped)
          return mapped
        } catch (err) {
          if (err?.name !== 'AbortError') {
            console.warn(`[PREDICTIVE TIMELINE] timeline fetch error for ${eventId}:`, err?.message)
          }
          return null
        } finally {
          restTimelineInFlight.delete(cacheKey)
        }
      })()
      restTimelineInFlight.set(cacheKey, fetchPromise)
    }
    const result = await fetchPromise
    // L'abort est vérifié PAR APPELANT après coup : la donnée est tout de même
    // mise en cache (la requête réseau a déjà eu lieu) pour le prochain appel.
    if (signal?.aborted) return null
    return result
  }

  /**
   * Charge la timeline prédictive pour un event futur.
   * @param {object} event
   * @param {Array<string>} [overridePredictionIds]
   * @param {boolean} [hasLowConfidencePrediction]
   * @param {Array<string>} [basedOnEventIds]
   */
  async function loadPredictiveTimeline(
    event,
    overridePredictionIds,
    hasLowConfidencePrediction = false,
    basedOnEventIds = [],
  ) {
    if (!event) return
    // Jeton + abort DÈS L'ENTRÉE (y compris pour les chemins court-circuit
    // memo/direct qui, avant, n'annulaient pas un fetch lent encore en vol —
    // son résultat périmé pouvait écraser le résultat frais après coup).
    const gen = ++loadGeneration
    const isStale = () => gen !== loadGeneration
    if (abortController) abortController.abort()
    abortController = new AbortController()
    const signal = abortController.signal
    // Comptabilité des runs en vol : TOUTE sortie de cette fonction (early
    // return, succès, erreur, run stale) doit passer par settleLoad(). Un run
    // stale n'écrit jamais les données, mais s'il est le DERNIER en vol il
    // éteint le spinner — sinon un porteur supersédé/reset le laissait allumé
    // pour toujours.
    activeLoadCount += 1
    const settleLoad = () => {
      activeLoadCount = Math.max(0, activeLoadCount - 1)
      if (activeLoadCount === 0 && watchdogTimer) {
        clearTimeout(watchdogTimer)
        watchdogTimer = null
      }
      if (!isStale() || activeLoadCount === 0) {
        hasCalculated.value = true
        timelineLoading.value = false
      }
    }
    if (watchdogTimer) clearTimeout(watchdogTimer)
    watchdogTimer = setTimeout(() => {
      watchdogTimer = null
      if (activeLoadCount > 0 && timelineLoading.value) {
        timelineLoading.value = false
        hasCalculated.value = true
        timelineError.value = true
      }
    }, LOAD_WATCHDOG_MS)
    timelineLoading.value = true
    timelineError.value = false
    candidateEvents.value = []
    excludedSameSubcategoryEvents.value = []
    excludedSameCategoryEvents.value = []
    insufficientData.value = false
    usedFallback.value = false
    unalignedTimeline.value = false
    scoringReady.value = false
    predictionDebugTrace.value = null
    timelineDebugTrace.value = null

    const originalShowTime = event.sessions?.[0]?.showTime
    const targetShowTime = originalShowTime || '19:00'
    predictiveShowTime.value = targetShowTime
    predictiveIsDefaultShowTime.value = !originalShowTime
    predictiveFutureEventId.value = event.id

    // -----------------------------------------------------------------
    // SHORT-CIRCUIT : si l'event futur dispose d\u00e9j\u00e0 de records pr\u00e9dictifs
    // dans le granular holder (cas mode mock Adidas Arena), on les utilise
    // directement comme `predictedTimelineData` sans re-scorer ni re-scaler.
    // Garantit que les chiffres affich\u00e9s correspondent exactement aux
    // pr\u00e9dictions calibr\u00e9es par le mock.
    // -----------------------------------------------------------------
    try {
      // Court-circuit réservé aux records prédictifs MINUTE-LEVEL (mock
      // pré-calibré : champ `minute`). Les records du MOTEUR
      // (generatePredictionsForEvent / regeneratePredictions, tagués `_engine`)
      // sont AGRÉGÉS sans dimension temporelle → si on les passait ici, toutes
      // les minutes retomberaient sur le showTime (timeline plate, début=fin).
      // On les laisse donc emprunter le chemin complet, qui distribue la
      // prédiction sur les courbes minute des events passés.
      const directPredictive = readGranular().filter(
        (r) =>
          r &&
          r.isPredictive &&
          r.eventId === event.id &&
          r.minute != null &&
          !r._engine,
      )
      if (directPredictive.length > 0) {
        const predicted = directPredictive.map((r) => {
          let minute = r.minute ?? r.time
          if (minute == null && r.hour != null) {
            minute = `${String(r.hour).padStart(2, '0')}:00`
          }
          if (typeof minute !== 'string') minute = targetShowTime
          return {
            eventId: event.id,
            minute,
            shopId: r.elementId ?? r.shopId ?? r.shop ?? r.shopName ?? '',
            shopName: r.shopName ?? r.elementName ?? null,
            menuItemId: r.menuItemId ?? r.itemId ?? '',
            itemName: r.menuItemName ?? r.itemName ?? r.name ?? '',
            mappedMenuItemId: r.menuItemId ?? r.itemId ?? '',
            mappedMenuItemName: r.menuItemName ?? r.itemName ?? r.name ?? '',
            totalRevenue: Number(r.revenue ?? r.totalRevenue ?? 0),
            totalQuantity: Number(r.quantity ?? r.totalQuantity ?? 0),
            transactionCount: Number(
              r.transactionCount ?? r.transactions ?? 0,
            ),
            isPredictive: true,
          }
        })
        predictedTimelineData.value = preprocessTimelineRecords(predicted, {
          eventId: event.id,
        })
        isLowConfidencePrediction.value = false
        lowConfidenceBasedOnEventIds.value = []
        timelineEventsList.value = []
        candidateEvents.value = []
        selectedPredictionEventIds.value = []
        scoringReady.value = true
        settleLoad()
        return
      }
    } catch (err) {
      console.warn(
        '[PREDICTIVE TIMELINE] direct-predictive short-circuit failed:',
        err?.message,
      )
    }

    // ── Mémo résultat : hit → restitution des refs, zéro scoring/fetch ──────
    const memoKey = [
      event.id,
      event.configurationId || '',
      granularIdentityKey(readGranular()),
      event.ticketsScanned || event.ticketsSold || 0,
      targetShowTime,
      Array.isArray(overridePredictionIds) ? overridePredictionIds.join(',') : '',
      // Le mode debug fait partie de l'identité du résultat : un run mémoïsé
      // SANS trace ne doit pas être restitué quand le toggle debug est actif
      // (trace absente pour toujours), et inversement le run debug reste
      // restituable trace comprise (criterion 9).
      isDebugEnabled() ? 'dbg' : '',
    ].join('::')
    const memoHit = resultMemo.get(memoKey)
    if (memoHit) {
      predictedTimelineData.value = memoHit.predictedTimelineData
      timelineEventsList.value = memoHit.timelineEventsList
      candidateEvents.value = memoHit.candidateEvents
      excludedSameSubcategoryEvents.value = memoHit.excludedSub
      excludedSameCategoryEvents.value = memoHit.excludedCat
      selectedPredictionEventIds.value = memoHit.selectedIds
      insufficientData.value = memoHit.insufficientData
      usedFallback.value = memoHit.usedFallback
      unalignedTimeline.value = memoHit.unalignedTimeline ?? false
      isLowConfidencePrediction.value = memoHit.isLowConf
      lowConfidenceBasedOnEventIds.value = memoHit.lowConfIds
      // Debug trace restituée depuis le mémo → criterion 9 (frais == cache).
      predictionDebugTrace.value = memoHit.predictionDebugTrace ?? null
      timelineDebugTrace.value = memoHit.timelineDebugTrace ?? null
      // Memo hit = affichage INSTANTANÉ, toutes sections d'un coup.
      scoringReady.value = true
      settleLoad()
      return
    }

    try {
      const allEvents = readEvents()
      const granular = readGranular()

      // DEBUG : outcome de fetch par event passé sélectionné (rempli plus bas,
      // uniquement en mode debug). null → échec fetch ; [] → aucune minute.
      const timelineFetchTrace = []

      // Enrich target event
      const enrichedEvent = {
        ...event,
        eventType: event.eventTypeId ? getEventTypeName(event.eventTypeId) : undefined,
        category: event.eventCategoryId ? getCategoryName(event.eventCategoryId) : undefined,
        subcategory: event.eventSubcategoryId
          ? getSubcategoryName(event.eventSubcategoryId)
          : undefined,
        sessions:
          originalShowTime && (event.sessions?.length || 0) > 0
            ? event.sessions
            : [{ showTime: targetShowTime }],
      }

      const enrichedEvents = allEvents.map((e) => ({
        ...e,
        eventType: e.eventTypeId ? getEventTypeName(e.eventTypeId) : undefined,
        category: e.eventCategoryId ? getCategoryName(e.eventCategoryId) : undefined,
        subcategory: e.eventSubcategoryId
          ? getSubcategoryName(e.eventSubcategoryId)
          : undefined,
      }))

      // Pick scoring data: cache authentic granular, reuse if current is predictive
      let dataForScoring = granular
      const isCurrentDataPredictive =
        granular.length > 0 && Boolean(granular[0]?.isPredictive)
      if (!isCurrentDataPredictive && granular.length > 0) {
        originalGranularData = granular
      } else if (originalGranularData.length > 0) {
        dataForScoring = originalGranularData
      }

      // Mémo scoring : clé = entrées du scoring SANS la sélection. Un apply du
      // drawer (change overridePredictionIds) réutilise ce set → pas de
      // re-scoring, seule la sélection est ré-appliquée plus bas.
      const scoreKey = [
        event.id,
        event.configurationId || '',
        granularIdentityKey(dataForScoring),
        event.ticketsScanned || event.ticketsSold || 0,
        targetShowTime,
      ].join('::')
      let allScoredEvents = scoredEventsMemo.get(scoreKey)
      if (!allScoredEvents) {
        allScoredEvents = findAndScorePastEvents(
          enrichedEvent,
          enrichedEvents,
          dataForScoring,
        )
        scoredEventsMemo.set(scoreKey, allScoredEvents)
        if (scoredEventsMemo.size > SCORED_MEMO_MAX) {
          scoredEventsMemo.delete(scoredEventsMemo.keys().next().value)
        }
      }

      // DIAGNOSTIC timeline vide : la prédiction a besoin que les eventId des
      // records de ventes (granular) correspondent aux id de la liste d'events.
      // Si l'overlap est 0, le « join » est cassé (ids granular ≠ ids Event) →
      // aucune source temporelle → timeline vide, alors qu'un CA peut rester
      // affiché via une version sauvegardée. Ce log révèle la cause au runtime.
      // GARDÉ derrière le mode debug (criterion 10 : pas de log bruyant en prod).
      if (isDebugEnabled()) {
        try {
          const evIds = new Set(enrichedEvents.map((e) => e.id))
          const granIds = new Set((dataForScoring || []).map((d) => d.eventId))
          const overlap = [...granIds].filter((id) => evIds.has(id)).length
          // eslint-disable-next-line no-console
          console.log(
            `[PREDICTIVE TIMELINE] diag — events:${evIds.size} granularRecords:${(dataForScoring || []).length} granularEventIds:${granIds.size} overlap(ev∩gran):${overlap} scored:${allScoredEvents.length}`,
          )
          if (granIds.size > 0 && overlap === 0) {
            // eslint-disable-next-line no-console
            console.warn(
              "[PREDICTIVE TIMELINE] ⚠️ Aucun eventId des ventes (granular) ne correspond à la liste d'events → prédiction SANS source (join date/id cassé côté données). Le total affiché provient d'une version sauvegardée, pas du calcul live.",
            )
          }
        } catch (_) {
          /* noop diag */
        }
      }

      const topCandidates = allScoredEvents.slice(0, 50)
      candidateEvents.value = topCandidates
      // SCORING TERMINÉ (sélection connue) : la section « Prédiction basée
      // sur X événements » peut s'afficher pendant le fan-out timeline.
      scoringReady.value = true

      // DEBUG : trace déterministe du scoring (included/excluded/diagnostics).
      // Rejoue le même barème (evaluateSimilarity) → `included` identique à
      // allScoredEvents. Calculée UNIQUEMENT en mode debug (coût nul sinon).
      if (isDebugEnabled()) {
        predictionDebugTrace.value = findAndScorePastEventsWithTrace(
          enrichedEvent,
          enrichedEvents,
          dataForScoring,
        )
      }

      const baselineMaxScore =
        topCandidates.length > 0 ? topCandidates[0].maxPossibleScore || 1000 : 1000
      const weight30Score = Math.round(baselineMaxScore * 0.3)
      const candidateIds = new Set(topCandidates.map((c) => c.event.id))
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      const targetSubcategoryId = enrichedEvent.eventSubcategoryId
      const excludedSub = enrichedEvents
        .filter((e) => {
          if (e.id === enrichedEvent.id) return false
          if (targetSubcategoryId) {
            if (e.eventSubcategoryId) {
              if (e.eventSubcategoryId !== targetSubcategoryId) return false
            } else if (e.subcategory !== enrichedEvent.subcategory) return false
          }
          if (candidateIds.has(e.id)) return false
          if (parseEventDate(e.eventDate) >= today) return false
          return true
        })
        .map((e) => {
          const existing = allScoredEvents.find((se) => se.event.id === e.id)
          if (existing) return existing
          return {
            event: e,
            score: weight30Score,
            maxPossibleScore: baselineMaxScore,
            scorePercentage: 30,
            matchDetails: { reason: 'Same Subcategory Match (Manual 30%)' },
          }
        })
      excludedSameSubcategoryEvents.value = excludedSub

      const targetCategoryId = enrichedEvent.eventCategoryId
      const excludedCat = enrichedEvents
        .filter((e) => {
          if (e.id === enrichedEvent.id) return false
          if (targetCategoryId) {
            if (e.eventCategoryId) {
              if (e.eventCategoryId !== targetCategoryId) return false
            } else if (e.category !== enrichedEvent.category) return false
          }
          if (targetSubcategoryId) {
            if (e.eventSubcategoryId) {
              if (e.eventSubcategoryId === targetSubcategoryId) return false
            } else if (e.subcategory === enrichedEvent.subcategory) return false
          }
          if (candidateIds.has(e.id)) return false
          if (parseEventDate(e.eventDate) >= today) return false
          return true
        })
        .map((e) => {
          const existing = allScoredEvents.find((se) => se.event.id === e.id)
          if (existing) return existing
          return {
            event: e,
            score: weight30Score,
            maxPossibleScore: baselineMaxScore,
            scorePercentage: 30,
            matchDetails: { reason: 'Same Category Match (Manual 30%)' },
          }
        })
      excludedSameCategoryEvents.value = excludedCat

      // Determine final selected scored events.
      // SOURCE UNIQUE de sélection = l'appelant (overridePredictionIds : vue,
      // version appliquée, brouillon). L'ancien fetch de repli vers l'Edge
      // Function /predictive-event-selection (KV) est SUPPRIMÉ : jamais écrite
      // par la vue, souvent indisponible (timeout 3 s) → la sélection dépendait
      // de la disponibilité d'un service au lieu des entrées (non déterministe),
      // et pouvait diverger de la sélection pilotant le CA.
      let scoredEvents = []
      const savedSelectionIds = Array.isArray(overridePredictionIds)
        ? overridePredictionIds
        : []

      if (savedSelectionIds.length > 0) {
        scoredEvents = savedSelectionIds
          .map((id) => {
            const found = allScoredEvents.find((se) => se.event.id === id)
            if (found) return found
            const raw = enrichedEvents.find((e) => e.id === id)
            if (raw) {
              return {
                event: raw,
                score: weight30Score,
                maxPossibleScore: baselineMaxScore,
                scorePercentage: 30,
                matchDetails: { reason: 'Manual Selection (30%)' },
              }
            }
            return null
          })
          .filter(Boolean)
        if (scoredEvents.length === 0) {
          scoredEvents = allScoredEvents.slice(0, 10)
        }
      } else {
        scoredEvents = allScoredEvents.slice(0, 10)
      }

      selectedPredictionEventIds.value = scoredEvents.map((se) => se.event.id)

      // DEBUG : diagnostics de sélection (saved/manual/override vs top-10 défaut).
      // Calculés ici (scoredEvents + savedSelectionIds figés) ; assemblés dans
      // timelineDebugTrace juste avant chaque memoize. Coût nul hors debug.
      let selectionTrace = null
      if (isDebugEnabled()) {
        const defaultTop10Ids = allScoredEvents.slice(0, 10).map((se) => se.event.id)
        const finalIds = scoredEvents.map((se) => se.event.id)
        const knownIds = new Set([
          ...allScoredEvents.map((se) => se.event.id),
          ...enrichedEvents.map((e) => e.id),
        ])
        selectionTrace = {
          savedSelectionIds: [...savedSelectionIds],
          overrideUsed:
            Array.isArray(overridePredictionIds) && overridePredictionIds.length > 0,
          // criterion #14 : ids sauvegardés qui n'existent plus dans les candidats.
          missingSavedIds: savedSelectionIds.filter((id) => !knownIds.has(id)),
          defaultTop10Ids,
          finalSelectedIds: finalIds,
          // criterion #12 / #7 sélection : la sélection change-t-elle le top-10 ?
          selectionChangedFinalSet:
            finalIds.length !== defaultTop10Ids.length ||
            finalIds.some((id, i) => id !== defaultTop10Ids[i]),
        }
      }

      // Assemble la trace timeline (lue au moment de l'appel → flags à jour).
      const buildTimelineTrace = () => ({
        targetEventId: event.id,
        selection: selectionTrace,
        timelineFetch: timelineFetchTrace,
        usedFallback: usedFallback.value,
        isLowConfidence: isLowConfidencePrediction.value,
        lowConfidenceBasedOnEventIds: lowConfidenceBasedOnEventIds.value,
        insufficientData: insufficientData.value,
      })

      // Aucun event comparable (les gates type/config/catégorie/affluence/horaire ont
      // tout écarté). Repli « CONFIANCE FAIBLE » DÉTERMINISTE : si des events passés ont
      // des ventes, on prédit à partir des 3 PLUS RÉCENTS (reproductible, PAS de
      // Math.random — l'ancien repli aléatoire a été retiré pour déterminisme) en
      // signalant explicitement la faible confiance à l'utilisateur (bandeau). Si AUCUN
      // event passé n'a de ventes → insufficientData (vrai vide, rien à projeter).
      if (scoredEvents.length === 0) {
        const withSalesIds = new Set(
          (dataForScoring || []).filter((d) => !d.isPredictive).map((d) => d.eventId),
        )
        const fallbackPool = enrichedEvents
          .filter((e) => e.id !== enrichedEvent.id && withSalesIds.has(e.id))
          .sort((a, b) => {
            // Date desc puis id asc : sans départage, deux events du même jour
            // sortaient dans l'ordre d'arrivée de l'API → le « top 3 récents »
            // du repli low-confidence n'était pas reproductible.
            const dt =
              (parseEventDate(b.eventDate)?.getTime() || 0) -
              (parseEventDate(a.eventDate)?.getTime() || 0)
            if (dt !== 0) return dt
            return String(a.id || '').localeCompare(String(b.id || ''))
          })
        if (fallbackPool.length === 0) {
          insufficientData.value = true
          predictedTimelineData.value = []
          if (isDebugEnabled()) timelineDebugTrace.value = buildTimelineTrace()
          memoizeResult(memoKey)
          timelineLoading.value = false
          return
        }
        const picked = fallbackPool.slice(0, Math.min(3, fallbackPool.length))
        scoredEvents = picked.map((re) => ({
          event: re,
          score: 100,
          maxPossibleScore: 100,
          scorePercentage: 100,
          scalingFactor: 1.0,
          matchDetails: { reason: 'Low Confidence (recent event, no gate match)' },
        }))
        isLowConfidencePrediction.value = true
        lowConfidenceBasedOnEventIds.value = picked.map((e) => e.id)
        selectedPredictionEventIds.value = picked.map((e) => e.id)
        // NE PAS return : on continue et on construit la timeline sur ces 3 events.
      }

      // Poids purs §7 : poids = score / Σ scores (plus de split 70/30).
      const totalScore = scoredEvents.reduce((s, se) => s + (se.score || 0), 0)
      const eventWeightsMap = new Map()
      if (totalScore > 0) {
        scoredEvents.forEach((se) =>
          eventWeightsMap.set(se.event.id, (se.score || 0) / totalScore),
        )
      } else {
        // Survivant ≥ 420 normalement → totalScore = 0 seulement si données très
        // pauvres (aucun critère renseigné des deux côtés). Poids égaux.
        const n = scoredEvents.length || 1
        scoredEvents.forEach((se) => eventWeightsMap.set(se.event.id, 1 / n))
      }

      // Time offsets + attendees scaling
      const targetMinutes = parseTime(targetShowTime)
      const eventOffsets = new Map()
      const eventAttendees = new Map()
      const pastEvents = scoredEvents.map((se) => se.event)

      // Champ d'alignement = sessions[0].showTime = COUP D'ENVOI (distinct de
      // sessions[0].doorsOpening = ouverture des portes). MÊME champ que la cible
      // (cf. originalShowTime plus haut) → point « 0 » commun. offset = horaire
      // cible − coup d'envoi passé ; recalé plus bas sur l'horloge d'affichage
      // de la cible. On mémorise aussi nom + coup d'envoi lu pour la trace debug.
      const pastEventNameById = new Map()
      const pastShowTimeById = new Map()
      pastEvents.forEach((e) => {
        pastEventNameById.set(e.id, e.eventName || e.id)
        const showTimes = (e.sessions || [])
          .map((s) => s?.showTime)
          .filter(Boolean)
        if (showTimes.length > 0) {
          pastShowTimeById.set(e.id, showTimes[0])
          eventOffsets.set(e.id, targetMinutes - parseTime(showTimes[0]))
        }
        // Pour les events passés : scanned est la fréquentation réelle, fallback sur sold
        eventAttendees.set(e.id, e.ticketsScanned || e.ticketsSold || 0)
      })

      // Vrai SEULEMENT si au moins un event comparable a un coup d'envoi. Sert
      // uniquement au diagnostic « tout ignoré faute d'horaire » plus bas : les
      // events sans coup d'envoi sont désormais TOUJOURS ignorés (jamais offset 0).
      const hasAnyOffset = eventOffsets.size > 0

      // Fréquentation cible de l'event futur = valeur de scaling. Même
      // résolution que les events passés (scanned d'abord, fallback sold) pour
      // que MODIFIER « Tickets Scanned » OU « Tickets Sold » dans l'éditeur
      // change réellement le CA prédit. Pour un vrai event futur sans scan,
      // scanned=0 → on retombe sur sold (prévision).
      const predictedAttendees = event.ticketsScanned || event.ticketsSold || 0

      // Fetch timelines — pool borné (5 simultanées max) : lisse le burst réseau
      // (avant : jusqu'à 10 GET /event-timeline en parallèle non bornés).
      // Résultats INDEXÉS PAR POSITION (ordre de eventIds, donc ordre du
      // scoring trié) et non poussés dans l'ordre de complétion réseau : le
      // premier record vu par clé fige les métadonnées (itemName/shopName) à
      // l'agrégation → l'ordre de complétion rendait ces libellés
      // non déterministes (réconciliation par nom instable entre deux runs).
      const eventIds = pastEvents.map((e) => e.id)
      const timelineResults = new Array(eventIds.length).fill(null)
      await runWithConcurrency(eventIds, 5, async (eId) => {
        const idx = eventIds.indexOf(eId)
        const records = await fetchEventTimeline(eId, signal)
        // DEBUG : outcome par event — null=échec fetch, []=aucune minute, sinon OK.
        if (isDebugEnabled()) {
          timelineFetchTrace.push({
            eventId: eId,
            failed: records === null,
            empty: Array.isArray(records) && records.length === 0,
            hadData: Array.isArray(records) && records.length > 0,
            aborted: signal.aborted,
          })
        }
        if (!records || signal.aborted) return

        // ALIGNEMENT OBLIGATOIRE sur le coup d'envoi. Un event passé SANS coup
        // d'envoi valide NE PEUT PAS être recalé. L'ancien repli `|| 0` calait
        // sa courbe sur l'heure BRUTE ; si cette heure est mal lue
        // (`...T00:00:00Z`), toute la courbe s'empilait à 00:00 en polluant les
        // events alignés. On IGNORE donc sa courbe (l'event garde tout de même
        // son poids dans le CA total via eventWeightsMap) et on note la raison.
        if (!eventOffsets.has(eId)) {
          if (isDebugEnabled()) {
            timelineFetchTrace.push({
              eventId: eId,
              eventName: pastEventNameById.get(eId) || eId,
              showTimeRead: null,
              offsetMin: null,
              salesCount: Array.isArray(records) ? records.length : 0,
              kept: false,
              reason: 'pas de coup d’envoi (showTime) → non aligné, ignoré',
            })
          }
          return
        }
        const timeOffset = eventOffsets.get(eId)
        // 0 (et non 1) : un event passé SANS fréquentation connue ne doit pas
        // devenir un dénominateur de 1 (ratio = predictedAttendees → inflation).
        // Le garde `> 0` ci-dessous donne alors un ratio neutre de 1.
        const pastAttendees = eventAttendees.get(eId) || 0
        const attendeeRatio = pastAttendees > 0 ? predictedAttendees / pastAttendees : 1
        const weight = eventWeightsMap.get(eId) || 0
        const combinedFactor = weight * attendeeRatio

        // DEBUG : event RETENU (aligné). Une ligne par event passé, symétrique
        // du cas ignoré ci-dessus → la trace liste tous les events avec coup
        // d'envoi lu, offset appliqué, nb ventes, retenu/ignoré + raison.
        if (isDebugEnabled()) {
          timelineFetchTrace.push({
            eventId: eId,
            eventName: pastEventNameById.get(eId) || eId,
            showTimeRead: pastShowTimeById.get(eId) || null,
            offsetMin: timeOffset,
            salesCount: Array.isArray(records) ? records.length : 0,
            kept: true,
            reason: 'aligné sur le coup d’envoi',
          })
        }

        timelineResults[idx] = records.map((r) => {
          const recMinutes =
            typeof r.minute === 'string' ? parseTime(r.minute) : r.minute || 0
          // ALIGNEMENT TEMPOREL (essentiel) : on décale la chronologie passée
          // pour caler son coup d'envoi sur celui du futur event
          // (timeOffset = horaireCible − horairePassé). Les pics clés (mi-temps,
          // affluence) se superposent ainsi entre events à horaires différents.
          return {
            ...r,
            minute: alignPastMinute(recMinutes, timeOffset),
            totalRevenue: (r.totalRevenue || 0) * combinedFactor,
            totalQuantity: (r.totalQuantity || 0) * combinedFactor,
            transactionCount: (r.transactionCount || 0) * combinedFactor,
            eventId: eId,
          }
        })
      }, signal)

      // Avorté par un appel plus récent (ou un reset) : NE PAS toucher aux
      // flags — le `finally` gardé par le jeton laisse l'appel courant les
      // piloter (avant, ce chemin éteignait le spinner du load suivant).
      if (signal.aborted || isStale()) return
      const validTimelines = timelineResults
        .filter((t) => t !== null)
        .flat()

      if (validTimelines.length === 0) {
        // Events comparables retenus mais aucune timeline minute exploitable
        // (le fetch n'a rien ramené). On signale usedFallback ; pas de courbe.
        usedFallback.value = true
        predictedTimelineData.value = []
        if (isDebugEnabled()) timelineDebugTrace.value = buildTimelineTrace()
        memoizeResult(memoKey)
        timelineLoading.value = false
        return
      }

      // Toute courbe présente ici est ALIGNÉE : les events sans coup d'envoi
      // ont été ignorés en amont (plus de repli offset 0, plus d'affichage en
      // heure brute). Le flag reste donc toujours faux sur ce chemin ; conservé
      // pour compat de l'API du composable. Le cas « aucun event n'avait de coup
      // d'envoi » retombe plus haut sur usedFallback (validTimelines vide).
      void hasAnyOffset
      unalignedTimeline.value = false

      // Agrégation par (minute × boutique × item). Les chronologies passées ont
      // déjà été ALIGNÉES sur le coup d'envoi du futur event (timeOffset, plus
      // haut) → les pics se superposent. Somme directe : Σ minutes = total
      // prédit par construction (la prédiction est bâtie depuis ces minutes).
      const aggregated = new Map()
      validTimelines.forEach((record) => {
        const identifier = record.menuItemId || record.itemName || 'unknown'
        const key = `${record.minute}_${record.shopId}_${identifier}`
        let agg = aggregated.get(key)
        if (!agg) {
          agg = {
            minute: record.minute,
            shopId: record.shopId,
            shopName: record.shopName ?? null,
            menuItemId: record.menuItemId,
            itemName: record.itemName,
            mappedMenuItemId: record.mappedMenuItemId,
            mappedMenuItemName: record.mappedMenuItemName,
            totalRevenue: 0,
            totalQuantity: 0,
            transactionCount: 0,
          }
          aggregated.set(key, agg)
        }
        agg.totalRevenue += record.totalRevenue || 0
        agg.totalQuantity += record.totalQuantity || 0
        agg.transactionCount += record.transactionCount || 0
      })

      const predicted = Array.from(aggregated.values()).map((agg) => ({
        eventId: event.id,
        minute: agg.minute,
        shopId: agg.shopId,
        shopName: agg.shopName ?? null,
        menuItemId: agg.menuItemId,
        itemName: agg.itemName,
        mappedMenuItemId: agg.mappedMenuItemId,
        mappedMenuItemName: agg.mappedMenuItemName,
        totalRevenue: agg.totalRevenue,
        totalQuantity: Math.round(agg.totalQuantity),
        transactionCount: Math.round(agg.transactionCount),
        isPredictive: true,
      }))

      predictedTimelineData.value = preprocessTimelineRecords(predicted, {
        eventId: event.id,
      })
      timelineEventsList.value = pastEvents.map((e) => ({
        eventId: e.id,
        eventName: e.eventName,
        eventDate: e.eventDate,
      }))
      if (isDebugEnabled()) timelineDebugTrace.value = buildTimelineTrace()
      memoizeResult(memoKey)
    } catch (error) {
      console.error('[PREDICTIVE TIMELINE] loadPredictiveTimeline error:', error)
      if (!isStale()) {
        predictedTimelineData.value = []
        timelineError.value = true
      }
    } finally {
      // Toute sortie du chemin principal (succès, vide, low-conf, erreur) passe
      // ici. settleLoad() : un run stale n'éteint le spinner QUE s'il est le
      // dernier en vol (sinon il laisse la main au run porteur du jeton).
      settleLoad()
    }
  }

  async function updatePredictionEvents(selectedIds) {
    if (!predictiveFutureEventId.value) return
    await persistSelection(predictiveFutureEventId.value, selectedIds)
    const allEvents = readEvents()
    const futureEvent = allEvents.find((e) => e.id === predictiveFutureEventId.value)
    if (futureEvent) {
      await loadPredictiveTimeline(futureEvent, selectedIds)
    }
  }

  return {
    // state
    timelineLoading,
    hasCalculated,
    timelineError,
    predictedTimelineData,
    candidateEvents,
    excludedSameSubcategoryEvents,
    excludedSameCategoryEvents,
    selectedPredictionEventIds,
    predictiveShowTime,
    predictiveIsDefaultShowTime,
    predictiveFutureEventId,
    timelineEventsList,
    isLowConfidencePrediction,
    lowConfidenceBasedOnEventIds,
    insufficientData,
    usedFallback,
    unalignedTimeline,
    scoringReady,
    // debug (mode debug uniquement ; null sinon)
    predictionDebugTrace,
    timelineDebugTrace,
    // actions
    loadPredictiveTimeline,
    updatePredictionEvents,
    setSelectedEvents,
    reset,
  }
}
