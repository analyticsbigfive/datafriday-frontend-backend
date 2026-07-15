import { htFromTtc, menuItemPriceHt } from '@/utils/price'

describe('htFromTtc — TTC → HT', () => {
  it('détaxe au taux en pourcentage', () => {
    expect(htFromTtc(11, 10)).toBeCloseTo(10, 6)
    expect(htFromTtc(120, 20)).toBeCloseTo(100, 6)
    expect(htFromTtc(105.5, 5.5)).toBeCloseTo(100, 6)
  })

  it('accepte des chaînes numériques', () => {
    expect(htFromTtc('11', '10')).toBeCloseTo(10, 6)
  })

  it('taux absent / 0 / non fini → passthrough (pas de division par zéro)', () => {
    expect(htFromTtc(11, null)).toBe(11)
    expect(htFromTtc(11, undefined)).toBe(11)
    expect(htFromTtc(11, 0)).toBe(11)
    expect(htFromTtc(11, NaN)).toBe(11)
    expect(htFromTtc(11, -5)).toBe(11) // taux aberrant négatif → passthrough
  })

  it('ttc non fini → null ; null → 0 (Number(null)===0)', () => {
    expect(htFromTtc(null, 10)).toBe(0) // Number(null) === 0 (fini) → détaxe 0
    expect(htFromTtc(undefined, 10)).toBeNull() // Number(undefined) === NaN
    expect(htFromTtc('abc', 10)).toBeNull()
    expect(htFromTtc(NaN, 10)).toBeNull()
  })
})

describe('menuItemPriceHt — HT unitaire d\'un menu item', () => {
  it('HT direct global (pricing.gross.ht) prioritaire', () => {
    const mi = { basePrice: 8, pricing: { gross: { ttc: 8, ht: 7.27 }, vatRate: 10 } }
    expect(menuItemPriceHt(mi, null)).toBeCloseTo(7.27, 2)
  })

  it('détaxe le TTC global via pricing.vatRate quand pas de HT direct', () => {
    const mi = { basePrice: 8, pricing: { vatRate: 10 } }
    expect(menuItemPriceHt(mi, null)).toBeCloseTo(7.2727, 3)
  })

  it('prix propre à l\'espace : HT direct de spacePricing[space].gross.ht', () => {
    const mi = {
      basePrice: 8,
      spacePricing: { sp1: { gross: { ttc: 12, ht: 10 }, vatRate: 20 } },
      pricing: { gross: { ht: 7.27 }, vatRate: 10 },
    }
    expect(menuItemPriceHt(mi, 'sp1')).toBeCloseTo(10, 2) // espace prime sur global
    expect(menuItemPriceHt(mi, 'other')).toBeCloseTo(7.27, 2) // fallback global
  })

  it('forme legacy spaceSpecificPrices[] détaxée', () => {
    const mi = {
      basePrice: 8,
      spaceSpecificPrices: [{ spaceIds: ['sp1'], price: 11, vatRate: 10 }],
    }
    expect(menuItemPriceHt(mi, 'sp1')).toBeCloseTo(10, 2)
  })

  it('forme DB spacePrices[spaceId]={ttc,vatRate} détaxée', () => {
    const mi = {
      basePrice: 8,
      vatRate: 10,
      spacePrices: { sp1: { ttc: 8, vatRate: 10 } },
    }
    expect(menuItemPriceHt(mi, 'sp1')).toBeCloseTo(7.2727, 3) // 8 / 1.10
    // autre espace sans prix propre → repli global (vatRate top-level)
    expect(menuItemPriceHt(mi, 'other')).toBeCloseTo(7.2727, 3)
  })

  it('item synthétique (basePrice déjà HT, aucun vatRate) → passthrough', () => {
    const mi = { basePrice: 2.08 } // pas de pricing/vatRate → HT tel quel
    expect(menuItemPriceHt(mi, 'sp1')).toBeCloseTo(2.08, 2)
  })

  it('garde-fous : objet vide / null → 0', () => {
    expect(menuItemPriceHt(null, 'sp1')).toBe(0)
    expect(menuItemPriceHt({}, 'sp1')).toBe(0)
  })
})
