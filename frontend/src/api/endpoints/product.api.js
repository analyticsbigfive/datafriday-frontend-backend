// src/api/endpoints/events.api.js
// API pour la gestion des Produits

import { api } from '../client'

// ============================================
// PRODUCTS
// ============================================

/**
 * Récupérer toutes les catégories de produits
 * BUG-169 : accepte { page, limit } pour paginer côté serveur (le store boucle sur les
 * pages pour reconstituer la liste complète — voir store/modules/productCategories.js).
 * @param {{ page?: number, limit?: number }} [opts]
 * @returns {Promise<Array|{data: Array, meta: Object}>}
 */
export async function getProductCategory({ page, limit } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return api.get(`/product-categories${qs ? '?' + qs : ''}`)
}


/**
 * Créer une catégorie de produit
 * @param {Object} productCategory 
 * @returns {Promise<Object>}
 */
export async function createProductCategory(productCategory) {
  return api.post('/product-categories', productCategory)
}

export async function updateProductCategory(id, productCategory) {
  return api.patch(`/product-categories/${id}`, productCategory)
}

export async function deleteProductCategory(id) {
  return api.delete(`/product-categories/${id}`)
}


/**
 * Récupérer tous les types de produits
 * BUG-169 : accepte { page, limit } pour paginer côté serveur (le store boucle sur les
 * pages pour reconstituer la liste complète — voir store/modules/productTypes.js).
 * @param {{ page?: number, limit?: number }} [opts]
 * @returns {Promise<Array|{data: Array, meta: Object}>}
 */
export async function getProductType({ page, limit } = {}) {
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return api.get(`/product-types${qs ? '?' + qs : ''}`)
}


/**
 * Créer une catégorie de produit
 * @param {Object} productType
 * @returns {Promise<Object>}
 */
export async function createProductType(productType) {
  return api.post('/product-types', productType)
}

export async function updateProductType(id, productType) {
  return api.patch(`/product-types/${id}`, productType)
}

export async function deleteProductType(id) {
  return api.delete(`/product-types/${id}`)
}