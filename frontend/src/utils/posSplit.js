// Partage de l'addition (PLAN décision 13) : un ticket se paie en 1 à 10 paiements, moyens
// mélangés possibles. Deux modes : N parts égales (centimes restants sur la dernière part) et
// montant par montant avec un reste à payer. Tout en centimes entiers.

export const POS_SPLIT_MIN_PARTS = 2
export const POS_SPLIT_MAX_PARTS = 10
/** Montants proposés en un geste en mode « montant par montant » (présentation, pas une règle métier). */
export const POS_AMOUNT_PRESETS_CENTS = [500, 1000, 2000]
/** Plafond de paiements par ticket (miroir du contrat serveur : 1 à 10). */
export const POS_MAX_PAYMENTS = 10

export function clampSplitCount(n) {
  const value = Math.round(Number(n))
  if (!Number.isFinite(value)) return POS_SPLIT_MIN_PARTS
  return Math.min(POS_SPLIT_MAX_PARTS, Math.max(POS_SPLIT_MIN_PARTS, value))
}

/**
 * N parts égales d'un total en centimes : chaque part vaut floor(total / N), la dernière
 * absorbe les centimes restants (34 € en 3 = 11,33 + 11,33 + 11,34). Total positif requis.
 */
export function equalParts(totalCents, count) {
  const total = Math.round(Number(totalCents) || 0)
  const n = clampSplitCount(count)
  if (total <= 0) return []
  const base = Math.floor(total / n)
  return Array.from({ length: n }, (_, index) => (index === n - 1 ? total - base * (n - 1) : base))
}

/** Somme des montants déjà affectés (lignes `{ amountCents }`). */
export function paidCents(lines) {
  return (lines || []).reduce((sum, line) => sum + (Number(line.amountCents) || 0), 0)
}

/** Reste à payer : total moins les paiements saisis (jamais négatif pour un ticket positif). */
export function remainingToPay(totalCents, lines) {
  return Math.round(Number(totalCents) || 0) - paidCents(lines)
}

/** Un montant saisi ne peut pas dépasser le reste à payer ; renvoie 0 si plus rien à payer. */
export function clampToRemaining(amountCents, remainingCents) {
  if (remainingCents <= 0) return 0
  return Math.max(0, Math.min(Math.round(Number(amountCents) || 0), remainingCents))
}

/** Peut-on ajouter un paiement de plus (plafond de 10 paiements par ticket) ? */
export function canAddPayment(lines) {
  return (lines || []).length < POS_MAX_PAYMENTS
}

/**
 * Encaisser n'est actif que lorsque le reste à payer est nul (et qu'il y a au moins un paiement).
 * En parts égales le reste est nul par construction.
 */
export function canConfirmSplit({ mode, totalCents, lines }) {
  if (!(totalCents > 0)) return false
  if (mode === 'equal') return true
  return (lines || []).length > 0 && remainingToPay(totalCents, lines) === 0
}
