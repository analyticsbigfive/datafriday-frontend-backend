// Alignement « Moyenne » de la timeline Analyse — parité EventPredict.
//
// EventPredict recale chaque event passé sur le coup d'envoi (showTime) de
// l'event CIBLE (usePredictiveTimeline : offset = horaireCible − horairePassé,
// alignPastMinute modulo 1440) et combine les courbes avec des poids normalisés
// (somme = 1) → moyenne pondérée. L'Analyse n'a ni cible ni scoring :
//   - ancre  = showTime de l'event le plus récent ALIGNABLE (pseudo-cible) ;
//   - poids  = égaux 1/K (moyenne simple sur les K events alignés) ;
//   - event sans showTime exploitable → courbe SKIPPÉE (jamais offset 0 : une
//     heure illisible empilerait toute la courbe à 00:00), exclu du dénominateur.
//
// Module PUR (aucune dépendance store/router) → testable Jest tel quel
// (cf. tests/unit/analyseTimelineAverage.spec.js).

import { alignPastMinute } from '@/composables/usePredictiveTimeline'
import { parseMinuteToken } from '@/utils/timelineBucketing'
import { parseEventDate } from '@/utils/dateFr'
import { parseEventSessions } from '@/utils/eventSessions'

/**
 * Coup d'envoi d'un event en minutes-depuis-minuit, robuste à la source :
 * showTime racine (normalisé par SET_EVENTS) puis, en repli, sessions[0].showTime
 * (parsé — `sessions` peut être une string JSON si l'event n'est pas passé par
 * SET_EVENTS). Null si aucun horaire exploitable.
 */
function eventShowTimeMinutes(e) {
  const fromRoot = parseMinuteToken(e?.showTime)
  if (fromRoot != null) return fromRoot
  const sessions = parseEventSessions(e?.sessions)
  return parseMinuteToken(sessions[0]?.showTime)
}

/**
 * Détermine l'ancre et les offsets d'alignement pour une liste d'events.
 * @param {Array<object>} events events du store analyse (showTime normalisé racine)
 * @returns {{
 *   anchorEventId: string|null,
 *   anchorMinutes: number|null,
 *   offsets: Map<string, number>,
 *   keptIds: string[],
 *   skippedIds: string[],
 * }}
 */
export function computeAverageAlignment(events) {
  const candidates = (events || []).map((e) => ({
    id: e.id,
    showTimeMin: eventShowTimeMinutes(e), // showTime racine, repli sessions[0] parsé
    dateMs: parseEventDate(e.eventDate || e.date)?.getTime() || 0,
  }))
  const alignable = candidates.filter((c) => c.showTimeMin != null)
  if (!alignable.length) {
    return {
      anchorEventId: null,
      anchorMinutes: null,
      offsets: new Map(),
      keptIds: [],
      skippedIds: candidates.map((c) => c.id),
    }
  }
  // Ancre = alignable le plus récent. Tri EXPLICITE (filteredEvents n'est pas
  // ordonné) + départage par id pour un choix déterministe à dates égales.
  const anchor = [...alignable].sort(
    (a, b) => b.dateMs - a.dateMs || String(a.id).localeCompare(String(b.id)),
  )[0]
  const offsets = new Map()
  for (const c of alignable) offsets.set(c.id, anchor.showTimeMin - c.showTimeMin)
  return {
    anchorEventId: anchor.id,
    anchorMinutes: anchor.showTimeMin,
    offsets,
    keptIds: alignable.map((c) => c.id),
    skippedIds: candidates.filter((c) => c.showTimeMin == null).map((c) => c.id),
  }
}

/**
 * Recale les minutes d'un event sur l'ancre et divise les valeurs par le nombre
 * d'events retenus (moyenne simple). Champs écrits en CANONIQUE (totalRevenue…)
 * — aggregateTimeline lit `totalRevenue ?? revenue` etc., donc les alias bruts
 * laissés par le spread sont court-circuités. Les ratios dérivés en aval
 * (margin, avgBasket) sont invariants sous un scaling uniforme 1/K.
 * @param {Array<object>} records records bruts event-timeline d'UN event
 * @param {number} offsetMin offset minutes (ancre − showTime de l'event)
 * @param {number} keptCount nb d'events alignés (dénominateur, figé avant fetch)
 * @param {object|null} extra champs additionnels à poser sur chaque record (ex. { eventId })
 * @returns {Array<object>}
 */
export function alignAndScaleRecords(records, offsetMin, keptCount, extra = null) {
  const n = keptCount > 0 ? keptCount : 1
  const out = []
  for (const r of records || []) {
    const recMinutes = parseMinuteToken(r.minute)
    // Minute illisible → record droppé. Divergence DÉLIBÉRÉE vs EP (qui coerce
    // à 0) : même effet net que le drop actuel de bucketMinute(null) en aval,
    // sans pic artificiel à l'ancre.
    if (recMinutes == null) continue
    const scaled = {
      ...r,
      ...(extra || null),
      minute: alignPastMinute(recMinutes, offsetMin),
      totalRevenue: (Number(r.totalRevenue ?? r.revenue) || 0) / n,
      totalQuantity: (Number(r.totalQuantity ?? r.quantity) || 0) / n,
      transactionCount: (Number(r.transactionCount ?? r.transactions) || 0) / n,
    }
    // totalCost : scalé seulement s'il existe (sinon aggregateTimeline le dérive
    // de unitCost × quantité déjà scalée — cohérent).
    const directCost = Number(r.totalCost ?? r.cost)
    if (Number.isFinite(directCost)) scaled.totalCost = directCost / n
    out.push(scaled)
  }
  return out
}
