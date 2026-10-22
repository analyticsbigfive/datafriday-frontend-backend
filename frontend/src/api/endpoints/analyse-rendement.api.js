// src/api/endpoints/analyse-rendement.api.js
// Endpoints « rendement » de la page Analyse (module backend features/analyse) :
//  - A. dimensions article (marque, industriel, fournisseur, promotion, enfants de combo)
//  - B. valorisation du stock Logistique actuel
//  - C. valorisation par event (dernière feuille post-event)
// Les listes de query partent en CSV (`a,b,c`) : le backend ignore doublons et ids vides.

import { api } from '../client'

const csv = (v) => (Array.isArray(v) ? v.join(',') : v)

/** Retire les clés vides ou undefined (le backend traite l'absence comme « pas de filtre »). */
function compactParams(params) {
  const out = {}
  for (const [k, v] of Object.entries(params)) {
    const value = csv(v)
    if (value == null || value === '') continue
    out[k] = value
  }
  return out
}

/**
 * A. GET /analyse/article-dimensions?spaceId=
 * @returns {Promise<{ items: Array<Object> }>} une entrée par menuItemId
 */
export async function getArticleDimensions(spaceId) {
  return api.get('/analyse/article-dimensions', { params: compactParams({ spaceId }) })
}

/**
 * B. GET /analyse/stock-valuation
 * @returns {Promise<{ spaceId, total, storagesValue, linesWithoutCost, storagesExcluded, byElement }>}
 */
export async function getStockValuation(
  spaceId,
  { shopNames, shopIds, shopTypes, shopAreas, industrialIds, supplierIds } = {},
) {
  return api.get('/analyse/stock-valuation', {
    params: compactParams({ spaceId, shopNames, shopIds, shopTypes, shopAreas, industrialIds, supplierIds }),
  })
}

/**
 * C. GET /analyse/event-valuation
 * @returns {Promise<Array<{ eventId, value, isDraft, linesWithoutCost, reason }>>}
 *   dans l'ordre des eventIds demandés
 */
export async function getEventValuations(spaceId, eventIds, { shopNames, shopIds } = {}) {
  return api.get('/analyse/event-valuation', {
    params: compactParams({ spaceId, eventIds, shopNames, shopIds }),
  })
}

/**
 * D. GET /analyse/:spaceId/event-costs?eventIds=a,b,c (1 à 100 events, lot 4a).
 * @returns {Promise<{ events: Object<string, Object<string, {totalCost:number, source:string, versionAt:string|null}>>, unknownEventIds: string[] }>}
 */
export async function getEventCosts(spaceId, eventIds) {
  return api.get(`/analyse/${encodeURIComponent(spaceId)}/event-costs`, {
    params: compactParams({ eventIds }),
  })
}

export const EVENT_COSTS_BATCH_SIZE = 100
