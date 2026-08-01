import { isSinkingRuleMet, relevantSinkingRules } from '@/utils/sinkingRules'

describe('isSinkingRuleMet', () => {
  it('toujours rempli sans conditionAttribute', () => {
    expect(isSinkingRuleMet({ conditionAttribute: null }, {})).toBe(true)
    expect(isSinkingRuleMet({ conditionAttribute: '' }, { nbFriteuses: -5 })).toBe(true)
  })

  it('rempli si attrs[conditionAttribute] >= conditionMinValue', () => {
    const rule = { conditionAttribute: 'nbFriteuses', conditionMinValue: 2 }
    expect(isSinkingRuleMet(rule, { nbFriteuses: 2 })).toBe(true)
    expect(isSinkingRuleMet(rule, { nbFriteuses: 5 })).toBe(true)
  })

  it('pas rempli si en dessous du seuil', () => {
    const rule = { conditionAttribute: 'nbFriteuses', conditionMinValue: 2 }
    expect(isSinkingRuleMet(rule, { nbFriteuses: 1 })).toBe(false)
  })

  it('pas rempli si l\'attribut est absent, non numérique, ou attrs manquant', () => {
    const rule = { conditionAttribute: 'nbFriteuses', conditionMinValue: 1 }
    expect(isSinkingRuleMet(rule, {})).toBe(false)
    expect(isSinkingRuleMet(rule, { nbFriteuses: 'beaucoup' })).toBe(false)
    expect(isSinkingRuleMet(rule, null)).toBe(false)
  })

  it('conditionMinValue absent → seuil implicite 0', () => {
    const rule = { conditionAttribute: 'nbFriteuses' }
    expect(isSinkingRuleMet(rule, { nbFriteuses: 0 })).toBe(true)
    expect(isSinkingRuleMet(rule, { nbFriteuses: -1 })).toBe(false)
  })
})

describe('relevantSinkingRules', () => {
  const roles = [
    { id: 'role-1', name: 'Chef de Partie' },
    { id: 'role-2', name: 'Barman' },
  ]
  const rules = [
    { id: 'rule-1', roleId: 'role-1', fnbCategory: 'front_food', conditionAttribute: 'nbFriteuses', conditionMinValue: 2 },
    { id: 'rule-2', roleId: 'role-2', fnbCategory: 'mixology', conditionAttribute: null, conditionMinValue: null },
    { id: 'rule-3', roleId: 'role-1', fnbCategory: 'beverages', conditionAttribute: null, conditionMinValue: null },
  ]

  it('ne garde que les règles dont fnbCategory est dans les sous-types de l\'élément', () => {
    const result = relevantSinkingRules(rules, roles, ['front_food'], { nbFriteuses: 3 })
    expect(result.map((r) => r.id)).toEqual(['rule-1'])
  })

  it('résout le nom du rôle et le statut rempli/pas-rempli', () => {
    const result = relevantSinkingRules(rules, roles, ['front_food', 'mixology'], { nbFriteuses: 1 })
    const byId = Object.fromEntries(result.map((r) => [r.id, r]))
    expect(byId['rule-1'].roleName).toBe('Chef de Partie')
    expect(byId['rule-1'].met).toBe(false) // nbFriteuses=1 < seuil 2
    expect(byId['rule-2'].roleName).toBe('Barman')
    expect(byId['rule-2'].met).toBe(true) // sans condition
  })

  it('replie sur roleId brut si le rôle est introuvable (rôle supprimé entretemps)', () => {
    const result = relevantSinkingRules(
      [{ id: 'rule-x', roleId: 'ghost-role', fnbCategory: 'beverages', conditionAttribute: null }],
      roles,
      ['beverages'],
      {},
    )
    expect(result[0].roleName).toBe('ghost-role')
  })

  it('tolère rules/roles/subtypes/attributes absents (undefined/null)', () => {
    expect(relevantSinkingRules(undefined, undefined, undefined, undefined)).toEqual([])
    expect(relevantSinkingRules(rules, roles, null, null)).toEqual([])
  })
})
