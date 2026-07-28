// API functions for data integration mappings
import api from '../client'
import { runWithConcurrency } from '@/utils/asyncPool'

// ─── Location → Space ───────────────────────────────────

export async function getLocationSpaceMappings() {
  try {
    const response = await api.get('/mappings/location-space')
    return response.data
  } catch (error) {
    console.error('[MAPPINGS API] Error fetching location-space mappings:', error)
    throw error
  }
}

export async function getLocationSpaceMapping(locationId) {
  try {
    const response = await api.get(`/mappings/location-space/${locationId}`)
    return response.data
  } catch (error) {
    console.error(`[MAPPINGS API] Error fetching mapping for location ${locationId}:`, error)
    throw error
  }
}

export async function createLocationSpaceMapping(weezeventLocationId, spaceId) {
  try {
    const response = await api.post('/mappings/location-space', {
      weezeventLocationId,
      spaceId
    })
    return response.data
  } catch (error) {
    console.error('[MAPPINGS API] Error creating location-space mapping:', error)
    throw error
  }
}

export async function deleteLocationSpaceMapping(locationId) {
  try {
    const response = await api.delete(`/mappings/location-space/${locationId}`)
    return response.data
  } catch (error) {
    console.error(`[MAPPINGS API] Error deleting mapping for location ${locationId}:`, error)
    throw error
  }
}

// ─── Location → ShopElement ─────────────────────────────────

export async function getLocationShopMappings(locationId, spaceId, { page = 1, limit = 500 } = {}) {
  try {
    const params = { page, limit }
    if (locationId) params.locationId = locationId
    if (spaceId) params.spaceId = spaceId
    const response = await api.get('/mappings/location-shop', { params })
    return response.data
  } catch (error) {
    console.error('[MAPPINGS API] Error fetching location-shop mappings:', error)
    throw error
  }
}

export async function createLocationShopMapping(weezeventLocationId, spaceElementId) {
  try {
    const response = await api.post('/mappings/location-shop', {
      weezeventLocationId,
      spaceElementId
    })
    return response.data
  } catch (error) {
    console.error('[MAPPINGS API] Error creating location-shop mapping:', error)
    throw error
  }
}

export async function bulkLocationShopMappings(mappings) {
  try {
    const response = await api.post('/mappings/location-shop/bulk', { mappings })
    return response.data
  } catch (error) {
    console.error('[MAPPINGS API] Error bulk creating location-shop mappings:', error)
    throw error
  }
}

export async function deleteLocationShopMapping(locationId) {
  try {
    const response = await api.delete(`/mappings/location-shop/${locationId}`)
    return response.data
  } catch (error) {
    console.error(`[MAPPINGS API] Error deleting location-shop mapping ${locationId}:`, error)
    throw error
  }
}

// ─── Product → MenuItem ──────────────────────────────────

export async function getProductMappingStats(integrationId) {
  try {
    const params = integrationId ? { integrationId } : {}
    const response = await api.get('/mappings/product-menu/stats', { params })
    return response.data
  } catch (error) {
    console.error('[MAPPINGS API] Error fetching product mapping stats:', error)
    throw error
  }
}

export async function getProductMappings(locationId) {
  try {
    const limit = 200
    const fetchPage = async (page) => {
      const params = { page, limit }
      if (locationId) params.locationId = locationId
      const response = await api.get('/mappings/product-menu', { params })
      return response.data || response
    }

    const firstPage = await fetchPage(1)
    const mappings = Array.isArray(firstPage?.data) ? [...firstPage.data] : []
    const totalPages = firstPage?.meta?.totalPages || 1

    if (totalPages > 1) {
      const pages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2)
      // Pages restantes récupérées avec une concurrence bornée (asyncPool) pour ne pas
      // saturer le backend sur un gros tenant.
      const byPage = new Map()
      await runWithConcurrency(pages, 4, async (page) => {
        const nextPage = await fetchPage(page)
        byPage.set(page, Array.isArray(nextPage?.data) ? nextPage.data : [])
      })
      for (const page of pages) mappings.push(...(byPage.get(page) || []))
    }

    return mappings
  } catch (error) {
    console.error('[MAPPINGS API] Error fetching product mappings:', error)
    throw error
  }
}

export async function createProductMapping(weezeventProductId, menuItemId, spaceId = null) {
  try {
    const response = await api.post('/mappings/product-menu/bulk', {
      mappings: [{ weezeventProductId, menuItemId, autoMapped: false }],
      // spaceId : rattache l'item à l'espace courant (sinon « mappé sans espace »).
      ...(spaceId ? { spaceId } : {}),
    })
    return response.data
  } catch (error) {
    console.error('[MAPPINGS API] Error creating product mapping:', error)
    throw error
  }
}

export async function bulkProductMappings(mappings, spaceId = null) {
  try {
    const response = await api.post('/mappings/product-menu/bulk', {
      mappings,
      // spaceId : rattache chaque item mappé à l'espace courant du wizard.
      ...(spaceId ? { spaceId } : {}),
    })
    return response.data
  } catch (error) {
    console.error('[MAPPINGS API] Error bulk creating product mappings:', error)
    throw error
  }
}

export async function deleteProductMapping(productId) {
  try {
    const response = await api.delete(`/mappings/product-menu/${productId}`)
    return response.data
  } catch (error) {
    console.error(`[MAPPINGS API] Error deleting product mapping ${productId}:`, error)
    throw error
  }
}

/**
 * Get post-sync summary for one location (merchants/products/events counts).
 * Used by the WizardSuccess screen.
 */
export async function getLocationSummary(locationId) {
  try {
    const response = await api.get(`/mappings/summary/${locationId}`)
    return response.data
  } catch (error) {
    console.error(`[MAPPINGS API] Error fetching summary for ${locationId}:`, error)
    throw error
  }
}
