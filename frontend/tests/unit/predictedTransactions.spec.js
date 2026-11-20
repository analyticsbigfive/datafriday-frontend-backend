import {
  shopKeyOf, buildTransactionRatios, withPredictedTransactions, applyPredictedTransactions,
} from '@/utils/predictedTransactions'

// Record réel au grain PdV : { eventId, shopId, quantity, transactionCount }.
const real = (eventId, shopId, quantity, transactionCount, extra = {}) => ({
  eventId, shopId, shopName: `PdV ${shopId}`, quantity, transactionCount, revenue: quantity * 5, ...extra,
})

// Record prédictif : transactionCount 0 comme le moteur.
const predicted = (eventId, shopId, quantity, extra = {}) => ({
  eventId, shopId, shopName: `PdV ${shopId}`, quantity, revenue: quantity * 5, transactionCount: 0, isPredictive: true, ...extra,
})

describe('shopKeyOf', () => {
  it('préfère l\'identifiant, puis le nom, sinon null', () => {
    expect(shopKeyOf({ shopId: 's1', shopName: 'Bar' })).toBe('id:s1')
    expect(shopKeyOf({ elementId: 'el9' })).toBe('id:el9')
    expect(shopKeyOf({ shopName: 'Bar' })).toBe('name:Bar')
    expect(shopKeyOf({})).toBeNull()
    expect(shopKeyOf(null)).toBeNull()
  })
})

describe('buildTransactionRatios', () => {
  it('ratio par PdV et ratio global sur les records réels', () => {
    const { byShop, global } = buildTransactionRatios([
      real('e1', 's1', 100, 40),
      real('e2', 's1', 100, 20), // s1 : 60 / 200 = 0,3
      real('e1', 's2', 50, 25), // s2 : 25 / 50 = 0,5
    ])
    expect(byShop.get('id:s1')).toBeCloseTo(0.3)
    expect(byShop.get('id:s2')).toBeCloseTo(0.5)
    expect(global).toBeCloseTo(85 / 250)
  })

  it('ignore les records prédictifs', () => {
    const { byShop, global } = buildTransactionRatios([
      real('e1', 's1', 10, 5),
      predicted('e2', 's1', 1000, { transactionCount: 900 }),
    ])
    expect(byShop.get('id:s1')).toBeCloseTo(0.5)
    expect(global).toBeCloseTo(0.5)
  })

  it('PdV sans quantité : pas de ratio propre ; sans aucune quantité : global 0', () => {
    const { byShop, global } = buildTransactionRatios([real('e1', 's1', 0, 3)])
    expect(byShop.has('id:s1')).toBe(false)
    expect(global).toBe(0)
  })

  it('entrée vide ou invalide : ratios vides', () => {
    for (const input of [[], null, undefined]) {
      const { byShop, global } = buildTransactionRatios(input)
      expect(byShop.size).toBe(0)
      expect(global).toBe(0)
    }
  })

  it('valeurs non numériques traitées comme 0', () => {
    const { byShop } = buildTransactionRatios([real('e1', 's1', 'abc', 'x'), real('e1', 's1', 10, 4)])
    expect(byShop.get('id:s1')).toBeCloseTo(0.4)
  })
})

describe('withPredictedTransactions', () => {
  const ratios = buildTransactionRatios([real('e1', 's1', 100, 30), real('e1', 's2', 100, 50)])

  it('PdV connu : quantité x ratio du PdV', () => {
    const [a, b] = withPredictedTransactions([predicted('f1', 's1', 200), predicted('f1', 's2', 200)], ratios)
    expect(a.transactionCount).toBe(60)
    expect(b.transactionCount).toBe(100)
  })

  it('PdV inconnu : ratio global', () => {
    const [a] = withPredictedTransactions([predicted('f1', 'sX', 100)], ratios)
    expect(a.transactionCount).toBe(40) // global 80 / 200 = 0,4
  })

  it('record sans identifiant de PdV : ratio global', () => {
    const [a] = withPredictedTransactions([{ eventId: 'f1', quantity: 100 }], ratios)
    expect(a.transactionCount).toBe(40)
  })

  it('aucune source : 0', () => {
    const none = buildTransactionRatios([])
    expect(withPredictedTransactions([predicted('f1', 's1', 500)], none)[0].transactionCount).toBe(0)
    expect(withPredictedTransactions([predicted('f1', 's1', 500)], null)[0].transactionCount).toBe(0)
  })

  it('quantité 0 : 0 transaction', () => {
    expect(withPredictedTransactions([predicted('f1', 's1', 0)], ratios)[0].transactionCount).toBe(0)
  })

  it('arrondit à l\'entier', () => {
    const r = buildTransactionRatios([real('e1', 's1', 3, 1)]) // 1/3
    expect(withPredictedTransactions([predicted('f1', 's1', 10)], r)[0].transactionCount).toBe(3) // 3,33
    expect(withPredictedTransactions([predicted('f1', 's1', 11)], r)[0].transactionCount).toBe(4) // 3,67
  })

  it('ne mute ni les records ni les ratios', () => {
    const input = [predicted('f1', 's1', 200)]
    const snapshot = JSON.stringify(input)
    const out = withPredictedTransactions(input, ratios)
    expect(JSON.stringify(input)).toBe(snapshot)
    expect(out[0]).not.toBe(input[0])
    expect(out[0]).toMatchObject({ eventId: 'f1', shopId: 's1', quantity: 200, isPredictive: true })
    expect(ratios.byShop.get('id:s1')).toBeCloseTo(0.3)
  })

  it('liste vide ou invalide : tableau vide', () => {
    expect(withPredictedTransactions([], ratios)).toEqual([])
    expect(withPredictedTransactions(null, ratios)).toEqual([])
  })
})

describe('applyPredictedTransactions', () => {
  const past = [
    real('p1', 's1', 100, 50), // s1 : 0,5 sur p1
    real('p1', 's2', 100, 10), // s2 : 0,1 sur p1
    real('p2', 's1', 100, 20), // s1 : 0,2 sur p2
    real('p2', 's2', 100, 30), // s2 : 0,3 sur p2
  ]

  it('utilise les events sources du record (basedOnEventIds), pas tout l\'historique', () => {
    const [onP1, onP2] = applyPredictedTransactions([
      predicted('f1', 's1', 100, { basedOnEventIds: ['p1'] }),
      predicted('f2', 's1', 100, { basedOnEventIds: ['p2'] }),
    ], past)
    expect(onP1.transactionCount).toBe(50)
    expect(onP2.transactionCount).toBe(20)
  })

  it('plusieurs sources : somme des transactions sur somme des quantités', () => {
    const [r] = applyPredictedTransactions([predicted('f1', 's1', 100, { basedOnEventIds: ['p1', 'p2'] })], past)
    expect(r.transactionCount).toBe(35) // s1 : 70 / 200 = 0,35
  })

  it('PdV absent des sources : ratio global de ces sources', () => {
    const [r] = applyPredictedTransactions([predicted('f1', 'sNew', 100, { basedOnEventIds: ['p1'] })], past)
    expect(r.transactionCount).toBe(30) // global p1 : 60 / 200 = 0,3
  })

  it('sans basedOnEventIds : repli sur tous les records passés fournis', () => {
    const [r] = applyPredictedTransactions([predicted('f1', 's2', 100)], past)
    expect(r.transactionCount).toBe(20) // s2 : 40 / 200 = 0,2
  })

  it('sources introuvables dans l\'historique : 0', () => {
    const [r] = applyPredictedTransactions([predicted('f1', 's1', 100, { basedOnEventIds: ['absent'] })], past)
    expect(r.transactionCount).toBe(0)
  })

  it('un event futur par jeu de sources, ordre des records conservé', () => {
    const input = [
      predicted('f1', 's1', 100, { basedOnEventIds: ['p1'] }),
      predicted('f2', 's1', 100, { basedOnEventIds: ['p2'] }),
      predicted('f1', 's2', 100, { basedOnEventIds: ['p1'] }),
    ]
    const out = applyPredictedTransactions(input, past)
    expect(out.map((r) => [r.eventId, r.shopId, r.transactionCount])).toEqual([
      ['f1', 's1', 50], ['f2', 's1', 20], ['f1', 's2', 10],
    ])
  })

  it('ignore les records prédictifs de l\'historique', () => {
    const polluted = [...past, predicted('p1', 's1', 100000, { transactionCount: 99999 })]
    const [r] = applyPredictedTransactions([predicted('f1', 's1', 100, { basedOnEventIds: ['p1'] })], polluted)
    expect(r.transactionCount).toBe(50)
  })

  it('ne mute pas les entrées', () => {
    const input = [predicted('f1', 's1', 100, { basedOnEventIds: ['p1'] })]
    const before = JSON.stringify(input)
    const pastBefore = JSON.stringify(past)
    applyPredictedTransactions(input, past)
    expect(JSON.stringify(input)).toBe(before)
    expect(JSON.stringify(past)).toBe(pastBefore)
  })

  it('aucun record prédit : tableau vide ; aucun historique : 0', () => {
    expect(applyPredictedTransactions([], past)).toEqual([])
    expect(applyPredictedTransactions(null, past)).toEqual([])
    expect(applyPredictedTransactions([predicted('f1', 's1', 100)], [])[0].transactionCount).toBe(0)
  })
})
