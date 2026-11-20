import { ref, shallowRef, nextTick } from 'vue'
import { useComparisonForecast } from '@/composables/useComparisonForecast'
import {
  FORECAST_MODIFICATION_TYPES as T,
  PERCAP_MODES,
  createModification,
} from '@/utils/forecastModificationModel'
import { translations } from '@/i18n/translations'

const t = (key) => translations.fr[key] ?? `?${key}`
const formatCurrency = (n) => `${n.toFixed(2).replace('.', ',')} €`

const catalogById = new Map([['m1', { id: 'm1', name: 'Bière 50 cl', basePrice: 8, pricing: { vatRate: 10 } }]])

function records() {
  const art = (over) => ({
    eventId: 'e1', shopId: 's1', shopName: 'Bar A', menuItemId: 'm1', menuItemName: 'Bière 50 cl',
    menuItemCategory: 'Bières', menuItemType: 'Boisson', quantity: 10, revenue: 100, transactionCount: 8,
    ...over,
  })
  return {
    articleRecords: [art({}), art({ shopId: 's2', shopName: 'Bar B', revenue: 40, quantity: 4, transactionCount: 3 })],
    chartRecords: [
      { eventId: 'e1', shopId: 's1', shopName: 'Bar A', menuItemId: null, quantity: 10, revenue: 100, transactionCount: 8 },
      { eventId: 'e1', shopId: 's2', shopName: 'Bar B', menuItemId: null, quantity: 4, revenue: 40, transactionCount: 3 },
    ],
  }
}

function build({ input, loading = false, isPredict = false, data = records() } = {}) {
  // shallowRef : comme les computed de la vue, les tableaux ne passent pas par un proxy réactif.
  const source = {
    chartRecords: shallowRef(data.chartRecords),
    articleRecords: shallowRef(data.articleRecords),
    catalogById: ref(catalogById),
    isPredict: ref(isPredict),
    loading: ref(loading),
  }
  const inputRef = ref(input ?? null)
  const forecast = useComparisonForecast({
    input: inputRef, source, spaceId: ref(null), translate: t, formatCurrency,
  })
  return { forecast, source, inputRef, data }
}

describe('useComparisonForecast', () => {
  it('inactif hors modèle forecast : records de la source tels quels, aucune ligne', () => {
    const { forecast, data } = build({ input: { kind: 'event', eventIds: ['e1'] } })
    expect(forecast.active.value).toBe(false)
    expect(forecast.chartRecords.value).toBe(data.chartRecords)
    expect(forecast.lines.value).toEqual([])
  })

  it('liste vide : mêmes références que la source, stats neutres, état ready', () => {
    const { forecast, data } = build({ input: { kind: 'forecast', modifications: [] } })
    expect(forecast.active.value).toBe(true)
    expect(forecast.chartRecords.value).toBe(data.chartRecords)
    expect(forecast.articleRecords.value).toBe(data.articleRecords)
    expect(forecast.stats.value.priceModificationCount).toBe(0)
    expect(forecast.sourceState.value).toBe('ready')
    expect(forecast.lines.value).toEqual([])
  })

  it('+10 % de panier : CA x 1,1 au grain PdV et article, quantités inchangées', () => {
    const mod = createModification(T.PERCAP, { mode: PERCAP_MODES.BASKET, value: 10 })
    const { forecast, data } = build({ input: { kind: 'forecast', modifications: [mod] } })
    const revenue = (rows) => rows.reduce((s, r) => s + r.revenue, 0)
    expect(revenue(data.chartRecords)).toBe(140)
    expect(revenue(forecast.chartRecords.value)).toBeCloseTo(154, 6)
    expect(revenue(forecast.articleRecords.value)).toBeCloseTo(154, 6)
    expect(forecast.chartRecords.value.map((r) => r.quantity)).toEqual([10, 4])
    // la source n'est pas mutée
    expect(revenue(data.chartRecords)).toBe(140)
  })

  it('suit la saisie : retirer les modifications rend les records de la source', async () => {
    const mod = createModification(T.PERCAP, { mode: PERCAP_MODES.BASKET, value: 10 })
    const { forecast, inputRef, data } = build({ input: { kind: 'forecast', modifications: [mod] } })
    expect(forecast.chartRecords.value).not.toBe(data.chartRecords)
    inputRef.value = { kind: 'forecast', modifications: [] }
    await nextTick()
    expect(forecast.chartRecords.value).toBe(data.chartRecords)
  })

  it('le masque isPredict est celui de la source', async () => {
    const { forecast, source } = build({ input: { kind: 'forecast', modifications: [] }, isPredict: true })
    expect(forecast.isPredict.value).toBe(true)
    source.isPredict.value = false
    await nextTick()
    expect(forecast.isPredict.value).toBe(false)
  })

  it('sourceState : loading pendant le chargement du principal, empty sans record, ready sinon', async () => {
    const { forecast, source } = build({ input: { kind: 'forecast', modifications: [] }, loading: true })
    expect(forecast.sourceState.value).toBe('loading')
    source.loading.value = false
    await nextTick()
    expect(forecast.sourceState.value).toBe('ready')
    source.chartRecords.value = []
    await nextTick()
    expect(forecast.sourceState.value).toBe('empty')
  })

  it('lines : libellés lisibles, noms d\'article issus des records de la source', () => {
    const mods = [
      createModification(T.ITEM_PRICE, { target: 'm1', value: 7.5 }),
      createModification(T.TRANSFORMATION, { value: 5 }),
    ]
    const { forecast } = build({ input: { kind: 'forecast', modifications: mods } })
    const labels = forecast.lines.value.map((l) => l.label)
    expect(labels[0]).toBe('Prix TTC Bière 50 cl : 7,50 €')
    expect(labels[1]).toContain('+5 %')
    expect(forecast.lines.value.every((l) => l.own)).toBe(true)
    expect(forecast.stats.value.priceModificationCount).toBe(1)
  })

  it('formatCurrency par défaut : formateur de montants du produit', () => {
    const mods = [createModification(T.ITEM_PRICE, { target: 'm1', value: 7.5 })]
    const source = {
      chartRecords: ref(records().chartRecords),
      articleRecords: ref(records().articleRecords),
      catalogById: ref(catalogById),
    }
    const forecast = useComparisonForecast({
      input: ref({ kind: 'forecast', modifications: mods }), source, translate: t,
    })
    expect(forecast.lines.value[0].label).toMatch(/^Prix TTC Bière 50 cl : .*7[,.]50/)
    expect(forecast.isPredict.value).toBe(false)
  })
})
