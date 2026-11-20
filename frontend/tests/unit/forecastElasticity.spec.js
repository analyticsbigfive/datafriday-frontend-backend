import {
  ELASTICITY_DEFAULT,
  ELASTICITY_MAX,
  ELASTICITY_MIN,
  clampElasticity,
  priceEffect,
} from '@/utils/forecastElasticity'

describe('clampElasticity', () => {
  it('borne dans [-3, 0], au dixième, 0 par défaut', () => {
    expect(ELASTICITY_DEFAULT).toBe(0)
    expect(ELASTICITY_MIN).toBe(-3)
    expect(ELASTICITY_MAX).toBe(0)
    expect(clampElasticity(-1.24)).toBe(-1.2)
    expect(clampElasticity('-0.5')).toBe(-0.5)
    expect(clampElasticity(-7)).toBe(-3)
    expect(clampElasticity(1)).toBe(0)
    expect(clampElasticity('')).toBe(0)
    expect(clampElasticity(null)).toBe(0)
    expect(clampElasticity('abc')).toBe(0)
    expect(Object.is(clampElasticity(-0.01), 0)).toBe(true)
  })
})

describe('priceEffect', () => {
  it('e = 0 : CA suit le prix, quantités fixes', () => {
    expect(priceEffect(1.2, 0)).toEqual({ revenue: 1.2, quantity: 1 })
    expect(priceEffect(1.2)).toEqual({ revenue: 1.2, quantity: 1 })
  })

  it('e < 0 : Q x r^e, CA x r^(1+e)', () => {
    const { revenue, quantity } = priceEffect(1.1, -2)
    expect(quantity).toBeCloseTo(1.1 ** -2, 10)
    expect(revenue).toBeCloseTo(1.1 ** -1, 10)
    const unit = priceEffect(0.8, -1)
    expect(unit.quantity).toBeCloseTo(1.25, 10)
    expect(unit.revenue).toBeCloseTo(1, 10)
  })

  it('ratio 1 ou invalide : aucun effet ; prix à 0 : CA nul, quantités fixes', () => {
    expect(priceEffect(1, -2)).toEqual({ revenue: 1, quantity: 1 })
    expect(priceEffect(NaN, -2)).toEqual({ revenue: 1, quantity: 1 })
    expect(priceEffect(0, -2)).toEqual({ revenue: 0, quantity: 1 })
  })
})
