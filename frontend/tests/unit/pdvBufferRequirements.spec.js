import { collectPdvBuffers, applyPdvBuffers, targetWithBuffer } from '@/utils/pdvBufferRequirements'

const configuration = { data: { floors: [{ elements: [{ id: 'p1', name: 'Bar 1', type: 'shop', shopType: 'fb' }] }] } }
const builderElements = [
  {
    id: 'p1',
    inventoryByConfig: {
      c1: [
        { name: 'Gants', quantity: 40, unit: 'pcs', isStored: true },
        { name: 'Bière', quantity: 10, unit: 'pcs' },
        { name: 'Vide', quantity: 0 },
        { name: 'Décoché', quantity: 5, isStored: false },
      ],
    },
  },
]

describe('pdvBufferRequirements', () => {
  it('ne garde que les tampons > 0 et cochés', () => {
    const b = collectPdvBuffers({ configuration, builderElements, cfgIds: ['c1'] })
    expect(b.map((x) => x.name)).toEqual(['Gants', 'Bière'])
  })

  it('pose le tampon sur une ligne existante et crée une ligne pour un produit sans prévision', () => {
    const buffers = collectPdvBuffers({ configuration, builderElements, cfgIds: ['c1'] })
    const rows = applyPdvBuffers([{ shopId: 'p1', itemName: 'bière', itemId: 'x', totalQuantity: 30 }], buffers)
    expect(rows).toHaveLength(2)
    expect(rows[0].bufferQuantity).toBe(10)
    expect(rows[1]).toMatchObject({ itemName: 'Gants', totalQuantity: 0, bufferQuantity: 40, shopId: 'p1' })
  })

  it('cible = le plus grand du prévu et du tampon', () => {
    expect(targetWithBuffer(30, 10)).toBe(30)
    expect(targetWithBuffer(0, 40)).toBe(40)
  })
})
