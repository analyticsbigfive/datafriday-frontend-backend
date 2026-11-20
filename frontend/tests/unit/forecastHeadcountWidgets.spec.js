/**
 * Forecast : CA/TPE et CA/collaborateur dans le rapport de comparaison.
 *
 * Ces widgets ne comptent que les events dont l'effectif (TPE, collaborateurs) est renseigné.
 * Ils sont bien recalculés à partir des records modifiés, mais ils ne bougent pas quand la
 * modification n'atteint aucun event renseigné : article vendu seulement dans des events sans
 * effectif, ou portée « événements prédits uniquement » alors que les seuls events renseignés
 * sont des events passés. Le CA total, lui, bouge. Ce test fige cette règle pour ne pas la
 * prendre pour un widget figé.
 */
import { applyForecastModifications } from '@/utils/forecastApplyModifications'
import { computeRevenuePerHeadcount, sumRevenueByEvent } from '@/utils/revenuePerHeadcount'
import {
  FORECAST_MODIFICATION_TYPES as T,
  createModification,
} from '@/utils/forecastModificationModel'

const mod = (type, fields) => createModification(type, fields)

const art = (over) => ({
  eventId: 'A', shopId: 's1', shopName: 'Bar A',
  menuItemId: 'm1', menuItemCategory: 'Bières', menuItemType: 'Boisson',
  quantity: 10, revenue: 100, transactionCount: 8,
  ...over,
})
const chart = (over) => ({
  eventId: 'A', shopId: 's1', shopName: 'Bar A', menuItemId: null,
  quantity: 10, revenue: 100, transactionCount: 8,
  ...over,
})

// A : event passé, 10 TPE et 20 collaborateurs, vend des bières.
// B : event prédit, sans effectif, vend des softs.
const events = [{ id: 'A', numberOfTpe: 10, numberOfCollaborators: 20 }, { id: 'B' }]
const data = () => ({
  articleRecords: [
    art({}),
    art({ eventId: 'B', menuItemId: 'm2', menuItemCategory: 'Softs', isPredictive: true }),
  ],
  chartRecords: [chart({}), chart({ eventId: 'B', isPredictive: true })],
})

const run = (modification, scope) => applyForecastModifications({ ...data(), modifications: [modification], scope })
const total = (out) => out.chartRecords.reduce((s, r) => s + r.revenue, 0)
const perHead = (out, kind) => computeRevenuePerHeadcount({
  events, revenueByEventId: sumRevenueByEvent(out.chartRecords), kind, shopScopeFiltered: false,
})

describe('Forecast : widgets CA/TPE et CA/collaborateur', () => {
  it('référence sans modification : seul l\'event A compte (1 event renseigné sur 2)', () => {
    const base = data()
    const r = computeRevenuePerHeadcount({
      events, revenueByEventId: sumRevenueByEvent(base.chartRecords), kind: 'tpe', shopScopeFiltered: false,
    })
    expect(r.value).toBe(10)
    expect(r.filledCount).toBe(1)
    expect(r.totalCount).toBe(2)
  })

  it('article vendu dans l\'event renseigné : le CA total ET les widgets sont recalculés', () => {
    const out = run(mod(T.CATEGORY_PCT, { target: 'Bières', value: 10 }), 'all')
    expect(total(out)).toBeCloseTo(210)
    expect(perHead(out, 'tpe').value).toBeCloseTo(11)
    expect(perHead(out, 'collaborator').value).toBeCloseTo(5.5)
  })

  it('article vendu seulement dans un event sans effectif : le CA total bouge, les widgets restent identiques', () => {
    const out = run(mod(T.CATEGORY_PCT, { target: 'Softs', value: 10 }), 'all')
    expect(total(out)).toBeCloseTo(210)
    expect(perHead(out, 'tpe').value).toBeCloseTo(10)
    expect(perHead(out, 'collaborator').value).toBeCloseTo(5)
  })

  it('portée « prédits » : seul l\'event prédit bouge, les widgets (events passés renseignés) restent identiques', () => {
    const out = run(mod(T.CATEGORY_PCT, { target: 'Softs', value: 10 }), 'predicted')
    expect(total(out)).toBeCloseTo(210)
    expect(perHead(out, 'tpe').value).toBeCloseTo(10)
  })

  it('portée « prédits » : une modification de bières ne touche plus l\'event passé renseigné', () => {
    const out = run(mod(T.CATEGORY_PCT, { target: 'Bières', value: 10 }), 'predicted')
    expect(total(out)).toBeCloseTo(200)
    expect(perHead(out, 'tpe').value).toBeCloseTo(10)
  })

  it('un event prédit qui porte un effectif entre dans le calcul et réagit à la portée « prédits »', () => {
    const withStaff = [{ id: 'A', numberOfTpe: 10 }, { id: 'B', numberOfTpe: 10 }]
    const out = run(mod(T.CATEGORY_PCT, { target: 'Softs', value: 10 }), 'predicted')
    const r = computeRevenuePerHeadcount({
      events: withStaff, revenueByEventId: sumRevenueByEvent(out.chartRecords), kind: 'tpe', shopScopeFiltered: false,
    })
    expect(r.value).toBeCloseTo(10.5)
    expect(r.filledCount).toBe(2)
  })
})
