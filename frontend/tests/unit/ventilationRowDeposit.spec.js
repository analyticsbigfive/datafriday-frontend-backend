// Dépôt d'une ligne par le checkmark : quantité exacte, dépôts à annuler, index des lignes.

import { exactDepositShare, activeRowDeposits, indexVentilationRows, rowId, hasPlannedQuantity } from '@/utils/ventilationRowDeposit'

describe('exactDepositShare', () => {
  it('découpe en packs entiers et vrac sans arrondir au colis supérieur', () => {
    expect(exactDepositShare(75, 30)).toEqual({ packed: 2, loose: 15 })
    expect(exactDepositShare(60, 30)).toEqual({ packed: 2, loose: 0 })
    expect(exactDepositShare(12, 30)).toEqual({ packed: 0, loose: 12 })
  })

  it('met tout en vrac sans taille de pack', () => {
    expect(exactDepositShare(12, null)).toEqual({ packed: 0, loose: 12 })
    expect(exactDepositShare(7, 0)).toEqual({ packed: 0, loose: 7 })
  })

  it('tolère les décimales (litres)', () => {
    expect(exactDepositShare(507.6, 30)).toEqual({ packed: 16, loose: 27.6 })
  })

  it('renvoie 0 pour une quantité absente', () => {
    expect(exactDepositShare(undefined, 30)).toEqual({ packed: 0, loose: 0 })
  })
})

describe('activeRowDeposits', () => {
  const movements = [
    { id: 'm1', elementId: 'p1', itemKey: 'Bonbons', cancelled: false },
    { id: 'm2', elementId: 'p1', itemKey: 'Bonbons', cancelled: true },
    { id: 'm3', elementId: 'p2', itemKey: 'Bonbons', cancelled: false },
    { id: 'm4', elementId: 'p1', itemKey: 'Autre', cancelled: false },
  ]

  it('garde les dépôts non annulés de la destination et de l\'article (nom normalisé)', () => {
    expect(activeRowDeposits(movements, 'p1', ' bonbons ').map((m) => m.id)).toEqual(['m1'])
  })

  it('ne plante pas sans mouvements', () => {
    expect(activeRowDeposits(null, 'p1', 'x')).toEqual([])
  })
})

describe('indexVentilationRows', () => {
  it('retrouve la ligne depuis la paire article × destination', () => {
    const group = { itemKey: 'a', rows: [{ shopId: 'p1', quantity: 5, covered: false }] }
    const hit = indexVentilationRows([group]).get(rowId('a', 'p1'))
    expect(hit.group).toBe(group)
    expect(hit.row.shopId).toBe('p1')
  })
})

describe('hasPlannedQuantity', () => {
  it('vrai pour une quantité ou des packs prévus, faux sinon', () => {
    expect(hasPlannedQuantity({ quantity: 3 })).toBe(true)
    expect(hasPlannedQuantity({ quantity: 0, packs: 2 })).toBe(true)
    expect(hasPlannedQuantity({ quantity: 0, packs: null })).toBe(false)
    expect(hasPlannedQuantity(null)).toBe(false)
  })
})
