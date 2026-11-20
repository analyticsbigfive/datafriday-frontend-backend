import { priceRatioFor, articleFromRecord, isTargetableArticle } from '@/utils/forecastPriceRatio'
import {
  FORECAST_MODIFICATION_TYPES as T,
  createModification,
  addModification,
} from '@/utils/forecastModificationModel'
import { UNATTACHED_ITEM_KEY } from '@/utils/analyseReconciliation'

const mod = (type, fields) => createModification(type, fields)

const catalogById = new Map([
  ['m1', { id: 'm1', name: 'Bière', basePrice: 8, pricing: { vatRate: 10 } }],
  ['m2', { id: 'm2', name: 'Eau', basePrice: 3, pricing: { vatRate: 10 } }],
  ['m3', { id: 'm3', name: 'Sans prix' }],
  ['m4', { id: 'm4', name: 'Prix espace', basePrice: 8, spacePricing: { sp1: { gross: { ttc: 10 } } } }],
])
const ctx = { catalogById, spaceId: null }
const beer = { menuItemId: 'm1', category: 'Bières', type: 'Boisson' }

describe('articleFromRecord / isTargetableArticle', () => {
  it('lit menuItemId, ou mappedMenuItemId, et les dimensions du record', () => {
    expect(articleFromRecord({ menuItemId: 7, menuItemCategory: 'C', menuItemType: 'T' })).toEqual({
      menuItemId: '7', category: 'C', type: 'T',
    })
    expect(articleFromRecord({ mappedMenuItemId: 'm9' }).menuItemId).toBe('m9')
    expect(articleFromRecord({ menuItemId: null }).menuItemId).toBeNull()
    expect(articleFromRecord({ menuItemId: '' }).menuItemId).toBeNull()
    expect(articleFromRecord(null).menuItemId).toBeNull()
  })

  it('ciblable dès qu\'il porte un menuItemId', () => {
    expect(isTargetableArticle(beer)).toBe(true)
    expect(isTargetableArticle({ ...beer, menuItemId: null })).toBe(false)
    expect(isTargetableArticle({ ...beer, category: UNATTACHED_ITEM_KEY })).toBe(true)
    expect(isTargetableArticle({ ...beer, type: UNATTACHED_ITEM_KEY })).toBe(true)
    expect(isTargetableArticle(null)).toBe(false)
  })
})

describe('priceRatioFor : cas neutres', () => {
  it('liste vide ou aucune modification applicable : ratio 1, non modifié', () => {
    expect(priceRatioFor(beer, [], ctx)).toEqual({ ratio: 1, modified: false, unpriceable: false })
    expect(priceRatioFor(beer, undefined, ctx)).toEqual({ ratio: 1, modified: false, unpriceable: false })
    const other = [mod(T.CATEGORY_PCT, { target: 'Softs', value: 50 })]
    expect(priceRatioFor(beer, other, ctx).modified).toBe(false)
  })

  it('les leviers de volume et de panier n\'ont aucun effet sur le prix', () => {
    const list = [
      mod(T.TRANSFORMATION, { value: 30 }),
      mod(T.BASKET, { value: 30 }),
      mod(T.PERCAP, { mode: 'basket', value: 30 }),
    ]
    expect(priceRatioFor(beer, list, ctx)).toEqual({ ratio: 1, modified: false, unpriceable: false })
  })

  it('modifications invalides ignorées', () => {
    const list = [mod(T.CATEGORY_PCT, { target: 'Bières', value: 500 })]
    expect(priceRatioFor(beer, list, ctx).modified).toBe(false)
  })

  it('article sans menuItemId : jamais ciblé, même par une catégorie identique', () => {
    const list = [mod(T.CATEGORY_PCT, { target: 'Bières', value: 50 })]
    expect(priceRatioFor({ ...beer, menuItemId: null }, list, ctx).modified).toBe(false)
  })

  it('sentinelle : jamais ciblée par catégorie ou type, mais le prix de l\'article reste modifiable', () => {
    const byCat = [mod(T.CATEGORY_PCT, { target: UNATTACHED_ITEM_KEY, value: 50 })]
    const byType = [mod(T.TYPE_PCT, { target: UNATTACHED_ITEM_KEY, value: 50 })]
    const byId = [mod(T.ITEM_PRICE, { target: 'm1', value: 20 })]
    const sentCat = { menuItemId: 'm1', category: UNATTACHED_ITEM_KEY, type: 'Boisson' }
    const sentType = { menuItemId: 'm1', category: 'Bières', type: UNATTACHED_ITEM_KEY }
    expect(priceRatioFor(sentCat, byCat, ctx).modified).toBe(false)
    expect(priceRatioFor(sentType, byType, ctx).modified).toBe(false)
    expect(priceRatioFor(sentCat, byId, ctx).modified).toBe(true)
    expect(priceRatioFor(sentType, byId, ctx).modified).toBe(true)
  })
})

describe('priceRatioFor : categoryPct et typePct', () => {
  it('categoryPct : ratio 1 + v/100', () => {
    const r = priceRatioFor(beer, [mod(T.CATEGORY_PCT, { target: 'Bières', value: 10 })], ctx)
    expect(r.ratio).toBeCloseTo(1.1, 10)
    expect(r).toMatchObject({ modified: true, unpriceable: false })
  })

  it('typePct : ratio 1 + v/100', () => {
    const r = priceRatioFor(beer, [mod(T.TYPE_PCT, { target: 'Boisson', value: -25 })], ctx)
    expect(r.ratio).toBeCloseTo(0.75, 10)
    expect(r.modified).toBe(true)
  })

  it('-100 % donne 0 (le catalogue n\'est pas consulté)', () => {
    const r = priceRatioFor(beer, [mod(T.CATEGORY_PCT, { target: 'Bières', value: -100 })], { catalogById: null })
    expect(r).toEqual({ ratio: 0, modified: true, unpriceable: false })
  })

  it('+0 % : ratio 1 mais modifié', () => {
    const r = priceRatioFor(beer, [mod(T.CATEGORY_PCT, { target: 'Bières', value: 0 })], ctx)
    expect(r).toEqual({ ratio: 1, modified: true, unpriceable: false })
  })
})

describe('priceRatioFor : itemPrice', () => {
  it('nouveau TTC / TTC catalogue (la TVA s\'annule)', () => {
    const r = priceRatioFor(beer, [mod(T.ITEM_PRICE, { target: 'm1', value: 10 })], ctx)
    expect(r.ratio).toBeCloseTo(10 / 8, 10)
    expect(r).toMatchObject({ modified: true, unpriceable: false })
  })

  it('TTC égal au catalogue : ratio 1', () => {
    const r = priceRatioFor(beer, [mod(T.ITEM_PRICE, { target: 'm1', value: 8 })], ctx)
    expect(r).toEqual({ ratio: 1, modified: true, unpriceable: false })
  })

  it('prix à 0 € : ratio 0', () => {
    const r = priceRatioFor(beer, [mod(T.ITEM_PRICE, { target: 'm1', value: 0 })], ctx)
    expect(r.ratio).toBe(0)
  })

  it('article sans prix catalogue : ratio 1 et non modifiable', () => {
    const a = { menuItemId: 'm3', category: 'Bières', type: 'Boisson' }
    const r = priceRatioFor(a, [mod(T.ITEM_PRICE, { target: 'm3', value: 5 })], ctx)
    expect(r).toEqual({ ratio: 1, modified: false, unpriceable: true })
  })

  it('article absent du catalogue ou catalogue absent : non modifiable', () => {
    const a = { menuItemId: 'm404', category: 'Bières', type: 'Boisson' }
    const list = [mod(T.ITEM_PRICE, { target: 'm404', value: 5 })]
    expect(priceRatioFor(a, list, ctx).unpriceable).toBe(true)
    expect(priceRatioFor(a, list, {}).unpriceable).toBe(true)
    expect(priceRatioFor(a, list).unpriceable).toBe(true)
  })

  it('ne cible que l\'article choisi', () => {
    const list = [mod(T.ITEM_PRICE, { target: 'm2', value: 6 })]
    expect(priceRatioFor(beer, list, ctx).modified).toBe(false)
    expect(priceRatioFor({ menuItemId: 'm2', category: 'Softs', type: 'Boisson' }, list, ctx).ratio).toBe(2)
  })

  it('utilise le TTC propre à l\'espace courant', () => {
    const a = { menuItemId: 'm4', category: 'Bières', type: 'Boisson' }
    const list = [mod(T.ITEM_PRICE, { target: 'm4', value: 15 })]
    expect(priceRatioFor(a, list, { catalogById, spaceId: 'sp1' }).ratio).toBeCloseTo(1.5, 10)
    expect(priceRatioFor(a, list, { catalogById, spaceId: 'autre' }).ratio).toBeCloseTo(15 / 8, 10)
  })
})

describe('priceRatioFor : la dernière modification de prix l\'emporte, sans cumul', () => {
  const item = mod(T.ITEM_PRICE, { target: 'm1', value: 12 }) // ratio 1.5
  const cat = mod(T.CATEGORY_PCT, { target: 'Bières', value: 10 }) // ratio 1.1
  const type = mod(T.TYPE_PCT, { target: 'Boisson', value: -50 }) // ratio 0.5

  it('itemPrice puis categoryPct sur la même catégorie : la catégorie gagne', () => {
    const r = priceRatioFor(beer, [item, cat], ctx)
    expect(r.ratio).toBeCloseTo(1.1, 10)
  })

  it('categoryPct puis itemPrice : l\'article gagne', () => {
    const r = priceRatioFor(beer, [cat, item], ctx)
    expect(r.ratio).toBeCloseTo(1.5, 10)
  })

  it('typePct en dernier : le type gagne', () => {
    expect(priceRatioFor(beer, [item, cat, type], ctx).ratio).toBeCloseTo(0.5, 10)
  })

  it('pas de cumul : jamais 1.5 x 1.1', () => {
    const r = priceRatioFor(beer, [item, cat], ctx)
    expect(r.ratio).not.toBeCloseTo(1.65, 5)
  })

  it('re-ajout de la même clé : remplace et passe en dernier', () => {
    let list = addModification([], item)
    list = addModification(list, cat)
    expect(priceRatioFor(beer, list, ctx).ratio).toBeCloseTo(1.1, 10)
    list = addModification(list, mod(T.ITEM_PRICE, { target: 'm1', value: 16 })) // ratio 2
    expect(list).toHaveLength(2)
    expect(priceRatioFor(beer, list, ctx).ratio).toBeCloseTo(2, 10)
  })

  it('une modification qui ne s\'applique pas à l\'article ne masque pas les autres', () => {
    const otherCat = mod(T.CATEGORY_PCT, { target: 'Softs', value: 80 })
    expect(priceRatioFor(beer, [cat, otherCat], ctx).ratio).toBeCloseTo(1.1, 10)
  })

  it('le gagnant non modifiable masque la catégorie ajoutée avant lui', () => {
    const a = { menuItemId: 'm3', category: 'Bières', type: 'Boisson' }
    const noPrice = mod(T.ITEM_PRICE, { target: 'm3', value: 5 })
    const r = priceRatioFor(a, [cat, noPrice], ctx)
    expect(r).toEqual({ ratio: 1, modified: false, unpriceable: true })
  })
})
