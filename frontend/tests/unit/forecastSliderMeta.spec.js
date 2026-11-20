import { SLIDER_META, baseValueFor, resultingValue } from '@/utils/forecastSliderMeta'
import { FORECAST_MODIFICATION_TYPES as T } from '@/utils/forecastModificationModel'
import { translations } from '@/i18n/translations'

const BASES = { transformationRate: 12.5, perCapita: 8, basket: '15.2' }

describe('SLIDER_META', () => {
  it('chaque type à curseur a un libellé traduit (FR et EN)', () => {
    for (const meta of Object.values(SLIDER_META)) {
      expect(translations.fr[meta.labelKey]).toBeTruthy()
      expect(translations.en[meta.labelKey]).toBeTruthy()
    }
  })

  it('le prix d\'article n\'a pas de curseur', () => {
    expect(SLIDER_META[T.ITEM_PRICE]).toBeUndefined()
  })
})

describe('baseValueFor', () => {
  it('lit la valeur de base du rapport selon le type', () => {
    expect(baseValueFor(T.TRANSFORMATION, BASES)).toBe(12.5)
    expect(baseValueFor(T.PERCAP, BASES)).toBe(8)
    expect(baseValueFor(T.BASKET, BASES)).toBe(15.2)
  })

  it('prix de catégorie et de type : pas de base unique', () => {
    expect(baseValueFor(T.CATEGORY_PCT, BASES)).toBeNull()
    expect(baseValueFor(T.TYPE_PCT, BASES)).toBeNull()
  })

  it('type sans curseur, valeurs absentes ou non numériques : null', () => {
    expect(baseValueFor(T.ITEM_PRICE, BASES)).toBeNull()
    expect(baseValueFor('zzz', BASES)).toBeNull()
    expect(baseValueFor(T.BASKET, null)).toBeNull()
    expect(baseValueFor(T.BASKET, {})).toBeNull()
    expect(baseValueFor(T.BASKET, { basket: '' })).toBeNull()
    expect(baseValueFor(T.BASKET, { basket: null })).toBeNull()
    expect(baseValueFor(T.BASKET, { basket: 'abc' })).toBeNull()
    expect(baseValueFor(T.BASKET, { basket: Infinity })).toBeNull()
  })

  it('une base à 0 est une vraie valeur', () => {
    expect(baseValueFor(T.PERCAP, { perCapita: 0 })).toBe(0)
  })
})

describe('resultingValue', () => {
  it('base x (1 + % / 100)', () => {
    expect(resultingValue(10, 10)).toBeCloseTo(11)
    expect(resultingValue(10, -50)).toBeCloseTo(5)
    expect(resultingValue(10, -100)).toBe(0)
    expect(resultingValue(10, 100)).toBeCloseTo(20)
    expect(resultingValue(10, 0)).toBe(10)
  })

  it('base inconnue : null', () => {
    expect(resultingValue(null, 10)).toBeNull()
    expect(resultingValue(undefined, 10)).toBeNull()
    expect(resultingValue(Number.NaN, 10)).toBeNull()
  })

  it('pourcentage invalide traité comme 0', () => {
    expect(resultingValue(10, 'abc')).toBe(10)
    expect(resultingValue(10, undefined)).toBe(10)
  })

  it('base à 0 : résultat 0', () => {
    expect(resultingValue(0, 50)).toBe(0)
  })
})
