// granularIdentityKey — clé d'identité du granular pour le mémo de résultat
// d'usePredictiveTimeline (fix 2026-07-06 : remplace le proxy « longueur » qui
// servait un mémo périmé quand le contenu changeait à longueur égale).

import { granularIdentityKey } from '@/composables/usePredictiveTimeline'

describe('granularIdentityKey', () => {
  it('même instance de tableau → même clé (stabilité)', () => {
    const arr = [{ eventId: 'e1' }]
    expect(granularIdentityKey(arr)).toBe(granularIdentityKey(arr))
  })

  it('deux tableaux de MÊME longueur mais contenus/instances distincts → clés différentes', () => {
    const a = [{ eventId: 'e1', quantity: 10 }]
    const b = [{ eventId: 'e1', quantity: 99 }]
    expect(granularIdentityKey(a)).not.toBe(granularIdentityKey(b))
  })

  it("deux tableaux vides distincts → clé constante 'g0' (readGranular() fabrique un [] neuf à chaque appel)", () => {
    expect(granularIdentityKey([])).toBe('g0')
    expect(granularIdentityKey([])).toBe('g0')
    expect(granularIdentityKey(null)).toBe('g0')
    expect(granularIdentityKey(undefined)).toBe('g0')
  })
})
