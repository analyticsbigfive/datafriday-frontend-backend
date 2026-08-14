// Tests de la photo figée RestockPlan (utils/restockPlanSnapshot.js).
//
// Le PREMIER test est le test d'identité : recomputeShoppingFromOverrides sur
// un plan sans correction doit renvoyer EXACTEMENT snapshot.shoppingGroups.
// S'il diverge, le grain de recipeCoeffs est faux (cf. ADR-0005) — échec tôt
// et fort, avant toute UI.

import {
  buildPlanSnapshot,
  buildRecipeCoeffs,
  applyPlanEdits,
  recomputeShoppingFromOverrides,
  recomputePackaging,
  planCounters,
  estimateSnapshotBytes,
} from '@/utils/restockPlanSnapshot'

// ---------------------------------------------------------------------------
// Fixtures : un plan « produits finis » réaliste — 2 shops, 2 articles, dont un
// avec packaging et du stock Storage partiellement couvrant.
// ---------------------------------------------------------------------------

const livePackaging = {
  source: { id: 'src-beer', name: 'Bière blonde 33cl', purchaseUnitConversion: 1 },
  packedCount: 4,
  packagingType: 'Carton',
  packagingUnitNumber: 24,
  packagingUnit: 'pcs',
  looseQty: 96,
}

function makeRestockRows() {
  return [
    {
      rowKey: 'shop-1|||beer',
      shopId: 'shop-1',
      shopName: 'Bar Nord',
      itemKey: 'beer',
      itemId: 'src-beer',
      sourceId: 'src-beer',
      itemName: 'Bière blonde 33cl',
      unit: 'pcs',
      totalQuantity: 120,
      targetQuantity: 120,
      remainingQuantity: 30,
      restockQuantity: 90,
      packaging: { ...livePackaging },
      eventIds: ['ev-1'],
      eventNames: ['PSG – OM'],
      sources: [{ menuItemName: 'Bière pression', componentQuantity: 120, menuItemQuantity: 120 }],
      sourceBreakdown: [{ key: 'Bière pression', name: 'Bière pression', quantity: 120, unit: 'pcs' }],
      isExpanded: true,
      shopType: 'bar',
    },
    {
      rowKey: 'shop-2|||beer',
      shopId: 'shop-2',
      shopName: 'Bar Sud',
      itemKey: 'beer',
      itemId: 'src-beer',
      sourceId: 'src-beer',
      itemName: 'Bière blonde 33cl',
      unit: 'pcs',
      totalQuantity: 60,
      targetQuantity: 60,
      remainingQuantity: 10,
      restockQuantity: 50,
      packaging: { ...livePackaging, packedCount: 3, looseQty: 72 },
      eventIds: ['ev-1', 'ev-2'],
      eventNames: ['PSG – OM', 'Concert'],
      sources: [],
      sourceBreakdown: [],
    },
    {
      rowKey: 'shop-1|||hotdog',
      shopId: 'shop-1',
      shopName: 'Bar Nord',
      itemKey: 'hotdog',
      itemId: 'src-hotdog',
      sourceId: 'src-hotdog',
      itemName: 'Hot-dog',
      unit: 'pcs',
      totalQuantity: 40,
      targetQuantity: 40,
      remainingQuantity: 0,
      restockQuantity: 40,
      packaging: null,
      eventIds: ['ev-1'],
      eventNames: ['PSG – OM'],
      sources: [],
      sourceBreakdown: [],
    },
  ]
}

// Feuille de course nette « live » cohérente avec les lignes ci-dessus :
// beer : restockNeed 140 (90+50), storage 20 → buy 120 ; packaging recalculé
// sur 120 : ceil(120/24*1) = 5 cartons.
// hotdog : restockNeed 40, storage 0 → buy 40, pas de packaging.
function makeShoppingGroups() {
  return [
    {
      supplierId: 'sup-1',
      supplierName: 'Brasserie X',
      supplierEmail: 'contact@brasserie.example',
      supplierPhone: '0102030405',
      items: [
        {
          itemKey: 'beer',
          itemName: 'Bière blonde 33cl',
          itemType: null,
          unit: 'pcs',
          quantity: 120,
          buyQuantity: 120,
          restockNeed: 140,
          predicted: 180,
          shopOnHand: 40,
          storageOnHand: 20,
          packaging: { ...livePackaging, packedCount: 5, looseQty: 120 },
          shopNames: ['Bar Nord', 'Bar Sud'],
          usedIn: ['Bière pression'],
        },
      ],
    },
    {
      supplierId: '__unknown_supplier__',
      supplierName: 'Produits finis',
      supplierEmail: '',
      supplierPhone: '',
      items: [
        {
          itemKey: 'hotdog',
          itemName: 'Hot-dog',
          itemType: null,
          unit: 'pcs',
          quantity: 40,
          buyQuantity: 40,
          restockNeed: 40,
          predicted: 40,
          shopOnHand: 0,
          storageOnHand: 0,
          packaging: null,
          shopNames: ['Bar Nord'],
          usedIn: [],
        },
      ],
    },
  ]
}

function makeSnapshot() {
  const restockRows = makeRestockRows()
  return buildPlanSnapshot({
    stockRows: [
      { itemKey: 'beer', itemName: 'Bière blonde 33cl', unit: 'pcs', totalQuantity: 180 },
      { itemKey: 'hotdog', itemName: 'Hot-dog', unit: 'pcs', totalQuantity: 40 },
    ],
    restockRows,
    shoppingGroups: makeShoppingGroups(),
    recipeCoeffs: buildRecipeCoeffs({ restockRows, shoppingMode: 'finished' }),
    unmatchedStorage: [{ itemId: 'x', name: 'Glaçons', unit: 'kg', qty: 12 }],
    inputs: {
      objectiveSource: 'forecast',
      referenceEventId: null,
      selectedEventIds: ['ev-1', 'ev-2'],
      scenarioByEventId: { 'ev-1': 'v-42' },
      stockAdjustments: { beer: 110 },
      stockPackedModes: { beer: true },
      stockExcluded: {},
      restockedRows: { 'shop-1|||beer': true },
      shoppingMode: 'finished',
      snapshotAt: '2026-08-04T10:00:00.000Z',
    },
    events: [
      { id: 'ev-1', eventName: 'PSG – OM', eventDate: '2026-08-01' },
      { id: 'ev-2', name: 'Concert', date: '2026-08-10' },
    ],
  })
}

// ---------------------------------------------------------------------------
// 1. TEST D'IDENTITÉ — le premier, le discriminant.
// ---------------------------------------------------------------------------

describe('recomputeShoppingFromOverrides — identité', () => {
  it('sans correction, renvoie exactement snapshot.shoppingGroups', () => {
    const snapshot = makeSnapshot()
    expect(recomputeShoppingFromOverrides(snapshot, {})).toEqual(snapshot.shoppingGroups)
  })

  it('overrides égaux aux quantités figées → toujours identique', () => {
    const snapshot = makeSnapshot()
    const overrides = { 'shop-1|||beer': 90, 'shop-2|||beer': 50, 'shop-1|||hotdog': 40 }
    expect(recomputeShoppingFromOverrides(snapshot, overrides)).toEqual(snapshot.shoppingGroups)
  })

  it('ne mute jamais la photo', () => {
    const snapshot = makeSnapshot()
    const before = JSON.parse(JSON.stringify(snapshot.shoppingGroups))
    const out = recomputeShoppingFromOverrides(snapshot, { 'shop-1|||beer': 200 })
    out[0].items[0].quantity = -1
    out[0].supplierName = 'muté'
    expect(snapshot.shoppingGroups).toEqual(before)
  })
})

// ---------------------------------------------------------------------------
// 2. Whitelist des champs figés.
// ---------------------------------------------------------------------------

describe('buildPlanSnapshot — whitelist', () => {
  it('restockLines : sources/isExpanded/shopType absents, eventIds conservé', () => {
    const snapshot = makeSnapshot()
    const line = snapshot.restockLines[0]
    expect(line.sources).toBeUndefined()
    expect(line.isExpanded).toBeUndefined()
    expect(line.shopType).toBeUndefined()
    expect(line.eventIds).toEqual(['ev-1'])
    expect(snapshot.restockLines[1].eventIds).toEqual(['ev-1', 'ev-2'])
    expect(line.sourceBreakdown).toEqual([
      { key: 'Bière pression', name: 'Bière pression', quantity: 120, unit: 'pcs' },
    ])
  })

  it('packaging figé : source (objet catalogue) jeté, purchaseUnitConversion extrait', () => {
    const snapshot = makeSnapshot()
    const packaging = snapshot.restockLines[0].packaging
    expect(packaging.source).toBeUndefined()
    expect(packaging.purchaseUnitConversion).toBe(1)
    expect(packaging.packedCount).toBe(4)
  })

  it('stockLines : adjustmentPercent depuis les entrées, défaut 100', () => {
    const snapshot = makeSnapshot()
    expect(snapshot.stockLines).toEqual([
      {
        itemKey: 'beer', itemName: 'Bière blonde 33cl', unit: 'pcs',
        totalQuantity: 180, adjustmentPercent: 110, packedMode: true, excluded: false,
      },
      {
        itemKey: 'hotdog', itemName: 'Hot-dog', unit: 'pcs',
        totalQuantity: 40, adjustmentPercent: 100, packedMode: false, excluded: false,
      },
    ])
  })

  it('eventsSnapshot normalise name|eventName et date|eventDate', () => {
    const snapshot = makeSnapshot()
    expect(snapshot.eventsSnapshot).toEqual([
      { id: 'ev-1', name: 'PSG – OM', date: '2026-08-01' },
      { id: 'ev-2', name: 'Concert', date: '2026-08-10' },
    ])
  })

  it('compteurs dénormalisés au moment de la photo', () => {
    const snapshot = makeSnapshot()
    expect(snapshot.lineCount).toBe(3)
    expect(snapshot.shoppingItemCount).toBe(2)
    expect(planCounters(snapshot)).toEqual({ lineCount: 3, shoppingItemCount: 2 })
  })

  it('meta porte unmatchedStorage et snapshotAt', () => {
    const snapshot = makeSnapshot()
    expect(snapshot.meta.snapshotAt).toBe('2026-08-04T10:00:00.000Z')
    expect(snapshot.meta.unmatchedStorage).toEqual([
      { itemId: 'x', name: 'Glaçons', unit: 'kg', qty: 12 },
    ])
  })

  // Maquette 14-08 — état de l'onglet Espaces de stockage figé sous meta.storage
  // (jamais top-level : pickWritable d'un backend non redéployé le jetterait).
  it('meta.storage fige percents/global/source quand fournis', () => {
    const restockRows = makeRestockRows()
    const snapshot = buildPlanSnapshot({
      restockRows,
      shoppingGroups: makeShoppingGroups(),
      recipeCoeffs: buildRecipeCoeffs({ restockRows, shoppingMode: 'finished' }),
      inputs: {
        storagePercents: { 'storage:el-1:biere blonde 33cl': 150 },
        storageGlobalPercent: 120,
        storageGlobalEnabled: false,
        sourceInventoryEventId: 'ev-9',
      },
    })
    expect(snapshot.meta.storage).toEqual({
      percents: { 'storage:el-1:biere blonde 33cl': 150 },
      globalPercent: 120,
      globalEnabled: false,
      sourceInventoryEventId: 'ev-9',
    })
  })

  it('meta.storage : défauts sains sans inputs storage (plans antérieurs)', () => {
    const snapshot = makeSnapshot()
    expect(snapshot.meta.storage).toEqual({
      percents: {},
      globalPercent: 100,
      globalEnabled: true,
      sourceInventoryEventId: null,
    })
  })

  // BUG-296-01 — ventilation figée.
  it('restockLines portent surplusLoose et finalStock (0 par défaut)', () => {
    const restockRows = makeRestockRows()
    restockRows[0].surplusLoose = 6
    restockRows[0].finalStock = 6
    const snapshot = buildPlanSnapshot({
      restockRows,
      shoppingGroups: makeShoppingGroups(),
      recipeCoeffs: buildRecipeCoeffs({ restockRows, shoppingMode: 'finished' }),
      inputs: { selectedEventIds: [] },
    })
    expect(snapshot.restockLines[0].surplusLoose).toBe(6)
    expect(snapshot.restockLines[0].finalStock).toBe(6)
    expect(snapshot.restockLines[1].surplusLoose).toBe(0)
    expect(snapshot.restockLines[1].finalStock).toBe(0)
  })

  it('stockLines figent la ventilation quand stockOutcomes est fourni, sinon rien', () => {
    const restockRows = makeRestockRows()
    const stockRows = [
      { itemKey: 'beer', itemName: 'Bière blonde 33cl', unit: 'pcs', totalQuantity: 180 },
    ]
    const outcomes = {
      beer: {
        targetQuantity: 180, remainingQuantity: 40, gap: 140, packedCount: 7,
        coveredQuantity: 140, surplusLoose: 0, finalStock: 0,
        packagingType: 'Carton', packagingUnitNumber: 24, packagingUnit: 'pcs',
      },
    }
    const withOutcomes = buildPlanSnapshot({
      stockRows, restockRows,
      recipeCoeffs: buildRecipeCoeffs({ restockRows, shoppingMode: 'finished' }),
      inputs: { selectedEventIds: [] },
      stockOutcomes: outcomes,
    })
    expect(withOutcomes.stockLines[0]).toMatchObject({
      remainingQuantity: 40, gap: 140, packedCount: 7, coveredQuantity: 140,
      surplusLoose: 0, finalStock: 0, packagingType: 'Carton',
      packagingUnitNumber: 24, packagingUnit: 'pcs',
    })
    // Sans stockOutcomes (anciens appels), aucune clé de ventilation.
    const without = buildPlanSnapshot({
      stockRows, restockRows,
      recipeCoeffs: buildRecipeCoeffs({ restockRows, shoppingMode: 'finished' }),
      inputs: { selectedEventIds: [] },
    })
    expect(without.stockLines[0].gap).toBeUndefined()
    expect(without.stockLines[0].remainingQuantity).toBeUndefined()
  })

  it('immuabilité : muter les lignes vivantes ne change pas la photo', () => {
    const restockRows = makeRestockRows()
    const shoppingGroups = makeShoppingGroups()
    const snapshot = buildPlanSnapshot({
      restockRows,
      shoppingGroups,
      recipeCoeffs: buildRecipeCoeffs({ restockRows, shoppingMode: 'finished' }),
      inputs: { selectedEventIds: [] },
    })
    restockRows[0].restockQuantity = 9999
    restockRows[0].eventIds.push('ev-hacked')
    shoppingGroups[0].items[0].quantity = -5
    shoppingGroups[0].items[0].shopNames.push('hacked')
    expect(snapshot.restockLines[0].restockQuantity).toBe(90)
    expect(snapshot.restockLines[0].eventIds).toEqual(['ev-1'])
    expect(snapshot.shoppingGroups[0].items[0].quantity).toBe(120)
    expect(snapshot.shoppingGroups[0].items[0].shopNames).toEqual(['Bar Nord', 'Bar Sud'])
  })
})

// ---------------------------------------------------------------------------
// 3. buildRecipeCoeffs.
// ---------------------------------------------------------------------------

describe('buildRecipeCoeffs', () => {
  it('mode finished : coefficient 1 vers soi-même, une entrée par itemKey', () => {
    const coeffs = buildRecipeCoeffs({ restockRows: makeRestockRows(), shoppingMode: 'finished' })
    expect(coeffs).toEqual({
      beer: [{ itemKey: 'beer', perUnit: 1 }],
      hotdog: [{ itemKey: 'hotdog', perUnit: 1 }],
    })
  })

  it('mode ingredients : un composant explose en feuilles via flattenComponentDef', () => {
    const components = [
      {
        id: 'comp-sauce',
        name: 'Sauce pickle',
        numberOfUnitsRecipe: 2,
        subComponents: [
          { name: 'Vinaigre', unit: 'L', numberOfUnits: 1, sourceId: 'ing-vinaigre', itemType: 'Ingredient' },
          { name: 'Ail', unit: 'kg', numberOfUnits: 4, sourceId: 'ing-ail', itemType: 'Ingredient' },
        ],
      },
    ]
    const rows = [
      {
        rowKey: 's|||sauce', itemKey: 'sauce', itemId: 'comp-sauce', sourceId: 'comp-sauce',
        itemName: 'Sauce pickle', unit: 'L',
      },
    ]
    const coeffs = buildRecipeCoeffs({ restockRows: rows, shoppingMode: 'ingredients', components })
    // qtyFactor = numberOfUnits / numberOfUnitsRecipe : 1/2 et 4/2.
    expect(coeffs.sauce).toEqual([
      { itemKey: 'ing-vinaigre|||L', perUnit: 0.5 },
      { itemKey: 'ing-ail|||kg', perUnit: 2 },
    ])
  })

  it('mode ingredients sans définition catalogue : repli vers soi-même', () => {
    const rows = [
      { rowKey: 's|||nachos', itemKey: 'nachos', itemId: 'src-nachos', sourceId: null, itemName: 'Nachos', unit: 'pcs' },
    ]
    const coeffs = buildRecipeCoeffs({ restockRows: rows, shoppingMode: 'ingredients', components: [] })
    expect(coeffs.nachos).toEqual([{ itemKey: 'src-nachos|||pcs', perUnit: 1 }])
  })
})

// ---------------------------------------------------------------------------
// 4. applyPlanEdits.
// ---------------------------------------------------------------------------

describe('applyPlanEdits', () => {
  it('applique une correction valide et marque la ligne éditée', () => {
    const snapshot = makeSnapshot()
    const lines = applyPlanEdits(snapshot.restockLines, { 'shop-1|||beer': 120 })
    const edited = lines.find((l) => l.rowKey === 'shop-1|||beer')
    expect(edited.restockQuantity).toBe(120)
    expect(edited.edited).toBe(true)
    // Packaging rejoué sur la nouvelle quantité : ceil(120/24*1) = 5.
    expect(edited.packaging.packedCount).toBe(5)
    expect(edited.packaging.looseQty).toBe(120)
    // Les autres lignes ressortent sans marqueur, valeurs intactes.
    const untouched = lines.find((l) => l.rowKey === 'shop-2|||beer')
    expect(untouched.restockQuantity).toBe(50)
    expect(untouched.edited).toBeUndefined()
  })

  it('ignore rowKey inconnu, valeurs non numériques et négatives', () => {
    const snapshot = makeSnapshot()
    const lines = applyPlanEdits(snapshot.restockLines, {
      'ghost|||row': 12,
      'shop-1|||beer': 'abc',
      'shop-2|||beer': -3,
      'shop-1|||hotdog': null,
    })
    expect(lines.map((l) => l.restockQuantity)).toEqual([90, 50, 40])
    expect(lines.some((l) => l.edited)).toBe(false)
  })

  it('ne mute pas les lignes figées', () => {
    const snapshot = makeSnapshot()
    const before = JSON.parse(JSON.stringify(snapshot.restockLines))
    applyPlanEdits(snapshot.restockLines, { 'shop-1|||beer': 999 })
    expect(snapshot.restockLines).toEqual(before)
  })

  // BUG-296-01 — surplus/stock final recalculés depuis les valeurs FIGÉES.
  it('override recalcule surplusLoose et finalStock depuis target/remaining figés', () => {
    const snapshot = makeSnapshot()
    // shop-1|||beer figé : target 120, remaining 30 → gap 90. Override 100 :
    // surplus 10, final 30 + 100 − 120 = 10.
    const lines = applyPlanEdits(snapshot.restockLines, { 'shop-1|||beer': 100 })
    const edited = lines.find((l) => l.rowKey === 'shop-1|||beer')
    expect(edited.surplusLoose).toBe(10)
    expect(edited.finalStock).toBe(10)
    // Sans override, valeurs figées intactes (ici 0 : dépôt = gap exact).
    const untouched = lines.find((l) => l.rowKey === 'shop-2|||beer')
    expect(untouched.surplusLoose).toBe(0)
    expect(untouched.finalStock).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// 5. recomputeShoppingFromOverrides avec corrections.
// ---------------------------------------------------------------------------

describe('recomputeShoppingFromOverrides — corrections', () => {
  it('delta × coefficient figé, netting Storage et packaging rejoués', () => {
    const snapshot = makeSnapshot()
    // 90 → 120 sur shop-1 : delta +30. beer restockNeed 140 → 170,
    // storage figé 20 → buy 150, packaging ceil(150/24) = 7 cartons.
    const out = recomputeShoppingFromOverrides(snapshot, { 'shop-1|||beer': 120 })
    const beer = out[0].items[0]
    expect(beer.restockNeed).toBe(170)
    expect(beer.buyQuantity).toBe(150)
    expect(beer.quantity).toBe(150)
    expect(beer.packaging.packedCount).toBe(7)
    expect(beer.packaging.looseQty).toBe(168)
    // storageOnHand/shopOnHand/predicted : valeurs FIGÉES, jamais recalculées.
    expect(beer.storageOnHand).toBe(20)
    expect(beer.shopOnHand).toBe(40)
    expect(beer.predicted).toBe(180)
    // Item sans delta : clone strict du figé.
    expect(out[1]).toEqual(snapshot.shoppingGroups[1])
  })

  it('somme les deltas de plusieurs lignes du même article', () => {
    const snapshot = makeSnapshot()
    // shop-1 : 90→100 (+10), shop-2 : 50→30 (−20) → delta net −10.
    const out = recomputeShoppingFromOverrides(snapshot, {
      'shop-1|||beer': 100,
      'shop-2|||beer': 30,
    })
    const beer = out[0].items[0]
    expect(beer.restockNeed).toBe(130)
    expect(beer.buyQuantity).toBe(110)
  })

  it('un article entièrement couvert (buy = 0) sort de la liste, son groupe aussi si vide', () => {
    const snapshot = makeSnapshot()
    const out = recomputeShoppingFromOverrides(snapshot, {
      'shop-1|||beer': 0,
      'shop-2|||beer': 10,
    })
    // restockNeed 140 − 130 = 10, storage 20 → buy 0 → l'item et son groupe sortent.
    expect(out).toHaveLength(1)
    expect(out[0].items[0].itemKey).toBe('hotdog')
  })

  it('override invalide → aucun delta', () => {
    const snapshot = makeSnapshot()
    const out = recomputeShoppingFromOverrides(snapshot, { 'shop-1|||beer': -5, ghost: 3 })
    expect(out).toEqual(snapshot.shoppingGroups)
  })
})

// ---------------------------------------------------------------------------
// 6. recomputePackaging + estimateSnapshotBytes.
// ---------------------------------------------------------------------------

describe('recomputePackaging', () => {
  it('rejoue la formule de computePackagingForQuantity sur les champs figés', () => {
    const frozen = {
      packedCount: 4, packagingType: 'Carton', packagingUnitNumber: 24,
      packagingUnit: 'pcs', looseQty: 96, purchaseUnitConversion: 2,
    }
    const out = recomputePackaging(frozen, 30)
    expect(out.packedCount).toBe(Math.ceil((30 / 24) * 2)) // = 3
    expect(out.looseQty).toBe(72)
  })

  it('null → null ; packagingUnitNumber absent → clone tel quel', () => {
    expect(recomputePackaging(null, 10)).toBeNull()
    const broken = { packedCount: 1, packagingUnitNumber: 0 }
    expect(recomputePackaging(broken, 10)).toEqual(broken)
  })
})

describe('estimateSnapshotBytes', () => {
  it('mesure un plan de 600 lignes sous la garde backend (1 Mo)', () => {
    const restockRows = Array.from({ length: 600 }, (_, i) => ({
      rowKey: `shop-${i % 12}|||item-${i}`,
      shopId: `shop-${i % 12}`,
      shopName: `Buvette tribune ${i % 12}`,
      itemKey: `item-${i}`,
      itemName: `Article de démonstration numéro ${i}`,
      unit: 'pcs',
      targetQuantity: 100 + i,
      remainingQuantity: 10,
      restockQuantity: 90 + i,
      packaging: { ...livePackaging },
      eventIds: ['ev-1'],
      eventNames: ['PSG – OM'],
      sourceBreakdown: [{ key: 'Plat', name: 'Plat', quantity: 100, unit: 'pcs' }],
    }))
    const snapshot = buildPlanSnapshot({
      restockRows,
      shoppingGroups: [],
      recipeCoeffs: buildRecipeCoeffs({ restockRows, shoppingMode: 'finished' }),
      inputs: { selectedEventIds: ['ev-1'] },
    })
    const bytes = estimateSnapshotBytes(snapshot)
    expect(bytes).toBeGreaterThan(0)
    expect(bytes).toBeLessThan(1_000_000)
  })
})

// Badge « Attendu » du Pre-event Inventory (retour JLH 13/08) : somme des
// cibles par élément × unité depuis les lignes figées d'un plan sauvegardé.
describe('aggregateExpectedUnitsByElement', () => {
  const { aggregateExpectedUnitsByElement } = require('@/utils/restockPlanSnapshot')

  it('somme targetQuantity par élément et par unité', () => {
    const rows = [
      { shopId: 'el-1', unit: 'Pc', targetQuantity: 1000 },
      { shopId: 'el-1', unit: 'Pc', targetQuantity: 250 },
      { shopId: 'el-1', unit: 'Kg', targetQuantity: 12 },
      { shopId: 'el-2', unit: 'L', targetQuantity: 40 },
    ]
    expect(aggregateExpectedUnitsByElement(rows)).toEqual({
      'el-1': [
        { unit: 'Pc', total: 1250 },
        { unit: 'Kg', total: 12 },
      ],
      'el-2': [{ unit: 'L', total: 40 }],
    })
  })

  it('ignore les lignes sans élément ou sans cible positive', () => {
    const rows = [
      { shopId: '', unit: 'Pc', targetQuantity: 10 },
      { unit: 'Pc', targetQuantity: 10 },
      { shopId: 'el-1', unit: 'Pc', targetQuantity: 0 },
      { shopId: 'el-1', unit: 'Pc', targetQuantity: -5 },
      { shopId: 'el-1', unit: 'Pc', targetQuantity: 'abc' },
    ]
    expect(aggregateExpectedUnitsByElement(rows)).toEqual({})
  })

  it("replie l'unité vide sur fallbackUnit", () => {
    const rows = [
      { shopId: 'el-1', unit: '', targetQuantity: 3 },
      { shopId: 'el-1', unit: '  ', targetQuantity: 2 },
    ]
    expect(aggregateExpectedUnitsByElement(rows, { fallbackUnit: 'pc' })).toEqual({
      'el-1': [{ unit: 'pc', total: 5 }],
    })
  })

  it('entrée nulle ou vide → objet vide', () => {
    expect(aggregateExpectedUnitsByElement(null)).toEqual({})
    expect(aggregateExpectedUnitsByElement([])).toEqual({})
  })
})
