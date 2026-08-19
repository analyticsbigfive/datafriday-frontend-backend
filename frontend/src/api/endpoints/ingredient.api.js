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
export async function getIngredients({ page, limit } = {}) {
  // Sans params, le backend renvoie la PAGE 1 (100 lignes, tri alphabétique) —
  // pour un catalogue complet, boucler via fetchAllPaginated (utils/paginateAll).
  const params = new URLSearchParams()
  if (page) params.set('page', page)
  if (limit) params.set('limit', limit)
  const qs = params.toString()
  return api.get(`/ingredients${qs ? '?' + qs : ''}`)
}

/**
 * Get a single space by ID
 */
export async function getIngredient(ingredientId) {
  try {
    const response = await api.get(`/ingredients/${ingredientId}`)
    return response
  } catch (error) {
    console.error(`[INGREDIENT API] Error fetching Ingredient ${ingredientId}:`, error)
    throw error
  }
}


/**
 * Créer un ingrédient
 * @param {Object} ingredient
 * @returns {Promise<Object>}
 */
export async function createIngredient(ingredient) {
  return api.post('/ingredients', ingredient)
}

export async function updateIngredient(id, ingredient) {
  return api.patch(`/ingredients/${id}`, ingredient)
}

export async function deleteIngredient(id) {
  return api.delete(`/ingredients/${id}`)
}