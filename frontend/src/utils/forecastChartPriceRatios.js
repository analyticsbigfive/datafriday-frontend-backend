/**
 * Ratios de prix par PdV pour les records « graphe » (grain PdV, sans article) de Forecast.
 * Module PUR.
 *
 * Les records graphe n'ont pas d'article : l'effet d'une modification de prix s'y propage
 * par des ratios dérivés du grain article, soit
 *   CA      : somme des CA article après prix / somme des CA article de base
 *   volume  : somme des quantités article après prix / somme des quantités de base
 * (le volume ne bouge que si une élasticité est choisie). Repli en cascade :
 *   1. même event et même PdV (shopId, ou elementId côté article)
 *   2. même event et même shopName (insensible à la casse)
 *   3. l'event entier
 *   4. mix historique du PdV : ses records article de TOUS les events (shopId, puis shopName).
 *      Revient à répartir le CA prévu du PdV entre ses articles selon leur part historique.
 *   5. mix historique de tout l'espace (PdV sans aucun historique article)
 *   6. 1 (aucun grain article nulle part : le prix n'a pas d'effet)
 * Les niveaux 1 à 3 sont la source « event », 4 et 5 la source « history », 6 « none ».
 */

export const RATIO_SOURCES = Object.freeze({ EVENT: 'event', HISTORY: 'history', NONE: 'none' })

const NEUTRAL = Object.freeze({ revenue: 1, quantity: 1, source: RATIO_SOURCES.NONE })

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

function finiteOr0(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function emptySum() {
  return { base: 0, priced: 0, qty: 0, pricedQty: 0 }
}

function accumulate(map, key, part) {
  let sum = map.get(key)
  if (!sum) {
    sum = emptySum()
    map.set(key, sum)
  }
  sum.base += part.base
  sum.priced += part.priced
  sum.qty += part.qty
  sum.pricedQty += part.pricedQty
}

/** Ratios d'une somme, ou null si elle ne porte aucun CA (le niveau suivant prend la main). */
function factorsOf(sum, source) {
  if (!sum || sum.base === 0) return null
  return {
    revenue: sum.priced / sum.base,
    quantity: sum.qty !== 0 ? sum.pricedQty / sum.qty : 1,
    source,
  }
}

/**
 * @param {object[]} articleRecords  Records au grain article.
 * @param {{ revenue: number, quantity: number }[]|number[]} factors  Facteurs de chaque record
 *   article (mêmes indices). Un nombre seul vaut { revenue: n, quantity: 1 }.
 * @returns {{
 *   factorsFor: (chartRecord: object) => { revenue: number, quantity: number, source: string },
 *   ratioFor: (chartRecord: object) => number,
 *   eventIds: Set<string>,
 * }}
 */
export function buildPdvPriceRatioIndex(articleRecords, factors) {
  const byPdv = new Map()
  const byName = new Map()
  const byEvent = new Map()
  const histPdv = new Map()
  const histName = new Map()
  const all = emptySum()

  articleRecords.forEach((rec, i) => {
    const f = factors[i]
    const revFactor = typeof f === 'number' ? f : (f?.revenue ?? 1)
    const qtyFactor = typeof f === 'number' ? 1 : (f?.quantity ?? 1)
    const base = finiteOr0(rec?.revenue)
    const qty = finiteOr0(rec?.quantity)
    const part = { base, priced: base * revFactor, qty, pricedQty: qty * qtyFactor }

    const event = eventIdOf(rec)
    accumulate(byEvent, event, part)
    const pdvId = pdvIdOf(rec)
    if (pdvId) {
      accumulate(byPdv, `${event}|${pdvId}`, part)
      accumulate(histPdv, pdvId, part)
    }
    const name = pdvNameOf(rec)
    if (name) {
      accumulate(byName, `${event}|${name}`, part)
      accumulate(histName, name, part)
    }
    all.base += part.base
    all.priced += part.priced
    all.qty += part.qty
    all.pricedQty += part.pricedQty
  })

  const eventIds = new Set([...byEvent.keys()].filter((id) => id !== '' && byEvent.get(id).base !== 0))
  const { EVENT, HISTORY } = RATIO_SOURCES

  function factorsFor(chartRecord) {
    const event = eventIdOf(chartRecord)
    const pdvId = pdvIdOf(chartRecord)
    const name = pdvNameOf(chartRecord)
    return (
      (pdvId ? factorsOf(byPdv.get(`${event}|${pdvId}`), EVENT) : null) ??
      (name ? factorsOf(byName.get(`${event}|${name}`), EVENT) : null) ??
      factorsOf(byEvent.get(event), EVENT) ??
      (pdvId ? factorsOf(histPdv.get(pdvId), HISTORY) : null) ??
      (name ? factorsOf(histName.get(name), HISTORY) : null) ??
      factorsOf(all, HISTORY) ??
      NEUTRAL
    )
  }

  return { factorsFor, ratioFor: (rec) => factorsFor(rec).revenue, eventIds }
}
