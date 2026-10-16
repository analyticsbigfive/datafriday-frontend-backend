// API invité de la caisse POS (phase `pos`, cf. store/modules/guestPos.js).
// Le jeton invité est celui posé par store/modules/guestPin.js au login (setAccessToken sur
// l'instance Axios unique) : aucun en-tête d'autorisation à gérer ici. Le périmètre (PdV,
// évènement) vient du jeton, jamais de la requête. Types : api/endpoints/pos.contracts.js.
import api from '../client'
import { guestDeviceHeaders } from '@/utils/guestDeviceId'

/** Catalogue de la caisse : articles du PdV, prix, promos, TVA, disponibilité, moyens de paiement, réglages. */
export async function getGuestPosCatalog() {
  const response = await api.get('/guest-pin/pos/catalog')
  return response.data
}

/**
 * Encaisse un ticket. Idempotent sur `body.clientTicketId` : un rejeu renvoie la vente avec
 * `replayed: true`. `suppressGlobalError` : les échecs réseau sont gérés par la file d'envoi
 * (posOutbox) et signalés par le témoin « Hors ligne », pas par une notification globale.
 */
export async function createGuestPosSale(body) {
  const response = await api.post('/guest-pin/pos/sales', body, {
    headers: guestDeviceHeaders(),
    suppressGlobalError: true,
  })
  return response.data
}

export async function cancelGuestPosSale(saleId) {
  const response = await api.post(`/guest-pin/pos/sales/${encodeURIComponent(saleId)}/cancel`, {})
  return response.data
}

export async function restoreGuestPosSale(saleId) {
  const response = await api.post(`/guest-pin/pos/sales/${encodeURIComponent(saleId)}/restore`, {})
  return response.data
}

/** Historique du PdV : `{ rows, nextCursor, totals }`. Filtres serveur optionnels : paymentMethodId, search, cursor, limit. */
export async function listGuestPosSales(params = {}) {
  const response = await api.get('/guest-pin/pos/sales', { params })
  return response.data
}

/** Récapitulatif de clôture du PdV. */
export async function getGuestPosClosing() {
  const response = await api.get('/guest-pin/pos/closing')
  return response.data
}
