/**
 * Event Predict : un PdV dont le slider est à 0 % est « coupé » (carte grisée,
 * bouton du tiroir inactif) tant que le slider reste à 0.
 */
import { isShopSwitchedOff } from '@/utils/shopAdjustmentState'

describe('isShopSwitchedOff', () => {
  it('est vrai à 0 %', () => {
    expect(isShopSwitchedOff(0)).toBe(true)
  })

  it('est faux dès que le slider passe au-dessus de 0', () => {
    expect(isShopSwitchedOff(5)).toBe(false)
    expect(isShopSwitchedOff(100)).toBe(false)
    expect(isShopSwitchedOff(250)).toBe(false)
  })

  it('est faux en mode Estimation 0 (slider absolu en unités, 0 = départ)', () => {
    expect(isShopSwitchedOff(0, true)).toBe(false)
  })

  it('est faux sans valeur exploitable (PdV sans article coché)', () => {
    expect(isShopSwitchedOff(undefined)).toBe(false)
    expect(isShopSwitchedOff(null)).toBe(false)
    expect(isShopSwitchedOff(NaN)).toBe(false)
  })
})
