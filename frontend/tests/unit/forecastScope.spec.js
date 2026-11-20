/**
 * Portée des modifications Forecast : « tous les events affichés » (défaut, passés compris) ou
 * « seulement les events prédits » (records `isPredictive`). Les events passés gardent alors leur
 * réel, mêmes références.
 */
import { ref } from 'vue'
import { translations } from '@/i18n/translations'
import {
  FORECAST_SCOPES,
  SCOPE_DEFAULT,
  normalizeScope,
  isPredictedOnly,
  isPredictedRecord,
} from '@/utils/forecastScope'
import { applyForecastModifications } from '@/utils/forecastApplyModifications'
import { forecastFilterLines } from '@/utils/comparisonForecastContext'
import { useForecastModificationsForm } from '@/composables/useForecastModificationsForm'
import { useComparisonForecast } from '@/composables/useComparisonForecast'
import {
  FORECAST_MODIFICATION_TYPES as T,
  createModification,
} from '@/utils/forecastModificationModel'

const FR = translations.fr
const mod = (type, fields) => createModification(type, fields)

const art = (over) => ({
  eventId: 'past', shopId: 's1', shopName: 'Bar A',
  menuItemId: 'm1', menuItemCategory: 'Bières', menuItemType: 'Boisson',
  quantity: 10, revenue: 100, transactionCount: 8,
  ...over,
})
const chart = (over) => ({
  eventId: 'past', shopId: 's1', shopName: 'Bar A', menuItemId: null,
  quantity: 10, revenue: 100, transactionCount: 8,
  ...over,
})

// Un event passé (réel) et un event futur (prédit), même PdV, même article.
function data() {
  return {
    articleRecords: [art({}), art({ eventId: 'future', isPredictive: true })],
    chartRecords: [chart({}), chart({ eventId: 'future', isPredictive: true })],
  }
}

const beerPlus10 = () => mod(T.CATEGORY_PCT, { target: 'Bières', value: 10 })

describe('utils/forecastScope', () => {
  it('défaut : tous les events', () => {
    expect(SCOPE_DEFAULT).toBe('all')
    expect(FORECAST_SCOPES).toEqual({ ALL: 'all', PREDICTED: 'predicted' })
  })

  it('normalizeScope : toute valeur inconnue retombe sur « tous les events »', () => {
    expect(normalizeScope('predicted')).toBe('predicted')
    expect(normalizeScope('all')).toBe('all')
    expect(normalizeScope(undefined)).toBe('all')
    expect(normalizeScope(null)).toBe('all')
    expect(normalizeScope('n importe quoi')).toBe('all')
  })

  it('isPredictedOnly et isPredictedRecord', () => {
    expect(isPredictedOnly('predicted')).toBe(true)
    expect(isPredictedOnly('all')).toBe(false)
    expect(isPredictedOnly(undefined)).toBe(false)
    expect(isPredictedRecord({ isPredictive: true })).toBe(true)
    expect(isPredictedRecord({ isPredictive: false })).toBe(false)
    expect(isPredictedRecord({})).toBe(false)
    expect(isPredictedRecord(null)).toBe(false)
  })
})

describe('applyForecastModifications : portée', () => {
  it('« tous » (défaut) : l\'event passé ET l\'event prédit sont modifiés', () => {
    const d = data()
    const out = applyForecastModifications({ ...d, modifications: [beerPlus10()] })
    expect(out.chartRecords[0].revenue).toBeCloseTo(110)
    expect(out.chartRecords[1].revenue).toBeCloseTo(110)
    expect(out.articleRecords[0].revenue).toBeCloseTo(110)
    expect(out.articleRecords[1].revenue).toBeCloseTo(110)
    const explicit = applyForecastModifications({ ...d, modifications: [beerPlus10()], scope: 'all' })
    expect(explicit.chartRecords.map((r) => r.revenue)).toEqual(out.chartRecords.map((r) => r.revenue))
  })

  it('« prédits » : l\'event passé garde son réel (mêmes références), l\'event prédit est modifié', () => {
    const d = data()
    const out = applyForecastModifications({ ...d, modifications: [beerPlus10()], scope: 'predicted' })
    expect(out.chartRecords[0]).toBe(d.chartRecords[0])
    expect(out.articleRecords[0]).toBe(d.articleRecords[0])
    expect(out.chartRecords[1].revenue).toBeCloseTo(110)
    expect(out.articleRecords[1].revenue).toBeCloseTo(110)
    expect(out.chartRecords[1].isPredictive).toBe(true)
  })

  it('« prédits » : les leviers globaux (transformation) ne touchent pas non plus les events passés', () => {
    const d = data()
    const out = applyForecastModifications({
      ...d, modifications: [mod(T.TRANSFORMATION, { value: 10 })], scope: 'predicted',
    })
    expect(out.chartRecords[0]).toBe(d.chartRecords[0])
    expect(out.chartRecords[1].quantity).toBeCloseTo(11)
    expect(out.chartRecords[1].transactionCount).toBeCloseTo(8.8)
  })

  it('« prédits » sans aucun event prédit : rien ne bouge', () => {
    const d = { articleRecords: [art({})], chartRecords: [chart({})] }
    const out = applyForecastModifications({ ...d, modifications: [beerPlus10()], scope: 'predicted' })
    expect(out.chartRecords[0]).toBe(d.chartRecords[0])
    expect(out.articleRecords[0]).toBe(d.articleRecords[0])
    expect(out.stats.eventsWithArticleGrain).toEqual([])
  })

  it('stats : les events avec grain article sont limités aux events prédits', () => {
    const d = data()
    const all = applyForecastModifications({ ...d, modifications: [beerPlus10()] })
    const predicted = applyForecastModifications({ ...d, modifications: [beerPlus10()], scope: 'predicted' })
    expect(all.stats.eventsWithArticleGrain).toEqual(['future', 'past'])
    expect(predicted.stats.eventsWithArticleGrain).toEqual(['future'])
  })

  it('un event prédit SANS prévision par article est encore estimé par le mix historique du PdV', () => {
    // L'historique (event passé) sert de mix ; l'event prédit n'a que le grain PdV.
    const d = {
      articleRecords: [art({})],
      chartRecords: [chart({}), chart({ eventId: 'future', isPredictive: true, revenue: 200, quantity: 20 })],
    }
    const out = applyForecastModifications({ ...d, modifications: [beerPlus10()], scope: 'predicted' })
    expect(out.chartRecords[0]).toBe(d.chartRecords[0])
    expect(out.chartRecords[1].revenue).toBeCloseTo(220)
    expect(out.stats.eventsFromHistoricalMix).toEqual(['future'])
  })

  it('liste sans modification : mêmes tableaux, quelle que soit la portée', () => {
    const d = data()
    const out = applyForecastModifications({ ...d, modifications: [], scope: 'predicted' })
    expect(out.chartRecords).toBe(d.chartRecords)
    expect(out.articleRecords).toBe(d.articleRecords)
  })
})

describe('forecastFilterLines : ligne de portée', () => {
  const t = (key) => FR[key]
  const opts = { t, formatCurrency: (n) => String(n) }

  it('rien par défaut', () => {
    const lines = forecastFilterLines([beerPlus10()], opts)
    expect(lines.some((l) => l.key === 'scope')).toBe(false)
  })

  it('« prédits » : une dernière ligne propre à la comparaison', () => {
    const lines = forecastFilterLines([beerPlus10()], { ...opts, scope: 'predicted' })
    const last = lines[lines.length - 1]
    expect(last).toEqual({ key: 'scope', label: FR.fcstLabelScopePredicted, own: true })
    expect(last.label).toBe('Portée : événements prédits uniquement')
  })

  it('pas de ligne de portée sans modification', () => {
    expect(forecastFilterLines([], { ...opts, scope: 'predicted' })).toEqual([])
  })
})

describe('useForecastModificationsForm : portée', () => {
  const makeForm = () => useForecastModificationsForm({ articleRecords: [] })

  it('défaut « tous », émise dans le modèle appliqué', () => {
    const f = makeForm()
    expect(f.scope.value).toBe('all')
    f.patch({ target: 'Bières', value: 10 })
    expect(f.toRunModel().scope).toBe('all')
  })

  it('setScope : « predicted » est repris, une valeur inconnue retombe sur « all »', () => {
    const f = makeForm()
    f.setScope('predicted')
    expect(f.scope.value).toBe('predicted')
    expect(f.toRunModel().scope).toBe('predicted')
    f.setScope('autre')
    expect(f.scope.value).toBe('all')
  })

  it('clear remet la portée à « tous »', () => {
    const f = makeForm()
    f.setScope('predicted')
    f.clear()
    expect(f.scope.value).toBe('all')
  })
})

describe('useComparisonForecast : portée', () => {
  const build = (scope) => {
    const d = data()
    const input = ref({ kind: 'forecast', modifications: [beerPlus10()], elasticity: 0, ...(scope ? { scope } : {}) })
    const fc = useComparisonForecast({
      input,
      source: { chartRecords: ref(d.chartRecords), articleRecords: ref(d.articleRecords) },
      translate: (k) => FR[k],
    })
    return { fc, d }
  }

  it('sans portée dans la saisie : tous les events (compatibilité des saisies existantes)', () => {
    const { fc } = build(undefined)
    expect(fc.chartRecords.value[0].revenue).toBeCloseTo(110)
    expect(fc.lines.value.some((l) => l.key === 'scope')).toBe(false)
  })

  it('portée « predicted » : l\'event passé n\'est pas modifié, la ligne de filtre l\'indique', () => {
    const { fc, d } = build('predicted')
    // La source passe par un ref() : les records sont des proxies réactifs, on compare les valeurs.
    expect(fc.chartRecords.value[0]).toEqual(d.chartRecords[0])
    expect(fc.chartRecords.value[0].revenue).toBe(100)
    expect(fc.chartRecords.value[1].revenue).toBeCloseTo(110)
    expect(fc.lines.value[fc.lines.value.length - 1].label).toBe(FR.fcstLabelScopePredicted)
  })
})

describe('textes de la portée', () => {
  it('existent en français et en anglais, sans tiret long', () => {
    const keys = [
      'fcstScopeLabel', 'fcstScopePredictedLabel', 'fcstScopeHintAll', 'fcstScopeHintPredicted',
      'fcstLabelScopePredicted', 'fcstNoticeIconLabel',
    ]
    for (const k of keys) {
      expect(translations.fr[k]).toBeTruthy()
      expect(translations.en[k]).toBeTruthy()
      expect(translations.fr[k]).not.toMatch(/\u2014/)
      expect(translations.en[k]).not.toMatch(/\u2014/)
    }
  })
})
