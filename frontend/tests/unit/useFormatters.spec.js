import {
  formatCurrency,
  formatCurrencyDetailed,
  formatNumber,
  formatUnits,
  formatPercent,
  formatVariation,
} from '@/composables/useFormatters'
import {
  toIntlLocale,
  currentIntlLocale,
  GROUP_SEPARATOR,
} from '@/composables/useNumberFormat'

// La locale par défaut des formatters suit la langue de l'app (localStorage.appLocale).
const setAppLocale = (locale) => localStorage.setItem('appLocale', locale)

// Normalise les espaces (Intl produit des insécables/fines) pour des asserts lisibles.
const flat = (s) => s.replace(/[\s  ]/g, ' ')

afterEach(() => localStorage.removeItem('appLocale'))

describe('toIntlLocale / currentIntlLocale', () => {
  it('mappe fr → fr-FR et en → en-US, défaut fr', () => {
    expect(toIntlLocale('fr')).toBe('fr-FR')
    expect(toIntlLocale('en')).toBe('en-US')
    expect(toIntlLocale(null)).toBe('fr-FR')

    setAppLocale('en')
    expect(currentIntlLocale()).toBe('en-US')
    setAppLocale('fr')
    expect(currentIntlLocale()).toBe('fr-FR')
  })
})

describe('formatCurrency (KPI, 0 décimale)', () => {
  it('suit la langue de l’app : fr → "1 235 €", en → "€1 235"', () => {
    setAppLocale('fr')
    expect(flat(formatCurrency(1234.56))).toBe('1 235 €')
    setAppLocale('en')
    expect(flat(formatCurrency(1234.56))).toBe('€1 235')
  })

  // Retour maquette 17/08 : le séparateur de milliers est une espace fine
  // insécable dans les deux langues — la virgule de en-US est proscrite.
  it('sépare les milliers par GROUP_SEPARATOR, jamais par une virgule', () => {
    setAppLocale('en')
    expect(formatCurrency(1234.56)).toBe(`€1${GROUP_SEPARATOR}235`)
    expect(formatCurrency(1234.56)).not.toContain(',')
    setAppLocale('fr')
    // `toContain` : l'espace qui précède le « € » est une insécable normale
    // (U+00A0) posée par Intl, seuls les groupes de milliers nous intéressent.
    expect(formatCurrency(1234567)).toContain(
      `1${GROUP_SEPARATOR}234${GROUP_SEPARATOR}567`
    )
  })

  it('retourne — pour null/NaN et accepte 0', () => {
    expect(formatCurrency(null)).toBe('—')
    expect(formatCurrency(NaN)).toBe('—')
    setAppLocale('en')
    expect(formatCurrency(0)).toBe('€0')
  })
})

describe('formatCurrencyDetailed (prix unitaires, 2 décimales)', () => {
  it('fr → "12,50 €", en → "€12.50"', () => {
    setAppLocale('fr')
    expect(flat(formatCurrencyDetailed(12.5))).toBe('12,50 €')
    setAppLocale('en')
    expect(formatCurrencyDetailed(12.5)).toBe('€12.50')
  })
})

describe('formatUnits (quantités, max 2 décimales)', () => {
  it('fr → virgule, en → point, zéros non forcés', () => {
    setAppLocale('fr')
    expect(formatUnits(3.25)).toBe('3,25')
    expect(formatUnits(12)).toBe('12')
    setAppLocale('en')
    expect(formatUnits(3.25)).toBe('3.25')
  })
})

describe('formatPercent / formatVariation (séparateur localisé — plus de toFixed)', () => {
  it('fr → "5,5%", en → "5.5%"', () => {
    setAppLocale('fr')
    expect(formatPercent(5.5)).toBe('5,5%')
    setAppLocale('en')
    expect(formatPercent(5.5)).toBe('5.5%')
  })

  it('formatVariation garde le signe +', () => {
    setAppLocale('fr')
    expect(formatVariation(2.5)).toBe('+2,5%')
    expect(formatVariation(-2.5)).toBe('-2,5%')
    expect(formatVariation(null)).toBe('')
  })
})

describe('formatNumber', () => {
  it('arrondit à l’entier dans la locale', () => {
    setAppLocale('fr')
    expect(flat(formatNumber(1234.6))).toBe('1 235')
    setAppLocale('en')
    expect(formatNumber(1234.6)).toBe(`1${GROUP_SEPARATOR}235`)
  })
})
