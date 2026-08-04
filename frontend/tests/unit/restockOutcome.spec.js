/**
 * BUG-296-01 — décomposition d'une ligne de réarmement et agrégat étape 1 :
 *  - computeRestockOutcome : gap (manque), surplusLoose (reste en vrac créé
 *    par l'arrondi en colis entiers), finalStock (restant + déposé − besoin) ;
 *  - aggregateRestockOutcomesByItem : somme grain article des lignes
 *    shop × article NON filtrées, arrondi PAR PDV avant somme (règle 295-01).
 */
import {
  computeRestockOutcome,
  aggregateRestockOutcomesByItem,
} from '@/utils/stockPlanning'

describe('BUG-296-01 — computeRestockOutcome', () => {
  it('cas nominal fiche : besoin 1,1, restant 0, 3×0,5 kg déposés', () => {
    const o = computeRestockOutcome({
      targetQuantity: 1.1,
      remainingQuantity: 0,
      restockQuantity: 1.5,
    })
    expect(o.gap).toBeCloseTo(1.1)
    expect(o.surplusLoose).toBeCloseTo(0.4)
    expect(o.finalStock).toBeCloseTo(0.4)
  })

  it('restant partiel : besoin 1,1, restant 0,5, 2 paquets sur le manque de 0,6', () => {
    const o = computeRestockOutcome({
      targetQuantity: 1.1,
      remainingQuantity: 0.5,
      restockQuantity: 1,
    })
    expect(o.gap).toBeCloseTo(0.6)
    expect(o.surplusLoose).toBeCloseTo(0.4)
    expect(o.finalStock).toBeCloseTo(0.4)
  })

  it('sur-stock : restant > besoin → gap 0, rien déposé, final positif', () => {
    const o = computeRestockOutcome({
      targetQuantity: 1,
      remainingQuantity: 3,
      restockQuantity: 0,
    })
    expect(o.gap).toBe(0)
    expect(o.surplusLoose).toBe(0)
    expect(o.finalStock).toBe(2)
  })

  it('entrées non numériques ou absentes → 0 partout (parité toNumber)', () => {
    const o = computeRestockOutcome({})
    expect(o).toEqual({ gap: 0, surplusLoose: 0, finalStock: 0 })
    const bad = computeRestockOutcome({
      targetQuantity: 'abc',
      remainingQuantity: null,
      restockQuantity: undefined,
    })
    expect(bad).toEqual({ gap: 0, surplusLoose: 0, finalStock: 0 })
  })
})

describe('BUG-296-01 — aggregateRestockOutcomesByItem', () => {
  const packaging = {
    packedCount: 2,
    packagingType: 'Paquet',
    packagingUnitNumber: 0.5,
    packagingUnit: 'kg',
  }

  it('2 PDV même article : arrondi par PDV avant somme (règle 295-01)', () => {
    // Chaque PDV manque de 0,7 kg → 2 paquets de 0,5 kg chacun (1 kg couvert).
    const rows = [
      {
        itemKey: 'farine', unit: 'kg', shopId: 's1',
        targetQuantity: 0.7, remainingQuantity: 0, restockQuantity: 1,
        packaging,
      },
      {
        itemKey: 'farine', unit: 'kg', shopId: 's2',
        targetQuantity: 0.7, remainingQuantity: 0, restockQuantity: 1,
        packaging,
      },
    ]
    const byItem = aggregateRestockOutcomesByItem(rows)
    const farine = byItem['farine']
    expect(farine.targetQuantity).toBeCloseTo(1.4)
    expect(farine.gap).toBeCloseTo(1.4)
    expect(farine.coveredQuantity).toBe(2)
    expect(farine.packedCount).toBe(4)
    expect(farine.surplusLoose).toBeCloseTo(0.6)
    expect(farine.finalStock).toBeCloseTo(0.6)
    expect(farine.shopCount).toBe(2)
    expect(farine.packagingType).toBe('Paquet')
    expect(farine.packagingUnitNumber).toBe(0.5)
  })

  it('article sans packaging → packedCount null, sommes correctes', () => {
    const rows = [
      {
        itemKey: 'citron', unit: 'pièce', shopId: 's1',
        targetQuantity: 5, remainingQuantity: 2, restockQuantity: 3,
        packaging: null,
      },
    ]
    const byItem = aggregateRestockOutcomesByItem(rows)
    expect(byItem['citron'].packedCount).toBeNull()
    expect(byItem['citron'].gap).toBe(3)
    expect(byItem['citron'].coveredQuantity).toBe(3)
    expect(byItem['citron'].surplusLoose).toBe(0)
    expect(byItem['citron'].finalStock).toBe(0)
  })

  it('lignes invalides ignorées, entrée vide → objet vide', () => {
    expect(aggregateRestockOutcomesByItem()).toEqual({})
    expect(aggregateRestockOutcomesByItem([null, {}, { unit: 'kg' }])).toEqual({})
  })
})
