import { flattenLogisticExpected, splitBaselineByElement, describeBaseline } from '@/utils/postEventBaseline'
import { reconciliationKey as K, buildPostEventReconciliationLines } from '@/utils/postEventReconciliation'

describe('flattenLogisticExpected', () => {
  it('aplatit le blob { elementId: { itemId: unités } } en clés de réconciliation', () => {
    expect(flattenLogisticExpected({ el1: { a: 3, b: '2.5', c: 'x' }, el2: { a: 0 } }, K)).toEqual({
      [K('el1', 'a')]: 3,
      [K('el1', 'b')]: 2.5,
      [K('el2', 'a')]: 0,
    })
  })
  it('blob absent → null (source absente, pas un index vide)', () => {
    expect(flattenLogisticExpected(null, K)).toBeNull()
  })
})

describe('splitBaselineByElement (BUG-378-02)', () => {
  const counted = new Set(['el1', 'el2', 'el3'])
  const logistic = { [K('el1', 'a')]: 9, [K('el2', 'a')]: 4, [K('el2', 'b')]: 1, [K('el9', 'a')]: 7 }

  it('pré-event partiel : PdV compté avant → pré-event ; sinon Logistic ; sinon découvert', () => {
    const r = splitBaselineByElement({
      countedElementIds: counted,
      preEventBlob: { el1: { a: { packedUnits: 1 } } },
      logisticLeftByKey: logistic,
      logisticUsable: true,
    })
    expect([...r.preEventElementIds]).toEqual(['el1'])
    expect([...r.fallbackElementIds]).toEqual(['el2'])
    expect([...r.uncoveredElementIds]).toEqual(['el3'])
    // Seules les clés des PdV en repli sont conservées : ni el1 (pré-event), ni el9 (hors périmètre).
    expect(r.logisticLeftByKey).toEqual({ [K('el2', 'a')]: 4, [K('el2', 'b')]: 1 })
  })

  it('registre contaminé (recalé depuis le comptage post-event) → jamais utilisé comme départ', () => {
    const r = splitBaselineByElement({
      countedElementIds: counted,
      preEventBlob: null,
      logisticLeftByKey: logistic,
      logisticUsable: false,
    })
    expect(r.logisticLeftByKey).toBeNull()
    expect(r.fallbackElementIds.size).toBe(0)
    expect([...r.uncoveredElementIds]).toEqual(['el1', 'el2', 'el3'])
  })

  it('aucun pré-event, Logistic utilisable → tous les PdV du registre en repli', () => {
    const r = splitBaselineByElement({ countedElementIds: counted, logisticLeftByKey: logistic })
    expect([...r.fallbackElementIds]).toEqual(['el1', 'el2'])
    expect([...r.uncoveredElementIds]).toEqual(['el3'])
  })
})

describe('describeBaseline', () => {
  it("aucun pré-event mais repli Logistic → la source du document EST 'logistic-live'", () => {
    expect(describeBaseline({ preEventSource: 'none', fallbackElementIds: new Set(['a']), uncoveredElementIds: new Set() })).toEqual({
      source: 'logistic-live',
      fallback: null,
      uncoveredElements: 0,
    })
  })
  it('pré-event partiel complété par Logistic → source pré-event, repli décrit, découverts comptés', () => {
    expect(
      describeBaseline({
        preEventSource: 'pre-event',
        fallbackElementIds: new Set(['a', 'b']),
        uncoveredElementIds: new Set(['c']),
      }),
    ).toEqual({ source: 'pre-event', fallback: { source: 'logistic-live', elements: 2 }, uncoveredElements: 1 })
  })
  it('rien nulle part → none, sans repli', () => {
    expect(describeBaseline({ preEventSource: 'none' })).toEqual({ source: 'none', fallback: null, uncoveredElements: 0 })
  })
})

describe('buildPostEventReconciliationLines : stock de départ par PdV (BUG-378-02)', () => {
  it('PdV absent du pré-event : plus de départ à 0, repli Logistic (déjà netté) ou null', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'a')]: 2, [K('el2', 'a')]: 3, [K('el3', 'a')]: 1 },
      preEventUnitsByKey: { [K('el1', 'a')]: 10 },
      preEventElementIds: new Set(['el1']),
      soldUnitsByKey: { [K('el1', 'a')]: 5, [K('el2', 'a')]: 5, [K('el3', 'a')]: 5 },
      movementUnitsByKey: { [K('el2', 'a')]: 100 },
      logisticLeftByKey: { [K('el2', 'a')]: 4 },
    })
    const by = Object.fromEntries(lines.map((l) => [l.elementId, l]))
    // el1 : formule pré-event inchangée
    expect(by.el1).toMatchObject({ leftFromSales: 5, missingUnits: 3, baselineSource: 'pre-event' })
    // el2 : attendu Logistic tel quel (ventes ET mouvements déjà nettés, le +100 n'est pas réappliqué)
    expect(by.el2).toMatchObject({ leftFromSales: 4, missingUnits: 1, baselineSource: 'logistic-live' })
    // el3 : rien → null, jamais 0 − 5 = −5
    expect(by.el3).toMatchObject({ leftFromSales: null, missingUnits: null, baselineSource: null })
  })

  it('PdV en repli Logistic, article que le registre ne suit pas → null (pas un 0 fabriqué)', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el2', 'a')]: 3, [K('el2', 'b')]: 1 },
      logisticLeftByKey: { [K('el2', 'a')]: 4 },
    })
    const by = Object.fromEntries(lines.map((l) => [l.itemKey, l]))
    expect(by.a.leftFromSales).toBe(4)
    expect(by.b.leftFromSales).toBeNull()
  })

  it('sans preEventElementIds (appelant historique) : tout PdV réputé couvert, absent → 0', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el2', 'a')]: 3 },
      preEventUnitsByKey: { [K('el1', 'a')]: 10 },
      soldUnitsByKey: { [K('el2', 'a')]: 1 },
    })
    expect(lines[0]).toMatchObject({ leftFromSales: -1, baselineSource: 'pre-event' })
  })
})
