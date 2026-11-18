/**
 * Inventaire : `buildStorageInventory` doit donner le MÊME résultat qu'il reconstruise
 * l'inventaire consolidé de chaque PdV lui-même ou qu'il reçoive celui déjà calculé
 * (`prebuiltInventory`). Le calcul n'est fait qu'une fois par PdV.
 */
import { buildConsolidatedInventory, buildStorageInventory } from '@/utils/inventoryUtils'

const menuItems = [
  {
    id: 'm1', name: 'Bière', category: 'Boisson', comboItem: 'No', basePrice: 6,
    components: [{ id: 'c1', name: 'Fût 30L', quantity: 0.4, unit: 'L' }, { id: 'c2', name: 'Gobelet', quantity: 1, unit: 'unit' }],
  },
  {
    id: 'm2', name: 'Hot-dog', category: 'Snack', comboItem: 'No', basePrice: 5,
    components: [{ id: 'c3', name: 'Pain', quantity: 1, unit: 'unit' }, { id: 'c4', name: 'Saucisse', quantity: 1, unit: 'unit' }],
  },
  {
    id: 'm3', name: 'Menu Hot-dog', category: 'Snack', comboItem: 'Yes', basePrice: 8,
    components: [{ id: 'm2', name: 'Hot-dog', quantity: 1, unit: 'unit' }, { id: 'c2', name: 'Gobelet', quantity: 1, unit: 'unit' }],
  },
]

const shops = [
  { id: 's1', name: 'Buvette Nord', availableMenuItems: [menuItems[0], menuItems[1]] },
  { id: 's2', name: 'Buvette Sud', availableMenuItems: [menuItems[0], menuItems[2]] },
  { id: 's3', name: 'Vide', availableMenuItems: [] },
]

const withPrebuilt = (list) =>
  list.map((s) => ({
    ...s,
    prebuiltInventory: s.availableMenuItems.length
      ? buildConsolidatedInventory(s.availableMenuItems, menuItems, [], false, [])
      : [],
  }))

describe('buildStorageInventory : prebuiltInventory', () => {
  beforeAll(() => { jest.spyOn(console, 'log').mockImplementation(() => {}) })
  afterAll(() => { console.log.mockRestore() })

  for (const types of [[], ['dry'], ['cold'], ['dry', 'cold', 'belowzero', 'material']]) {
    for (const selected of [null, [], ['s2']]) {
      it(`résultat identique, types=${JSON.stringify(types)} PdV=${JSON.stringify(selected)}`, () => {
        const sans = buildStorageInventory(types, shops, menuItems, selected, [], [], [])
        const avec = buildStorageInventory(types, withPrebuilt(shops), menuItems, selected, [], [], [])
        expect(avec).toEqual(sans)
      })
    }
  }

  it('utilise l\'inventaire fourni sans le recalculer', () => {
    const marked = [{
      ...shops[0],
      prebuiltInventory: [{ name: 'Article sentinelle', totalQuantity: 7, unit: 'unit', usedIn: [] }],
    }]
    const res = buildStorageInventory([], marked, menuItems, null, [], [], [])
    const flat = JSON.stringify(res)
    expect(flat).toContain('Article sentinelle')
  })

  it('contrôle négatif : sans inventaire fourni, l\'article sentinelle n\'existe pas', () => {
    const res = buildStorageInventory([], shops, menuItems, null, [], [], [])
    expect(JSON.stringify(res)).not.toContain('Article sentinelle')
  })

  it('un PdV sans article ne produit aucune ligne, avec ou sans inventaire fourni', () => {
    const only = [shops[2]]
    expect(buildStorageInventory([], only, menuItems, null, [], [], [])).toEqual(
      buildStorageInventory([], withPrebuilt(only), menuItems, null, [], [], []),
    )
  })
})
