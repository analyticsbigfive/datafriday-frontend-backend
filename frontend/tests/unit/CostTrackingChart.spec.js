/**
 * Graphique SVG Cost tracking : escalier, losanges d'events, étiquettes supprimées quand elles se
 * serrent (le losange et l'infobulle restent), infobulle au survol, crosshair.
 */
import { mount } from '@vue/test-utils'
import CostTrackingChart from '@/components/space-workspace/cost-tracking/CostTrackingChart.vue'
import { buildChartModel, buildLineSeries, layoutEvents } from '@/utils/costTrackingSeries'

jest.mock('@/i18n/useI18n', () => ({ useI18n: () => ({ t: (k) => k, locale: { value: 'fr' } }) }))

const T0 = Date.parse('2026-03-01T00:00:00Z')
const T1 = Date.parse('2026-06-30T23:59:59Z')
const line = {
  key: 'article:a', name: 'Burger', kind: 'article',
  points: [
    { at: '2026-03-01T00:00:00Z', costPerPiece: 2, price: 10, carried: true },
    { at: '2026-05-01T00:00:00Z', costPerPiece: 2.5, price: 10 },
  ],
}
const series = [{ ...buildLineSeries(line, T1), colorIndex: 0 }]

function factory(events) {
  return ({ width, height, margin }) => {
    const m = buildChartModel(series, { t0: T0, t1: T1, width, height, margin })
    return { ...m, events: layoutEvents(events, m.x, T0, T1) }
  }
}
const ev = (id, day) => ({ id, name: `Match ${id}`, referenceAt: `2026-${day}T12:00:00Z` })

const mountChart = (events, props = {}) =>
  mount(CostTrackingChart, { props: { chartModel: factory(events), series, bounds: [T0, T1], ...props } })

describe('CostTrackingChart', () => {
  it('trace une courbe en escalier avec son point de changement et son point final', () => {
    const w = mountChart([])
    expect(w.findAll('.ct-chart__line')).toHaveLength(1)
    expect(w.find('.ct-chart__line').attributes('d')).toMatch(/^M[\d.]+,[\d.]+H[\d.]+V[\d.]+H[\d.]+$/)
    expect(w.findAll('.ct-chart__dot')).toHaveLength(0)
    expect(w.findAll('circle')).toHaveLength(1)
  })

  it('un losange par event, étiquette seulement quand il y a la place', () => {
    const w = mountChart([ev('e1', '04-10'), ev('e2', '04-11'), ev('e3', '06-01')])
    expect(w.findAll('.ct-chart__diamond')).toHaveLength(3)
    // e1 et e2 sont à moins de 17 px l'un de l'autre : e2 perd son étiquette.
    const labels = w.findAll('.ct-chart__event-label').map((l) => l.text())
    expect(labels).toEqual(['Match e1', 'Match e3'])
  })

  it('étiquettes à 40 degrés', () => {
    const w = mountChart([ev('e1', '04-10')])
    expect(w.find('.ct-chart__event-label').attributes('transform')).toContain('rotate(-40')
  })

  it('le survol d un event ouvre l infobulle avec son nom, la sortie la ferme', async () => {
    const w = mountChart([ev('e1', '04-10')])
    expect(w.find('.ct-tip').exists()).toBe(false)
    await w.find('.ct-chart__event').trigger('mouseenter')
    expect(w.find('.ct-tip').exists()).toBe(true)
    expect(w.find('.ct-tip__title').text()).toBe('Match e1')
    expect(w.find('.ct-chart__crosshair').exists()).toBe(true)
    await w.find('.ct-chart__event').trigger('mouseleave')
    expect(w.find('.ct-tip').exists()).toBe(false)
  })

  it('la courbe de marge ajoute un tracé pointillé et un axe de droite', () => {
    const off = mountChart([])
    const on = mountChart([], { showMargin: true })
    expect(off.findAll('.ct-chart__margin')).toHaveLength(0)
    expect(on.findAll('.ct-chart__margin')).toHaveLength(1)
  })
})
