import { api } from '../client'

/**
 * Référentiel « Moyens de paiement » (Configuration > Moyens de paiement).
 * Lecture ouverte au tenant, écriture sous menu.config.manage. Espèces et Carte sont créés à la
 * demande par le serveur (isSystem : se désactivent, ne se suppriment pas).
 */

/** Liste complète, actifs et inactifs, triée. @returns {Promise<import('./pos.contracts').PosPaymentMethod[]>} */
export async function getPaymentMethods() {
  try {
    const res = await api.get('/payment-methods')
    return Array.isArray(res) ? res : (res?.data ?? [])
  } catch (error) {
    console.error('[PaymentMethods API] Error fetching payment methods:', error)
    throw error
  }
}

/** @param {{ name: string, kind: string, active?: boolean, sortOrder?: number }} payload */
export async function createPaymentMethod(payload) {
  try {
    return await api.post('/payment-methods', payload)
  } catch (error) {
    console.error('[PaymentMethods API] Error creating payment method:', error)
    throw error
  }
}

/** @param {{ name?: string, kind?: string, active?: boolean, sortOrder?: number }} payload */
export async function updatePaymentMethod(id, payload) {
  try {
    return await api.patch(`/payment-methods/${id}`, payload)
  } catch (error) {
    console.error('[PaymentMethods API] Error updating payment method:', error)
    throw error
  }
}

export async function deletePaymentMethod(id) {
  try {
    return await api.delete(`/payment-methods/${id}`)
  } catch (error) {
    console.error('[PaymentMethods API] Error deleting payment method:', error)
    throw error
  }
}
