import {
  reconciliationKey,
  buildPostEventReconciliationLines,
  buildSoldUnitsFromConsumption,
  computeReconciliationSummary,
} from '@/utils/postEventReconciliation'

const K = reconciliationKey

describe('buildPostEventReconciliationLines', () => {
  it('computes leftFromSales, missingUnits and missingValue for a full line', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'beer')]: 12 },
      preEventUnitsByKey: { [K('el1', 'beer')]: 740 },
      soldUnitsByKey: { [K('el1', 'beer')]: 698 },
      predictedUnitsByKey: { [K('el1', 'beer')]: 746 },
      unitCostByItemId: { beer: 2.5 },
      elementNameById: new Map([['el1', 'Parvis']]),
      itemNameById: { beer: 'Pinte bière 50cl' },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({
      elementId: 'el1',
      elementName: 'Parvis',
      itemKey: 'beer',
      itemName: 'Pinte bière 50cl',
      soldUnits: 698,
      predictedUnits: 746,
      leftFromSales: 42, // 740 − 698
      countedUnits: 12,
      missingUnits: 30, // 42 − 12
      missingValue: 75, // 30 × 2.5
      unitCost: 2.5,
    })
  })

  it('uses the union of keys — sold-but-never-counted and counted-but-never-sold both appear', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'a')]: 5 },
      soldUnitsByKey: { [K('el1', 'b')]: 8 },
    })
    const byItem = Object.fromEntries(lines.map((l) => [l.itemKey, l]))
    expect(byItem.a).toMatchObject({ countedUnits: 5, soldUnits: 0 })
    expect(byItem.b).toMatchObject({ countedUnits: 0, soldUnits: 8 })
  })

  it('keeps predictedUnits null without a scenario, 0 when the scenario omits the item', () => {
    const noScenario = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'a')]: 1 },
      predictedUnitsByKey: null,
    })
    expect(noScenario[0].predictedUnits).toBeNull()

    const withScenario = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'a')]: 1 },
      predictedUnitsByKey: { [K('el1', 'other')]: 10 },
    })
    expect(withScenario.find((l) => l.itemKey === 'a').predictedUnits).toBe(0)
  })

  it('keeps left/missing/value null without a pre-event inventory', () => {
    const [line] = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'a')]: 3 },
      soldUnitsByKey: { [K('el1', 'a')]: 7 },
      preEventUnitsByKey: null,
      unitCostByItemId: { a: 9 },
    })
    expect(line.leftFromSales).toBeNull()
    expect(line.missingUnits).toBeNull()
    expect(line.missingValue).toBeNull()
  })

  it('keeps missingValue null without a unit cost, and supports negative missing (surplus)', () => {
    const [line] = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'a')]: 10 },
      preEventUnitsByKey: { [K('el1', 'a')]: 4 },
      soldUnitsByKey: {},
    })
    expect(line.leftFromSales).toBe(4)
    expect(line.missingUnits).toBe(-6) // surplus compté
    expect(line.missingValue).toBeNull()
  })

  it('drops unaddressable keys (empty elementId or itemId)', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: { '|orphan': 1, 'el1|': 2, [K('el1', 'ok')]: 3 },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].itemKey).toBe('ok')
  })

  it('sorts by element name then item name', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: {
        [K('el2', 'b')]: 1,
        [K('el1', 'z')]: 1,
        [K('el1', 'a')]: 1,
      },
      elementNameById: { el1: 'Alpha', el2: 'Beta' },
      itemNameById: { a: 'Aa', z: 'Zz', b: 'Bb' },
    })
    expect(lines.map((l) => `${l.elementName}:${l.itemName}`)).toEqual([
      'Alpha:Aa',
      'Alpha:Zz',
      'Beta:Bb',
    ])
  })
})

describe('computeReconciliationSummary', () => {
  it('computes totals and diffPct', () => {
    const s = computeReconciliationSummary([
      { soldUnits: 698, predictedUnits: 746, missingUnits: 30, missingValue: 75 },
      { soldUnits: 340, predictedUnits: 300, missingUnits: 0, missingValue: 0 },
    ])
    expect(s.totalSold).toBe(1038)
    expect(s.totalPredicted).toBe(1046)
    expect(s.diffPct).toBeCloseTo(-0.76, 1) // (1038−1046)/1046
    expect(s.totalMissingUnits).toBe(30)
    expect(s.totalMissingValue).toBe(75)
  })

  it('ignores negative missing (surplus never refunds a loss)', () => {
    const s = computeReconciliationSummary([
      { soldUnits: 0, predictedUnits: null, missingUnits: 10, missingValue: 20 },
      { soldUnits: 0, predictedUnits: null, missingUnits: -4, missingValue: -8 },
    ])
    expect(s.totalMissingUnits).toBe(10)
    expect(s.totalMissingValue).toBe(20)
  })

  it('returns nulls when sources are absent', () => {
    const s = computeReconciliationSummary([
      { soldUnits: 5, predictedUnits: null, missingUnits: null, missingValue: null },
    ])
    expect(s.totalPredicted).toBeNull()
    expect(s.diffPct).toBeNull()
    expect(s.totalMissingUnits).toBeNull()
    expect(s.totalMissingValue).toBeNull()
  })

  it('diffPct is null when total predicted is 0 (no ±Infinity)', () => {
    const s = computeReconciliationSummary([{ soldUnits: 5, predictedUnits: 0 }])
    expect(s.diffPct).toBeNull()
  })

  // Q35 Option 1 : le vendu peut être au grain ingrédient (predictedUnits null).
  it('diffPct compares like with like — ingredient-grain sold (predicted null) stays out, totalSold keeps everything', () => {
    const s = computeReconciliationSummary([
      { soldUnits: 100, predictedUnits: 100 }, // vendable : prédit 100, vendu 100
      { soldUnits: 700, predictedUnits: null }, // fût explosé : jamais prédit
    ])
    expect(s.totalSold).toBe(800) // chip « Total vendu » : tout
    expect(s.diffPct).toBe(0) // (100−100)/100 — pas (800−100)/100
  })
})

describe('buildSoldUnitsFromConsumption (Q35 Option 1)', () => {
  const normalize = (s) =>
    String(s ?? '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .trim()
      .toLowerCase()

  const params = () => ({
    elementIdSet: new Set(['el1']),
    itemIdByNormName: new Map([
      [normalize('Budweiser Fût'), 'ing-fut'],
      [normalize('Coca-Cola CAN'), 'mi-coca'],
    ]),
    normalize,
  })

  it('joins by normalized itemKey and keys by elementId|itemId', () => {
    const r = buildSoldUnitsFromConsumption(
      [
        { elementId: 'el1', itemKey: 'Budweiser Fût', quantity: 7 },
        { elementId: 'el1', itemKey: 'budweiser fut ', quantity: 0.5 }, // diacritiques/casse/espace
        { elementId: 'el1', itemKey: 'Coca-Cola CAN', quantity: 3 },
      ],
      params(),
    )
    expect(r.soldUnitsByKey).toEqual({
      [K('el1', 'ing-fut')]: 7.5,
      [K('el1', 'mi-coca')]: 3,
    })
    expect(r.unjoinedUnits).toBe(0)
  })

  it('routes unknown item names and foreign elements to unjoined — never swallowed, never zeroed', () => {
    const r = buildSoldUnitsFromConsumption(
      [
        { elementId: 'el1', itemKey: 'Article mystère', quantity: 4 },
        { elementId: 'el-autre-espace', itemKey: 'Budweiser Fût', quantity: 2 },
        { elementId: 'el1', itemKey: 'Budweiser Fût', quantity: 0 }, // qty 0 ignorée
      ],
      params(),
    )
    expect(r.soldUnitsByKey).toEqual({})
    expect([...r.unjoinedItems]).toEqual(['Article mystère'])
    expect([...r.unjoinedShops]).toEqual(['el-autre-espace'])
    expect(r.unjoinedUnits).toBe(6)
  })

  it('tolerates empty/absent input', () => {
    expect(buildSoldUnitsFromConsumption(null, params()).soldUnitsByKey).toEqual({})
    expect(buildSoldUnitsFromConsumption([], params()).unjoinedUnits).toBe(0)
  })
})

describe('buildPostEventReconciliationLines : prédit au grain inventaire (BUG-378-02)', () => {
  it('scénario présent : ligne absente du prédit → 0 réel, ligne prédite → sa valeur, quel que soit le grain', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'mi-coca')]: 1, [K('el1', 'mp-fut')]: 2 },
      predictedUnitsByKey: { [K('el1', 'mp-fut')]: 3.5 },
    })
    const byItem = Object.fromEntries(lines.map((l) => [l.itemKey, l]))
    expect(byItem['mi-coca'].predictedUnits).toBe(0)
    expect(byItem['mp-fut'].predictedUnits).toBe(3.5)
  })

  it('sans scénario : predictedUnits null sur toutes les lignes (jamais un 0 fabriqué)', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: { [K('el1', 'mp-fut')]: 2 },
      predictedUnitsByKey: null,
    })
    expect(lines[0].predictedUnits).toBeNull()
  })
})

describe('buildSoldUnitsFromConsumption : jointure par identité (BUG-378-02)', () => {
  const normalize = (s) => String(s ?? '').trim().toLowerCase()

  it('itemRefId connu du comptage → jointure par id, même si le nom a changé', () => {
    const { soldUnitsByKey, unjoinedItems } = buildSoldUnitsFromConsumption(
      [{ elementId: 'el1', itemKey: 'Fût 30L (nouveau nom)', quantity: 4, itemKind: 'marketPrice', itemRefId: 'mp-fut' }],
      {
        elementIdSet: new Set(['el1']),
        itemIdByNormName: new Map([['fût 30l', 'mp-fut']]),
        countedItemIds: new Set(['mp-fut']),
        normalize,
      },
    )
    expect(soldUnitsByKey).toEqual({ [K('el1', 'mp-fut')]: 4 })
    expect(unjoinedItems.size).toBe(0)
  })

  it('itemRefId inconnu du comptage → repli par nom normalisé (backend antérieur ou identité étrangère)', () => {
    const { soldUnitsByKey } = buildSoldUnitsFromConsumption(
      [{ elementId: 'el1', itemKey: 'Fût 30L', quantity: 2, itemRefId: 'ing-fut' }],
      {
        elementIdSet: new Set(['el1']),
        itemIdByNormName: new Map([['fût 30l', 'mp-fut']]),
        countedItemIds: new Set(['mp-fut']),
        normalize,
      },
    )
    expect(soldUnitsByKey).toEqual({ [K('el1', 'mp-fut')]: 2 })
  })

  it('PdV vendeur hors périmètre compté : nommé par elementNameById, jamais l’identifiant brut', () => {
    const { unjoinedShops, unjoinedUnits } = buildSoldUnitsFromConsumption(
      [{ elementId: 'cmsx2mkmd7ayygpkznq74i8b1', itemKey: 'Coca', quantity: 5 }],
      {
        elementIdSet: new Set(['el1']),
        itemIdByNormName: new Map(),
        elementNameById: { cmsx2mkmd7ayygpkznq74i8b1: 'Click & Collect' },
        normalize,
      },
    )
    expect([...unjoinedShops]).toEqual(['Click & Collect'])
    expect(unjoinedUnits).toBe(5)
  })

  it('nom introuvable → repli sur l’identifiant (jamais avalé en silence)', () => {
    const { unjoinedShops } = buildSoldUnitsFromConsumption(
      [{ elementId: 'el-inconnu', itemKey: 'Coca', quantity: 1 }],
      { elementIdSet: new Set(['el1']), itemIdByNormName: new Map(), normalize },
    )
    expect([...unjoinedShops]).toEqual(['el-inconnu'])
  })

  it('sans countedItemIds (appelant historique) : comportement par nom inchangé', () => {
    const { soldUnitsByKey } = buildSoldUnitsFromConsumption(
      [{ elementId: 'el1', itemKey: 'Fût 30L', quantity: 2, itemRefId: 'mp-fut' }],
      { elementIdSet: new Set(['el1']), itemIdByNormName: new Map([['fût 30l', 'mp-fut']]), normalize },
    )
    expect(soldUnitsByKey).toEqual({ [K('el1', 'mp-fut')]: 2 })
  })
})

describe('buildPostEventReconciliationLines — mouvements Logistic de la fenêtre', () => {
  const base = {
    countedUnitsByKey: { [K('el1', 'beer')]: 30 },
    preEventUnitsByKey: { [K('el1', 'beer')]: 100 },
    soldUnitsByKey: { [K('el1', 'beer')]: 60 },
  }

  it('sans movementUnitsByKey : formule historique, lignes inchangées', () => {
    const [line] = buildPostEventReconciliationLines(base)
    expect(line.leftFromSales).toBe(40) // 100 − 60
    expect(line.missingUnits).toBe(10) // 40 − 30
    expect(line.movementUnits).toBeNull()
  })

  it('avec movements : leftFromSales = pre-event − vendu + mouvements', () => {
    const [line] = buildPostEventReconciliationLines({
      ...base,
      // Réapprovisionnement de 25 unités pendant le match.
      movementUnitsByKey: { [K('el1', 'beer')]: 25 },
    })
    expect(line.movementUnits).toBe(25)
    expect(line.leftFromSales).toBe(65) // 100 − 60 + 25
    expect(line.missingUnits).toBe(35) // 65 − 30
  })

  it('transfert SORTANT (mouvement négatif) : ne se lit plus comme un manquant', () => {
    const [line] = buildPostEventReconciliationLines({
      ...base,
      countedUnitsByKey: { [K('el1', 'beer')]: 10 },
      movementUnitsByKey: { [K('el1', 'beer')]: -30 },
    })
    // Sans le terme mouvements : left 40, compté 10 → 30 « manquants » fantômes.
    expect(line.leftFromSales).toBe(10) // 100 − 60 − 30
    expect(line.missingUnits).toBe(0)
  })

  it('une clé présente UNIQUEMENT dans les mouvements produit quand même une ligne', () => {
    const lines = buildPostEventReconciliationLines({
      countedUnitsByKey: {},
      preEventUnitsByKey: {},
      soldUnitsByKey: {},
      movementUnitsByKey: { [K('el9', 'ghost')]: 12 },
    })
    expect(lines).toHaveLength(1)
    expect(lines[0].movementUnits).toBe(12)
  })
})
