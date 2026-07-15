// src/api/endpoints/market.price.api.js
// API pour la gestion des Market Prices

import { api } from '../client'

// ============================================
// MARKET PRICES
// ============================================

/**
 * Récupérer toutes les market prices
 * @returns {Promise<Array>}
 */
export async function getMarketPrices() {
  return api.get('/market-prices')
}

/**
 * Récupérer une market price par ID
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function getMarketPrice(id) {
  return api.get(`/market-prices/${id}`)
}

/**
 * Créer une market price
 * @param {Object} marketPrice 
 * @returns {Promise<Object>}
 */
export async function createMarketPrice(marketPrice) {
  return api.post('/market-prices', marketPrice)
}

/**
 * Mettre à jour une market price
 * @param {string} id 
 * @param {Object} updates 
 * @returns {Promise<Object>}
 */
export async function updateMarketPrice(id, updates) {
  return api.patch(`/market-prices/${id}`, updates)
}

/**
 * Supprimer une market price
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteMarketPrice(id) {
  return api.delete(`/market-prices/${id}`)
}


/**
 * Synchroniser les packagings
 * @returns {Promise<void>}
 */
export async function synchronisePackaging() {
  return api.post('/market-prices/sync-packagings')
}

// ============================================
// MARKET PRICE TYPES (taxonomie propre à Market Price)
// ============================================

export async function getMarketPriceTypes() {
  return api.get('/market-price-types')
}

export async function createMarketPriceType(marketPriceType) {
  return api.post('/market-price-types', marketPriceType)
}

export async function updateMarketPriceType(id, marketPriceType) {
  return api.patch(`/market-price-types/${id}`, marketPriceType)
}

export async function deleteMarketPriceType(id) {
  return api.delete(`/market-price-types/${id}`)
}

// ============================================
// MARKET PRICE CATEGORIES
// ============================================

export async function getMarketPriceCategories() {
  return api.get('/market-price-categories')
}

export async function createMarketPriceCategory(marketPriceCategory) {
  return api.post('/market-price-categories', marketPriceCategory)
}

export async function updateMarketPriceCategory(id, marketPriceCategory) {
  return api.patch(`/market-price-categories/${id}`, marketPriceCategory)
}

export async function deleteMarketPriceCategory(id) {
  return api.delete(`/market-price-categories/${id}`)
}