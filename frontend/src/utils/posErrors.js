// Lecture des erreurs de la caisse. Le serveur répond `{ code, message }` (POS_ERROR_CODES) ;
// une absence de réponse signale un problème réseau.

import { POS_ERROR_CODES } from '@/api/endpoints/pos.contracts'

export function posErrorCode(error) {
  return error?.response?.data?.code ?? error?.code ?? null
}

export function isNetworkError(error) {
  return !!error && !error.response
}

/**
 * Un envoi qu'il vaut la peine de rejouer : réseau coupé, délai dépassé, serveur en difficulté.
 * Le serveur est idempotent sur clientTicketId, rejouer ne duplique jamais la vente.
 * Une erreur 4xx métier (moyen désactivé, évènement terminé...) ne se rejoue pas.
 */
export function isRetryableSendError(error) {
  if (isNetworkError(error)) return true
  const status = error.response.status
  return status >= 500 || status === 408 || status === 429
}

const KEY_BY_CODE = {
  [POS_ERROR_CODES.EVENT_NOT_SELLABLE]: 'guestPosErrorEventEnded',
  [POS_ERROR_CODES.PDV_STOPPED]: 'guestPosErrorStopped',
  [POS_ERROR_CODES.PDV_NOT_IN_EVENT_CONFIG]: 'guestPosErrorNotInConfig',
  [POS_ERROR_CODES.ITEM_NOT_ON_PDV]: 'guestPosErrorItemNotOnPdv',
  [POS_ERROR_CODES.PAYMENT_METHOD_DISABLED]: 'guestPosErrorPaymentDisabled',
  [POS_ERROR_CODES.CANCEL_DISABLED]: 'guestPosErrorCancelDisabled',
  [POS_ERROR_CODES.VENDOR_NAME_REQUIRED]: 'guestPosErrorVendorRequired',
  [POS_ERROR_CODES.EMPTY_TICKET]: 'guestPosErrorEmptyTicket',
  [POS_ERROR_CODES.INVALID_LINE]: 'guestPosErrorInvalidLine',
  [POS_ERROR_CODES.PAYMENT_MISMATCH]: 'guestPosErrorPaymentMismatch',
  [POS_ERROR_CODES.TICKET_CONFLICT]: 'guestPosErrorTicketConflict',
  [POS_ERROR_CODES.TIPS_DISABLED]: 'guestPosErrorTipsDisabled',
  [POS_ERROR_CODES.INVALID_TIP]: 'guestPosErrorInvalidTip',
}

/** Clé de traduction du message à afficher pour une erreur de caisse. */
export function posErrorMessageKey(error) {
  if (isNetworkError(error)) return 'guestPosErrorNetwork'
  return KEY_BY_CODE[posErrorCode(error)] || 'guestPosErrorGeneric'
}

/**
 * Erreur produite par la caisse elle-même (avant tout appel serveur), au même format qu'une
 * réponse `{ code, message }` pour que l'interface la traite comme une erreur serveur.
 */
export function createLocalPosError(code, message = code) {
  const error = new Error(message)
  error.response = { status: 400, data: { code, message } }
  return error
}
