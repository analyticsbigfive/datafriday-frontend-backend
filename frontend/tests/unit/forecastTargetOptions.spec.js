import { forecastTargetOptions } from '@/utils/forecastTargetOptions'
import { UNATTACHED_ITEM_KEY } from '@/utils/analyseReconciliation'

const catalogById = new Map([
  ['m1', { id: 'm1', name: 'Bière blonde', basePrice: 8, pricing: { vatRate: 10 } }],
  ['m2', { id: 'm2', name: 'Eau', basePrice: 3 }],
  ['m3', { id: 'm3', name: 'Sans prix' }],
  ['m4', { id: 'm4', name: 'Prix espace', basePrice: 8, spacePricing: { sp1: { gross: { ttc: 10 } } } }],
])

const rec = (over) => ({
  eventId: 'e1', shopId: 's1', menuItemId: 'm1', menuItemName: 'Bière blonde',
  menuItemCategory: 'Bières', menuItemType: 'Boisson', quantity: 1, revenue: 8,
  ...over,
})

describe('forecastTargetOptions', () => {
  it('liste vide ou absente : trois listes vides', () => {
    expect(forecastTargetOptions({ articleRecords: [], catalogById })).toEqual({
      items: [], categories: [], types: [],
    })
    expect(forecastTargetOptions({ catalogById })).toEqual({ items: [], categories: [], types: [] })
    expect(forecastTargetOptions()).toEqual({ items: [], categories: [], types: [] })
  })

  it('construit les articles, catégories et types depuis les records, triés', () => {
    const articleRecords = [
      rec({ menuItemId: 'm2', menuItemName: 'Eau', menuItemCategory: 'Softs', menuItemType: 'Boisson' }),
      rec({}),
      rec({ menuItemId: 'm4', menuItemName: 'Burger', menuItemCategory: 'Plats', menuItemType: 'Restauration' }),
    ]
    const out = forecastTargetOptions({ articleRecords, catalogById })
    expect(out.items.map((i) => i.name)).toEqual(['Bière blonde', 'Burger', 'Eau'])
    expect(out.categories).toEqual(['Bières', 'Plats', 'Softs'])
    expect(out.types).toEqual(['Boisson', 'Restauration'])
  })

  it('un article présent dans plusieurs records n\'apparaît qu\'une fois', () => {
    const articleRecords = [rec({}), rec({ eventId: 'e2' }), rec({ shopId: 's2' })]
    const out = forecastTargetOptions({ articleRecords, catalogById })
    expect(out.items).toHaveLength(1)
    expect(out.categories).toEqual(['Bières'])
  })

  it('currentTtc et priceable reflètent le catalogue', () => {
    const articleRecords = [
      rec({}),
      rec({ menuItemId: 'm3', menuItemName: 'Sans prix' }),
      rec({ menuItemId: 'm404', menuItemName: 'Hors catalogue' }),
    ]
    const byId = Object.fromEntries(
      forecastTargetOptions({ articleRecords, catalogById }).items.map((i) => [i.id, i]),
    )
    expect(byId.m1).toMatchObject({ currentTtc: 8, priceable: true })
    expect(byId.m3).toMatchObject({ currentTtc: 0, priceable: false })
    expect(byId.m404).toMatchObject({ currentTtc: 0, priceable: false })
  })

  it('utilise le prix propre à l\'espace courant', () => {
    const articleRecords = [rec({ menuItemId: 'm4', menuItemName: 'Prix espace' })]
    expect(forecastTargetOptions({ articleRecords, catalogById, spaceId: 'sp1' }).items[0].currentTtc).toBe(10)
    expect(forecastTargetOptions({ articleRecords, catalogById, spaceId: 'autre' }).items[0].currentTtc).toBe(8)
  })

  it('nom : record, sinon catalogue, sinon identifiant', () => {
    const articleRecords = [
      rec({ menuItemId: 'm2', menuItemName: null }),
      rec({ menuItemId: 'm404', menuItemName: '' }),
    ]
    const names = forecastTargetOptions({ articleRecords, catalogById }).items.map((i) => i.name)
    expect(names).toEqual(['Eau', 'm404'])
  })

  it('exclut la sentinelle des catégories et des types et les articles sans id, garde un article à catégorie sentinelle', () => {
    const articleRecords = [
      rec({}),
      rec({ menuItemId: null, menuItemName: 'Non mappé', menuItemCategory: UNATTACHED_ITEM_KEY, menuItemType: UNATTACHED_ITEM_KEY }),
      rec({ menuItemId: 'm2', menuItemName: 'Eau', menuItemCategory: UNATTACHED_ITEM_KEY, menuItemType: 'Boisson' }),
      rec({ menuItemId: null, menuItemName: 'Sans id', menuItemCategory: 'Fantôme', menuItemType: 'Fantôme' }),
    ]
    const out = forecastTargetOptions({ articleRecords, catalogById })
    expect(out.items.map((i) => i.id).sort()).toEqual(['m1', 'm2'])
    expect(out.categories).toEqual(['Bières'])
    expect(out.types).toEqual(['Boisson'])
    expect(JSON.stringify(out)).not.toContain(UNATTACHED_ITEM_KEY)
  })

  it('reconnaît mappedMenuItemId', () => {
    const articleRecords = [rec({ menuItemId: undefined, mappedMenuItemId: 'm1' })]
    expect(forecastTargetOptions({ articleRecords, catalogById }).items.map((i) => i.id)).toEqual(['m1'])
  })

  it('tri insensible à la casse et aux accents', () => {
    const articleRecords = [
      rec({ menuItemId: 'a', menuItemName: 'zèbre', menuItemCategory: 'écume' }),
      rec({ menuItemId: 'b', menuItemName: 'Abricot', menuItemCategory: 'Zeste' }),
      rec({ menuItemId: 'c', menuItemName: 'éclair', menuItemCategory: 'abri' }),
    ]
    const out = forecastTargetOptions({ articleRecords, catalogById })
    expect(out.items.map((i) => i.name)).toEqual(['Abricot', 'éclair', 'zèbre'])
    expect(out.categories).toEqual(['abri', 'écume', 'Zeste'])
  })

  it('ne mute pas les records', () => {
    const articleRecords = [rec({})]
    const snapshot = JSON.parse(JSON.stringify(articleRecords))
    forecastTargetOptions({ articleRecords, catalogById })
    expect(articleRecords).toEqual(snapshot)
  })
})
