// src/api/endpoints/logistic-tasks.api.js
// API des tâches de transfert assignées (drawer "Restocker" du Live inventory →
// tâches staff/priorité dans Logistic). Couche au-dessus du ledger StockMovement
// (logistics.api.js) : pickup/drop délèguent au backend, qui délègue lui-même à
// LogisticsService — voir backend/src/features/logistic-tasks.

import { api } from '../client'

/**
 * Crée en un lot les tâches accumulées dans le drawer Restocker ("Tâches : N").
 * POST /spaces/:spaceId/logistic-tasks/batch
 * @param {string} spaceId
 * @param {Array<{itemKey, menuItemId?, sourceElementId, destinationElementId, packed, loose, assignedToUserId, priority}>} tasks
 */
export async function createLogisticTaskBatch(spaceId, tasks) {
  return api.post(`/spaces/${spaceId}/logistic-tasks/batch`, { tasks })
}

/**
 * Tâches de l'espace (groupables par staff côté front).
 * GET /spaces/:spaceId/logistic-tasks?assignedToUserId=
 */
export async function getLogisticTasks(spaceId, assignedToUserId) {
  const params = {}
  if (assignedToUserId) params.assignedToUserId = assignedToUserId
  return api.get(`/spaces/${spaceId}/logistic-tasks`, { params })
}

/**
 * Utilisateurs assignables (accès espace + permission front.fb.logistic), triés
 * par nombre croissant de tâches en cours — alimente "Attribuer à" du drawer.
 * GET /spaces/:spaceId/logistic-tasks/assignable-staff
 */
export async function getAssignableStaff(spaceId) {
  return api.get(`/spaces/${spaceId}/logistic-tasks/assignable-staff`)
}

/** Case "Récupérer" cochée. PATCH /logistic-tasks/:id/pickup */
export async function pickupLogisticTask(id) {
  return api.patch(`/logistic-tasks/${id}/pickup`)
}

/** Case "Déposer" cochée. PATCH /logistic-tasks/:id/drop */
export async function dropLogisticTask(id) {
  return api.patch(`/logistic-tasks/${id}/drop`)
}
