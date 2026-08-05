// Cible d'inventaire du CTA Event Predict : match à venir → pre-event.
import { resolveInventoryRouteName } from '@/utils/inventoryRouteTarget'

const NOW = new Date('2026-08-04T12:00:00Z').getTime()

describe('resolveInventoryRouteName', () => {
  it('event futur → pre-event inventory', () => {
    expect(resolveInventoryRouteName({ eventDate: '12/08/2026' }, NOW)).toBe('space-pre-inventory')
    expect(resolveInventoryRouteName({ date: '2026-09-03' }, NOW)).toBe('space-pre-inventory')
  })

  it('event passé → post-event inventory', () => {
    expect(resolveInventoryRouteName({ eventDate: '01/08/2026' }, NOW)).toBe('space-inventory')
    expect(resolveInventoryRouteName({ date: '2026-07-25' }, NOW)).toBe('space-inventory')
  })

  it('DD/MM/YYYY lu comme tel, pas en MM/DD', () => {
    // 04/09/2026 = 4 septembre (futur). Lu en MM/DD ce serait le 9 avril (passé)
    // → le CTA enverrait sur le post-event pour un match à venir.
    expect(resolveInventoryRouteName({ eventDate: '04/09/2026' }, NOW)).toBe('space-pre-inventory')
  })

  it('même jour → post (la borne n’est pas stricte côté passé)', () => {
    expect(resolveInventoryRouteName({ eventDate: '04/08/2026' }, NOW)).toBe('space-inventory')
  })

  it('date absente, illisible ou event nul → post (comportement historique)', () => {
    expect(resolveInventoryRouteName({ id: 'x' }, NOW)).toBe('space-inventory')
    expect(resolveInventoryRouteName({ eventDate: 'pas une date' }, NOW)).toBe('space-inventory')
    expect(resolveInventoryRouteName(null, NOW)).toBe('space-inventory')
    expect(resolveInventoryRouteName(undefined, NOW)).toBe('space-inventory')
  })
})
