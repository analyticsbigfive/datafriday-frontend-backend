// Tests du résolveur de navigation des notifications (cloche) et de
// l'interpolation i18n (utils/notificationRouting.js).

import { resolveNotificationRoute, interpolate } from '@/utils/notificationRouting'

describe('interpolate', () => {
  it('remplace les jetons {key} par les params', () => {
    expect(interpolate('il y a {n} min', { n: 5 })).toBe('il y a 5 min')
    expect(interpolate('« {name} »', { name: 'PSG – OM' })).toBe('« PSG – OM »')
  })

  it('null-safe : sans params ou clé absente, chaîne inchangée', () => {
    expect(interpolate('x', null)).toBe('x')
    expect(interpolate('x {y}', {})).toBe('x {y}')
    expect(interpolate('x {y}', { z: 1 })).toBe('x {y}')
  })

  it("param 0 n'est pas traité comme absent", () => {
    expect(interpolate('{n} unread', { n: 0 })).toBe('0 unread')
  })

  it('entrée non-string renvoyée telle quelle', () => {
    expect(interpolate(null, { n: 1 })).toBe(null)
    expect(interpolate(42, { n: 1 })).toBe(42)
  })
})

describe('resolveNotificationRoute', () => {
  it('event + meta.id → /events?editEventId=', () => {
    expect(resolveNotificationRoute({ type: 'event', meta: { id: 'ev-7' } })).toEqual({
      name: 'events',
      query: { editEventId: 'ev-7' },
    })
  })

  it('alerte storage (meta.target) PRIME sur inventaire générique — même type', () => {
    expect(
      resolveNotificationRoute({
        type: 'inventory',
        meta: { spaceId: 'sp-1', target: 'restock-storage' },
      }),
    ).toEqual({
      name: 'space-restock',
      params: { spaceId: 'sp-1' },
      query: { step: 'stock', tab: 'storage' },
    })
  })

  it('inventory + meta.spaceId → inventaire de l\'espace', () => {
    expect(resolveNotificationRoute({ type: 'inventory', meta: { spaceId: 'sp-1' } })).toEqual({
      name: 'space-inventory',
      params: { spaceId: 'sp-1' },
    })
  })

  it('ids numériques castés en String (params de route)', () => {
    expect(resolveNotificationRoute({ type: 'event', meta: { id: 12 } }).query.editEventId).toBe('12')
    expect(
      resolveNotificationRoute({ type: 'inventory', meta: { spaceId: 3 } }).params.spaceId,
    ).toBe('3')
  })

  it('null pour tout le reste', () => {
    expect(resolveNotificationRoute(null)).toBe(null)
    expect(resolveNotificationRoute({})).toBe(null)
    expect(resolveNotificationRoute({ type: 'event' })).toBe(null) // pas de meta.id
    expect(resolveNotificationRoute({ type: 'inventory', meta: {} })).toBe(null)
    expect(resolveNotificationRoute({ type: 'success', meta: { id: 'x' } })).toBe(null)
    // target storage sans spaceId → pas de route (pas de repli hasardeux)
    expect(
      resolveNotificationRoute({ type: 'inventory', meta: { target: 'restock-storage' } }),
    ).toBe(null)
  })
})
