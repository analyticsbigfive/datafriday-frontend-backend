// src/api/endpoints/events.api.js
// API pour la gestion des Produits

import { api } from '../client'

// ============================================
// PRODUCTS
// ============================================

/**
 * Récupérer toutes les catégories de produits
 * @returns {Promise<Array>}
 */
export async function getProductCategory() {
  return api.get('/product-categories')
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
 * Récupérer toutes les catégories de produits
 * @returns {Promise<Array>}
 */
export async function getProductType() {
  return api.get('/product-types')
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