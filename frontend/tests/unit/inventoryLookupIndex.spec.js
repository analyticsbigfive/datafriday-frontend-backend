/**
 * Index du catalogue pour l'inventaire : chaque réponse doit être IDENTIQUE à l'ancien
 * parcours par `.find` / boucle (premier élément dans l'ordre du catalogue, égalité stricte).
 */
import { createMenuItemIndex } from '@/utils/inventoryLookupIndex'

const catalog = [
  { id: 'a', name: 'Bière', comboItem: 'No', components: [{ id: 'c1', name: 'Fût' }, { id: 'c2', name: 'Verre' }] },
  { id: 'b', name: 'Menu Bière', comboItem: 'Yes', components: [{ id: 'c1', name: 'Fût' }] },
  { id: 'a', name: 'Doublon id de a', comboItem: 'No', components: [{ id: 'c3', name: 'Verre' }] },
  { id: 'd', name: 'Bière', comboItem: 'Yes', components: [{ id: undefined, name: 'Sans id' }] },
  { id: undefined, name: undefined, comboItem: 'No', components: [{ name: 'Sans id' }, null] },
  { id: 'e', name: 'Sans composants', comboItem: 'No' },
  null,
  { id: 'f', name: 'Menu Bière', comboItem: 'Yes', components: [] },
]

// Anciennes implémentations, copiées telles quelles comme référence.
const oldFirstByIdOrName = (list, id, name) => list.find((mi) => mi && (mi.id === id || mi.name === name))
const oldFirstByName = (list, name) => list.find((mi) => mi && mi.name === name)
const oldFirstComboByName = (list, name) => list.find((mi) => mi && mi.name === name && mi.comboItem === 'Yes')
const oldWithComponentIdOrName = (list, id, name) =>
  list.filter((mi) => mi && mi.components && mi.components.find((c) => c && (c.id === id || c.name === name)))
const oldWithComponentNamed = (list, name) =>
  list.filter((mi) => mi && mi.components && mi.components.some((c) => c && c.name === name))

const ids = ['a', 'b', 'c1', 'd', 'e', 'f', 'zzz', undefined]
const names = ['Bière', 'Menu Bière', 'Fût', 'Verre', 'Sans id', 'Sans composants', 'inconnu', undefined]

describe('createMenuItemIndex', () => {
  const index = createMenuItemIndex(catalog)

  it('firstByIdOrName : même résultat que .find sur toutes les combinaisons', () => {
    for (const id of ids) {
      for (const name of names) {
        expect(index.firstByIdOrName(id, name)).toBe(oldFirstByIdOrName(catalog, id, name))
      }
    }
  })

  it('firstByName : même résultat que .find', () => {
    for (const name of names) expect(index.firstByName(name)).toBe(oldFirstByName(catalog, name))
  })

  it('firstComboByName : ne retient que les combos, le premier du catalogue', () => {
    for (const name of names) expect(index.firstComboByName(name)).toBe(oldFirstComboByName(catalog, name))
    expect(index.firstComboByName('Bière')).toBe(catalog[3])
    expect(index.firstComboByName('Menu Bière')).toBe(catalog[1])
  })

  it('withComponentIdOrName : menu items dans l\'ordre du catalogue, sans doublon', () => {
    for (const id of ids) {
      for (const name of names) {
        expect(index.withComponentIdOrName(id, name)).toEqual(oldWithComponentIdOrName(catalog, id, name))
      }
    }
  })

  it('withComponentNamed : même résultat que le filtre par nom de composant', () => {
    for (const name of names) {
      expect(index.withComponentNamed(name)).toEqual(oldWithComponentNamed(catalog, name))
    }
  })

  it('un menu item qui matche par id ET par nom n\'apparaît qu\'une fois', () => {
    const r = index.withComponentIdOrName('c1', 'Fût')
    expect(r).toEqual([catalog[0], catalog[1]])
  })

  it('catalogue absent ou vide : aucune réponse, aucune erreur', () => {
    for (const empty of [undefined, null, []]) {
      const i = createMenuItemIndex(empty)
      expect(i.firstByIdOrName('a', 'x')).toBeUndefined()
      expect(i.firstByName('x')).toBeUndefined()
      expect(i.firstComboByName('x')).toBeUndefined()
      expect(i.withComponentIdOrName('a', 'x')).toEqual([])
      expect(i.withComponentNamed('x')).toEqual([])
    }
  })

  it('contrôle négatif : l\'index suit le catalogue donné (pas de cache entre deux appels)', () => {
    const other = [{ id: 'z', name: 'Autre', components: [{ id: 'c9', name: 'Autre composant' }] }]
    const i2 = createMenuItemIndex(other)
    expect(i2.firstByName('Bière')).toBeUndefined()
    expect(i2.firstByName('Autre')).toBe(other[0])
    expect(index.firstByName('Autre')).toBeUndefined()
  })
})
