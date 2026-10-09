import { buildSupplierIndex, supplierOptions, filterGroupsBySupplier, NO_SUPPLIER } from '@/utils/ventilationSuppliers'

const plan = {
  shoppingGroups: [
    { supplierId: 'sup-a', supplierName: 'Brasserie A', items: [{ itemName: 'Affligem blonde - 30L' }] },
    { supplierId: 'sup-b', supplierName: 'Grossiste B', items: [{ itemName: 'Chips Bret’s' }, { itemName: 'Affligem blonde - 30L' }] },
  ],
}
const marketPrices = [
  { itemName: 'Affligem blonde - 30L', supplierId: 'sup-z', supplier: 'Ignoré (la feuille fait foi)' },
  { itemName: 'Bonbons', supplier: 'Confiserie C' },
]
const groups = [{ itemName: 'Affligem blonde - 30L' }, { itemName: 'Chips Bret’s' }, { itemName: 'Bonbons' }, { itemName: 'Canari' }]

describe('ventilationSuppliers', () => {
  const index = buildSupplierIndex(plan, marketPrices)

  it('prend le fournisseur de la feuille, la fiche article en repli', () => {
    expect(index.get('affligem blonde - 30l').map((s) => s.name)).toEqual(['Brasserie A', 'Grossiste B'])
    expect(index.get('bonbons')).toEqual([{ id: 'name:confiserie c', name: 'Confiserie C' }])
  })

  it('options triées, « Sans fournisseur » en dernier', () => {
    expect(supplierOptions(groups, index)).toEqual([
      { value: 'sup-a', label: 'Brasserie A' },
      { value: 'name:confiserie c', label: 'Confiserie C' },
      { value: 'sup-b', label: 'Grossiste B' },
      { value: NO_SUPPLIER, label: null },
    ])
  })

  it('filtre par fournisseur (plusieurs fournisseurs par article) et sans fournisseur', () => {
    expect(filterGroupsBySupplier(groups, index, ['sup-b']).map((g) => g.itemName)).toEqual(['Affligem blonde - 30L', 'Chips Bret’s'])
    expect(filterGroupsBySupplier(groups, index, [NO_SUPPLIER]).map((g) => g.itemName)).toEqual(['Canari'])
    expect(filterGroupsBySupplier(groups, index, [])).toHaveLength(4)
  })

  it('fiche article avec seulement l’id : nom lu dans la liste des fournisseurs, jamais l’id brut', () => {
    const names = new Map([['cmsk4pbsz07oagnhhoxwgrqka', 'Socodis']])
    const idx = buildSupplierIndex(
      { shoppingGroups: [{ supplierId: '__finished__', supplierName: 'Sans fournisseur (ingrédients manquants)', items: [{ itemName: 'Canari' }] }] },
      [
        { itemName: 'Coca', supplierId: 'cmsk4pbsz07oagnhhoxwgrqka', supplier: null },
        { itemName: 'Eau', supplierId: 'cmsk5v5nn07srgnhhoyt9i4if', supplier: null },
        { itemName: 'Canari', supplierId: 'cmsk4pbsz07oagnhhoxwgrqka', supplier: null },
      ],
      names,
    )
    expect(idx.get('coca')).toEqual([{ id: 'cmsk4pbsz07oagnhhoxwgrqka', name: 'Socodis' }])
    // Id inconnu de la liste : sans fournisseur plutôt qu'un id à l'écran.
    expect(idx.get('eau')).toBeUndefined()
    // Groupe technique de la feuille : sans fournisseur, et la feuille fait foi sur la fiche.
    expect(idx.get('canari')).toBeUndefined()
    const opts = supplierOptions([{ itemName: 'Coca' }, { itemName: 'Eau' }, { itemName: 'Canari' }], idx)
    expect(opts).toEqual([{ value: 'cmsk4pbsz07oagnhhoxwgrqka', label: 'Socodis' }, { value: NO_SUPPLIER, label: null }])
  })

  describe('repli limité à la recette ou à l’espace (retour Bertrand 2026-10-09)', () => {
    const names = new Map([['loire', 'France boisson Loire'], ['idf', 'France boissons IDF'], ['soco', 'Socodis']])
    const cocaFiches = [
      { id: 'mp-loire', itemName: 'Coca-Cola Original - CAN 33CL', supplierId: 'loire' },
      { id: 'mp-idf', itemName: 'Coca-Cola Original - CAN 33CL', supplierId: 'idf' },
      { id: 'mp-soco', itemName: 'Coca-Cola Original - CAN 33CL', supplierId: 'soco' },
    ]

    it('prend la fiche exacte de la ligne (celle de la recette)', () => {
      const idx = buildSupplierIndex(null, cocaFiches, names, { lines: [{ itemKey: 'mp-loire|||Pc' }] })
      expect(idx.get('coca-cola original - can 33cl')).toEqual([{ id: 'loire', name: 'France boisson Loire' }])
    })

    it('sans fiche exacte : seulement les fournisseurs de l’espace', () => {
      const idx = buildSupplierIndex(null, cocaFiches, names, { lines: [{ itemKey: 'menu-item|||pcs' }], spaceSupplierIds: new Set(['loire']) })
      expect(idx.get('coca-cola original - can 33cl')).toEqual([{ id: 'loire', name: 'France boisson Loire' }])
    })

    it('aucun fournisseur de l’espace : article sans fournisseur', () => {
      const idx = buildSupplierIndex(null, cocaFiches, names, { spaceSupplierIds: new Set(['autre']) })
      expect(idx.get('coca-cola original - can 33cl')).toBeUndefined()
    })

    it('espace inconnu : toutes les fiches (comportement précédent)', () => {
      const idx = buildSupplierIndex(null, cocaFiches, names)
      expect(idx.get('coca-cola original - can 33cl').map((s) => s.name)).toEqual(['France boisson Loire', 'France boissons IDF', 'Socodis'])
    })
  })
})
