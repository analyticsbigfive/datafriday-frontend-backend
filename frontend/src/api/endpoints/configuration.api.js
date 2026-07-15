// API functions for configurations
import api from '../client'

/**
 * Get all configurations
 */
export async function getAllConfigurations() {
  try {
    const response = await api.get('/configurations')
    return response.data
  } catch (error) {
    console.error('[CONFIGURATIONS API] Error fetching configurations:', error)
    throw error
  }
}

/**
 * Get a single configuration by ID
 */
export async function getConfiguration(configurationId) {
  try {
    const response = await api.get(`/configurations/${configurationId}`)
    return response.data
  } catch (error) {
    console.error(`[CONFIGURATIONS API] Error fetching configuration ${configurationId}:`, error)
    throw error
  }
}

/**
 * Get all configurations for a specific space
 */
export async function getConfigurationsBySpace(spaceId) {
  try {
    const response = await api.get(`/configurations?spaceId=${spaceId}`)
    return response.data
  } catch (error) {
    console.error(`[CONFIGURATIONS API] Error fetching configurations for space ${spaceId}:`, error)
    throw error
  }
}

/**
 * Create a new configuration
 * @param {Object} configurationData - Configuration data
 * @param {string} configurationData.id - Configuration ID (e.g., "config-123456789")
 * @param {string} configurationData.name - Configuration name (e.g., "Main Configuration")
 * @param {string} configurationData.spaceId - Space ID (e.g., "space-abc123")
 * @param {number} configurationData.capacity - Capacity (e.g., 5000)
 * @param {Object} configurationData.data - Configuration data object
 * @param {Array} configurationData.data.floors - Array of floor objects
 * @param {Object|null} configurationData.data.forecourt - Forecourt object or null
 * @param {Object|null} configurationData.data.externalMerch - External merch object or null
 */
export async function createConfiguration(configurationData) {
  try {
    const response = await api.post('/configurations', configurationData)
    return response.data
  } catch (error) {
    console.error('[CONFIGURATIONS API] Error creating configuration:', error)
    throw error
  }
}

/**
 * Update a configuration (A20 : PATCH /configurations/:id — sémantique correcte d'un update,
 * au lieu du POST upsert qui renvoyait 201 sur une mise à jour). Le backend route le PATCH
 * vers le même service saveConfiguration que le POST.
 */
export async function updateConfiguration(configurationId, configurationData) {
  try {
    const response = await api.patch(`/configurations/${configurationId}`, configurationData)
    return response.data
  } catch (error) {
    console.error(`[CONFIGURATIONS API] Error updating configuration ${configurationId}:`, error)
    throw error
  }
}

/**
 * Delete a configuration
 */
export async function deleteConfiguration(configurationId) {
  try {
    const response = await api.delete(`/configurations/${configurationId}`)
    return response.data
  } catch (error) {
    console.error(`[CONFIGURATIONS API] Error deleting configuration ${configurationId}:`, error)
    throw error
  }
}
