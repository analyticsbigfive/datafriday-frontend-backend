// src/api/endpoints/events.api.js
// API pour la gestion des Events

import { api } from '../client'

// ============================================
// EVENTS
// ============================================

/**
 * Récupérer les événements (paginé côté backend, défaut limit=50).
 * @param {{spaceId?: string, page?: number, limit?: number}} [opts]
 * @returns {Promise<Object>} { data, meta: { total, page, limit, totalPages } }
 */
export async function getEvents({ spaceId, page, limit } = {}) {
  const params = {}
  if (spaceId) params.spaceId = spaceId
  if (page) params.page = page
  if (limit) params.limit = limit
  return api.get('/events', { params })
}

/**
 * Récupérer un événement par ID
 * @param {string} id 
 * @returns {Promise<Object>}
 */
export async function getEvent(id) {
  return api.get(`/events/${id}`)
}

/**
 * Créer un événement
 * @param {Object} event 
 * @returns {Promise<Object>}
 */
export async function createEvent(event) {
  return api.post('/events', event)
}

/**
 * Mettre à jour un événement
 * @param {string} id 
 * @param {Object} updates 
 * @returns {Promise<Object>}
 */
export async function updateEvent(id, updates) {
  return api.patch(`/events/${id}`, updates)
}

/**
 * Supprimer un événement
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deleteEvent(id) {
  return api.delete(`/events/${id}`)
}

/**
 * Lister les events sans lien Weezevent univoque (BUG-021) : `weezeventEventId` null
 * alors qu'au moins un WeezeventEvent existe le même jour calendaire — l'auto-link
 * s'abstient dès qu'il y a plus d'un candidat de chaque côté, il faut alors choisir
 * manuellement.
 * @returns {Promise<Array<{eventId: string, eventName: string, eventDate: string, candidates: Array}>>}
 */
export async function getAmbiguousWeezeventMatches() {
  return api.get('/events/weezevent-ambiguous-matches')
}

/**
 * Résoudre manuellement le lien Weezevent d'un event (BUG-021).
 * @param {string} id
 * @param {string|null} weezeventEventId - null pour délier explicitement
 * @returns {Promise<Object>}
 */
export async function resolveWeezeventLink(id, weezeventEventId) {
  return api.patch(`/events/${id}/weezevent-link`, { weezeventEventId })
}

// ============================================
// EVENT TYPES
// ============================================

/**
 * Récupérer tous les types d'événements
 * @returns {Promise<Array>}
 */
export async function getEventTypes() {
  return api.get('/event-types')
}

/**
 * Créer un type d'événement
 * @param {Object} type 
 * @returns {Promise<Object>}
 */
export async function createEventType(type) {
  return api.post('/event-types', type)
}

/**
 * Mettre à jour un type d'événement
 * @param {string} id 
 * @param {Object} updates 
 * @returns {Promise<Object>}
 */
export async function updateEventType(id, updates) {
  return api.patch(`/event-types/${id}`, updates)
}

/**
 * Supprimer un type d'événement
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteEventType(id) {
  return api.delete(`/event-types/${id}`)
}

// ============================================
// EVENT CATEGORIES
// ============================================

/**
 * Récupérer toutes les catégories
 * @returns {Promise<Array>}
 */
export async function getEventCategories() {
  return api.get('/event-categories')
}

/**
 * Créer une catégorie
 * @param {Object} category 
 * @returns {Promise<Object>}
 */
export async function createEventCategory(category) {
  return api.post('/event-categories', category)
}

/**
 * Mettre à jour une catégorie
 * @param {string} id 
 * @param {Object} updates 
 * @returns {Promise<Object>}
 */
export async function updateEventCategory(id, updates) {
  return api.patch(`/event-categories/${id}`, updates)
}

/**
 * Supprimer une catégorie
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteEventCategory(id) {
  return api.delete(`/event-categories/${id}`)
}

// ============================================
// EVENT SUBCATEGORIES
// ============================================

/**
 * Récupérer toutes les sous-catégories
 * @returns {Promise<Array>}
 */
export async function getEventSubcategories() {
  return api.get('/event-subcategories')
}

/**
 * Créer une sous-catégorie
 * @param {Object} subcategory 
 * @returns {Promise<Object>}
 */
export async function createEventSubcategory(subcategory) {
  return api.post('/event-subcategories', subcategory)
}

/**
 * Mettre à jour une sous-catégorie
 * @param {string} id 
 * @param {Object} updates 
 * @returns {Promise<Object>}
 */
export async function updateEventSubcategory(id, updates) {
  return api.patch(`/event-subcategories/${id}`, updates)
}

/**
 * Supprimer une sous-catégorie
 * @param {string} id 
 * @returns {Promise<void>}
 */
export async function deleteEventSubcategory(id) {
  return api.delete(`/event-subcategories/${id}`)
}

// ============================================
// EVENT REVENUE
// ============================================

/**
 * Calculer le revenu d'un événement
 * @param {Object} params 
 * @returns {Promise<Object>}
 */
export async function calculateEventRevenue(params) {
  const { spaceId, spaceName, eventId, eventName, eventDate, location } = params
  return api.post('/events/calculate-single-event-revenue', {
    spaceId,
    spaceName,
    eventId,
    eventName,
    eventDate,
    location
  })
}

/**
 * Récupérer le résumé des revenus par événement
 * @param {string} location 
 * @returns {Promise<Array>}
 */
export async function getEventRevenueSummary(location) {
  return api.get(`/event-revenue/location/${encodeURIComponent(location)}`)
}

/**
 * Calculer les revenus des événements non enregistrés
 * @param {string} location 
 * @returns {Promise<Object>}
 */
export async function calculateUnregisteredEventRevenue(location) {
  return api.post('/events/calculate-unregistered-revenue', { location })
}

/**
 * Sauvegarder le calcul des revenus
 * @param {Object} params 
 * @returns {Promise<Object>}
 */
export async function saveEventRevenueCalculation(params) {
  const { spaceId, location, registeredEvents, unregisteredEvents } = params
  return api.post('/events/save-event-revenue-calculation', {
    spaceId,
    location,
    registeredEvents,
    unregisteredEvents
  })
}

/**
 * Charger le calcul des revenus sauvegardé
 * @param {string} spaceId 
 * @returns {Promise<Object>}
 */
export async function getEventRevenueCalculation(spaceId) {
  return api.get(`/events/get-event-revenue-calculation/${spaceId}`)
}

// ============================================
// SPONSORS
// ============================================

/**
 * Récupérer tous les sponsors d'événements
 * @returns {Promise<Array>}
 */
export async function getEventSponsors() {
  return api.get('/event-sponsors')
}