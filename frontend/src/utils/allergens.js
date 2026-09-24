// Allergènes proposés sur les fiches Menu Item et Composant. UNE seule liste pour
// les deux écrans (même valeur stockée en base, `allergens: String[]`), pour
// qu'un composant et le menu item qui l'utilise parlent le même vocabulaire.

export const ALLERGEN_OPTIONS = [
  { value: 'GLUTEN', labelKey: 'menuItemCreate.allergenGluten' },
  { value: 'LACTOSE', labelKey: 'menuItemCreate.allergenLactose' },
  { value: 'EGGS', labelKey: 'menuItemCreate.allergenEggs' },
  { value: 'NUTS', labelKey: 'menuItemCreate.allergenNuts' },
  { value: 'FISH', labelKey: 'menuItemCreate.allergenFish' },
  { value: 'SHELLFISH', labelKey: 'menuItemCreate.allergenShellfish' },
  { value: 'SOY', labelKey: 'menuItemCreate.allergenSoy' },
]
