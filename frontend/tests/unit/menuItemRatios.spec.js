import { applyMenuItemRatios, resolveTargetMenuItemIds } from '@/utils/menuItemRatios'

describe('applyMenuItemRatios', () => {
  const ratio = (over = {}) => ({
    roleId: 'role-1',
    ratioBasis: 'QUANTITY',
    ratioValue: 100,
    unitQty: 1,
    targetMenuItemIds: ['item-burger'],
    ...over,
  })
  const sale = (over = {}) => ({ menuItemId: 'item-burger', quantity: 0, revenueHt: 0, ...over })

  it('seuil non atteint → []', () => {
    expect(applyMenuItemRatios([ratio()], [sale({ quantity: 99 })])).toEqual([])
  })

  it('seuil atteint (Quantités) → qty = floor(vendu / ratioValue) * unitQty', () => {
    expect(applyMenuItemRatios([ratio({ unitQty: 2 })], [sale({ quantity: 250 })])).toEqual([
      { roleId: 'role-1', qty: 4 },
    ])
  })

  it('base CA (REVENUE) → lit revenueHt et non quantity', () => {
    const out = applyMenuItemRatios(
      [ratio({ ratioBasis: 'REVENUE', ratioValue: 500 })],
      [sale({ quantity: 0, revenueHt: 1200 })],
    )
    expect(out).toEqual([{ roleId: 'role-1', qty: 2 }])
  })

  it('plusieurs ratios pour le même rôle → sommés (pas de max)', () => {
    const out = applyMenuItemRatios(
      [
        ratio({ targetMenuItemIds: ['item-burger'], ratioValue: 100, unitQty: 2 }),
        ratio({ targetMenuItemIds: ['item-frites'], ratioValue: 50, unitQty: 3 }),
      ],
      [sale({ menuItemId: 'item-burger', quantity: 100 }), sale({ menuItemId: 'item-frites', quantity: 50 })],
    )
    expect(out).toEqual([{ roleId: 'role-1', qty: 5 }])
  })

  it('tolère ratios/sales absents (undefined/null)', () => {
    expect(applyMenuItemRatios(undefined, undefined)).toEqual([])
    expect(applyMenuItemRatios([ratio()], null)).toEqual([])
  })
})

describe('resolveTargetMenuItemIds', () => {
  it('allMenuItems=true → tous les items disponibles', () => {
    expect(resolveTargetMenuItemIds({ allMenuItems: true, menuItemIds: ['x'] }, ['a', 'b'])).toEqual(['a', 'b'])
  })

  it('allMenuItems=false → la liste explicite', () => {
    expect(resolveTargetMenuItemIds({ allMenuItems: false, menuItemIds: ['a'] }, ['a', 'b'])).toEqual(['a'])
  })

  it('tolère ratio/availableMenuItemIds absents', () => {
    expect(resolveTargetMenuItemIds(null, ['a'])).toEqual([])
    expect(resolveTargetMenuItemIds({ allMenuItems: true }, null)).toEqual([])
  })
})
