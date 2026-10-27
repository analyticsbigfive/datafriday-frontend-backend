import { buildStorageProducts, usedItemNames, filterStorageProducts } from '@/components/menu-fb/views/storage/utils/storageProducts'

const suppliers = [
  { id: 's1', name: 'A', sites: ['sp1', 'sp2'] },
  { id: 's2', name: 'B', sites: ['sp2', 'sp1'] },
  { id: 's3', name: 'C', sites: ['sp3'] },
  { id: 's4', name: 'D', sites: [] },
]
const row = (id, itemName, supplierId, createdAt, extra = {}) => ({ id, itemName, supplierId, createdAt, ...extra })

describe('buildStorageProducts', () => {
  it('exclut le produit entier si une de ses lignes est utilisee en recette', () => {
    const rows = [row('1', 'Cola', 's1', '2026-01-01'), row('2', 'Cola', 's3', '2026-01-02'), row('3', 'Eau', 's1', '2026-01-01')]
    const cards = buildStorageProducts(rows, { suppliers, usedIds: ['2'] })
    expect(cards.map((c) => c.name)).toEqual(['Eau'])
    expect(usedItemNames(rows, ['2']).has('Cola')).toBe(true)
  })

  it('garde la ligne la plus recente quand les ensembles d espaces sont identiques', () => {
    const rows = [row('1', 'Cola', 's1', '2026-01-01'), row('2', 'Cola', 's2', '2026-03-01')]
    const cards = buildStorageProducts(rows, { suppliers })
    expect(cards).toHaveLength(1)
    expect(cards[0].marketPriceId).toBe('2')
  })

  it('fait une carte par ensemble d espaces different', () => {
    const rows = [row('1', 'Cola', 's1', '2026-01-01'), row('2', 'Cola', 's3', '2026-01-01')]
    const cards = buildStorageProducts(rows, { suppliers })
    expect(cards.map((c) => c.spaceIds.join(','))).toEqual(['sp1,sp2', 'sp3'])
  })

  it('produit sans espace : une carte sans pastille', () => {
    const cards = buildStorageProducts([row('1', 'Cola', 's4', '2026-01-01')], { suppliers })
    expect(cards).toHaveLength(1)
    expect(cards[0].spaceIds).toEqual([])
  })
})

describe('filterStorageProducts', () => {
  it('filtre par espace (nom) et recherche', () => {
    const cards = buildStorageProducts([row('1', 'Cola', 's1', '2026-01-01'), row('2', 'Eau', 's3', '2026-01-01')], { suppliers })
    const spaces = [{ id: 'sp1', name: 'Stade' }, { id: 'sp3', name: 'Parvis' }]
    const r = filterStorageProducts(cards, { spaceName: 'Parvis', allSpaces: 'Tous', spaces })
    expect(r.map((c) => c.name)).toEqual(['Eau'])
    expect(filterStorageProducts(cards, { search: 'col', spaces }).map((c) => c.name)).toEqual(['Cola'])
  })
})

describe('storageReference', () => {
  const { storageReference } = require('@/components/menu-fb/views/storage/utils/storageProducts')
  it('prefere la ref fournisseur, sinon le nom du produit', () => {
    expect(storageReference({ supplierItemName: 'REF-1' }, 'Cola')).toBe('REF-1')
    expect(storageReference(null, 'Cola')).toBe('Cola')
  })
  it('la carte porte la meme reference que celle passee au drawer', () => {
    const cards = buildStorageProducts([row('1', 'Cola', 's1', '2026-01-01', { supplierItem: 'REF-9' })], { suppliers })
    expect(cards[0].reference).toBe(storageReference({ supplierItemName: 'REF-9' }, 'Cola'))
  })
})
