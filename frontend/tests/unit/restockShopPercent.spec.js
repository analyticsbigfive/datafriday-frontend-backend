// Chantier 388 : répartition du besoin par PDV (utils/restockShopPercent.js).
import {
  shopPercentKey,
  normalizeShopPercent,
  effectiveShopPercent,
  clearItemShopPercents,
  isItemPercentMixed,
  groupRowsByItemKey,
} from '@/utils/restockShopPercent'

const BEER = 'beer-id|||pcs'
const BUN = 'bun-id|||pcs'

describe('shopPercentKey', () => {
  it('compose shopId et itemKey (qui contient déjà le séparateur)', () => {
    expect(shopPercentKey('shop-1', BEER)).toBe('shop-1|||beer-id|||pcs')
  })

  it('tolère des valeurs absentes sans planter', () => {
    expect(shopPercentKey(null, undefined)).toBe('|||')
  })
})

describe('normalizeShopPercent', () => {
  it('borne à 0..10000 (valeur libre au-delà du curseur 200) et arrondit', () => {
    expect(normalizeShopPercent(250)).toBe(250)
    expect(normalizeShopPercent(50000)).toBe(10000)
    expect(normalizeShopPercent(-10)).toBe(0)
    expect(normalizeShopPercent('112.6')).toBe(113)
  })

  it('0 est une valeur légitime, null / vide / NaN ne le sont pas', () => {
    expect(normalizeShopPercent(0)).toBe(0)
    expect(normalizeShopPercent('0')).toBe(0)
    expect(normalizeShopPercent(null)).toBeNull()
    expect(normalizeShopPercent(undefined)).toBeNull()
    expect(normalizeShopPercent('')).toBeNull()
    expect(normalizeShopPercent('abc')).toBeNull()
  })
})

describe('effectiveShopPercent', () => {
  it('le réglage PDV prime sur le % de l\'article', () => {
    expect(effectiveShopPercent({
      shopPercents: { [shopPercentKey('shop-1', BEER)]: 150 },
      itemPercents: { [BEER]: 110 },
      shopId: 'shop-1',
      itemKey: BEER,
    })).toBe(150)
  })

  it('sans réglage PDV, % de l\'article', () => {
    expect(effectiveShopPercent({
      shopPercents: { [shopPercentKey('shop-2', BEER)]: 150 },
      itemPercents: { [BEER]: 110 },
      shopId: 'shop-1',
      itemKey: BEER,
    })).toBe(110)
  })

  it('sans rien, 100', () => {
    expect(effectiveShopPercent({ shopId: 'shop-1', itemKey: BEER })).toBe(100)
    expect(effectiveShopPercent()).toBe(100)
  })

  it('un réglage PDV à 0 % ne retombe PAS sur le % de l\'article', () => {
    expect(effectiveShopPercent({
      shopPercents: { [shopPercentKey('shop-1', BEER)]: 0 },
      itemPercents: { [BEER]: 120 },
      shopId: 'shop-1',
      itemKey: BEER,
    })).toBe(0)
  })

  it('un article à 0 % reste à 0', () => {
    expect(effectiveShopPercent({ itemPercents: { [BEER]: 0 }, shopId: 'shop-1', itemKey: BEER })).toBe(0)
  })

  it('une valeur PDV illisible retombe sur l\'article', () => {
    expect(effectiveShopPercent({
      shopPercents: { [shopPercentKey('shop-1', BEER)]: null },
      itemPercents: { [BEER]: 90 },
      shopId: 'shop-1',
      itemKey: BEER,
    })).toBe(90)
  })
})

describe('clearItemShopPercents', () => {
  it('supprime seulement les réglages de l\'article visé, sans muter l\'entrée', () => {
    const input = {
      [shopPercentKey('shop-1', BEER)]: 150,
      [shopPercentKey('shop-2', BEER)]: 0,
      [shopPercentKey('shop-1', BUN)]: 80,
    }
    const out = clearItemShopPercents(input, BEER)
    expect(out).toEqual({ [shopPercentKey('shop-1', BUN)]: 80 })
    expect(Object.keys(input)).toHaveLength(3)
  })

  it('n\'efface pas un article dont la clé finit pareil sans être le même', () => {
    const other = 'xbeer-id|||pcs'
    const out = clearItemShopPercents({ [shopPercentKey('shop-1', other)]: 120 }, BEER)
    expect(out).toEqual({ [shopPercentKey('shop-1', other)]: 120 })
  })

  it('entrée absente → objet vide', () => {
    expect(clearItemShopPercents(undefined, BEER)).toEqual({})
    expect(clearItemShopPercents(null, BEER)).toEqual({})
  })
})

describe('isItemPercentMixed', () => {
  const shops = ['shop-1', 'shop-2', 'shop-3']

  it('aucun réglage PDV → pas mixte', () => {
    expect(isItemPercentMixed({}, 110, shops, BEER)).toBe(false)
  })

  it('un PDV différent → mixte', () => {
    expect(isItemPercentMixed({ [shopPercentKey('shop-1', BEER)]: 150 }, 110, shops, BEER)).toBe(true)
  })

  it('un PDV à 0 % sur un article à 100 % → mixte', () => {
    expect(isItemPercentMixed({ [shopPercentKey('shop-2', BEER)]: 0 }, undefined, shops, BEER)).toBe(true)
  })

  it('réglage PDV égal au % de l\'article → pas mixte', () => {
    expect(isItemPercentMixed({ [shopPercentKey('shop-1', BEER)]: 110 }, 110, shops, BEER)).toBe(false)
  })

  it('tous les PDV réglés à la même valeur → pas mixte', () => {
    const all = Object.fromEntries(shops.map((s) => [shopPercentKey(s, BEER), 130]))
    expect(isItemPercentMixed(all, 100, shops, BEER)).toBe(false)
  })

  it('le réglage d\'un AUTRE article n\'influence pas', () => {
    expect(isItemPercentMixed({ [shopPercentKey('shop-1', BUN)]: 150 }, 100, shops, BEER)).toBe(false)
  })

  it('aucun PDV ou entrées manquantes → pas mixte', () => {
    expect(isItemPercentMixed(undefined, undefined, undefined, BEER)).toBe(false)
    expect(isItemPercentMixed({}, 100, [], BEER)).toBe(false)
  })
})

describe('groupRowsByItemKey', () => {
  it('groupe par itemKey en gardant l\'ordre, ignore les lignes invalides', () => {
    const rows = [
      { shopId: 'a', itemKey: BEER },
      { shopId: 'a', itemKey: BUN },
      null,
      { shopId: 'b', itemKey: BEER },
      { shopId: 'c' },
    ]
    const out = groupRowsByItemKey(rows)
    expect(Object.keys(out)).toEqual([BEER, BUN])
    expect(out[BEER].map((r) => r.shopId)).toEqual(['a', 'b'])
  })

  it('entrée non tableau → objet vide', () => {
    expect(groupRowsByItemKey(undefined)).toEqual({})
  })
})
