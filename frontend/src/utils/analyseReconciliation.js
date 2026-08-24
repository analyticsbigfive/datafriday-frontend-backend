// Réconciliation « vente API → menu item DataFriday » pour la page Analyse.
//
// Principe (data-driven 2026-07-02, réaffirmé par JLH le 2026-08-24 après avoir
// envisagé puis écarté l'exclusion — BUG-356-01) : la réconciliation est un
// ENRICHISSEMENT pur — elle retrouve les dimensions catalogue (type/catégorie,
// coût) d'une vente mais n'EXCLUT jamais rien. Toute vente compte dans les vues ;
// une vente sans mapping est affichée sous « Non mappées » (UNATTACHED_ITEM_KEY),
// et le volume non mappé est chiffré par le bandeau de la page
// (useAnalyseUnmapped), pour que ce bucket ne se lise jamais comme un bug.
//
// IDENTITÉ ARTICLE (BUG-353-01) : elle vient EXCLUSIVEMENT du mapping Data Integration,
// déjà résolu côté backend (`getEventTimelineBatch` : WeezeventProductMapping → MenuItem,
// spaces.service.ts). Ce module ne fait PLUS de rapprochement par nom et ne consulte PLUS
// le SpaceMenu. L'ancien algorithme (calqué sur EventPredict : id accepté seulement s'il
// appartenait à l'assignation du PdV, sinon findBestMatch sur le nom au seuil 70) faisait
// basculer les ventes d'un article absent du SpaceMenu sur son homonyme le plus proche —
// « Bud 33cl 26/27 (LMFC) » comptabilisé sous « Budweiser 45cl 26/27 (LMFC) », 916 unités
// perdues sur 14 PdV. Le SpaceMenu ne sert qu'au Predict, qui garde sa propre
// réconciliation dans EventPredictView.

import { similarity } from '@/utils/menuItemMatching'
import { normalizeStr } from '@/utils/predictiveAnalytics'
import { normalizeShopType } from '@/constants/shopTypes'

/** Clés techniques stables des buckets « non rattaché » (label i18n côté composant). */
export const UNATTACHED_ITEM_KEY = '__unattached_item__'
export const UNATTACHED_SHOP_KEY = '__unattached_shop__'

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
 * Construit le contexte de réconciliation (indexé UNE fois) : catalogue par id et par nom,
 * taxonomie, PdV par nom. `reconcileRecord` n'y fait plus que des lectures indexées —
 * `categoryMatchMemo` reste le seul mémo, pour l'assimilation de catégorie.
 *
 * @param {Object}  p
 * @param {Array}   p.menuItems          catalogue [{ id, name, categoryId, typeId, ... }]
 * @param {Array}   p.productCategories   [{ id, name, typeId, typeName }]
 * @param {Array}   p.productTypes        [{ id, name }]
 * @param {Array}   p.floorElements       PdV de la config : [{ id, name, shopType:[], floorName }]
 * @param {Array}   [p.weezeventProducts] produits Weezevent [{ id, weezeventId, name, nature, subnature }]
 *
 * BUG-353-01 : plus de paramètre `assignment` / `assignmentItemsByShop` / `nameToMenuItemId`.
 * L'assignation SpaceMenu ne participe plus à l'identité article, et `floorElements` ne sert
 * plus qu'aux DIMENSIONS du PdV (type, zone) — le rattachement PdV lui-même vient de
 * WeezeventLocationShopMapping, côté backend.
 */
export function buildReconciliationContext({
  menuItems = [],
  productCategories = [],
  productTypes = [],
  floorElements = [],
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

  // shopKey (nom de PdV normalisé) → { element }. Clé NOM = join stable entre l'espace
  // d'ids ventes (records) et DataFriday (FloorElements / shops). Sert UNIQUEMENT à
  // habiller le record des dimensions du PdV (type, zone) — jamais à décider quel
  // article a été vendu.
  const shopByKey = new Map()
  for (const el of floorElements) {
    const key = norm(el?.name)
    if (!key) continue
    shopByKey.set(key, { element: el })
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
    catById,
    typeById,
    shopByKey,
    weezeventProductById,
    weezeventProductByName,
    typeNameByNorm,
    categoryParentType,
    categoryNameByNorm,
    categoryByTaxonomyKey,
    categoryEntries,
    categoryMatchMemo: new Map(),
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
 * Identité menu item d'un record : STRICTEMENT celle que le backend a résolue depuis le
 * mapping Data Integration (`WeezeventProductMapping` → `MenuItem`, cf.
 * `getEventTimelineBatch` dans spaces.service.ts). Aucun rapprochement par nom, aucun pool
 * de candidats issu du SpaceMenu — c'était la cause de BUG-353-01.
 *
 * Une vente sans mapping n'est PAS écartée (décision 2026-07-02, confirmée 2026-08-24) :
 * elle reste dans les totaux, en « Non rattachés ».
 *
 * @returns {{ menuItemId: string|null, mapStatus: 'mapped'|'unmapped' }}
 */
function resolveItem(record) {
  const recId = record?.menuItemId != null ? String(record.menuItemId) : ''
  return recId
    ? { menuItemId: recId, mapStatus: 'mapped' }
    : { menuItemId: null, mapStatus: 'unmapped' }
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

  // ── Item : identité = mapping Data Integration, résolue en amont par le backend ────
  // Pas de mémo : `resolveItem` est une lecture de champ, pas une recherche.
  const match = resolveItem(record)

  const matchedItem = match.menuItemId
    ? ctx.menuItemById.get(String(match.menuItemId)) || null
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
//
// BUG-353-01 (2026-08-24) : `resolveItem` (5 étapes, match flou par nom au seuil 70 sur
// l'assignation SpaceMenu du PdV) et `toAssignmentMap` supprimés. `mapStatus` ne vaut plus
// 'remapped' : le front ne remappe plus rien, il lit le mapping Data Integration. Modifier
// le SpaceMenu n'a désormais AUCUN effet sur les chiffres de l'Analyse.
