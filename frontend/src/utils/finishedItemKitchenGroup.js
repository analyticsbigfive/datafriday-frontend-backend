// Feuille de course, onglet « Produits finis » : un article sans fournisseur
// qui est fabriqué en cuisine (composant, ou Menu Item « Ready for sale = Yes »)
// se commande auprès de sa cuisine, pas chez un fournisseur.
//
// Pur et testable sans monter SpaceRestockView. La cuisine se résout comme pour
// l'onglet « Composants par cuisine » (resolveComponentKitchen).

import {
  resolveComponentKitchen,
  KITCHEN_KIND_LOCAL,
  KITCHEN_KIND_CENTRAL,
} from '@/utils/componentKitchenOrders'

/** Article fabriqué en cuisine : composant, ou Menu Item prêt à la vente. */
export function isKitchenMade(reference, isComponent) {
  if (!reference) return false
  return !!isComponent || reference.readyForSale === 'Yes'
}

/**
 * Groupe « cuisine » d'un article fabriqué en cuisine, à la forme d'un groupe
 * fournisseur de l'étape 3, ou null si l'article n'est pas fabriqué en cuisine.
 * Cuisine locale et cuisine non définie n'ont pas de fiche : coordonnées vides.
 *
 * @param {object} reference  fiche de l'article (composant ou Menu Item)
 * @param {boolean} isComponent
 * @param {Array} kitchens    cuisines de Settings
 * @param {{ local: string, undefined: string }} labels
 */
export function resolveKitchenGroup(reference, isComponent, kitchens = [], labels = {}) {
  if (!isKitchenMade(reference, isComponent)) return null
  const kitchen = resolveComponentKitchen(reference, kitchens)
  if (kitchen.kind === KITCHEN_KIND_LOCAL) {
    return { supplierId: '__kitchen_local__', supplierName: labels.local || '', supplierEmail: '', supplierPhone: '' }
  }
  if (kitchen.kind === KITCHEN_KIND_CENTRAL) {
    const card = kitchen.id != null ? (kitchens || []).find((k) => String(k?.id) === String(kitchen.id)) : null
    return {
      supplierId: `__kitchen_${kitchen.id ?? kitchen.name}__`,
      supplierName: kitchen.name,
      supplierEmail: String(card?.email || '').trim(),
      supplierPhone: String(card?.tel || '').trim(),
    }
  }
  return { supplierId: '__kitchen_undefined__', supplierName: labels.undefined || '', supplierEmail: '', supplierPhone: '' }
}
