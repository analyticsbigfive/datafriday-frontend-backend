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
//
// BUG-292-01 — ce fichier est le SEUL endroit de l'application qui a le droit
// d'éclater un ComponentDefinition en ses ingrédients. Règle métier : on ne
// commande pas « de la sauce pickle » à un fournisseur, on commande du vinaigre
// et de l'ail. Partout ailleurs (stock-up, inventaires, réarmement) un composant
// est UNE ligne — il arrive prêt de la cuisine centrale, cf. menuItemExpansion.js.
//
// ⚠️ La récursion `refMenuItemId` ne suffisait pas : elle ne descend que dans un
// sous-MENU ITEM (combo). Un `MenuComponent` ne porte ni `menuItemId` ni
// `sourceMenuItemId` (schema.prisma), donc `refMenuItemId` est toujours undefined
// pour un vrai composant et la feuille de course s'arrêtait au composant.

import { resolveComponentDef, flattenComponentDef } from './inventoryUtils'

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
 * Normalise un RecipeDto du BATCH POST /menu-items/recipes vers le même shape
 * que normalizeRecipe (BUG-294-01 : le batch remplace le fan-out /menu-items/:id
 * qui déclenchait le rate limit). Ses `components[]` sont déjà aplatis :
 *   { id: <join line id>, sourceId, name, itemType, numberOfUnits, unit,
 *     marketPriceId, supplierId, cost }
 * ⚠️ `id` est l'id de la LIGNE DE JOINTURE — la clé d'agrégation doit être
 * `sourceId` (entité liée), sinon deux plats partageant un ingrédient ne
 * s'agrègent plus en une ligne d'achat.
 * `supplierName` absent du batch : résolu en aval (resolveSupplier) via
 * supplierId/marketPriceId + suppliers[] renvoyés par le même appel.
 * `refMenuItemId` : rien à perdre, jamais peuplé non plus côté détail (cf.
 * en-tête, BUG-292-01).
 * @param {object} dto  un élément de `items[]` de POST /menu-items/recipes
 * @returns {{ numberOfPiecesRecipe:number, lines: Array }}
 */
export function normalizeRecipeFromBatch(dto) {
  if (!dto || typeof dto !== 'object') return { numberOfPiecesRecipe: 1, lines: [] }
  const npr = toNumber(dto.numberOfPiecesRecipe, 1) || 1
  const lines = []
  for (const c of dto.components || []) {
    if (!c || typeof c !== 'object') continue
    const numberOfUnits = toNumber(c.numberOfUnits, 0)
    if (numberOfUnits <= 0) continue // même règle que normalizeRecipe : 0 → pas de besoin
    lines.push({
      key: String(pick(c.sourceId, c.name, c.id) || ''),
      sourceId: pick(c.sourceId),
      name: pick(c.name, '—'),
      unit: pick(c.unit, 'unit'),
      numberOfUnits,
      marketPriceId: pick(c.marketPriceId),
      supplierId: pick(c.supplierId),
      supplierName: undefined,
      // `cost` batch = coût de LIGNE ; non consommé par la feuille de course
      // (addLeaf ne le propage pas) — dérivé pour parité de shape uniquement.
      costPerRecipeUnit: toNumber(c.cost, 0) / numberOfUnits,
      itemType: c.itemType,
      refMenuItemId: undefined,
    })
  }
  return { numberOfPiecesRecipe: npr, lines }
}

/**
 * Explose la demande menu item en besoin d'ingrédients agrégé par FOURNISSEUR.
 *
 * @param {object} params
 * @param {Array}  params.demand               [{shopId, shopName, menuItemId, menuItemName, quantity}]
 * @param {Object} params.recipeByMenuItemId   menuItemId -> normalizeRecipe()
 * @param {Array}  params.components           catalogue ComponentDefinition, avec
 *   `subComponents` HYDRATÉS (cf. `componentCatalog.hydrateSubComponents`). Sans
 *   lui un composant reste une ligne d'achat — ce que la règle « on n'achète jamais
 *   un composant » interdit. Vide par défaut : les appelants historiques gardent
 *   leur comportement, l'éclatement est simplement inerte.
 * @param {(line:object)=>{supplierId,supplierName,supplierEmail?,supplierPhone?}} params.resolveSupplier
 * @returns {Array} groupes fournisseur (même shape que shoppingSupplierGroups)
 */
export function buildIngredientRequirements({
  demand = [],
  recipeByMenuItemId = {},
  components = [],
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
        return
      }
      // BUG-292-01 — ComponentDefinition → ses ingrédients feuilles. C'est LE
      // geste qui distingue la feuille de course des trois autres écrans : eux
      // stockent/comptent/réarment la sauce pickle, ici on achète son vinaigre.
      // `qtyFactor` = Π(numberOfUnits / numberOfUnitsRecipe) le long de l'arbre,
      // donc `q × qtyFactor` est déjà la quantité de matière première.
      // `flattenComponentDef` porte l'anti-cycle et MAX_DEPTH.
      if (line.itemType === 'Component') {
        const def = resolveComponentDef(line, components)
        const leaves =
          def && Array.isArray(def.subComponents) && def.subComponents.length
            ? flattenComponentDef(def, components)
            : []
        if (leaves.length) {
          leaves.forEach((leaf) => {
            addLeaf(
              {
                key: leaf.id ?? leaf.sourceId ?? leaf.name,
                name: leaf.name,
                unit: leaf.unit,
                itemType: 'Ingredient',
                // Identité « matière achetée » remontée telle quelle : c'est elle
                // qui rattache la ligne à son fournisseur et au comptage.
                marketPriceId: leaf.marketPriceId ?? null,
                sourceId: leaf.sourceId ?? null,
                supplierId: leaf.supplierId ?? null,
                supplierName: leaf.supplierName ?? null,
              },
              q * leaf.qtyFactor,
              shopName,
              rootName || menuItemName,
            )
          })
          return
        }
        // Def absente ou sans recette → on n'invente rien : le composant reste une
        // ligne d'achat, visible telle quelle plutôt que disparue silencieusement.
      }
      addLeaf(line, q, shopName, rootName || menuItemName)
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
