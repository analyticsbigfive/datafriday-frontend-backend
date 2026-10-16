// Montants de la caisse POS. Tous les calculs se font en CENTIMES entiers (aucune dérive
// flottante sur les parts égales ni sur le reste à payer) ; l'API parle en euros (2 décimales).

/** Euros (API) vers centimes entiers. */
export function toCents(euros) {
  const value = Number(euros)
  return Number.isFinite(value) ? Math.round(value * 100) : 0
}

/** Centimes entiers vers euros (2 décimales), pour le corps des requêtes. */
export function toEuros(cents) {
  return Math.round(Number(cents) || 0) / 100
}

/** « 11,33 € » (espace insécable), signe moins devant pour une déconsigne. Aucune devise figée côté logique. */
export function formatCents(cents, currencySymbol = '€') {
  const value = Math.round(Number(cents) || 0)
  const sign = value < 0 ? '-' : ''
  return `${sign}${(Math.abs(value) / 100).toFixed(2).replace('.', ',')} ${currencySymbol}`
}

/**
 * Montant saisi au clavier (« 2 », « 2,5 », « 2.50 ») vers des centimes, ou null si invalide.
 * Refuse les négatifs : un pourboire ou un montant partiel est toujours positif.
 */
export function parseAmountInput(text) {
  if (text == null) return null
  const cleaned = String(text).trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null
  return Math.round(parseFloat(cleaned) * 100)
}
