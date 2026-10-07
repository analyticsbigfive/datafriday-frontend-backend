/**
 * ■ / ▶ de l'accès QR code + PIN (bandeau et menu mobile « Options inventaire »,
 * design Bertrand 2026-10-07) : état grisé et actions, partagés via
 * useInventoryPinActions.
 */
import { mount } from '@vue/test-utils'
import { createStore } from 'vuex'
import InventoryPinActionButtons from '@/components/space-workspace/inventory/InventoryPinActionButtons.vue'
import { pinActionsPending } from '@/composables/useInventoryPinActions'

function setup({ window = null, period = null, stopWindow = jest.fn() } = {}) {
  const store = createStore({
    modules: {
      guestPinAdmin: {
        namespaced: true,
        getters: {
          windowByPhase: () => () => window,
          periodByPhase: () => () => period,
        },
        actions: { stopWindow, startWindow: jest.fn() },
      },
    },
  })
  const wrapper = mount(InventoryPinActionButtons, {
    props: { spaceId: 's', eventId: 'e', phase: 'post-event' },
    global: { plugins: [store], stubs: { VIcon: true, 'v-icon': true } },
  })
  const [stop, start] = wrapper.findAll('button')
  return { wrapper, stop, start, stopWindow }
}

describe('InventoryPinActionButtons', () => {
  it('fenêtre ouverte, tous les PDV ouverts : ■ actif, ▶ grisé', () => {
    const { stop, start } = setup({ window: { status: 'open', accesses: [{ elementId: 'a', status: 'active' }] } })
    expect(stop.attributes('disabled')).toBeUndefined()
    expect(start.attributes('disabled')).toBeDefined()
  })

  it('rien d\'ouvert : ■ grisé, ▶ actif', () => {
    const { stop, start } = setup({ window: { status: 'closed', accesses: [] } })
    expect(stop.attributes('disabled')).toBeDefined()
    expect(start.attributes('disabled')).toBeUndefined()
  })

  it('hors période (pas encore ouverte) : les deux grisés', () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString()
    const { stop, start } = setup({ window: { status: 'closed', accesses: [] }, period: { opensAt: future, closesAt: null } })
    expect(stop.attributes('disabled')).toBeDefined()
    expect(start.attributes('disabled')).toBeDefined()
  })

  it('pendant une action : compteur partagé incrémenté (relecture du bandeau suspendue), puis refus serveur émis', async () => {
    let release
    const stopWindow = jest.fn(() => new Promise((_, reject) => { release = reject }))
    const { wrapper, stop } = setup({ window: { status: 'open', accesses: [] }, stopWindow })
    await stop.trigger('click')
    expect(pinActionsPending.value).toBe(1)
    release({ response: { data: { message: 'Hors période' } } })
    await new Promise((r) => setTimeout(r, 0))
    expect(pinActionsPending.value).toBe(0)
    expect(wrapper.emitted('error').pop()).toEqual(['Hors période'])
  })
})
