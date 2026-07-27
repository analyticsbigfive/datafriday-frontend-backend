// src/api/endpoints/inventory.api.js
// API pour la gestion des Inventory counts et Packaging types

import { api } from '../client'

/**
 * Charge l'inventaire complet d'un space pour un event donné.
 * GET /inventory/:spaceId/:eventId
 * @returns {Promise<{inventoryCounts: object} | null>}
 */
export async function getInventory(spaceId, eventId, { phase } = {}) {
  // Backend retourne toujours 200 ({ inventoryCounts: {...} }, même vide) — plus de 404.
  // `phase` ('pre-event'|'post-event', BUG-237) : les deux écrans partagent le
  // même eventId ; en phase post, le serveur renvoie les lignes saisies AVANT la
  // clôture du Pre-event comme proposition (valeurs gardées, isCounted=false)
  // au lieu d'un comptage déjà validé. Paramètre omis = comportement historique.
  const qs = phase ? `?phase=${encodeURIComponent(phase)}` : ''
  return api.get(`/inventory/${spaceId}/${eventId}${qs}`)
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

// ── Réconciliation post-événement (Post-event Inventory) ─────────────────────
// Documents d'écarts « compté vs ce qui devrait rester après les ventes »,
// StockReconciliation kind='post-event' côté backend. Voir
// docs/modules/10_POST_EVENT_INVENTORY.md §7.

/**
 * Crée le document de réconciliation post-événement.
 * POST /inventory/:spaceId/reconciliations
 * @param {string} spaceId
 * @param {{eventId: string, eventName?: string, lines: Array<object>,
 *   preEventSource?: string,
 *   salesUnjoined?: {shopNames?: string[], itemNames?: string[], units?: number},
 *   countedProgress?: number[]}} payload
 *   `preEventSource`/`salesUnjoined`/`countedProgress` (BUG-238/241) : contexte de
 *   fabrication archivé dans `StockReconciliation.meta` — un écart produit par une
 *   source manquante doit rester distinguable d'un manquant réel.
 */
export async function createPostEventReconciliation(spaceId, payload) {
  return api.post(`/inventory/${spaceId}/reconciliations`, payload)
}

/**
 * Liste COMMUNE des documents de réconciliation pre + post-événement (lines et
 * kind inclus, du plus récent au plus ancien) — badge de type côté écran.
 * GET /inventory/:spaceId/reconciliations
 */
export async function listInventoryReconciliations(spaceId) {
  return api.get(`/inventory/${spaceId}/reconciliations`)
}

/**
 * Supprime un document de réconciliation pre/post-event (« repartir de zéro » :
 * supprimer puis recliquer « Générer la réconciliation »). Les resets
 * logistiques (kind null) sont hors périmètre → 404.
 * DELETE \inventory:spaceId/reconciliations/:id
 */
export async function deleteInventoryReconciliation(spaceId, id) {
  return api.delete(`/inventory/${spaceId}/reconciliations/${id}`)
}

/**
 * Inventaire de référence pré-événement (réco POST-event) : comptage Pre-event
 * Inventory du même event (snapshot kind='pre-event'), repli SCOPÉ = comptage
 * post-event du match précédent (BUG-241 — plus « n'importe quel snapshot avant
 * le jour du match »). Renvoie null si aucun (jamais 404).
 * La réponse porte `source` ('pre-event' | 'previous-post-event') : l'appelant
 * l'archive dans le document pour que l'approximation reste visible.
 * GET /inventory/:spaceId/pre-event/:eventId
 */
export async function getPreEventInventory(spaceId, eventId) {
  return api.get(`/inventory/${spaceId}/pre-event/${eventId}`)
}

/**
 * Quantités ATTENDUES du Pre-event Inventory (post-event précédent + mouvements
 * Logistic). ⚠️ Endpoint gaté par `front.fb.preInventoryExpected` (403 sinon) —
 * l'appelant teste la permission AVANT d'appeler.
 * GET /inventory/:spaceId/pre-event-baseline/:eventId
 */
export async function getPreEventBaseline(spaceId, eventId) {
  return api.get(`/inventory/${spaceId}/pre-event-baseline/${eventId}`)
}

/**
 * Ventes de l'événement EXPLOSÉES en consommation d'ingrédients par la cascade
 * Logistic (Q35 Option 1) — source « Vendu » de la réco post-event : une ligne
 * comptée au grain ingrédient (fût, bidon) reçoit enfin la consommation des
 * produits préparés vendus. Réponse : { lines: [{elementId, itemKey, quantity}],
 * unjoined } — itemKey = NOM du référentiel (jointure par nom normalisé côté
 * appelant), unjoined = ventes non rattachables (jamais avalées, BUG-238).
 * GET /inventory/:spaceId/event-consumption/:eventId
 */
export async function getEventSalesConsumption(spaceId, eventId) {
  return api.get(`/inventory/${spaceId}/event-consumption/${eventId}`)
}

/**
 * Crée la réconciliation PRE-event (attendu vs compté) — lignes construites
 * CÔTÉ SERVEUR (le client, potentiellement sans la permission « attendus »,
 * ne les fournit pas).
 * POST /inventory/:spaceId/pre-event-reconciliations
 */
export async function createPreEventReconciliation(spaceId, eventId) {
  return api.post(`/inventory/${spaceId}/pre-event-reconciliations`, { eventId })
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
