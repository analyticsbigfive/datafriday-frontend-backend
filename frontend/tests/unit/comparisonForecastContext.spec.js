import {
  forecastFilterLines,
  forecastSummaryLabel,
  withForecastModificationRows,
} from '@/utils/comparisonForecastContext'
import { FORECAST_KIND, isForecastModel } from '@/utils/comparisonForecastModel'
import { COMPARISON_KINDS } from '@/utils/comparisonFormModel'
import {
  FORECAST_MODIFICATION_TYPES as T,
  PERCAP_MODES,
  createModification,
  modificationKey,
} from '@/utils/forecastModificationModel'
import { translations } from '@/i18n/translations'

// Dictionnaire réel (FR) : les libellés et les clés de ligne doivent exister.
const t = (key) => translations.fr[key] ?? `?${key}`
const formatCurrency = (n) => `${n.toFixed(2).replace('.', ',')} €`
const options = { items: [{ id: 'm1', name: 'Bière 50 cl' }] }
const ctx = { t, options, formatCurrency }

const mods = () => [
  createModification(T.ITEM_PRICE, { target: 'm1', value: 7.5 }),
  createModification(T.CATEGORY_PCT, { target: 'Bières', value: 10 }),
  createModification(T.PERCAP, { mode: PERCAP_MODES.BASKET, value: 5 }),
]

describe('comparisonForecastModel', () => {
  it('reconnaît un modèle forecast et rien d\'autre', () => {
    expect(FORECAST_KIND).toBe('forecast')
    expect(isForecastModel({ kind: 'forecast', modifications: [] })).toBe(true)
    expect(isForecastModel({ kind: 'predict' })).toBe(false)
    expect(isForecastModel(null)).toBe(false)
    expect(isForecastModel(undefined)).toBe(false)
    expect(isForecastModel('forecast')).toBe(false)
  })

  it('n\'est pas un type de comparaison du formulaire', () => {
    expect(Object.values(COMPARISON_KINDS)).not.toContain(FORECAST_KIND)
  })
})

describe('forecastFilterLines', () => {
  it('une ligne par modification, au format des filtres appliqués, toutes propres', () => {
    const list = mods()
    const lines = forecastFilterLines(list, ctx)
    expect(lines).toHaveLength(3)
    expect(lines.map((l) => l.key)).toEqual(list.map(modificationKey))
    expect(lines.every((l) => l.own === true)).toBe(true)
    expect(lines[0].label).toBe('Prix TTC Bière 50 cl : 7,50 €')
    expect(lines[1].label).toBe('Catégorie Bières : +10 %')
    expect(lines[2].label).toBe('Percap (panier plus gros) : +5 %')
  })

  it('ignore les modifications invalides ou remplacées par une plus récente de même clé', () => {
    const first = createModification(T.CATEGORY_PCT, { target: 'Bières', value: 5 })
    const last = createModification(T.CATEGORY_PCT, { target: 'Bières', value: 10 })
    const invalid = createModification(T.TYPE_PCT, { target: '', value: 10 })
    const lines = forecastFilterLines([first, invalid, last], ctx)
    expect(lines).toHaveLength(1)
    expect(lines[0].label).toBe('Catégorie Bières : +10 %')
  })

  it('liste vide ou absente : aucune ligne', () => {
    expect(forecastFilterLines([], ctx)).toEqual([])
    expect(forecastFilterLines(undefined, ctx)).toEqual([])
  })
})

describe('forecastSummaryLabel', () => {
  it('joint les libellés par « · »', () => {
    const lines = [{ label: 'A' }, { label: 'B' }, { label: '' }]
    expect(forecastSummaryLabel(lines, t)).toBe('A · B')
  })

  it('repli générique sans ligne', () => {
    expect(forecastSummaryLabel([], t)).toBe('Modifications de la prévision')
    expect(forecastSummaryLabel(undefined, t)).toBe('Modifications de la prévision')
  })
})

describe('withForecastModificationRows', () => {
  const rows = () => [
    { parameter: t('anExportFilterSpace'), value: 'Stade' },
    { parameter: t('anCmpExportFilterComparison'), value: 'Prévision' },
    { parameter: t('anExportFilterActive'), value: 'a · b' },
    { parameter: t('anExportFilterMode'), value: 'Analyse' },
  ]

  it('retire la ligne des filtres actifs et insère une ligne par modification après la comparaison', () => {
    const lines = forecastFilterLines(mods(), ctx)
    const out = withForecastModificationRows(rows(), lines, t)
    expect(out.map((r) => r.parameter)).toEqual([
      t('anExportFilterSpace'),
      t('anCmpExportFilterComparison'),
      t('fcstExportModification'),
      t('fcstExportModification'),
      t('fcstExportModification'),
      t('anExportFilterMode'),
    ])
    expect(out.slice(2, 5).map((r) => r.value)).toEqual(lines.map((l) => l.label))
  })

  it('ne mute pas les lignes reçues', () => {
    const input = rows()
    const snapshot = JSON.stringify(input)
    withForecastModificationRows(input, [{ label: 'x' }], t)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('sans ligne de comparaison, ajoute les modifications en fin de table', () => {
    const base = rows().filter((r) => r.parameter !== t('anCmpExportFilterComparison'))
    const out = withForecastModificationRows(base, [{ label: 'x' }], t)
    expect(out[out.length - 1]).toEqual({ parameter: t('fcstExportModification'), value: 'x' })
    expect(out.some((r) => r.parameter === t('anExportFilterActive'))).toBe(false)
  })

  it('sans modification, retire seulement la ligne des filtres actifs', () => {
    const out = withForecastModificationRows(rows(), [], t)
    expect(out).toHaveLength(3)
  })
})
