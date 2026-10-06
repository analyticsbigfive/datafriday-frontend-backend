import { itemsOfCard, compareInventoryCards } from '@/utils/inventoryCardSort'

const card = (name, items, id = name) => ({
  element: { id, name },
  consolidatedInventory: items,
})
const item = (id, name = id) => ({ id, name })

describe('inventoryCardSort', () => {
  describe('itemsOfCard', () => {
    it('accepte les trois formes de carte (shops / storage / merch)', () => {
      expect(itemsOfCard({ consolidatedInventory: [item('a')] })).toHaveLength(1)
      expect(itemsOfCard({ storageInventory: [item('a'), item('b')] })).toHaveLength(2)
      expect(itemsOfCard({ merchInventory: [item('a')] })).toHaveLength(1)
      expect(itemsOfCard({})).toEqual([])
      expect(itemsOfCard(null)).toEqual([])
    })
  })

  describe('compareInventoryCards', () => {
    const sort = (cards) => [...cards].sort(compareInventoryCards)

    it('cartes vides toujours en dernier', () => {
      const vide = card('Aaa vide', [])
      const pleine = card('Zzz pleine', [item('a')])
      expect(sort([vide, pleine]).map((c) => c.element.name)).toEqual(['Zzz pleine', 'Aaa vide'])
    })

    it('ordre alphabétique insensible à la casse et aux accents (fr)', () => {
      const cards = [card('École', [item('x')]), card('avion', [item('x')]), card('Zoo', [item('x')])]
      expect(sort(cards).map((c) => c.element.name)).toEqual(['avion', 'École', 'Zoo'])
    })

    it("l'avancement du comptage ne change pas l'ordre", () => {
      const bloc24 = card('Bloc 24', [item('x')])
      const bloc22 = card('Bloc 22', [item('x'), item('y'), item('z')])
      const bloc23 = card('Bloc 23', [item('x'), item('y')])
      expect(sort([bloc24, bloc22, bloc23]).map((c) => c.element.name)).toEqual([
        'Bloc 22',
        'Bloc 23',
        'Bloc 24',
      ])
    })
  })
})
