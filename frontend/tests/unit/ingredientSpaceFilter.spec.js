import {
  filterIngredientRowsBySpaces,
  isIngredientVisibleForSpaces,
  getRowSupplierSiteIds,
  normalizeSpaceIds,
} from '@/utils/ingredientSpaceFilter'

const row = (id, supplierSiteIds, supplier_id = 's1') => ({ id, supplier_id, supplierSiteIds })

describe('ingredientSpaceFilter', () => {
  it('sans espace sur la fiche, aucun filtre', () => {
    const rows = [row('a', ['x']), row('b', [])]
    expect(filterIngredientRowsBySpaces(rows, [])).toEqual(rows)
    expect(filterIngredientRowsBySpaces(rows, undefined)).toEqual(rows)
  })

  it('fournisseur sites vide : visible partout', () => {
    expect(isIngredientVisibleForSpaces(row('a', []), ['x'])).toBe(true)
  })

  it('fournisseur dont les sites croisent un espace de la fiche : visible', () => {
    expect(isIngredientVisibleForSpaces(row('a', ['x', 'y']), ['y', 'z'])).toBe(true)
  })

  it('fournisseur sans croisement : masque', () => {
    expect(isIngredientVisibleForSpaces(row('a', ['x']), ['y'])).toBe(false)
  })

  it('ingredient sans fournisseur : masque si la fiche a un espace', () => {
    expect(isIngredientVisibleForSpaces({ id: 'a', supplierSiteIds: [] }, ['y'])).toBe(false)
  })

  it('ingredient sans fournisseur : visible si la fiche n a aucun espace', () => {
    expect(isIngredientVisibleForSpaces({ id: 'a', supplierSiteIds: [] }, [])).toBe(true)
  })

  it('accepte des espaces sous forme d objets et compare en chaine', () => {
    expect(normalizeSpaceIds([{ id: 1 }, '2', null])).toEqual(['1', '2'])
    expect(isIngredientVisibleForSpaces(row('a', ['1']), [{ id: 1 }])).toBe(true)
  })

  it('filtre une liste', () => {
    const rows = [row('a', ['x']), row('b', ['y']), row('c', [])]
    expect(filterIngredientRowsBySpaces(rows, ['x']).map((r) => r.id)).toEqual(['a', 'c'])
  })

  it('extrait les sites depuis supplierRel', () => {
    expect(getRowSupplierSiteIds({ supplierRel: { sites: ['x', 'y'] } })).toEqual(['x', 'y'])
    expect(getRowSupplierSiteIds({})).toEqual([])
  })
})
