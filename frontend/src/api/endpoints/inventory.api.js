// src/api/endpoints/inventory.api.js
// API pour la gestion des Inventory counts et Packaging types

import { api } from '../client'

/**
 * Charge l'inventaire complet d'un space pour un event donné.
 * GET /inventory/:spaceId/:eventId
 * @returns {Promise<{inventoryCounts: object} | null>}
 */
export async function getInventory(spaceId, eventId) {
  // Backend retourne toujours 200 ({ inventoryCounts: {...} }, même vide) — plus de 404.
  return api.get(`/inventory/${spaceId}/${eventId}`)
}

/**
 * Charge le dernier inventaire enregistré d'un space (tous events confondus).
 * GET /inventory/:spaceId/latest
 */
export async function getLatestInventory(spaceId) {
  try {
    return await api.get(`/inventory/${spaceId}/latest`)
  } catch (e) {
    if (e?.response?.status === 404) return null
    throw e
  }
}

/**
 * Sauvegarde l'inventaire complet (snapshot par space + event).
 * POST /inventory
 */
export async function saveInventory(inventoryData) {
  return api.post('/inventory', inventoryData)
}

/**
 * Sauvegarde un comptage unitaire (item × shop).
 * POST /inventory-counts
 */
export async function saveInventoryCount(inventoryCountData) {
  return api.post('/inventory-counts', inventoryCountData)
}

/**
 * Liste tous les types de packaging (carton, palette, etc.).
 * Route backend réelle = GET /packaging (il n'existe PAS de /packaging-types → 404).
 */
export async function getAllPackagingTypes() {
  try {
    return await api.get('/packaging')
  } catch (e) {
    if (e?.response?.status === 404) return []
    throw e
  }
}
