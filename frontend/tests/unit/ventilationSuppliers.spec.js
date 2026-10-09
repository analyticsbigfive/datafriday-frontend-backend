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

  describe('filtre ligne par ligne (retour Bertrand 2026-10-09 : Coca Cherry sous IDF partout)', () => {
    const plan = {
      shoppingGroups: [
        { supplierId: 'loire', supplierName: 'France boisson Loire', items: [{ itemName: 'Coca-Cola Cherry - CAN 33CL', shopNames: ['Erdre 4', 'Erdre 6'] }] },
        { supplierId: 'idf', supplierName: 'France boissons IDF', items: [{ itemName: 'Coca-Cola Cherry - CAN 33CL', shopNames: ['Conteneur stockage Océanne'] }] },
      ],
    }
    const idx = buildSupplierIndex(plan, [])
    const group = {
      itemName: 'Coca-Cola Cherry - CAN 33CL',
      rows: [
        { shopName: 'Erdre 4', quantity: 96, packs: 4 },
        { shopName: 'Erdre 6', quantity: 72, packs: 3 },
        { shopName: 'Conteneur stockage Océanne', elementType: 'storage', quantity: 4488, packs: 187 },
      ],
      totalQuantity: 4656,
      totalPacks: 194,
    }

    it('sous un fournisseur, seules ses destinations, totaux recalculés', () => {
      const [idf] = filterGroupsBySupplier([group], idx, ['idf'])
      expect(idf.rows.map((r) => r.shopName)).toEqual(['Conteneur stockage Océanne'])
      expect(idf.totalPacks).toBe(187)
      const [loire] = filterGroupsBySupplier([group], idx, ['loire'])
      expect(loire.rows.map((r) => r.shopName)).toEqual(['Erdre 4', 'Erdre 6'])
      expect(loire.totalQuantity).toBe(168)
      expect(loire.totalPacks).toBe(7)
    })

    it('les deux fournisseurs choisis : le groupe entier, inchangé', () => {
      expect(filterGroupsBySupplier([group], idx, ['idf', 'loire'])[0]).toBe(group)
    })

    it('destination absente des achats : tous les fournisseurs de l’article', () => {
      const other = { ...group, rows: [{ shopName: 'Prési 1', quantity: 24, packs: 1 }] }
      expect(filterGroupsBySupplier([other], idx, ['idf'])).toHaveLength(1)
      expect(filterGroupsBySupplier([other], idx, ['loire'])).toHaveLength(1)
    })
  })
})
