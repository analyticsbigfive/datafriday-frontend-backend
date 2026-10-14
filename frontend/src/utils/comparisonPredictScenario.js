/**
 * comparisonPredictScenario : choix du scénario Event Predict d'un event pour le
 * rapport de comparaison de type Predict (décision 1 du SPEC). Fonctions pures.
 */

/** Horodatage d'une version (updatedAt/timestamp/createdAt), 0 si illisible. */
function versionTime(v) {
  const t = Date.parse(v?.timestamp || v?.updatedAt || v?.createdAt || '')
  return Number.isFinite(t) ? t : 0
}

/**
 * Scénario retenu : version ACTIVE (choisie dans Event Predict) si elle existe encore,
 * sinon version par DÉFAUT (isDefault), sinon la plus récente. null si aucune version.
 * @param {Array<object>} versions  versions de l'event (API predict-versions)
 * @param {{ activeVersionId?: string|null }} [opts]
 */
export function pickScenarioVersion(versions, { activeVersionId = null } = {}) {
  const list = Array.isArray(versions) ? versions.filter(Boolean) : []
  if (!list.length) return null
  if (activeVersionId) {
    const active = list.find((v) => v.id === activeVersionId)
    if (active) return active
  }
  const def = list.find((v) => v.isDefault)
  if (def) return def
  return [...list].sort((a, b) => versionTime(b) - versionTime(a))[0]
}

/** Une version est exploitable si elle porte des quantités par article (predictedRecords). */
export function hasScenarioRecords(version) {
  return Array.isArray(version?.predictedRecords) && version.predictedRecords.length > 0
}

/**
 * Sépare les events selon leur scénario.
 * @param {Array<object>} events
 * @param {Map<string, object|null>} versionByEventId  version retenue (null = aucune)
 * @returns {{ covered: Array<object>, excluded: Array<{ id, name, date, reason: 'no-scenario'|'empty-scenario' }> }}
 */
export function splitEventsByScenario(events, versionByEventId) {
  const covered = []
  const excluded = []
  for (const e of events || []) {
    if (!e?.id) continue
    const v = versionByEventId?.get(e.id) || null
    if (v && hasScenarioRecords(v)) {
      covered.push(e)
      continue
    }
    excluded.push({
      id: e.id,
      name: e.eventName || e.name || '',
      date: e.eventDate || e.date || '',
      reason: v ? 'empty-scenario' : 'no-scenario',
    })
  }
  return { covered, excluded }
}
