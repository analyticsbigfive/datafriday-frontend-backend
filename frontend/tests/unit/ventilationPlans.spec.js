import {
  pickPlansForEvents,
  mergeRestockPlans,
  depositEventForPlan,
  allocateDeposit,
  splitMergedRowKey,
} from '@/utils/ventilationPlans'
import { buildDepositLines, groupDepositLinesByItem } from '@/utils/restockDepositSheet'

const packaging = (packedCount) => ({ packedCount, packagingType: 'Carton', packagingUnitNumber: 30, packagingUnit: 'Pc', looseQty: packedCount * 30, purchaseUnitConversion: 1 })
const line = (rowKey, shopId, qty) => ({ rowKey, shopId, shopName: shopId, itemKey: 'bonbons', itemName: 'Bonbons', unit: 'Pc', restockQuantity: qty, packaging: packaging(qty / 30) })

const planA = { id: 'pA', name: 'Nantes-Reims', selectedEventIds: ['evA'], restockLines: [line('k', 's1', 60)], lineOverrides: {}, restockedRows: {} }
const planB = { id: 'pB', name: 'Nantes-Lyon', selectedEventIds: ['evB', 'evC'], restockLines: [line('k', 's1', 30), line('k2', 's2', 30)], lineOverrides: { k2: 0 }, restockedRows: {} }

describe('pickPlansForEvents', () => {
  it('la plus récente feuille de chaque match, une seule fois', () => {
    const list = [{ id: 'pB', selectedEventIds: ['evB', 'evC'] }, { id: 'old', selectedEventIds: ['evB'] }, { id: 'pA', selectedEventIds: ['evA'] }]
    expect(pickPlansForEvents(list, ['evA', 'evB', 'evC']).map((p) => p.id)).toEqual(['pA', 'pB'])
  })
})

describe('mergeRestockPlans', () => {
  const merged = mergeRestockPlans([planB, planA], ['evA', 'evB', 'evC'])

  it('ordre chronologique des feuilles, rowKeys et corrections préfixés, matchs réunis', () => {
    expect(merged.name).toBe('Nantes-Reims + Nantes-Lyon')
    expect(merged.restockLines.map((l) => l.rowKey)).toEqual(['pA::k', 'pB::k', 'pB::k2'])
    expect(merged.lineOverrides).toEqual({ 'pB::k2': 0 })
    expect(merged.eventIds).toEqual(['evA', 'evB', 'evC'])
    expect(splitMergedRowKey('pB::k2')).toEqual({ planId: 'pB', rowKey: 'k2' })
  })

  it('additionne par destination, dépôts imputés au match le plus proche d’abord', () => {
    const lines = buildDepositLines(merged, [{ elementId: 's1', itemKey: 'Bonbons', packed: 0, loose: 70 }])
    const [group] = groupDepositLinesByItem(lines)
    // s2 corrigé à 0 sur la feuille B ; s1 : 60 (A) + 30 (B) − 70 déposés = 20, tout sur B.
    expect(group.rows).toHaveLength(1)
    expect(group.rows[0].quantity).toBe(20)
    expect(group.rows[0].parts.map((p) => [p.rowKey, p.quantity])).toEqual([['pB::k', 20]])
  })
})

describe('depositEventForPlan', () => {
  it('le match choisi le plus proche de la feuille, sinon son premier', () => {
    expect(depositEventForPlan({ selectedEventIds: ['evB', 'evC'] }, ['evA', 'evC'])).toBe('evC')
    expect(depositEventForPlan({ selectedEventIds: ['evB'] }, ['evA'])).toBe('evB')
  })
})

describe('allocateDeposit', () => {
  const parts = [{ rowKey: 'a', quantity: 45 }, { rowKey: 'b', quantity: 30 }]

  it('packs entiers, le match le plus proche couvert en premier, surplus au dernier', () => {
    expect(allocateDeposit({ packed: 3, loose: 0 }, parts, 30)).toEqual([
      { rowKey: 'a', packed: 2, loose: 0 },
      { rowKey: 'b', packed: 1, loose: 0 },
    ])
    expect(allocateDeposit({ packed: 1, loose: 20 }, parts, 30)).toEqual([
      { rowKey: 'a', packed: 1, loose: 15 },
      { rowKey: 'b', packed: 0, loose: 5 },
    ])
  })

  it('une seule part : tout y va', () => {
    expect(allocateDeposit({ packed: 2, loose: 1 }, [{ rowKey: 'a', quantity: 10 }], 30)).toEqual([{ rowKey: 'a', packed: 2, loose: 1 }])
  })
})
