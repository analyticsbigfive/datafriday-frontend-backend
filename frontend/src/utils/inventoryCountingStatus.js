// Statut de comptage d'un PDV / stockage sur les écrans d'inventaire.
//
// Document Bertrand « Pre et Post event Inventory cycle » (2026-10-06, pages 5 à 8) :
// trois états au lieu de deux, une pastille rouge / orange / verte à droite de
// « x / y articles », et un filtre « En cours de comptage » en plus de « À compter »
// et « Comptés ». Purs : aucun Vuex, aucun Vuetify.

export const COUNTING_STATUS_TO_COUNT = 'to-count'
export const COUNTING_STATUS_IN_PROGRESS = 'in-progress'
export const COUNTING_STATUS_COUNTED = 'counted'

/** Ordre d'affichage dans le menu de filtre. */
export const COUNTING_STATUS_VALUES = Object.freeze([
  COUNTING_STATUS_TO_COUNT,
  COUNTING_STATUS_IN_PROGRESS,
  COUNTING_STATUS_COUNTED,
])

/** Filtre par défaut : tout ce qui n'est pas terminé, comme l'ancien onglet
 *  « À compter » qui gardait aussi les PDV partiellement comptés. */
export const DEFAULT_COUNTING_STATUSES = Object.freeze([
  COUNTING_STATUS_TO_COUNT,
  COUNTING_STATUS_IN_PROGRESS,
])

/** Clés i18n des libellés de statut. */
export const COUNTING_STATUS_LABEL_KEYS = Object.freeze({
  [COUNTING_STATUS_TO_COUNT]: 'invStatusToCount',
  [COUNTING_STATUS_IN_PROGRESS]: 'invStatusInProgress',
  [COUNTING_STATUS_COUNTED]: 'invStatusCounted',
})

/**
 * Statut d'un élément d'après son avancement. Un élément sans article reste
 * « à compter » : il n'y a rien à y terminer.
 * @param {number} total articles de l'élément
 * @param {number} counted articles marqués comptés
 */
export function countingStatusOf(total, counted) {
  const t = Number(total) || 0
  const c = Number(counted) || 0
  if (t > 0 && c >= t) return COUNTING_STATUS_COUNTED
  if (c > 0) return COUNTING_STATUS_IN_PROGRESS
  return COUNTING_STATUS_TO_COUNT
}

/** Un statut passe-t-il le filtre ? Filtre vide = aucun filtre (tout passe). */
export function matchesCountingStatuses(status, selected) {
  if (!Array.isArray(selected) || selected.length === 0) return true
  return selected.includes(status)
}

/** Le filtre diffère-t-il du filtre par défaut (ordre indifférent) ? */
export function isDefaultCountingStatuses(selected) {
  const s = Array.isArray(selected) ? selected : []
  return s.length === DEFAULT_COUNTING_STATUSES.length
    && DEFAULT_COUNTING_STATUSES.every((v) => s.includes(v))
}

/** Couleur Vuetify de la barre de progression, alignée sur la pastille. */
export function countingStatusColor(status) {
  if (status === COUNTING_STATUS_COUNTED) return 'success'
  if (status === COUNTING_STATUS_IN_PROGRESS) return 'warning'
  return 'grey'
}
