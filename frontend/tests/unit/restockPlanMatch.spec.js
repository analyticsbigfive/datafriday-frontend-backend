import { eventSetKey, findPlansForEvents, latestPlan, isPlanNameTaken, suggestPlanName } from '@/utils/restockPlanMatch'

const plan = (id, ids, updatedAt) => ({ id, selectedEventIds: ids, updatedAt })

describe('eventSetKey', () => {
  it('ignore l\'ordre, les doublons et le type des ids', () => {
    expect(eventSetKey(['b', 'a', 'a'])).toBe(eventSetKey(['a', 'b']))
    expect(eventSetKey([2, 1])).toBe(eventSetKey(['1', '2']))
  })
  it('renvoie une chaîne vide sans event', () => {
    expect(eventSetKey([])).toBe('')
    expect(eventSetKey(null)).toBe('')
  })
})

describe('findPlansForEvents', () => {
  const plans = [
    plan('p1', ['e1'], '2026-11-01T10:00:00Z'),
    plan('p2', ['e1'], '2026-11-05T10:00:00Z'),
    plan('p3', ['e1', 'e2'], '2026-11-06T10:00:00Z'),
  ]
  it('ne retient que le même jeu exact, le plus récent d\'abord', () => {
    expect(findPlansForEvents(plans, ['e1']).map((p) => p.id)).toEqual(['p2', 'p1'])
  })
  it('un sous-ensemble ou un sur-ensemble ne correspond pas', () => {
    expect(findPlansForEvents(plans, ['e2'])).toEqual([])
    expect(findPlansForEvents(plans, ['e2', 'e1']).map((p) => p.id)).toEqual(['p3'])
  })
  it('exclut le plan indiqué', () => {
    expect(findPlansForEvents(plans, ['e1'], { excludeId: 'p2' }).map((p) => p.id)).toEqual(['p1'])
  })
  it('un jeu vide ne correspond à rien', () => {
    expect(findPlansForEvents(plans, [])).toEqual([])
    expect(findPlansForEvents(null, ['e1'])).toEqual([])
  })
})

describe('latestPlan', () => {
  it('renvoie le plus récent', () => {
    expect(latestPlan([plan('a', [], '2026-11-01'), plan('b', [], '2026-11-09')]).id).toBe('b')
  })
  it('null sans plan', () => {
    expect(latestPlan([])).toBeNull()
    expect(latestPlan(undefined)).toBeNull()
  })
})

describe('isPlanNameTaken / suggestPlanName', () => {
  const plans = [{ name: 'Nantes-Grenoble' }, { name: ' nantes-grenoble (2) ' }]
  it('ignore la casse et les espaces', () => {
    expect(isPlanNameTaken(plans, 'NANTES-GRENOBLE')).toBe(true)
    expect(isPlanNameTaken(plans, 'Autre')).toBe(false)
    expect(isPlanNameTaken(plans, '  ')).toBe(false)
  })
  it('propose le premier suffixe libre', () => {
    expect(suggestPlanName('Nantes-Grenoble', plans)).toBe('Nantes-Grenoble (3)')
    expect(suggestPlanName('Nantes-Clermont', plans)).toBe('Nantes-Clermont (2)')
  })
  it('base vide : repli', () => {
    expect(suggestPlanName('', [], 'Commande')).toBe('Commande (2)')
  })
})
