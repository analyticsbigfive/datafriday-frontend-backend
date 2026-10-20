import { matchesSeasonFilter } from '@/utils/menuItemSeasonFilter'

describe('matchesSeasonFilter', () => {
  it('ne filtre rien quand aucune saison n est sélectionnée', () => {
    expect(matchesSeasonFilter({ seasonIds: [] }, [])).toBe(true)
    expect(matchesSeasonFilter({}, [])).toBe(true)
  })

  it('exclut un article sans saison dès qu une saison est filtrée', () => {
    expect(matchesSeasonFilter({ seasonIds: [] }, ['s1'])).toBe(false)
    expect(matchesSeasonFilter({}, ['s1'])).toBe(false)
  })

  it('garde un article qui a au moins une des saisons choisies (OU)', () => {
    expect(matchesSeasonFilter({ seasonIds: ['s1', 's2'] }, ['s2', 's3'])).toBe(true)
    expect(matchesSeasonFilter({ seasonIds: ['s1'] }, ['s2', 's3'])).toBe(false)
  })
})
