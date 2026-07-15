// src/api/endpoints/component.api.js
// API pour la gestion des Produits

import { api } from '../client'

// ============================================
// PRODUCTS
// ============================================

/**
 * Récupérer tous les composants du menu
 * @returns {Promise<Array>}
 */
export async function getMenuComponents() {
  return api.get('/menu-components')
}  



/**
 * Créer un menu component
 * @param {Object} menuComponent
 * @returns {Promise<Object>}
 */
export async function createMenuComponent(menuComponent) {
  return api.post('/menu-components', menuComponent)
}

export async function updateMenuComponent(id, menuComponent) {
  return api.patch(`/menu-components/${id}`, menuComponent)
}

export async function deleteMenuComponent(id) {
  return api.delete(`/menu-components/${id}`)
}