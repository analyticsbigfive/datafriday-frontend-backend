// localDb — "base de données locale" (localStorage) pour faire tourner
// inventaire + réarmement sans backend (routes /inventory* en 404).
//
// Deux espaces :
//   1. Inventaire — counts par space + event. Clé HISTORIQUE conservée
//      (`analyse:space-inventory-counts:…`) car SpaceRestockView lit déjà
//      cette clé : on ne casse pas le contrat existant.
//   2. Réarmement — état UI par space (events sélectionnés, ajustements,
//      lignes confirmées, tableaux générés).

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch (_) {
    return fallback
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch (_) {
    // quota / mode privé : on échoue en silence (l'état mémoire tient la session)
    return false
  }
}

// ── Inventaire ──────────────────────────────────────────────────────────────
export function inventoryCountsKey(spaceId, eventId) {
  return `analyse:space-inventory-counts:${spaceId || 'global'}:${eventId || 'none'}`
}

export function getInventoryCounts(spaceId, eventId) {
  const v = read(inventoryCountsKey(spaceId, eventId), {})
  return v && typeof v === 'object' ? v : {}
}

export function setInventoryCounts(spaceId, eventId, counts) {
  return write(inventoryCountsKey(spaceId, eventId), counts || {})
}

/**
 * Fusion profonde de comptages : { [shopId]: { [itemId]: count } }.
 * `override` gagne item par item (modifs locales non synchronisées prioritaires).
 */
export function mergeCounts(base = {}, override = {}) {
  const out = { ...(base || {}) }
  for (const [shopId, items] of Object.entries(override || {})) {
    out[shopId] = { ...(out[shopId] || {}), ...(items || {}) }
  }
  return out
}

// ── Réarmement ──────────────────────────────────────────────────────────────
export function restockStateKey(spaceId) {
  return `datafriday:restock-state:${spaceId || 'global'}`
}

export function getRestockState(spaceId) {
  return read(restockStateKey(spaceId), null)
}

export function setRestockState(spaceId, state) {
  return write(restockStateKey(spaceId), state || {})
}

export function clearRestockState(spaceId) {
  try {
    localStorage.removeItem(restockStateKey(spaceId))
  } catch (_) {
    /* noop */
  }
}

// ── Dernier event prédit ─────────────────────────────────────────────────────
// Mémorise le dernier event sur lequel une prédiction a servi de base au
// réarmement (+ sa date prévue), pour pré-remplir SpaceRestockView quand on
// l'ouvre sans ?event= dans l'URL.
export function lastPredictedEventKey(spaceId) {
  return `datafriday:last-predicted-event:${spaceId || 'global'}`
}

export function getLastPredictedEvent(spaceId) {
  const v = read(lastPredictedEventKey(spaceId), null)
  return v && typeof v === 'object' ? v : null
}

export function setLastPredictedEvent(spaceId, payload) {
  return write(lastPredictedEventKey(spaceId), payload || null)
}

// ── Records de prédiction (pont EventPredict → Réarmement) ───────────────────
// EventPredict persiste ici ses records calculés (par version) pour que le
// réarmement les lise au lieu de recalculer — marche même API/DB indisponibles.
// Payload : { eventId, versionId, ts, records, quantityAdjustments, menuConfig }.
export function predictedRecordsKey(spaceId, eventId, versionId) {
  return `datafriday:predicted-records:${spaceId || 'global'}:${eventId || 'none'}:${versionId || 'current'}`
}

export function getPredictedRecords(spaceId, eventId, versionId) {
  const v = read(predictedRecordsKey(spaceId, eventId, versionId), null)
  return v && typeof v === 'object' && Array.isArray(v.records) ? v : null
}

export function setPredictedRecords(spaceId, eventId, versionId, payload) {
  return write(predictedRecordsKey(spaceId, eventId, versionId), payload || null)
}

/**
 * Récupère les MEILLEURS records persistés pour un event, toutes versions
 * confondues. Le pont écrit toujours la clé `current`, mais un `current` peut
 * avoir été écrasé par une prédiction vide (activeTimelineData vide au clic) ;
 * dans ce cas on retombe sur le scénario sauvegardé qui, lui, a des records.
 * Stratégie : `current` non-vide en priorité, sinon le payload non-vide le plus
 * récent (par `ts`) parmi toutes les clés `predicted-records:{space}:{event}:*`.
 * @returns {object|null} le payload (records non-vide) ou null
 */
export function getAnyPredictedRecords(spaceId, eventId) {
  const cur = getPredictedRecords(spaceId, eventId, 'current')
  if (cur?.records?.length) return cur
  const prefix = `datafriday:predicted-records:${spaceId || 'global'}:${eventId || 'none'}:`
  let best = null
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (!key || !key.startsWith(prefix)) continue
      const v = read(key, null)
      if (!v || !Array.isArray(v.records) || v.records.length === 0) continue
      if (!best || (Number(v.ts) || 0) > (Number(best.ts) || 0)) best = v
    }
  } catch (_) {
    return cur || null
  }
  return best || null
}

// ── Lecture des versions EventPredict (scénarios) ────────────────────────────
// Clés écrites par useEventPredictVersions (préfixe `analyse:`). localStorage
// fait autorité (REST désactivé). Réutilisé par le réarmement pour lister les
// scénarios d'un évènement.
export function getEventPredictVersions(eventId) {
  if (!eventId) return []
  const v = read(`analyse:event-predict-versions:${eventId}`, [])
  return Array.isArray(v) ? v : []
}

export function getEventPredictDefaultVersionId(eventId) {
  if (!eventId) return null
  const active = read(`analyse:event-predict-active-version:${eventId}`, null)
  if (active?.activeVersionId) return active.activeVersionId
  const def = read(`analyse:event-predict-default-version:${eventId}`, null)
  return def?.defaultVersionId || null
}

/**
 * Écrit le miroir localStorage des versions (mêmes clés que useEventPredictVersions).
 * Permet au réarmement de rapatrier les versions depuis la BDD sans qu'une session
 * EventPredict ait été ouverte dans cet onglet (cross-device / refresh direct).
 */
export function setEventPredictVersionsMirror(eventId, versions, defaultVersionId) {
  if (!eventId) return
  write(`analyse:event-predict-versions:${eventId}`, Array.isArray(versions) ? versions : [])
  if (defaultVersionId !== undefined) {
    write(`analyse:event-predict-default-version:${eventId}`, { defaultVersionId: defaultVersionId || null })
  }
}

// ── Market prices (catalogue global tenant — cache cross-session) ────────────
// `GET /market-prices` = ~60s (query lourde / cold-start Render). Le catalogue est
// global et stable → on le persiste pour hydrater le stock instantanément au reload
// (SWR : cache immédiat + refresh réseau en fond). Le champ `image` (base64, lourd et
// inutile au calcul stock) est retiré avant write → cache léger sous la limite localStorage.
const MARKET_PRICES_KEY = 'analyse:market-prices-cache'

export function getMarketPricesCache() {
  const v = read(MARKET_PRICES_KEY, null)
  return Array.isArray(v) ? v : null
}

export function setMarketPricesCache(list) {
  if (!Array.isArray(list)) return false
  const trimmed = list.map(({ image, ...rest }) => rest)
  return write(MARKET_PRICES_KEY, trimmed)
}
