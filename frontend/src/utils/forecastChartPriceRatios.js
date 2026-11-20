/**
 * Ratios de prix par PdV pour les records « graphe » (grain PdV, sans article) de Forecast.
 * Module PUR.
 *
 * Les records graphe n'ont pas d'article : l'effet d'une modification de prix s'y propage
 * par un ratio dérivé du grain article, soit
 *   somme des CA article après prix seul / somme des CA article de base
 * sur les records article du même event et du même PdV. Repli en cascade :
 *   1. même event et même PdV (shopId, ou elementId côté article)
 *   2. même event et même shopName (insensible à la casse)
 *   3. l'event entier
 *   4. 1 (aucun grain article pour cet event : le prix n'a pas d'effet)
 */

/** Identifiant d'event d'un record, en chaîne ('' si absent). */
export function eventIdOf(rec) {
  return rec?.eventId == null ? '' : String(rec.eventId)
}

function pdvIdOf(rec) {
  const id = rec?.shopId ?? rec?.elementId
  return id == null || id === '' ? null : String(id)
}

function pdvNameOf(rec) {
  return String(rec?.shopName ?? '').trim().toLowerCase()
}

function accumulate(map, key, base, priced) {
  const sum = map.get(key)
  if (sum) {
    sum.base += base
    sum.priced += priced
  } else {
    map.set(key, { base, priced })
  }
}

function ratioOf(sum) {
  return sum && sum.base !== 0 ? sum.priced / sum.base : null
}

/**
 * @param {object[]} articleRecords  Records au grain article.
 * @param {number[]} ratios  Ratio de prix de chaque record article (même indices).
 * @returns {{ ratioFor: (chartRecord: object) => number, eventIds: Set<string> }}
 */
export function buildPdvPriceRatioIndex(articleRecords, ratios) {
  const byPdv = new Map()
  const byName = new Map()
  const byEvent = new Map()

  articleRecords.forEach((rec, i) => {
    const revenue = Number(rec?.revenue)
    const base = Number.isFinite(revenue) ? revenue : 0
    const priced = base * (ratios[i] ?? 1)
    const event = eventIdOf(rec)
    accumulate(byEvent, event, base, priced)
    const pdvId = pdvIdOf(rec)
    if (pdvId) accumulate(byPdv, `${event}|${pdvId}`, base, priced)
    const name = pdvNameOf(rec)
    if (name) accumulate(byName, `${event}|${name}`, base, priced)
  })

  const eventIds = new Set([...byEvent.keys()].filter((id) => id !== ''))

  function ratioFor(chartRecord) {
    const event = eventIdOf(chartRecord)
    const pdvId = pdvIdOf(chartRecord)
    const name = pdvNameOf(chartRecord)
    return (
      (pdvId ? ratioOf(byPdv.get(`${event}|${pdvId}`)) : null) ??
      (name ? ratioOf(byName.get(`${event}|${name}`)) : null) ??
      ratioOf(byEvent.get(event)) ??
      1
    )
  }

  return { ratioFor, eventIds }
}
