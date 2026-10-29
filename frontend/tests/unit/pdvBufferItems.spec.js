import { isBufferRow, buildBufferItem, appendBufferItems } from '@/utils/pdvBufferItems'

const mps = [
  { id: 'mp1', itemName: 'Heineken fût', unit: 'L', image: 'img.png', inventoryPackaging: 'Keg', inventoryQuantityPackaged: 20 },
  { id: 'mp2', itemName: 'Eau', unit: 'pcs', packedUnits: 6 },
]
const make = (row) => buildBufferItem(row, mps)

describe('isBufferRow', () => {
  it('quantité > 0 et non décochée', () => {
    expect(isBufferRow({ quantity: 5 })).toBe(true)
    expect(isBufferRow({ quantity: 5, isStored: true })).toBe(true)
    expect(isBufferRow({ quantity: '3' })).toBe(true)
  })
  it('rejette tampon nul, décoché, ligne absente', () => {
    expect(isBufferRow({ quantity: 0 })).toBe(false)
    expect(isBufferRow({ quantity: 5, isStored: false })).toBe(false)
    expect(isBufferRow({})).toBe(false)
    expect(isBufferRow(null)).toBe(false)
  })
})

describe('buildBufferItem', () => {
  it('id du Market Price et conditionnement', () => {
    const it = make({ name: 'heineken FÛT', marketPriceId: 'mp1', quantity: 40 })
    expect(it).toMatchObject({
      id: 'mp1', name: 'Heineken fût', marketPriceId: 'mp1', unit: 'L',
      picture: 'img.png', inventoryPackaging: 'Keg', inventoryQuantityPackaged: 20, usedIn: [],
    })
    expect(it.storageType).toBeUndefined()
  })
  it('repli sur la quantité par paquet packedUnits', () => {
    expect(make({ name: 'Eau', quantity: 1 }).inventoryQuantityPackaged).toBe(6)
  })
  it('sans Market Price : id de la ligne, sinon clé de nom', () => {
    expect(make({ name: 'Inconnu', marketPriceId: 'zz', quantity: 1 }).id).toBe('zz')
    expect(make({ name: ' Inconnu  X ', quantity: 1 }).id).toBe('buffer:inconnu x')
  })
})

describe('appendBufferItems', () => {
  const items = [{ id: 'mp2', name: 'Eau', marketPriceId: 'mp2' }]
  it('rows non tableau : items inchangé', () => {
    expect(appendBufferItems(items, undefined, make)).toBe(items)
    expect(appendBufferItems(items, null, make)).toBe(items)
  })
  it('ajoute un produit en tampon absent, sans toucher aux articles existants', () => {
    const out = appendBufferItems(items, [{ name: 'Heineken fût', marketPriceId: 'mp1', quantity: 40 }], make)
    expect(out).toHaveLength(2)
    expect(out[0]).toBe(items[0])
    expect(out[1].id).toBe('mp1')
  })
  it('n ajoute pas un produit déjà présent (id ou nom) et ne filtre rien', () => {
    const rows = [
      { name: 'autre nom', marketPriceId: 'mp2', quantity: 4 },
      { name: 'EAU', quantity: 4 },
    ]
    expect(appendBufferItems(items, rows, make)).toEqual(items)
  })
  it('ignore tampon nul ou décoché', () => {
    const rows = [
      { name: 'A', quantity: 0 },
      { name: 'B', quantity: 3, isStored: false },
    ]
    expect(appendBufferItems(items, rows, make)).toEqual(items)
  })
  it('dédoublonne par id puis par nom', () => {
    const rows = [
      { name: 'Heineken fût', marketPriceId: 'mp1', quantity: 40 },
      { name: 'Autre', marketPriceId: 'mp1', quantity: 2 },
      { name: 'Zzz', quantity: 2 },
      { name: ' zzz ', quantity: 3 },
    ]
    expect(appendBufferItems(items, rows, make).map((i) => i.name)).toEqual(['Eau', 'Heineken fût', 'Zzz'])
  })
})
