import {
  countingStatusOf,
  matchesCountingStatuses,
  isDefaultCountingStatuses,
  countingStatusColor,
  DEFAULT_COUNTING_STATUSES,
} from '@/utils/inventoryCountingStatus'

describe('inventoryCountingStatus', () => {
  describe('countingStatusOf', () => {
    it('rien compté : à compter (pastille rouge)', () => {
      expect(countingStatusOf(19, 0)).toBe('to-count')
    })
    it('en partie : en cours (pastille orange)', () => {
      expect(countingStatusOf(19, 8)).toBe('in-progress')
    })
    it('tout compté : compté (pastille verte)', () => {
      expect(countingStatusOf(19, 19)).toBe('counted')
    })
    it('élément sans article : à compter', () => {
      expect(countingStatusOf(0, 0)).toBe('to-count')
    })
  })

  describe('matchesCountingStatuses', () => {
    it('filtre vide : tout passe', () => {
      expect(matchesCountingStatuses('counted', [])).toBe(true)
    })
    it('défaut : à compter et en cours, pas les comptés', () => {
      expect(matchesCountingStatuses('to-count', DEFAULT_COUNTING_STATUSES)).toBe(true)
      expect(matchesCountingStatuses('in-progress', DEFAULT_COUNTING_STATUSES)).toBe(true)
      expect(matchesCountingStatuses('counted', DEFAULT_COUNTING_STATUSES)).toBe(false)
    })
  })

  it('isDefaultCountingStatuses ignore l\'ordre', () => {
    expect(isDefaultCountingStatuses(['in-progress', 'to-count'])).toBe(true)
    expect(isDefaultCountingStatuses(['counted'])).toBe(false)
  })

  it('countingStatusColor suit la pastille', () => {
    expect(countingStatusColor('to-count')).toBe('grey')
    expect(countingStatusColor('in-progress')).toBe('warning')
    expect(countingStatusColor('counted')).toBe('success')
  })
})
