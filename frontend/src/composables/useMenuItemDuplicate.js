import { getMenuItemById, createMenuItem } from '@/api/endpoints/menu-item.api'

/**
 * Duplication d'un menu item — approche 100 % frontend : on relit l'item source
 * (getMenuItemById, qui renvoie déjà toute la recette : ingrédients, composants,
 * packagings, comboChildren, prix par espace, image), on reconstruit un payload de
 * CRÉATION (même contrat que `createMenuItem`) avec un nom suffixé « (copie) », puis
 * on POST. Aucun endpoint backend dédié n'est nécessaire.
 */

const num = (v, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

/** Reconstruit un payload createMenuItem à partir d'un menu item renvoyé par l'API. */
export function buildDuplicatePayload(mi, { suffix = ' (copie)' } = {}) {
  const pieces = Math.max(num(mi?.numberOfPiecesRecipe, 1), 1)
  const totalCost = num(mi?.totalCost, 0)
  const costPerPiece = mi?.costPerPiece != null ? num(mi.costPerPiece, 0) : totalCost / pieces
  const basePrice = num(mi?.basePrice, 0)
  // Marge indicative (le backend recalcule les coûts) — gère les prix négatifs.
  const margin = basePrice !== 0 ? ((basePrice - costPerPiece) / basePrice) * 100 : 0

  return {
    name: `${String(mi?.name || '').trim()}${suffix}`,
    typeId: mi?.typeId || null,
    categoryId: mi?.categoryId || null,
    basePrice,
    vatRate: mi?.vatRate != null && mi?.vatRate !== '' ? num(mi.vatRate) : null,
    discountType: (mi?.discountType && mi.discountType !== 'none') ? mi.discountType : null,
    discountValue: num(mi?.discountValue, 0),
    totalCost,
    margin,
    description: String(mi?.description || '').trim(),
    allergens: Array.isArray(mi?.allergens) ? mi.allergens : [],
    diet: Array.isArray(mi?.diet) ? mi.diet : [],
    storageType: Array.isArray(mi?.storageType) ? mi.storageType : [],
    readyForSale: String(mi?.readyForSale || 'No').trim(),
    kitchenType: mi?.readyForSale === 'Yes' ? (mi?.kitchenType || null) : null,
    comboItem: String(mi?.comboItem || 'No').trim(),
    numberOfPiecesRecipe: num(mi?.numberOfPiecesRecipe, 1) || 1,
    inventoryPackagingType: mi?.inventoryPackagingType || null,
    inventoryNumberOfUnits: num(mi?.inventoryNumberOfUnits, 1) || 1,
    inventoryUnit: mi?.inventoryUnit || null,
    spaceIds: Array.isArray(mi?.spaceIds) ? mi.spaceIds : [],
    spacePrices: mi?.spacePrices || {},
    brandId: mi?.brandId || mi?.brand?.id || null,
    displayNameId: mi?.displayNameId || mi?.displayName?.id || null,
    componentsData: {},
    picture: mi?.picture || mi?.imageUrl || mi?.image || '',
    ingredients: (mi?.ingredients || [])
      .map((i) => ({
        ingredientId: String(i?.ingredientId || i?.ingredient_id || '').trim(),
        numberOfUnits: Math.max(0, num(i?.numberOfUnits, 0)),
      }))
      .filter((x) => x.ingredientId),
    components: (mi?.components || [])
      .map((c) => ({
        componentId: String(c?.componentId || '').trim(),
        numberOfUnits: Math.max(0, num(c?.numberOfUnits, 0)),
      }))
      .filter((x) => x.componentId),
    packagings: (mi?.packagings || [])
      .map((p) => ({
        packagingId: String(p?.packagingId || '').trim(),
        numberOfUnits: Math.max(0, num(p?.numberOfUnits, 0)),
      }))
      .filter((x) => x.packagingId),
    comboItems: (mi?.comboChildren || [])
      .map((cc) => ({
        childId: String(cc?.childId || cc?.child?.id || '').trim(),
        quantity: Math.max(0, num(cc?.quantity, 1)),
      }))
      .filter((x) => x.childId),
  }
}

/** Duplique un menu item par son id : GET données complètes → build payload → POST create. */
export async function duplicateMenuItemById(id, options = {}) {
  const res = await getMenuItemById(id)
  const mi = res?.data || res
  if (!mi) throw new Error('Menu item introuvable')
  const payload = buildDuplicatePayload(mi, options)
  const created = await createMenuItem(payload)
  return created?.data || created
}
