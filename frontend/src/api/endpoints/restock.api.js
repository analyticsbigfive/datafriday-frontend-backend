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
  // Plan chargé (RestockPlan) : rechargé au restore. Dans les extras — un
  // backend antérieur en whitelist stricte retombe sur le noyau sans lui.
  if (s.loadedPlanId !== undefined) extras.loadedPlanId = s.loadedPlanId
  // fiche 314-01 / maquette 14-08 — état de l'onglet Espaces de stockage :
  // % par ligne (remplace l'ancien storageAdjustments absolu, plus émis),
  // ajustement global et inventaire source explicite.
  if (s.storagePercents !== undefined) extras.storagePercents = s.storagePercents
  if (s.storageGlobalPercent !== undefined) extras.storageGlobalPercent = s.storageGlobalPercent
  if (s.storageGlobalEnabled !== undefined) extras.storageGlobalEnabled = s.storageGlobalEnabled
  if (s.sourceInventoryEventId !== undefined) extras.sourceInventoryEventId = s.sourceInventoryEventId
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

// ---------------------------------------------------------------------------
// RestockPlan — documents figés nommés (ADR-0005), distincts de RestockState.
// Contrat : backend/src/features/restock-plans/ (GET liste = métadonnées
// seules, GET :id = photo complète). Sauvegarde EXPLICITE uniquement — aucun
// auto-save, aucun repli localStorage : un 404 sur la liste signifie que le
// backend n'est pas déployé → le panneau se masque (useRestockPlans).
// ---------------------------------------------------------------------------

/**
 * Liste les plans d'un espace (métadonnées seules, jamais la photo).
 * GET /spaces/:spaceId/restock-plans → 200 [{ id, name, objectiveSource,
 *   selectedEventIds, eventsSnapshot, lineCount, shoppingItemCount,
 *   createdBy, createdAt, updatedAt }]
 */
export async function listRestockPlans(spaceId) {
  return api.get(
    `/spaces/${encodeURIComponent(spaceId)}/restock-plans`,
    { suppressGlobalError: true },
  )
}

/**
 * Lit un plan complet (photo comprise).
 * GET /restock-plans/:id → 200 plan | 404 (supprimé / autre tenant)
 */
export async function getRestockPlan(planId) {
  return api.get(
    `/restock-plans/${encodeURIComponent(planId)}`,
    { suppressGlobalError: true },
  )
}

/**
 * Enregistre un nouveau plan (payload = buildPlanSnapshot + name).
 * POST /spaces/:spaceId/restock-plans → 201 plan
 */
export async function createRestockPlan(spaceId, payload) {
  return api.post(
    `/spaces/${encodeURIComponent(spaceId)}/restock-plans`,
    payload,
    { suppressGlobalError: true },
  )
}

/**
 * Met à jour un plan (rename, nouvelle photo, lineOverrides…).
 * PATCH /restock-plans/:id → 200 plan
 */
export async function patchRestockPlan(planId, payload) {
  return api.patch(
    `/restock-plans/${encodeURIComponent(planId)}`,
    payload,
    { suppressGlobalError: true },
  )
}

/**
 * Duplique un plan CÔTÉ SERVEUR (pas de ré-upload de la photo).
 * POST /restock-plans/:id/duplicate → 201 copie
 */
export async function duplicateRestockPlan(planId) {
  return api.post(
    `/restock-plans/${encodeURIComponent(planId)}/duplicate`,
    {},
    { suppressGlobalError: true },
  )
}

/**
 * Supprime un plan.
 * DELETE /restock-plans/:id → 204
 */
export async function deleteRestockPlan(planId) {
  return api.delete(
    `/restock-plans/${encodeURIComponent(planId)}`,
    { suppressGlobalError: true },
  )
}
