import { describeChips, CHIP_LABEL_KEYS, WIDGET_BAR_KEYS, serializeChipKeys, parseChipKeys, pickChips, isChipKind, KPI_BAR_KEYS } from '@/utils/reportJ1Chips'

const items = KPI_BAR_KEYS.map((key) => ({ key, label: key }))

describe('reportJ1Chips', () => {
  it('serialise dans l ordre d origine et ignore les cles inconnues', () => {
    expect(serializeChipKeys('kpi-bar', ['percap', 'revenue', 'nope'])).toBe('revenue,percap')
    expect(serializeChipKeys('widget-bar', ['margin', 'stock-value'])).toBe('margin,stock-value')
  })
  it('parse et filtre', () => {
    expect(parseChipKeys('kpi-bar', 'cost, revenue')).toEqual(['revenue', 'cost'])
    expect(parseChipKeys('kpi-bar', '')).toEqual([])
    expect(parseChipKeys('donut', 'revenue')).toEqual([])
  })
  it('pickChips garde la selection, ou tout sans selection valide', () => {
    expect(pickChips('kpi-bar', items, 'revenue,percap').map((i) => i.key)).toEqual(['revenue', 'percap'])
    expect(pickChips('kpi-bar', items, undefined)).toHaveLength(8)
    expect(pickChips('kpi-bar', items, 'inconnu')).toHaveLength(8)
  })
  it('types concernes', () => {
    expect(isChipKind('kpi-bar')).toBe(true)
    expect(isChipKind('donut')).toBe(false)
  })
  it('chaque pastille a un libellé et se décrit en clair', () => {
    for (const k of [...KPI_BAR_KEYS, ...WIDGET_BAR_KEYS]) expect(CHIP_LABEL_KEYS[k]).toBeTruthy()
    const t = (key) => `<${key}>`
    expect(describeChips('kpi-bar', 'revenue,cost', t)).toBe('<anHeaderKpiRevenue>, <anHeaderKpiCost>')
    expect(describeChips('kpi-bar', undefined, t)).toBe('')
  })
})
