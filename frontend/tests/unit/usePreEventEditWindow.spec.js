// Composable du verrou pre-event : charge l'état serveur pour l'event ancré,
// le recharge quand l'ancrage change, ré-évalue la phase à l'horloge, dégrade
// en 'unknown' (aucun verrou côté écran) si le serveur ne répond pas.
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { usePreEventEditWindow } from '@/composables/usePreEventEditWindow'

jest.mock('@/api/endpoints/inventory.api', () => ({ getPreEventWindow: jest.fn() }))

const MIN = 60 * 1000
const doorsOpen = new Date('2026-09-19T17:00:00.000Z')
const serverWindow = (overrides = {}) => ({
  phase: 'before',
  doorsOpenAt: doorsOpen.toISOString(),
  editDeadline: new Date(doorsOpen.getTime() + 30 * MIN).toISOString(),
  doorsOpenDone: false,
  ...overrides,
})

// Timers gelés (fake timers) : on vide les microtâches, pas la macro-file.
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
  await nextTick()
}

function mountWith({ fetchWindow, key, active = true }) {
  const keyRef = ref(key)
  const activeRef = ref(active)
  let api
  const Host = defineComponent({
    setup() {
      api = usePreEventEditWindow(() => keyRef.value, () => activeRef.value, { fetchWindow })
      return () => h('div')
    },
  })
  const wrapper = mount(Host)
  return { wrapper, api, keyRef, activeRef }
}

beforeEach(() => {
  jest.useFakeTimers('modern')
  jest.setSystemTime(new Date('2026-09-19T15:00:00.000Z'))
})
afterEach(() => jest.useRealTimers())

describe('usePreEventEditWindow', () => {
  it("charge l'état serveur pour l'event ancré et expose la phase", async () => {
    const fetchWindow = jest.fn().mockResolvedValue(serverWindow())
    const { api } = mountWith({ fetchWindow, key: { spaceId: 's1', eventId: 'e1' } })
    await flush()
    expect(fetchWindow).toHaveBeenCalledWith('s1', 'e1')
    expect(api.phase.value).toBe('before')
    expect(api.isLocked.value).toBe(false)
    expect(api.hasNoDoorsOpen.value).toBe(false)
    expect(api.deadline.value.toISOString()).toBe('2026-09-19T17:30:00.000Z')
  })

  it("ré-évalue la phase à l'horloge sans re-requêter : before → editing → locked", async () => {
    const fetchWindow = jest.fn().mockResolvedValue(serverWindow())
    const { api } = mountWith({ fetchWindow, key: { spaceId: 's1', eventId: 'e1' } })
    await flush()
    expect(api.phase.value).toBe('before')

    jest.setSystemTime(new Date(doorsOpen.getTime() + 5 * MIN))
    api.tick()
    await nextTick()
    expect(api.phase.value).toBe('editing')
    expect(api.isAfterDoorsOpen.value).toBe(true)

    jest.setSystemTime(new Date(doorsOpen.getTime() + 31 * MIN))
    api.tick()
    await nextTick()
    expect(api.isLocked.value).toBe(true)
    expect(fetchWindow).toHaveBeenCalledTimes(1)
  })

  it("recharge quand l'ancrage change, ignore une réponse tardive du précédent", async () => {
    let resolveFirst
    const fetchWindow = jest
      .fn()
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
      .mockResolvedValueOnce(serverWindow({ doorsOpenAt: null, editDeadline: null }))
    const { api, keyRef } = mountWith({ fetchWindow, key: { spaceId: 's1', eventId: 'e1' } })
    await flush()
    keyRef.value = { spaceId: 's1', eventId: 'e2' }
    await flush()
    expect(fetchWindow).toHaveBeenLastCalledWith('s1', 'e2')
    expect(api.hasNoDoorsOpen.value).toBe(true)
    // La réponse de e1 arrive après : elle ne doit pas écraser l'état de e2.
    resolveFirst(serverWindow())
    await flush()
    expect(api.hasNoDoorsOpen.value).toBe(true)
  })

  it("inactif (post-event, invité) : aucun appel, phase 'unknown'", async () => {
    const fetchWindow = jest.fn()
    const { api } = mountWith({ fetchWindow, key: { spaceId: 's1', eventId: 'e1' }, active: false })
    await flush()
    expect(fetchWindow).not.toHaveBeenCalled()
    expect(api.phase.value).toBe('unknown')
  })

  it("serveur indisponible (404 backend antérieur, réseau) : 'unknown', aucun verrou côté écran", async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {})
    const fetchWindow = jest.fn().mockRejectedValue(new Error('404'))
    const { api } = mountWith({ fetchWindow, key: { spaceId: 's1', eventId: 'e1' } })
    await flush()
    expect(api.phase.value).toBe('unknown')
    expect(api.isLocked.value).toBe(false)
    warn.mockRestore()
  })

  it('refresh() recharge (après un passage « portes ouvertes » manuel) et reflète doorsOpenDone', async () => {
    const fetchWindow = jest
      .fn()
      .mockResolvedValueOnce(serverWindow({ doorsOpenAt: null, editDeadline: null }))
      .mockResolvedValueOnce(serverWindow({ doorsOpenAt: null, editDeadline: null, doorsOpenDone: true }))
    const { api } = mountWith({ fetchWindow, key: { spaceId: 's1', eventId: 'e1' } })
    await flush()
    expect(api.doorsOpenDone.value).toBe(false)
    await api.refresh()
    expect(fetchWindow).toHaveBeenCalledTimes(2)
    expect(api.doorsOpenDone.value).toBe(true)
  })
})
