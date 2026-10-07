/**
 * Aide du bandeau en post-event (retour Bertrand 2026-10-07) : démarrage automatique
 * au début du show, manuel possible dès l'ouverture des portes.
 */
import { mount } from '@vue/test-utils'
import { createStore } from 'vuex'
import InventoryPinBand from '@/components/space-workspace/inventory/InventoryPinBand.vue'
import { eventShowAt, postEventAutoStartAt } from '@/utils/eventLifecycle'

// PAUC/SARAN : sessions en texte JSON, portes 18:45, show 20:00 (Paris, UTC+2).
const PAUC = { eventDate: '2026-10-08T00:00:00.000Z', sessions: ['{"showTime":"20:00","doorsOpening":"18:45"}'] }

function mountBand({ event = PAUC, period, window = { status: 'closed', accesses: [] } }) {
  const store = createStore({
    modules: {
      guestPinAdmin: {
        namespaced: true,
        getters: { windowByPhase: () => () => window, periodByPhase: () => () => period },
        actions: { fetchStatusBoard: () => null, fetchPeriods: () => null, stopWindow: () => null, startWindow: () => null },
      },
    },
  })
  return mount(InventoryPinBand, {
    props: { spaceId: 's', eventId: 'e', phase: 'post-event', event, timeZone: 'Europe/Paris' },
    global: { plugins: [store], stubs: { VIcon: true, 'v-icon': true } },
  })
}

const hint = (w) => w.find('.inv-pin-band__hint').exists() ? w.find('.inv-pin-band__hint').text() : ''

describe('heures du show (eventLifecycle)', () => {
  it('show 20:00 Paris = 18:00Z, sessions en texte JSON comprises', () => {
    expect(eventShowAt(PAUC, 'Europe/Paris').toISOString()).toBe('2026-10-08T18:00:00.000Z')
    expect(postEventAutoStartAt(PAUC, 'Europe/Paris').toISOString()).toBe('2026-10-08T18:00:00.000Z')
  })

  it('sans heure de show : repli sur l\'ouverture des portes', () => {
    const e = { eventDate: '2026-10-08T00:00:00.000Z', sessions: [{ doorsOpening: '18:45' }] }
    expect(eventShowAt(e, 'Europe/Paris')).toBeNull()
    expect(postEventAutoStartAt(e, 'Europe/Paris').toISOString()).toBe('2026-10-08T16:45:00.000Z')
  })
})

describe('InventoryPinBand : aide post-event', () => {
  it('avant les portes : démarrage auto au show et manuel dès les portes', () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString()
    const text = hint(mountBand({ period: { opensAt: future, closesAt: null } }))
    expect(text).toContain('début du show (20:00)')
    expect(text).toContain("ouverture des portes (18:45)")
  })

  it('portes ouvertes, show à venir, accès pas démarré : rappel du démarrage au show', () => {
    const tomorrow = { eventDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10) + 'T00:00:00.000Z', sessions: [{ doorsOpening: '18:45', showTime: '20:00' }] }
    const past = new Date(Date.now() - 3600 * 1000).toISOString()
    expect(hint(mountBand({ event: tomorrow, period: { opensAt: past, closesAt: null } }))).toContain('début du show (20:00)')
  })

  it('sans heure de show : ancien message (portes)', () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString()
    const e = { eventDate: '2026-10-08T00:00:00.000Z', sessions: [{ doorsOpening: '18:45' }] }
    expect(hint(mountBand({ event: e, period: { opensAt: future, closesAt: null } }))).toContain('portes ne sont pas encore ouvertes')
  })
})
