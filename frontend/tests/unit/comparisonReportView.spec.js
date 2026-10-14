import { buildKpiChips, comparisonSummaryLabel, excludedNamesText, KPI_CHIP_DEFS } from '@/utils/comparisonReportView'

const t = (k) => k
const fmt = {
  currency: (v) => `${v} EUR`,
  currencyDetailed: (v) => `${v.toFixed(2)} EUR`,
  number: (v) => String(v),
  percent: (v) => `${v.toFixed(1)} %`,
}

describe('comparisonReportView', () => {
  it('construit les 8 puces dans l ordre, avec « — » pour les valeurs nulles (Predict)', () => {
    const chips = { revenue: 100, avgRevenuePerEvent: 50, cost: 10, transactions: null, avgTransaction: null, attendees: 20, transferRate: null, perCapita: 5 }
    const out = buildKpiChips(chips, { revenue: { text: '+1' } }, { t, fmt })
    expect(out).toHaveLength(KPI_CHIP_DEFS.length)
    expect(out.map((c) => c.key)).toEqual(['revenue', 'avgRevenuePerEvent', 'cost', 'transactions', 'avgTransaction', 'attendees', 'transferRate', 'perCapita'])
    expect(out[0]).toMatchObject({ value: '100 EUR', delta: { text: '+1' } })
    expect(out[3].value).toBe('—')
    expect(out[6].value).toBe('—')
    expect(out[1].delta).toBeNull()
  })

  it('valeurs « — » sans rapport (squelette)', () => {
    const out = buildKpiChips(null, null, { t, fmt })
    expect(out.every((c) => c.value === '—' && c.delta === null)).toBe(true)
  })

  it('libellé de la comparaison selon le type', () => {
    expect(comparisonSummaryLabel(null, [], t)).toBe('')
    expect(comparisonSummaryLabel({ kind: 'predict' }, [], t)).toBe('anCmpSummaryPredict')
    expect(comparisonSummaryLabel({ kind: 'event', eventIds: ['a', 'b'] }, [], (k) => (k === 'anCmpSummaryEvents' ? '{n} ev' : k))).toBe('2 ev')
    expect(comparisonSummaryLabel({ kind: 'category', eventTypes: ['Sport'], categories: ['Hand'], subcategories: [] }, [], t)).toBe('Sport · Hand')
    expect(comparisonSummaryLabel({ kind: 'category' }, [], t)).toBe('anCmpSummaryAllTypes')
    expect(comparisonSummaryLabel({ kind: 'period' }, [{ key: 'timeRange', label: 'Saison 24/25' }], t)).toBe('Saison 24/25')
    expect(comparisonSummaryLabel({ kind: 'period' }, [], t)).toBe('anCmpSummaryPeriod')
  })

  it('noms exclus tronqués à 3 avec ellipse', () => {
    const l = [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]
    expect(excludedNamesText(l)).toBe('A, B, C…')
    expect(excludedNamesText(l.slice(0, 2))).toBe('A, B')
    expect(excludedNamesText(null)).toBe('')
  })
})
