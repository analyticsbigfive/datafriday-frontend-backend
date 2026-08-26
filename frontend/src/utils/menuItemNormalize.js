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
    // Sans ce champ, `componentIngredientId` (inventoryUtils.js) retombe sur
    // `sourceId` = l'id de l'Ingredient/Packaging plutôt que celui du MarketPrice
    // lié — silencieusement inadressable côté Logistic ensuite (id absent de
    // resolveItemKeysByIds), alors que la relation existe et est valide en base.
    marketPriceId: pick(
      c.marketPriceId,
      c.ingredient?.marketPriceId, c.ingredient?.marketPrice?.id,
      c.packaging?.marketPriceId, c.packaging?.marketPrice?.id,
    ),
    name: pick(
      c.name, c.itemName, c.ingredientName, c.componentName,
      c.ingredient?.name, c.ingredient?.itemName,
      c.component?.name, c.packaging?.name,
    ),
    numberOfUnits: Number(pick(c.numberOfUnits, c.quantity, c.qty, c.numberOfPieces) ?? 0) || 0,
    // BUG-291-01 : les relations `component` et `packaging` nichent leur entité
    // au même titre que `ingredient` — sans ces replis, une ligne de composant
    // du payload liste ressortait en 'unit' générique alors que son unité de
    // recette est en base (ex. « kg » pour la sauce burger).
    unit:
      pick(
        c.unit, c.unitOfMeasure, c.uom,
        c.ingredient?.recipeUnit, c.ingredient?.unit,
        c.component?.recipeUnit, c.component?.unit,
        c.packaging?.recipeUnit, c.packaging?.unit,
      ) ?? 'unit',
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
  // BUG-291-01 : les trois relations étaient chaînées en ALTERNATIVES
  // (`if (!comps.length)`), pas en union — dès qu'un article portait un seul
  // composant, ses ingrédients ET son packaging étaient jetés. Relevé du
  // 2026-08-04 sur « Burger 25/26 (Aux) » : `/menu-items` renvoie
  // components:2 + ingredients:4 + packagings:1, et 2 lignes sur 7 seulement
  // atteignaient l'écran (les 2 composants, sans nom faute de jointure).
  //
  // `itemType` est posé ICI, d'après la relation d'origine : les lignes du
  // payload LISTE ne le portent pas (contrairement à /menu-items/:id/recipe),
  // et la règle « on n'éclate jamais un Component » en dépend. Le spread place
  // la valeur par défaut AVANT `...r` : un itemType explicite gagne toujours.
  const rel = [
    ...toArray(mi.ingredients).map((r) => ({ itemType: 'Ingredient', ...r })),
    ...toArray(mi.components).map((r) => ({ itemType: 'Component', ...r })),
    ...toArray(mi.componentsList).map((r) => ({ itemType: 'Component', ...r })),
    // Le packaging d'une relation dédiée n'a pas forcément category/storageType :
    // on le tague pour que isPackagingComponent le détecte.
    ...toArray(mi.packagings).map((r) => ({
      storageType: 'material',
      itemType: 'Packaging',
      ...r,
    })),
  ]
  // `componentsData` est la version DÉNORMALISÉE des mêmes lignes : repli
  // uniquement si aucune relation n'est présente, jamais en supplément —
  // sinon chaque élément serait compté deux fois.
  const comps = rel.length ? rel : toArray(mi.componentsData)

  // Dédoublonnage — IDEMPOTENCE (contrat documenté sur normalizeMenuItem).
  // `normalizeMenuItem` renvoie `{...mi}` : un article déjà normalisé conserve
  // ses `ingredients`/`packagings` bruts À CÔTÉ du `components[]` fusionné. Sans
  // cette passe, re-normaliser (ce que fait `useSpaceData` après la vague 2b)
  // refusionnait les relations avec le résultat précédent → 12 lignes au lieu de
  // 7, donc des quantités de réappro gonflées en silence.
  // Clé = id de la LIGNE de recette (unique par (menuItem, article)) ; repli sur
  // l'identité catalogue pour les payloads dénormalisés qui n'en portent pas.
  const seen = new Set()
  const out = []
  for (const raw of comps) {
    const c = normalizeComponent(raw)
    const key =
      c?.id != null
        ? `id:${c.id}`
        : `k:${c?.sourceId ?? ''}|${c?.itemType ?? ''}|${c?.name ?? ''}|${c?.unit ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c)
  }
  return out
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
