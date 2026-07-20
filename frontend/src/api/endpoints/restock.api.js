// src/api/endpoints/restock.api.js
// Client REST pour la persistance de l'état du Réarmement (table RestockState).
// Contrat : GET/PUT /spaces/:spaceId/restock-state (cf. docs/restockState.api.md).
//
// Le fallback localStorage est géré dans SpaceRestockView ; ici on expose juste
// le flag « API down » : sur réseau / timeout / 5xx, toute la session reste sur
// localStorage sans re-tenter. JAMAIS sur 4xx (= API up, erreur applicative).
// Même pattern que useEventPredictVersions.js.

import { api } from '../client'

let _apiDown = false

export function isRestockApiDown() {
  return _apiDown
}

export function onRestockApiError(err) {
  const status = err?.response?.status
  if (status && status >= 400 && status < 500) return // 4xx = API joignable
  _apiDown = true
}

/**
 * Lit l'état réarmement d'un space.
 * GET /spaces/:spaceId/restock-state → 200 { id, state, updatedAt } | 200 null
 * @param {string} spaceId
 * @returns {Promise<object|null>} le blob `state` (snapshot), ou null si aucun
 */
export async function getRestockState(spaceId) {
  const res = await api.get(
    `/spaces/${encodeURIComponent(spaceId)}/restock-state`,
    { suppressGlobalError: true },
  )
  return res?.state ?? null
}

/**
 * Upsert (idempotent, keyé tenant+space côté backend) l'état réarmement.
 * PUT /spaces/:spaceId/restock-state  body = snapshot (9 champs, stocké en jsonb)
 * @param {string} spaceId
 * @param {object} state  le snapshot (restockPersistSnapshot)
 * @returns {Promise<object|null>}
 */
export async function putRestockState(spaceId, snapshot) {
  // Le backend actuel stocke le snapshot comme blob jsonb OPAQUE (champs
  // additionnels tolérés — cf. restock-state.controller.ts). On envoie donc
  // AUSSI stockExcluded/currentStep (avant : localStorage only → perdus au
  // changement de machine, cf. fiches front BUG-019 / back BUG-31).
  // Rétro-compat : si le backend DÉPLOYÉ est une version antérieure encore en
  // whitelist stricte (forbidNonWhitelisted → 400 « should not exist »), on
  // retente une fois avec le noyau des 9 champs du contrat historique.
  const s = snapshot || {}
  const core = {
    objectiveSource: s.objectiveSource,
    referenceEventId: s.referenceEventId,
    selectedEventIds: s.selectedEventIds,
    stockAdjustments: s.stockAdjustments,
    stockPackedModes: s.stockPackedModes,
    restockedRows: s.restockedRows,
    restockGenerated: s.restockGenerated,
    shoppingGenerated: s.shoppingGenerated,
    restockViewMode: s.restockViewMode,
  }
  const extras = {}
  if (s.stockExcluded !== undefined) extras.stockExcluded = s.stockExcluded
  if (s.currentStep !== undefined) extras.currentStep = s.currentStep
  const url = `/spaces/${encodeURIComponent(spaceId)}/restock-state`
  try {
    const res = await api.put(url, { ...core, ...extras }, { suppressGlobalError: true })
    return res?.state ?? null
  } catch (err) {
    const isWhitelist400 =
      err?.response?.status === 400 &&
      Object.keys(extras).length > 0 &&
      /should not exist/i.test(JSON.stringify(err?.response?.data?.message ?? ''))
    if (!isWhitelist400) throw err
    const res = await api.put(url, core, { suppressGlobalError: true })
    return res?.state ?? null
  }
}
