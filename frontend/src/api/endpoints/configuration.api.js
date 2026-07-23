// API functions for configurations
import api from '../client'

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
