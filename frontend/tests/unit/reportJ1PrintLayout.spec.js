import { chipGrid, barsTopN, paginateWithMore, layoutItemsByShop } from '@/utils/reportJ1Page2Tables'

describe('chipGrid', () => {
  it('8 pastilles en 4 + 4 sur une case large', () => {
    expect(chipGrid(8, 742)).toEqual({ cols: 4, rows: 2 })
  })
  it('5 pastilles sur une seule ligne si la place le permet', () => {
    expect(chipGrid(5, 742)).toEqual({ cols: 5, rows: 1 })
  })
  it('case étroite : plus de lignes', () => {
    expect(chipGrid(5, 366)).toEqual({ cols: 2, rows: 3 })
  })
  it('zéro pastille', () => {
    expect(chipGrid(0, 700)).toEqual({ cols: 0, rows: 0 })
  })
})

describe('barsTopN', () => {
  const bars = [{ label: 'a', value: 5 }, { label: 'b', value: 50 }, { label: 'c', value: 20 }, { label: 'd', value: 10 }, { label: 'z', value: 0 }]
  it('trie et cumule le reste en Autres', () => {
    const out = barsTopN(bars, 3, { othersLabel: 'Autres' })
    expect(out.map((b) => b.label)).toEqual(['b', 'c', 'Autres'])
    expect(out[2].value).toBe(15)
    expect(out[2].isOthers).toBe(true)
  })
  it('tout garder si ça tient, sans les valeurs nulles', () => {
    expect(barsTopN(bars, 10)).toHaveLength(4)
  })
})

describe('paginateWithMore', () => {
  it('réserve une ligne pour + X autres', () => {
    expect(paginateWithMore([1, 2, 3, 4, 5], 3)).toEqual({ shown: [1, 2], hiddenCount: 3 })
  })
  it('rien de caché si ça tient', () => {
    expect(paginateWithMore([1, 2, 3], 3)).toEqual({ shown: [1, 2, 3], hiddenCount: 0 })
  })
})

describe('layoutItemsByShop', () => {
  const shops = [
    { shop: 'A', total: 30, items: [{ name: 'x', qty: 2, revenue: 10 }, { name: 'y', qty: 3, revenue: 20 }] },
    { shop: 'B', total: 5, items: [{ name: 'z', qty: 1, revenue: 5 }] },
    { shop: 'C', total: 1, items: [] },
  ]
  it('aplatit PdV puis articles et ignore les PdV vides', () => {
    const { columns, hiddenItems } = layoutItemsByShop(shops, 10, 1)
    expect(columns[0].map((r) => r.type)).toEqual(['shop', 'item', 'item', 'shop', 'item'])
    expect(columns[0][0].qty).toBe(5)
    expect(hiddenItems).toBe(0)
  })
  it('déborde sur la 2e colonne sans en-tête orphelin', () => {
    const { columns, hiddenItems } = layoutItemsByShop(shops, 4, 2)
    expect(columns[0].map((r) => r.type)).toEqual(['shop', 'item', 'item'])
    expect(columns[1].map((r) => r.type)).toEqual(['shop', 'item'])
    expect(hiddenItems).toBe(0)
  })
  it('libère la dernière ligne pour + X autres', () => {
    const { columns, hiddenItems } = layoutItemsByShop(shops, 3, 1)
    expect(columns[0].map((r) => r.type)).toEqual(['shop', 'item'])
    expect(hiddenItems).toBe(2)
    expect(columns[0].length).toBeLessThan(3)
  })
  it('capacité nulle : tout est masqué', () => {
    expect(layoutItemsByShop(shops, 1, 2)).toEqual({ columns: [[]], hiddenItems: 3 })
  })
})
