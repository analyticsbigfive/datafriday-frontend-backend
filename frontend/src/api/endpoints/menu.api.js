// src/api/endpoints/menu.api.js
// API pour la gestion des Menus, Ingredients, Packaging

import { api } from '../client'

// ============================================
// MENU ITEMS
// ============================================

/**
 * Récupérer tous les menu items
 * @returns {Promise<Array>}
 */
export async function getMenuItems({ page, limit } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return api.get(`/menu-items${qs ? '?' + qs : ''}`)
}

/**
 * Créer un menu item
 * @param {Object} item 
 * @returns {Promise<Object>}
 */
export async function createMenuItem(item) {
  const result = await api.post('/menu-items', item)
  // Notifier les composants
  window.dispatchEvent(new CustomEvent('menuItemsChanged'))
  return result
}

/**
 * Mettre à jour un menu item
 * @param {string} id 
 * @param {Object} updates 
 * @returns {Promise<Object>}
 */
export async function updateMenuItem(id, updates) {
  const result = await api.patch(`/menu-items/${id}`, updates)
  window.dispatchEvent(new CustomEvent('menuItemsChanged'))
  return result
}

/**
 * Supprimer un menu item
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteMenuItem(id) {
  await api.delete(`/menu-items/${id}`)
  window.dispatchEvent(new CustomEvent('menuItemsChanged'))
}

/**
 * Rafraîchir les coûts des menu items
 * @returns {Promise<Object>}
 */
export async function refreshMenuItemCosts() {
  const result = await api.post('/menu-items/refresh-costs')
  window.dispatchEvent(new CustomEvent('menuItemsChanged'))
  return result
}

/**
 * Récupérer tous les snapshots de menu items
 * @returns {Promise<Array>}
 */
export async function getMenuItemSnapshots() {
  return api.get('/menu-item-snapshots')
}

// ============================================
// MENU COMPONENTS
// ============================================

/**
 * Récupérer tous les composants de menu
 * @returns {Promise<Array>}
 */
export async function getMenuComponents({ page, limit } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return api.get(`/menu-components${qs ? '?' + qs : ''}`)
}

/**
 * Créer un composant de menu
 * @param {Object} component 
 * @returns {Promise<Object>}
 */
export async function createMenuComponent(component) {
  return api.post('/menu-components', component)
}

/**
 * Supprimer un composant de menu
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteMenuComponent(id) {
  return api.delete(`/menu-components/${id}`)
}

/**
 * Récupérer un composant par ID
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getMenuComponent(id) {
  return api.get(`/menu-components/${id}`)
}

/**
 * Mettre à jour un composant de menu
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateMenuComponent(id, data) {
  return api.patch(`/menu-components/${id}`, data)
}

/**
 * Réparer les composants de menu
 * @returns {Promise<Object>}
 */
export async function repairMenuComponents() {
  return api.post('/menu-components/repair')
}

// ============================================
// COMPONENT TAXONOMY (Component Type / Component Category)
// Taxonomie dédiée, indépendante de Product Type/Category et Market Price Type/Category.
// ============================================

/**
 * BUG-169 : accepte { page, limit } pour paginer côté serveur (le store boucle sur les
 * pages pour reconstituer la liste complète — voir store/modules/componentTypes.js).
 * `search` : filtre serveur (contains/insensible à la casse sur le nom) — utilisé par
 * ComponentTypeList.vue pour sa pagination + recherche réelles côté serveur.
 * @param {{ page?: number, limit?: number, search?: string }} [opts]
 */
export async function getComponentTypes({ page, limit, search } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  if (search) params.set('search', search)
  const qs = params.toString()
  return api.get(`/component-types${qs ? '?' + qs : ''}`)
}

export async function createComponentType(componentType) {
  return api.post('/component-types', componentType)
}

export async function updateComponentType(id, componentType) {
  return api.patch(`/component-types/${id}`, componentType)
}

export async function deleteComponentType(id) {
  return api.delete(`/component-types/${id}`)
}

/**
 * BUG-169 : accepte { page, limit } pour paginer côté serveur (le store boucle sur les
 * pages pour reconstituer la liste complète — voir store/modules/componentCategories.js).
 * `search` : filtre serveur (contains/insensible à la casse sur le nom) — utilisé par
 * ComponentCategoryList.vue pour sa pagination + recherche réelles côté serveur.
 * @param {{ page?: number, limit?: number, search?: string }} [opts]
 */
export async function getComponentCategories({ page, limit, search } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  if (search) params.set('search', search)
  const qs = params.toString()
  return api.get(`/component-categories${qs ? '?' + qs : ''}`)
}

export async function createComponentCategory(componentCategory) {
  return api.post('/component-categories', componentCategory)
}

export async function updateComponentCategory(id, componentCategory) {
  return api.patch(`/component-categories/${id}`, componentCategory)
}

export async function deleteComponentCategory(id) {
  return api.delete(`/component-categories/${id}`)
}

// ============================================
// INGREDIENTS
// ============================================

/**
 * Récupérer tous les ingrédients
 * @returns {Promise<Array>}
 */
export async function getIngredients({ page, limit } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return api.get(`/ingredients${qs ? '?' + qs : ''}`)
}

/**
 * Créer un ingrédient
 * @param {Object} ingredient 
 * @returns {Promise<Object>}
 */
export async function createIngredient(ingredient) {
  return api.post('/ingredients', ingredient)
}

/**
 * Supprimer un ingrédient
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function updateIngredient(id, data) {
  return api.patch(`/ingredients/${id}`, data)
}

export async function deleteIngredient(id) {
  return api.delete(`/ingredients/${id}`)
}

/**
 * Nettoyer les ingrédients invalides
 * @returns {Promise<Object>}
 */
export async function cleanupInvalidIngredients() {
  return api.post('/ingredients/cleanup')
}

// ============================================
// PACKAGING
// ============================================

/**
 * Récupérer tous les packagings
 * @returns {Promise<Array>}
 */
export async function getPackaging({ page, limit } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return api.get(`/packaging${qs ? '?' + qs : ''}`)
}

/**
 * Créer un packaging
 * @param {Object} packaging 
 * @returns {Promise<Object>}
 */
export async function createPackaging(packaging) {
  return api.post('/packaging', packaging)
}

/**
 * Supprimer un packaging
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function updatePackaging(id, data) {
  return api.patch(`/packaging/${id}`, data)
}

export async function deletePackaging(id) {
  return api.delete(`/packaging/${id}`)
}

/**
 * Nettoyer les packagings invalides
 * @returns {Promise<Object>}
 */
export async function cleanupInvalidPackaging() {
  return api.post('/packaging/cleanup')
}

// ============================================
// MARKET PRICES
// ============================================

/**
 * Récupérer tous les prix du marché
 * @param {{ page?: number, limit?: number }} [opts]
 * @returns {Promise<Array>}
 */
export async function getMarketPrices({ page, limit } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return api.get(`/market-prices${qs ? '?' + qs : ''}`)
}

export async function getMarketPricesWithIngredients({ page, limit, search, category, goodType } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  if (search) params.set('search', search)
  if (category) params.set('category', category)
  if (goodType) params.set('goodType', goodType)
  const qs = params.toString()
  return api.get(`/market-prices/with-ingredients${qs ? '?' + qs : ''}`)
}

export async function getMarketPricesWithPackagings({ page, limit, search, category, goodType } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  if (search) params.set('search', search)
  if (category) params.set('category', category)
  if (goodType) params.set('goodType', goodType)
  const qs = params.toString()
  return api.get(`/market-prices/with-packagings${qs ? '?' + qs : ''}`)
}

export async function getIngredientsByMarketPrice(marketPriceId) {
  return api.get(`/ingredients/by-market-price/${marketPriceId}`)
}

/**
 * Récupérer un prix du marché par ID
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getMarketPrice(id) {
  return api.get(`/market-prices/${id}`)
}

/**
 * Créer un prix du marché
 * @param {Object} price 
 * @returns {Promise<Object>}
 */
export async function createMarketPrice(price) {
  return api.post('/market-prices', price)
}

/**
 * Mettre à jour un prix du marché
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function updateMarketPrice(id, data) {
  return api.patch(`/market-prices/${id}`, data)
}

/**
 * Supprimer un prix du marché
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteMarketPrice(id) {
  return api.delete(`/market-prices/${id}`)
}

/**
 * Supprimer tous les prix pour un itemName
 * @param {string} itemName
 * @returns {Promise<Object>}
 */
export async function deleteMarketPricesByItemName(itemName) {
  return api.delete(`/market-prices/item/${encodeURIComponent(itemName)}`)
}

/**
 * Importer des prix en masse
 * @param {Array} items
 * @returns {Promise<Array>}
 */
export async function importMarketPrices(items) {
  return api.post('/market-prices/import', { items })
}

/**
 * Dédupliquer les prix du marché
 * @returns {Promise<Object>}
 */
export async function deduplicateMarketPrices() {
  return api.post('/market-prices/deduplicate')
}

// ============================================
// SUPPLIERS
// ============================================

/**
 * Récupérer tous les fournisseurs
 * @param {{page?: number, limit?: number}} [opts]
 * @returns {Promise<Array>}
 */
export async function getSuppliers({ page, limit } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return api.get(`/suppliers${qs ? `?${qs}` : ''}`)
}

/**
 * Créer un fournisseur
 * @param {Object} supplier 
 * @returns {Promise<Object>}
 */
export async function createSupplier(supplier) {
  return api.post('/suppliers', supplier)
}

/**
 * Récupérer un fournisseur par ID
 * @param {string} id
 * @returns {Promise<Object>}
 */
export async function getSupplier(id) {
  return api.get(`/suppliers/${id}`)
}

/**
 * Mettre à jour un fournisseur
 * @param {string} id
 * @param {Object} supplier
 * @returns {Promise<Object>}
 */
export async function updateSupplier(id, supplier) {
  return api.patch(`/suppliers/${id}`, supplier)
}

/**
 * Supprimer un fournisseur
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteSupplier(id) {
  return api.delete(`/suppliers/${id}`)
}

// ============================================
// SPACE MENU CONFIGURATIONS
// ============================================

/**
 * Récupérer la configuration de menu d'un espace
 * @param {string} spaceId 
 * @param {string} configId 
 * @returns {Promise<Object>}
 */
export async function getSpaceMenuConfiguration(spaceId, configId) {
  // Route backend réelle = singulier "space-menu" (@Controller('space-menu')) — "space-menus"
  // (pluriel) n'existe pas et renvoyait un 404 silencieux à tous les appelants de cette fonction.
  return api.get(`/space-menu/${spaceId}/${configId}`)
}

/**
 * Version batchée/légère de getShopMenuItems : articles ACTIVÉS (id/nom/catégorie)
 * pour TOUS les shops d'un config en 1 appel, au lieu d'1 appel par shop avec la
 * structure imbriquée complète (composants/ingrédients/pricing).
 * @param {string} spaceId
 * @param {string} configId
 * @returns {Promise<Record<string, {shopName:string, items:{id:string,name:string,category:string}[]}>>}
 */
export async function getConfigShopMenuItemsLight(spaceId, configId) {
  return api.get(`/space-menu/${spaceId}/${configId}/shop-items`)
}

/**
 * Sauvegarder la configuration de menu d'un espace
 * @param {Object} params
 * @returns {Promise<Object>}
 */
export async function saveSpaceMenuConfiguration(params) {
  const { spaceId, configId, menuItems } = params
  return api.post('/space-menu', { spaceId, configId, menuItems })
}

/**
 * Rattacher des menu items à un shop
 * @param {string} spaceId
 * @param {string} configId
 * @param {string} shopId - clé dans menuItems (element ID)
 * @param {Object} menuItemsMap - { [menuItemId]: boolean }
 * @returns {Promise<Object>}
 */
export async function assignMenuItemsToShop(spaceId, configId, shopId, menuItemsMap) {
  return api.post('/space-menu', {
    spaceId,
    configId,
    menuItems: {
      [shopId]: menuItemsMap,
    },
  })
}

/**
 * Récupérer les menu items d'un shop
 * @param {string} shopId 
 * @returns {Promise<Array>}
 */
export async function getShopMenuItems(shopId, configId) {
  // configId : scope des assignations (élément v2 partagé entre configs) ; sans lui le
  // backend retombe sur la config v1 du parent puis la 1re adhésion (arbitraire).
  return api.get(`/space-menu/shop/${shopId}`, { params: configId ? { configId } : {} })
}

/**
 * Catalogue complet du tenant avec disponibilité calculée côté SERVEUR pour ce shop
 * (ingrédients actifs + fournisseur résolu + fournisseur livrant l'espace du shop).
 * Une seule requête légère : remplace catalogue paginé + recettes complètes côté front.
 * @param {string} shopId
 * @returns {Promise<{shopId: string, shopName: string, spaceId: ?string, configId: ?string, counts: Object, items: Array}>}
 */
export async function getShopAvailableMenuItems(shopId, configId, { enabledOnly = false } = {}) {
  // configId : même scope que getShopMenuItems (le drawer doit TOUJOURS l'envoyer).
  // enabledOnly : seulement les items ACTIVÉS sur ce shop (menu du shop, pas le catalogue) —
  // pour les lecteurs qui n'assignent pas (inspecteur builder2). Le drawer, lui, veut tout.
  const params = {}
  if (configId) params.configId = configId
  if (enabledOnly) params.enabledOnly = 'true'
  return api.get(`/space-menu/shop/${shopId}/items`, { params })
}

/**
 * Inventaire dérivé du menu d'un shop : ingrédients directs, packagings et composants
 * (lignes terminales, sous-recettes non dépliées) des menu items ACTIVÉS sur ce shop,
 * dédupliqués entre produits, avec les menu items qui les utilisent (usedIn).
 * @param {string} shopId
 * @param {string} [configId]
 * @returns {Promise<{shopId: string, spaceId: ?string, configId: ?string, counts: Object, items: Array}>}
 */
export async function getShopInventory(shopId, configId) {
  return api.get(`/space-menu/shop/${shopId}/inventory`, { params: configId ? { configId } : {} })
}

/**
 * Inventaire agrégé d'un élément STORAGE (builder2) : union des inventaires dérivés des
 * shops sélectionnés, dédupliquée entre shops. Chaque référence porte son storageType
 * (dry|cold|belowzero|null) et les shops qui l'utilisent avec leurs menu items.
 * @param {string[]} shopIds
 * @param {string} [configId]
 * @returns {Promise<{configId: ?string, shops: Array, counts: Object, items: Array}>}
 */
export async function getStorageInventory(shopIds, configId) {
  const params = { shopIds: (shopIds || []).join(',') }
  if (configId) params.configId = configId
  return api.get('/space-menu/storage-inventory', { params })
}

/**
 * Menu items associés à un espace (condition 0) avec la MÊME disponibilité serveur que
 * le drawer shop (règles fournisseur×espace). Sert la vue « By Menu Item ».
 * @param {string} spaceId
 * @returns {Promise<{spaceId: string, counts: Object, items: Array}>}
 */
export async function getSpaceMenuItemsWithAvailability(spaceId) {
  return api.get(`/space-menu/space/${spaceId}/items`)
}

// ============================================
// MENU ITEM MAPPINGS
// ============================================

/**
 * Récupérer les mappings de menu items
 * @param {string} [location] 
 * @returns {Promise<Array>}
 */
export async function getMenuItemMappings(location) {
  const url = location
    ? `/menu-item-mappings?location=${encodeURIComponent(location)}`
    : '/menu-item-mappings'
  return api.get(url)
}

/**
 * Sauvegarder un mapping de menu item
 * @param {Object} params 
 * @returns {Promise<Object>}
 */
export async function saveMenuItemMapping(params) {
  const { fnbItem, menuItemId, menuItemName } = params
  return api.post('/menu-item-mappings', { fnbItem, menuItemId, menuItemName })
}

/**
 * Supprimer un mapping de menu item
 * @param {string} fnbItem 
 * @returns {Promise<void>}
 */
export async function deleteMenuItemMapping(fnbItem) {
  return api.delete(`/menu-item-mappings/${encodeURIComponent(fnbItem)}`)
}

// ============================================
// MENU REVENUE
// ============================================

/**
 * Calculer le revenu d'un menu item
 * @param {Object} params 
 * @returns {Promise<Object>}
 */
export async function calculateSingleMenuItemRevenue(params) {
  const { location, menuItemId, menuItemName } = params
  return api.post('/events/calculate-single-menu-item-revenue', {
    location,
    menuItemId,
    menuItemName
  })
}

/**
 * Sauvegarder le calcul de revenu de menu
 * @param {string} location 
 * @param {Object} data 
 * @returns {Promise<Object>}
 */
export async function saveMenuRevenueCalculation(location, data) {
  return api.post('/menu-revenue/save', { location, data })
}

/**
 * Récupérer le calcul de revenu de menu
 * @param {string} location 
 * @returns {Promise<Object>}
 */
export async function getMenuRevenueCalculation(location) {
  return api.get(`/menu-revenue/${encodeURIComponent(location)}`)
}

/**
 * Récupérer les totaux de revenu de menu
 * @param {string} location 
 * @returns {Promise<Array>}
 */
export async function getMenuRevenueTotals(location) {
  return api.get(`/menu-revenue/${encodeURIComponent(location)}/totals`)
}

// ============================================
// CSV MAPPINGS
// ============================================

/**
 * Sauvegarder un mapping CSV
 * @param {string} mappingType 
 * @param {Object} mapping 
 * @returns {Promise<Object>}
 */
export async function saveCSVMapping(mappingType, mapping) {
  return api.post('/csv-mappings', { mappingType, mapping })
}

/**
 * Récupérer un mapping CSV
 * @param {string} mappingType 
 * @returns {Promise<Object|null>}
 */
export async function getCSVMapping(mappingType) {
  try {
    return await api.get(`/csv-mappings/${mappingType}`)
  } catch (error) {
    if (error.response?.status === 404) {
      return null
    }
    throw error
  }
}

// ============================================
// PRODUCT TYPES (dynamiques)
// ============================================

/**
 * Récupérer tous les types de produits
 * @returns {Promise<Array>}
 */
export async function getProductTypes() {
  return api.get('/product-types')
}

// ============================================
// PRODUCT CATEGORIES (dynamiques)
// ============================================

/**
 * Récupérer toutes les catégories de produits
 * @param {string} [typeId] - Filtrer par type
 * @returns {Promise<Array>}
 */
export async function getProductCategories(typeId) {
  const url = typeId ? `/product-categories?typeId=${encodeURIComponent(typeId)}` : '/product-categories'
  return api.get(url)
}

// ============================================
// MARGIN THRESHOLDS
// ============================================

/**
 * Récupérer les paramètres de seuil de marge
 * @returns {Promise<Object>}
 */
export async function getMarginThresholdSettings() {
  return api.get('/margin-thresholds')
}

/**
 * Sauvegarder les paramètres de seuil de marge
 * @param {Object} settings 
 * @returns {Promise<Object>}
 */
export async function saveMarginThresholdSettings(settings) {
  return api.post('/margin-thresholds', settings)
}

/**
 * Recalculer toutes les agrégations
 * @returns {Promise<Object>}
 */
export async function recalculateAllAggregations() {
  return api.post('/aggregations/recalculate')
}