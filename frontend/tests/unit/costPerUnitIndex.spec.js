/**
 * Coût estimé des records au grain PdV (Prévision, Forecast) : coût par pièce du PdV x quantité,
 * cascade de repli event+PdV, event+nom, event, historique du PdV, historique espace, 0.
 */
import { buildCostEstimator } from '@/utils/costPerUnitIndex'
import { makeCostFor } from '@/utils/eventCostLookup'

const COSTS = { beer: 2, burger: 5, water: 0 }
const unitCostOf = makeCostFor(COSTS, null)
const art = (over) => ({
  eventId: 'e1', shopId: 's1', shopName: 'Bar A', menuItemId: 'beer', quantity: 10, revenue: 50, ...over,
})
const chart = (over) => ({ eventId: 'e1', shopId: 's1', shopName: 'Bar A', menuItemId: null, quantity: 10, revenue: 80, ...over })

describe('buildCostEstimator', () => {
  it('record au grain PdV : quantité x coût moyen par pièce du même event et du même PdV', () => {
    // Bar A, e1 : 10 bières à 2 et 10 burgers à 5 => (20 + 50) / 20 = 3,5 par pièce.
    const est = buildCostEstimator({ articleRecords: [art({}), art({ menuItemId: 'burger' })], unitCostOf })
    expect(est.costPerUnitFor(chart({}))).toBeCloseTo(3.5)
    expect(est.costOf(chart({ quantity: 100 }))).toBeCloseTo(350)
    expect(est.resolvable).toBe(true)
  })

  it('record qui porte un article : coût exact, sans moyenne', () => {
    const est = buildCostEstimator({ articleRecords: [art({}), art({ menuItemId: 'burger' })], unitCostOf })
    expect(est.costOf({ eventId: 'e1', menuItemId: 'burger', quantity: 3 })).toBe(15)
  })

  it('le coût à la date de l\'event (costByEvent) prime sur la carte actuelle', () => {
    const byEvent = makeCostFor(COSTS, { e1: { beer: 4 } })
    const est = buildCostEstimator({ articleRecords: [art({})], unitCostOf: byEvent })
    expect(est.costPerUnitFor(chart({}))).toBe(4)
  })

  it('cascade : event et nom de PdV (shopId absent), puis event entier', () => {
    const est = buildCostEstimator({
      articleRecords: [art({ shopId: undefined, shopName: 'Bar A' }), art({ shopId: 's2', shopName: 'Bar B', menuItemId: 'burger' })],
      unitCostOf,
    })
    // Même event, nom « bar a » (casse ignorée) : bière seule = 2.
    expect(est.costPerUnitFor(chart({ shopId: 'zz', shopName: 'BAR A ' }))).toBe(2)
    // PdV inconnu, même event : moyenne de l'event = (20 + 50) / 20 = 3,5.
    expect(est.costPerUnitFor(chart({ shopId: 'x', shopName: 'Inconnu' }))).toBeCloseTo(3.5)
  })

  it('event sans grain article (prédit) : historique du PdV, tous events confondus', () => {
    const est = buildCostEstimator({
      articleRecords: [
        art({ eventId: 'past1', menuItemId: 'beer' }),
        art({ eventId: 'past2', menuItemId: 'burger', quantity: 10 }),
        art({ eventId: 'past1', shopId: 's2', shopName: 'Bar B', menuItemId: 'water' }),
      ],
      unitCostOf,
    })
    // Bar A : (10 x 2 + 10 x 5) / 20 = 3,5 ; Bar B : eau sans coût = 0.
    expect(est.costPerUnitFor(chart({ eventId: 'future' }))).toBeCloseTo(3.5)
    expect(est.costPerUnitFor(chart({ eventId: 'future', shopId: 's2', shopName: 'Bar B' }))).toBe(0)
  })

  it('PdV sans aucun historique : moyenne de tout l\'espace', () => {
    const est = buildCostEstimator({ articleRecords: [art({}), art({ menuItemId: 'burger' })], unitCostOf })
    expect(est.costPerUnitFor(chart({ eventId: 'future', shopId: 'nouveau', shopName: 'Nouveau' }))).toBeCloseTo(3.5)
  })

  it('aucun record article : coût 0 et non calculable (marge et revenu net « — »)', () => {
    const est = buildCostEstimator({ articleRecords: [], unitCostOf })
    expect(est.costOf(chart({}))).toBe(0)
    expect(est.resolvable).toBe(false)
    // Records article sans article ou sans quantité : rien d'estimable non plus.
    expect(buildCostEstimator({ articleRecords: [art({ menuItemId: null }), art({ quantity: 0 })], unitCostOf }).resolvable).toBe(false)
  })

  it('carte des coûts vide : non calculable même avec des records article', () => {
    const est = buildCostEstimator({ articleRecords: [art({})], unitCostOf: makeCostFor({}, null), hasCostMap: false })
    expect(est.resolvable).toBe(false)
  })

  it('quantité nulle, négative ou absente : coût 0', () => {
    const est = buildCostEstimator({ articleRecords: [art({})], unitCostOf })
    expect(est.costOf(chart({ quantity: 0 }))).toBe(0)
    expect(est.costOf(chart({ quantity: -4 }))).toBe(0)
    expect(est.costOf({ eventId: 'e1' })).toBe(0)
    expect(est.costOf(null)).toBe(0)
  })
})
