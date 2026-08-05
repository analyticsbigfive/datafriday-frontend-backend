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
  roundForUnit,
  ceilForUnit,
} from '@/utils/stockPlanning'

describe('Lot 4 — arrondis (roundForUnit / ceilForUnit)', () => {
  it('pièces : les deux arrondissent au supérieur (une pièce est indivisible)', () => {
    for (const unit of ['pcs', 'Pc', 'piece', 'PIECES']) {
      expect(roundForUnit(12.1, unit)).toBe(13)
      expect(ceilForUnit(12.1, unit)).toBe(13)
    }
  })

  it('unités continues : ceilForUnit monte au dixième, roundForUnit arrondissait vers le bas', () => {
    // Le cas qui laissait un manque non couvert : 0,64 kg → 0,6 kg déposé.
    expect(roundForUnit(0.64, 'kg')).toBeCloseTo(0.6)
    expect(ceilForUnit(0.64, 'kg')).toBeCloseTo(0.7)
    expect(ceilForUnit(1.01, 'L')).toBeCloseTo(1.1)
  })

  it('valeur déjà ronde inchangée, entrées non numériques → 0', () => {
    expect(ceilForUnit(0.5, 'kg')).toBeCloseTo(0.5)
    expect(ceilForUnit(3, 'pcs')).toBe(3)
    expect(ceilForUnit(null, 'kg')).toBe(0)
    expect(ceilForUnit('abc', 'pcs')).toBe(0)
  })
})

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
    // Lot 2 : totalQuantity = besoin BRUT avant slider % (ici 0,5/PDV, cible
    // ajustée à 0,7) → predictedQuantity distincte de targetQuantity.
    const rows = [
      {
        itemKey: 'farine', unit: 'kg', shopId: 's1',
        totalQuantity: 0.5, targetQuantity: 0.7, remainingQuantity: 0, restockQuantity: 1,
        packaging,
      },
      {
        itemKey: 'farine', unit: 'kg', shopId: 's2',
        totalQuantity: 0.5, targetQuantity: 0.7, remainingQuantity: 0, restockQuantity: 1,
        packaging,
      },
    ]
    const byItem = aggregateRestockOutcomesByItem(rows)
    const farine = byItem['farine']
    expect(farine.predictedQuantity).toBeCloseTo(1)
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
    // Lot 2 — ligne sans totalQuantity (photo legacy) → predictedQuantity 0.
    expect(byItem['citron'].predictedQuantity).toBe(0)
    expect(byItem['citron'].gap).toBe(3)
    expect(byItem['citron'].coveredQuantity).toBe(3)
    expect(byItem['citron'].surplusLoose).toBe(0)
    expect(byItem['citron'].finalStock).toBe(0)
  })

  it('lignes invalides ignorées, entrée vide → objet vide', () => {
    expect(aggregateRestockOutcomesByItem()).toEqual({})
    expect(aggregateRestockOutcomesByItem([null, {}, { unit: 'kg' }])).toEqual({})
  })

  /**
   * Lot 4 — l'étape 1 affiche « Nécessaire » = `gap`, jamais `targetQuantity`.
   * Cas réel (capture JLH) : 3 PDV, besoin total 45 pc, inventaire total 252 pc
   * concentré sur deux PDV. Afficher la cible brute donnait « Nécessaire 45 »
   * à côté de « Inventaire 252 » — lecture contradictoire. Le manque se calcule
   * PAR PDV : un PDV sur-stocké ne compense jamais un PDV vide.
   */
  it('BUG capture — le manque se calcule par PDV, un PDV sur-stocké ne compense pas', () => {
    const rows = [
      { itemKey: 'bun', unit: 'pcs', shopId: 's1', totalQuantity: 15, targetQuantity: 15, remainingQuantity: 250, restockQuantity: 0, packaging: null },
      { itemKey: 'bun', unit: 'pcs', shopId: 's2', totalQuantity: 15, targetQuantity: 15, remainingQuantity: 2, restockQuantity: 16, packaging: null },
      { itemKey: 'bun', unit: 'pcs', shopId: 's3', totalQuantity: 15, targetQuantity: 15, remainingQuantity: 0, restockQuantity: 16, packaging: null },
    ]
    const bun = aggregateRestockOutcomesByItem(rows)['bun']
    expect(bun.predictedQuantity).toBe(45)
    expect(bun.targetQuantity).toBe(45)
    expect(bun.remainingQuantity).toBe(252)
    // 0 (sur-stocké) + 13 + 15 — surtout pas max(0, 45 − 252) = 0.
    expect(bun.gap).toBe(28)
  })

  it('inventaire couvrant tous les PDV → gap 0, rien à déposer', () => {
    const rows = [
      { itemKey: 'coca', unit: 'pcs', shopId: 's1', totalQuantity: 60, targetQuantity: 60, remainingQuantity: 80, restockQuantity: 0, packaging: null },
      { itemKey: 'coca', unit: 'pcs', shopId: 's2', totalQuantity: 60, targetQuantity: 60, remainingQuantity: 64, restockQuantity: 0, packaging: null },
    ]
    const coca = aggregateRestockOutcomesByItem(rows)['coca']
    expect(coca.gap).toBe(0)
    expect(coca.coveredQuantity).toBe(0)
  })
})
