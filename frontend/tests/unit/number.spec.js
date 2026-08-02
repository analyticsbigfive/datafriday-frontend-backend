import { parseLocaleNumber, roundTo, stepBy, clampNumber } from '@/utils/number'

describe('parseLocaleNumber', () => {
  it.each([
    ['2,5', 2.5],
    ['2.5', 2.5],
    ['12', 12],
    ['0', 0],
    ['-1,25', -1.25],
    ['1 234,56', 1234.56],
    ['1 234,56', 1234.56], // espace insécable produit par Intl fr-FR
    ['1 234,56', 1234.56], // espace fine insécable
    ['1.234,56', 1234.56],
    ['1,234.56', 1234.56],
    ['1,234,567', 1234567],
    ['1.234.567', 1234567],
    ['12,50 €', 12.5],
    ['€12.50', 12.5],
    ['5,5%', 5.5],
    [3.25, 3.25], // number passe tel quel
  ])('parse %p → %p', (raw, expected) => {
    expect(parseLocaleNumber(raw)).toBe(expected)
  })

  it.each(['', '   ', 'abc', '-', '+', null, undefined, NaN, Infinity])(
    'retourne null pour %p',
    (raw) => {
      expect(parseLocaleNumber(raw)).toBeNull()
    }
  )
})

describe('roundTo', () => {
  it('arrondit à 2 décimales en compensant le flottant', () => {
    expect(roundTo(1.005, 2)).toBe(1.01) // 1.005 → 1.0049999… sans EPSILON
    expect(roundTo(2.675, 2)).toBe(2.68)
    expect(roundTo(12.4999, 2)).toBe(12.5)
    expect(roundTo(3, 2)).toBe(3)
  })

  it('supporte 0 et 3 décimales', () => {
    expect(roundTo(2.5, 0)).toBe(3)
    expect(roundTo(0.0015, 3)).toBe(0.002)
  })
})

describe('stepBy', () => {
  it('incrémente de 0.01 en restant à 2 décimales', () => {
    expect(stepBy(2.5, 0.01, 2)).toBe(2.51)
    expect(stepBy(2.51, -0.01, 2)).toBe(2.5)
  })

  it('préserve les décimales saisies lors d’un pas de 1', () => {
    expect(stepBy(2.55, 1, 2)).toBe(3.55)
    expect(stepBy(2.55, -1, 2)).toBe(1.55)
  })

  it('évite la dérive flottante (0.1 + 0.2)', () => {
    expect(stepBy(0.1, 0.2, 2)).toBe(0.3)
    let v = 0
    for (let i = 0; i < 10; i++) v = stepBy(v, 0.01, 2)
    expect(v).toBe(0.1)
  })

  it('traite null/undefined/NaN comme 0', () => {
    expect(stepBy(null, 0.01, 2)).toBe(0.01)
    expect(stepBy(undefined, -0.01, 2)).toBe(-0.01)
  })
})

describe('clampNumber', () => {
  it('borne min/max, null = borne absente', () => {
    expect(clampNumber(-5, 0, null)).toBe(0)
    expect(clampNumber(150, 0, 100)).toBe(100)
    expect(clampNumber(50, 0, 100)).toBe(50)
    expect(clampNumber(-5, null, null)).toBe(-5)
  })
})
