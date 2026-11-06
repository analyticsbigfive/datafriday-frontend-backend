import { attachCircuitFlow } from '@/utils/restockRowCircuitFlow'

const row = (shopId, over = {}) => ({ rowKey: `${shopId}|||a`, shopId, shopName: `PDV ${shopId}`, itemKey: 'a', restockQuantity: 60, ...over })

describe('attachCircuitFlow', () => {
  const allRows = [row('R'), row('D1', { restockQuantity: 0, remainingFromLogistic: true }), row('D2', { restockQuantity: 0, remainingFromLogistic: false })]
  const flowByShopRow = { 'R|||a': { received: 60, ceded: 0, fromStorage: 0 } }
  const transfersByItem = {
    a: [
      { fromShopId: 'D1', toShopId: 'R', quantity: 30, packs: 1 },
      { fromShopId: 'D2', toShopId: 'R', quantity: 30, packs: 1 },
      { fromShopId: 'D1', toShopId: 'X', quantity: 30, packs: 1 },
    ],
  }

  it('ajoute received/ceded/fromStorage et un receivedFrom par cédant avec l origine de son restant', () => {
    const [out] = attachCircuitFlow([allRows[0]], { allRows, flowByShopRow, transfersByItem })
    expect(out.received).toBe(60)
    expect(out.receivedFrom).toEqual([
      { shopId: 'D1', shopName: 'PDV D1', packs: 1, quantity: 30, remainingFromLogistic: true },
      { shopId: 'D2', shopName: 'PDV D2', packs: 1, quantity: 30, remainingFromLogistic: false },
    ])
  })

  it('reporte remainingFromLogistic de la ligne vivante, sans muter l entrée', () => {
    const input = [row('R')]
    const live = [row('R', { remainingFromLogistic: true })]
    const [out] = attachCircuitFlow(input, { allRows: live })
    expect(out.remainingFromLogistic).toBe(true)
    expect('remainingFromLogistic' in input[0]).toBe(false)
  })

  it('sans flux pour la ligne : aucun champ de circuit', () => {
    const [out] = attachCircuitFlow([row('Z')], { allRows, flowByShopRow, transfersByItem })
    expect('received' in out).toBe(false)
    expect('receivedFrom' in out).toBe(false)
  })

  it('laisse les lignes de stockage intactes', () => {
    const st = { rowKey: 's', shopId: 'S', itemKey: 'a', elementType: 'storage' }
    expect(attachCircuitFlow([st], { allRows, flowByShopRow, transfersByItem })[0]).toBe(st)
  })
})
