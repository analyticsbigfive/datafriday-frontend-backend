import { buildPredictedUnitsForReconciliation } from '@/utils/postEventPredicted'
import { reconciliationKey as K } from '@/utils/postEventReconciliation'

const normalize = (s) => String(s ?? '').trim().toLowerCase()

/** Index tel que le produit `buildPredictedNeedIndex` : deux clés par ligne
 *  (id + sourceId) et les lignes à plat. */
function makeIndex() {
  return {
    byItemId: {
      'el1|mp-fut': 3.5,
      'el1|src-fut': 3.5,
      'el1|mi-coca': 12,
      'el1|mp-ketchup': 0.8,
    },
    byItemName: { 'el1|fût 30l': 3.5, 'el1|coca 33cl': 12, 'el1|ketchup bidon': 0.8 },
    rows: [
      { elementId: 'el1', itemId: 'mp-fut', sourceId: 'src-fut', itemName: 'Fût 30L', units: 3.5 },
      { elementId: 'el1', itemId: 'mi-coca', sourceId: 'mi-coca', itemName: 'Coca 33cl', units: 12 },
      { elementId: 'el1', itemId: 'mp-ketchup', sourceId: null, itemName: 'Ketchup bidon', units: 0.8 },
    ],
  }
}

const PERIMETER = new Map([
  ['el1', [{ id: 'mp-fut', name: 'Fût 30L' }, { id: 'mi-coca', name: 'Coca 33cl' }, { id: 'mp-eau', name: 'Eau' }]],
  ['el2', [{ id: 'mp-fut', name: 'Fût 30L' }]],
])

describe('buildPredictedUnitsForReconciliation (BUG-378-02)', () => {
  it('pose le prédit PAR ARTICLE COMPTÉ, clé reconciliationKey, sans double compte id/sourceId', () => {
    const { predictedUnitsByKey } = buildPredictedUnitsForReconciliation({
      index: makeIndex(),
      version: { predictedRecords: [] },
      countedItemsByElement: PERIMETER,
      normalize,
    })
    expect(predictedUnitsByKey).toEqual({
      [K('el1', 'mp-fut')]: 3.5,
      [K('el1', 'mi-coca')]: 12,
    })
    // 'mp-eau' compté mais non prédit : absent de l'index → pas de clé (la ligne
    // recevra 0 via buildPostEventReconciliationLines, scénario présent).
    expect(predictedUnitsByKey[K('el1', 'mp-eau')]).toBeUndefined()
  })

  it('repli par nom normalisé quand l’id compté diffère (renommage / identité ingrédient vs market price)', () => {
    const { predictedUnitsByKey } = buildPredictedUnitsForReconciliation({
      index: makeIndex(),
      version: null,
      countedItemsByElement: new Map([['el1', [{ id: 'ing-fut', name: 'FÛT 30L' }]]]),
      normalize,
    })
    expect(predictedUnitsByKey).toEqual({ [K('el1', 'ing-fut')]: 3.5 })
  })

  it('article prédit sans article compté correspondant dans un PdV compté → unjoined.itemNames, jamais une ligne', () => {
    const { predictedUnitsByKey, unjoined } = buildPredictedUnitsForReconciliation({
      index: makeIndex(),
      version: { predictedRecords: [] },
      countedItemsByElement: PERIMETER,
      normalize,
    })
    expect(Object.keys(predictedUnitsByKey)).not.toContain(K('el1', 'mp-ketchup'))
    expect(unjoined).toEqual({ shopNames: [], itemNames: ['Ketchup bidon'], units: 0.8 })
  })

  it('PdV prédit hors périmètre compté → unjoined.shopNames (nom du record), unités cumulées', () => {
    const { unjoined } = buildPredictedUnitsForReconciliation({
      index: makeIndex(),
      version: {
        predictedRecords: [
          { shopId: 'el1', menuItemId: 'mi-coca', totalQuantity: 12 },
          { shopId: 'el-cc', shop: 'Click & Collect', menuItemId: 'mi-coca', totalQuantity: 7 },
          { shopId: 'el-lo', menuItemId: 'mi-coca', totalQuantity: 2 },
          { shopId: 'el-zero', shop: 'Vide', menuItemId: 'mi-coca', totalQuantity: 0 },
        ],
      },
      countedItemsByElement: PERIMETER,
      normalize,
    })
    expect(unjoined.shopNames).toEqual(['Click & Collect', 'el-lo'])
    expect(unjoined.units).toBe(9.8) // 7 + 2 + 0.8 (ketchup non joint)
  })

  it('index null (aucune prédiction exploitable) → predictedUnitsByKey null, unjoined limité aux PdV hors périmètre', () => {
    const { predictedUnitsByKey, unjoined } = buildPredictedUnitsForReconciliation({
      index: null,
      version: { predictedRecords: [{ shopId: 'el-cc', shop: 'Click & Collect', totalQuantity: 7 }] },
      countedItemsByElement: PERIMETER,
      normalize,
    })
    expect(predictedUnitsByKey).toBeNull()
    expect(unjoined).toEqual({ shopNames: ['Click & Collect'], itemNames: [], units: 7 })
  })

  it('rien à écarter → unjoined null (pas de faux bandeau) ; accepte un périmètre en objet', () => {
    const { unjoined, predictedUnitsByKey } = buildPredictedUnitsForReconciliation({
      index: { byItemId: { 'el1|mp-fut': 1 }, byItemName: {}, rows: [{ elementId: 'el1', itemId: 'mp-fut', units: 1 }] },
      version: { predictedRecords: [{ shopId: 'el1', totalQuantity: 1 }] },
      countedItemsByElement: { el1: [{ id: 'mp-fut', name: 'Fût' }] },
      normalize,
    })
    expect(unjoined).toBeNull()
    expect(predictedUnitsByKey).toEqual({ [K('el1', 'mp-fut')]: 1 })
  })
})
