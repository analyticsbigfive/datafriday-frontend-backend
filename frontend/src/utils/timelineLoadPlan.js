/**
 * timelineLoadPlan : préparation et assemblage des records de la timeline minute par minute,
 * partagés par la timeline du principal (useAnalyseTimeline) et celle du rapport de comparaison
 * (useComparisonTimeline). Fonctions pures, hors store et hors réseau.
 */
import { parseEventDate as parseEventDateLocal } from '@/utils/dateFr'
import { preprocessTimelineRecords } from '@/utils/timelineBucketing'
import { computeAverageAlignment, alignAndScaleRecords } from '@/composables/analyseTimelineAverage'
import { t } from '@/i18n/translations'

export const MAX_TIMELINE_EVENTS = 50

/**
 * Décide quoi charger et comment présenter la courbe.
 * Un seul event : courbe de l'event. Plusieurs : moyenne alignée sur le coup d'envoi de l'ancre
 * (events sans coup d'envoi exploitable écartés), sinon repli sur la somme non alignée.
 *
 * @param {Array} eventList  events (id, eventName|name, eventDate|date, showTime)
 * @returns {{ eventsToLoad: Array, isSingle: boolean, alignment: object|null,
 *   skippedEvents: Array<{id: string, name: string}>,
 *   selected: {eventId: string, eventName: string, eventDate: string},
 *   eventsList: Array, idsToFetch: string[] }}
 */
export function planTimelineLoad(eventList) {
  let eventsToLoad = eventList
  if (eventList.length > MAX_TIMELINE_EVENTS) {
    eventsToLoad = [...eventList]
      .sort((a, b) => {
        const da = parseEventDateLocal(b.eventDate || b.date)?.getTime() || 0
        const db = parseEventDateLocal(a.eventDate || a.date)?.getTime() || 0
        return da - db
      })
      .slice(0, MAX_TIMELINE_EVENTS)
    console.warn(
      `[timelineLoadPlan] ${eventList.length} evenements selectionnes, limite aux ${MAX_TIMELINE_EVENTS} plus recents.`,
    )
  }

  const isSingle = eventsToLoad.length === 1
  // Alignement parité EventPredict : ancre = coup d'envoi de l'event le plus
  // récent alignable ; events sans showTime exploitable → courbe skippée.
  // keptIds vide (aucun coup d'envoi) → repli legacy : somme non alignée.
  let alignment = null
  let skippedEvents = []
  if (!isSingle) {
    const a = computeAverageAlignment(eventsToLoad)
    const skippedSet = new Set(a.skippedIds)
    skippedEvents = eventsToLoad
      .filter((e) => skippedSet.has(e.id))
      .map((e) => ({ id: e.id, name: e.eventName || e.name || e.id }))
    if (a.keptIds.length > 0) alignment = a
    else console.warn('[timelineLoadPlan] aucun coup d’envoi exploitable — moyenne non alignée (somme legacy).')
  }

  const selected = isSingle
    ? {
        eventId: eventsToLoad[0].id,
        eventName: eventsToLoad[0].eventName || eventsToLoad[0].name,
        eventDate: eventsToLoad[0].eventDate || eventsToLoad[0].date,
      }
    : {
        eventId: 'average',
        eventName: `${t('anTimelineAvgPrefix')} ${eventsToLoad.length} ${t('anEventsPlural')}`,
        eventDate: '',
      }

  // En mode aligné, on ne fetch QUE les events alignables (les skippés ne contribuent à rien).
  const idsToFetch = alignment ? alignment.keptIds : eventsToLoad.map((ev) => ev.id)
  const eventsList = isSingle
    ? []
    : eventsToLoad.map((e) => ({
        eventName: e.eventName || e.name,
        eventDate: e.eventDate || e.date,
        aligned: alignment ? alignment.offsets.has(e.id) : false,
      }))

  return { eventsToLoad, isSingle, alignment, skippedEvents, selected, eventsList, idsToFetch }
}

/**
 * Libellé de l'en-tête de la courbe (nom de l'event, ou « Moyenne sur K/N events »).
 * @param {Array} eventsList  plan.eventsList
 * @param {{eventName?: string}|null} selected  plan.selected
 */
export function timelineHeaderLabelOf(eventsList, selected) {
  const list = eventsList || []
  if (list.length > 1) {
    // K/N : K = events réellement alignés sur le coup d'envoi de l'ancre.
    const kept = list.filter((e) => e.aligned).length
    if (kept === 0) return `${t('anTimelineAvgPrefix')} ${list.length} ${t('anEventsPlural')} ${t('anTimelineAvgUnalignedSuffix')}`
    if (kept < list.length) return `${t('anTimelineAvgPrefix')} ${kept}/${list.length} ${t('anTimelineAvgAlignedEvents')}`
    return `${t('anTimelineAvgPrefix')} ${list.length} ${t('anEventsPlural')}`
  }
  return selected?.eventName || ''
}

/**
 * Assemble les lignes minute des events chargés (alignées et mises à l'échelle en moyenne).
 * Dénominateur = nb d'events alignés, figé AVANT fetch (parité EP : un event gardé sans lignes compte).
 *
 * @param {{eventsToLoad: Array, alignment: object|null}} plan
 * @param {Map<string, Array>} byEventId  lignes par event (getSpaceEventTimelineBatch)
 * @param {object} menuItemCostMap
 * @param {object|null} [menuItemCostByEvent]  coût figé par event (lot 4b), repli sur menuItemCostMap
 * @returns {ReadonlyArray<object>} records gelés
 */
export function assembleTimelineRecords({ eventsToLoad, alignment }, byEventId, menuItemCostMap = {}, menuItemCostByEvent = null) {
  const flatRecords = alignment
    ? eventsToLoad.flatMap((ev) => {
        const off = alignment.offsets.get(ev.id)
        if (off == null) return [] // sans showTime → courbe SKIPPÉE (jamais offset 0)
        const data = byEventId.get(ev.id)
        return Array.isArray(data)
          ? alignAndScaleRecords(
              data,
              off,
              alignment.keptIds.length,
              { eventId: ev.id },
              // Coup d'envoi de CET event = ancre − offset (BUG-351-01) : sert à lire les ventes en
              // écart au coup d'envoi, donc à placer celles d'après minuit en fin de courbe.
              alignment.anchorMinutes != null ? alignment.anchorMinutes - off : null,
            )
          : []
      })
    : eventsToLoad.flatMap((ev) => {
        // Single + repli legacy : comportement historique intact.
        const data = byEventId.get(ev.id) || []
        return Array.isArray(data) ? data.map((r) => ({ ...r, eventId: ev.id })) : []
      })
  const allRecords = preprocessTimelineRecords(flatRecords, { menuItemCostMap, menuItemCostByEvent })
  for (const r of allRecords) Object.freeze(r)
  return Object.freeze(allRecords)
}
