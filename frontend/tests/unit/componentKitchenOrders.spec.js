/**
 * Onglet « Composants par cuisine » (étape 3) : identification des composants,
 * groupement Local / cuisine / non définie, quantités nulles et stockage écartés,
 * filtre de recherche.
 */
import {
  collectComponentOrders,
  groupComponentOrdersByKitchen,
  resolveComponentKitchen,
} from '@/utils/componentKitchenOrders'

const components = [
  { id: 'c1', name: 'Chimichuri 26/27', kitchenType: 'Local', kitchenId: null },
  { id: 'c2', name: 'Sauce burger', kitchenType: 'Central', kitchenId: 'k1', kitchen: { id: 'k1', name: 'Cuisine Nord' } },
  { id: 'c3', name: 'Pickles', kitchenType: 'Central', kitchenId: 'k2', kitchen: null },
  { id: 'c4', name: 'Guacamole', kitchenType: null, kitchenId: null },
  { id: 'c5', name: 'Aioli', kitchenType: 'Central', kitchenId: 'k1', kitchen: { id: 'k1', name: 'Cuisine Nord' } },
]

const row = (itemKey, itemName, extra = {}) => ({ itemKey, itemName, unit: 'kg', itemId: null, sourceId: null, ...extra })
const labels = { local: 'Cuisine locale', undefined: 'Cuisine non définie' }

describe('resolveComponentKitchen', () => {
  it('Local, Central nommé, Central résolu par la liste, sinon non définie', () => {
    expect(resolveComponentKitchen(components[0]).kind).toBe('local')
    expect(resolveComponentKitchen(components[1])).toMatchObject({ kind: 'central', name: 'Cuisine Nord' })
    expect(resolveComponentKitchen(components[2]).kind).toBe('undefined')
    expect(resolveComponentKitchen(components[2], [{ id: 'k2', name: 'Cuisine Sud' }])).toMatchObject({
      kind: 'central',
      name: 'Cuisine Sud',
    })
    expect(resolveComponentKitchen(components[3]).kind).toBe('undefined')
  })
})

describe('collectComponentOrders', () => {
  const rows = [
    row('a', 'Chimichuri 26/27'),
    row('b', 'Sauce burger'),
    row('c', 'Pickles'),
    row('d', 'Guacamole'),
    row('e', 'Aioli'),
    row('f', 'Bière blonde'), // article fini, pas un composant
    row('g', 'Sauce burger', { elementType: 'storage' }),
  ]

  it('écarte les quantités à 0, les non-composants, le stockage et les absents de la map', () => {
    const orders = collectComponentOrders({
      rows,
      components,
      orderByItem: { a: 4, b: 0, c: 2, d: 1, f: 9, g: 5 },
    })
    expect(orders.map((o) => o.itemKey)).toEqual(['a', 'c', 'd'])
    expect(orders[0].quantity).toBe(4)
  })

  it('identifie par sourceId quand il est présent', () => {
    const orders = collectComponentOrders({
      rows: [row('x', 'Nom différent', { sourceId: 'c2' })],
      components,
      orderByItem: { x: 3 },
    })
    expect(orders[0].kitchen.name).toBe('Cuisine Nord')
  })
})

describe('groupComponentOrdersByKitchen', () => {
  const orders = collectComponentOrders({
    rows: [row('a', 'Chimichuri 26/27'), row('b', 'Sauce burger'), row('c', 'Pickles'), row('d', 'Guacamole'), row('e', 'Aioli')],
    components,
    orderByItem: { a: 4, b: 2, c: 2, d: 1, e: 6 },
  })

  it('Local, cuisines par nom, non définie en dernier, lignes triées', () => {
    const groups = groupComponentOrdersByKitchen(orders, { labels })
    expect(groups.map((g) => g.name)).toEqual(['Cuisine locale', 'Cuisine Nord', 'Cuisine non définie'])
    expect(groups[1].rows.map((r) => r.itemName)).toEqual(['Aioli', 'Sauce burger'])
    expect(groups[2].rows.map((r) => r.itemName)).toEqual(['Guacamole', 'Pickles'])
  })

  it('filtre par nom de composant', () => {
    const groups = groupComponentOrdersByKitchen(orders, { labels, search: 'chimi' })
    expect(groups).toHaveLength(1)
    expect(groups[0].rows[0].itemName).toBe('Chimichuri 26/27')
  })

  it('filtre par nom de cuisine (garde toutes les lignes de la cuisine)', () => {
    const groups = groupComponentOrdersByKitchen(orders, { labels, search: 'nord' })
    expect(groups).toHaveLength(1)
    expect(groups[0].rows).toHaveLength(2)
  })

  it('liste vide sans commande', () => {
    expect(groupComponentOrdersByKitchen([], { labels })).toEqual([])
  })
})

describe('buildKitchenShoppingGroups', () => {
  const { buildKitchenShoppingGroups } = require('@/utils/componentKitchenOrders')
  const row = (extra = {}) => ({
    itemKey: 'k1', itemName: 'Sauce', unit: 'L', quantity: 4, orderMain: '2 Carton', orderSub: '= 4 L',
    shopNames: ['Bar 1'], kitchen: { kind: 'central', id: '7', name: 'Centrale' }, ...extra,
  })
  it('rattache email et tel de la fiche cuisine et habille comme un fournisseur', () => {
    const out = buildKitchenShoppingGroups(
      [{ key: 'kitchen:7', kind: 'central', name: 'Centrale', rows: [row()] }],
      [{ id: 7, email: ' c@x.fr ', tel: '01 02' }],
    )
    expect(out[0]).toMatchObject({ supplierId: 'kitchen:7', supplierName: 'Centrale', supplierEmail: 'c@x.fr', supplierPhone: '01 02' })
    expect(out[0].items[0]).toMatchObject({ itemKey: 'k1', quantity: 4, quantityLabel: '2 Carton', quantitySub: '= 4 L', shopNames: ['Bar 1'] })
  })
  it('Cuisine locale et non définie : pas de coordonnées', () => {
    const out = buildKitchenShoppingGroups([
      { key: 'local', kind: 'local', name: 'Cuisine locale', rows: [row({ kitchen: { kind: 'local', id: null, name: '' } })] },
      { key: 'undefined', kind: 'undefined', name: 'x', rows: [row({ kitchen: { kind: 'undefined', id: null, name: '' } })] },
    ], [{ id: 7, email: 'a@b.c', tel: '1' }])
    expect(out.map((g) => [g.supplierEmail, g.supplierPhone])).toEqual([['', ''], ['', '']])
  })
})
