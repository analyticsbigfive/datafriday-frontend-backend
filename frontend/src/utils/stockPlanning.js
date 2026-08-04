// BUG-292-01 — `resolveComponentDef` / `flattenComponentDef` / `componentIngredientId`
// ne sont plus importés ici : la décomposition a quitté ce fichier pour
// `utils/menuItemExpansion` (règle commune), et l'éclatement composant→ingrédients
// pour `utils/bomPlanning` (feuille de course). `MAX_DEPTH` est porté par le module.
import { expandMenuItem, buildComponentLookup } from './menuItemExpansion'

const FB_ELEMENT_TYPES = new Set(['shop', 'hospitality', 'kitchen'])

function normalizeName(value) {
  return String(value || '').trim().toLowerCase()
}

/**
 * BUG-291-02 — index des articles IMPOSSIBLES À PRODUIRE côté serveur (recette
 * absente, ingrédient inactif / sans fournisseur, ou fournisseur ne livrant pas
 * l'espace). Un tel article ne génère aucune ligne de réarmement : on ne réarme
 * pas ce qu'on ne peut pas fabriquer.
 *
 * Index PLAT au niveau ESPACE — pas de jointure par shop, et c'est délibéré
 * (correctif v2) : `available` est calculé PAR ESPACE côté serveur
 * (`getItemsWithAvailabilityForSpace`), donc un improduisible l'est pour tous
 * les PDV de l'écran. La première version joignait par nom de shop et ratait en
 * silence dès que la config était synthétique (`buildSyntheticConfig` peut
 * poser un ID brut comme `shop.name`) — le Cookie repassait.
 *
 * Entrée : `{ ids: string[], names: string[] }`, noms BRUTS renormalisés ici
 * avec le normaliseur local (l'appelant n'a pas à le connaître).
 */
function buildUnavailableIndex(unavailableItems) {
  return {
    ids: new Set((unavailableItems?.ids || []).map((id) => String(id))),
    names: new Set(
      (unavailableItems?.names || []).map((n) => normalizeName(n)).filter(Boolean),
    ),
  }
}

/**
 * Appariement id PUIS nom, sur les DEUX ids disponibles : celui du record
 * (timeline / Weezevent) et celui du catalogue. Ils diffèrent régulièrement —
 * c'est précisément ce que BUG-290-01 a documenté — donc tester un seul des deux
 * laisserait passer la moitié des cas.
 */
function isUnavailableItem(index, menuItemId, catalogId, itemName) {
  if (!index.ids.size && !index.names.size) return false
  if (index.ids.has(String(menuItemId))) return true
  if (catalogId && index.ids.has(String(catalogId))) return true
  const nm = normalizeName(itemName)
  return !!(nm && index.names.has(nm))
}

/**
 * Packaging detection (parité inventoryUtils.js). Le packaging est traité comme
 * un ingrédient pour le réarmement : il doit être compté et apparaître dans la
 * liste de courses (Règle 3).
 */
export function isPackagingComponent(component) {
  if (!component) return false
  const categoryLower = String(component.category || '').toLowerCase()
  const storageTypeLower = String(component.storageType || '').toLowerCase()
  const sourceId = String(component.sourceId || component.id || '').toLowerCase()
  return (
    categoryLower.includes('packaging') ||
    categoryLower.includes('emballage') ||
    storageTypeLower === 'material' ||
    sourceId.startsWith('pkg-')
  )
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function collectFbElements(configuration) {
  if (!configuration) return []
  const data = configuration.data || configuration
  const out = []

  const pushElement = (el) => {
    if (el && FB_ELEMENT_TYPES.has(el.type)) out.push(el)
  }

  if (Array.isArray(data.floors)) {
    data.floors.forEach((floor) => {
      ;(floor?.elements || []).forEach(pushElement)
    })
  }

  ;(data.forecourt?.elements || []).forEach(pushElement)
  ;(data.externalMerch?.elements || []).forEach(pushElement)

  return out
}

/**
 * Éléments de type Storage (réserve centrale) d'une configuration — miroir de
 * `collectFbElements` mais pour `type === 'storage'`. Sert à retrouver les ids
 * Storage dont on lit les comptages d'inventaire pour la feuille de course
 * centrale (le Storage ne réduit JAMAIS le restock d'un shop précis).
 */
export function collectStorageElements(configuration) {
  if (!configuration) return []
  const data = configuration.data || configuration
  const out = []

  const pushStorage = (el) => {
    if (el && el.type === 'storage') out.push(el)
  }

  if (Array.isArray(data.floors)) {
    data.floors.forEach((floor) => {
      ;(floor?.elements || []).forEach(pushStorage)
    })
  }

  ;(data.forecourt?.elements || []).forEach(pushStorage)
  ;(data.externalMerch?.elements || []).forEach(pushStorage)

  return out
}

export function normalizeSelectedIds(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  if (value instanceof Set) return Array.from(value)
  if (typeof value === 'object') return Object.keys(value).filter((k) => value[k])
  return []
}

export function stockItemKey(item) {
  return `${item?.id || item?.name || 'item'}|||${item?.unit || 'unit'}`
}

export function shopRecordMatchesElement(record, element) {
  if (!record || !element) return false
  const recordKeys = [
    record.shopId,
    record.elementId,
    record.shop,
    record.shopName,
    record.elementName,
    record.registryId,
  ].filter(Boolean).map(String)
  const elementKeys = [
    element.id,
    element.registryId,
    element.name,
    element.shopName,
  ].filter(Boolean).map(String)
  return recordKeys.some((rk) => elementKeys.includes(rk))
}

export function getRecordMenuItemId(record) {
  return record?.menuItemId || record?.mappedMenuItemId || record?.itemId || ''
}

export function getRecordQuantity(record) {
  return toNumber(
    record?.totalQuantity ??
      record?.adjustedQuantity ??
      record?.quantity ??
      record?.qty,
  )
}

export function getPredictedQuantityForElement(records, element, menuItemId) {
  return (records || []).reduce((sum, record) => {
    if (getRecordMenuItemId(record) !== menuItemId) return sum
    if (!shopRecordMatchesElement(record, element)) return sum
    return sum + getRecordQuantity(record)
  }, 0)
}

export function deriveSelectedMenuItemsByShop(configuration, records) {
  const out = {}
  collectFbElements(configuration).forEach((element) => {
    const ids = []
    ;(records || []).forEach((record) => {
      if (!shopRecordMatchesElement(record, element)) return
      if (getRecordQuantity(record) <= 0) return
      const menuItemId = getRecordMenuItemId(record)
      if (menuItemId && !ids.includes(menuItemId)) ids.push(menuItemId)
    })
    if (ids.length) out[element.id] = ids
  })
  return out
}

export function expandMenuItemStock(
  menuItemId,
  menuItemQuantity,
  rootMenuItemName,
  menuItems,
  // eslint-disable-next-line no-unused-vars
  components = [],
  depth = 0,
) {
  // BUG-292-01 — la règle de décomposition vit dans `utils/menuItemExpansion`, une
  // seule fois pour les quatre écrans. Cette fonction n'est plus qu'un adaptateur
  // de signature : elle existe parce que trois appelants la consomment
  // (`buildStockRequirements`, `useShoppingList`, `usePredictedNeed`).
  //
  // Trois comportements ont changé ici, tous voulus :
  //  1. la récursion suit désormais le PARENT (combo), plus le `readyForSale` de
  //     l'enfant — un composant préparé en cuisine centrale (sauce pickle) reste
  //     UNE LIGNE au lieu d'être dissous en son ail (symptôme S2) ;
  //  2. un ComponentDefinition n'est PLUS éclaté en ingrédients feuilles. Cet
  //     éclatement n'a pas disparu : il a été DÉPLACÉ dans la feuille de course
  //     (`bomPlanning`), seul écran où l'on achète — on ne commande pas un
  //     composant. ⚠️ Ce n'était pas un no-op : `useSpaceData` hydrate les
  //     `subComponents` et les réinjecte dans `analyse.components`, donc la
  //     branche s'exécutait bel et bien (cf. fiche BUG-292-01, cause B) ;
  //  3. un combo est ouvert, comme sur le Stock-up (Question #18, Bertrand).
  //
  // `components` devient inutile ici — paramètre CONSERVÉ pour ne pas casser les
  // appelants, dont la signature positionnelle place `depth` juste après.
  const menuItemsById = new Map((menuItems || []).map((mi) => [mi.id, mi]))
  return expandMenuItem({
    menuItemId,
    quantity: menuItemQuantity,
    rootMenuItemName,
    menuItemsById,
    lookup: buildComponentLookup(menuItems),
    depth,
    // Le réarmement n'a pas de signal d'hydratation : `true` préserve son
    // comportement historique (le filet de sécurité reste disponible).
    recipeCatalogLoaded: true,
    fallbackWhenEmpty: true,
  })
}

export function buildStockRequirements({
  configuration,
  menuItems = [],
  components = [],
  predictedRecords = [],
  selectedMenuItems = {},
  quantityAdjustments = {},
  closedShopNames = [],
  // BUG-291-02 — cf. buildUnavailableIndex. Défaut vide → sortie strictement
  // identique pour tout appelant qui ne le passe pas.
  unavailableItems = null,
} = {}) {
  const rowsByKey = new Map()
  const menuItemsById = new Map(menuItems.map((mi) => [mi.id, mi]))
  // Index par NOM normalisé : les records EventPredict portent un menuItemId issu
  // de la timeline (UUID/weezevent) qui peut différer de l'id catalogue (cuid DB)
  // → on rattrape par mappedMenuItemId puis par nom avant d'abandonner.
  const menuItemsByName = new Map(
    menuItems.filter((mi) => mi?.name).map((mi) => [normalizeName(mi.name), mi]),
  )
  // PdV fermés pour cet event → EXCLUS du réarmement (« on ne vend pas sur des
  // points fermés »). Noms bruts normalisés ici pour matcher `shop.name` avec le
  // MÊME normaliseur, quel que soit le normaliseur de l'appelant.
  const closedSet = new Set((closedShopNames || []).map((n) => normalizeName(n)).filter(Boolean))
  const unavailableIndex = buildUnavailableIndex(unavailableItems)

  collectFbElements(configuration).forEach((shop) => {
    if (closedSet.size && shop?.name && closedSet.has(normalizeName(shop.name))) return
    const explicitIds = normalizeSelectedIds(selectedMenuItems[shop.id])
    const selectedIds = explicitIds.length
      ? explicitIds
      : normalizeSelectedIds(deriveSelectedMenuItemsByShop(configuration, predictedRecords)[shop.id])

    selectedIds.forEach((menuItemId) => {
      // Record représentatif (shop + item) → nom + mappedMenuItemId pour
      // rattraper le catalogue quand l'id timeline ≠ id catalogue.
      const sample = (predictedRecords || []).find(
        (r) => getRecordMenuItemId(r) === menuItemId && shopRecordMatchesElement(r, shop),
      )
      const recordName = sample?.itemName || sample?.mappedMenuItemName || ''
      const menuItem =
        menuItemsById.get(menuItemId) ||
        (sample?.mappedMenuItemId ? menuItemsById.get(sample.mappedMenuItemId) : null) ||
        (recordName ? menuItemsByName.get(normalizeName(recordName)) : null) ||
        null

      // BUG-291-02 : placé APRÈS la résolution catalogue (on dispose alors des
      // deux ids et du nom) et AVANT le calcul de quantité — un article qu'on ne
      // peut pas fabriquer ne produit ni sa ligne ni celles de ses ingrédients.
      if (
        isUnavailableItem(unavailableIndex, menuItemId, menuItem?.id, recordName || menuItem?.name)
      ) {
        return
      }

      const predictedQuantity = getPredictedQuantityForElement(
        predictedRecords,
        shop,
        menuItemId,
      )
      const adjustment = toNumber(quantityAdjustments[`${shop.id}-${menuItemId}`], 100)
      const adjustedQuantity = Math.round((predictedQuantity * adjustment) / 100)
      if (!adjustedQuantity) return

      // Catalogue trouvé → expansion recette/packaging (id catalogue, PAS l'id
      // timeline). Sinon (catalogue incomplet ou id orphelin) → ligne feuille
      // directe depuis le record (nom + quantité prédite) pour que la prévision
      // s'affiche au lieu d'un « No forecast ».
      const expansion = menuItem
        ? expandMenuItemStock(menuItem.id, adjustedQuantity, menuItem.name, menuItems, components)
        : []
      const itemLabel = recordName || menuItem?.name || menuItemId
      const expanded = expansion.length
        ? expansion
        : [
            {
              id: menuItem?.id || menuItemId,
              name: itemLabel,
              totalQuantity: adjustedQuantity,
              unit: 'pcs',
              isExpanded: false,
              sources: [
                {
                  menuItemId,
                  menuItemName: itemLabel,
                  menuItemQuantity: adjustedQuantity,
                  componentQuantity: adjustedQuantity,
                  unit: 'pcs',
                },
              ],
            },
          ]

      expanded.forEach((item) => {
        const itemKey = stockItemKey(item)
        const key = `${shop.id}|||${itemKey}`
        const existing = rowsByKey.get(key)
        if (existing) {
          existing.totalQuantity += item.totalQuantity
          item.sources.forEach((source) => {
            const sourceKey = `${source.menuItemId}|||${source.unit}`
            const previous = existing.sources.find(
              (s) => `${s.menuItemId}|||${s.unit}` === sourceKey,
            )
            if (previous) {
              previous.menuItemQuantity += source.menuItemQuantity
              previous.componentQuantity += source.componentQuantity
            } else {
              existing.sources.push({ ...source })
            }
          })
        } else {
          rowsByKey.set(key, {
            shopId: shop.id,
            shopName: shop.name,
            shopType: shop.shopType,
            itemKey,
            itemId: item.id,
            sourceId: item.sourceId || null,
            itemName: item.name,
            unit: item.unit,
            totalQuantity: item.totalQuantity,
            isExpanded: !!item.isExpanded,
            sources: item.sources.map((source) => ({ ...source })),
          })
        }
      })
    })
  })

  return Array.from(rowsByKey.values()).sort((a, b) => {
    const shopCmp = String(a.shopName || '').localeCompare(String(b.shopName || ''))
    if (shopCmp) return shopCmp
    return String(a.itemName || '').localeCompare(String(b.itemName || ''))
  })
}

/**
 * Demande au niveau MENU ITEM (avant explosion), pour l'achat/production (BOM).
 *
 * Identique à buildStockRequirements mais SANS expansion : on s'arrête au plat
 * vendu/prédit. Renvoie la quantité de chaque menu item par PDV — c'est l'entrée
 * de bomPlanning.buildIngredientRequirements, qui éclate ensuite jusqu'aux
 * ingrédients (cuisine centrale), indépendamment de readyForSale.
 *
 * @returns {Array<{shopId, shopName, menuItemId, menuItemName, quantity}>}
 */
export function buildMenuItemDemand({
  configuration,
  menuItems = [],
  predictedRecords = [],
  selectedMenuItems = {},
  quantityAdjustments = {},
  closedShopNames = [],
  // BUG-291-02 — parité buildStockRequirements : on n'achète pas non plus les
  // ingrédients d'un plat qu'on ne peut pas produire.
  unavailableItems = null,
} = {}) {
  const out = new Map()
  const menuItemsById = new Map(menuItems.map((mi) => [mi.id, mi]))
  // PdV fermés exclus (parité buildStockRequirements) : pas d'achat pour un point fermé.
  const closedSet = new Set((closedShopNames || []).map((n) => normalizeName(n)).filter(Boolean))
  const unavailableIndex = buildUnavailableIndex(unavailableItems)

  collectFbElements(configuration).forEach((shop) => {
    if (closedSet.size && shop?.name && closedSet.has(normalizeName(shop.name))) return
    const explicitIds = normalizeSelectedIds(selectedMenuItems[shop.id])
    const selectedIds = explicitIds.length
      ? explicitIds
      : normalizeSelectedIds(deriveSelectedMenuItemsByShop(configuration, predictedRecords)[shop.id])

    selectedIds.forEach((menuItemId) => {
      const menuItem = menuItemsById.get(menuItemId)
      if (!menuItem) return
      if (isUnavailableItem(unavailableIndex, menuItemId, menuItem.id, menuItem.name)) {
        return
      }
      const predictedQuantity = getPredictedQuantityForElement(predictedRecords, shop, menuItemId)
      const adjustment = toNumber(quantityAdjustments[`${shop.id}-${menuItemId}`], 100)
      const adjustedQuantity = Math.round((predictedQuantity * adjustment) / 100)
      if (!adjustedQuantity) return

      const key = `${shop.id}|||${menuItemId}`
      const prev = out.get(key)
      if (prev) {
        prev.quantity += adjustedQuantity
      } else {
        out.set(key, {
          shopId: shop.id,
          shopName: shop.name,
          menuItemId,
          menuItemName: menuItem.name,
          quantity: adjustedQuantity,
        })
      }
    })
  })

  return Array.from(out.values())
}

export function findStockReference(item, ingredients = [], components = [], menuItems = []) {
  const idCandidates = new Set(
    [item?.itemId, item?.id, item?.sourceId].filter(Boolean).map(String),
  )
  const name = normalizeName(item?.itemName || item?.name)

  const byIdOrName = (candidate) => {
    if (!candidate) return false
    if (idCandidates.has(String(candidate.id))) return true
    if (idCandidates.has(String(candidate.sourceId))) return true
    return normalizeName(candidate.name || candidate.itemName) === name
  }

  return (
    (ingredients || []).find(byIdOrName) ||
    (components || []).find(byIdOrName) ||
    (menuItems || []).find(byIdOrName) ||
    null
  )
}

export function computePackagingForQuantity(
  item,
  quantity,
  ingredients = [],
  components = [],
  menuItems = [],
) {
  const src = findStockReference(item, ingredients, components, menuItems)
  if (!src) return null

  const packagingType =
    src.packagingType ||
    src.inventoryPackagingName ||
    src.inventoryPackagingType ||
    src.inventoryPackagingId ||
    null
  const packagingUnitNumber = toNumber(
    // Repli final : carte « Inventory Information » du menu item lui-même
    // (inventoryNumberOfUnits), symétrique du repli type inventoryPackagingType.
    src.packagingUnitNumber ?? src.inventoryQuantityPackaged ?? src.inventoryNumberOfUnits,
  )
  const packagingUnit = src.packagingUnit || src.unit || item?.unit
  const purchaseUnitConversion = toNumber(src.purchaseUnitConversion, 1) || 1

  if (!packagingType || !packagingUnitNumber || !packagingUnit) return null

  const packedCount = Math.ceil((toNumber(quantity) / packagingUnitNumber) * purchaseUnitConversion)
  return {
    source: src,
    packedCount,
    packagingType,
    packagingUnitNumber,
    packagingUnit,
    looseQty: packedCount * packagingUnitNumber,
  }
}
