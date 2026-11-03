import { storageBufferRows, filterBufferRows, isStorageBufferRow } from '@/utils/restockStorageBuffers'

const products = [
  { name: 'Heineken - 30L', marketPriceId: 'mp-h' },
  { name: 'Chips - Belsia 40g', marketPriceId: 'mp-c' },
]

describe('storageBufferRows', () => {
  it('stockage vide : tous les produits, décochés, tampon 0', () => {
    const rows = storageBufferRows(products, {})
    expect(rows.map((r) => [r.name, r.stored, r.quantity])).toEqual([
      ['Chips - Belsia 40g', false, 0],
      ['Heineken - 30L', false, 0],
    ])
  })

  it('article stocké : coché, tampon converti en colis, placé en tête', () => {
    const inv = { cfg: [{ name: 'Heineken - 30L', marketPriceId: 'mp-h', isStored: true, quantity: 120 }] }
    const packOf = (p) => (p.marketPriceId === 'mp-h' ? { inventoryQuantityPackaged: 30 } : null)
    const rows = storageBufferRows(products, inv, {}, packOf)
    expect(rows[0]).toMatchObject({ name: 'Heineken - 30L', stored: true, quantity: 4 })
  })

  it('ajout manuel présent sur le stockage mais absent de la liste : ajouté', () => {
    const inv = { '': [{ name: 'Gobelet collector', isStored: true, quantity: 10 }] }
    const rows = storageBufferRows(products, inv)
    expect(rows[0]).toMatchObject({ name: 'Gobelet collector', stored: true, quantity: 10 })
  })

  it('valeurs saisies localement prioritaires', () => {
    const rows = storageBufferRows(products, {}, { 'chips - belsia 40g': { isStored: true, quantity: 2.5 } })
    expect(rows[0]).toMatchObject({ name: 'Chips - Belsia 40g', stored: true, quantity: 2.5 })
  })
})

describe('filterBufferRows', () => {
  it('filtre par nom sans casse', () => {
    const rows = storageBufferRows(products, {})
    expect(filterBufferRows(rows, 'heine').map((r) => r.name)).toEqual(['Heineken - 30L'])
    expect(filterBufferRows(rows, '  ')).toHaveLength(2)
  })
})

describe('isStorageBufferRow', () => {
  it('ligne décochée exclue même avec un tampon', () => {
    expect(isStorageBufferRow({ name: 'Ail Semoule', quantity: 5, isStored: false })).toBe(false)
  })
  it('cochée à tampon 0 : gardée (Rien à commander)', () => {
    expect(isStorageBufferRow({ name: 'Agitateur bois', quantity: 0, isStored: true })).toBe(true)
  })
  it('tampon ou seuils : gardée ; rien : exclue', () => {
    expect(isStorageBufferRow({ name: 'a', quantity: 5, isStored: true })).toBe(true)
    expect(isStorageBufferRow({ name: 'a', quantity: 5 })).toBe(true)
    expect(isStorageBufferRow({ name: 'a', quantity: 0, minStock: 2 })).toBe(true)
    expect(isStorageBufferRow({ name: 'a', quantity: 0 })).toBe(false)
    expect(isStorageBufferRow({ quantity: 5 })).toBe(false)
  })
})
