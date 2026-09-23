import {
  INVENTORY_SCOPE_EVENT,
  INVENTORY_SCOPE_SPACE,
  rowsForScope,
  mergeConfigFloors,
  eventConfigElementIds,
} from '@/utils/inventoryScope'

describe("inventoryScope (« Voir tout l'inventaire »)", () => {
  const rows = [
    { id: 'shop-a', configId: 'cfg-concert', isOpen: false },
    { id: 'shop-a', configId: 'cfg-salon', isOpen: true },
    { id: 'shop-b', configId: 'cfg-concert', isOpen: true },
    { id: 'shop-c', _raw: { configId: 'cfg-salon' } },
  ]

  it("périmètre event : seules les lignes de la configuration de l'event", () => {
    expect(rowsForScope(rows, 'cfg-salon', INVENTORY_SCOPE_EVENT).map((r) => r.id)).toEqual(['shop-a', 'shop-c'])
  })

  it("périmètre espace : toutes les lignes, celles de l'event en tête (statut ouvert/fermé de l'event gardé)", () => {
    const out = rowsForScope(rows, 'cfg-salon', INVENTORY_SCOPE_SPACE)
    expect(out).toHaveLength(4)
    expect(out[0]).toEqual({ id: 'shop-a', configId: 'cfg-salon', isOpen: true })
    expect(out[1].id).toBe('shop-c')
  })

  it('fusion des plans : un élément partagé entre configurations une seule fois, étage vide écarté', () => {
    const merged = mergeConfigFloors([
      [{ name: 'RDC', elements: [{ id: 'st-1', type: 'storage' }, { id: 'shop-a', type: 'shop' }] }],
      [
        { name: 'RDC', elements: [{ id: 'shop-a', type: 'shop' }, { id: 'shop-z', type: 'shop' }] },
        { name: 'Sous-sol', elements: [{ id: 'st-1', type: 'storage' }] },
      ],
    ])
    expect(merged.map((f) => f.elements.map((e) => e.id))).toEqual([['st-1', 'shop-a'], ['shop-z']])
  })

  it("éléments de la config de l'event : rows scopées + plan de l'event", () => {
    const ids = eventConfigElementIds(rows, 'cfg-salon', [{ elements: [{ id: 'st-1', type: 'storage' }] }])
    expect([...ids].sort()).toEqual(['shop-a', 'shop-c', 'st-1'])
  })
})
