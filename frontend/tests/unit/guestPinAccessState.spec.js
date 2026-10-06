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
