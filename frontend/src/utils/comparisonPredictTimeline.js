/**
 * comparisonPredictTimeline : courbe minute par minute d'un event comparé en mode Predict
 * (retour Bertrand 2026-11-10 : « montrer la timeline quand un seul event est sélectionné »).
 * Fonction pure.
 *
 * Source : la courbe prédite figée dans la version Event Predict (predictedTimeline), déjà
 * AJUSTÉE par les % du curseur à la sauvegarde. Il n'existe pas de courbe brute de l'algo :
 * en base « algo » on garde donc les barres. Une seule valeur par minute (pas de découpage
 * Menu / Shop). Versions antérieures à la colonne : pas de courbe, barres conservées.
 */
import { hasPredictedTimeline, snapshotToBackgroundRows } from '@/utils/predictedTimelineSnapshot'
import { normalizePredictBasis } from '@/utils/comparisonPredictBasis'

/**
 * @param {Object} p
 * @param {boolean} p.isPredict
 * @param {Array<object>} p.events  events du rapport (Predict : ceux qui ont un scénario)
 * @param {Map<string, object|null>} p.versionByEventId  version retenue par event
 * @param {string} [p.basis]  'adjusted' | 'algo'
 * @returns {{ event: object, rows: Array<object> } | null}  null = rester sur les barres
 */
export function pickPredictTimeline({ isPredict, events, versionByEventId, basis }) {
  if (!isPredict || normalizePredictBasis(basis) !== 'adjusted') return null
  const list = Array.isArray(events) ? events : []
  if (list.length !== 1) return null
  const event = list[0]
  const version = versionByEventId?.get(event?.id)
  if (!version || !hasPredictedTimeline(version.predictedTimeline)) return null
  const rows = snapshotToBackgroundRows(version.predictedTimeline)
  return rows.length ? { event, rows } : null
}
