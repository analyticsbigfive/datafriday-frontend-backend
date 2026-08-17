import { normalizeShopType, OTHER_SHOP_TYPE } from '@/constants/shopTypes'
import { UNATTACHED_SHOP_KEY } from '@/utils/analyseReconciliation'
import { normalizeStr } from '@/utils/predictiveAnalytics'
import { isMinuteInRange } from '@/utils/timelineBucketing'

function textValue(value) {
  if (typeof value === 'string') return value.trim()
  if (value && typeof value === 'object') {
    return String(value.name || value.label || '').trim()
  }
  return ''
}

function normalizedKey(value) {
  return String(value || '').trim().toLocaleLowerCase()
}

/**
 * Complète dimensions article absentes du RPC granulaire avec catalogue.
 * Supporte modèle courant (typeId/categoryId) et champs legacy (type/category).
 */
export function enrichGranularMenuDimensions(
  records = [],
  menuItems = [],
  productTypes = [],
  productCategories = [],
  weezeventProducts = [],
  productMappings = [],
) {
  const typeById = new Map(productTypes.map((entry) => [String(entry?.id), entry]))
  const categoryById = new Map(productCategories.map((entry) => [String(entry?.id), entry]))
  const itemById = new Map()
  const itemByName = new Map()
  const weezeventProductById = new Map()
  const weezeventProductByName = new Map()
  const mappingByProductId = new Map()

  for (const item of menuItems) {
    if (item?.id != null) itemById.set(String(item.id), item)
    const name = normalizedKey(item?.name)
    if (name && !itemByName.has(name)) itemByName.set(name, item)
  }

  for (const product of weezeventProducts) {
    for (const id of [product?.id, product?.weezeventId, product?.productId, product?.externalId]) {
      if (id != null) weezeventProductById.set(String(id), product)
    }
    const name = normalizedKey(product?.name || product?.productName || product?.label)
    if (name && !weezeventProductByName.has(name)) weezeventProductByName.set(name, product)
  }

  for (const mapping of productMappings) {
    const productId = mapping?.weezeventProductId || mapping?.productId || mapping?.product?.id
    if (productId != null) mappingByProductId.set(String(productId), mapping)
  }

  // Catalogue : catégorie → type parent, pour corriger un menuItemType qui serait
  // en réalité une catégorie (ex. 'Beer' → type parent 'Beverage').
  const catParentMap = buildCategoryParentTypeMap(productCategories, productTypes)

  return records.map((record) => {
    const weezeventProductId = record?.weezeventProductId || record?.productId || record?.weezeventItemId
    const mapping = mappingByProductId.get(String(weezeventProductId || '')) || null
    const mappedMenuItemId = record?.menuItemId || mapping?.menuItemId || mapping?.menuItem?.id
    const transactionProductName = record?.productName
      || record?.transactionItemName
      || record?.weezeventProductName
      || record?.itemName
    const weezeventProduct = weezeventProductById.get(String(weezeventProductId || ''))
      || weezeventProductByName.get(normalizedKey(transactionProductName))
      || null
    const item = itemById.get(String(mappedMenuItemId || ''))
      || itemByName.get(normalizedKey(record?.menuItemName || record?.itemName))
      || null

    // Dimensions = catalogue DataFriday UNIQUEMENT (plus aucun repli Weezevent
    // nature/subnature : la réconciliation getter ré-résout de toute façon depuis
    // le catalogue ; on garde ici la résolution catalogue comme valeur d'amorçage).
    const menuItemType = textValue(record?.menuItemType)
      || textValue(item?.menuItemType)
      || textValue(item?.type)
      || textValue(item?.typeName)
      || textValue(typeById.get(String(item?.typeId || '')))
      || null

    const menuItemCategory = textValue(record?.menuItemCategory)
      || textValue(item?.menuItemCategory)
      || textValue(item?.category)
      || textValue(item?.categoryName)
      || textValue(categoryById.get(String(item?.categoryId || '')))
      || null

    // Corrige le type s'il pointe en fait une catégorie (mapping incohérent).
    const correctedType = correctTypeViaCatalog(menuItemType, catParentMap)
    const correctedCategory = correctedType !== menuItemType
      ? (menuItemCategory || menuItemType)
      : menuItemCategory

    return {
      ...record,
      menuItemId: mappedMenuItemId || null,
      menuItemName: record?.menuItemName
        || transactionProductName
        || item?.name
        || weezeventProduct?.name
        || weezeventProduct?.productName
        || null,
      menuItemType: correctedType,
      menuItemCategory: correctedCategory,
    }
  })
}

/**
 * Nom d'article résolu, tolérant à la forme du record. Le champ canonique d'un
 * `ShopGranularRecord` est `itemName` (cf. types/index.js) ; `enrichGranularMenuDimensions`
 * ajoute `menuItemName`, et les records prédictifs (usePredictiveTimeline) portent
 * `mappedMenuItemName`/`itemName` mais PAS toujours `menuItemName`. Le panneau de
 * droite (« Performance des articles ») et les filtres doivent donc résoudre le nom
 * via ce fallback unique, sinon les records sans `menuItemName` se regroupent sous
 * « — » (bug : « pas d'items item par item » sur un event sélectionné).
 * @param {Record<string, unknown>} r
 * @returns {string} nom d'article, ou '' si aucun champ exploitable.
 */
export function resolveItemName(r) {
  return (
    r?.menuItemName ||
    r?.itemName ||
    r?.mappedMenuItemName ||
    r?.name ||
    ''
  )
}

/**
 * Sentinelle du regroupement par DisplayName (même rôle que UNATTACHED_ITEM_KEY :
 * une clé technique, traduite à l'affichage, jamais un nom d'article réel).
 */
export const NO_DISPLAY_NAME_KEY = '__NO_DISPLAY_NAME__'

/**
 * Index catalogue pour le regroupement par DisplayName (référentiel N→1 :
 * plusieurs MenuItem partagent un même libellé commercial — `MenuItem.displayNameId`).
 *
 * Deux sorties, une par usage :
 * - `nameByMenuItemId` : id d'article → libellé DisplayName, pour la clé de REGROUPEMENT ;
 * - `itemNamesByDisplayName` : libellé → noms d'articles membres, pour le FILTRE
 *   (le filtre article de la page travaille sur des NOMS, pas des ids — cf.
 *   store/modules/analyse.js, `itemNameSet`).
 *
 * @param {Array<Record<string, unknown>>} menuItems catalogue (store.state.analyse.menuItems)
 * @returns {{ nameByMenuItemId: Map<string,string>, itemNamesByDisplayName: Map<string,string[]> }}
 */
export function buildDisplayNameIndex(menuItems = []) {
  const nameByMenuItemId = new Map()
  const membersByDisplayName = new Map()
  for (const mi of menuItems || []) {
    const id = mi?.id != null ? String(mi.id) : ''
    // Le catalogue peut porter l'objet relation ({id,name}) ou un simple libellé.
    const dn = textValue(mi?.displayName)
    if (!id || !dn) continue
    nameByMenuItemId.set(id, dn)
    const itemName = textValue(mi?.name)
    if (!itemName) continue
    if (!membersByDisplayName.has(dn)) membersByDisplayName.set(dn, new Set())
    membersByDisplayName.get(dn).add(itemName)
  }
  const itemNamesByDisplayName = new Map()
  for (const [dn, set] of membersByDisplayName) itemNamesByDisplayName.set(dn, [...set])
  return { nameByMenuItemId, itemNamesByDisplayName }
}

/**
 * Clé de regroupement « par DisplayName » d'un record de vente.
 *
 * Retourne NO_DISPLAY_NAME_KEY dans DEUX cas volontairement fusionnés (décision
 * produit 17/08 : un seul bucket) — l'article est mappé au catalogue mais aucun
 * DisplayName ne lui est affecté, OU la vente n'est rattachée à aucun article
 * (produit non mappé, donc aucun id résoluble). Le bucket mélange donc « pas
 * encore renseigné » et « pas rattaché » ; c'est assumé.
 *
 * L'id est fiable sur les records item-level : `reconcileRecord` renseigne
 * `menuItemId` depuis le catalogue avant toute agrégation.
 *
 * @param {Record<string, unknown>} record
 * @param {{ nameByMenuItemId: Map<string,string> }} index issu de buildDisplayNameIndex
 * @returns {string} libellé DisplayName, ou NO_DISPLAY_NAME_KEY
 */
export function resolveDisplayNameGroup(record, index) {
  const map = index?.nameByMenuItemId
  if (!map || !map.size) return NO_DISPLAY_NAME_KEY
  const id = record?.menuItemId ?? record?.mappedMenuItemId
  if (id == null || id === '') return NO_DISPLAY_NAME_KEY
  return map.get(String(id)) || NO_DISPLAY_NAME_KEY
}

/** Libellés lisibles des buckets (clé technique → affichage). */
export const MENU_BUCKET_LABELS = { FOOD: 'Food', BEVERAGE: 'Beverage', BEER: 'Beer', COMBO: 'Combo' }

/**
 * Classe chaque record dans Combo / Food / Beverage / Beer — pas d'UNCLASSIFIED.
 * Combo = signal EXPLICITE uniquement (flag comboItem ou mot-clé combo/formule/
 * meal deal) ; on NE devine PAS un combo depuis un PdV mixte (faux positifs).
 * Autres signaux par priorité : type/catégorie/nom d'article + nature Weezevent,
 * puis repli sur le type de PdV (shopType). Beer prime sur Beverage (une bière
 * est une boisson mais on la veut distincte). Sans aucun signal → Beverage par
 * défaut (concession générique = majorité boissons).
 */
// Signaux ARTICLE par famille — exportés pour que le Rapport J+1 puisse classer
// au niveau article seul (sans le repli PdV, qui envoie un Coca vendu à un stand
// food dans Food). Toute évolution d'un motif ici vaut pour les deux consommateurs.
export const BEER_SIGNAL_RE = /\b(beer|bi[eè]re|ale|lager|ipa|pils|pression|draught|stout|blonde|brune)\b/
export const FOOD_SIGNAL_RE = /\b(food|nourriture|meal|snack|burger|pizza|sandwich|dessert|hot ?dog|fri(t|es)|nacho|popcorn|candy|sweet|cr[eê]pe|gaufre|tacos|kebab|wrap|salad|salade)\b/
export const BEVERAGE_SIGNAL_RE = /\b(beverage|drink|boisson|soft|water|eau|cocktail|wine|vin|soda|cola|coca|coffee|caf[eé]|th[eé]|tea|juice|jus|champagne|spirit|alcool|cider|cidre)\b/

/** Concatène les champs ARTICLE d'un record en clé normalisée (sans le PdV). */
export function menuItemSignalHay(record) {
  return [
    record?.menuItemType,
    record?.menuItemCategory,
    record?.menuItemName,
    record?.itemName,
    record?.productName,
    record?.weezpayNature,
    record?.weezpaySubnature,
  ].map(normalizedKey).join(' ')
}

export function classifyMenuRevenueBucket(record) {
  const hay = menuItemSignalHay(record)
  const shop = normalizedKey(record?.shopType || record?.shopName)

  // Combo en premier : signal explicite (flag ou mot-clé), jamais déduit.
  if (normalizedKey(record?.comboItem) === 'yes'
    || record?.comboItem === true
    || /\b(combo|formule|meal ?deal)\b/.test(hay)) return 'COMBO'

  if (BEER_SIGNAL_RE.test(hay)
    || /\b(beer|biere|brew)\b/.test(shop)) return 'BEER'
  if (FOOD_SIGNAL_RE.test(hay)
    || shop.includes('food') || shop.includes('snack') || shop.includes('rest')) return 'FOOD'
  if (BEVERAGE_SIGNAL_RE.test(hay)
    || shop.includes('bar') || shop.includes('beverage') || shop.includes('drink') || shop.includes('boisson')) return 'BEVERAGE'

  return 'BEVERAGE'
}

/** Bucket lisible d'un record : 'Food' | 'Beverage' | 'Beer' | 'Combo'. */
export function menuBucketLabel(record) {
  return MENU_BUCKET_LABELS[classifyMenuRevenueBucket(record)] || 'Beverage'
}

/**
 * Résolveurs de clé de dimension — clé UNIQUE partagée entre regroupement (donut),
 * filtre (store) et tables. Lisent les champs RÉCONCILIÉS (posés par
 * `analyseReconciliation` depuis le catalogue DataFriday : nom de catégorie/type
 * réel, ou sentinelle UNATTACHED_*_KEY). AUCUN repli Weezevent/regex : une vente
 * non matchée reste « Non rattachés », jamais reclassée par mot-clé.
 * Règle d'or : un donut qui regroupe via `resolveX` impose que le filtre/getter
 * correspondant utilise le MÊME `resolveX`, sinon clic→filtre = 0 ligne.
 */
export const resolveItemType = (r) => textValue(r?.menuItemType)
export const resolveItemCategory = (r) => textValue(r?.menuItemCategory)
// shopType réconcilié (FloorElement DataFriday) déjà normalisé. On protège la
// sentinelle « PdV non rattaché » d'une re-normalisation qui la diluerait en « other ».
// PdV MULTI-subtypes builder2 (clé composite 'food, beverages') : VENTILATION par
// article — chaque vente est rangée sous le type de l'ARTICLE vendu, repli 1er
// subtype (ordre canonique) si l'article ne se résout pas. Le donut n'expose ainsi
// que des types simples, jamais de slice « Food & Beverages ».
// Repli : si le type du PdV est générique (« shop » → OTHER) ou absent, on DÉRIVE
// la catégorie depuis l'ARTICLE vendu (un PdV « shop » multi-catégories voit sa part
// se ranger sous Food/Beverage/… selon ce qu'il vend, au lieu d'un fourre-tout « Other »).
export const resolveShopType = (r) => {
  if (r?.shopType === UNATTACHED_SHOP_KEY) return r.shopType
  const t = normalizeShopType(r?.shopType)
  const fromItem = normalizeShopType(r?.menuItemType)
  if (t.includes(',')) {
    if (fromItem && fromItem !== OTHER_SHOP_TYPE && !fromItem.includes(',')) return fromItem
    return t.split(', ')[0]
  }
  if (t && t !== OTHER_SHOP_TYPE) return t
  return fromItem && fromItem !== OTHER_SHOP_TYPE ? fromItem : t
}

/**
 * Map nom-de-catégorie (lowercase) → nom du TYPE parent, depuis le catalogue.
 * Sert à corriger les records où `menuItemType` vaut en réalité un nom de catégorie
 * (mapping incohérent : ex. type='Beer' alors que Beer est une catégorie de Beverage).
 * @param {Array} productCategories  catégories { name, typeId?, typeName? }
 * @param {Array} productTypes       types { id, name } (pour résoudre typeId→nom)
 * @returns {Map<string,string>}
 */
export function buildCategoryParentTypeMap(productCategories = [], productTypes = []) {
  const typeNameById = new Map(productTypes.map((t) => [String(t?.id), textValue(t?.name)]))
  const map = new Map()
  for (const c of productCategories) {
    const name = normalizedKey(c?.name)
    const parent = textValue(c?.typeName) || textValue(typeNameById.get(String(c?.typeId || '')))
    if (name && parent) map.set(name, parent)
  }
  return map
}

/**
 * Si `menuItemType` est en fait un nom de catégorie connue (parent ≠ lui-même),
 * renvoie le TYPE parent ; sinon renvoie la valeur d'origine. Pilote la correction
 * « Beer dans By item type » sans table en dur (catalogue = vérité).
 * @param {string} menuItemType
 * @param {Map<string,string>} catParentMap
 * @returns {string}
 */
export function correctTypeViaCatalog(menuItemType, catParentMap) {
  if (!catParentMap || !catParentMap.size) return menuItemType
  const parent = catParentMap.get(normalizedKey(menuItemType))
  if (parent && normalizedKey(parent) !== normalizedKey(menuItemType)) return parent
  return menuItemType
}

/**
 * Applique la correction de type catalogue à une liste de records (item-level ou
 * shop-level déjà enrichis). Si `menuItemType` était une catégorie → remap vers le
 * type parent, et si `menuItemCategory` est vide on y bascule la valeur d'origine.
 * @param {Array} records
 * @param {Map<string,string>} catParentMap
 * @returns {Array}
 */
export function applyCatalogTypeCorrection(records = [], catParentMap) {
  if (!catParentMap || !catParentMap.size) return records
  return records.map((r) => {
    const rawType = textValue(r?.menuItemType)
    const corrected = correctTypeViaCatalog(rawType, catParentMap)
    if (corrected === rawType) return r
    return {
      ...r,
      menuItemType: corrected,
      menuItemCategory: textValue(r?.menuItemCategory) || rawType,
    }
  })
}

/**
 * Prédicat de filtrage des records ITEM-LEVEL — miroir du getter store
 * `filteredShopGranularData` (`store/modules/analyse.js`), qui ne filtre que le
 * shop-level. Les charts consomment l'item-level : sans ce prédicat, cliquer une
 * part de donut ne filtrerait rien.
 *
 * INVARIANT : les 6 dimensions passent par les mêmes `resolveX` que les charts
 * qui groupent dessus (règle documentée plus haut dans ce fichier). Filtrer sur
 * un champ brut au lieu du champ réconcilié ferait que la part « Non rattachés »
 * (qui émet `UNATTACHED_ITEM_KEY`) ne matche aucune ligne.
 *
 * `skipMinute` : à poser pour la timeline, qui ÉCRIT `selectedTimeRange`.
 * L'appliquer à sa propre entrée rétrécit ses labels, ce qui redéfinit à quoi
 * correspond un même pourcentage de curseur — boucle de rétrécissement monotone.
 *
 * NB : `selectedShopIds`/`selectedMenuItemIds` stockent des NOMS, pas des ids —
 * d'où la comparaison normalisée des deux côtés (le catalogue et les records
 * peuvent différer de casse).
 */
export function buildItemFilterPredicate(f = {}, { skipMinute = false } = {}) {
  const shopSet = (f.selectedShopIds || []).length ? new Set(f.selectedShopIds.map(normalizeStr)) : null
  const itemSet = (f.selectedMenuItemIds || []).length ? new Set(f.selectedMenuItemIds.map(normalizeStr)) : null
  const shopTypes = f.selectedShopTypes || []
  const shopAreas = f.selectedShopAreas || []
  const itemTypes = f.selectedMenuItemTypes || []
  const itemCats = f.selectedMenuItemCategories || []
  const range = f.selectedTimeRange
  return (r) => {
    if (shopSet && !shopSet.has(normalizeStr(r.shopName))) return false
    if (shopTypes.length && !shopTypes.includes(resolveShopType(r))) return false
    if (shopAreas.length && !shopAreas.includes(r.shopArea)) return false
    if (itemSet && !itemSet.has(normalizeStr(resolveItemName(r)))) return false
    if (itemTypes.length && !itemTypes.includes(resolveItemType(r))) return false
    if (itemCats.length && !itemCats.includes(resolveItemCategory(r))) return false
    if (!skipMinute && !isMinuteInRange(r.minute, range)) return false
    return true
  }
}

/** Rend slug technique lisible sans modifier clé utilisée par filtres. */
export function humanizeDimensionLabel(value, labels = {}) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw
    .split(',')
    .map((part) => {
      const key = normalizedKey(part)
      if (labels[key]) return labels[key]
      return part
        .trim()
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase())
    })
    .join(', ')
}
