import { ventilationExportTable, stockExportTable } from '@/utils/logisticExportTables'
import { tableToMatrix, exportFileName, tableToPrintHtml } from '@/utils/tableExport'

const t = (k) => k
const quantityLabel = (item, q, packs) => (packs != null ? `${packs} colis` : `${q} ${item.unit}`)
const packSizeLabel = (item) => `${item.unitsPerPack} ${item.unit}/colis`
const suppliersOf = (name) => (name === 'Bonbons' ? [{ name: 'Confiserie C' }] : [])

const groups = [
  {
    itemKey: 'bonbons', itemName: 'Bonbons', unit: 'Pc', packagingType: 'Carton', unitsPerPack: 30,
    rows: [
      { rowKey: 'a', elementType: 'shop', shopId: 's1', shopName: 'Océane 11', quantity: 60, packs: 2 },
      { rowKey: 'b', elementType: 'storage', shopId: 'd1', shopName: 'Dépôt 1', quantity: 30, packs: 1 },
    ],
  },
]
const storages = [{ id: 'd1', name: 'Dépôt 1' }, { id: 'd2', name: 'Dépôt 2' }]

describe('ventilationExportTable', () => {
  it('par article : une ligne par destination avec quelque chose à déposer (stockage vide exclu)', () => {
    const table = ventilationExportTable({ groups, storages, mode: 'item', t, quantityLabel, packSizeLabel, suppliersOf, title: 'V' })
    expect(table.columns.map((c) => c.key).slice(0, 3)).toEqual(['item', 'destination', 'type'])
    expect(table.rows.map((r) => [r.item, r.destination, r.type, r.toDeposit, r.supplier])).toEqual([
      ['Bonbons', 'Océane 11', 'logiExportShop', '2 colis', 'Confiserie C'],
      ['Bonbons', 'Dépôt 1', 'logiTabStorage', '1 colis', 'Confiserie C'],
    ])
  })

  it('par PdV : destination en premier', () => {
    const table = ventilationExportTable({ groups, storages, mode: 'shop', t, quantityLabel, packSizeLabel, suppliersOf, title: 'V' })
    expect(table.columns.map((c) => c.key).slice(0, 3)).toEqual(['destination', 'type', 'item'])
    expect(table.rows.map((r) => r.destination)).toEqual(['Océane 11', 'Dépôt 1'])
  })
})

describe('stockExportTable', () => {
  it('une ligne par élément × article, tri par article en By Item', () => {
    const entries = [
      { element: { id: 'e1', name: 'Loire 14' }, items: [{ name: 'Chips', unit: 'Pc' }, { name: 'Bière', unit: 'L' }] },
    ]
    const table = stockExportTable({
      entries,
      byItem: true,
      itemsFor: (e) => e.items,
      expectedFor: (id, item) => (item.name === 'Chips' ? { packed: 0, loose: 0 } : { packed: 2, loose: 5 }),
      statusFor: (id, item) => (item.name === 'Chips' ? 'bad' : 'ok'),
      t,
      title: 'S',
    })
    expect(table.rows.map((r) => [r.item, r.status, r.packed])).toEqual([
      ['Bière', 'logiExportStatusOk', 2],
      ['Chips', 'logiRowRuptures', 0],
    ])
    expect(table.columns.some((c) => c.key === 'toDeposit')).toBe(false)
  })
})

describe('tableExport', () => {
  it('matrice avec en-tête, nom de fichier sans accents, HTML échappé', () => {
    const table = { title: 'Ventilation <x>', columns: [{ key: 'a', label: 'A' }], rows: [{ a: null }, { a: 3 }] }
    expect(tableToMatrix(table)).toEqual([['A'], [''], [3]])
    expect(exportFileName('Logistique Ventilation é', new Date('2026-10-09T10:00:00Z'))).toBe('logistique-ventilation-e-2026-10-09')
    expect(tableToPrintHtml(table)).toContain('Ventilation &lt;x&gt;')
  })
})
