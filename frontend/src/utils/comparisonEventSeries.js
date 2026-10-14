/**
 * comparisonEventSeries : CA par event d'un rapport, dans l'ordre chronologique.
 * Alimente la ligne de tendance du graphe « CA évènement par shop » (décision 5 du SPEC) :
 * la courbe du principal est alignée PAR RANG sur les barres de la comparaison.
 */
import { parseEventDate } from '@/utils/dateFr'

/**
 * @param {Array} records  records du graphe (chartRecords : eventId, revenue)
 * @param {Array} events   events du rapport (id, name/eventName, date/eventDate)
 * @returns {Array<{ eventId: string, name: string, date: string, revenue: number }>}
 *   tri par date croissante (même ordre que le graphe en mode « date »), events sans CA exclus
 *   comme le graphe (il ne trace que les events qui ont au moins un record).
 */
export function buildEventRevenueSeries(records, events) {
  const meta = new Map()
  for (const e of events || []) {
    if (e?.id == null) continue
    meta.set(String(e.id), { name: e.eventName || e.name || '', date: e.eventDate || e.date || '' })
  }
  const byEvent = new Map()
  for (const r of records || []) {
    if (!r || !r.eventId) continue
    const id = String(r.eventId)
    byEvent.set(id, (byEvent.get(id) || 0) + (Number(r.revenue) || 0))
  }
  const time = (s) => parseEventDate(s)?.getTime() || 0
  return [...byEvent.entries()]
    .map(([eventId, revenue]) => {
      const m = meta.get(eventId) || { name: '', date: '' }
      return { eventId, name: m.name, date: m.date, revenue }
    })
    .sort((a, b) => time(a.date) - time(b.date))
}
