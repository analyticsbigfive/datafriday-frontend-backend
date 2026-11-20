// Event Predict, section Configuration : état « PdV coupé » (slider à 0 %).
//
// Extrait en util pur pour la testabilité Jest (EventPredictMenusSection.vue
// n'est pas importable en test, même précédent que utils/estimationMode.js).

/**
 * Un point de vente est « coupé » quand son slider d'ajustement vaut 0 %.
 * La carte est alors grisée et le tiroir de détail inaccessible, jusqu'à ce
 * que le slider repasse au-dessus de 0.
 *
 * Mode Estimation 0 exclu : le slider y est ABSOLU (unités) et 0 est l'état de
 * départ normal, griser la carte empêcherait de commencer la saisie.
 *
 * @param {number|null|undefined} adjustmentPct valeur du slider PdV (en %)
 * @param {boolean} estimationActive mode Estimation 0 actif
 * @returns {boolean}
 */
export function isShopSwitchedOff(adjustmentPct, estimationActive = false) {
  if (estimationActive) return false
  if (typeof adjustmentPct !== 'number' || Number.isNaN(adjustmentPct)) return false
  return adjustmentPct <= 0
}
