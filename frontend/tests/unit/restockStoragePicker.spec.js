import { pickerProducts } from '@/utils/restockStoragePicker'

describe('restockStoragePicker', () => {
  const cards = [
    { name: 'Coca', marketPriceId: '', reference: 'Coca', type: 'Boisson', category: 'Soft' },
    { name: 'coca', marketPriceId: 'mp1', reference: 'COC-33', type: 'Boisson', category: 'Soft' },
    { name: 'Bière blonde', marketPriceId: 'mp2', reference: 'Bière blonde', category: 'Bière' },
    { name: '  ', marketPriceId: 'x' },
  ]

  it('une entrée par nom, préfère la carte avec marketPriceId, trie par nom, ignore les noms vides', () => {
    const out = pickerProducts(cards)
    expect(out.map((p) => p.name)).toEqual(['Bière blonde', 'Coca'])
    expect(out[1].marketPriceId).toBe('mp1')
    expect(out[1].reference).toBe('COC-33')
  })

  it('entrée vide ou absente', () => {
    expect(pickerProducts(null)).toEqual([])
    expect(pickerProducts([])).toEqual([])
  })
})

describe('cardsForSpace', () => {
  const { cardsForSpace } = require('@/utils/restockStoragePicker')
  const cards = [
    { name: 'Heineken', spaceIds: ['bj'] },
    { name: 'Kronenbourg', spaceIds: ['paris'] },
    { name: 'Gobelet', spaceIds: [] },
  ]
  it("garde les produits de l'espace et ceux sans espace", () => {
    expect(cardsForSpace(cards, 'bj').map((c) => c.name)).toEqual(['Heineken', 'Gobelet'])
  })
  it('sans espace demandé : tout', () => {
    expect(cardsForSpace(cards, '')).toHaveLength(3)
  })
})
