/**
 * useComparisonTimeline : courbe minute par minute du rapport de comparaison.
 * Event unique : ouverture automatique. Plusieurs events : à la demande (open), moyenne alignée.
 */
jest.mock('@/store', () => ({
  __esModule: true,
  default: { state: { analyse: { menuItemCostMap: {} } }, getters: {}, commit: jest.fn(), dispatch: jest.fn() },
}))
jest.mock('@/api/endpoints/space.api', () => ({ getSpaceEventTimelineBatch: jest.fn() }))
// Le prétraitement minute n'est pas l'objet du test : les lignes factices sont déjà au bon grain.
jest.mock('@/utils/timelineBucketing', () => ({
  ...jest.requireActual('@/utils/timelineBucketing'),
  preprocessTimelineRecords: (rows) => rows,
}))

import { ref, nextTick, effectScope } from 'vue'
import { getSpaceEventTimelineBatch } from '@/api/endpoints/space.api'
import { useComparisonTimeline } from '@/composables/useComparisonTimeline'

const ev = (id, showTime = '20:00') => ({ id, name: `Match ${id}`, date: '2026-01-10', showTime })
const flush = async () => { for (let i = 0; i < 5; i++) await nextTick(); await Promise.resolve() }

function setup({ events, enabled = true, predicate = () => true }) {
  const eventsRef = ref(events)
  const scope = effectScope()
  const tl = scope.run(() => useComparisonTimeline({
    events: eventsRef,
    enabled: ref(enabled),
    spaceId: ref('s1'),
    reconcile: (r) => r,
    predicate: ref(predicate),
  }))
  return { tl, eventsRef, scope }
}

beforeEach(() => {
  getSpaceEventTimelineBatch.mockReset()
  getSpaceEventTimelineBatch.mockImplementation(async (_s, ids) => new Map(ids.map((id) => [id, [{ minute: '20:05', revenue: 10, shopName: 'A' }]])))
})

describe('useComparisonTimeline', () => {
  it('un seul event : la courbe s\'ouvre toute seule avec le nom de l\'event', async () => {
    const { tl } = setup({ events: [ev('a')] })
    await flush()
    expect(getSpaceEventTimelineBatch).toHaveBeenCalledWith('s1', ['a'], {})
    expect(tl.active.value).toBe(true)
    expect(tl.loading.value).toBe(false)
    expect(tl.selected.value.eventId).toBe('a')
    expect(tl.headerLabel.value).toBe('Match a')
    expect(tl.records.value).toHaveLength(1)
  })

  it('plusieurs events : rien ne charge avant open(), puis moyenne des events', async () => {
    const { tl } = setup({ events: [ev('a'), ev('b')] })
    await flush()
    expect(tl.active.value).toBe(false)
    expect(getSpaceEventTimelineBatch).not.toHaveBeenCalled()
    await tl.open()
    expect(tl.active.value).toBe(true)
    expect(tl.selected.value.eventId).toBe('average')
    expect(getSpaceEventTimelineBatch.mock.calls[0][1].sort()).toEqual(['a', 'b'])
  })

  it('close() revient aux barres ; le prédicat de filtres s\'applique aux lignes', async () => {
    const { tl } = setup({ events: [ev('a')], predicate: (r) => r.shopName === 'ZZ' })
    await flush()
    expect(tl.records.value).toHaveLength(0)
    tl.close()
    expect(tl.active.value).toBe(false)
  })

  it('jamais de courbe quand désactivé (Predict, droits)', async () => {
    const { tl } = setup({ events: [ev('a')], enabled: false })
    await flush()
    expect(tl.active.value).toBe(false)
    expect(getSpaceEventTimelineBatch).not.toHaveBeenCalled()
  })

  it('le périmètre passe à un event : la courbe se rouvre ; à zéro event : retour aux barres', async () => {
    const { tl, eventsRef } = setup({ events: [ev('a'), ev('b')] })
    await flush()
    eventsRef.value = [ev('c')]
    await flush()
    expect(tl.active.value).toBe(true)
    expect(tl.selected.value.eventId).toBe('c')
    eventsRef.value = []
    await flush()
    expect(tl.active.value).toBe(false)
  })

  it('erreur de chargement : repli sur les barres', async () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {})
    getSpaceEventTimelineBatch.mockRejectedValue(new Error('boom'))
    const { tl } = setup({ events: [ev('a')] })
    await flush()
    expect(tl.active.value).toBe(false)
    expect(tl.failed.value).toBe(true)
    err.mockRestore()
  })
})
