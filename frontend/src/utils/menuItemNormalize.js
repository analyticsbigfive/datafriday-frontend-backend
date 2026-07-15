// src/utils/menuItemNormalize.js
//
// Normalise un menu item brut de l'API vers la shape attendue par :
//   - le réarmement  : stockPlanning.expandMenuItemStock
//   - l'inventaire   : inventoryUtils (expansion / packaging)
//   - la disponibilité : menuItemAvailability
//
// Objectif : être tolérant aux variantes de sérialisation backend tant que
// /menu-items n'expose pas de façon stable `readyForSale` + `components`
// (ingrédients + composants + PACKAGING fusionnés) + `numberOfPiecesRecipe`.
//
// Contrat backend complet : voir docs/menuItems.api.md
//
// Règle métier readyForSale :
//   - 'Yes' → article livré prêt au PDV, déjà emballé (chips, bouteille d'eau,
//             sandwich fini). Réarmé tel quel, packaging NON séparé.
//   - 'No'  → assemblage/ajout au PDV (ex. sandwich + serviette). Réarmé en
//             éclatant ses `components` (dont le packaging serviette).

function normYesNo(value) {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  const s = String(value ?? '').trim().toLowerCase()
  if (s === 'yes' || s === 'true' || s === 'oui' || s === '1') return 'Yes'
  if (s === 'no' || s === 'false' || s === 'non' || s === '0') return 'No'
  return value == null || value === '' ? null : String(value)
}

function toArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function pick(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v
  return undefined
}

/**
 * Normalise une entrée de `components[]`. Tolère les noms de champs issus des
 * relations séparées (MenuItemIngredient / MenuItemComponent / MenuItemPackaging)
 * autant que de la version dénormalisée `componentsData`.
 */
export function normalizeComponent(c) {
  if (!c || typeof c !== 'object') return c
  return {
    ...c,
    id: pick(c.id, c.componentId, c.ingredientId, c.packagingId),
    sourceId: pick(c.sourceId, c.ingredientId, c.componentId, c.packagingId, c.id),
    name: pick(
      c.name, c.itemName, c.ingredientName, c.componentName,
      c.ingredient?.name, c.ingredient?.itemName,
      c.component?.name, c.packaging?.name,
    ),
    numberOfUnits: Number(pick(c.numberOfUnits, c.quantity, c.qty, c.numberOfPieces) ?? 0) || 0,
    unit: pick(c.unit, c.unitOfMeasure, c.uom, c.ingredient?.recipeUnit, c.ingredient?.unit) ?? 'unit',
    category: pick(c.category, c.goodType, c.ingredient?.category, c.packaging?.category),
    storageType: pick(c.storageType, c.ingredient?.storageType, c.packaging?.storageType),
    itemType: pick(c.itemType, c.type, c.kind),
  }
}

/**
 * Construit le tableau `components[]` unifié à partir de toutes les sources
 * possibles, en marquant le packaging issu d'une relation dédiée.
 */
function buildComponents(mi) {
  let comps = toArray(mi.components)
  if (!comps.length) comps = toArray(mi.componentsData)
  if (!comps.length) {
    comps = [
      ...toArray(mi.ingredients),
      ...toArray(mi.componentsList),
      // Le packaging d'une relation dédiée n'a pas forcément category/storageType :
      // on le tague pour que isPackagingComponent le détecte.
      ...toArray(mi.packagings).map((p) => ({ storageType: 'material', ...p })),
    ]
  }
  return comps.map(normalizeComponent)
}

/**
 * Normalise un menu item brut de l'API. Idempotent : si les champs sont déjà
 * propres, la sortie est équivalente.
 */
export function normalizeMenuItem(mi) {
  if (!mi || typeof mi !== 'object') return mi
  return {
    ...mi,
    readyForSale: normYesNo(mi.readyForSale),
    comboItem: normYesNo(mi.comboItem),
    numberOfPiecesRecipe: Number(mi.numberOfPiecesRecipe) || 1,
    components: buildComponents(mi),
  }
}

/**
 * Résout les components sans `name` par jointure catalogues (tant que le backend
 * ne dénormalise pas `components[]` avec `name`, cf. docs/dejaFaits/menuItems.api.md).
 * Le payload liste `/menu-items` porte des refs `{ingredientId, numberOfUnits}` ;
 * les noms vivent dans /ingredients, /menu-components et /packaging. Idempotente :
 * un component déjà nommé n'est jamais réécrit, un id introuvable reste inchangé.
 * Retourne { menuItems, resolved, unresolved }.
 */
export function resolveComponentRefs(menuItems = [], { ingredients = [], components = [], packagings = [] } = {}) {
  const byId = new Map()
  const index = (list, itemType) => {
    for (const entity of list || []) {
      const id = entity?.id ?? entity?._id
      if (id != null && !byId.has(String(id))) byId.set(String(id), { entity, itemType })
    }
  }
  index(ingredients, 'Ingredient')
  index(components, 'Component')
  index(packagings, 'Packaging')

  let resolved = 0
  let unresolved = 0
  const out = (menuItems || []).map((mi) => {
    if (!Array.isArray(mi?.components) || !mi.components.length) return mi
    let touched = false
    const comps = mi.components.map((c) => {
      if (!c || typeof c !== 'object' || (c.name && String(c.name).trim())) return c
      const hit =
        (c.sourceId != null && byId.get(String(c.sourceId))) ||
        (c.id != null && byId.get(String(c.id))) ||
        null
      if (!hit) {
        unresolved += 1
        return c
      }
      const { entity, itemType } = hit
      resolved += 1
      touched = true
      return {
        ...c,
        name: pick(entity.name, entity.itemName) ?? c.name,
        category: c.category ?? pick(entity.category, entity.ingredientCategory),
        storageType: c.storageType ?? entity.storageType,
        itemType: c.itemType ?? itemType,
        unit: c.unit && c.unit !== 'unit' ? c.unit : pick(entity.recipeUnit, entity.unit) ?? c.unit,
      }
    })
    return touched ? { ...mi, components: comps } : mi
  })
  return { menuItems: out, resolved, unresolved }
}

/**
 * Diagnostic de couverture des données de recette sur un lot de menu items.
 * Sert à rendre visible le « data gap » tant que le backend n'expose pas encore
 * readyForSale + components. Retourne un résumé (et ne loggue rien lui-même).
 */
export function menuItemsCoverage(menuItems = []) {
  const total = menuItems.length
  let withReadyForSale = 0
  let withComponents = 0
  for (const mi of menuItems) {
    if (mi?.readyForSale === 'Yes' || mi?.readyForSale === 'No') withReadyForSale += 1
    if (Array.isArray(mi?.components) && mi.components.length) withComponents += 1
  }
  return { total, withReadyForSale, withComponents }
}
