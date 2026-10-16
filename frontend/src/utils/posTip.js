// Pourboire (PLAN décision 14) : saisi par paiement, HORS chiffre d'affaires et HORS TVA,
// porté par le DERNIER paiement du ticket. Choix : aucun, un pourcentage du total, un montant.

export const POS_TIP_NONE = { kind: 'none' }
/** Pourcentages proposés en un geste. Liste de présentation, pas une règle métier. */
export const POS_TIP_PERCENT_PRESETS = [5, 10]

export const tipPercent = (value) => ({ kind: 'percent', value })
export const tipAmount = (cents) => ({ kind: 'amount', cents })

export function isSameTipChoice(a, b) {
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'percent') return a.value === b.value
  if (a.kind === 'amount') return a.cents === b.cents
  return true
}

/**
 * Pourboire en centimes pour un total TTC. Zéro si les pourboires sont désactivés pour
 * l'évènement ou si le ticket n'est pas positif (une déconsigne ne porte pas de pourboire).
 */
export function computeTipCents(totalCents, choice, enabled = true) {
  if (!enabled || !(totalCents > 0) || !choice) return 0
  if (choice.kind === 'percent') return Math.max(0, Math.round((totalCents * (Number(choice.value) || 0)) / 100))
  if (choice.kind === 'amount') return Math.max(0, Math.round(Number(choice.cents) || 0))
  return 0
}

/** Reporte le pourboire sur le dernier paiement ; les autres restent à 0. */
export function attachTipToLastPayment(payments, tipCents) {
  return payments.map((payment, index) => ({ ...payment, tipCents: index === payments.length - 1 ? tipCents : 0 }))
}
