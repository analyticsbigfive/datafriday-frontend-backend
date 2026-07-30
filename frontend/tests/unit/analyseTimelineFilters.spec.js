import { buildItemFilterPredicate } from '@/utils/analyseDimensions'
import {
  buildReconciliationContext,
  reconcileRecord,
  UNATTACHED_ITEM_KEY,
} from '@/utils/analyseReconciliation'

// Filtrage de la timeline Analyse : les records `event-timeline` sont
// RÉCONCILIÉS puis passés au MÊME prédicat que les donuts (cf. fiche BUG-244-01
// — avant, la timeline ne recevait que 3 des 6 dimensions, dont 2 inertes).
// Ces tests verrouillent l'invariant : ce qu'une part de donut émet doit
// retrouver des lignes côté timeline.

const menuItems = [
  { id: 'mi1', name: 'Heineken 50cl', categoryId: 'c1', typeId: 't1' },
  { id: 'mi2', name: 'Frites', categoryId: 'c2', typeId: 't2' },
]
const productTypes = [
  { id: 't1', name: 'Beverage' },
  { id: 't2', name: 'Food' },
]
const productCategories = [
  { id: 'c1', name: 'Bières', typeId: 't1', typeName: 'Beverage' },
  { id: 'c2', name: 'Sides', typeId: 't2', typeName: 'Food' },
]
const floorElements = [
  { id: 'el1', name: 'Bar Nord', shopType: ['beverages'], floorName: 'Niveau 0' },
  { id: 'el2', name: 'Food Court', shopType: ['food'], floorName: 'Niveau 1' },
]

const ctx = buildReconciliationContext({
  menuItems,
  productCategories,
  productTypes,
  floorElements,
  assignment: null,
  assignmentItemsByShop: null,
  weezeventProducts: [],
})

/** Ligne au format `event-timeline` (spaces.service.ts getEventTimelineBatch). */
function row(over = {}) {
  return {
    minute: '20:30',
    shopId: 'el1',
    shopName: 'Bar Nord',
    shopType: 'beverages',
    shopArea: 'Niveau 0',
    menuItemId: 'mi1',
    menuItemName: 'Heineken 50cl',
    quantity: 2,
    revenue: 12,
    ...over,
  }
}

const reconcile = (r) => reconcileRecord(r, ctx)

/** Applique le prédicat comme le fait AnalyseView (`skipMinute` par défaut). */
function keep(records, filters, opts = { skipMinute: true }) {
  return records.map(reconcile).filter(buildItemFilterPredicate(filters, opts))
}

describe('filtrage de la timeline Analyse', () => {
  const beer = row()
  const fries = row({
    shopId: 'el2',
    shopName: 'Food Court',
    shopType: 'food',
    shopArea: 'Niveau 1',
    menuItemId: 'mi2',
    menuItemName: 'Frites',
  })
  const all = [beer, fries]

  it('ne filtre rien quand aucun filtre n’est posé', () => {
    expect(keep(all, {})).toHaveLength(2)
  })

  it('filtre par NOM de PdV (selectedShopIds contient des noms, pas des ids)', () => {
    const out = keep(all, { selectedShopIds: ['Bar Nord'] })
    expect(out).toHaveLength(1)
    expect(out[0].menuItemName).toBe('Heineken 50cl')
  })

  it('compare les noms de PdV sans tenir compte de la casse', () => {
    expect(keep(all, { selectedShopIds: ['bar nord'] })).toHaveLength(1)
  })

  it('filtre par type de PdV — dimension INERTE avant le correctif', () => {
    const out = keep(all, { selectedShopTypes: [reconcile(fries).shopType] })
    expect(out).toHaveLength(1)
    expect(out[0].shopName).toBe('Food Court')
  })

  it('filtre par zone de PdV — dimension INERTE avant le correctif', () => {
    const out = keep(all, { selectedShopAreas: ['Niveau 1'] })
    expect(out).toHaveLength(1)
    expect(out[0].shopName).toBe('Food Court')
  })

  it('filtre par nom d’article — le clic « Item performance »', () => {
    const out = keep(all, { selectedMenuItemIds: ['Frites'] })
    expect(out).toHaveLength(1)
    expect(out[0].menuItemName).toBe('Frites')
  })

  it('filtre par type d’article', () => {
    const out = keep(all, { selectedMenuItemTypes: ['Beverage'] })
    expect(out).toHaveLength(1)
    expect(out[0].menuItemName).toBe('Heineken 50cl')
  })

  it('filtre par catégorie d’article', () => {
    const out = keep(all, { selectedMenuItemCategories: ['Sides'] })
    expect(out).toHaveLength(1)
    expect(out[0].menuItemName).toBe('Frites')
  })

  it('combine plusieurs dimensions en ET', () => {
    expect(keep(all, { selectedShopIds: ['Bar Nord'], selectedMenuItemCategories: ['Sides'] })).toHaveLength(0)
    expect(keep(all, { selectedShopIds: ['Bar Nord'], selectedMenuItemCategories: ['Bières'] })).toHaveLength(1)
  })

  // L'assertion qui prouve que la réconciliation est du BON CÔTÉ du filtre :
  // le donut émet une clé réconciliée, pas la valeur brute du backend.
  it('retrouve les lignes non rattachées via la sentinelle émise par le donut', () => {
    const unknown = row({ menuItemId: 'inconnu', menuItemName: 'Produit hors catalogue' })
    const reconciled = reconcile(unknown)
    expect(reconciled.menuItemCategory).toBe(UNATTACHED_ITEM_KEY)

    const out = keep([beer, unknown], { selectedMenuItemCategories: [UNATTACHED_ITEM_KEY] })
    expect(out).toHaveLength(1)
    expect(out[0].menuItemName).toBe('Produit hors catalogue')
  })

  describe('option skipMinute', () => {
    const range = { start: '21:00', end: '22:00' }

    it('ignore selectedTimeRange quand skipMinute est posé (cas timeline)', () => {
      // La timeline ÉCRIT selectedTimeRange : l'appliquer à sa propre entrée
      // rétrécirait ses labels et ferait dériver le curseur à chaque drag.
      expect(keep([beer], { selectedTimeRange: range })).toHaveLength(1)
    })

    it('applique selectedTimeRange sans skipMinute (cas item-level)', () => {
      expect(keep([beer], { selectedTimeRange: range }, {})).toHaveLength(0)
      expect(keep([row({ minute: '21:30' })], { selectedTimeRange: range }, {})).toHaveLength(1)
    })
  })
})
