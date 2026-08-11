// Estimation 0 — event futur SANS historique comparable (fiche 311_01).
//
// Extrait en util pur pour la testabilité Jest (EventPredictView.vue n'est pas
// importable en test — même précédent que mergeEffectiveMenuConfig →
// utils/menuConfigSelection.js). EventPredictView délègue son computed
// `predictionItemsContext` à `resolveItemsContext` et dérive son éligibilité
// au mode estimation de `isEstimationEligible`.

/**
 * Contexte des listes d'articles des sections Configuration + Stock up.
 * Transcription exacte de l'ancien computed `predictionItemsContext`
 * (priorité descendante, première vraie gagne), plus la règle Estimation 0 :
 * la branche 'not-calculated' (event futur, timeline prédite vide) devient
 * 'ready' quand le mode estimation est actif — la grille PDV × articles se
 * rend alors depuis le Space Menu de la configuration, prédictions à 0.
 *
 * @param {object} p
 * @param {boolean} p.loading          données/scoring en cours
 * @param {boolean} p.hasConfigShops   config présente avec ≥1 point de vente
 * @param {boolean} p.assignmentMissing assignation tentée mais 0 item assigné
 * @param {boolean} p.isPastEvent      event sélectionné passé
 * @param {boolean} p.timelineEmpty    activeTimelineData vide
 * @param {boolean} p.estimationActive mode Estimation 0 actif
 * @returns {'loading'|'no-config'|'no-mapping'|'not-calculated'|'ready'}
 */
export function resolveItemsContext({
  loading,
  hasConfigShops,
  assignmentMissing,
  isPastEvent,
  timelineEmpty,
  estimationActive,
}) {
  if (loading) return 'loading'
  if (!hasConfigShops) return 'no-config'
  if (assignmentMissing) return 'no-mapping'
  if (!isPastEvent && timelineEmpty) {
    return estimationActive ? 'ready' : 'not-calculated'
  }
  return 'ready'
}

/**
 * Éligibilité au mode Estimation 0 : event FUTUR sans timeline prédite, avec
 * l'assignation Space Menu chargée ET non vide (sinon 'no-mapping' garde
 * priorité et route vers Space Menus) et ≥1 shop réel dans la config.
 * Le gate `assignmentLoaded` évite de forcer 'ready' avant le chargement de
 * l'assignation (sinon getGroupedMenuItems retomberait sur le catalogue
 * complet, flash trompeur).
 *
 * @param {object} p
 * @param {boolean} p.isPastEvent
 * @param {boolean} p.timelineEmpty
 * @param {boolean} p.assignmentLoaded  loadShopMenuAssignment terminé
 * @param {boolean} p.assignmentMissing 0 item assigné sur toute la config
 * @param {number}  p.configShopCount   configShopElements.length
 * @returns {boolean}
 */
export function isEstimationEligible({
  isPastEvent,
  timelineEmpty,
  assignmentLoaded,
  assignmentMissing,
  configShopCount,
}) {
  return (
    !isPastEvent &&
    !!timelineEmpty &&
    !!assignmentLoaded &&
    !assignmentMissing &&
    Number(configShopCount) > 0
  )
}
