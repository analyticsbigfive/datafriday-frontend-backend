// Disponibilité d'un menu item (Règle composable #3 du spec).
//
// Un menu item est disponible si TOUS ses ingrédients ont un fournisseur sourcé
// (pour le space courant). Récursif sur les composants (Component -> menu item
// référencé OU ComponentDefinition.subComponents). Fonction pure, testable.
//
// Port JS de la logique de SpaceMenusPanel.checkMenuItemAvailability.

const MAX_DEPTH = 10

/** Retire le suffixe "-0.xxx" parfois ajouté aux ids d'ingrédient. */
export function normalizeIngredientId(id) {
  if (!id) return id
  const match = String(id).match(/^(.+?)-0\.\d+$/)
  return match ? match[1] : id
}

/** Un fournisseur dessert-il ce space ? (sites vides => tous les spaces). */
export function supplierServesSpace(supplier, spaceId) {
  if (!supplier) return false
  const sites = supplier.sites || supplier.spaces || []
  if (!sites.length) return true
  return sites.some((s) => (typeof s === 'string' ? s === spaceId : s && s.spaceId === spaceId))
}

/** Résout le supplier_id d'un ingrédient via son market price. */
export function resolveIngredientSupplierId(ingredientId, ingredientName, ctx) {
  const normalizedId = normalizeIngredientId(ingredientId)
  const ingredients = ctx.ingredients || []
  let ingredient = ingredients.find((i) => i.id === normalizedId)
  if (!ingredient && ingredientName) ingredient = ingredients.find((i) => i.name === ingredientName)
  if (!ingredient) return null
  if (ingredient.marketPriceId) {
    const mp = (ctx.marketPrices || []).find((m) => m.id === ingredient.marketPriceId)
    if (mp && mp.supplier_id) return mp.supplier_id
  }
  return null
}

/** Ingrédient sourcé = fournisseur résolu ET (pas de scope space OU dessert le space). */
function ingredientSourced(ingredientId, ingredientName, ctx) {
  const supplierId = resolveIngredientSupplierId(ingredientId, ingredientName, ctx)
  if (!supplierId) return false
  if (!ctx.spaceId) return true
  const supplier = (ctx.suppliers || []).find((s) => s.id === supplierId)
  return supplierServesSpace(supplier, ctx.spaceId)
}

function checkComponentDefinition(componentId, missingSet, ctx, depth) {
  if (depth > MAX_DEPTH) return
  const component = (ctx.components || []).find((c) => c.id === componentId)
  if (!component || !Array.isArray(component.subComponents)) return
  component.subComponents.forEach((subComp) => {
    if (subComp.itemType === 'Ingredient') {
      if (!ingredientSourced(subComp.id, subComp.name, ctx)) {
        const normalizedId = normalizeIngredientId(subComp.id)
        let ing = (ctx.ingredients || []).find((i) => i.id === normalizedId)
        if (!ing && subComp.name) ing = (ctx.ingredients || []).find((i) => i.name === subComp.name)
        missingSet.add(ing ? ing.name : subComp.name)
      }
    } else if (subComp.itemType === 'Component') {
      checkComponentDefinition(subComp.id, missingSet, ctx, depth + 1)
    }
  })
}

/**
 * @param {Object} menuItem
 * @param {Object} ctx { menuItems, components, ingredients, marketPrices, suppliers, spaceId }
 * @returns {{ isAvailable: boolean, missingIngredients: string[] }}
 */
export function computeMenuItemAvailability(menuItem, ctx = {}, depth = 0) {
  const missing = new Set()

  if (depth <= MAX_DEPTH && menuItem && Array.isArray(menuItem.components)) {
    for (const comp of menuItem.components) {
      const itemId = comp.sourceId || comp.id
      if (comp.itemType === 'Ingredient') {
        if (!ingredientSourced(itemId, comp.name, ctx)) missing.add(comp.name)
      } else if (comp.itemType === 'Component') {
        const referenced = (ctx.menuItems || []).find((mi) => mi.id === itemId)
        if (referenced) {
          const sub = computeMenuItemAvailability(referenced, ctx, depth + 1)
          ;(sub.missingIngredients || []).forEach((n) => missing.add(n))
        } else {
          checkComponentDefinition(itemId, missing, ctx, depth + 1)
        }
      }
    }
  }

  const missingIngredients = Array.from(missing)
  return { isAvailable: missingIngredients.length === 0, missingIngredients }
}
