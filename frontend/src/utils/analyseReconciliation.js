// Réconciliation « vente API → menu item DataFriday » pour la page Analyse.
//
// Principe (data-driven 2026-07-02) : la réconciliation est un ENRICHISSEMENT pur —
// elle retrouve l'identité catalogue (dims type/catégorie, coût) d'une vente mais
// n'EXCLUT jamais rien. Dimensions : catalogue DataFriday d'abord, repli sur les
// champs portés par le record API (menuItemType/Category du join backend), sentinelle
// « Non rattachés » en dernier recours. Toute vente compte dans les vues.
//
// Algo de match = MÊME que la réconciliation EventPredict (cf. EventPredictView
// reconciledRecords) : exact menuItemId ∈ assignation PdV → mapping nom→id
// explicite → findBestMatch (nom seul, prix omis, seuil 70) → catalogue global
// si l'assignation PdV est partielle → unmapped.

import { findBestMatch, similarity } from '@/utils/menuItemMatching'
import { normalizeStr } from '@/utils/predictiveAnalytics'
import { normalizeShopType } from '@/constants/shopTypes'

/** Clés techniques stables des buckets « non rattaché » (label i18n côté composant). */
export const UNATTACHED_ITEM_KEY = '__unattached_item__'
export const UNATTACHED_SHOP_KEY = '__unattached_shop__'

/** Seuil de match nom (identique à EventPredict / wizard /data-integration/fb). */
const MATCH_THRESHOLD = 70

function norm(v) {
  return normalizeStr(v)
}

function taxonomyKey(v) {
  return norm(v)
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function singularTaxonomyKey(v) {
  return taxonomyKey(v)
    .split(' ')
    .map((token) => (token.length > 3 && token.endsWith('s') ? token.slice(0, -1) : token))
    .join(' ')
}

function textOf(value) {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') return String(value.name || value.label || '').trim()
  return ''
}

/**
 * Nom vendu résolu, tolérant à la forme du record (shop-level ou item-level,
 * réel ou prédictif). Aligné sur `resolveItemName` (analyseDimensions).
 */
function recordName(r) {
  return (
    textOf(r?.menuItemName) ||
    textOf(r?.itemName) ||
    textOf(r?.mappedMenuItemName) ||
    textOf(r?.productName) ||
    // Ventes Weezevent : libellé dans transactionItemName / weezeventProductName.
    textOf(r?.transactionItemName) ||
    textOf(r?.weezeventProductName) ||
    textOf(r?.name) ||
    ''
  )
}

/**
 * Normalise l'assignation PdV↔items vers `Map<elementId, Set<menuItemId>>`.
 * Accepte : une Map déjà construite, la forme canonique Edge
 * `{ menuItems: { [elementId]: { [menuItemId]: bool } } }`
 * (cf. useSpaceMenu.js), ou directement `{ [elementId]: { [menuItemId]: bool } }`.
 */
function toAssignmentMap(assignment) {
  if (assignment instanceof Map) return assignment
  const map = new Map()
  const raw = assignment?.menuItems || assignment || {}
  for (const [elementId, obj] of Object.entries(raw)) {
    const set = new Set()
    for (const [miId, checked] of Object.entries(obj || {})) {
      if (checked) set.add(String(miId))
    }
    map.set(String(elementId), set)
  }
  return map
}

/**
 * Catégorie + type d'un menu item, lus EXCLUSIVEMENT du catalogue DataFriday.
 * Walk : item → categoryId → ProductCategory (porte `typeName`) ; type via
 * `typeId` → ProductType, ou via la catégorie parente. Aucun repli Weezevent.
 */
export function resolveCatalogDims(mi, catById, typeById) {
  if (!mi) return { type: '', category: '' }
  const cat = catById.get(String(mi.categoryId ?? '')) || null
  const type =
    textOf(mi.typeName) ||
    textOf(typeById.get(String(mi.typeId ?? ''))) ||
    textOf(cat?.typeName) ||
    textOf(mi.type)
  const category =
    textOf(mi.categoryName) ||
    textOf(cat?.name) ||
    textOf(cat) ||
    textOf(mi.category)
  return { type, category }
}

/**
 * Construit le contexte de réconciliation (indexé UNE fois). `reconcileRecord`
 * s'appuie ensuite sur `matchMemo` (clé `shopKey|nomNormalisé`) → coût amorti
 * O(records), pas O(records × items) à chaque rendu.
 *
 * @param {Object}  p
 * @param {Array}   p.menuItems          catalogue [{ id, name, categoryId, typeId, ... }]
 * @param {Array}   p.productCategories   [{ id, name, typeId, typeName }]
 * @param {Array}   p.productTypes        [{ id, name }]
 * @param {Array}   p.floorElements       PdV de la config : [{ id, name, shopType:[], floorName }]
 * @param {Map|Object} p.assignment       getSpaceMenuConfiguration (forme canonique) ou Map
 * @param {Map}     [p.nameToMenuItemId]  mappings nom→id explicites (optionnel)
 * @param {Array}   [p.weezeventProducts] produits Weezevent [{ id, weezeventId, name, nature, subnature }]
 */
export function buildReconciliationContext({
  menuItems = [],
  productCategories = [],
  productTypes = [],
  floorElements = [],
  assignment = null,
  assignmentItemsByShop = null,
  nameToMenuItemId = null,
  weezeventProducts = [],
} = {}) {
  const menuItemById = new Map()
  const catalogByName = new Map()
  for (const mi of menuItems) {
    if (mi?.id != null) menuItemById.set(String(mi.id), mi)
    const nk = norm(mi?.name)
    if (nk && !catalogByName.has(nk)) catalogByName.set(nk, mi)
  }
  const catById = new Map(productCategories.map((c) => [String(c?.id), c]))
  const typeById = new Map(productTypes.map((t) => [String(t?.id), t]))
  const assignedByElement = toAssignmentMap(assignment)
  // Objets items assignés par NOM de shop (NestJS getShopMenus) : { id, name, category }.
  // Indispensable pour les configs Weezevent où l'assignation Edge (ids) est absente.
  const itemsByShopKey =
    assignmentItemsByShop instanceof Map ? assignmentItemsByShop : new Map()

  // shopKey (nom de PdV normalisé) → { element, set, items }. Clé NOM = join stable
  // entre l'espace d'ids ventes (records) et DataFriday (FloorElements / shops).
  const shopByKey = new Map()
  const assignedItemById = new Map()
  for (const el of floorElements) {
    const key = norm(el?.name)
    if (!key) continue
    const set = assignedByElement.get(String(el?.id ?? '')) || null
    const items = itemsByShopKey.get(key) || null
    if (Array.isArray(items)) {
      for (const it of items) if (it?.id != null) assignedItemById.set(String(it.id), it)
    }
    shopByKey.set(key, { element: el, set, items })
  }
  // Shops présents UNIQUEMENT dans l'assignation NestJS (pas dans floorElements) :
  // on les ajoute aussi (cas où floorElements vient d'une autre source).
  for (const [key, items] of itemsByShopKey.entries()) {
    if (shopByKey.has(key)) continue
    if (Array.isArray(items)) {
      for (const it of items) if (it?.id != null) assignedItemById.set(String(it.id), it)
    }
    shopByKey.set(key, { element: { name: key }, set: null, items })
  }

  // ── Produits Weezevent : dernier repli de dimensions (nature → type,
  // subnature → catégorie), cf. sémantique du wizard StepMapMenuItems
  // (ensureType(nature) / ensureCategory(subnature)). Mêmes clés de lookup
  // qu'enrichGranularMenuDimensions (id/weezeventId/productId/externalId + nom).
  const weezeventProductById = new Map()
  const weezeventProductByName = new Map()
  for (const p of weezeventProducts) {
    for (const id of [p?.id, p?.weezeventId, p?.productId, p?.externalId]) {
      if (id != null) weezeventProductById.set(String(id), p)
    }
    const nk = norm(p?.name || p?.productName || p?.label)
    if (nk && !weezeventProductByName.has(nk)) weezeventProductByName.set(nk, p)
  }
  // Canonicalisation vers le catalogue (évite les doublons de casse 'DRINK'/'Drink'
  // dans les options) + correction « nature qui est en réalité une catégorie »
  // (ex. 'Beer' → type parent 'Beverage'). Construit inline — ne pas importer
  // analyseDimensions (cycle d'import).
  const typeNameByNorm = new Map()
  for (const t of productTypes) {
    const nk = norm(t?.name)
    if (nk && !typeNameByNorm.has(nk)) typeNameByNorm.set(nk, textOf(t?.name))
  }
  const categoryParentType = new Map()
  const categoryNameByNorm = new Map()
  const categoryByTaxonomyKey = new Map()
  const categoryEntries = []
  for (const c of productCategories) {
    const nk = norm(c?.name)
    if (!nk) continue
    const name = textOf(c?.name)
    if (!categoryNameByNorm.has(nk)) categoryNameByNorm.set(nk, name)
    const parent = textOf(c?.typeName) || textOf(typeById.get(String(c?.typeId ?? ''))?.name)
    if (parent && !categoryParentType.has(nk)) categoryParentType.set(nk, parent)
    const tk = singularTaxonomyKey(name)
    if (tk && !categoryByTaxonomyKey.has(tk)) categoryByTaxonomyKey.set(tk, { name, parent })
    categoryEntries.push({ name, parent, key: taxonomyKey(name) })
  }

  return {
    menuItemById,
    catalogByName,
    assignedItemById,
    catById,
    typeById,
    shopByKey,
    nameToMenuItemId: nameToMenuItemId instanceof Map ? nameToMenuItemId : new Map(),
    weezeventProductById,
    weezeventProductByName,
    typeNameByNorm,
    categoryParentType,
    categoryNameByNorm,
    categoryByTaxonomyKey,
    categoryEntries,
    categoryMatchMemo: new Map(),
    matchMemo: new Map(),
    hasShops: shopByKey.size > 0,
  }
}

/**
 * Assimile une catégorie source à la taxonomie DataFriday :
 * exact normalisé → singulier/pluriel → fuzzy conservateur et non ambigu.
 * Le type parent vient toujours du catalogue DataFriday.
 */
function resolveSourceCategory(value, ctx) {
  const raw = textOf(value)
  if (!raw) return { category: '', type: '' }
  const memoKey = norm(raw)
  const memoized = ctx.categoryMatchMemo?.get(memoKey)
  if (memoized) return memoized
  const remember = (result) => {
    ctx.categoryMatchMemo?.set(memoKey, result)
    return result
  }

  const exactName = ctx.categoryNameByNorm?.get(norm(raw))
  if (exactName) {
    return remember({
      category: exactName,
      type: ctx.categoryParentType?.get(norm(exactName)) || '',
    })
  }

  const taxonomyMatch = ctx.categoryByTaxonomyKey?.get(singularTaxonomyKey(raw))
  if (taxonomyMatch) {
    return remember({ category: taxonomyMatch.name, type: taxonomyMatch.parent || '' })
  }

  const sourceKey = taxonomyKey(raw)
  if (sourceKey.length < 5) return remember({ category: raw, type: '' })
  let best = null
  let bestScore = 0
  let secondScore = 0
  for (const entry of ctx.categoryEntries || []) {
    const score = similarity(sourceKey, entry.key)
    if (score > bestScore) {
      secondScore = bestScore
      bestScore = score
      best = entry
    } else if (score > secondScore) {
      secondScore = score
    }
  }
  // Seuil élevé + écart minimal : évite d'assimiler une catégorie générique
  // à deux catégories DataFriday proches.
  if (best && bestScore >= 0.88 && bestScore - secondScore >= 0.08) {
    return remember({ category: best.name, type: best.parent || '' })
  }
  return remember({ category: raw, type: '' })
}

/**
 * Résout l'identité menu item d'un record (4 étapes EventPredict). Mémoïsé.
 * @returns {{ menuItemId: string|null, mapStatus: 'mapped'|'remapped'|'unmapped' }}
 */
function resolveItem(record, rawName, shop, ctx) {
  const recId = record?.menuItemId != null ? String(record.menuItemId) : ''

  // Pool de candidats du PdV : objets items assignés (NestJS getShopMenus) en
  // priorité — match par NOM, robuste à l'écart d'id-space getShopMenus↔catalogue.
  // Sinon ids d'assignation Edge (résolus via le catalogue). Sinon catalogue global
  // (PdV sans assignation propre → repli lenient).
  let candidates = null
  let candidateIds = null
  if (Array.isArray(shop?.items) && shop.items.length) {
    candidates = shop.items
    candidateIds = new Set(shop.items.map((i) => String(i.id)))
  } else if (shop?.set && shop.set.size) {
    candidates = [...shop.set].map((mid) => ctx.menuItemById.get(String(mid))).filter(Boolean)
    candidateIds = shop.set
  }
  const scoped = !!candidates // PdV avec assignation propre → match restreint à ce PdV
  if (!scoped) {
    // Data-driven (décision user 2026-07-02, parité React) : le match ne sert plus
    // qu'à retrouver l'IDENTITÉ catalogue de l'article (dims type/catégorie, coût) —
    // jamais à exclure une vente. PdV sans assignation propre ou hors config →
    // repli LENIENT contre tout le catalogue.
    candidates = [...ctx.menuItemById.values()]
  }

  // 1) exact : l'id du record est assigné au PdV (ou existe au catalogue en repli global).
  if (recId) {
    if (scoped && candidateIds.has(recId)) return { menuItemId: recId, mapStatus: 'mapped' }
    if (!scoped && ctx.menuItemById.has(recId)) return { menuItemId: recId, mapStatus: 'mapped' }
  }

  const nName = norm(rawName)

  // 2) mapping nom→id explicite, si l'id est assigné au PdV (ou en repli global).
  if (nName && ctx.nameToMenuItemId.size) {
    const mappedId = ctx.nameToMenuItemId.get(nName)
    if (mappedId && (!scoped || candidateIds.has(String(mappedId)))) {
      return { menuItemId: String(mappedId), mapStatus: 'remapped' }
    }
  }

  // 3) match flou par NOM seul (prix omis → évite le piège HT/TTC) contre les
  //    items assignés au PdV, ou tout le catalogue en repli.
  if (rawName && candidates.length) {
    const best = findBestMatch({ name: rawName, basePrice: null }, candidates)
    if (best && (best.matchScore || 0) >= MATCH_THRESHOLD) {
      return {
        menuItemId: String(best.id),
        mapStatus: String(best.id) === recId ? 'mapped' : 'remapped',
      }
    }
  }

  // 4) PdV avec assignation partielle : second passage contre catalogue global.
  // L'assignation aide le match mais ne bloque jamais l'enrichissement data-driven.
  if (scoped) {
    if (recId && ctx.menuItemById.has(recId)) {
      return { menuItemId: recId, mapStatus: 'mapped' }
    }
    if (nName && ctx.nameToMenuItemId.size) {
      const mappedId = ctx.nameToMenuItemId.get(nName)
      if (mappedId && ctx.menuItemById.has(String(mappedId))) {
        return { menuItemId: String(mappedId), mapStatus: 'remapped' }
      }
    }
    if (rawName && ctx.menuItemById.size) {
      const best = findBestMatch(
        { name: rawName, basePrice: null },
        [...ctx.menuItemById.values()],
      )
      if (best && (best.matchScore || 0) >= MATCH_THRESHOLD) {
        return {
          menuItemId: String(best.id),
          mapStatus: String(best.id) === recId ? 'mapped' : 'remapped',
        }
      }
    }
  }

  // 5) aucune correspondance → non rattaché (on garde l'id d'origine pour les totaux).
  return { menuItemId: recId || null, mapStatus: 'unmapped' }
}

/**
 * Réconcilie un record de vente. Renvoie une COPIE enrichie : les dimensions
 * (menuItemType/Category, shopType/Area) viennent du catalogue DataFriday, jamais
 * d'un champ Weezevent. Les non-matchés portent `UNATTACHED_*_KEY`.
 *
 * @param {Object} record  record shop-level ou item-level (qty/revenue préservés)
 * @param {Object} ctx     sortie de buildReconciliationContext
 */
export function reconcileRecord(record, ctx) {
  if (!record || !ctx) return record
  const rawName = recordName(record)
  const shopKey = norm(record.shopName) || norm(record.elementName)

  // ── PdV (100% DataFriday) ──────────────────────────────────────────────────
  const shop = ctx.shopByKey.get(shopKey) || null
  const element = shop?.element || null
  const shopStatus = element ? 'mapped' : 'unmapped'
  const elShopType = element
    ? normalizeShopType(Array.isArray(element.shopType) ? element.shopType.join(',') : element.shopType)
    : ''
  // Repli shopType/area sur les champs du record (event-timeline les porte, join backend)
  // quand le FloorElement n'a pas la metadata (shops NestJS sans shopType/area).
  const recShopType = record.shopType ? normalizeShopType(record.shopType) : ''
  const shopType = element
    ? elShopType || recShopType || UNATTACHED_SHOP_KEY
    : recShopType || UNATTACHED_SHOP_KEY
  const shopArea = element
    ? textOf(element.floorName) || textOf(element.area) || textOf(record.shopArea)
    : textOf(record.shopArea)

  // Record SANS libellé d'article NI menuItemId (agrégat shop-level : shop-details)
  // → il alimente le donut PdV + les totaux, mais n'a aucune dimension item à
  // résoudre. On ne le jette PAS dans « Non rattachés » (ce n'est pas une vente
  // d'article non matchée). Un record qui porte un menuItemId reste résolvable.
  if (!rawName && record.menuItemId == null) {
    return {
      ...record,
      menuItemType: '',
      menuItemCategory: '',
      mapStatus: 'noitem',
      shopType,
      shopArea,
      shopStatus,
    }
  }

  // ── Item (catalogue, mémoïsé) ──────────────────────────────────────────────
  const memoKey = shopKey + '|' + norm(rawName)
  let match = ctx.matchMemo.get(memoKey)
  if (match === undefined) {
    match = resolveItem(record, rawName, shop, ctx)
    ctx.matchMemo.set(memoKey, match)
  }

  const matchedItem = match.menuItemId
    ? ctx.menuItemById.get(String(match.menuItemId)) ||
      ctx.assignedItemById?.get(String(match.menuItemId)) ||
      null
    : null
  const mapped = match.mapStatus !== 'unmapped'
  const dims = mapped ? resolveCatalogDims(matchedItem, ctx.catById, ctx.typeById) : { type: '', category: '' }
  // Repli dimensions : l'item assigné NestJS ne porte que `category` (pas de typeId),
  // et le record event-timeline porte déjà menuItemType/Category (join backend). On
  // complète depuis ces sources avant de tomber sur la sentinelle « Non rattachés ».
  let resolvedType = dims.type
  let resolvedCategory = dims.category
  if (mapped) {
    // Cascade : catalogue par NOM (récupère typeId/categoryId même quand matchedItem est
    // un objet NestJS sans typeId), puis champs backend du record (event-timeline porte
    // menuItemType/Category). → récupère les menu TYPES + catégories pour Weezevent.
    if (!resolvedType || !resolvedCategory) {
      const nameKey = norm(textOf(matchedItem?.name) || rawName)
      const byName = nameKey ? ctx.catalogByName?.get(nameKey) : null
      if (byName) {
        const d2 = resolveCatalogDims(byName, ctx.catById, ctx.typeById)
        if (!resolvedType) resolvedType = d2.type
        if (!resolvedCategory) resolvedCategory = d2.category
      }
    }
    if (!resolvedCategory) {
      resolvedCategory = textOf(matchedItem?.category) || ''
    }
  }

  // Une assignation NestJS peut fournir uniquement la catégorie (`Beer`) sans
  // typeId/typeName. Canonicalise cette catégorie puis remonte vers son type parent.
  if (resolvedCategory) {
    const assimilatedResolvedCategory = resolveSourceCategory(resolvedCategory, ctx)
    if (assimilatedResolvedCategory.category) {
      resolvedCategory = assimilatedResolvedCategory.category
    }
    if (!resolvedType && assimilatedResolvedCategory.type) {
      resolvedType = assimilatedResolvedCategory.type
    }
  }

  // Catégorie/type directement fournis par la vente : assimilation à la taxonomie
  // DataFriday, même si l'identité article n'a pas été retrouvée.
  const sourceCategory = resolveSourceCategory(
    record.menuItemCategory ||
      record.category ||
      record.weezpaySubnature ||
      record.subnature,
    ctx,
  )
  if (!resolvedCategory && sourceCategory.category) resolvedCategory = sourceCategory.category
  if (!resolvedType && sourceCategory.type) resolvedType = sourceCategory.type

  const rawSourceType = textOf(
    record.menuItemType ||
      record.type ||
      record.weezpayNature ||
      record.nature,
  )
  const typeAsCategory = resolveSourceCategory(rawSourceType, ctx)
  if (!resolvedType) {
    resolvedType =
      typeAsCategory.type ||
      ctx.typeNameByNorm?.get(norm(rawSourceType)) ||
      rawSourceType
  }
  if (!resolvedCategory && typeAsCategory.type) resolvedCategory = typeAsCategory.category

  // ── Dernier repli de dims : produit WEEZEVENT (nature → type, subnature →
  // catégorie — même sémantique que le wizard). Lookup par weezeventProductId
  // (PAS record.productId : sur l'item-level il vaut menuItemId, autre id-space
  // → faux hits possibles), repli par nom vendu. N'exclut rien : dims seulement.
  const typeKnown = resolvedType
  const catKnown = resolvedCategory
  let wzType = ''
  let wzCategory = ''
  let wzNature = ''
  let wzSubnature = ''
  if (!typeKnown || !catKnown) {
    const wzId = record.weezeventProductId ?? record.weezeventItemId
    const wz =
      (wzId != null ? ctx.weezeventProductById?.get(String(wzId)) : null) ||
      ctx.weezeventProductByName?.get(norm(rawName)) ||
      null
    if (wz) {
      wzNature = textOf(wz.nature)
      wzSubnature = textOf(wz.subnature)
      const rawCat = wzSubnature || wzNature
      const assimilated = resolveSourceCategory(rawCat, ctx)
      wzCategory = assimilated.category
      // Catégorie assimilée → type parent. Sinon nature canonique comme type.
      wzType =
        assimilated.type ||
        ctx.typeNameByNorm?.get(norm(wzNature)) ||
        wzNature
    }
  }

  return {
    ...record,
    menuItemId: match.menuItemId || record.menuItemId || null,
    menuItemName: textOf(matchedItem?.name) || rawName || null,
    // Cascade dims : catalogue matché → champs backend du record → produit
    // Weezevent (nature/subnature) → sentinelle « Non rattachés ».
    menuItemType: typeKnown || wzType || UNATTACHED_ITEM_KEY,
    menuItemCategory: catKnown || wzCategory || UNATTACHED_ITEM_KEY,
    mapStatus: match.mapStatus,
    shopType,
    shopArea,
    shopStatus,
    // Dé-fantomise classifyMenuRevenueBucket (champs jusqu'ici jamais écrits).
    ...(wzNature || wzSubnature ? { weezpayNature: wzNature, weezpaySubnature: wzSubnature } : {}),
  }
}

// keepCatalogRecord / unmappedReason / computeCoverage supprimés (refonte data-driven
// 2026-07-02) : l'assignation n'est plus jamais un filtre — toute vente compte.
// `shopStatus`/`mapStatus` restent posés sur chaque record (diagnostic + libellés).
