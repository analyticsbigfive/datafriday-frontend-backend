/**
 * CA / TPE et CA / collaborateur (widgets rendement de la page Analyse).
 *
 * Règle : Σ CA des events dont l'effectif (Event.numberOfTpe / numberOfCollaborators)
 * est renseigné ÷ Σ effectifs de ces events. Un event sans effectif est exclu du
 * numérateur ET du dénominateur (même règle que le percap). Le CA suit les filtres
 * (event, date, article...) : CA filtré ÷ effectif total de l'event.
 * Les effectifs sont saisis par event, jamais par PdV : un filtre PdV / type / zone
 * rend le calcul impossible (`blocked`), on n'invente pas de répartition.
 */

/** Effectif concerné -> champ de l'event et motif d'exclusion. */
export const HEADCOUNT_KINDS = {
  tpe: { field: 'numberOfTpe', reason: 'no-tpe' },
  collaborator: { field: 'numberOfCollaborators', reason: 'no-collaborators' },
}

/** Effectif exploitable d'un event : nombre strictement positif, sinon null. */
export function eventHeadcount(event, kind) {
  const n = Number(event?.[HEADCOUNT_KINDS[kind].field])
  return Number.isFinite(n) && n > 0 ? n : null
}

/** CA par eventId depuis des records article (champ `revenue`). */
export function sumRevenueByEvent(records) {
  const map = new Map()
  for (const r of records || []) {
    if (r?.eventId == null) continue
    const key = String(r.eventId)
    map.set(key, (map.get(key) || 0) + (Number(r.revenue) || 0))
  }
  return map
}

/**
 * @param {Object} p
 * @param {Array} p.events events du périmètre (id, numberOfTpe, numberOfCollaborators)
 * @param {Map<string, number>} p.revenueByEventId CA filtré par event
 * @param {'tpe'|'collaborator'} p.kind
 * @param {boolean} p.shopScopeFiltered filtre PdV / type / zone actif
 * @returns {{ blocked: boolean, value: number|null, filledCount: number, totalCount: number,
 *   headcount: number, rows: Array<{ eventId: string, value: number|null, reason: string|null }> }}
 */
export function computeRevenuePerHeadcount({ events, revenueByEventId, kind, shopScopeFiltered }) {
  const list = Array.isArray(events) ? events.filter((e) => e?.id != null) : []
  const { reason } = HEADCOUNT_KINDS[kind]
  let revenue = 0
  let headcount = 0
  let filledCount = 0
  const rows = list.map((e) => {
    const n = eventHeadcount(e, kind)
    if (n == null) return { eventId: String(e.id), value: null, reason }
    const ca = revenueByEventId?.get(String(e.id)) || 0
    revenue += ca
    headcount += n
    filledCount += 1
    return { eventId: String(e.id), value: ca / n, reason: null }
  })
  const base = { filledCount, totalCount: list.length, headcount }
  if (shopScopeFiltered) return { ...base, blocked: true, value: null, rows: [] }
  return { ...base, blocked: false, value: headcount > 0 ? revenue / headcount : null, rows }
}
