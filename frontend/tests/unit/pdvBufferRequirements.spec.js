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

  it('rapproche par marketPriceId malgré un nom différent', () => {
    const els = [{ id: 'p1', inventoryByConfig: { c1: [{ name: 'Ancien nom', quantity: 8, marketPriceId: 'mp1', isStored: true }] } }]
    const buffers = collectPdvBuffers({ configuration, builderElements: els, cfgIds: ['c1'] })
    expect(buffers[0].marketPriceId).toBe('mp1')
    const rows = applyPdvBuffers([{ shopId: 'p1', itemName: 'Nouveau nom', itemId: 'mp1', totalQuantity: 3 }], buffers)
    expect(rows).toHaveLength(1)
    expect(rows[0].bufferQuantity).toBe(8)
  })

  it('prend les lignes de la config de l\'événement avant la config synthétique', () => {
    const els = [
      {
        id: 'p1',
        inventoryByConfig: {
          cEvent: [{ name: 'Bière', quantity: 12, isStored: true }],
          cAutre: [{ name: 'Autre', quantity: 99, isStored: true }],
        },
      },
    ]
    const b = collectPdvBuffers({ configuration, builderElements: els, cfgIds: ['cEvent', 'synthetic-restock'] })
    expect(b.map((x) => x.name)).toEqual(['Bière'])
    // Sans l'id de la config événement, plusieurs configs porteuses : rien (comportement du bug).
    expect(collectPdvBuffers({ configuration, builderElements: els, cfgIds: ['synthetic-restock'] })).toEqual([])
  })

  it('config synthétique : rapproche le PDV par nom si l\'id diffère', () => {
    const synth = { id: 'synthetic-restock', data: { floors: [{ elements: [{ id: 'Bar 1', name: 'Bar 1', type: 'shop', components: [] }] }] } }
    const els = [{ id: 'uuid-1', name: 'Bar 1', type: 'shop', inventoryByConfig: { cEvent: [{ name: 'Gants', quantity: 5, isStored: true }] } }]
    const b = collectPdvBuffers({ configuration: synth, builderElements: els, cfgIds: ['cEvent'] })
    expect(b).toHaveLength(1)
    expect(b[0].shop.id).toBe('Bar 1')
  })

  it('config synthétique : ajoute les PDV du builder membres des configs de tampon', () => {
    const synth = { id: 'synthetic-restock', data: { floors: [{ elements: [{ id: 'x', name: 'Autre PDV', type: 'shop', components: [] }] }] } }
    const els = [
      { id: 'uuid-1', name: 'Bar 1', type: 'shop', configIds: ['cEvent'], inventoryByConfig: { cEvent: [{ name: 'Gants', quantity: 5, isStored: true }] } },
      { id: 'uuid-2', name: 'Bar 2', type: 'shop', configIds: ['cHors'], inventoryByConfig: { cEvent: [{ name: 'Gants', quantity: 5, isStored: true }] } },
      { id: 'uuid-3', name: 'Stock', type: 'storage', configIds: ['cEvent'], inventoryByConfig: { cEvent: [{ name: 'Gants', quantity: 5, isStored: true }] } },
    ]
    const b = collectPdvBuffers({ configuration: synth, builderElements: els, cfgIds: ['cEvent'] })
    expect(b.map((x) => x.shop.id)).toEqual(['uuid-1'])
  })
})
