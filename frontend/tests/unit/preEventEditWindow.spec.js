// Fenêtre d'édition du Pre-event Inventory : l'état vient du SERVEUR (instants UTC),
// l'écran ne fait que ré-évaluer la phase à `now` (fix/pre-event-flow-robust).
import { parseInstant, preEventEditState } from '@/utils/preEventEditWindow'

const MIN = 60 * 1000

describe('parseInstant', () => {
  it('lit un ISO ou une Date, null sinon', () => {
    expect(parseInstant('2026-09-14T17:30:00.000Z').toISOString()).toBe('2026-09-14T17:30:00.000Z')
    expect(parseInstant(new Date('2026-09-14T17:30:00.000Z')).toISOString()).toBe('2026-09-14T17:30:00.000Z')
    expect(parseInstant(null)).toBeNull()
    expect(parseInstant('n/a')).toBeNull()
  })
})

describe('preEventEditState', () => {
  const doorsOpen = new Date('2026-09-14T17:30:00.000Z')
  const win = {
    phase: 'before',
    doorsOpenAt: doorsOpen.toISOString(),
    editDeadline: new Date(doorsOpen.getTime() + 30 * MIN).toISOString(),
    doorsOpenDone: false,
  }

  it("'before' avant les portes, 'editing' pendant 30 min, 'locked' après (ré-évalué à now, pas la phase serveur)", () => {
    expect(preEventEditState(win, new Date(doorsOpen.getTime() - MIN)).phase).toBe('before')
    expect(preEventEditState(win, doorsOpen).phase).toBe('editing')
    expect(preEventEditState(win, new Date(doorsOpen.getTime() + 30 * MIN)).phase).toBe('editing')
    expect(preEventEditState(win, new Date(doorsOpen.getTime() + 30 * MIN + 1)).phase).toBe('locked')
  })

  it('expose les instants et le drapeau doorsOpenDone', () => {
    const s = preEventEditState({ ...win, doorsOpenDone: true }, doorsOpen)
    expect(s.doorsOpen.toISOString()).toBe(doorsOpen.toISOString())
    expect(s.deadline.getTime() - s.doorsOpen.getTime()).toBe(30 * MIN)
    expect(s.doorsOpenDone).toBe(true)
  })

  it('editDeadline absente : recalculée à +30 min', () => {
    const s = preEventEditState({ doorsOpenAt: win.doorsOpenAt }, doorsOpen)
    expect(s.deadline.getTime() - doorsOpen.getTime()).toBe(30 * MIN)
  })

  it("'no-doors-open' sans heure d'ouverture : aucun verrou, même le jour du match", () => {
    const s = preEventEditState({ phase: 'no-doors-open', doorsOpenAt: null, editDeadline: null, doorsOpenDone: false }, doorsOpen)
    expect(s).toEqual({ phase: 'no-doors-open', doorsOpen: null, deadline: null, doorsOpenDone: false })
  })

  it("'unknown' tant que l'état serveur n'est pas chargé", () => {
    expect(preEventEditState(null, doorsOpen)).toEqual({ phase: 'unknown', doorsOpen: null, deadline: null, doorsOpenDone: false })
  })
})
