import { resolveValueForSpace, resolveGoalForSpace, resolveRatioForSpace, findMonoSpaceLine } from '@/utils/hrSettings'

describe('resolveValueForSpace', () => {
  it('null si aucune ligne ne couvre l\'espace', () => {
    expect(resolveValueForSpace([], 'space-a', 'goalPerTpe')).toBeNull()
    expect(resolveValueForSpace([{ allSpaces: false, spaceIds: ['space-b'], goalPerTpe: 1000 }], 'space-a', 'goalPerTpe')).toBeNull()
  })

  it('une ligne "Tous" s\'applique à un espace non couvert spécifiquement', () => {
    const lines = [{ allSpaces: true, spaceIds: [], goalPerTpe: 1000 }]
    expect(resolveValueForSpace(lines, 'space-a', 'goalPerTpe')).toBe(1000)
  })

  it('une ligne spécifique prime sur "Tous" (override délibéré)', () => {
    const lines = [
      { allSpaces: true, spaceIds: [], goalPerTpe: 1000 },
      { allSpaces: false, spaceIds: ['space-a'], goalPerTpe: 1500 },
    ]
    expect(resolveValueForSpace(lines, 'space-a', 'goalPerTpe')).toBe(1500)
    // Les autres espaces restent sur la ligne "Tous".
    expect(resolveValueForSpace(lines, 'space-b', 'goalPerTpe')).toBe(1000)
  })

  it('en cas de conflit entre deux lignes spécifiques (état incohérent défensif), la plus récente gagne', () => {
    const lines = [
      { allSpaces: false, spaceIds: ['space-a'], goalPerTpe: 1000, createdAt: '2026-01-01T00:00:00Z' },
      { allSpaces: false, spaceIds: ['space-a'], goalPerTpe: 2000, createdAt: '2026-06-01T00:00:00Z' },
    ]
    expect(resolveValueForSpace(lines, 'space-a', 'goalPerTpe')).toBe(2000)
  })

  it('tolère lines/spaceId absents', () => {
    expect(resolveValueForSpace(null, 'space-a', 'goalPerTpe')).toBeNull()
    expect(resolveValueForSpace([{ allSpaces: true, goalPerTpe: 1000 }], null, 'goalPerTpe')).toBeNull()
  })
})

describe('resolveGoalForSpace / resolveRatioForSpace', () => {
  it('lisent la bonne clé de valeur', () => {
    const goals = [{ allSpaces: true, spaceIds: [], goalPerTpe: 1000 }]
    const ratios = [{ allSpaces: true, spaceIds: [], staffPerZoneManager: 5 }]
    expect(resolveGoalForSpace(goals, 'space-a')).toBe(1000)
    expect(resolveRatioForSpace(ratios, 'space-a')).toBe(5)
  })
})

describe('findMonoSpaceLine', () => {
  it('trouve la ligne dédiée à exactement un espace', () => {
    const lines = [
      { id: 'l1', allSpaces: false, spaceIds: ['space-a', 'space-b'] },
      { id: 'l2', allSpaces: false, spaceIds: ['space-a'] },
    ]
    expect(findMonoSpaceLine(lines, 'space-a')?.id).toBe('l2')
  })

  it('ignore une ligne "Tous" ou multi-espaces', () => {
    const lines = [
      { id: 'l1', allSpaces: true, spaceIds: [] },
      { id: 'l2', allSpaces: false, spaceIds: ['space-a', 'space-b'] },
    ]
    expect(findMonoSpaceLine(lines, 'space-a')).toBeNull()
  })

  it('null si aucune ligne mono-espace pour cet espace', () => {
    expect(findMonoSpaceLine([], 'space-a')).toBeNull()
    expect(findMonoSpaceLine(null, 'space-a')).toBeNull()
  })
})
