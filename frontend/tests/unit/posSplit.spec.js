import {
  equalParts,
  remainingToPay,
  clampToRemaining,
  clampSplitCount,
  canConfirmSplit,
  canAddPayment,
  POS_MAX_PAYMENTS,
} from '@/utils/posSplit'
import { formatCents, parseAmountInput, toCents, toEuros } from '@/utils/posMoney'

describe('posSplit : parts égales', () => {
  it('34 € en 3 parts donne 11,33 + 11,33 + 11,34 (centimes restants sur la dernière)', () => {
    expect(equalParts(3400, 3)).toEqual([1133, 1133, 1134])
  })

  it('la somme des parts est toujours égale au total', () => {
    for (const total of [1, 99, 100, 1234, 3400, 99999]) {
      for (let n = 2; n <= 10; n += 1) {
        const parts = equalParts(total, n)
        expect(parts).toHaveLength(n)
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total)
        // la dernière part est la seule à pouvoir différer, et seulement vers le haut
        expect(parts[n - 1]).toBeGreaterThanOrEqual(parts[0])
      }
    }
  })

  it('borne le nombre de parts entre 2 et 10', () => {
    expect(clampSplitCount(1)).toBe(2)
    expect(clampSplitCount(0)).toBe(2)
    expect(clampSplitCount(11)).toBe(10)
    expect(clampSplitCount('4')).toBe(4)
    expect(equalParts(1000, 50)).toHaveLength(10)
  })

  it('un total nul ou négatif ne se partage pas', () => {
    expect(equalParts(0, 3)).toEqual([])
    expect(equalParts(-100, 3)).toEqual([])
  })
})

describe('posSplit : montant par montant et reste à payer', () => {
  const lines = (...amounts) => amounts.map((amountCents) => ({ paymentMethodId: 'm', amountCents }))

  it('calcule le reste à payer', () => {
    expect(remainingToPay(3400, [])).toBe(3400)
    expect(remainingToPay(3400, lines(1000, 1500))).toBe(900)
    expect(remainingToPay(3400, lines(3400))).toBe(0)
  })

  it('un montant ne dépasse jamais le reste à payer', () => {
    expect(clampToRemaining(2000, 900)).toBe(900)
    expect(clampToRemaining(500, 900)).toBe(500)
    expect(clampToRemaining(500, 0)).toBe(0)
    expect(clampToRemaining(-5, 900)).toBe(0)
  })

  it('Encaisser n est actif qu à reste nul (montant par montant)', () => {
    expect(canConfirmSplit({ mode: 'amount', totalCents: 3400, lines: lines(1000) })).toBe(false)
    expect(canConfirmSplit({ mode: 'amount', totalCents: 3400, lines: lines(1000, 2400) })).toBe(true)
    expect(canConfirmSplit({ mode: 'amount', totalCents: 3400, lines: [] })).toBe(false)
  })

  it('en parts égales le reste est nul par construction', () => {
    expect(canConfirmSplit({ mode: 'equal', totalCents: 3400, lines: [] })).toBe(true)
    expect(canConfirmSplit({ mode: 'equal', totalCents: 0, lines: [] })).toBe(false)
  })

  it('plafonne à 10 paiements par ticket', () => {
    expect(canAddPayment(Array(POS_MAX_PAYMENTS - 1).fill({}))).toBe(true)
    expect(canAddPayment(Array(POS_MAX_PAYMENTS).fill({}))).toBe(false)
  })
})

describe('posMoney', () => {
  it('convertit euros et centimes sans dérive flottante', () => {
    expect(toCents(4.35)).toBe(435)
    expect(toCents(1.005 * 2)).toBe(201)
    expect(toEuros(1133)).toBe(11.33)
    expect(toCents(-1)).toBe(-100)
  })

  it('formate avec virgule, espace insécable et signe devant', () => {
    expect(formatCents(1133)).toBe('11,33 €')
    expect(formatCents(-100)).toBe('-1,00 €')
  })

  it('lit un montant saisi au clavier', () => {
    expect(parseAmountInput('2')).toBe(200)
    expect(parseAmountInput('2,5')).toBe(250)
    expect(parseAmountInput('2.50')).toBe(250)
    expect(parseAmountInput('-2')).toBeNull()
    expect(parseAmountInput('abc')).toBeNull()
    expect(parseAmountInput('1,234')).toBeNull()
  })
})
