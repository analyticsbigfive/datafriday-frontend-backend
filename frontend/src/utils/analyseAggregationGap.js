/**
 * Incident Jean Bouin 2026-10-01 : events dont le CA est enregistré (rollup `Event.revenue`,
 * lu par la bande KPI) mais dont le détail de vente est absent (agrégats minute/article vides,
 * lus par tous les graphiques). L'écran affichait 580 k€ en haut et « Aucune donnée » partout
 * ailleurs, sans rien dire. Cause typique : une resynchronisation interrompue dans Data
 * Integration.
 *
 * Seuls les events dont le détail a été effectivement chargé sont jugés : un event hors cap ou
 * encore en vol n'est pas « sans détail », il n'est juste pas encore connu.
 *
 * @param {object} p
 * @param {Array<object>} p.events           events du périmètre filtré
 * @param {Array<object>} p.itemRecords      records item-level chargés (portent `eventId`)
 * @param {Set<string>}   p.loadedEventIds   events dont le détail a été tenté
 * @returns {Array<object>} events concernés, dans l'ordre reçu
 */
export function findEventsMissingSalesDetail({ events, itemRecords, loadedEventIds }) {
  if (!Array.isArray(events) || !events.length) return []
  const withDetail = new Set()
  for (const r of itemRecords || []) {
    if (r?.eventId != null) withDetail.add(String(r.eventId))
  }
  const loaded = loadedEventIds || new Set()
  return events.filter((e) => {
    if (!e?.id) return false
    const revenue = Number(e.revenue)
    if (!Number.isFinite(revenue) || revenue <= 0) return false
    return loaded.has(e.id) && !withDetail.has(String(e.id))
  })
}
