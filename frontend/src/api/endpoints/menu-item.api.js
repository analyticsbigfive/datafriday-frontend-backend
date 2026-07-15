// src/api/endpoints/menu-item.api.js
// API pour la gestion des Menu Items

import { api } from '../client'

// ============================================
// MENU ITEMS
// ============================================

/**
 * Créer un article de menu
 * @param {Object} menuItem - Les données du menu item
 * @returns {Promise<Object>}
 */
export async function createMenuItem(menuItem) {
  return api.post('/menu-items', menuItem)
}

/**
 * Créer plusieurs articles de menu en une seule requête (bulk)
 * @param {Array<Object>} items - Liste des menu items à créer
 * @returns {Promise<{count: number, items: Array}>}
 */
export async function bulkCreateMenuItems(items) {
  return api.post('/menu-items/bulk', { items })
}

/**
 * Lister tous les articles de menu (catalogue tenant complet, ou scopé à un espace).
 * @param {string|null} spaceId - Si fourni, ne charge que les articles vendus dans cet
 *   espace (MenuItem.spaceIds côté backend) au lieu de tout le catalogue tenant. À utiliser
 *   partout où seul un espace nous intéresse (ex: SpaceMenuView) — sans ce filtre, on paginait
 *   sur l'intégralité du catalogue tenant avant de filtrer côté client.
 * @returns {Promise<Array>}
 */
export async function getAllMenuItems(spaceId = null) {
  // 150 (au lieu de 500) : la requête /menu-items?limit=500 dépassait 60s sur le
  // backend onrender (DB lente) → catalogue vide. Pages plus petites = chaque requête
  // plus légère (pages 2+ en parallèle). Si la lenteur vient d'un index manquant côté
  // serveur, ça reste à corriger backend.
  const LIMIT = 150
  const spaceParam = spaceId ? `&spaceId=${encodeURIComponent(spaceId)}` : ''
  // The `api` wrapper already returns response.data (the NestJS body),
  // so `first` is already { data: [...], meta: {...} } — no extra unwrapping needed.
  const first = await api.get(`/menu-items?page=1&limit=${LIMIT}${spaceParam}`)
  // Backend pagination meta key varies (camelCase `totalPages` vs snake_case
  // `total_pages` per weezevent.controller convention) — accept both so pages
  // 2+ aren't silently dropped when there are >500 menu items.
  const totalPages = first?.meta?.totalPages ?? first?.meta?.total_pages ?? 1
  const allItems = Array.isArray(first?.data) ? [...first.data] : []

  if (totalPages > 1) {
    // Fetch all remaining pages in parallel instead of sequentially
    const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
    const results = await Promise.all(
      pages.map((p) => api.get(`/menu-items?page=${p}&limit=${LIMIT}${spaceParam}`))
    )
    for (const res of results) {
      if (Array.isArray(res?.data)) allItems.push(...res.data)
    }
  }

  return allItems
}

/**
 * Lister les articles de menu avec pagination et recherche
 * @param {Object} params - { page, limit, search }
 * @returns {Promise<{data: Array, total: Number}>}
 */
export async function getMenuItemsPaginated({ page = 1, limit = 100, search = '' } = {}) {
  const params = new URLSearchParams({ page, limit })
  if (search) params.set('search', search)
  return api.get(`/menu-items?${params}`)
}

/**
 * Recalculer les coûts des articles
 * @returns {Promise<Object>}
 */
export async function refreshMenuItemsCosts() {
  return api.post('/menu-items/refresh-costs')
}

/**
 * Recalculer les coûts d'un article
 * @param {string} id - L'ID du menu item
 * @returns {Promise<Object>}
 */
export async function refreshMenuItemCosts(id) {
  return api.post(`/menu-items/${id}/refresh-costs`)
}

/**
 * Obtenir un article par ID
 * @param {string} id - L'ID du menu item
 * @returns {Promise<Object>}
 */
export async function getMenuItemById(id) {
  return api.get(`/menu-items/${id}`)
}

/**
 * Mettre à jour un article
 * @param {string} id - L'ID du menu item
 * @param {Object} menuItem - Les données à mettre à jour
 * @returns {Promise<Object>}
 */
export async function updateMenuItem(id, menuItem) {
  return api.patch(`/menu-items/${id}`, menuItem)
}

/**
 * Supprimer un article
 * @param {string} id - L'ID du menu item
 * @returns {Promise<Object>}
 */
export async function deleteMenuItem(id) {
  return api.delete(`/menu-items/${id}`)
}

/**
 * Remplacer les composants d'un menu item
 * @param {string} id - L'ID du menu item
 * @param {Array} components - Les composants à remplacer
 * @returns {Promise<Object>}
 */
export async function replaceMenuItemComponents(id, components) {
  return api.put(`/menu-items/${id}/components`, components)
}

/**
 * Remplacer les ingrédients d'un menu item
 * @param {string} id - L'ID du menu item
 * @param {Array} ingredients - Les ingrédients à remplacer
 * @returns {Promise<Object>}
 */
export async function replaceMenuItemIngredients(id, ingredients) {
  return api.put(`/menu-items/${id}/ingredients`, ingredients)
}

/**
 * Remplacer les packagings d'un menu item
 * @param {string} id - L'ID du menu item
 * @param {Array} packagings - Les packagings à remplacer
 * @returns {Promise<Object>}
 */
export async function replaceMenuItemPackagings(id, packagings) {
  return api.put(`/menu-items/${id}/packagings`, packagings)
}

// ============================================
// PRIX WEEZEVENT (Data Integration étape 3)
// ============================================

/**
 * Applique le prix Weezevent (dernier prix de vente non nul, sinon catalogue) du produit mappé
 * à un menu item, et l'archive dans l'historique. Idempotent.
 * @param {string} id - L'ID du menu item
 * @param {string|null} weezeventProductId - Produit source (optionnel si un seul est mappé)
 * @param {string|null} spaceId - Espace ciblé : écrit dans spacePrices[spaceId] (prix par espace).
 *   Absent → comportement global (basePrice).
 * @param {{basePrice?:number, vatRate?:number|null}|null} price - Prix DU PRODUIT TEL QU'AFFICHÉ :
 *   le menu item en hérite exactement (pas de re-calcul serveur). Absent → repli backend.
 * @returns {Promise<{changed:boolean, previous:object, applied:object, item:object}>}
 */
export async function applyWeezeventPrice(id, weezeventProductId = null, spaceId = null, price = null) {
  const body = {}
  if (weezeventProductId) body.weezeventProductId = weezeventProductId
  if (spaceId) body.spaceId = spaceId
  if (price && price.basePrice != null) {
    body.basePrice = price.basePrice
    if (price.vatRate != null) body.vatRate = price.vatRate
  }
  return api.post(`/menu-items/${id}/apply-weezevent-price`, body)
}

/**
 * Applique le prix Weezevent à plusieurs menu items en une fois (action de masse étape 3).
 * @param {Array<{menuItemId:string, weezeventProductId?:string}>} items
 * @param {string|null} spaceId - Espace ciblé pour tout le lot (prix par espace). Absent → global.
 * @returns {Promise<{total:number, changed:number, results:Array}>}
 */
export async function applyWeezeventPrices(items, spaceId = null) {
  return api.post('/menu-items/apply-weezevent-prices', spaceId ? { items, spaceId } : { items })
}

/**
 * Historique des prix d'un menu item (du plus récent au plus ancien).
 * @param {string} id - L'ID du menu item
 * @returns {Promise<Array>}
 */
export async function getMenuItemPriceHistory(id) {
  return api.get(`/menu-items/${id}/price-history`)
}
