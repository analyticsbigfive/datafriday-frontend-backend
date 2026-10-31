import { planAutosaveAction, defaultPlanName, PLAN_CORRECTIONS_DEBOUNCE_MS } from '@/utils/restockPlanAutosave'

describe('planAutosaveAction', () => {
  it('ne sauvegarde pas sans droit d\'écriture', () => {
    expect(planAutosaveAction({ canWrite: false, plansAvailable: true, editingPlanId: 'p1' })).toBe('none')
  })
  it('ne sauvegarde pas quand les plans sont indisponibles', () => {
    expect(planAutosaveAction({ canWrite: true, plansAvailable: false })).toBe('none')
  })
  it('met à jour le plan en cours de modification', () => {
    expect(planAutosaveAction({ canWrite: true, plansAvailable: true, editingPlanId: 'p1' })).toBe('update')
  })
  it('crée un plan sinon (plansAvailable inconnu inclus)', () => {
    expect(planAutosaveAction({ canWrite: true, plansAvailable: null, editingPlanId: null })).toBe('create')
  })
  it('tolère un appel sans argument', () => {
    expect(planAutosaveAction()).toBe('none')
  })
})

describe('defaultPlanName', () => {
  it('prend le libellé du premier événement', () => {
    expect(defaultPlanName([{ id: 1 }, { id: 2 }], (e) => ` Match ${e.id} `)).toBe('Match 1')
  })
  it('renvoie une chaîne vide sans événement', () => {
    expect(defaultPlanName([], () => 'x')).toBe('')
    expect(defaultPlanName(null, () => 'x')).toBe('')
  })
})

describe('PLAN_CORRECTIONS_DEBOUNCE_MS', () => {
  it('vaut 1,5 s', () => {
    expect(PLAN_CORRECTIONS_DEBOUNCE_MS).toBe(1500)
  })
})
