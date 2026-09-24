jest.mock('@/composables/useConfirmDialog', () => ({ leaveDialog: jest.fn().mockResolvedValue('leave') }))

import { leaveDialog } from '@/composables/useConfirmDialog'
import { useUnsavedChanges } from '@/composables/useUnsavedChanges'
import { ALLERGEN_OPTIONS } from '@/utils/allergens'

describe('useUnsavedChanges (fiche Composant, parité Menu Item)', () => {
  it("sans référence prise (chargement en cours), la fiche n'est pas modifiée", () => {
    const { isDirty } = useUnsavedChanges()
    expect(isDirty({ name: 'Sauce' })).toBe(false)
  })

  it('modifiée dès que l\'état diffère de la référence, plus après un nouvel enregistrement', () => {
    const { takeSnapshot, isDirty } = useUnsavedChanges()
    const form = { name: 'Sauce', allergens: [], ingredients: [{ id: 'i1', quantity: 2 }] }
    takeSnapshot(form)
    expect(isDirty(form)).toBe(false)
    form.allergens.push('GLUTEN')
    expect(isDirty(form)).toBe(true)
    form.allergens.pop()
    expect(isDirty(form)).toBe(false)
    form.ingredients[0].quantity = 3
    expect(isDirty(form)).toBe(true)
    takeSnapshot(form)
    expect(isDirty(form)).toBe(false)
  })

  it('demande quoi faire avec les libellés de la fiche Menu Item', async () => {
    const { askLeave } = useUnsavedChanges()
    const result = await askLeave((k) => `t:${k}`)
    expect(result).toBe('leave')
    expect(leaveDialog).toHaveBeenCalledWith({
      title: 't:menuItemCreate.unsavedTitle',
      message: 't:menuItemCreate.unsavedMessage',
      leaveText: 't:menuItemCreate.leaveWithoutSaving',
      saveText: 't:menuItemCreate.saveAndLeave',
      cancelText: 't:cancel',
    })
  })
})

describe('ALLERGEN_OPTIONS (liste partagée Menu Item / Composant)', () => {
  it('garde les 7 valeurs stockées par les menu items', () => {
    expect(ALLERGEN_OPTIONS.map((o) => o.value)).toEqual(['GLUTEN', 'LACTOSE', 'EGGS', 'NUTS', 'FISH', 'SHELLFISH', 'SOY'])
  })
})
