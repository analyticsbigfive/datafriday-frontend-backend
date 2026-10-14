import { buildDeltaTable, buildEventAggregates, comparisonFileBase, slugify, localDay } from '@/utils/comparisonExportTables'
import { buildReportSnapshot } from '@/utils/comparisonReportSnapshot'
import { computeReportDeltas } from '@/utils/comparisonDeltas'
import { revealCaptureOnlyBlocks } from '@/utils/comparisonCapture'
import { resolveDimensionEditor, VALUE_EDITORS } from '@/utils/dimensionEditor'

const t = (k) => k

function snap(over = {}) {
  return {
    version: 1, isPredict: false, eventCount: 2,
    chips: { revenue: 200, avgRevenuePerEvent: 100, cost: 50, transactions: 40, avgTransaction: 5, attendees: 400, transferRate: 10, perCapita: 0.5 },
    widgets: { revenuePerTpe: 20, revenuePerCollaborator: 10, margin: 75, transactionRate: 1.5, stockValue: 1000 },
    categories: [{ key: 'Boisson', value: 150 }, { key: '__NOT_SET__', value: 50 }],
    breakdowns: {
      revenue: { item: [{ key: 'Biere', value: 120 }, { key: 'Nouveau', value: 30 }], type: [{ key: 'Boisson', value: 150 }], category: [], industrial: null, brand: null, promotion: [{ key: 'promo', value: 10 }], promotionType: [] },
      quantity: { item: [{ key: 'Biere', value: 24 }], type: [], category: [], industrial: null, brand: null, promotion: [], promotionType: [] },
      supplierCost: [{ key: 'Brasserie', value: 30 }],
      discount: { amount: 5, withoutReference: 0 },
    },
    itemsByShop: [], sections: {},
    ...over,
  }
}

describe('buildDeltaTable', () => {
  const A = snap()
  const B = snap({
    chips: { revenue: 100, avgRevenuePerEvent: 100, cost: 50, transactions: 20, avgTransaction: 5, attendees: 400, transferRate: 10, perCapita: 0.25 },
    widgets: { revenuePerTpe: 10, revenuePerCollaborator: 10, margin: 70, transactionRate: 1.5, stockValue: 1000 },
    categories: [{ key: 'Boisson', value: 100 }],
    breakdowns: { ...snap().breakdowns, revenue: { ...snap().breakdowns.revenue, item: [{ key: 'Biere', value: 60 }] } },
  })
  const deltas = computeReportDeltas(A, B)
  const table = buildDeltaTable({ snapshot: A, mainSnapshot: B, deltas, t })
  const row = (section, label) => table.rows.find((r) => r.section === section && r.label === label)

  it('contient 8 puces, 5 widgets, types d\'articles et répartitions', () => {
    expect(table.rows.filter((r) => r.section === 'anCmpStripLabel')).toHaveLength(8)
    expect(table.rows.filter((r) => r.section === 'anCmpExportSecWidgets')).toHaveLength(5)
    expect(table.rows.filter((r) => r.section === 'anCmpExportSecTypes')).toHaveLength(2)
    expect(table.columns.map((c) => c.key)).toEqual(['section', 'label', 'comparison', 'main', 'delta', 'deltaUnit'])
  })

  it('écart en % pour une puce, en points pour la marge', () => {
    expect(row('anCmpStripLabel', 'anHeaderKpiRevenue')).toMatchObject({ comparison: 200, main: 100, delta: 100, deltaUnit: '%' })
    expect(row('anCmpExportSecWidgets', 'anKpiCardMargin')).toMatchObject({ comparison: 75, main: 70, delta: 5, deltaUnit: 'pts' })
  })

  it('stock identique = « = » sans valeur d\'écart', () => {
    expect(row('anCmpExportSecWidgets', 'anKpiCardStockValue')).toMatchObject({ delta: null, deltaUnit: '=' })
  })

  it('ligne absente du principal = nouveau ; libellé « Non renseigné » traduit', () => {
    expect(row('anTopItemsByRevenue · anRevenue', 'Nouveau')).toMatchObject({ comparison: 30, main: null, delta: null, deltaUnit: 'anCmpExportNew' })
    expect(row('anCmpExportSecTypes', 'anNotSet')).toBeTruthy()
    expect(row('anPromoYesNo · anRevenue', 'anPromoYes')).toBeTruthy()
  })

  it('répartition non chargée (null) = aucune ligne ; coût fournisseur et remise présents', () => {
    expect(table.rows.some((r) => r.section.startsWith('anByIndustrial'))).toBe(false)
    expect(row('anSupplierCost', 'Brasserie')).toBeTruthy()
    expect(row('anPromotionTitle', 'anPromotionTitle')).toMatchObject({ comparison: 5 })
  })

  it('sans écarts (mêmes events) ou sans principal : valeurs sans écart ; sans snapshot : null', () => {
    const noDelta = buildDeltaTable({ snapshot: A, mainSnapshot: null, deltas: null, t })
    expect(noDelta.rows[0]).toMatchObject({ comparison: 200, main: null, delta: null, deltaUnit: '' })
    expect(buildDeltaTable({ snapshot: null, mainSnapshot: B, deltas: null, t })).toBeNull()
  })

  it('produit un snapshot réel sans erreur (buildReportSnapshot)', () => {
    const real = buildReportSnapshot({ isPredict: false, eventCount: 0, chips: {}, widgets: {}, chartRecords: [], articleRecords: [], dimensionsIndex: null })
    expect(() => buildDeltaTable({ snapshot: real, mainSnapshot: real, deltas: computeReportDeltas(real, real), t })).not.toThrow()
  })
})

describe('buildEventAggregates', () => {
  it('somme CA et transactions par event, panier moyen', () => {
    const out = buildEventAggregates(
      [{ id: 'e1', name: 'M1', date: '2026-01-10', ticketsScanned: 100 }, { id: 'e2', name: 'M2' }],
      [{ eventId: 'e1', revenue: 50, transactionCount: 5 }, { eventId: 'e1', revenue: 50, transactionCount: 5 }, { eventId: 'zz', revenue: 9 }],
    )
    expect(out[0]).toMatchObject({ eventId: 'e1', eventName: 'M1', revenue: 100, transactions: 10, attendees: 100, avgTransaction: 10 })
    expect(out[1]).toMatchObject({ eventId: 'e2', revenue: 0, avgTransaction: 0 })
  })
})

describe('noms de fichiers', () => {
  it('slugify retire accents et ponctuation et borne la longueur', () => {
    expect(slugify('Stade Océane : été !')).toBe('stade-oceane-ete')
    expect(slugify('', 'x')).toBe('x')
    expect(slugify('a'.repeat(80), '', 10)).toBe('a'.repeat(10))
  })
  it('localDay est en heure locale', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localDay(new Date(2026, 11, 31, 0, 1))).toBe('2026-12-31')
  })
  it('comparisonFileBase : avec et sans libellé, suffixe predict', () => {
    const date = new Date(2026, 9, 14)
    expect(comparisonFileBase({ spaceName: 'Stade Océane', label: 'Saison 2025', date })).toBe('comparaison-stade-oceane-saison-2025-2026-10-14')
    expect(comparisonFileBase({ spaceName: 'Stade Océane', date })).toBe('comparaison-stade-oceane-2026-10-14')
    expect(comparisonFileBase({ spaceName: '', date, predict: true })).toBe('comparaison-analyse-2026-10-14-predict')
  })
})

describe('revealCaptureOnlyBlocks', () => {
  it('affiche seulement les blocs de capture de la racine de comparaison', () => {
    document.body.innerHTML = '<div id="comparison-capture-root"><div class="cr__snap" style="display:none"></div></div><div class="cr__snap" id="other" style="display:none"></div>'
    revealCaptureOnlyBlocks(document)
    expect(document.querySelector('#comparison-capture-root .cr__snap').style.display).toBe('block')
    expect(document.getElementById('other').style.display).toBe('none')
  })
})

describe('resolveDimensionEditor', () => {
  const tt = (k) => `T:${k}`
  it('jours : valeurs techniques et libellés traduits', () => {
    const m = resolveDimensionEditor('selectedDaysOfWeek', { labelKey: 'anDaysOfWeek' }, { t: tt, getters: {}, filters: { selectedDaysOfWeek: ['mon'] } })
    expect(m.items).toEqual(VALUE_EDITORS.selectedDaysOfWeek.items)
    expect(m.selected).toEqual(['mon'])
    expect(m.labelFn('mon')).toBe('T:anDayMon')
    expect(m.iconFn).toBeNull()
  })
  it('météo : libellés et pictogrammes', () => {
    const m = resolveDimensionEditor('selectedWeather', { labelKey: 'anWeatherShort' }, { t: tt, getters: {}, filters: {} })
    expect(m.items).toEqual(['clear', 'cloudy', 'rain', 'snow', 'storm'])
    expect(m.labelFn('rain')).toBe('T:anWeatherRain')
    expect(m.iconFn('rain')).toBe('mdi-weather-rainy')
    expect(m.selected).toEqual([])
  })
  it('dimension à getter : items du store, sans labelFn', () => {
    const m = resolveDimensionEditor('selectedTeams', { labelKey: 'anTeam', getter: 'uniqueTeams' }, { t: tt, getters: { 'analyse/uniqueTeams': ['A', 'B'] }, filters: { selectedTeams: ['A'] } })
    expect(m.items).toEqual(['A', 'B'])
    expect(m.labelFn).toBeNull()
    expect(m.iconFn).toBeNull()
  })
})
