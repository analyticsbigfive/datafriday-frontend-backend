import {
  FORECAST_TYPE_LABEL_KEYS,
  fillTemplate,
  modificationLabel,
  modificationTargetLabel,
  signedPercent,
} from '@/utils/forecastModificationLabels'
import { FORECAST_MODIFICATION_TYPES as T, PERCAP_MODES } from '@/utils/forecastModificationModel'
import { translations } from '@/i18n/translations'

// Dictionnaire réel (FR) : vérifie aussi que chaque clé existe et que les gabarits se remplissent.
const t = (key) => translations.fr[key] ?? `?${key}`
const formatCurrency = (n) => `${n.toFixed(2).replace('.', ',')} €`
const options = { items: [{ id: 'm1', name: 'Bière 50 cl' }] }
const ctx = { t, options, formatCurrency }

describe('signedPercent', () => {
  it('signe les hausses, garde le moins, 0 sans signe, espace insécable avant %', () => {
    expect(signedPercent(10)).toBe('+10\u00a0%')
    expect(signedPercent(-5)).toBe('-5\u00a0%')
    expect(signedPercent(0)).toBe('0\u00a0%')
    expect(signedPercent(10)).toContain('\u00a0')
  })

  it('accepte une chaîne numérique et refuse le non fini', () => {
    expect(signedPercent('12')).toBe('+12\u00a0%')
    expect(signedPercent('abc')).toBe('')
    expect(signedPercent(undefined)).toBe('')
    expect(signedPercent(Infinity)).toBe('')
  })
})

describe('fillTemplate', () => {
  it('remplace toutes les occurrences de chaque variable', () => {
    expect(fillTemplate('{a} et {a} puis {b}', { a: 'x', b: 2 })).toBe('x et x puis 2')
  })

  it('laisse un placeholder sans valeur et tolère un gabarit absent', () => {
    expect(fillTemplate('{a} {b}', { a: 1 })).toBe('1 {b}')
    expect(fillTemplate(undefined, { a: 1 })).toBe('')
    expect(fillTemplate('texte')).toBe('texte')
  })

  it('une valeur contenant $ ou { n\'est pas réinterprétée', () => {
    expect(fillTemplate('{a}', { a: '$&{b}' })).toBe('$&{b}')
  })
})

describe('FORECAST_TYPE_LABEL_KEYS', () => {
  it('une clé i18n par type, présente en FR et en EN', () => {
    expect(Object.keys(FORECAST_TYPE_LABEL_KEYS).sort()).toEqual(Object.values(T).sort())
    for (const key of Object.values(FORECAST_TYPE_LABEL_KEYS)) {
      expect(translations.fr[key]).toBeTruthy()
      expect(translations.en[key]).toBeTruthy()
    }
  })
})

describe('modificationLabel', () => {
  it('prix d\'article : nom de l\'article et montant TTC', () => {
    const m = { type: T.ITEM_PRICE, target: 'm1', value: 7.5 }
    expect(modificationLabel(m, ctx)).toBe('Prix TTC Bière 50 cl : 7,50 €')
  })

  it('prix d\'article : identifiant brut si l\'article est inconnu des options', () => {
    const m = { type: T.ITEM_PRICE, target: 'm9', value: 3 }
    expect(modificationLabel(m, ctx)).toBe('Prix TTC m9 : 3,00 €')
    expect(modificationLabel(m, { t, formatCurrency })).toBe('Prix TTC m9 : 3,00 €')
  })

  it('catégorie et type : nom de la cible et % signé', () => {
    expect(modificationLabel({ type: T.CATEGORY_PCT, target: 'Bières', value: 10 }, ctx)).toBe('Catégorie Bières : +10\u00a0%')
    expect(modificationLabel({ type: T.TYPE_PCT, target: 'Boisson', value: -5 }, ctx)).toBe('Type Boisson : -5\u00a0%')
  })

  it('transformation et panier : le nom du levier', () => {
    expect(modificationLabel({ type: T.TRANSFORMATION, value: 8 }, ctx)).toBe('Taux de transformation : +8\u00a0%')
    expect(modificationLabel({ type: T.BASKET, value: -3 }, ctx)).toBe('Panier moyen : -3\u00a0%')
  })

  it('percap : la cible dépend du mode', () => {
    expect(modificationLabel({ type: T.PERCAP, mode: PERCAP_MODES.TRANSFORMATION, value: 5 }, ctx))
      .toBe('Percap (plus de monde achète) : +5\u00a0%')
    expect(modificationLabel({ type: T.PERCAP, mode: PERCAP_MODES.BASKET, value: 5 }, ctx))
      .toBe('Percap (panier plus gros) : +5\u00a0%')
  })

  it('formatPercent injectable ; modification absente : chaîne vide', () => {
    const m = { type: T.BASKET, value: 4 }
    expect(modificationLabel(m, { ...ctx, formatPercent: (n) => `${n} pts` })).toBe('Panier moyen : 4 pts')
    expect(modificationLabel(null, ctx)).toBe('')
  })

  it('en anglais, les mêmes lignes se composent', () => {
    const tEn = (key) => translations.en[key] ?? `?${key}`
    expect(modificationLabel({ type: T.CATEGORY_PCT, target: 'Beers', value: 10 }, { t: tEn, formatCurrency }))
      .toBe('Category Beers: +10\u00a0%')
  })
})

describe('modificationTargetLabel', () => {
  it('article, catégorie, type, leviers globaux', () => {
    expect(modificationTargetLabel({ type: T.ITEM_PRICE, target: 'm1' }, { t, options })).toBe('Bière 50 cl')
    expect(modificationTargetLabel({ type: T.CATEGORY_PCT, target: 'Bières' }, { t })).toBe('Bières')
    expect(modificationTargetLabel({ type: T.TYPE_PCT, target: 'Boisson' }, { t })).toBe('Boisson')
    expect(modificationTargetLabel({ type: T.TRANSFORMATION }, { t })).toBe('Taux de transformation')
    expect(modificationTargetLabel({ type: T.BASKET }, { t })).toBe('Panier moyen')
  })

  it('type inconnu ou modification absente : chaîne vide', () => {
    expect(modificationTargetLabel({ type: 'zzz' }, { t })).toBe('')
    expect(modificationTargetLabel(null, { t })).toBe('')
  })
})
