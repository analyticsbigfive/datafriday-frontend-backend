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

// ---- Sliders fan-out ABSOLUS (mode estimation, fiche 311_02) ----
// En mode Estimation 0 la base prédite est 0 partout : un slider % (base × %)
// ne peut rien produire. Les sliders shop/article deviennent donc des sliders
// de QUANTITÉ ABSOLUE qui écrivent directement `manualQuantities`.

/**
 * Valeur commune d'un ensemble de valeurs numériques (affichage d'un slider
 * fan-out) : LA valeur si toutes identiques, sinon null (« Mixed »).
 *
 * @param {Array<number|string>} values
 * @returns {number|null}
 */
export function uniformValue(values) {
  const set = new Set((values || []).map((v) => Number(v) || 0))
  return set.size === 1 ? [...set][0] : null
}

/**
 * Fan-out d'une quantité manuelle absolue : pose `units` (entier ≥ 0, arrondi)
 * sur chaque clé `${elementId}-${menuItemId}` fournie. Retourne un NOUVEL
 * objet (les props Vue ne se mutent pas).
 *
 * @param {Object<string, number>} current  manualQuantities courant
 * @param {string[]} pairKeys               clés `${elementId}-${menuItemId}`
 * @param {number|string} units             quantité à poser (valeur d'input possible)
 * @returns {Object<string, number>}
 */
export function applyFanoutQuantity(current, pairKeys, units) {
  const u = Math.max(0, Math.round(Number(units) || 0))
  const next = { ...(current || {}) }
  for (const k of pairKeys || []) next[k] = u
  return next
}

/**
 * Répartition d'un TOTAL sur un ensemble de couples (BUG-316-01) : le slider
 * « par article » représente désormais le total de l'article, réparti
 * équitablement sur les PDV cochés — et non plus la même valeur dupliquée sur
 * chacun (129 saisis donnaient 129 × N shops dans le Stock up).
 * Équiréparti au plus juste : base = floor(total/n), les `total % n` premières
 * clés (ordre d'entrée) reçoivent +1 — la somme vaut STRICTEMENT le total.
 * Retourne un NOUVEL objet (les props Vue ne se mutent pas).
 *
 * @param {Object<string, number>} current  manualQuantities courant
 * @param {string[]} pairKeys               clés `${elementId}-${menuItemId}`
 * @param {number|string} total             quantité TOTALE à répartir
 * @returns {Object<string, number>}
 */
export function splitQuantityAcrossKeys(current, pairKeys, total) {
  const keys = pairKeys || []
  const next = { ...(current || {}) }
  if (!keys.length) return next
  const t = Math.max(0, Math.round(Number(total) || 0))
  const base = Math.floor(t / keys.length)
  const remainder = t % keys.length
  keys.forEach((k, i) => {
    next[k] = base + (i < remainder ? 1 : 0)
  })
  return next
}

/**
 * Plafond effectif d'un slider absolu : l'échelle choisie par l'utilisateur
 * (champ « échelle max », défaut 1000), étendue par la valeur courante — une
 * valeur déjà posée au-delà de l'échelle ne doit pas casser le curseur
 * (parité `manualSliderMax`, fiche 311_01).
 *
 * @param {number|string} scaleMax     échelle choisie (champ number)
 * @param {number|string} currentValue plus grande valeur courante du fan-out
 * @param {number} [fallback=1000]     échelle par défaut / saisie invalide
 * @returns {number}
 */
export function estimationSliderMax(scaleMax, currentValue, fallback = 1000) {
  const scale = Number(scaleMax) > 0 ? Number(scaleMax) : fallback
  return Math.max(scale, Number(currentValue) || 0)
}
