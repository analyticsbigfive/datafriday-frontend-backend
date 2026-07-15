// utils/api.js

import { projectId, publicAnonKey } from './supabase/info';

const baseUrl = `https://${projectId}.supabase.co/functions/v1/make-server-eb31619c`;

// Request deduplication: prevent multiple simultaneous identical requests
const pendingRequests = new Map();

// Retry wrapper for critical GET requests that may timeout
async function retryableFetch(endpoint, maxRetries = 2, retryDelay = 1000) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[RETRY] Attempt ${attempt}/${maxRetries} for ${endpoint}`);
      const result = await apiFetch(endpoint);
      console.log(`[RETRY] Success on attempt ${attempt} for ${endpoint}`);
      return result;
    } catch (error) {
      lastError = error;
      const isTimeout =
        lastError.message?.includes('timed out') ||
        lastError.message?.includes('connection closed') ||
        lastError.message?.includes('statement timeout') ||
        lastError.message?.includes('canceling statement');

      if (attempt < maxRetries && isTimeout) {
        console.warn(
          `[RETRY] Timeout on attempt ${attempt} for ${endpoint}, retrying in ${retryDelay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
        // Exponential backoff
        retryDelay *= 1.5;
      } else if (attempt === maxRetries) {
        console.error(
          `[RETRY] All ${maxRetries} attempts failed for ${endpoint}:`,
          lastError.message
        );
        throw lastError;
      } else {
        // Non-timeout error, throw immediately
        throw lastError;
      }
    }
  }

  throw lastError || new Error('Retry failed');
}

async function apiFetch(endpoint, options = {}) {
  try {
    const url = `${baseUrl}${endpoint}`;
    const method = options.method || 'GET';

    // Request deduplication for GET requests only
    if (method === 'GET') {
      const requestKey = url;

      // If there's already a pending request for this endpoint, return that promise
      if (pendingRequests.has(requestKey)) {
        console.log(`API Request (deduplicated): ${method} ${url}`);
        return pendingRequests.get(requestKey);
      }

      // Create new request promise and store it
      const requestPromise = performRequest(url, method, options);
      pendingRequests.set(requestKey, requestPromise);

      // Remove from pending requests when done (whether success or error).
      // IMPORTANT : `.finally()` retourne une NOUVELLE promesse — si on ne
      // la "tame" pas avec un `.catch()`, un rejet du `requestPromise`
      // remonte ici comme `unhandledrejection` même si l'appelant gère
      // l'erreur via son propre `.catch()`. C'est ce qui faisait apparaître
      // l'overlay webpack "Uncaught runtime errors" en dev.
      requestPromise
        .finally(() => {
          pendingRequests.delete(requestKey);
        })
        .catch(() => {
          /* swallow : l'erreur est déjà propagée via requestPromise */
        });

      return requestPromise;
    }

    // For non-GET requests, execute normally
    console.log(`API Request: ${method} ${url}`);
    return performRequest(url, method, options);
  } catch (error) {
    // Error handling moved to performRequest
    throw error;
  }
}

async function performRequest(url, method, options) {
  // Extract endpoint outside try block so it's available in catch
  const endpoint = url.replace(baseUrl, '');

  try {
    // Determine timeout based on endpoint
    // Configurations endpoint needs longer timeout due to complex data loading
    let timeoutDuration = 30000; // Default 30 seconds

    if (endpoint.match(/^\/spaces\/[^/]+\/configurations$/)) {
      timeoutDuration = 60000; // 60 seconds for configurations
      console.log(
        `[API] Using extended timeout (60s) for configurations endpoint: ${endpoint}`
      );
    }

    // Extend timeout for shop performance endpoints (can have large data sets)
    if (endpoint.includes('/shop-performance-by-space/')) {
      timeoutDuration = 90000; // 90 seconds for shop performance data
      console.log(
        `[API] Using extended timeout (90s) for shop performance endpoint: ${endpoint}`
      );
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
        ...options.headers,
      },
      signal: controller.signal,
    }).catch((fetchError) => {
      clearTimeout(timeoutId);

      // Handle abort/timeout errors
      if (fetchError.name === 'AbortError') {
        console.error(`Request timeout for ${endpoint} (${timeoutDuration / 1000}s)`);
        throw new Error(`Request timed out. The server took too long to respond.`);
      }

      // Handle network errors (server not reachable)
      console.log(`Network connection issue for ${endpoint}. Server may not be deployed.`);

      // For menu revenue and space-menus endpoints, return empty data instead of throwing
      if (
        endpoint.includes('/menu-revenue/') ||
        endpoint.includes('/menu-item-mappings') ||
        endpoint.includes('/space-menus/')
      ) {
        console.log(`Network timeout for ${endpoint} - returning empty data`);
        return { success: false, data: null, timeout: true };
      }

      throw new Error('Network connection lost.');
    });

    // Clear timeout on successful response
    clearTimeout(timeoutId);

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.log(`Non-JSON response from ${endpoint}. Server may not be deployed.`);
      throw new Error(
        `Server returned non-JSON response. The server may not be running properly.`
      );
    }

    const data = await response.json();

    if (!response.ok) {
      // Only log errors that aren't 404s (404s are often expected, like no saved data yet)
      if (response.status !== 404) {
        console.error(`API error on ${endpoint}:`, data);
      }

      // For inventory endpoints, return a structured response instead of throwing on 404
      if (response.status === 404 && endpoint.includes('/inventory')) {
        return { success: false, data: null, notFound: true };
      }

      // "Key not found" from KV-store backend is equivalent to a 404 — treat
      // as "no data" rather than throwing, so callers can fallback gracefully.
      if (typeof data?.error === 'string' && /key not found/i.test(data.error)) {
        console.warn(`[API] No data for ${endpoint} (Key not found)`);
        return { data: null, notFound: true };
      }

      throw new Error(data.error || `API request failed with status ${response.status}`);
    }

    return data;
  } catch (error) {
    // Silently handle network errors for getAllSpaces to prevent console spam
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.log(`Network error accessing ${endpoint}. Server may not be deployed.`);

      // For getAllSpaces and related endpoints, return empty/null instead of throwing
      if (endpoint === '/spaces') {
        return { data: [] };
      }

      // For individual space endpoint, return null to allow graceful handling
      if (endpoint.match(/^\/spaces\/[^/]+$/)) {
        throw new Error(
          'Unable to connect to server. Please check your connection and try again.'
        );
      }

      // For space configurations endpoint, return empty array
      if (endpoint.match(/^\/spaces\/[^/]+\/configurations$/)) {
        return { data: [] };
      }

      // For menu revenue endpoints, return empty data instead of throwing
      if (endpoint.includes('/menu-revenue/') || endpoint.includes('/menu-item-mappings')) {
        console.log(`Network timeout for ${endpoint} - returning empty data`);
        return { success: false, data: null, timeout: true };
      }

      throw new Error('Network connection lost.');
    }
    throw error;
  }
}

// ===== HEALTH CHECK =====
export async function healthCheck() {
  try {
    const result = await apiFetch('/health');
    return result.status === 'ok';
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

// ===== SPACES =====
export async function getAllSpaces() {
  const result = await apiFetch('/spaces');
  return result.data || [];
}

export async function getSpace(id) {
  const result = await apiFetch(`/spaces/${id}`);
  return result.data;
}

export async function saveSpace(space) {
  const result = await apiFetch('/spaces', {
    method: 'POST',
    body: JSON.stringify(space),
  });
  return result.data;
}

export async function deleteSpace(id) {
  await apiFetch(`/spaces/${id}`, {
    method: 'DELETE',
  });
}

export async function updateSpaceImage(spaceId, imageDataUrl) {
  const result = await apiFetch(`/spaces/${spaceId}/image`, {
    method: 'PUT',
    body: JSON.stringify({ image: imageDataUrl }),
  });
  return result.data;
}

export async function updateSpace(spaceId, updates) {
  const result = await apiFetch(`/spaces/${spaceId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return result.data;
}

export async function getSpaceConfigurations(spaceId, bypassCache = false) {
  try {
    const url = bypassCache
      ? `/spaces/${spaceId}/configurations?bypass_cache=true`
      : `/spaces/${spaceId}/configurations`;

    // Use retry logic since configurations can be slow to load
    console.log(`[getSpaceConfigurations] Fetching with retry logic for space: ${spaceId}`);
    const result = await retryableFetch(url, 2, 2000);
    return result.data || [];
  } catch (error) {
    console.error(
      `[getSpaceConfigurations] Error after retries for space ${spaceId}:`,
      error
    );
    // Return empty array on timeout/error to prevent app crashes
    return [];
  }
}

export async function getPinnedSpaces() {
  try {
    const result = await apiFetch('/pinned-spaces');
    return result.data || [];
  } catch (error) {
    // Silently handle the error and return empty array
    // This is expected when the server is not deployed yet
    console.log('Pinned spaces not available, using empty list');
    return [];
  }
}

export async function setPinnedSpaces(spaceIds) {
  const result = await apiFetch('/pinned-spaces', {
    method: 'POST',
    body: JSON.stringify({ spaceIds }),
  });
  return result.data;
}

// ===== MARGIN THRESHOLD SETTINGS =====
export async function getMarginThresholdSettings() {
  const result = await apiFetch('/margin-threshold-settings');
  return result.data || { default: { lowThreshold: 68, highThreshold: 75 } };
}

export async function saveMarginThresholdSettings(typeThresholds) {
  const result = await apiFetch('/margin-threshold-settings', {
    method: 'POST',
    body: JSON.stringify({ typeThresholds }),
  });
  return result.data;
}

// ===== CONFIGURATIONS =====
export async function getAllConfigurations() {
  const result = await apiFetch('/configurations');
  return result.data || [];
}

export async function getConfiguration(id) {
  const result = await apiFetch(`/configurations/${id}`);
  return result.data;
}

export async function saveConfiguration(config) {
  const result = await apiFetch('/configurations', {
    method: 'POST',
    body: JSON.stringify(config),
  });
  return result.data;
}

export async function deleteConfiguration(id) {
  await apiFetch(`/configurations/${id}`, {
    method: 'DELETE',
  });
}

// ===== MARKET PRICES =====
export async function getAllMarketPrices() {
  const result = await apiFetch('/market-prices');
  return result.data || [];
}

export async function saveMarketPrice(price) {
  const result = await apiFetch('/market-prices', {
    method: 'POST',
    body: JSON.stringify(price),
  });
  return result.data;
}

export async function deleteMarketPrice(id) {
  await apiFetch(`/market-prices/${id}`, {
    method: 'DELETE',
  });
}

export async function deduplicateMarketPrices() {
  const result = await apiFetch('/market-prices/deduplicate', {
    method: 'POST',
  });
  return result;
}

export async function migrateMarketPrices() {
  const result = await apiFetch('/market-prices/migrate', {
    method: 'POST',
  });
  return result;
}

export async function forceMigrateMarketPrices() {
  const result = await apiFetch('/market-prices/force-migrate', {
    method: 'POST',
  });
  return result;
}

// ===== CSV MAPPING =====
export async function saveCSVMapping(mappingType, mapping) {
  const result = await apiFetch('/csv-mappings', {
    method: 'POST',
    body: JSON.stringify({ mappingType, mapping }),
  });
  return result.data;
}

export async function getCSVMapping(mappingType) {
  try {
    const url = `${baseUrl}/csv-mappings/${mappingType}`;
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${publicAnonKey}`,
      },
    });

    // If 404, that's expected - no mapping exists yet
    if (response.status === 404) {
      return null;
    }

    const data = await response.json();

    if (!response.ok) {
      console.error(`API error on /csv-mappings/${mappingType}:`, data);
      return null;
    }

    return data.data || null;
  } catch (error) {
    // Silently handle errors - no mapping is not an error condition
    return null;
  }
}

// ===== INGREDIENTS =====
export async function getAllIngredients() {
  try {
    const result = await retryableFetch('/ingredients', 2, 1000);
    return result.data || [];
  } catch (error) {
    console.error('Failed to load ingredients after retries:', error);
    return []; // Return empty array on failure to prevent app crashes
  }
}

export async function saveIngredient(ingredient) {
  const result = await apiFetch('/ingredients', {
    method: 'POST',
    body: JSON.stringify(ingredient),
  });
  return result.data;
}

export async function deleteIngredient(id) {
  await apiFetch(`/ingredients/${id}`, {
    method: 'DELETE',
  });
}

export async function cleanupInvalidIngredients() {
  const result = await apiFetch('/ingredients/cleanup', {
    method: 'POST',
  });
  return result;
}

// ===== PACKAGING =====
export async function getAllPackaging() {
  try {
    const result = await retryableFetch('/packaging', 2, 1000);
    return result.data || [];
  } catch (error) {
    console.error('Failed to load packaging after retries:', error);
    return []; // Return empty array on failure to prevent app crashes
  }
}

export async function savePackaging(packaging) {
  const result = await apiFetch('/packaging', {
    method: 'POST',
    body: JSON.stringify(packaging),
  });
  return result.data;
}

export async function deletePackaging(id) {
  await apiFetch(`/packaging/${id}`, {
    method: 'DELETE',
  });
}

export async function cleanupInvalidPackaging() {
  const result = await apiFetch('/packaging/cleanup', {
    method: 'POST',
  });
  return result;
}

// ===== MENU COMPONENTS =====
export async function getAllMenuComponents() {
  try {
    const result = await retryableFetch('/menu-components', 2, 1000);
    return result.data || [];
  } catch (error) {
    console.error('Failed to load menu components after retries:', error);
    return []; // Return empty array on failure to prevent app crashes
  }
}

export async function saveMenuComponent(component) {
  const result = await apiFetch('/menu-components', {
    method: 'POST',
    body: JSON.stringify(component),
  });
  return result.data;
}

export async function deleteMenuComponent(id) {
  await apiFetch(`/menu-components/${id}`, {
    method: 'DELETE',
  });
}

export async function repairMenuComponents() {
  const result = await apiFetch('/menu-components/repair', {
    method: 'POST',
  });
  return result;
}

// ===== MENU ITEMS =====
export async function getAllMenuItems() {
  try {
    const result = await retryableFetch('/menu-items', 2, 1000);
    return result.data || [];
  } catch (error) {
    console.error('Failed to load menu items after retries:', error);
    return []; // Return empty array on failure to prevent app crashes
  }
}

export async function saveMenuItem(item) {
  const result = await apiFetch('/menu-items', {
    method: 'POST',
    body: JSON.stringify(item),
  });

  // Dispatch custom event to notify all components that menu items have changed
  window.dispatchEvent(new CustomEvent('menuItemsChanged'));

  // NOTE: Automatic aggregation updates are disabled to prevent connection timeouts
  // Use the manual "Recalculate All" button in the Menu Items page or AggregationTestPanel
  // to update financial metrics after making changes

  return result.data;
}

export async function deleteMenuItem(id) {
  await apiFetch(`/menu-items/${id}`, {
    method: 'DELETE',
  });

  // Dispatch custom event to notify all components that menu items have changed
  window.dispatchEvent(new CustomEvent('menuItemsChanged'));
}

export async function syncMenuItemTypeCategories() {
  const result = await apiFetch('/menu-items/sync-type-category-names', {
    method: 'POST',
  });

  // Dispatch custom event to notify all components that menu items have changed
  window.dispatchEvent(new CustomEvent('menuItemsChanged'));

  return result;
}

export async function refreshMenuItemCosts() {
  const result = await apiFetch('/menu-items/refresh-costs', {
    method: 'POST',
  });

  // Dispatch custom event to notify all components that menu items have changed
  window.dispatchEvent(new CustomEvent('menuItemsChanged'));

  return result;
}

export async function getAllMenuItemSnapshots() {
  const result = await apiFetch('/menu-item-snapshots');
  return result.data || [];
}

// ===== SUPPLIERS =====
export async function getAllSuppliers() {
  try {
    console.log('[API] Loading all suppliers...');
    const result = await retryableFetch('/suppliers', 2, 1000);
    console.log('[API] Loaded suppliers:', result.data?.length || 0, 'items');
    return result.data || [];
  } catch (error) {
    console.error('[API] Failed to load suppliers after retries:', error);
    return []; // Return empty array on failure to prevent app crashes
  }
}

export async function saveSupplier(supplier) {
  console.log('[API] Saving supplier:', supplier);
  const result = await apiFetch('/suppliers', {
    method: 'POST',
    body: JSON.stringify(supplier),
  });
  console.log('[API] Save supplier result:', result);
  if (!result.success) {
    throw new Error(result.error || 'Failed to save supplier');
  }
  return result.data;
}

export async function deleteSupplier(id) {
  await apiFetch(`/suppliers/${id}`, {
    method: 'DELETE',
  });
}

// ===== SPACE MENU CONFIGURATIONS =====
export async function getSpaceMenuConfiguration(spaceId, configId) {
  // Route backend réelle = singulier "space-menu" (@Controller('space-menu')) — "space-menus"
  // (pluriel) n'existe pas et renvoyait un 404 silencieux à tous les appelants de cette fonction.
  const result = await apiFetch(`/space-menu/${spaceId}/${configId}`);
  return result.data;
}

export async function saveSpaceMenuConfiguration(spaceId, configId, menuItems) {
  const result = await apiFetch('/space-menu', {
    method: 'POST',
    body: JSON.stringify({ spaceId, configId, menuItems }),
  });
  return result.data;
}

export async function updateSpaceElement(elementId, updates) {
  const result = await apiFetch(`/spaces/elements/${encodeURIComponent(elementId)}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
  return result.data;
}

// ===== F&B INTEGRATIONS =====
export async function getAllFBIntegrations() {
  const result = await apiFetch('/fb-integrations');
  return result.data || [];
}

export async function saveFBIntegration(integration) {
  const result = await apiFetch('/fb-integrations', {
    method: 'POST',
    body: JSON.stringify(integration),
  });
  return result.data;
}

export async function deleteFBIntegration(id) {
  await apiFetch(`/fb-integrations/${id}`, {
    method: 'DELETE',
  });
}

// Get unique locations from fnb_sales_raw
export async function getFBLocations() {
  const result = await apiFetch('/fb-integrations/locations');
  return result.data || { count: 0, locations: [] };
}

// Get paginated sales data for a space
export async function getSalesForSpace(spaceId, options) {
  // Mode démo : pas d'edge function ventes → lignes mock déterministes.
  const { isDemoMode } = await import('./demoMode');
  if (isDemoMode()) {
    const { buildSalesRowsMock } = await import('../data/spaceInventoryMock');
    return { rows: buildSalesRowsMock(), has_more: false, next_cursor: null };
  }

  const params = new URLSearchParams({ space: spaceId });
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.cursorDate) params.append('cursor_date', options.cursorDate);
  if (options?.cursorId) params.append('cursor_id', options.cursorId);
  if (options?.fromDate) params.append('from', options.fromDate);
  if (options?.toDate) params.append('to', options.toDate);

  // Call the dedicated sales Edge Function
  const { projectId, publicAnonKey } = await import('./supabase/info');
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/sales?${params.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Error fetching sales data:', errorText);
    throw new Error(`Failed to fetch sales data: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data || { rows: [], next_cursor: null, has_more: false };
}

// Get sales summary for a space
export async function getSalesSummaryForSpace(spaceId, options) {
  const params = new URLSearchParams({ space: spaceId });
  if (options?.fromDate) params.append('from', options.fromDate);
  if (options?.toDate) params.append('to', options.toDate);

  // Call the sales summary endpoint in the main server
  const { projectId, publicAnonKey } = await import('./supabase/info');
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-eb31619c/sales/summary?${params.toString()}`,
    {
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Error fetching sales summary:', errorText);
    throw new Error(`Failed to fetch sales summary: ${response.statusText}`);
  }

  const result = await response.json();
  return result.data || { count: 0, total_revenue: 0, locations: [] };
}

// Save location-space mapping
export async function saveLocationSpaceMapping(location, spaceId, spaceName) {
  return await apiFetch('/location-space-mappings', {
    method: 'POST',
    body: JSON.stringify({ location, spaceId, spaceName }),
  });
}

// Get all location-space mappings
export async function getLocationSpaceMappings() {
  try {
    const result = await retryableFetch('/location-space-mappings', 2, 1000);
    return result.data || [];
  } catch (error) {
    console.error('Failed to load location-space mappings:', error);
    return []; // Return empty array on failure to prevent app crashes
  }
}

// Delete location-space mapping
export async function deleteLocationSpaceMapping(location) {
  return await apiFetch(`/location-space-mappings/${encodeURIComponent(location)}`, {
    method: 'DELETE',
  });
}

// Delete ALL location-space mappings (reset)
export async function deleteAllLocationSpaceMappings() {
  return await apiFetch('/location-space-mappings', {
    method: 'DELETE',
  });
}

// Get unique shop names for a location
export async function getShopsForLocation(location) {
  const result = await apiFetch(`/locations/${encodeURIComponent(location)}/shops`);
  return result.data || [];
}

// Get unique shop names for a space (via space-to-locations mapping)
export async function getShopsForSpace(spaceId) {
  const result = await apiFetch(`/spaces/${encodeURIComponent(spaceId)}/shops`);
  return result.data || [];
}

// Get shop-element mappings for a space - NEW: uses spaceId
export async function getShopElementMappings(spaceId) {
  const result = await apiFetch(`/shop-element-mappings/${encodeURIComponent(spaceId)}`);
  return result.data || [];
}

// Save shop-element mappings - NEW: uses spaceId
export async function saveShopElementMappings(spaceId, mappings) {
  return await apiFetch('/shop-element-mappings', {
    method: 'POST',
    body: JSON.stringify({ spaceId, mappings }),
  });
}

// Delete a shop-element mapping - NEW: uses spaceId
export async function deleteShopElementMapping(spaceId, shopName) {
  return await apiFetch(
    `/shop-element-mappings/${encodeURIComponent(spaceId)}/${encodeURIComponent(shopName)}`,
    {
      method: 'DELETE',
    }
  );
}

// Delete all shop mappings for a specific element (when element is permanently deleted)
export async function deleteShopMappingsByElementId(spaceId, elementId) {
  return await apiFetch(
    `/shop-element-mappings/by-element/${spaceId}/${encodeURIComponent(elementId)}`,
    {
      method: 'DELETE',
    }
  );
}

// Delete shop revenue data for a specific element (when element is permanently deleted)
export async function deleteShopRevenueByElementId(spaceId, elementId) {
  return await apiFetch(`/shop-revenue/by-element/${spaceId}/${encodeURIComponent(elementId)}`, {
    method: 'DELETE',
  });
}

// Clear sales cache for a space (to force recalculation)
export async function clearSalesCacheForSpace(spaceId) {
  return await apiFetch(`/sales/cache/${spaceId}`, {
    method: 'DELETE',
  });
}

// DEBUG: Get all shop element mappings across all locations
export async function debugGetAllShopMappings() {
  const result = await apiFetch('/debug-shop-mappings');
  return result;
}

// Compute and cache space summary metrics for a location
// This should be called after F&B data integration via wizard
export async function computeSpaceSummaries(location) {
  return await apiFetch('/sales/compute-space-summaries', {
    method: 'POST',
    body: JSON.stringify({ location }),
  });
}

// Clear sales summary cache
export async function clearSalesSummaryCache() {
  return await apiFetch('/sales/clear-cache', {
    method: 'POST',
  });
}

// Recalculate revenue for all spaces with location mappings
export async function recalculateAllSpacesRevenue() {
  return await apiFetch('/sales/recalculate-all', {
    method: 'POST',
  });
}

// Calculate shop revenue for a location
export async function calculateShopRevenue(location) {
  return await apiFetch('/shop-revenue/calculate', {
    method: 'POST',
    body: JSON.stringify({ location }),
  });
}

// ===== EVENTS =====
// Fetch all events from the database
export async function getAllEvents() {
  const result = await apiFetch('/events');
  return result.data || [];
}

// Save an event
export async function saveEvent(event) {
  const result = await apiFetch('/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });
  return result.data;
}

// Delete an event
export async function deleteEvent(id) {
  await apiFetch(`/events/${id}`, {
    method: 'DELETE',
  });
}

// Calculate revenue for a specific event
export async function calculateEventRevenue(
  spaceId,
  spaceName,
  eventId,
  eventName,
  eventDate,
  location
) {
  return await apiFetch('/events/calculate-single-event-revenue', {
    method: 'POST',
    body: JSON.stringify({
      spaceId,
      spaceName,
      eventId,
      eventName,
      eventDate,
      location,
    }),
  });
}

// Get saved event revenue summary for a location
export async function getEventRevenueSummary(location) {
  const result = await apiFetch(`/event-revenue/location/${encodeURIComponent(location)}`);
  return result.data || [];
}

// Calculate revenue for unregistered events (dates with sales but no event)
export async function calculateUnregisteredEventRevenue(location) {
  return await apiFetch('/events/calculate-unregistered-revenue', {
    method: 'POST',
    body: JSON.stringify({ location }),
  });
}

// Save complete event revenue calculation for a space
export async function saveEventRevenueCalculation(
  spaceId,
  location,
  registeredEvents,
  unregisteredEvents,
  perCapita,
  avgTransaction,
  avgEvent
) {
  return await apiFetch('/events/save-event-revenue-calculation', {
    method: 'POST',
    body: JSON.stringify({
      spaceId,
      location,
      registeredEvents,
      unregisteredEvents,
      perCapita,
      avgTransaction,
      avgEvent,
    }),
  });
}

// Load saved event revenue calculation for a space
export async function getEventRevenueCalculation(spaceId) {
  return await apiFetch(`/events/get-event-revenue-calculation/${spaceId}`);
}

// Get shop revenue totals for a location
export async function getShopRevenueTotals(location) {
  const result = await apiFetch(`/shop-revenue/${encodeURIComponent(location)}/totals`);
  return result.data || [];
}

// Get shop revenue by event for a location
export async function getShopRevenueByEvent(location) {
  const result = await apiFetch(`/shop-revenue/${encodeURIComponent(location)}/by-event`);
  return result.data || [];
}

// Get revenue for a specific shop
export async function getShopRevenue(location, shopName) {
  const result = await apiFetch(
    `/shop-revenue/${encodeURIComponent(location)}/shop/${encodeURIComponent(shopName)}`
  );
  return result.data;
}

// Get list of unique shops for a location
export async function getShopsByLocation(location) {
  const result = await apiFetch(`/shops/by-location/${encodeURIComponent(location)}`);
  return result.data || [];
}

// Get event timeline data (minute-by-minute) for a specific event
export async function getEventTimeline(eventId) {
  const result = await apiFetch(`/event-timeline/${encodeURIComponent(eventId)}`);
  return result.data || [];
}

// Get unregistered dates for a space
export async function getUnregisteredDates(spaceId) {
  const result = await apiFetch('/sales/get-unregistered-dates', {
    method: 'POST',
    body: JSON.stringify({ spaceId }),
  });
  return result;
}

// Clear all shop revenue data for a location (to remove old/stale data)
export async function clearShopRevenueForLocation(location) {
  const result = await apiFetch(`/shop-revenue/${encodeURIComponent(location)}`, {
    method: 'DELETE',
  });
  return result;
}

// EMERGENCY: Clear ALL shop revenue data from database
export async function clearAllShopRevenue() {
  const result = await apiFetch(`/shop-revenue-all`, {
    method: 'DELETE',
  });
  return result;
}

// Cleanup legacy format shop revenue data
export async function cleanupLegacyShopRevenue() {
  const result = await apiFetch(`/shop-revenue-legacy-cleanup`, {
    method: 'DELETE',
  });
  return result;
}

// Calculate revenue for a single shop across all events for a location
export async function calculateSingleShopRevenue(location, shopName) {
  const result = await apiFetch('/events/calculate-single-shop-revenue', {
    method: 'POST',
    body: JSON.stringify({ location, shopName }),
  });
  return result;
}

// Debug: Check revenue for a specific location
export async function debugLocationRevenue(location) {
  const { projectId, publicAnonKey } = await import('./supabase/info');
  const response = await fetch(
    `https://${projectId}.supabase.co/functions/v1/make-server-eb31619c/debug/location-revenue/${encodeURIComponent(
      location
    )}`,
    {
      headers: {
        'Authorization': `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to debug location revenue: ${response.statusText}`);
  }

  return await response.json();
}

// ===== FNb ITEMS =====
// Get all unique items from fnb_items table, optionally filtered by location
export async function getFnbItems(location) {
  const url = location
    ? `/fnb-items?location=${encodeURIComponent(location)}`
    : '/fnb-items';
  const result = await apiFetch(url);
  return result.data || [];
}

// Save menu item mapping - NEW: uses spaceId
export async function saveMenuItemMapping(fnbItem, menuItemId, menuItemName, spaceId) {
  return await apiFetch('/menu-item-mappings', {
    method: 'POST',
    body: JSON.stringify({ fnbItem, menuItemId, menuItemName, spaceId }),
  });
}

// Get menu item mappings - NEW: uses spaceId
export async function getMenuItemMappings(spaceId) {
  const endpoint = `/menu-item-mappings?spaceId=${encodeURIComponent(spaceId)}`;
  const result = await apiFetch(endpoint);
  return result.data || [];
}

// Delete menu item mapping - NEW: uses spaceId
export async function deleteMenuItemMapping(spaceId, fnbItem) {
  return await apiFetch(
    `/menu-item-mappings/${encodeURIComponent(spaceId)}/${encodeURIComponent(fnbItem)}`,
    {
      method: 'DELETE',
    }
  );
}

// Rebuild consolidated menu mappings - NEW: uses spaceId
export async function rebuildMenuMappings(spaceId) {
  return await apiFetch('/rebuild-menu-mappings', {
    method: 'POST',
    body: JSON.stringify({ spaceId }),
  });
}

// Rebuild consolidated shop mappings - NEW: uses spaceId
export async function rebuildShopMappings(spaceId) {
  return await apiFetch('/rebuild-shop-mappings', {
    method: 'POST',
    body: JSON.stringify({ spaceId }),
  });
}

// Migrate menu item mappings to use spaceId-based keys
export async function migrateMenuItemMappings(spaceId) {
  return await apiFetch('/migrate-menu-item-mappings', {
    method: 'POST',
    body: JSON.stringify({ spaceId }),
  });
}

// Copy menu item mappings from one space to another
export async function copyMenuMappings(fromSpaceId, toSpaceId) {
  return await apiFetch('/copy-menu-mappings', {
    method: 'POST',
    body: JSON.stringify({ fromSpaceId, toSpaceId }),
  });
}

// Diagnose menu mappings across all spaces
export async function diagnoseMenuMappings() {
  return await apiFetch('/diagnose-menu-mappings', {
    method: 'GET',
  });
}

// Migrate shop mappings to use registry IDs instead of floor element IDs
export async function migrateShopElementIds(location, spaceId) {
  return await apiFetch('/migrate-shop-element-ids', {
    method: 'POST',
    body: JSON.stringify({ location, spaceId }),
  });
}

// Cleanup duplicate shop mappings (keep only registry ID versions)
export async function cleanupShopMappings() {
  return await apiFetch('/cleanup-shop-mappings', {
    method: 'POST',
  });
}

// MAJOR MIGRATION: Move all location-based KV keys to spaceId-based keys
export async function migrateLocationToSpaceId() {
  return await apiFetch('/migrate-location-to-spaceid', {
    method: 'POST',
  });
}

// ===== MENU REVENUE =====
// Calculate revenue for a single menu item across all shops and events for a location
export async function calculateSingleMenuItemRevenue(location, menuItemId, menuItemName) {
  const result = await apiFetch('/events/calculate-single-menu-item-revenue', {
    method: 'POST',
    body: JSON.stringify({ location, menuItemId, menuItemName }),
  });
  return result;
}

// Save menu revenue calculation to database
export async function saveMenuRevenueCalculation(location, data) {
  return await apiFetch('/menu-revenue/save', {
    method: 'POST',
    body: JSON.stringify({ location, data }),
  });
}

// Get saved menu revenue calculation from database
export async function getMenuRevenueCalculation(location) {
  const result = await apiFetch(`/menu-revenue/${encodeURIComponent(location)}`);
  return result;
}

// Get menu revenue totals for a location
export async function getMenuRevenueTotals(location) {
  const result = await apiFetch(`/menu-revenue/${encodeURIComponent(location)}/totals`);
  return result.data || [];
}

// ===== Shop Performance API =====

// Save shop performance indexes (called during wizard finalization)
export async function saveShopPerformanceIndexes(location, data) {
  return await apiFetch('/shop-performance/save', {
    method: 'POST',
    body: JSON.stringify({ location, ...data }),
  });
}

// Delete old shop performance data for a location (cleanup endpoint)
export async function deleteShopPerformanceData(location) {
  return await apiFetch(`/shop-performance/cleanup/${encodeURIComponent(location)}`, {
    method: 'DELETE',
  });
}

// Get shop performance for a location
export async function getShopPerformance(location) {
  const result = await apiFetch(`/shop-performance/${encodeURIComponent(location)}`);
  return result.data || [];
}

// Get detailed shop-menuitem-event records for a specific shop
export async function getShopDetails(location, shopName) {
  const result = await apiFetch(
    `/shop-performance/${encodeURIComponent(location)}/${encodeURIComponent(shopName)}/details`
  );
  return result.data || [];
}

// Get ALL shop-menuitem-event records for a location (for filtering)
export async function getAllShopDetails(location) {
  try {
    console.log(`[getAllShopDetails] Fetching all shop details for location: ${location}`);
    const result = await retryableFetch(
      `/shop-performance/${encodeURIComponent(location)}/all-details`,
      2,
      2000
    );
    console.log(
      `[getAllShopDetails] Successfully fetched ${result.data?.length || 0} records`
    );
    return result.data || [];
  } catch (error) {
    console.error(`[getAllShopDetails] Error fetching shop details for ${location}:`, error);
    // Return empty array on timeout/error to prevent app crashes
    return [];
  }
}

// Get ALL shop-menuitem-event records for a SPACE (NEW: uses spaceId)
export async function getAllShopDetailsBySpace(spaceId) {
  try {
    console.log(
      `[getAllShopDetailsBySpace] Fetching all shop details for spaceId: ${spaceId}`
    );
    const result = await retryableFetch(
      `/shop-performance-by-space/${encodeURIComponent(spaceId)}/all-details`,
      2,
      2000
    );
    console.log(
      `[getAllShopDetailsBySpace] Successfully fetched ${result.data?.length || 0} records`
    );
    return result.data || [];
  } catch (error) {
    console.error(
      `[getAllShopDetailsBySpace] Error fetching shop details for ${spaceId}:`,
      error
    );
    // Return empty array on timeout/error to prevent app crashes
    return [];
  }
}

// Delete shop performance data for a location
export async function deleteShopPerformance(location) {
  return await apiFetch(`/shop-performance/${encodeURIComponent(location)}`, {
    method: 'DELETE',
  });
}

// ===== TYPES AND CATEGORIES =====
// Initialize types and categories
export async function initializeTypesAndCategories() {
  const result = await apiFetch('/types-categories/init');
  return result;
}

// Get all types
export async function getAllTypes() {
  const result = await apiFetch('/types');
  return result.data || [];
}

// Create new type
export async function createType(name) {
  const result = await apiFetch('/types', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
  return result.data;
}

// Get all categories
export async function getAllCategories() {
  const result = await apiFetch('/categories');
  return result.data || [];
}

// Get categories for a specific type
export async function getCategoriesByType(typeId) {
  const result = await apiFetch(`/categories/${typeId}`);
  return result.data || [];
}

// Create new category
export async function createCategory(name, typeId) {
  const result = await apiFetch('/categories', {
    method: 'POST',
    body: JSON.stringify({ name, typeId }),
  });
  return result.data;
}

// ===== AGGREGATIONS =====
// Get category aggregations
export async function getCategoryAggregations(categoryId) {
  try {
    const result = await apiFetch(`/aggregations/category/${categoryId}`);
    return result.data || null;
  } catch (error) {
    // Return null if aggregations don't exist yet
    return null;
  }
}

// Get type aggregations
export async function getTypeAggregations(typeId) {
  try {
    const result = await apiFetch(`/aggregations/type/${typeId}`);
    return result.data || null;
  } catch (error) {
    // Return null if aggregations don't exist yet
    return null;
  }
}

// Get all category aggregations
export async function getAllCategoryAggregations() {
  const result = await apiFetch('/aggregations/categories');
  return result.data || [];
}

// Get all type aggregations
export async function getAllTypeAggregations() {
  const result = await apiFetch('/aggregations/types');
  return result.data || [];
}

// Manually trigger aggregation recalculation for a category
export async function recalculateCategoryAggregations(categoryId) {
  const result = await apiFetch(`/aggregations/recalculate/category/${categoryId}`, {
    method: 'POST',
  });
  return result.data;
}

// Manually trigger aggregation recalculation for a type
export async function recalculateTypeAggregations(typeId) {
  const result = await apiFetch(`/aggregations/recalculate/type/${typeId}`, {
    method: 'POST',
  });
  return result.data;
}

// Recalculate all aggregations (categories and types)
export async function recalculateAllAggregations() {
  const result = await apiFetch('/aggregations/recalculate-all', {
    method: 'POST',
  });
  return result;
}

// ===== AGGREGATION QUEUE MANAGEMENT =====
// Get dirty aggregation queue status
export async function getAggregationQueueStatus() {
  const result = await apiFetch('/aggregations/queue/status');
  return result.data;
}

// Process dirty aggregations in batch
export async function processAggregationQueue(maxTimeMs, maxBatchSize) {
  const result = await apiFetch('/aggregations/queue/process', {
    method: 'POST',
    body: JSON.stringify({ maxTimeMs, maxBatchSize }),
  });
  return result;
}

// Clear dirty aggregation queue
export async function clearAggregationQueue() {
  const result = await apiFetch('/aggregations/queue/clear', {
    method: 'POST',
  });
  return result;
}

// Mark all categories and types as dirty
export async function markAllAggregationsDirty() {
  const result = await apiFetch('/aggregations/queue/mark-all-dirty', {
    method: 'POST',
  });
  return result;
}

// ===== USER PREFERENCES =====
// Get user preferences
export async function getUserPreferences() {
  const result = await apiFetch('/preferences');
  return result.data;
}

// Save user preferences
export async function saveUserPreferences(preferences) {
  const result = await apiFetch('/preferences', {
    method: 'POST',
    body: JSON.stringify(preferences),
  });
  return result.data;
}

// ===== CACHE DIAGNOSTICS =====
// Get cache diagnostic information for a space
export async function getCacheDiagnostic(spaceId) {
  const result = await apiFetch(`/cache-diagnostic/${encodeURIComponent(spaceId)}`);
  return result.diagnostic;
}

// Set KV data by key (PUT) - utilisé par Event Predict pour persister
// versions, default-version et menu-config par event.
// Ref React : versionReact/.../EventPredictView.tsx:1635
export async function setKVData(key, data) {
  const result = await apiFetch(`/kv/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return result;
}

// Get KV data by key (with retry for large data)
export async function getKVData(key) {
  // Use retry logic for large data keys that might timeout
  if (key.startsWith('shop-granular-records:') || key.startsWith('shop-performance-cache:')) {
    console.log(`[KV GET] Fetching large data with retry logic: ${key}`);
    const result = await retryableFetch(`/kv/${encodeURIComponent(key)}`, 2, 2000);
    return result.data;
  }

  // Standard fetch for normal-sized data
  const result = await apiFetch(`/kv/${encodeURIComponent(key)}`);
  return result.data;
}

// ===== INVENTORY COUNTS =====
export async function saveInventoryCount(inventoryCountData) {
  const result = await apiFetch('/inventory-counts', {
    method: 'POST',
    body: JSON.stringify(inventoryCountData),
  });
  return result.data;
}

// Save complete inventory for a space and event
export async function saveInventory(inventoryData) {
  const result = await apiFetch('/inventory', {
    method: 'POST',
    body: JSON.stringify(inventoryData),
  });
  return result.data;
}

// Load packaging types used by inventory counting labels
export async function getAllPackagingTypes() {
  const result = await apiFetch('/packaging-types');
  return result.data || [];
}

// Load inventory for a specific space and event
export async function getInventory(spaceId, eventId) {
  const result = await apiFetch(
    `/inventory/${encodeURIComponent(spaceId)}/${encodeURIComponent(eventId)}`
  );

  // Handle 404 response (no inventory found) - this is expected for new inventories
  if (result.notFound) {
    return null;
  }

  return result.data;
}

// Get the most recent inventory for a space (useful for loading last event's inventory)
export async function getLatestInventory(spaceId) {
  const result = await apiFetch(`/inventory/${encodeURIComponent(spaceId)}/latest`);

  // Handle 404 response (no inventory found)
  if (result.notFound) {
    return null;
  }

  return result.data;
}