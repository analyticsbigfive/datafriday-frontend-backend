import { resolveDateBounds, previousPeriodBoundsOf, yearOverYearBoundsOf } from '@/utils/analyseDateBounds'

// Mercredi 14 octobre 2026, midi (heure locale).
const now = new Date(2026, 9, 14, 12, 0, 0)
const ymd = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()]

describe('resolveDateBounds', () => {
  it('all : bornes nulles', () => {
    expect(resolveDateBounds({ timeRange: 'all' }, { now })).toEqual({ start: null, end: null })
  })
  it('thismonth en analyse : 1er du mois à fin de journée courante', () => {
    const b = resolveDateBounds({ timeRange: 'thismonth' }, { now })
    expect(ymd(b.start)).toEqual([2026, 10, 1])
    expect(ymd(b.end)).toEqual([2026, 10, 14])
    expect(b.end.getHours()).toBe(23)
  })
  it('thismonth en predict : jusqu à la fin du mois', () => {
    const b = resolveDateBounds({ timeRange: 'thismonth' }, { now, isPredict: true })
    expect(ymd(b.end)).toEqual([2026, 10, 31])
  })
  it('last12months : même jour l an dernier', () => {
    const b = resolveDateBounds({ timeRange: 'last12months' }, { now })
    expect(ymd(b.start)).toEqual([2025, 10, 14])
  })
  it('thisweek : lundi de la semaine', () => {
    expect(ymd(resolveDateBounds({ timeRange: 'thisweek' }, { now }).start)).toEqual([2026, 10, 12])
  })
  it('lastquarter : T2 2026', () => {
    const b = resolveDateBounds({ timeRange: 'lastquarter' }, { now })
    expect(ymd(b.start)).toEqual([2026, 7, 1])
    expect(ymd(b.end)).toEqual([2026, 9, 30])
  })
  it('custom : dates saisies, null si vide', () => {
    const b = resolveDateBounds({ timeRange: 'custom', startDate: '2026-03-01T00:00:00', endDate: null }, { now })
    expect(ymd(b.start)).toEqual([2026, 3, 1])
    expect(b.end).toBeNull()
  })
  it('custom « AAAA-MM-JJ » : lu en heure locale, un event à minuit local du premier jour reste inclus', () => {
    // Régression : new Date('2025-08-01') = minuit UTC = 02:00 à Paris, ce qui excluait le premier jour.
    const b = resolveDateBounds({ timeRange: 'custom', startDate: '2025-08-01', endDate: '2025-08-31' }, { now })
    const eventAtLocalMidnight = new Date(2025, 7, 1)
    expect(eventAtLocalMidnight >= b.start).toBe(true)
    expect(ymd(b.start)).toEqual([2025, 8, 1])
    expect(ymd(b.end)).toEqual([2025, 8, 31])
    expect(new Date(2025, 7, 31, 18, 0) <= b.end).toBe(true)
  })
  it('saison connue : fin à 23:59:59.999', () => {
    const seasons = [{ id: 's1', startDate: '2025-08-01T00:00:00', endDate: '2026-05-31T00:00:00' }]
    const b = resolveDateBounds({ timeRange: 'season:s1' }, { seasons, now })
    expect(ymd(b.start)).toEqual([2025, 8, 1])
    expect(ymd(b.end)).toEqual([2026, 5, 31])
    expect(b.end.getMilliseconds()).toBe(999)
  })
  it('saison inconnue : {null, null}, jamais l année en cours', () => {
    expect(resolveDateBounds({ timeRange: 'season:zzz' }, { seasons: [], now })).toEqual({ start: null, end: null })
  })
  it('preset inconnu : année en cours (default)', () => {
    const b = resolveDateBounds({ timeRange: 'bidule' }, { now })
    expect(ymd(b.start)).toEqual([2026, 1, 1])
    expect(ymd(b.end)).toEqual([2026, 12, 31])
  })
})

describe('previousPeriodBoundsOf', () => {
  it('bornes nulles : comparaison désactivée', () => {
    expect(previousPeriodBoundsOf({ start: null, end: null }, 'all', now)).toEqual({ start: null, end: null })
  })
  it('thismonth : mois dernier entier', () => {
    const b = resolveDateBounds({ timeRange: 'thismonth' }, { now })
    const p = previousPeriodBoundsOf(b, 'thismonth', now)
    expect(ymd(p.start)).toEqual([2026, 9, 1])
    expect(ymd(p.end)).toEqual([2026, 9, 30])
    expect(p.end.getMilliseconds()).toBe(999)
  })
  it('week : les 7 jours d avant', () => {
    const b = resolveDateBounds({ timeRange: 'week' }, { now })
    const p = previousPeriodBoundsOf(b, 'week', now)
    expect(ymd(p.start)).toEqual([2026, 10, 1])
    expect(ymd(p.end)).toEqual([2026, 10, 7])
  })
  it('thisyear : mêmes jours écoulés l an dernier', () => {
    const b = resolveDateBounds({ timeRange: 'thisyear' }, { now })
    const p = previousPeriodBoundsOf(b, 'thisyear', now)
    expect(ymd(p.start)).toEqual([2025, 1, 1])
    expect(ymd(p.end)).toEqual([2025, 10, 14]) // 286 jours écoulés depuis le 1er janvier
  })
  it('repli « bloc précédent » (custom) : même durée, 1 jour d écart', () => {
    const b = { start: new Date(2026, 2, 1), end: new Date(2026, 2, 10, 23, 59, 59) }
    const p = previousPeriodBoundsOf(b, 'custom', now)
    expect(ymd(p.start)).toEqual([2026, 2, 19])
    expect(ymd(p.end)).toEqual([2026, 2, 28])
  })
  it('une saison retombe sur le bloc précédent', () => {
    const b = { start: new Date(2025, 7, 1), end: new Date(2025, 7, 31, 23, 59, 59, 999) }
    const p = previousPeriodBoundsOf(b, 'season:s1', now)
    expect(ymd(p.end)).toEqual([2025, 7, 31])
    expect(p.end.getTime()).toBeLessThan(b.start.getTime())
  })
})

describe('yearOverYearBoundsOf', () => {
  it('décale de un an', () => {
    const b = resolveDateBounds({ timeRange: 'thismonth' }, { now })
    const y = yearOverYearBoundsOf(b)
    expect(ymd(y.start)).toEqual([2025, 10, 1])
    expect(ymd(y.end)).toEqual([2025, 10, 14])
  })
  it('bornes nulles : {null, null}', () => {
    expect(yearOverYearBoundsOf({ start: null, end: null })).toEqual({ start: null, end: null })
  })
})
