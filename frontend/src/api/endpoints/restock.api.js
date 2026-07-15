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
  // DTO backend = les 9 champs du contrat, À PLAT (forbidNonWhitelisted) : ni
  // wrapper `state` (→ 400 « property state should not exist »), ni champs
  // ajoutés après le contrat (stockExcluded, currentStep → 400). Ces 2 derniers
  // restent persistés en localStorage ; à ajouter au DTO backend si on les veut
  // cross-machine.
  const s = snapshot || {}
  const body = {
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
  const res = await api.put(
    `/spaces/${encodeURIComponent(spaceId)}/restock-state`,
    body,
    { suppressGlobalError: true },
  )
  return res?.state ?? null
}
