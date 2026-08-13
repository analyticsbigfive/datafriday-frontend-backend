// src/api/endpoints/logistics.api.js
// API Logistic : stock temps réel par PDV/Storage (ledger de mouvements),
// historique, reset après inventaire et réconciliations.

import { api } from '../client'

/**
 * Stock attendu d'un espace — réponse auto-suffisante (espace/configs/référentiel
 * d'items par élément déjà résolus côté serveur, plus besoin du catalogue complet).
 * GET /logistics/:spaceId/stock?configId=
 * @returns {Promise<{spaceId, space, configurations, resolvedConfigId, anchor,
 *   elements: Array<{id,name,type,items:Array}>, levels: Array, consumption: Array}>}
 *   levels      = StockLevel [{elementId, itemKey, packedUnits, looseUnits, unitsPerPack, marketPriceId}]
 *   consumption = ventes dérivées depuis la dernière réconciliation [{elementId, itemKey, quantity}]
 *   Attendu affiché = level − consumption (casse de pack côté vue).
 */
export async function getLogisticsStock(spaceId, configId, eventId) {
  const params = {}
  if (configId) params.configId = configId
  if (eventId) params.eventId = eventId
  return api.get(`/logistics/${spaceId}/stock`, { params })
}

/**
 * Market prices candidats pour le dropdown du popup +/− d'une denrée — évite de
 * charger le catalogue complet côté front.
 * GET /logistics/:spaceId/market-prices?itemKey=
 */
export async function getMarketPricesForItem(spaceId, itemKey) {
  if (!itemKey) return []
  return api.get(`/logistics/${spaceId}/market-prices`, { params: { itemKey } })
}

/**
 * Mouvement de stock manuel (popup + / −).
 * POST /logistics/movements
 * @param {object} movement { spaceId, elementId, itemKey, direction:'add'|'remove',
 *   packed, loose, reason:'DELIVERY'|'TRANSFER_SHOP'|'TRANSFER_STORAGE'|'EXPIRY'|'OTHER',
 *   counterpartyElementId?, expiryDate?, note?, marketPriceId?, menuItemId? }
 * @returns {Promise<{movement, level, counterpartyLevel}>}
 */
export async function createStockMovement(movement) {
  return api.post('/logistics/movements', movement)
}

/**
 * BUG-259-02 : confirme un transfert PENDING — crédite la contrepartie (quantités
 * déclarées par défaut, ou modifiées) et clôt la ligne source. Un écart entre
 * déclaré et confirmé est journalisé comme perte (section Réconciliation).
 * POST /logistics/movements/:id/confirm
 * @param {string} movementId ID du StockMovement source (PENDING)
 * @param {{packed?: number, loose?: number}} payload quantités confirmées (omis = déclarées)
 * @returns {Promise<{sourceMovementId, counterpartyLevel, missingPacked, missingLoose, reconciliationId}>}
 */
export async function confirmTransfer(movementId, payload = {}) {
  return api.post(`/logistics/movements/${movementId}/confirm`, payload)
}

/**
 * BUG-259-02 : transferts émis vers cet élément, en attente de confirmation.
 * GET /logistics/element/:elementId/pending-transfers
 * @returns {Promise<Array<{movementId, itemKey, sourceElementId, sourceElementName,
 *   declaredPacked, declaredLoose, createdAt}>>}
 */
export async function getPendingTransfers(elementId) {
  return api.get(`/logistics/element/${elementId}/pending-transfers`)
}

/**
 * Historique d'un PDV/storage : mouvements paginés + ventes agrégées par event.
 * GET /logistics/element/:elementId/history
 */
export async function getElementHistory(elementId, { limit, cursor } = {}) {
  const params = {}
  if (limit) params.limit = limit
  if (cursor) params.cursor = cursor
  return api.get(`/logistics/element/${elementId}/history`, { params })
}

/**
 * Inventory Reset : remplace le stock attendu par les valeurs comptées et fige
 * les écarts dans une réconciliation. Permission front.fb.logisticReconcile.
 * POST /logistics/:spaceId/reset
 * @param {object} payload { eventId?, eventName?, lines: [{elementId, itemKey,
 *   countedPacked, countedLoose, unitsPerPack?}] }
 */
export async function resetLogisticsInventory(spaceId, payload) {
  return api.post(`/logistics/${spaceId}/reset`, payload)
}

/**
 * Liste des réconciliations d'un espace (section Réconciliation).
 * GET /logistics/:spaceId/reconciliations
 */
export async function getReconciliations(spaceId) {
  return api.get(`/logistics/${spaceId}/reconciliations`)
}

/**
 * Export CSV d'une réconciliation — déclenche un téléchargement navigateur.
 * GET /logistics/reconciliations/:id/export
 */
export async function downloadReconciliationCsv(id, filename = 'reconciliation.csv') {
  const csv = await api.get(`/logistics/reconciliations/${id}/export`, { responseType: 'blob' })
  const blob = csv instanceof Blob ? csv : new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * QA — simule une vente Weezevent (crée transaction+items synthétiques marqués
 * isSimulated, consommés par getStock exactement comme une vraie vente). Le PDV
 * et chaque menu item doivent déjà être mappés à Weezevent. Permission
 * front.fb.logisticReconcile. ⚠️ Visible aussi dans les dashboards revenus tant
 * que non purgée (cf. purgeSimulatedSales).
 * POST /logistics/:spaceId/simulate-sale
 * @param {string} spaceId
 * @param {{elementId: string, lines: Array<{menuItemId: string, quantity: number}>}} payload
 * @returns {Promise<{transactionId, elementId, elementName, items, consumptionPreview}>}
 */
export async function simulateSale(spaceId, payload) {
  return api.post(`/logistics/${spaceId}/simulate-sale`, payload)
}

/**
 * QA — purge les ventes simulées d'un PDV (nettoyage post-test).
 * DELETE /logistics/:spaceId/simulate-sale?elementId=
 */
export async function purgeSimulatedSales(spaceId, elementId) {
  return api.delete(`/logistics/${spaceId}/simulate-sale`, { params: { elementId } })
}

/**
 * QA — démarre un run d'auto-simulation côté serveur (BullMQ Job Scheduler) : tire au
 * hasard un PDV/menu item simulable et appelle simulateSale à intervalle régulier,
 * indépendamment de tout onglet navigateur ouvert. Idempotent — renvoie le run déjà
 * actif s'il y en a un pour cet espace.
 * POST /logistics/:spaceId/simulation-runs
 * @param {{intervalMs: number, realMode?: boolean, configId?: string}} payload
 */
export async function startSimulationRun(spaceId, payload) {
  return api.post(`/logistics/${spaceId}/simulation-runs`, payload)
}

/**
 * QA — arrête un run d'auto-simulation actif (retire le Job Scheduler BullMQ).
 * POST /logistics/:spaceId/simulation-runs/:runId/stop
 */
export async function stopSimulationRun(spaceId, runId) {
  return api.post(`/logistics/${spaceId}/simulation-runs/${runId}/stop`)
}

/**
 * QA — run d'auto-simulation actif de l'espace, s'il y en a un (survit au
 * reload/fermeture d'onglet — appelé au montage du widget pour reprendre l'affichage).
 * GET /logistics/:spaceId/simulation-runs/active
 */
export async function getActiveSimulationRun(spaceId) {
  return api.get(`/logistics/${spaceId}/simulation-runs/active`)
}

/**
 * QA — historique des runs d'auto-simulation de l'espace (actifs, arrêtés, échoués).
 * GET /logistics/:spaceId/simulation-runs
 */
export async function getSimulationRuns(spaceId, limit) {
  return api.get(`/logistics/${spaceId}/simulation-runs`, { params: limit ? { limit } : {} })
}

/**
 * QA — historique paginé (curseur) des ventes simulées de l'espace, tous PDV confondus.
 * GET /logistics/:spaceId/simulated-sales
 */
export async function getSimulatedSalesHistory(spaceId, { limit, cursor } = {}) {
  const params = {}
  if (limit) params.limit = limit
  if (cursor) params.cursor = cursor
  return api.get(`/logistics/${spaceId}/simulated-sales`, { params })
}

/**
 * QA — purge sélective de ventes simulées par id de transaction (history dialog).
 * POST /logistics/:spaceId/simulated-sales/purge
 */
export async function purgeSimulatedSalesByIds(spaceId, transactionIds) {
  return api.post(`/logistics/${spaceId}/simulated-sales/purge`, { transactionIds })
}
