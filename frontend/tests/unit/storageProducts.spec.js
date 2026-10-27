import { buildStorageProducts, usedItemNames, filterStorageProducts } from '@/components/menu-fb/views/storage/utils/storageProducts'

const suppliers = [
  { id: 's1', name: 'A', sites: ['sp1', 'sp2'] },
  { id: 's2', name: 'B', sites: ['sp2', 'sp1'] },
  { id: 's3', name: 'C', sites: ['sp3'] },
  { id: 's4', name: 'D', sites: [] },
]
const row = (id, itemName, supplierId, createdAt, extra = {}) => ({ id, itemName, supplierId, createdAt, ...extra })

describe('buildStorageProducts', () => {
  it('une ligne en recette n apparait jamais ; un produit sans ligne en recette est inchange', () => {
    const rows = [row('1', 'Cola', 's1', '2026-01-01'), row('2', 'Cola', 's3', '2026-01-02'), row('3', 'Eau', 's1', '2026-01-01')]
    const cards = buildStorageProducts(rows, { suppliers, usedIds: ['2'] })
    expect(cards.map((c) => `${c.name}:${c.marketPriceId}`)).toEqual(['Cola:1', 'Eau:3'])
    expect(cards.find((c) => c.name === 'Eau').spaceIds).toEqual(['sp1', 'sp2'])
    expect(usedItemNames(rows, ['2']).has('Cola')).toBe(true)
  })

  it('A en recette sur un espace, B hors recette sur le meme espace : B absent', () => {
    const rows = [row('1', 'Cola', 's3', '2026-01-01'), row('2', 'Cola', 's3', '2026-01-02')]
    expect(buildStorageProducts(rows, { suppliers, usedIds: ['1'] })).toEqual([])
  })

  it('B sur un autre espace : B present', () => {
    const rows = [row('1', 'Cola', 's3', '2026-01-01'), row('2', 'Cola', 's1', '2026-01-02')]
    const cards = buildStorageProducts(rows, { suppliers, usedIds: ['1'] })
    expect(cards).toHaveLength(1)
    expect(cards[0].spaceIds).toEqual(['sp1', 'sp2'])
  })

  it('B sur deux espaces dont un couvert par la recette : B garde l espace restant seul', () => {
    const rows = [row('1', 'Cola', 's3', '2026-01-01'), row('2', 'Cola', 's1', '2026-01-02')]
    const sup = [...suppliers, { id: 's5', name: 'E', sites: ['sp3', 'sp9'] }]
    const cards = buildStorageProducts([rows[0], row('2', 'Cola', 's5', '2026-01-02')], { suppliers: sup, usedIds: ['1'] })
    expect(cards).toHaveLength(1)
    expect(cards[0].spaceIds).toEqual(['sp9'])
  })

  it('ligne hors recette sans espace : retiree si le produit a une ligne en recette, sinon gardee', () => {
    const rows = [row('1', 'Cola', 's1', '2026-01-01'), row('2', 'Cola', 's4', '2026-01-02')]
    expect(buildStorageProducts(rows, { suppliers, usedIds: ['1'] })).toEqual([])
    const sans = buildStorageProducts(rows, { suppliers })
    expect(sans.map((c) => c.marketPriceId).sort()).toEqual(['1', '2'])
  })

  it('le dedoublonnage s applique apres la soustraction', () => {
    const sup = [
      { id: 'a', sites: ['sp1'] }, { id: 'b', sites: ['sp1', 'sp2'] }, { id: 'c', sites: ['sp2'] },
    ]
    const rows = [
      row('1', 'Cola', 'a', '2026-01-01'),
      row('2', 'Cola', 'b', '2026-01-02'),
      row('3', 'Cola', 'c', '2026-03-01'),
    ]
    const cards = buildStorageProducts(rows, { suppliers: sup, usedIds: ['1'] })
    expect(cards).toHaveLength(1)
    expect(cards[0].marketPriceId).toBe('3')
    expect(cards[0].spaceIds).toEqual(['sp2'])
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
