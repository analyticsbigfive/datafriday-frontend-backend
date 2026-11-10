/**
 * comparisonPredictBasis : base de la comparaison Predict (retour Bertrand 2026-11-10).
 *   - 'adjusted' (défaut) : version sauvegardée AVEC les ajustements % d'Event Predict
 *     (quantityAdjustments), c'est le chiffre validé par l'utilisateur.
 *   - 'algo' : prédiction brute de l'algorithme, sans le % du curseur.
 * Fonctions pures.
 *
 * Les predictedRecords persistés portent les quantités brutes de l'algo, SAUF les lignes
 * manuelles (isManual) qui portent déjà leur quantité finale : on ne leur réapplique jamais
 * le % (même règle que stockPlanning.isManualOnlyForElement, fiche 311_02).
 */

export const PREDICT_BASES = ['adjusted', 'algo']
export const DEFAULT_PREDICT_BASIS = 'adjusted'

export const normalizePredictBasis = (v) => (PREDICT_BASES.includes(v) ? v : DEFAULT_PREDICT_BASIS)

const round2 = (n) => Math.round(n * 100) / 100

function adjustmentPercent(adjustments, record) {
  const raw = adjustments?.[`${record.shopId}-${record.menuItemId}`]
  const n = Number(raw)
  return raw == null || !Number.isFinite(n) || n < 0 ? 100 : n
}

/**
 * Version dont les predictedRecords sont mis à l'échelle par quantityAdjustments.
 * Ne mute pas l'entrée. Sans ajustement applicable, renvoie la version telle quelle.
 */
export function applyQuantityAdjustments(version) {
  const records = Array.isArray(version?.predictedRecords) ? version.predictedRecords : []
  const adjustments = version?.quantityAdjustments
  if (!records.length || !adjustments || !Object.keys(adjustments).length) return version
  let changed = false
  const scaled = records.map((r) => {
    if (!r || r.isManual === true) return r
    const pct = adjustmentPercent(adjustments, r)
    if (pct === 100) return r
    changed = true
    const f = pct / 100
    return {
      ...r,
      totalQuantity: round2((Number(r.totalQuantity) || 0) * f),
      totalRevenue: round2((Number(r.totalRevenue) || 0) * f),
    }
  })
  return changed ? { ...version, predictedRecords: scaled } : version
}

/** Version à utiliser selon la base choisie ('algo' : inchangée, 'adjusted' : ajustée). */
export function versionForBasis(version, basis) {
  if (!version) return version
  return normalizePredictBasis(basis) === 'adjusted' ? applyQuantityAdjustments(version) : version
}
