// src/utils/bomPlanning.js
//
// BOM (Bill of Materials) — explosion des menu items en INGRÉDIENTS / matière
// première pour l'ACHAT / PRODUCTION (cuisine centrale).
//
// Différent du réarmement PDV (stockPlanning.expandMenuItemStock) : celui-ci
// s'arrête aux articles livrés prêts (readyForSale='Yes'). Ici on descend
// TOUJOURS jusqu'aux ingrédients — peu importe readyForSale — pour savoir quelle
// matière produire/acheter pour couvrir les ventes prédites.
//
// La recette n'est PAS portée par la liste /menu-items : elle vient du DÉTAIL
// /menu-items/:id, dont les relations sont NICHÉES :
//   ingredients[].ingredient.{name, recipeUnit, marketPriceId, supplier, …}
//   components[].component.{…}   packagings[].packaging.{…}
// normalizeRecipe aplatit ça en lignes exploitables (tolérant aux variantes).

function toNumber(v, f = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : f
}

function pick(...vals) {
  for (const v of vals) if (v !== undefined && v !== null && v !== '') return v
  return undefined
}

/**
 * Normalise un menu item DÉTAILLÉ (/menu-items/:id) en recette exploitable.
 * @param {object} detail  réponse /menu-items/:id (shape nichée réelle)
 * @returns {{ numberOfPiecesRecipe:number, lines: Array }}
 */
export function normalizeRecipe(detail) {
  if (!detail || typeof detail !== 'object') return { numberOfPiecesRecipe: 1, lines: [] }
  const npr = toNumber(detail.numberOfPiecesRecipe, 1) || 1
  const lines = []

  // Chaque relation (ingredient/component/packaging) niche l'entité sous `nested`.
  const pushLine = (raw, itemType, nested) => {
    if (!raw || typeof raw !== 'object') return
    const ref = raw[nested] && typeof raw[nested] === 'object' ? raw[nested] : {}
    // marketPrice niché dans la relation ingrédient : porte le supplierId. C'est
    // la chaîne réelle ingredient → marketPriceId → marketPrice.supplierId → supplier.
    const mp = ref.marketPrice && typeof ref.marketPrice === 'object' ? ref.marketPrice : {}
    const numberOfUnits = toNumber(pick(raw.numberOfUnits, raw.quantity, raw.qty), 0)
    if (numberOfUnits <= 0) return // 0 → n'entre pas dans le besoin

    lines.push({
      // clé d'agrégation : id de l'entité liée (pas l'id de la ligne de jointure)
      key: String(
        pick(raw.ingredientId, raw.componentId, raw.packagingId, ref.id, raw.id, ref.name, raw.name) || '',
      ),
      sourceId: pick(raw.ingredientId, raw.componentId, raw.packagingId, ref.id),
      name: pick(ref.name, ref.itemName, raw.name, raw.itemName, '—'),
      unit: pick(ref.recipeUnit, ref.unit, raw.unit, raw.unitOfMeasure, 'unit'),
      numberOfUnits,
      marketPriceId: pick(ref.marketPriceId, raw.marketPriceId, mp.id),
      // supplier dérivé de la chaîne : marketPrice d'abord, puis l'ingrédient lui-même.
      supplierId: pick(mp.supplierId, mp.supplier?.id, ref.supplierId, ref.supplier?.id, raw.supplierId),
      supplierName: pick(mp.supplier?.name, mp.supplierName, ref.supplier?.name),
      costPerRecipeUnit: toNumber(pick(ref.costPerRecipeUnit, raw.unitCost), 0),
      itemType,
      // un composant peut référencer un autre menu item (combo) → expansion récursive
      refMenuItemId: pick(raw.sourceMenuItemId, ref.menuItemId, ref.sourceMenuItemId),
    })
  }

  ;(detail.ingredients || []).forEach((r) => pushLine(r, 'Ingredient', 'ingredient'))
  ;(detail.components || []).forEach((r) => pushLine(r, 'Component', 'component'))
  ;(detail.packagings || []).forEach((r) => pushLine(r, 'Packaging', 'packaging'))

  return { numberOfPiecesRecipe: npr, lines }
}

/**
 * Explose la demande menu item en besoin d'ingrédients agrégé par FOURNISSEUR.
 *
 * @param {object} params
 * @param {Array}  params.demand               [{shopId, shopName, menuItemId, menuItemName, quantity}]
 * @param {Object} params.recipeByMenuItemId   menuItemId -> normalizeRecipe()
 * @param {(line:object)=>{supplierId,supplierName,supplierEmail?,supplierPhone?}} params.resolveSupplier
 * @returns {Array} groupes fournisseur (même shape que shoppingSupplierGroups)
 */
export function buildIngredientRequirements({
  demand = [],
  recipeByMenuItemId = {},
  resolveSupplier = () => ({ supplierId: '__unknown_supplier__', supplierName: '' }),
} = {}) {
  const agg = new Map() // aggKey -> ingrédient agrégé

  const addLeaf = (line, quantity, shopName, dishName) => {
    if (!(quantity > 0)) return
    const aggKey = `${line.key || line.name}|||${line.unit || 'unit'}`
    let entry = agg.get(aggKey)
    if (!entry) {
      const sup = resolveSupplier(line) || {}
      entry = {
        itemKey: aggKey,
        itemName: line.name,
        unit: line.unit,
        itemType: line.itemType,
        marketPriceId: line.marketPriceId,
        sourceId: line.sourceId,
        quantity: 0,
        shopNames: [],
        usedIn: [], // plats qui consomment cet ingrédient
        supplierId: sup.supplierId || '__unknown_supplier__',
        supplierName: sup.supplierName || '',
        supplierEmail: sup.supplierEmail || '',
        supplierPhone: sup.supplierPhone || '',
      }
      agg.set(aggKey, entry)
    }
    entry.quantity += quantity
    if (shopName && !entry.shopNames.includes(shopName)) entry.shopNames.push(shopName)
    if (dishName && !entry.usedIn.includes(dishName)) entry.usedIn.push(dishName)
  }

  // rootName = le PLAT vendu d'origine (conservé à travers la récursion combo) :
  // c'est ce qu'on affiche en « utilisé dans », pas le sous-composant intermédiaire.
  const explode = (menuItemId, menuItemName, quantity, shopName, depth, rootName) => {
    const recipe = recipeByMenuItemId[menuItemId]
    if (!recipe || !recipe.lines.length || depth > 8) {
      // Pas de recette (ou récursion trop profonde) → l'item lui-même est la
      // matière à produire/acheter (filet de sécurité, visible côté UI).
      addLeaf(
        { key: menuItemId, name: menuItemName, unit: 'pcs', itemType: 'MenuItem' },
        quantity,
        shopName,
        rootName || menuItemName,
      )
      return
    }
    const npr = recipe.numberOfPiecesRecipe || 1
    recipe.lines.forEach((line) => {
      const q = (line.numberOfUnits * quantity) / npr
      if (line.refMenuItemId && recipeByMenuItemId[line.refMenuItemId]) {
        // composant = sous-menu-item (combo) → on l'éclate à son tour
        explode(line.refMenuItemId, line.name, q, shopName, depth + 1, rootName || menuItemName)
      } else {
        addLeaf(line, q, shopName, rootName || menuItemName)
      }
    })
  }

  demand.forEach((d) => explode(d.menuItemId, d.menuItemName, d.quantity, d.shopName, 0, d.menuItemName))

  // Regroupe par fournisseur (shape identique à shoppingSupplierGroups).
  const supplierMap = new Map()
  for (const item of agg.values()) {
    if (!supplierMap.has(item.supplierId)) {
      supplierMap.set(item.supplierId, {
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        supplierEmail: item.supplierEmail,
        supplierPhone: item.supplierPhone,
        items: [],
      })
    }
    supplierMap.get(item.supplierId).items.push(item)
  }

  return Array.from(supplierMap.values())
    .map((g) => ({
      ...g,
      items: g.items.sort((a, b) => String(a.itemName).localeCompare(String(b.itemName))),
    }))
    .sort((a, b) => String(a.supplierName).localeCompare(String(b.supplierName)))
}
