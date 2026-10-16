// Calculs du ticket en cours : lignes, total TTC, TVA contenue, compteurs par catégorie,
// corps de la requête de vente. Pur et sans état : testable sans Vue ni store.

import { toCents, toEuros } from './posMoney'

/** Montant TTC d'une ligne en centimes. */
export const lineTotalCents = (unitPriceCents, quantity) => Math.round(unitPriceCents * quantity)

/** TVA contenue dans un montant TTC (même formule que le serveur), en centimes. */
export function vatOfCents(totalCents, vatRate) {
  const rate = Number(vatRate) || 0
  if (rate <= 0) return 0
  return Math.round(totalCents - totalCents / (1 + rate / 100))
}

/**
 * Lignes du ticket depuis le panier `{ [menuItemId]: quantité }`, dans l'ordre du catalogue.
 * Un article absent du catalogue (retiré entre-temps) est ignoré.
 */
export function buildTicketLines(cart, items) {
  const lines = []
  for (const item of items || []) {
    const quantity = cart?.[item.menuItemId] || 0
    if (quantity <= 0) continue
    const unitCents = toCents(item.unitPrice)
    const originalCents = item.originalUnitPrice != null ? toCents(item.originalUnitPrice) : null
    lines.push({
      menuItemId: item.menuItemId,
      name: item.name,
      quantity,
      unitCents,
      originalUnitCents: originalCents,
      vatRate: Number(item.vatRate) || 0,
      totalCents: lineTotalCents(unitCents, quantity),
    })
  }
  return lines
}

export function ticketTotals(lines) {
  const totalCents = lines.reduce((sum, line) => sum + line.totalCents, 0)
  const vatCents = lines.reduce((sum, line) => sum + vatOfCents(line.totalCents, line.vatRate), 0)
  return { totalCents, vatCents }
}

/** Nombre d'unités au panier par catégorie : `{ [categoryId]: n }`. */
export function cartCountsByCategory(cart, items) {
  const counts = {}
  for (const item of items || []) {
    const quantity = cart?.[item.menuItemId] || 0
    if (quantity > 0) counts[item.categoryId] = (counts[item.categoryId] || 0) + quantity
  }
  return counts
}

/**
 * Lignes et paiements au format du contrat POST guest-pin/pos/sales (l'identifiant du ticket et
 * l'horodatage sont ajoutés par posOutbox). `payments` : `[{ paymentMethodId, amountCents, tipCents }]`.
 * Les lignes ne portent que menuItemId et quantité : prix et TVA sont recalculés par le serveur.
 */
export function buildSalePayload({ lines, payments }) {
  return {
    lines: lines.map((line) => ({ menuItemId: line.menuItemId, quantity: line.quantity })),
    payments: payments.map((payment) => {
      const body = { paymentMethodId: payment.paymentMethodId, amountTtc: toEuros(payment.amountCents) }
      if (payment.tipCents > 0) body.tipTtc = toEuros(payment.tipCents)
      return body
    }),
  }
}

/**
 * Ligne d'historique provisoire (forme PosSaleRow) affichée tant que le serveur n'a pas confirmé
 * la vente : numéro provisoire, copie des noms de moyens de paiement, `syncStatus: 'pending'`.
 */
export function buildSalePreview({ clientTicketId, ticketNumber, vendorName, pdvName, lines, payments, methodsById, totalCents, vatCents, createdAt }) {
  const tipCents = payments.reduce((sum, payment) => sum + (payment.tipCents || 0), 0)
  return {
    id: null,
    clientTicketId,
    ticketNumber,
    createdAt,
    pdvName: pdvName || '',
    vendorName: vendorName || '',
    payments: payments.map((payment) => {
      const method = methodsById[payment.paymentMethodId] || {}
      return {
        paymentMethodId: payment.paymentMethodId,
        name: method.name || '',
        kind: method.kind || 'other',
        amountTtc: toEuros(payment.amountCents),
        tipTtc: toEuros(payment.tipCents || 0),
      }
    }),
    tipTotal: toEuros(tipCents),
    totalTtc: toEuros(totalCents),
    vatTotal: toEuros(vatCents),
    cancelled: false,
    syncStatus: 'pending',
    lines: lines.map((line) => ({
      menuItemId: line.menuItemId,
      name: line.name,
      quantity: line.quantity,
      unitPrice: toEuros(line.unitCents),
      totalTtc: toEuros(line.totalCents),
      vatRate: line.vatRate,
    })),
  }
}
