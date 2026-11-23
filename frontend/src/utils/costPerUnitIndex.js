/**
 * Coût estimé des records au grain PdV (Prévision et Forecast). Module PUR.
 *
 * Les records de prévision sont au grain PdV : ni article, ni coût (`menuItemId` nul), donc le
 * coût et la marge valaient 0 et « — ». Le coût d'un record est ici le coût moyen d'une pièce
 * vendue du PdV (somme des coûts article / somme des quantités des records article) multiplié
 * par la quantité du record. Même cascade de repli que les ratios de prix de Forecast :
 *   1. même event et même PdV (shopId, ou elementId côté article)
 *   2. même event et même nom de PdV (insensible à la casse)
 *   3. l'event entier
 *   4. historique du PdV : ses records article de TOUS les events (shopId, puis nom)
 *   5. historique de tout l'espace
 *   6. 0 (aucun grain article nulle part)
 * Un record qui porte un article garde son coût exact (coût à la date de l'event x quantité).
 * Le coût suit la quantité du record : un prix modifié sans élasticité ne bouge pas le coût.
 */
import { eventIdOf, pdvIdOf, pdvNameOf } from '@/utils/forecastChartPriceRatios'

const finite = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function accumulate(map, key, cost, qty) {
  let sum = map.get(key)
  if (!sum) {
    sum = { cost: 0, qty: 0 }
    map.set(key, sum)
  }
  sum.cost += cost
  sum.qty += qty
}

/** Coût par pièce d'une somme, ou null si elle ne porte aucune quantité (le niveau suivant prend la main). */
const perUnit = (sum) => (sum && sum.qty > 0 ? sum.cost / sum.qty : null)

/**
 * @param {Object} p
 * @param {object[]} p.articleRecords  Records au grain article (menuItemId, quantity, shopId, eventId).
 * @param {(eventId: any, menuItemId: any) => number} p.unitCostOf  Coût d'une pièce (makeCostFor).
 * @param {boolean} [p.hasCostMap]  false : aucun coût d'article connu, rien n'est calculable.
 * @returns {{ costOf: (record: object) => number, costPerUnitFor: (record: object) => number,
 *   resolvable: boolean }}
 */
export function buildCostEstimator({ articleRecords, unitCostOf, hasCostMap = true }) {
  const byPdv = new Map()
  const byName = new Map()
  const byEvent = new Map()
  const histPdv = new Map()
  const histName = new Map()
  const all = { cost: 0, qty: 0 }
  let costable = false

  for (const rec of articleRecords || []) {
    if (!rec || rec.menuItemId == null || rec.menuItemId === '') continue
    const qty = finite(rec.quantity)
    if (qty <= 0) continue
    costable = true
    const cost = finite(unitCostOf(rec.eventId, rec.menuItemId)) * qty
    const event = eventIdOf(rec)
    accumulate(byEvent, event, cost, qty)
    const pdvId = pdvIdOf(rec)
    if (pdvId) {
      accumulate(byPdv, `${event}|${pdvId}`, cost, qty)
      accumulate(histPdv, pdvId, cost, qty)
    }
    const name = pdvNameOf(rec)
    if (name) {
      accumulate(byName, `${event}|${name}`, cost, qty)
      accumulate(histName, name, cost, qty)
    }
    all.cost += cost
    all.qty += qty
  }

  function costPerUnitFor(rec) {
    const event = eventIdOf(rec)
    const pdvId = pdvIdOf(rec)
    const name = pdvNameOf(rec)
    return (
      (pdvId ? perUnit(byPdv.get(`${event}|${pdvId}`)) : null) ??
      (name ? perUnit(byName.get(`${event}|${name}`)) : null) ??
      perUnit(byEvent.get(event)) ??
      (pdvId ? perUnit(histPdv.get(pdvId)) : null) ??
      (name ? perUnit(histName.get(name)) : null) ??
      perUnit(all) ??
      0
    )
  }

  function costOf(rec) {
    const qty = finite(rec?.quantity)
    if (qty <= 0) return 0
    // Article connu : coût exact à la date de l'event.
    if (rec.menuItemId != null && rec.menuItemId !== '') return finite(unitCostOf(rec.eventId, rec.menuItemId)) * qty
    return qty * costPerUnitFor(rec)
  }

  return { costOf, costPerUnitFor, resolvable: !!hasCostMap && costable }
}
