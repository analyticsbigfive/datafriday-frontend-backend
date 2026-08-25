// API functions for spaces
import api from '../client'

function isMissingWeezeventMappingTable(error) {
  const status = error?.response?.status
  const message = String(error?.response?.data?.message || error?.message || '')
  return (
    status === 500 &&
    /WeezeventMerchantElementMapping|does not exist in the current database/i.test(message)
  )
}

/**
 * Get a single space by ID
 */
export async function getSpace(spaceId) {
  try {
    const response = await api.get(`/spaces/${spaceId}`)
    return response.data
  } catch (error) {
    console.error(`[SPACES API] Error fetching space ${spaceId}:`, error)
    throw error
  }
}

/**
 * Signal « event live » d'un espace (module Live — LIVE_API_GUIDE.md §1.2).
 * Endpoint dédié (pas un champ sur la liste /spaces). Guard backend `front.fb.live`.
 * @returns {Promise<{ isLive: boolean, eventId: string|null, since: string|null }>}
 */
export async function getSpaceLiveStatus(spaceId) {
  const response = await api.get(`/spaces/${spaceId}/live-status`)
  return response.data
}

/**
 * Inventaire live d'un espace (module Live v2 — LIVE_API_GUIDE.md §3.3).
 * Arbre Shop→items et Item→shops (stock brut : packed/loose/consumed).
 * @returns {Promise<{ shops: Array<object>, items: Array<object> }>}
 */
export async function getSpaceLiveInventory(spaceId) {
  const response = await api.get(`/spaces/${spaceId}/live/inventory`)
  return response.data
}

/**
 * Get all configurations for a space
 */
export async function getSpaceConfigurations(spaceId) {
  try {
    const response = await api.get(`/spaces/${spaceId}/configurations`)
    return response.data
  } catch (error) {
    console.error(`[SPACES API] Error fetching configurations for ${spaceId}:`, error)
    throw error
  }
}

/**
 * Get shop summary + events for a space — NO granular data (fast, ~1-2s).
 * Use getSpaceShopGranular() separately to load the heavy per-product records.
 */
export async function getSpaceShopDetails(spaceId, { page = 1, limit = 20 } = {}) {
  try {
    const response = await api.get(`/spaces/${spaceId}/shop-details`, {
      params: { page, limit, granular: '0' },
      suppressGlobalError: true,
    })
    return response.data
  } catch (error) {
    if (isMissingWeezeventMappingTable(error)) {
      console.warn(
        `[SPACES API] shop-details unavailable for ${spaceId} (missing Weezevent mapping table). Continuing with empty sales data.`,
      )
      return { __softFailureReason: 'missing-weezevent-table' }
    }
    console.error(`[SPACES API] Error fetching shop details for ${spaceId}:`, error)
    throw error
  }
}

/**
 * Get shopGranularData (heavy per-event × shop × product join).
 * Called in background after the initial page load.
 */
export async function getSpaceShopGranular(spaceId, { page = 1, limit = 20 } = {}) {
  try {
    const response = await api.get(`/spaces/${spaceId}/shop-details`, {
      params: { page, limit, granular: '1' },
      suppressGlobalError: true,
    })
    return response.data
  } catch (error) {
    if (isMissingWeezeventMappingTable(error)) {
      return { __softFailureReason: 'missing-weezevent-table' }
    }
    console.error(`[SPACES API] Error fetching shop granular for ${spaceId}:`, error)
    throw error
  }
}

/**
 * Lightweight shop list for SpaceMenuView — no transaction data, fast (<500ms)
 * @param {string} spaceId
 * @param {string|null} configId - Si fourni, ne retourne que les shops de cette
 *   configuration (sinon toutes les configs de l'espace, à filtrer côté appelant).
 */
export async function getSpaceShopList(spaceId, configId = null) {
  try {
    const query = configId ? `?configId=${encodeURIComponent(configId)}` : ''
    const response = await api.get(`/spaces/${spaceId}/shops${query}`)
    return response.data
  } catch (error) {
    console.error(`[SPACES API] Error fetching shop list for ${spaceId}:`, error)
    throw error
  }
}

/**
 * Get minute-level timeline for one event: minute × shop × menuItem × event.
 * Returns one record per (minute HH:MM, shopId, menuItemId) combination.
 * Records: { minute, shopId, shopName, shopType, shopArea,
 *            weezeventProductId, menuItemId, menuItemName, menuItemType, menuItemCategory,
 *            quantity, transactionCount, revenueHt }
 */
// Cache session de la timeline minute-level par (spaceId, eventId). L'historique
// minute d'un event passé est IMMUABLE → inutile de re-fetcher à chaque re-sélection
// (clic barre Analyse via useAnalyseTimeline/useAnalyseItemRecords, navigation event
// EventPredict via loadPastTimeline). Miroir du `restTimelineCache` d'usePredictiveTimeline.
// On ne fige QUE les réponses non vides : un `[]` transitoire (event sans ventes encore,
// ou réponse partielle) doit pouvoir se re-fetcher.
const _eventTimelineCache = new Map()
// Dédup des requêtes EN VOL : deux instances de useAnalyseItemRecords (principal +
// comparaison) peuvent demander le même event avant que le cache ne soit rempli.
const _eventTimelineInflight = new Map()

// BUG-285 : ces caches session n'avaient AUCUNE éviction — chaque event de chaque
// espace visité restait en mémoire à vie (contributeur n°1 des 2-3 Go observés).
// Borne LRU : les Map itèrent en ordre d'insertion, un re-set au hit rafraîchit la
// récence, l'entrée la plus ancienne saute au-delà du cap. Un event évincé se
// re-fetch simplement au besoin.
const _SESSION_CACHE_MAX = 30
function _lruGet(map, key) {
  if (!map.has(key)) return undefined
  const v = map.get(key)
  map.delete(key)
  map.set(key, v)
  return v
}
function _lruSet(map, key, value) {
  if (map.has(key)) map.delete(key)
  map.set(key, value)
  while (map.size > _SESSION_CACHE_MAX) map.delete(map.keys().next().value)
}
/** BUG-285 : purge des entrées des AUTRES espaces (appelé au changement d'espace). */
export function clearSpaceSessionCachesExcept(spaceId) {
  const prefix = `${spaceId}:`
  for (const m of [_eventTimelineCache, _basketCache]) {
    for (const key of [...m.keys()]) {
      if (!key.startsWith(prefix)) m.delete(key)
    }
  }
}

export async function getSpaceEventTimeline(spaceId, eventId, { bypassCache = false } = {}) {
  // Mode démo : pas de backend → on reconstruit la timeline minute-level de
  // l'event à partir des records du mock (mêmes données minute que le graphe
  // Analyse). Corrige d'un coup (a) la timeline d'event « No timeline data
  // available » dans Analyse et (b) le calcul du taux txn/min dans
  // « Shop Performance by Transaction Rate » — les deux passent par ici.
  // (Le fallback démo avait été retiré par le refactor « real data only ».)
  const { isDemoMode } = await import('@/utils/demoMode')
  if (isDemoMode()) {
    const { ADIDAS_ARENA_MOCK } = await import('@/data/adidasArenaMock')
    return (ADIDAS_ARENA_MOCK.shopGranularData || []).filter(
      (r) => r && r.eventId === eventId && r.minute != null && !r.isPredictive,
    )
  }
  const cacheKey = `${spaceId}:${eventId}`
  // bypassCache (module Live) : un event EN COURS n'est pas immuable, contrairement
  // à l'hypothèse qui justifie ce cache pour un event passé — on force le réseau,
  // mais on réécrit quand même le cache avec la réponse fraîche pour les autres
  // consommateurs (useAnalyseTimeline, usePredictiveTimeline, etc.).
  if (!bypassCache) {
    const cached = _lruGet(_eventTimelineCache, cacheKey)
    if (cached !== undefined) return cached
    if (_eventTimelineInflight.has(cacheKey)) return _eventTimelineInflight.get(cacheKey)
  }
  const inflight = (async () => {
    try {
      const response = await api.get(`/spaces/${spaceId}/event-timeline/${eventId}`)
      const data = response.data
      // On ne fige QUE les réponses non vides (cf. commentaire du cache).
      if (Array.isArray(data) && data.length) _lruSet(_eventTimelineCache, cacheKey, data)
      return data
    } catch (error) {
      console.error(`[SPACES API] Error fetching event timeline for ${spaceId}/${eventId}:`, error)
      throw error
    } finally {
      _eventTimelineInflight.delete(cacheKey)
    }
  })()
  _eventTimelineInflight.set(cacheKey, inflight)
  return inflight
}

/**
 * Batched version of getSpaceEventTimeline: fetches the timeline for MULTIPLE events
 * in a single backend call instead of one request per event (the backend resolves
 * shopIds/ownership/integration-scope once for the space either way). Returns a Map
 * keyed by eventId, same record shape as getSpaceEventTimeline per event.
 */
// BUG-357-01 (OOM backend, 24/08) : sur un espace à gros historique (Jean Bouin :
// 77 events, 275k lignes d'agrégat, 376k lignes brutes), envoyer les 77 fenêtres en UNE
// requête faisait matérialiser toute la réponse côté Node → « Ran out of memory (used
// over 2GB) » en boucle sur Render, et la page se peignait à 0 € (échecs mis en cache
// « tenté/vide »). Les trois endpoints batch sont donc appelés par PAQUETS.
// BUG-361-01 : le tout-séquentiel initial multipliait le temps de chargement par le
// nombre de paquets (5-7 allers-retours sériels sur un espace courant) — on borne
// désormais la CONCURRENCE au lieu de l'interdire : au plus _BATCH_CONCURRENCY
// paquets en vol par endpoint, la mémoire backend reste bornée par
// concurrence × taille de paquet (2 × 15 events, loin des 77 de l'OOM) et le
// wall-clock redevient ≈ celui du paquet le plus lent.
const BATCH_CHUNK_SIZE = 15
const _BATCH_CONCURRENCY = 2

// BUG-364-01 (fiche backend 144-01) : _BATCH_CONCURRENCY borne chaque endpoint, mais la
// page Analyse monte 4 chargeurs en `watch { immediate: true }` — soit jusqu'à
// 4 × 2 = 8 requêtes SQL lourdes simultanées côté backend (512 Mo Render) : récidive de
// l'OOM 357-01 par un autre chemin. File FIFO GLOBALE au niveau module : au plus
// _GLOBAL_BATCH_CONCURRENCY requêtes batch en vol pour TOUTE la page, tous endpoints
// confondus. Les workers par endpoint restent (ordre et fusion par lot inchangés) ;
// seul l'aller HTTP passe par le portillon global.
const _GLOBAL_BATCH_CONCURRENCY = 2
let _globalBatchInFlight = 0
const _globalBatchQueue = []
async function _acquireBatchSlot() {
  if (_globalBatchInFlight < _GLOBAL_BATCH_CONCURRENCY) {
    _globalBatchInFlight++
    return
  }
  await new Promise(resolve => _globalBatchQueue.push(resolve))
  _globalBatchInFlight++
}
function _releaseBatchSlot() {
  _globalBatchInFlight--
  const wake = _globalBatchQueue.shift()
  if (wake) wake()
}

async function _fetchBatchChunked(spaceId, path, ids, chunkSize = BATCH_CHUNK_SIZE, onChunk, extraParams) {
  const chunks = []
  for (let i = 0; i < ids.length; i += chunkSize) chunks.push(ids.slice(i, i + chunkSize))
  const merged = {}
  let next = 0
  const worker = async () => {
    while (next < chunks.length) {
      const chunk = chunks[next++]
      await _acquireBatchSlot()
      let response
      try {
        response = await api.get(`/spaces/${spaceId}/${path}`, {
          params: { eventIds: chunk.join(','), ...(extraParams || {}) },
        })
      } finally {
        _releaseBatchSlot()
      }
      const data = response.data || {}
      Object.assign(merged, data)
      // BUG-363-01 : notifie le paquet terminé — permet aux appelants de livrer
      // chaque event dès que SON paquet répond, sans attendre la fin du lot.
      onChunk?.(chunk, data)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(_BATCH_CONCURRENCY, chunks.length) }, worker),
  )
  return merged
}

// BUG-364-01 : `granularity: 'summary'` = grain event × shop × produit SANS minute
// (~100× plus léger) pour le chargement de montage ; la courbe horaire garde le
// grain minute par défaut. Caches session distincts par granularité (suffixe ':sum').
export async function getSpaceEventTimelineBatch(spaceId, eventIds, { bypassCache = false, onEvent, granularity } = {}) {
  const summary = granularity === 'summary'
  const keyOf = (eventId) => `${spaceId}:${eventId}${summary ? ':sum' : ''}`
  const ids = [...new Set((eventIds || []).filter(Boolean))]
  const result = new Map()
  if (!ids.length) return result

  const { isDemoMode } = await import('@/utils/demoMode')
  if (isDemoMode()) {
    for (const eventId of ids) {
      result.set(eventId, await getSpaceEventTimeline(spaceId, eventId))
    }
    return result
  }

  // bypassCache (module Live) : mêmes raisons que getSpaceEventTimeline ci-dessus —
  // tout va au réseau, mais le cache est quand même réécrit avec la réponse fraîche.
  const missing = []
  for (const eventId of ids) {
    const cacheKey = keyOf(eventId)
    if (bypassCache) {
      missing.push(eventId)
    } else if (_eventTimelineCache.has(cacheKey)) {
      result.set(eventId, _lruGet(_eventTimelineCache, cacheKey))
    } else if (_eventTimelineInflight.has(cacheKey)) {
      result.set(eventId, await _eventTimelineInflight.get(cacheKey))
    } else {
      missing.push(eventId)
    }
  }
  if (!missing.length) return result

  // BUG-363-01 : résolution PAR PAQUET. Une promesse dédiée par event, résolue dès
  // que SON paquet HTTP atterrit — au lieu d'une promesse unique résolue à la fin du
  // lot entier (Jean Bouin, 77 events : 5-6 paquets séquentiels, le premier résultat
  // n'apparaissait qu'après le dernier). `onEvent(eventId, rows)` permet aux
  // composables de patcher leur cache au fil de l'eau.
  const deferred = new Map()
  for (const eventId of missing) {
    const d = { settled: false }
    d.promise = new Promise((resolve, reject) => { d.resolve = resolve; d.reject = reject })
    // Marque la promesse comme « handled » : si AUCUN appel concurrent ne l'await
    // avant l'échec du batch, son rejet devenait une unhandledRejection (crash
    // process en test, warning console en navigateur). Les awaiters concurrents
    // reçoivent toujours le rejet via la Map inflight.
    d.promise.catch(() => {})
    deferred.set(eventId, d)
    _eventTimelineInflight.set(keyOf(eventId), d.promise)
  }
  const settle = (eventId, data) => {
    const d = deferred.get(eventId)
    if (!d || d.settled) return
    d.settled = true
    if (Array.isArray(data) && data.length) _lruSet(_eventTimelineCache, keyOf(eventId), data)
    result.set(eventId, data)
    d.resolve(data)
    // Callback appelant isolé : une erreur dans son handler ne doit pas faire
    // passer le batch entier en échec.
    try { onEvent?.(eventId, data) } catch (err) {
      console.error('[SPACES API] onEvent callback failed:', err)
    }
  }
  // Nettoyage inflight en finally (pas seulement sur succès) : si la requête batch
  // rejette, les entrées laissées en Map seraient des promesses rejetées permanentes —
  // tout appel ultérieur pour ces events re-lèverait la même erreur jusqu'au reload.
  // Même pattern que le `finally` de getSpaceEventTimeline ci-dessus.
  try {
    await _fetchBatchChunked(spaceId, 'event-timeline', missing, BATCH_CHUNK_SIZE,
      (chunkIds, data) => {
        for (const eventId of chunkIds) settle(eventId, data[eventId] || [])
      }, summary ? { granularity: 'summary' } : undefined)
  } catch (error) {
    console.error(`[SPACES API] Error fetching batched event timeline for ${spaceId}:`, error)
    // Events dont le paquet a échoué : leur promesse rejette (les awaiters
    // concurrents reçoivent l'erreur, comme avant la résolution par paquet).
    for (const d of deferred.values()) {
      if (!d.settled) { d.settled = true; d.reject(error) }
    }
    throw error
  } finally {
    for (const eventId of missing) _eventTimelineInflight.delete(keyOf(eventId))
  }
  return result
}

// Cache dédié aux paniers — volontairement PAS mutualisé avec _eventTimelineCache :
// même clé `${spaceId}:${eventId}` mais forme de record totalement différente
// (combinaisons par transaction vs lignes minute × article).
const _basketCache = new Map()
const _basketInflight = new Map()

/**
 * Combinaisons de catégories/articles PAR TRANSACTION, pour N events en un appel.
 * Alimente le donut « Répartition des catégories de produits par transaction ».
 *
 * Mêmes règles de cache que getSpaceEventTimelineBatch : un event PASSÉ est immuable
 * donc mis en cache ; `bypassCache` (module Live) force le réseau car un event EN
 * COURS ne l'est pas, tout en réécrivant le cache pour les autres consommateurs.
 *
 * @returns {Promise<Map<string, Array<object>>>} eventId → BasketComboRecord[]
 */
export async function getSpaceTransactionBasketsBatch(spaceId, eventIds, { bypassCache = false, onEvent } = {}) {
  const ids = [...new Set((eventIds || []).filter(Boolean))]
  const result = new Map()
  if (!ids.length) return result

  const { isDemoMode } = await import('@/utils/demoMode')
  if (isDemoMode()) {
    for (const eventId of ids) result.set(eventId, [])
    return result
  }

  const missing = []
  for (const eventId of ids) {
    const cacheKey = `${spaceId}:${eventId}`
    if (bypassCache) {
      missing.push(eventId)
    } else if (_basketCache.has(cacheKey)) {
      result.set(eventId, _lruGet(_basketCache, cacheKey))
    } else if (_basketInflight.has(cacheKey)) {
      result.set(eventId, await _basketInflight.get(cacheKey))
    } else {
      missing.push(eventId)
    }
  }
  if (!missing.length) return result

  // BUG-363-01 : résolution PAR PAQUET, même mécanique que getSpaceEventTimelineBatch
  // ci-dessus (promesse dédiée par event + onEvent au fil des paquets).
  const deferred = new Map()
  for (const eventId of missing) {
    const d = { settled: false }
    d.promise = new Promise((resolve, reject) => { d.resolve = resolve; d.reject = reject })
    // Idem BUG-173 côté timeline : sans ce catch, un batch en échec qu'aucun appel
    // concurrent n'await devient une unhandledRejection.
    d.promise.catch(() => {})
    deferred.set(eventId, d)
    _basketInflight.set(`${spaceId}:${eventId}`, d.promise)
  }
  const settle = (eventId, data) => {
    const d = deferred.get(eventId)
    if (!d || d.settled) return
    d.settled = true
    if (Array.isArray(data) && data.length) _lruSet(_basketCache, `${spaceId}:${eventId}`, data)
    result.set(eventId, data)
    d.resolve(data)
    try { onEvent?.(eventId, data) } catch (err) {
      console.error('[SPACES API] onEvent callback failed:', err)
    }
  }
  try {
    await _fetchBatchChunked(spaceId, 'transaction-baskets', missing, BATCH_CHUNK_SIZE,
      (chunkIds, data) => {
        for (const eventId of chunkIds) settle(eventId, data[eventId] || [])
      })
  } catch (error) {
    console.error(`[SPACES API] Error fetching transaction baskets for ${spaceId}:`, error)
    for (const d of deferred.values()) {
      if (!d.settled) { d.settled = true; d.reject(error) }
    }
    throw error
  } finally {
    for (const eventId of missing) _basketInflight.delete(`${spaceId}:${eventId}`)
  }
  return result
}

/**
 * List WeezeventEvents for a space, including enrichment metadata
 */
export async function getWeezeventEventsForSpace(spaceId, integrationId) {
  try {
    const params = integrationId ? { integrationId } : {}
    const response = await api.get(`/spaces/${spaceId}/weezevent-events`, { params })
    return response.data
  } catch (error) {
    console.error(`[SPACES API] Error fetching weezevent events for ${spaceId}:`, error)
    throw error
  }
}

/**
 * Update enrichment metadata for a WeezeventEvent (doorsOpening, showTime, category, team…)
 * @param {string} spaceId
 * @param {string} eventId  - WeezeventEvent.id (CUID)
 * @param {{ doorsOpening?, showTime?, category?, eventType?, team?, visitingTeam?, hasIntermission? }} metadata
 */
export async function updateWeezeventEventMetadata(spaceId, eventId, metadata) {
  try {
    const response = await api.patch(`/spaces/${spaceId}/weezevent-events/${eventId}`, metadata)
    return response.data
  } catch (error) {
    console.error(`[SPACES API] Error updating weezevent event metadata for ${spaceId}/${eventId}:`, error)
    throw error
  }
}

/**
 * Sync attendees for a WeezeventEvent from the WeezPay API (G6)
 * @param {string} spaceId
 * @param {string} eventId - WeezeventEvent.id (CUID)
 * @returns {{ synced: number }}
 */
export async function syncWeezeventEventAttendees(spaceId, eventId) {
  try {
    const response = await api.post(`/spaces/${spaceId}/weezevent-events/${eventId}/sync-attendees`)
    return response.data
  } catch (error) {
    console.error(`[SPACES API] Error syncing attendees for ${spaceId}/${eventId}:`, error)
    throw error
  }
}

/**
 * Get all spaces
 */
export async function getAllSpaces() {
  try {
    // L'API pagine par défaut à 20 ; le MAX autorisé est 100 (au-delà : 400
    // « limit must not be greater than 100 »). On demande 100 pour couvrir la
    // plupart des comptes ; la homepage pagine ensuite côté client.
    const response = await api.get('/spaces', { params: { limit: 100 } })
    return response.data
  } catch (error) {
    console.error('[SPACES API] Error fetching spaces:', error)
    throw error
  }
}

/**
 * Get { id, name } space list for selects and wizards — backed by the Redis-cached
 * `/spaces/light` endpoint (~10ms on cache hit), unlike `getAllSpaces()` which hits the
 * full paginated + uncached (at limit>10) `/spaces` endpoint.
 */
export async function getSpacesLight() {
  try {
    const result = await api.get('/spaces/light')
    return Array.isArray(result) ? result : (result?.data ?? [])
  } catch (error) {
    console.error('[SPACES API] Error fetching spaces:', error)
    throw error
  }
}

/**
 * Create a new space
 */
export async function createSpace(spaceData) {
  try {
    const response = await api.post('/spaces', spaceData)
    return response.data
  } catch (error) {
    console.error('[SPACES API] Error creating space:', error)
    throw error
  }
}

/**
 * Update a space
 */
export async function updateSpace(spaceId, spaceData) {
  try {
    const response = await api.patch(`/spaces/${spaceId}`, spaceData)
    return response.data
  } catch (error) {
    console.error(`[SPACES API] Error updating space ${spaceId}:`, error)
    throw error
  }
}

/**
 * Delete a space
 */
export async function deleteSpace(spaceId) {
  try {
    const response = await api.delete(`/spaces/${spaceId}`)
    return response.data
  } catch (error) {
    console.error(`[SPACES API] Error deleting space ${spaceId}:`, error)
    throw error
  }
}

/**
 * Quick-create a shop element in a space (for Weezevent import flow)
 *
 * `area` (zone d'implantation) est optionnel : il alimente
 * `SpaceElement.attributes.area`, exploité par l'analytique (filtre « Zones » +
 * donut « By area »). On ne l'ajoute au payload QUE s'il est renseigné, afin de
 * laisser le corps de requête strictement identique pour les appels existants
 * (création/mapping en masse) et éviter tout rejet de validation backend.
 */
export async function quickCreateSpaceElement(spaceId, { name, type, area }) {
  try {
    const payload = { name, type }
    if (area) payload.area = area
    const response = await api.post(`/spaces/${spaceId}/quick-element`, payload)
    return response.data
  } catch (error) {
    console.error(`[SPACES API] Error creating quick element for space ${spaceId}:`, error)
    throw error
  }
}

/**
 * Bulk create & map shops (étape 2 Data Integration) — un seul appel pour tout le lot.
 * items: [{ weezeventLocationId, name, type?, elementId? }]
 *  - avec `elementId` : mappe la location sur cet élément existant, rien n'est créé
 *  - sans `elementId` : crée un SpaceElement (zone RDC, 2×2 m) puis le mappe
 */
export async function bulkQuickCreateAndMap(spaceId, items, opts = {}) {
  try {
    const payload = { items }
    if (opts.configId) payload.configId = opts.configId
    const response = await api.post(`/spaces/${spaceId}/quick-elements/bulk`, payload)
    return response.data
  } catch (error) {
    console.error(`[SPACES API] Error bulk creating/mapping elements for space ${spaceId}:`, error)
    throw error
  }
}

/**
 * Update a space element (name, image, notes, type, shopTypes)
 */
export async function updateSpaceElement(elementId, data) {
  const response = await api.patch(`/configurations/elements/${elementId}`, data)
  return response.data
}

/**
 * Assign a list of SpaceElements to a floor level within a space.
 * Creates the floor (e.g. "Étage 1") if it doesn't exist yet, INSIDE the target
 * configuration (`opts.configId` — the one created at step 1 / in the 3D Builder).
 * When `configId` is provided no "Weezevent Import" config is created.
 * `opts.width/length/height` are used only when a new floor/zone must be created.
 */
export async function assignShopsFloor(spaceId, elementIds, level, opts = {}) {
  try {
    const body = { elementIds, level }
    if (opts.configId) body.configId = opts.configId
    if (opts.width != null) body.width = opts.width
    if (opts.length != null) body.length = opts.length
    if (opts.height != null) body.height = opts.height
    // Nom de zone + position/dimensions des shops : appliqués par le backend
    // (remplace le getConfiguration + updateConfiguration full-save côté front).
    if (opts.zoneName) body.zoneName = opts.zoneName
    if (opts.position) body.position = opts.position
    if (opts.shopDimensions) body.shopDimensions = opts.shopDimensions
    const response = await api.post(`/spaces/${spaceId}/assign-floor`, body)
    return response.data
  } catch (error) {
    console.error(`[SPACES API] Error assigning floor for space ${spaceId}:`, error)
    throw error
  }
}

/**
 * Liste LÉGÈRE des zones/étages pour les dialogues de l'étape 2 (« Assigner un
 * étage », quick-create). Zones v2 (table Zone, même vides) + floors legacy v1.
 * Remplace getConfiguration (fusion complète) qui masquait les zones vides.
 */
export async function getSpaceFloorOptions(spaceId, configId = null) {
  try {
    const params = configId ? { configId } : {}
    const response = await api.get(`/spaces/${spaceId}/floor-options`, { params })
    return response.data
  } catch (error) {
    console.error(`[SPACES API] Error fetching floor options for space ${spaceId}:`, error)
    throw error
  }
}

/**
 * Volume NON MAPPÉ des ventes de l'Analyse (BUG-137-01 côté api) : lignes dont le
 * produit ou le PdV n'a pas de mapping Data Integration. INFORMATIF — ces ventes
 * restent comptées, en « Non mappées » ; le bandeau distingue « rien vendu » de
 * « rien de mappé ». Pas de cache module : le composable met en cache par event, et
 * un re-mapping en Data Integration doit se voir au prochain chargement de page.
 *
 * @returns {Promise<Map<string, object>>} eventId → { unmappedLines, unmappedUnits,
 *   unmappedRevenueHt, unmappedProductLines, unmappedPosLines }
 */
export async function getSpaceAnalyseUnmappedBatch(spaceId, eventIds) {
  const ids = [...new Set((eventIds || []).filter(Boolean))]
  const result = new Map()
  if (!ids.length) return result
  try {
    // BUG-364-01 : paquets alignés sur BATCH_CHUNK_SIZE (15) — l'endpoint scanne les
    // transactions brutes (le plus lourd des trois), un paquet de 30 doublait sa
    // fenêtre SQL par rapport aux deux autres endpoints.
    const data = await _fetchBatchChunked(spaceId, 'analyse-unmapped', ids)
    for (const id of ids) result.set(id, data[id] || null)
    return result
  } catch (error) {
    console.error(`[SPACES API] Error fetching analyse unmapped volume for ${spaceId}:`, error)
    throw error
  }
}
