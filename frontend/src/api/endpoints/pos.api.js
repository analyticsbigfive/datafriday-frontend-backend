import apiClient, { api } from '../client'

/**
 * Client staff du POS (outil du workspace, permission front.fb.pos).
 * Contrats : api/endpoints/pos.contracts.js (miroir de backend/src/features/pos/pos.contracts.ts).
 * Les routes start/stop/start-all/stop-all/reset-pin sont servies par pos-admin.controller,
 * le reste par pos-config.controller.
 */

const base = (spaceId, eventId) => `/pos/${spaceId}/events/${eventId}`

/**
 * Personnes RH actives proposables comme responsable de caisse (id, prénom, nom).
 * Ouvert avec front.fb.pos, contrairement à GET /hr/persons qui exige menu.hr.manage.
 */
export async function getPosHrPersons() {
  try {
    return await api.get('/pos/hr-persons')
  } catch (error) {
    console.error('[POS API] Error fetching HR persons:', error)
    throw error
  }
}

/** Évènements en cours et à venir de l'espace. @returns {Promise<import('./pos.contracts').PosEventListItem[]>} */
export async function getPosEvents(spaceId) {
  try {
    return await api.get(`/pos/${spaceId}/events`)
  } catch (error) {
    console.error('[POS API] Error fetching events:', error)
    throw error
  }
}

/** PdV, réglages et KPI d'un évènement. @returns {Promise<import('./pos.contracts').PosEventDetail>} */
export async function getPosEventDetail(spaceId, eventId) {
  try {
    return await api.get(base(spaceId, eventId))
  } catch (error) {
    console.error('[POS API] Error fetching event detail:', error)
    throw error
  }
}

/** ▶ d'un PdV. @returns {Promise<import('./pos.contracts').PosAccessStatus>} */
export async function startPosPdv(spaceId, eventId, elementId) {
  try {
    return await api.post(`${base(spaceId, eventId)}/pdv/${elementId}/start`)
  } catch (error) {
    console.error('[POS API] Error starting PdV:', error)
    throw error
  }
}

/** ■ d'un PdV. @returns {Promise<import('./pos.contracts').PosAccessStatus>} */
export async function stopPosPdv(spaceId, eventId, elementId) {
  try {
    return await api.post(`${base(spaceId, eventId)}/pdv/${elementId}/stop`)
  } catch (error) {
    console.error('[POS API] Error stopping PdV:', error)
    throw error
  }
}

/** Nouveau PIN d'un PdV (permission front.fb.posManage). */
export async function resetPosPdvPin(spaceId, eventId, elementId) {
  try {
    return await api.post(`${base(spaceId, eventId)}/pdv/${elementId}/reset-pin`)
  } catch (error) {
    console.error('[POS API] Error resetting PIN:', error)
    throw error
  }
}

/** @returns {Promise<import('./pos.contracts').PosBulkResult>} */
export async function startAllPosPdv(spaceId, eventId) {
  try {
    return await api.post(`${base(spaceId, eventId)}/start-all`)
  } catch (error) {
    console.error('[POS API] Error starting all PdV:', error)
    throw error
  }
}

/** @returns {Promise<import('./pos.contracts').PosBulkResult>} */
export async function stopAllPosPdv(spaceId, eventId) {
  try {
    return await api.post(`${base(spaceId, eventId)}/stop-all`)
  } catch (error) {
    console.error('[POS API] Error stopping all PdV:', error)
    throw error
  }
}

/** Responsable RH d'une caisse (null = aucun). */
export async function updatePosPdvResponsible(spaceId, eventId, elementId, responsibleHrPersonId) {
  try {
    return await api.put(`${base(spaceId, eventId)}/pdv/${elementId}`, { responsibleHrPersonId })
  } catch (error) {
    console.error('[POS API] Error updating PdV responsible:', error)
    throw error
  }
}

/**
 * Réglages de caisse de l'évènement. `lowStockUnits` et `tipsEnabled` sont optionnels côté
 * serveur (absent = valeur conservée).
 * @param {import('./pos.contracts').PosEventSetting} settings
 */
export async function updatePosEventSettings(spaceId, eventId, settings) {
  try {
    return await api.put(`${base(spaceId, eventId)}/settings`, settings)
  } catch (error) {
    console.error('[POS API] Error updating settings:', error)
    throw error
  }
}

/**
 * Historique des ventes, pagination par curseur.
 * @param {{ elementId?: string, paymentMethodId?: string, search?: string, cursor?: string, limit?: number }} [query]
 * @returns {Promise<import('./pos.contracts').PosSalesPage>}
 */
export async function getPosSales(spaceId, eventId, query = {}) {
  try {
    return await api.get(`${base(spaceId, eventId)}/sales`, { params: cleanParams(query) })
  } catch (error) {
    console.error('[POS API] Error fetching sales:', error)
    throw error
  }
}

/** Export CSV (séparateur ;, BOM UTF-8), mêmes filtres que l'historique. @returns {Promise<Blob>} */
export async function exportPosSalesCsv(spaceId, eventId, query = {}) {
  try {
    const { cursor, limit, ...filters } = query
    const response = await apiClient.get(`${base(spaceId, eventId)}/sales/export`, {
      params: cleanParams(filters),
      responseType: 'blob',
    })
    return response.data
  } catch (error) {
    console.error('[POS API] Error exporting sales:', error)
    throw error
  }
}

function cleanParams(query) {
  const params = {}
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params[key] = value
  })
  return params
}
