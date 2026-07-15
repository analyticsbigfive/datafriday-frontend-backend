import {
  computeMenuItemAvailability,
  supplierServesSpace,
  normalizeIngredientId,
} from '@/utils/menuItemAvailability'

const baseCtx = () => ({
  menuItems: [],
  components: [],
  ingredients: [
    { id: 'ing1', name: 'Tomate', marketPriceId: 'mp1' },
    { id: 'ing2', name: 'Sel' }, // pas de market price -> non sourcé
  ],
  marketPrices: [{ id: 'mp1', supplier_id: 'sup1' }],
  suppliers: [{ id: 'sup1', sites: [] }], // sites vides => tous les spaces
  spaceId: 'sp1',
})

describe('menuItemAvailability', () => {
  it('normalizeIngredientId retire le suffixe -0.xxx', () => {
    expect(normalizeIngredientId('ing-7-0.42')).toBe('ing-7')
    expect(normalizeIngredientId('ing-7')).toBe('ing-7')
  })

  it('supplierServesSpace : sites vides => true, sinon match', () => {
    expect(supplierServesSpace({ sites: [] }, 'sp1')).toBe(true)
    expect(supplierServesSpace({ sites: [{ spaceId: 'sp1' }] }, 'sp1')).toBe(true)
    expect(supplierServesSpace({ sites: ['other'] }, 'sp1')).toBe(false)
    expect(supplierServesSpace(null, 'sp1')).toBe(false)
  })

  it('manque un ingrédient non sourcé', () => {
    const item = {
      id: 'm1',
      name: 'Salade',
      components: [
        { id: 'ing1', name: 'Tomate', itemType: 'Ingredient' },
        { id: 'ing2', name: 'Sel', itemType: 'Ingredient' },
      ],
    }
    const res = computeMenuItemAvailability(item, baseCtx())
    expect(res.isAvailable).toBe(false)
    expect(res.missingIngredients).toEqual(['Sel'])
  })

  it('disponible quand tous les ingrédients sont sourcés', () => {
    const item = {
      id: 'm1',
      name: 'Tomate seule',
      components: [{ id: 'ing1', name: 'Tomate', itemType: 'Ingredient' }],
    }
    const res = computeMenuItemAvailability(item, baseCtx())
    expect(res.isAvailable).toBe(true)
    expect(res.missingIngredients).toEqual([])
  })

  it('récursif : un Component référençant un menu item hérite de ses manques', () => {
    const ctx = baseCtx()
    const sub = {
      id: 'sub1',
      name: 'Sauce',
      components: [{ id: 'ing2', name: 'Sel', itemType: 'Ingredient' }],
    }
    ctx.menuItems = [sub]
    const combo = {
      id: 'm2',
      name: 'Combo',
      components: [{ id: 'sub1', sourceId: 'sub1', name: 'Sauce', itemType: 'Component' }],
    }
    const res = computeMenuItemAvailability(combo, ctx)
    expect(res.isAvailable).toBe(false)
    expect(res.missingIngredients).toContain('Sel')
  })

  it('scope space : fournisseur ne desservant pas le space => ingrédient manquant', () => {
    const ctx = baseCtx()
    ctx.suppliers = [{ id: 'sup1', sites: [{ spaceId: 'autre-space' }] }]
    const item = {
      id: 'm1',
      name: 'Tomate seule',
      components: [{ id: 'ing1', name: 'Tomate', itemType: 'Ingredient' }],
    }
    const res = computeMenuItemAvailability(item, ctx)
    expect(res.isAvailable).toBe(false)
    expect(res.missingIngredients).toEqual(['Tomate'])
  })
})
