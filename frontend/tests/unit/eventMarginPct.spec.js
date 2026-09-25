import { eventMarginPct } from '@/utils/analyseAggregations'

describe('eventMarginPct (graphique Marge par event, widget MARGE d\'Analyse)', () => {
  it('même formule que le KPI : (CA - coût) / CA', () => {
    // Aix Arena, total de l'écran : 563 405 € de CA, 144 945,86 € de coût → 74,3 %.
    expect(eventMarginPct({ revenue: 563405, cost: 144945.86, costKnown: true })).toBeCloseTo(74.27, 2)
  })

  it('coût inconnu (pas de grain article) : null, jamais une fausse marge de 100 %', () => {
    expect(eventMarginPct({ revenue: 1000, cost: 0, costKnown: false })).toBeNull()
  })

  it('sans CA : null (pas de division par zéro)', () => {
    expect(eventMarginPct({ revenue: 0, cost: 10, costKnown: true })).toBeNull()
  })

  it('marge négative possible quand le coût dépasse le CA', () => {
    expect(eventMarginPct({ revenue: 100, cost: 150, costKnown: true })).toBe(-50)
  })
})
