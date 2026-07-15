import { resolveComponentDef, flattenComponentDef } from './inventoryUtils'

const MAX_DEPTH = 10
const FB_ELEMENT_TYPES = new Set(['shop', 'hospitality', 'kitchen'])

function normalizeName(value) {
  return String(value || '').trim().toLowerCase()
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
  components = [],
  depth = 0,
) {
  if (depth > MAX_DEPTH) return []
  const menuItemsById = new Map((menuItems || []).map((mi) => [mi.id, mi]))
  const menuItem = menuItemsById.get(menuItemId)
  if (!menuItem) return []

  if (menuItem.readyForSale === 'Yes') {
    // Article livré prêt au PDV, déjà emballé (cuisine centrale) : chips, paquets
    // de bonbon, bouteilles d'eau, certains sandwichs. On réarme le Menu Item tel
    // quel, SANS séparer le packaging — rien à ajouter au PDV. Si un packaging
    // doit être ajouté sur place (ex. serviette + sandwich), l'article est
    // modélisé en readyForSale='No' avec un composant dédié.
    return [
      {
        id: menuItem.id,
        name: menuItem.name,
        totalQuantity: menuItemQuantity,
        unit: 'pcs',
        isExpanded: false,
        sources: [
          {
            menuItemId,
            menuItemName: rootMenuItemName,
            menuItemQuantity,
            componentQuantity: menuItemQuantity,
            unit: 'pcs',
          },
        ],
      },
    ]
  }

  if (
    menuItem.readyForSale === 'No' &&
    Array.isArray(menuItem.components) &&
    menuItem.components.length > 0
  ) {
    const out = []
    const numberOfPiecesRecipe = toNumber(menuItem.numberOfPiecesRecipe, 1) || 1

    menuItem.components.forEach((component) => {
      const numberOfUnits = toNumber(component.numberOfUnits)
      const calculatedQuantity = (numberOfUnits * menuItemQuantity) / numberOfPiecesRecipe
      const componentUnit = component.unit || 'unit'
      // Match par nom UNIQUEMENT si le composant en a un : `component.name` peut
      // être null (recette dont les composants n'ont pas de libellé en base) et
      // `null === null` matcherait un menu item lui-même sans nom.
      const componentMenuItem = (menuItems || []).find(
        (mi) =>
          (component.name && mi.name === component.name) ||
          (component.sourceId && mi.id === component.sourceId),
      )

      if (componentMenuItem && componentMenuItem.readyForSale === 'No') {
        out.push(
          ...expandMenuItemStock(
            componentMenuItem.id,
            calculatedQuantity,
            rootMenuItemName,
            menuItems,
            components,
            depth + 1,
          ),
        )
      } else if (component.name || componentMenuItem?.name) {
        // « On ne commande pas un composant » : si ce composant est un
        // ComponentDefinition (Pickles Auxerre…), l'éclater en ingrédients feuilles
        // avec quantités BOM (qtyFactor = numberOfUnits/numberOfUnitsRecipe le long
        // de l'arbre). Identité ingrédient IDENTIQUE à l'inventaire (helpers partagés)
        // → le netting comptage↔réarmement joint. Un Ingredient ne s'éclate jamais.
        const def =
          component.itemType === 'Ingredient'
            ? null
            : resolveComponentDef(component, components)
        if (def && Array.isArray(def.subComponents) && def.subComponents.length) {
          flattenComponentDef(def, components).forEach((leaf) => {
            const leafQty = calculatedQuantity * leaf.qtyFactor
            out.push({
              id: leaf.id ?? leaf.sourceId ?? leaf.name,
              sourceId: leaf.sourceId,
              name: leaf.name,
              totalQuantity: leafQty,
              unit: leaf.unit,
              isExpanded: true,
              sources: [
                {
                  menuItemId,
                  menuItemName: rootMenuItemName,
                  menuItemQuantity,
                  componentQuantity: leafQty,
                  unit: leaf.unit,
                },
              ],
            })
          })
        } else {
          out.push({
            id: component.id,
            sourceId: component.sourceId,
            name: component.name || componentMenuItem.name,
            totalQuantity: calculatedQuantity,
            unit: componentUnit,
            isExpanded: true,
            sources: [
              {
                menuItemId,
                menuItemName: rootMenuItemName,
                menuItemQuantity,
                componentQuantity: calculatedQuantity,
                unit: componentUnit,
              },
            ],
          })
        }
      } else {
        // Composant sans nom résolvable (ref backend non jointe) : on le SAUTE
        // au lieu d'émettre une ligne placeholder « Composant de … » — elles se
        // dupliquaient (1 par composant anonyme) et leur id (component.id) ne
        // joignait jamais les comptages d'inventaire.
        console.log(
          `[stockPlanning] Composant sans nom ignoré dans "${rootMenuItemName}" (id=${component.id ?? '?'}, sourceId=${component.sourceId ?? '?'})`,
        )
      }
    })

    // Filet de sécurité (miroir inventoryUtils) : un article vendu ne peut
    // jamais produire 0 ligne. Si aucune feuille exploitable, on réarme
    // l'article lui-même — id = menuItem.id, la clé sous laquelle l'inventaire
    // a compté dans le même cas dégradé.
    if (!out.length) {
      console.log(
        `[stockPlanning] Expansion vide pour "${menuItem.name}" — fallback sur l'article lui-même`,
      )
      return [
        {
          id: menuItem.id,
          name: menuItem.name,
          totalQuantity: menuItemQuantity,
          unit: 'pcs',
          isExpanded: false,
          sources: [
            {
              menuItemId,
              menuItemName: rootMenuItemName,
              menuItemQuantity,
              componentQuantity: menuItemQuantity,
              unit: 'pcs',
            },
          ],
        },
      ]
    }

    return out
  }

  return [
    {
      id: menuItem.id,
      name: menuItem.name,
      totalQuantity: menuItemQuantity,
      unit: 'pcs',
      isExpanded: false,
      sources: [
        {
          menuItemId,
          menuItemName: rootMenuItemName,
          menuItemQuantity,
          componentQuantity: menuItemQuantity,
          unit: 'pcs',
        },
      ],
    },
  ]
}

export function buildStockRequirements({
  configuration,
  menuItems = [],
  components = [],
  predictedRecords = [],
  selectedMenuItems = {},
  quantityAdjustments = {},
  closedShopNames = [],
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
} = {}) {
  const out = new Map()
  const menuItemsById = new Map(menuItems.map((mi) => [mi.id, mi]))
  // PdV fermés exclus (parité buildStockRequirements) : pas d'achat pour un point fermé.
  const closedSet = new Set((closedShopNames || []).map((n) => normalizeName(n)).filter(Boolean))

  collectFbElements(configuration).forEach((shop) => {
    if (closedSet.size && shop?.name && closedSet.has(normalizeName(shop.name))) return
    const explicitIds = normalizeSelectedIds(selectedMenuItems[shop.id])
    const selectedIds = explicitIds.length
      ? explicitIds
      : normalizeSelectedIds(deriveSelectedMenuItemsByShop(configuration, predictedRecords)[shop.id])

    selectedIds.forEach((menuItemId) => {
      const menuItem = menuItemsById.get(menuItemId)
      if (!menuItem) return
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
