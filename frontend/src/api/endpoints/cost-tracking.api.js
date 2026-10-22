// src/api/endpoints/cost-tracking.api.js
// Endpoints de la page Cost tracking (module backend cost-tracking) :
//  - catalogue des articles du Space Menu (Type > Catégorie > Article)
//  - séries de coût par pièce en escalier
//  - historique des versions de coût d'un article
// Les montants arrivent déjà en nombres JS. Les erreurs sont relancées (jamais avalées).

import { api } from '../client'

/** Retire les clés vides ou undefined (l'absence vaut « pas de filtre » côté backend). */
function compactParams(params) {
  const out = {}
  for (const [k, v] of Object.entries(params || {})) {
    if (v == null || v === '') continue
    out[k] = v
  }
  return out
}

/**
 * GET /cost-tracking/:spaceId/catalog
 * @returns {Promise<{ spaceId, types, articlesWithoutType }>}
 */
export async function getCostTrackingCatalog(spaceId) {
  try {
    return await api.get(`/cost-tracking/${spaceId}/catalog`)
  } catch (error) {
    console.error('[cost-tracking.api] getCostTrackingCatalog', error)
    throw error
  }
}

/**
 * GET /cost-tracking/:spaceId/series
 * @param {string} spaceId
 * @param {{ from?: string, to?: string, typeId?: string, categoryId?: string,
 *           menuItemId?: string, groupBy?: 'article'|'category'|'type' }} [params]
 *        from/to au format YYYY-MM-DD (max 366 jours)
 * @returns {Promise<{ lines, events, trackingStartedAt, truncated, rankedByRevenue, ... }>}
 */
export async function getCostTrackingSeries(spaceId, params = {}) {
  try {
    return await api.get(`/cost-tracking/${spaceId}/series`, { params: compactParams(params) })
  } catch (error) {
    console.error('[cost-tracking.api] getCostTrackingSeries', error)
    throw error
  }
}

/**
 * GET /cost-tracking/:spaceId/articles/:id/history
 * @param {string} spaceId
 * @param {string} menuItemId
 * @param {{ limit?: number }} [opts] 1 à 500, défaut backend 100
 * @returns {Promise<{ spaceId, article, versions }>} versions de la plus récente à la plus ancienne
 */
export async function getCostTrackingArticleHistory(spaceId, menuItemId, { limit } = {}) {
  try {
    return await api.get(`/cost-tracking/${spaceId}/articles/${menuItemId}/history`, {
      params: compactParams({ limit }),
    })
  } catch (error) {
    console.error('[cost-tracking.api] getCostTrackingArticleHistory', error)
    throw error
  }
}
