// Sauvegarde automatique du plan de Réarmement au clic sur « Générer la Commande ».
// Logique pure (testable sans composant).

/** Délai (ms) avant l'enregistrement automatique des corrections de l'étape 2. */
export const PLAN_CORRECTIONS_DEBOUNCE_MS = 1500

/**
 * Que faire après la génération ?
 * - 'none'   : pas de droit d'écriture (ou plans indisponibles) → génération seule.
 * - 'update' : un plan est en cours de modification → PATCH de ce plan.
 * - 'create' : sinon, création d'un nouveau plan au nom par défaut.
 */
export function planAutosaveAction({ canWrite, plansAvailable, editingPlanId } = {}) {
  if (!canWrite || plansAvailable === false) return 'none'
  return editingPlanId ? 'update' : 'create'
}

/** Nom par défaut : libellé du premier événement sélectionné ('' si aucun). */
export function defaultPlanName(events, labelFn) {
  const list = Array.isArray(events) ? events : []
  if (!list.length) return ''
  const label = typeof labelFn === 'function' ? labelFn(list[0]) : ''
  return String(label || '').trim()
}
