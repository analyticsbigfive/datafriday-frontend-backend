import { isElementAccessOpen, isAnyAccessOpen, isFullyOpen } from '@/utils/guestPinAccessState'

const win = (status, accesses = []) => ({ id: 'w', status, accesses })

describe('guestPinAccessState', () => {
  it('sans ligne, le PDV suit la fenêtre', () => {
    expect(isElementAccessOpen(win('open'), 'shop-1')).toBe(true)
    expect(isElementAccessOpen(win('closed'), 'shop-1')).toBe(false)
    expect(isElementAccessOpen(null, 'shop-1')).toBe(false)
  })

  it('la ligne du PDV fait foi : arrêté seul ou rouvert seul', () => {
    expect(isElementAccessOpen(win('open', [{ elementId: 'shop-1', status: 'revoked' }]), 'shop-1')).toBe(false)
    expect(isElementAccessOpen(win('closed', [{ elementId: 'shop-1', status: 'active' }]), 'shop-1')).toBe(true)
  })

  it('isAnyAccessOpen : fenêtre ouverte ou un PDV rouvert', () => {
    expect(isAnyAccessOpen(win('closed'))).toBe(false)
    expect(isAnyAccessOpen(win('closed', [{ elementId: 'a', status: 'active' }]))).toBe(true)
    expect(isAnyAccessOpen(win('open'))).toBe(true)
  })

  it('isFullyOpen : fenêtre ouverte sans PDV arrêté', () => {
    expect(isFullyOpen(win('open'))).toBe(true)
    expect(isFullyOpen(win('open', [{ elementId: 'a', status: 'revoked' }]))).toBe(false)
    expect(isFullyOpen(win('closed'))).toBe(false)
  })
})

describe('elementStoppedBySaleAt (pre-event arrêté à la première vente, Bertrand 2026-10-07)', () => {
  const { elementStoppedBySaleAt } = require('@/utils/guestPinAccessState')
  const win = (access) => ({ status: 'open', accesses: [{ elementId: 'pdv-a', ...access }] })

  it('PDV arrêté par sa première vente : heure de l\'arrêt', () => {
    const at = elementStoppedBySaleAt(win({ status: 'revoked', stopReason: 'sale', revokedAt: '2026-10-10T17:12:00Z' }), 'pdv-a')
    expect(at.toISOString()).toBe('2026-10-10T17:12:00.000Z')
  })

  it('arrêté par le directeur, rouvert, ou sans ligne : rien', () => {
    expect(elementStoppedBySaleAt(win({ status: 'revoked', stopReason: 'manual', revokedAt: '2026-10-10T17:12:00Z' }), 'pdv-a')).toBeNull()
    expect(elementStoppedBySaleAt(win({ status: 'active', stopReason: null }), 'pdv-a')).toBeNull()
    expect(elementStoppedBySaleAt(win({ status: 'revoked', stopReason: 'sale', revokedAt: '2026-10-10T17:12:00Z' }), 'pdv-b')).toBeNull()
    expect(elementStoppedBySaleAt(null, 'pdv-a')).toBeNull()
  })
})
