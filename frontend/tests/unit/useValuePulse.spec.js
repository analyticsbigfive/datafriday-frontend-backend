import { hasValueChanged, pulseElement, vValuePulse, PULSE_DURATION_MS } from '@/composables/useValuePulse'

describe('useValuePulse', () => {
  it('détecte un vrai changement seulement', () => {
    expect(hasValueChanged('a', 'a')).toBe(false)
    expect(hasValueChanged('a', 'b')).toBe(true)
    expect(hasValueChanged(NaN, NaN)).toBe(false)
  })

  it('anime au plus 600 ms et rien sans changement', () => {
    const animate = jest.fn()
    const el = { animate }
    vValuePulse.updated(el, { value: 1, oldValue: 1 })
    expect(animate).not.toHaveBeenCalled()
    vValuePulse.updated(el, { value: 2, oldValue: 1 })
    expect(animate).toHaveBeenCalledTimes(1)
    expect(animate.mock.calls[0][1].duration).toBeLessThanOrEqual(PULSE_DURATION_MS)
  })

  it('aucune animation si prefers-reduced-motion ou animate indisponible', () => {
    const original = window.matchMedia
    window.matchMedia = () => ({ matches: true })
    const animate = jest.fn()
    expect(pulseElement({ animate })).toBe(false)
    window.matchMedia = original
    expect(pulseElement({})).toBe(false)
  })
})
