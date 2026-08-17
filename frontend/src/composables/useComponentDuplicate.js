import { getMenuComponent, createMenuComponent } from '@/api/endpoints/menu.api'

/**
 * Duplication d'un composant — même approche 100 % frontend que useMenuItemDuplicate.js :
 * on relit le composant source (getMenuComponent, qui renvoie déjà ingrédients et
 * sous-composants), on reconstruit un payload de CRÉATION (même contrat que
 * `createMenuComponent`, cf. ComponentCreateView.vue#onCreate) avec un nom suffixé
 * « (copie) », puis on POST. Aucun endpoint backend dédié n'est nécessaire.
 */

const num = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

/** Reconstruit un payload createMenuComponent à partir d'un composant renvoyé par l'API. */
export function buildComponentDuplicatePayload(mc, { suffix = ' (copie)' } = {}) {
  return {
    name: `${String(mc?.name || '').trim()}${suffix}`,
    unit: String(mc?.unit || '').trim(),
    category: String(mc?.category || '').trim(),
    unitCost: num(mc?.unitCost, 0),
    allergens: Array.isArray(mc?.allergens) ? mc.allergens.map((a) => String(a || '').trim()).filter(Boolean) : [],
    description: String(mc?.description || '').trim(),
    storageType: String(mc?.storageType || '').trim(),
    readyForSale: String(mc?.readyForSale || 'No').trim(),
    kitchenType: mc?.readyForSale === 'Yes' ? (mc?.kitchenType || null) : null,
    componentCategory: String(mc?.componentCategory || mc?.type || '').trim(),
    numberOfUnitsRecipe: num(mc?.numberOfUnitsRecipe, 1) || 1,
    componentTypeId: mc?.componentTypeId || undefined,
    componentCategoryId: mc?.componentCategoryId || undefined,
    inventoryPackaging: mc?.inventoryPackaging || undefined,
    packedUnits: num(mc?.packedUnits, 0),
    ingredients: (mc?.ingredients || [])
      .map((i) => ({
        ingredientId: String(i?.ingredientId || i?.ingredient_id || '').trim(),
        quantity: Math.max(0, num(i?.quantity ?? i?.numberOfUnits, 0)),
        unit: String(i?.unit ?? i?.recipeUnit ?? '').trim(),
        unitCost: num(i?.unitCost ?? i?.costPerRecipeUnit, 0),
        cost: num(i?.cost ?? i?.totalCost, 0),
      }))
      .filter((x) => x.ingredientId),
    children: (mc?.children || [])
      .map((c) => ({
        childId: String(c?.componentId || c?.childId || c?.id || '').trim(),
        quantity: Math.max(0, num(c?.numberOfUnits ?? c?.quantity, 0)),
        unit: c?.unit ? String(c.unit).trim() : undefined,
      }))
      .filter((x) => x.childId),
  }
}

/** Duplique un composant par son id : GET données complètes → build payload → POST create. */
export async function duplicateComponentById(id, options = {}) {
  const res = await getMenuComponent(id)
  const mc = res?.data || res
  if (!mc) throw new Error('Component introuvable')
  const payload = buildComponentDuplicatePayload(mc, options)
  const created = await createMenuComponent(payload)
  return created?.data || created
}
