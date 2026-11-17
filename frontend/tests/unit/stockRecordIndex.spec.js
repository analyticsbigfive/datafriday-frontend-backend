/**
 * Chantier perf/commandes-recompute : `buildStockRequirements` et
 * `buildMenuItemDemand` ne balaient plus tous les records pour chaque couple
 * (PdV, menu item) ; ils passent par `createStockRecordIndex`, construit une fois
 * par appel. Ce spec fixe deux choses :
 *   1. le contrat de l'index (ordre, types d'ids, homonymes de PdV, manuel pur) ;
 *   2. l'ÉQUIVALENCE stricte avec l'implémentation de référence (copie de l'ancien
 *      code dans `helpers/stockPlanningLegacy.js`) sur des données générées de
 *      façon déterministe : mêmes lignes, même ordre, mêmes sommes flottantes.
 */
import { createStockRecordIndex } from '@/utils/stockRecordIndex'
import { buildComponentLookup } from '@/utils/menuItemExpansion'
import {
  buildStockRequirements,
  buildMenuItemDemand,
  collectFbElements,
  shopRecordMatchesElement,
  getPredictedQuantityForElement,
  isManualOnlyForElement,
  deriveSelectedMenuItemsByShop,
  expandMenuItemStock,
  expandMenuItemStockWithLookup,
} from '@/utils/stockPlanning'
import {
  legacyBuildStockRequirements,
  legacyBuildMenuItemDemand,
  legacyShopRecordMatchesElement,
  legacyGetPredictedQuantityForElement,
  legacyIsManualOnlyForElement,
  legacyGetRecordMenuItemId,
  legacyDeriveSelectedMenuItemsByShop,
  legacyExpandMenuItemStock,
} from './helpers/stockPlanningLegacy'
import { buildScenario, createRng } from './helpers/stockPlanningScenarios'

// L'implémentation de référence est lente (c'est tout l'objet du chantier) :
// on laisse de la marge aux scénarios de taille réelle sur une machine chargée.
jest.setTimeout(60000)

let logSpy
beforeAll(() => {
  // L'expansion trace les composants sans nom : on garde la sortie lisible.
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
})
afterAll(() => {
  logSpy.mockRestore()
})

const shop = { id: 'shop-1', name: 'Bar Nord', type: 'shop' }
const legacyFind = (records, element, menuItemId) =>
  (records || []).find(
    (r) => legacyGetRecordMenuItemId(r) === menuItemId && legacyShopRecordMatchesElement(r, element),
  )

describe('createStockRecordIndex, contrat', () => {
  it('garde l\'ordre d\'origine : échantillon = premier record, somme dans le même ordre', () => {
    const records = [
      { shopId: 'shop-1', menuItemId: 'a', quantity: 0.1, tag: 'first' },
      { shopId: 'other', menuItemId: 'a', quantity: 999 },
      { shopId: 'shop-1', menuItemId: 'b', quantity: 5 },
      { shopId: 'shop-1', menuItemId: 'a', quantity: 0.2, tag: 'second' },
      { shopId: 'shop-1', menuItemId: 'a', quantity: 0.3, tag: 'third' },
    ]
    const index = createStockRecordIndex(records)
    expect(index.findSample(shop, 'a').tag).toBe('first')
    // 0.1 + 0.2 + 0.3 !== 0.3 + 0.2 + 0.1 en flottant : l'ordre compte.
    expect(index.getPredictedQuantity(shop, 'a')).toBe(0.1 + 0.2 + 0.3)
    const reversed = createStockRecordIndex([...records].reverse())
    expect(reversed.getPredictedQuantity(shop, 'a')).toBe(0.3 + 0.2 + 0.1)
    expect(index.getPredictedQuantity(shop, 'a')).not.toBe(reversed.getPredictedQuantity(shop, 'a'))
  })

  it('compare les ids avec === : 1 et "1" sont deux menu items distincts', () => {
    const records = [
      { shopId: 'shop-1', menuItemId: 1, quantity: 10 },
      { shopId: 'shop-1', menuItemId: '1', quantity: 3 },
    ]
    const index = createStockRecordIndex(records)
    expect(index.getPredictedQuantity(shop, 1)).toBe(10)
    expect(index.getPredictedQuantity(shop, '1')).toBe(3)
    expect(index.findSample(shop, 1)).toBe(records[0])
    expect(index.findSample(shop, '1')).toBe(records[1])
    expect(index.findSample(shop, 2)).toBeUndefined()
  })

  it('range sous la clé vide les records sans id de menu item, comme getRecordMenuItemId', () => {
    const records = [
      { shopId: 'shop-1', quantity: 4 },
      { shopId: 'shop-1', menuItemId: null, mappedMenuItemId: 0, itemId: undefined, quantity: 6 },
      { shopId: 'shop-1', menuItemId: 'a', quantity: 1 },
    ]
    const index = createStockRecordIndex(records)
    expect(index.getPredictedQuantity(shop, '')).toBe(10)
    expect(index.findSample(shop, '')).toBe(records[0])
    expect(legacyGetPredictedQuantityForElement(records, shop, '')).toBe(10)
  })

  it('retombe sur mappedMenuItemId puis itemId quand menuItemId est vide', () => {
    const records = [
      { shopId: 'shop-1', mappedMenuItemId: 'm', quantity: 2 },
      { shopId: 'shop-1', itemId: 'm', quantity: 3 },
      { shopId: 'shop-1', menuItemId: 'm', mappedMenuItemId: 'z', quantity: 4 },
    ]
    const index = createStockRecordIndex(records)
    expect(index.getPredictedQuantity(shop, 'm')).toBe(9)
    expect(index.getPredictedQuantity(shop, 'z')).toBe(0)
  })

  it('ignore les entrées null ou undefined du tableau', () => {
    const records = [null, undefined, { shopId: 'shop-1', menuItemId: 'a', quantity: 7 }]
    const index = createStockRecordIndex(records)
    expect(index.getPredictedQuantity(shop, 'a')).toBe(7)
    expect(index.getPredictedQuantity(shop, '')).toBe(0)
    expect(index.findSample(shop, '')).toBeUndefined()
  })

  it('accepte un tableau absent', () => {
    ;[null, undefined].forEach((records) => {
      const index = createStockRecordIndex(records)
      expect(index.summarize(shop, 'a')).toEqual({ sample: undefined, quantity: 0, manualOnly: false })
    })
  })

  it('départage les homonymes de PdV par nom, registryId ou shopName, comme le balayage complet', () => {
    const north = { id: 'shop-1', name: 'Bar', registryId: 'reg-9', type: 'shop' }
    const south = { id: 'shop-2', name: 'Bar', type: 'shop' }
    const stand = { id: 'shop-3', name: 'Autre', shopName: 'Stand 4', type: 'shop' }
    const records = [
      { shopName: 'Bar', menuItemId: 'a', quantity: 1 }, // nom partagé : north ET south
      { registryId: 'reg-9', menuItemId: 'a', quantity: 10 }, // north seulement
      { shopId: 'shop-2', menuItemId: 'a', quantity: 100 }, // south seulement
      { elementName: 'Stand 4', menuItemId: 'a', quantity: 1000 }, // shopName de stand
      { shop: 'shop-3', menuItemId: 'a', quantity: 10000 }, // id de stand
    ]
    const index = createStockRecordIndex(records)
    expect(index.getPredictedQuantity(north, 'a')).toBe(11)
    expect(index.getPredictedQuantity(south, 'a')).toBe(101)
    expect(index.getPredictedQuantity(stand, 'a')).toBe(11000)
    ;[north, south, stand].forEach((element) => {
      expect(index.getPredictedQuantity(element, 'a')).toBe(
        legacyGetPredictedQuantityForElement(records, element, 'a'),
      )
      expect(index.findSample(element, 'a')).toBe(legacyFind(records, element, 'a'))
    })
  })

  it('manuel pur : tous les records qui matchent sont isManual === true', () => {
    const index = createStockRecordIndex([
      { shopId: 'shop-1', menuItemId: 'a', quantity: 5, isManual: true },
      { shopId: 'shop-1', menuItemId: 'a', quantity: 6, isManual: true },
      { shopId: 'autre', menuItemId: 'a', quantity: 7 }, // autre PdV : sans effet
    ])
    expect(index.isManualOnly(shop, 'a')).toBe(true)
    expect(index.summarize(shop, 'a').manualOnly).toBe(true)
  })

  it('manuel mixte : un seul record non manuel suffit à faire retomber sur false', () => {
    const index = createStockRecordIndex([
      { shopId: 'shop-1', menuItemId: 'a', quantity: 5, isManual: true },
      { shopId: 'shop-1', menuItemId: 'a', quantity: 6 },
    ])
    expect(index.isManualOnly(shop, 'a')).toBe(false)
    expect(index.summarize(shop, 'a').manualOnly).toBe(false)
    // isManual doit valoir exactement true : la chaîne "true" ne compte pas.
    expect(
      createStockRecordIndex([{ shopId: 'shop-1', menuItemId: 'a', isManual: 'true' }]).isManualOnly(
        shop,
        'a',
      ),
    ).toBe(false)
  })

  it('manuel absent : aucun record qui matche donne false, pas true', () => {
    const index = createStockRecordIndex([
      { shopId: 'autre', menuItemId: 'a', quantity: 5, isManual: true },
    ])
    expect(index.isManualOnly(shop, 'a')).toBe(false)
    expect(index.isManualOnly(shop, 'inconnu')).toBe(false)
    expect(index.summarize(shop, 'a')).toEqual({ sample: undefined, quantity: 0, manualOnly: false })
  })

  it('summarize rend la même chose que les trois accesseurs séparés', () => {
    const records = [
      { shopId: 'shop-1', menuItemId: 'a', quantity: 2, isManual: true },
      { shopId: 'shop-1', menuItemId: 'a', adjustedQuantity: 3.5 },
      { shopId: 'shop-1', menuItemId: 'b', qty: 8, isManual: true },
    ]
    const index = createStockRecordIndex(records)
    ;['a', 'b', 'c'].forEach((id) => {
      expect(index.summarize(shop, id)).toEqual({
        sample: index.findSample(shop, id),
        quantity: index.getPredictedQuantity(shop, id),
        manualOnly: index.isManualOnly(shop, id),
      })
    })
  })

  it('ne garde rien entre deux appels : un nouvel index voit les records à jour', () => {
    const records = [{ shopId: 'shop-1', menuItemId: 'a', quantity: 5 }]
    expect(createStockRecordIndex(records).getPredictedQuantity(shop, 'a')).toBe(5)
    records[0].quantity = 9
    records.push({ shopId: 'shop-1', menuItemId: 'a', quantity: 1 })
    expect(createStockRecordIndex(records).getPredictedQuantity(shop, 'a')).toBe(10)
  })
})

describe('shopRecordMatchesElement sans allocation, équivalence avec l\'ancienne version', () => {
  it('garde la sémantique des clés : falsy ignorées, truthy comparées par texte', () => {
    expect(shopRecordMatchesElement({ shopId: 1 }, { id: '1' })).toBe(true)
    expect(shopRecordMatchesElement({ shopId: '1' }, { id: 1 })).toBe(true)
    expect(shopRecordMatchesElement({ shopId: 0 }, { id: 0 })).toBe(false)
    expect(shopRecordMatchesElement({ shopId: '' }, { id: '' })).toBe(false)
    expect(shopRecordMatchesElement({ shopId: undefined }, { id: undefined })).toBe(false)
    expect(shopRecordMatchesElement({ elementName: 'X' }, { shopName: 'X' })).toBe(true)
    expect(shopRecordMatchesElement({ registryId: 'r' }, { name: 'r' })).toBe(true)
    expect(shopRecordMatchesElement({ shopId: 'a' }, { id: 'b' })).toBe(false)
    expect(shopRecordMatchesElement(null, { id: 'a' })).toBe(false)
    expect(shopRecordMatchesElement({ shopId: 'a' }, null)).toBe(false)
    expect(shopRecordMatchesElement(undefined, undefined)).toBe(false)
    // Un objet truthy dont le texte est vide reste une clé valide ('' === '').
    const emptyText = { toString: () => '' }
    expect(shopRecordMatchesElement({ shopId: emptyText }, { id: [] })).toBe(
      legacyShopRecordMatchesElement({ shopId: emptyText }, { id: [] }),
    )
  })

  it('donne le même résultat que l\'ancienne version sur 5000 couples générés', () => {
    const rng = createRng(20261117)
    const textOf = { toString: () => 'a' }
    const pool = [undefined, null, '', 0, false, NaN, 'a', 'b', 'A', ' a', 1, '1', 2, true, textOf, [], ['a']]
    const recordFields = ['shopId', 'elementId', 'shop', 'shopName', 'elementName', 'registryId']
    const elementFields = ['id', 'registryId', 'name', 'shopName']
    let matches = 0
    for (let n = 0; n < 5000; n += 1) {
      const record = {}
      recordFields.forEach((field) => {
        if (rng.chance(0.45)) record[field] = rng.pick(pool)
      })
      const element = {}
      elementFields.forEach((field) => {
        if (rng.chance(0.45)) element[field] = rng.pick(pool)
      })
      const expected = legacyShopRecordMatchesElement(record, element)
      if (expected) matches += 1
      expect(shopRecordMatchesElement(record, element)).toBe(expected)
    }
    // Garde-fou : le tirage contient des vrais ET des faux.
    expect(matches).toBeGreaterThan(300)
    expect(matches).toBeLessThan(4700)
  })
})

describe('équivalence avec l\'implémentation de référence', () => {
  const SEEDS = Array.from({ length: 80 }, (_, i) => 1000 + i)
  const stats = { stockRows: 0, demandRows: 0, manualOnlyPairs: 0, expandedRows: 0, leafRows: 0, pairs: 0 }

  SEEDS.forEach((seed) => {
    it(`scénario ${seed} : mêmes lignes, même ordre, mêmes sommes`, () => {
      const scenario = buildScenario(seed)
      const before = JSON.stringify(scenario)

      const expectedStock = legacyBuildStockRequirements(scenario)
      const expectedDemand = legacyBuildMenuItemDemand(scenario)
      expect(buildStockRequirements(scenario)).toStrictEqual(expectedStock)
      expect(buildMenuItemDemand(scenario)).toStrictEqual(expectedDemand)
      // Aucune entrée n'est modifiée par le nouveau code.
      expect(JSON.stringify(scenario)).toBe(before)

      stats.stockRows += expectedStock.length
      stats.demandRows += expectedDemand.length
      expectedStock.forEach((row) => {
        if (row.isExpanded) stats.expandedRows += 1
        else stats.leafRows += 1
      })

      // Les trois helpers publics (même signature), sur toutes les paires.
      expect(deriveSelectedMenuItemsByShop(scenario.configuration, scenario.predictedRecords)).toStrictEqual(
        legacyDeriveSelectedMenuItemsByShop(scenario.configuration, scenario.predictedRecords),
      )
      const index = createStockRecordIndex(scenario.predictedRecords)
      const ids = [...scenario.allMenuItemIds, '', 'unknown-1', 'timeline-3', 'orphan-1']
      collectFbElements(scenario.configuration).forEach((element) => {
        ids.forEach((menuItemId) => {
          const records = scenario.predictedRecords
          const quantity = legacyGetPredictedQuantityForElement(records, element, menuItemId)
          const manualOnly = legacyIsManualOnlyForElement(records, element, menuItemId)
          expect(getPredictedQuantityForElement(records, element, menuItemId)).toBe(quantity)
          expect(isManualOnlyForElement(records, element, menuItemId)).toBe(manualOnly)
          expect(index.getPredictedQuantity(element, menuItemId)).toBe(quantity)
          expect(index.isManualOnly(element, menuItemId)).toBe(manualOnly)
          expect(index.findSample(element, menuItemId)).toBe(legacyFind(records, element, menuItemId))
          expect(index.summarize(element, menuItemId)).toStrictEqual({
            sample: legacyFind(records, element, menuItemId),
            quantity,
            manualOnly,
          })
          stats.pairs += 1
          if (manualOnly) stats.manualOnlyPairs += 1
        })
      })
    })
  })

  it('les scénarios ne sont pas vides : lignes développées, feuilles, manuel pur', () => {
    // S'exécute après les 80 scénarios (même describe, ordre de déclaration) ;
    // sans eux (filtre -t), il n'y a rien à vérifier.
    if (stats.pairs === 0) return
    expect(stats.stockRows).toBeGreaterThan(300)
    expect(stats.demandRows).toBeGreaterThan(150)
    expect(stats.expandedRows).toBeGreaterThan(50)
    expect(stats.leafRows).toBeGreaterThan(50)
    expect(stats.manualOnlyPairs).toBeGreaterThan(20)
    expect(stats.pairs).toBeGreaterThan(10000)
  })

  it('taille réelle de la page Commandes (15 PdV, 94 menu items, 249 records)', () => {
    ;[7, 8, 9].forEach((seed) => {
      const scenario = buildScenario(seed, { shops: 15, items: 94, records: 249 })
      expect(buildStockRequirements(scenario)).toStrictEqual(legacyBuildStockRequirements(scenario))
      expect(buildMenuItemDemand(scenario)).toStrictEqual(legacyBuildMenuItemDemand(scenario))
    })
  })

  it('sans prédiction ni sélection : même sortie vide, sans erreur', () => {
    const scenario = buildScenario(5)
    const empty = { ...scenario, predictedRecords: [], selectedMenuItems: {} }
    expect(buildStockRequirements(empty)).toStrictEqual(legacyBuildStockRequirements(empty))
    expect(buildMenuItemDemand(empty)).toStrictEqual(legacyBuildMenuItemDemand(empty))
    const nullRecords = { ...scenario, predictedRecords: null }
    expect(buildStockRequirements(nullRecords)).toStrictEqual(legacyBuildStockRequirements(nullRecords))
    expect(buildMenuItemDemand(nullRecords)).toStrictEqual(legacyBuildMenuItemDemand(nullRecords))
    const noArgs = { configuration: null }
    expect(buildStockRequirements(noArgs)).toStrictEqual(legacyBuildStockRequirements(noArgs))
    expect(buildMenuItemDemand(noArgs)).toStrictEqual(legacyBuildMenuItemDemand(noArgs))
  })

  it('reflète une modification des records entre deux appels (aucun cache entre appels)', () => {
    const scenario = buildScenario(11)
    const first = buildStockRequirements(scenario)
    expect(first).toStrictEqual(legacyBuildStockRequirements(scenario))
    scenario.predictedRecords.forEach((record) => {
      if (record.menuItemId) record.quantity = 7
      delete record.totalQuantity
      delete record.adjustedQuantity
    })
    scenario.menuItems = scenario.menuItems.slice(1)
    const second = buildStockRequirements(scenario)
    expect(second).toStrictEqual(legacyBuildStockRequirements(scenario))
    expect(second).not.toStrictEqual(first)
    expect(buildMenuItemDemand(scenario)).toStrictEqual(legacyBuildMenuItemDemand(scenario))
  })
})

describe('dérivation des ids par PdV, calculée au plus une fois par appel', () => {
  // `collectFbElements` lit `configuration.data` une fois par appel : on compte
  // ces lectures. Une pour l'appel lui-même, une de plus par dérivation.
  const withReadCounter = (scenario) => {
    const counter = { reads: 0 }
    const raw = scenario.configuration
    const data = raw.data || raw
    const configuration = {
      get data() {
        counter.reads += 1
        return data
      },
    }
    return { args: { ...scenario, configuration }, counter }
  }

  it('une seule dérivation pour tous les PdV sans sélection explicite', () => {
    const base = buildScenario(21, { shops: 12, items: 20, records: 120 })
    const noSelection = { ...base, selectedMenuItems: {}, closedShopNames: [] }
    ;[buildStockRequirements, buildMenuItemDemand].forEach((build) => {
      const { args, counter } = withReadCounter(noSelection)
      expect(build(args)).toStrictEqual(
        build === buildStockRequirements
          ? legacyBuildStockRequirements(noSelection)
          : legacyBuildMenuItemDemand(noSelection),
      )
      expect(counter.reads).toBe(2)
    })
  })

  it('aucune dérivation quand tous les PdV ont une sélection explicite', () => {
    const base = buildScenario(22, { shops: 6, items: 10, records: 60 })
    const selectedMenuItems = {}
    collectFbElements(base.configuration).forEach((element) => {
      selectedMenuItems[element.id] = [base.allMenuItemIds[0]]
    })
    const allExplicit = { ...base, selectedMenuItems }
    ;[buildStockRequirements, buildMenuItemDemand].forEach((build) => {
      const { args, counter } = withReadCounter(allExplicit)
      build(args)
      expect(counter.reads).toBe(1)
    })
  })
})

describe('expandMenuItemStockWithLookup, catalogue partagé', () => {
  it('rend la même chose que expandMenuItemStock, appels répétés sur le même lookup', () => {
    const scenario = buildScenario(31, { items: 40 })
    const { menuItems } = scenario
    const menuItemsById = new Map(menuItems.map((mi) => [mi.id, mi]))
    const lookup = buildComponentLookup(menuItems)
    const catalogBefore = JSON.stringify(menuItems)
    const byIdBefore = JSON.stringify([...lookup.byId.keys()])
    const byNameBefore = JSON.stringify([...lookup.byName.entries()].map(([k, v]) => [k, v.idx]))
    const idxBefore = JSON.stringify([...lookup.idxById.entries()])

    for (let pass = 0; pass < 3; pass += 1) {
      menuItems.forEach((mi, n) => {
        const quantity = 3 + n
        const shared = expandMenuItemStockWithLookup(mi.id, quantity, mi.name, menuItemsById, lookup)
        expect(shared).toStrictEqual(expandMenuItemStock(mi.id, quantity, mi.name, menuItems, []))
        expect(shared).toStrictEqual(legacyExpandMenuItemStock(mi.id, quantity, mi.name, menuItems, []))
        // Mutation du résultat : ne doit rien changer aux appels suivants.
        shared.forEach((row) => {
          row.totalQuantity += 1000
          row.sources.forEach((source) => {
            source.menuItemQuantity += 1000
          })
        })
      })
    }

    // Ni le catalogue ni le lookup partagé n'ont bougé : le partage est sûr.
    expect(JSON.stringify(menuItems)).toBe(catalogBefore)
    expect(JSON.stringify([...lookup.byId.keys()])).toBe(byIdBefore)
    expect(JSON.stringify([...lookup.byName.entries()].map(([k, v]) => [k, v.idx]))).toBe(byNameBefore)
    expect(JSON.stringify([...lookup.idxById.entries()])).toBe(idxBefore)
  })

  it('expandMenuItemStock garde sa signature positionnelle (depth en 6e paramètre)', () => {
    const menuItems = [{ id: 'mi-1', name: 'Cookie', readyForSale: 'Yes' }]
    expect(expandMenuItemStock('mi-1', 4, 'Cookie', menuItems, [], 0)).toHaveLength(1)
    expect(expandMenuItemStock('mi-1', 4, 'Cookie', menuItems, [], 11)).toEqual([])
    expect(expandMenuItemStock('absent', 4, 'Cookie', menuItems)).toEqual([])
    expect(expandMenuItemStock('mi-1', 4, 'Cookie', null)).toEqual([])
  })
})
