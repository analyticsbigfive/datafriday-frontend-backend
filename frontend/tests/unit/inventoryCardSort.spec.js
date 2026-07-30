import {
  itemsOfCard,
  cardStockScore,
  cardToCountScore,
  compareInventoryCards,
} from '@/utils/inventoryCardSort'

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

  describe('cardStockScore', () => {
    it("coalesce ARTICLE par ARTICLE : l'indice quand il existe, le compté sinon", () => {
      const c = card('Buvette', [item('a'), item('b')])
      const score = cardStockScore(c, {
        expectedUnitsFor: (_el, it) => (it.id === 'a' ? 10 : null),
        countedUnitsFor: () => 3,
      })
      // a → indice 10 ; b → pas d'indice, on retombe sur le compté 3.
      expect(score).toBe(13)
    })

    it('sans aucun indice : score = somme des unités comptées', () => {
      const c = card('Buvette', [item('a'), item('b')])
      expect(cardStockScore(c, { expectedUnitsFor: () => null, countedUnitsFor: () => 4 })).toBe(8)
    })

    it('un indice négatif compte pour ce qu\'il vaut (il ne disparaît pas)', () => {
      const c = card('Buvette', [item('a')])
      expect(cardStockScore(c, { expectedUnitsFor: () => -5, countedUnitsFor: () => 0 })).toBe(-5)
    })
  })

  describe('cardToCountScore', () => {
    it('compte les articles non comptés', () => {
      const c = card('Buvette', [item('a'), item('b'), item('c')])
      const isItemCounted = (_el, id) => id === 'a'
      expect(cardToCountScore(c, { isItemCounted })).toBe(2)
    })
  })

  describe('compareInventoryCards', () => {
    const sort = (cards, opts) => [...cards].sort((a, b) => compareInventoryCards(a, b, opts))

    it('cartes vides toujours en dernier, quel que soit le mode', () => {
      const vide = card('Aaa vide', [])
      const pleine = card('Zzz pleine', [item('a')])
      for (const mode of ['name', 'to-count', 'stock-asc']) {
        expect(sort([vide, pleine], { mode }).map((c) => c.element.name)).toEqual([
          'Zzz pleine',
          'Aaa vide',
        ])
      }
    })

    it('stock-asc ordonne par indice croissant', () => {
      const a = card('A', [item('x')])
      const b = card('B', [item('x')])
      const c = card('C', [item('x')])
      const expectedUnitsFor = (elementId) => ({ A: 30, B: 5, C: 12 })[elementId]
      expect(
        sort([a, b, c], { mode: 'stock-asc', expectedUnitsFor, countedUnitsFor: () => 0 }).map(
          (x) => x.element.name,
        ),
      ).toEqual(['B', 'C', 'A'])
    })

    it('stock-asc retombe sur le compté quand aucun indice n\'est disponible', () => {
      const a = card('A', [item('x')])
      const b = card('B', [item('x')])
      const countedUnitsFor = (elementId) => ({ A: 9, B: 2 })[elementId]
      expect(
        sort([a, b], { mode: 'stock-asc', expectedUnitsFor: () => null, countedUnitsFor }).map(
          (x) => x.element.name,
        ),
      ).toEqual(['B', 'A'])
    })

    it('to-count ordonne par nombre de non-comptés décroissant', () => {
      const a = card('A', [item('x'), item('y')])
      const b = card('B', [item('x'), item('y'), item('z')])
      expect(
        sort([a, b], { mode: 'to-count', isItemCounted: () => false }).map((x) => x.element.name),
      ).toEqual(['B', 'A'])
    })

    it('scores égaux : départage par NOM, pas par ordre source (la chip reste déterministe)', () => {
      // Cas de l'onglet « Comptés » : tout vaut 0. Avant, le tri stable rendait
      // l'ordre d'insertion de l'API — la chip semblait sans effet.
      const zebre = card('Zèbre', [item('x')])
      const alpha = card('Alpha', [item('x')])
      const accessors = { expectedUnitsFor: () => 0, countedUnitsFor: () => 0, isItemCounted: () => true }
      expect(sort([zebre, alpha], { mode: 'to-count', ...accessors }).map((c) => c.element.name)).toEqual([
        'Alpha',
        'Zèbre',
      ])
      expect(sort([zebre, alpha], { mode: 'stock-asc', ...accessors }).map((c) => c.element.name)).toEqual([
        'Alpha',
        'Zèbre',
      ])
    })

    it('mode name : comparaison insensible à la casse et aux accents (fr)', () => {
      const cards = [card('École', [item('x')]), card('avion', [item('x')]), card('Zoo', [item('x')])]
      expect(sort(cards, { mode: 'name' }).map((c) => c.element.name)).toEqual(['avion', 'École', 'Zoo'])
    })
  })
})
