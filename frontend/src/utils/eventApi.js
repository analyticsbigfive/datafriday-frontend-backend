// Event API functions for managing events and related data
import { projectId, publicAnonKey } from './supabase/info'
const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-eb31619c`
// Helper function for API calls
async function apiCall(endpoint, options = {}) {
  // Create abort controller for timeout (30 seconds)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${publicAnonKey}`,
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`API call failed: ${error}`)
    }
    return response.json()
  } catch (error) {
    clearTimeout(timeoutId)
    // Handle timeout errors
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Request timeout for ${endpoint} (30s)`)
      throw new Error('Request timed out. The server took too long to respond.')
    }
    throw error
  }
}
// Lock to prevent concurrent initialization
let isInitializing = false
let initializationPromise = null
// Initialize default data
export async function initializeEventData() {
  // If already initializing, wait for that to complete
  if (isInitializing && initializationPromise) {
    return initializationPromise
  }
  // If not initializing, start initialization
  if (!isInitializing) {
    isInitializing = true
    initializationPromise = (async () => {
      try {
        // Initialize Event Types
        const existingTypes = await getEventTypes()
        if (existingTypes.length === 0) {
          const defaultTypes = [
            { id: crypto.randomUUID(), name: 'Sport' },
            { id: crypto.randomUUID(), name: 'Entertainment' },
            { id: crypto.randomUUID(), name: 'MICE' },
          ]
          for (const type of defaultTypes) {
            await createEventType(type)
          }
          // Initialize Event Categories
          const sportType = defaultTypes.find((t) => t.name === 'Sport')
          const entertainmentType = defaultTypes.find((t) => t.name === 'Entertainment')
          const miceType = defaultTypes.find((t) => t.name === 'MICE')
          const defaultCategories = [
            { id: crypto.randomUUID(), name: 'Basketball', eventTypeId: sportType.id, hasHomeTeam: true },
            { id: crypto.randomUUID(), name: 'Handball', eventTypeId: sportType.id, hasHomeTeam: true },
            { id: crypto.randomUUID(), name: 'Martial Art', eventTypeId: sportType.id, hasHomeTeam: false },
            { id: crypto.randomUUID(), name: 'Concert', eventTypeId: entertainmentType.id },
            { id: crypto.randomUUID(), name: 'Show', eventTypeId: entertainmentType.id },
            { id: crypto.randomUUID(), name: 'Tradeshow', eventTypeId: miceType.id },
            { id: crypto.randomUUID(), name: 'Exhibition', eventTypeId: miceType.id },
          ]
          for (const category of defaultCategories) {
            await createEventCategory(category)
          }
          // Initialize Event Subcategories
          const basketball = defaultCategories.find((c) => c.name === 'Basketball')
          const handball = defaultCategories.find((c) => c.name === 'Handball')
          const martialArt = defaultCategories.find((c) => c.name === 'Martial Art')
          const concert = defaultCategories.find((c) => c.name === 'Concert')
          const show = defaultCategories.find((c) => c.name === 'Show')
          const tradeshow = defaultCategories.find((c) => c.name === 'Tradeshow')
          const exhibition = defaultCategories.find((c) => c.name === 'Exhibition')
          const defaultSubcategories = [
            // Basketball
            { id: crypto.randomUUID(), name: 'Ligue 1', eventCategoryId: basketball.id },
            { id: crypto.randomUUID(), name: 'Cup', eventCategoryId: basketball.id },
            { id: crypto.randomUUID(), name: 'European Cup', eventCategoryId: basketball.id },
            { id: crypto.randomUUID(), name: 'Friendly', eventCategoryId: basketball.id },
            // Handball
            { id: crypto.randomUUID(), name: 'Ligue 1', eventCategoryId: handball.id },
            { id: crypto.randomUUID(), name: 'Cup', eventCategoryId: handball.id },
            { id: crypto.randomUUID(), name: 'European Cup', eventCategoryId: handball.id },
            { id: crypto.randomUUID(), name: 'Friendly', eventCategoryId: handball.id },
            // Martial Art
            { id: crypto.randomUUID(), name: 'Boxing', eventCategoryId: martialArt.id },
            { id: crypto.randomUUID(), name: 'MMA', eventCategoryId: martialArt.id },
            { id: crypto.randomUUID(), name: 'Judo', eventCategoryId: martialArt.id },
            // Concert
            { id: crypto.randomUUID(), name: 'Rock', eventCategoryId: concert.id },
            { id: crypto.randomUUID(), name: 'Rap', eventCategoryId: concert.id },
            { id: crypto.randomUUID(), name: 'Pop', eventCategoryId: concert.id },
            { id: crypto.randomUUID(), name: 'R&B', eventCategoryId: concert.id },
            { id: crypto.randomUUID(), name: 'Metal', eventCategoryId: concert.id },
            { id: crypto.randomUUID(), name: 'K-Pop', eventCategoryId: concert.id },
            // Show
            { id: crypto.randomUUID(), name: 'Magic', eventCategoryId: show.id },
            { id: crypto.randomUUID(), name: 'Standup Comedy', eventCategoryId: show.id },
            { id: crypto.randomUUID(), name: 'Play', eventCategoryId: show.id },
            // Tradeshow
            { id: crypto.randomUUID(), name: 'Motor', eventCategoryId: tradeshow.id },
            { id: crypto.randomUUID(), name: 'Electronic', eventCategoryId: tradeshow.id },
            { id: crypto.randomUUID(), name: 'IT', eventCategoryId: tradeshow.id },
            { id: crypto.randomUUID(), name: 'Tourism', eventCategoryId: tradeshow.id },
            { id: crypto.randomUUID(), name: 'Cooking', eventCategoryId: tradeshow.id },
            // Exhibition
            { id: crypto.randomUUID(), name: 'Photography', eventCategoryId: exhibition.id },
            { id: crypto.randomUUID(), name: 'Sculpture', eventCategoryId: exhibition.id },
            { id: crypto.randomUUID(), name: 'Modern', eventCategoryId: exhibition.id },
          ]
          for (const subcategory of defaultSubcategories) {
            await createEventSubcategory(subcategory)
          }
        }
      } catch (error) {
        console.error('Failed to initialize event data:', error)
      } finally {
        isInitializing = false
        initializationPromise = null
      }
    })()
    return initializationPromise
  }
}
// Events
export async function getAllEvents() {
  try {
    const result = await apiCall('/events')
    return result.data || []
  } catch (error) {
    console.error('Failed to get events:', error)
    return []
  }
}
export async function createEvent(event) {
  try {
    const result = await apiCall('/events', {
      method: 'POST',
      body: JSON.stringify(event),
    })
    return result.data
  } catch (error) {
    console.error('Failed to create event:', error)
    throw error
  }
}
export async function updateEvent(updatedEvent) {
  try {
    await apiCall(`/events/${updatedEvent.id}`, {
      method: 'PUT',
      body: JSON.stringify(updatedEvent),
    })
  } catch (error) {
    console.error('Failed to update event:', error)
    throw error
  }
}
export async function deleteEvent(eventId) {
  try {
    await apiCall(`/events/${eventId}`, {
      method: 'DELETE',
    })
  } catch (error) {
    console.error('Failed to delete event:', error)
    throw error
  }
}
// Event Types
export async function getEventTypes() {
  try {
    const result = await apiCall('/event-types')
    return result.data || []
  } catch (error) {
    console.error('Failed to get event types:', error)
    return []
  }
}
export async function createEventType(eventType) {
  try {
    await apiCall('/event-types', {
      method: 'POST',
      body: JSON.stringify(eventType),
    })
  } catch (error) {
    console.error('Failed to create event type:', error)
    throw error
  }
}
export async function updateEventType(updatedType) {
  try {
    await apiCall(`/event-types/${updatedType.id}`, {
      method: 'PUT',
      body: JSON.stringify(updatedType),
    })
  } catch (error) {
    console.error('Failed to update event type:', error)
    throw error
  }
}
export async function deleteEventType(typeId) {
  try {
    await apiCall(`/event-types/${typeId}`, {
      method: 'DELETE',
    })
  } catch (error) {
    console.error('Failed to delete event type:', error)
    throw error
  }
}
// Event Categories
export async function getEventCategories() {
  try {
    const result = await apiCall('/event-categories')
    return result.data || []
  } catch (error) {
    console.error('Failed to get event categories:', error)
    return []
  }
}
export async function createEventCategory(category) {
  try {
    await apiCall('/event-categories', {
      method: 'POST',
      body: JSON.stringify(category),
    })
  } catch (error) {
    console.error('Failed to create event category:', error)
    throw error
  }
}
export async function updateEventCategory(updatedCategory) {
  try {
    await apiCall(`/event-categories/${updatedCategory.id}`, {
      method: 'PUT',
      body: JSON.stringify(updatedCategory),
    })
  } catch (error) {
    console.error('Failed to update event category:', error)
    throw error
  }
}
export async function deleteEventCategory(categoryId) {
  try {
    await apiCall(`/event-categories/${categoryId}`, {
      method: 'DELETE',
    })
  } catch (error) {
    console.error('Failed to delete event category:', error)
    throw error
  }
}
// Event Subcategories
export async function getEventSubcategories() {
  try {
    const result = await apiCall('/event-subcategories')
    return result.data || []
  } catch (error) {
    console.error('Failed to get event subcategories:', error)
    return []
  }
}
export async function createEventSubcategory(subcategory) {
  try {
    await apiCall('/event-subcategories', {
      method: 'POST',
      body: JSON.stringify(subcategory),
    })
  } catch (error) {
    console.error('Failed to create event subcategory:', error)
    throw error
  }
}
export async function updateEventSubcategory(updatedSubcategory) {
  try {
    await apiCall(`/event-subcategories/${updatedSubcategory.id}`, {
      method: 'PUT',
      body: JSON.stringify(updatedSubcategory),
    })
  } catch (error) {
    console.error('Failed to update event subcategory:', error)
    throw error
  }
}
export async function deleteEventSubcategory(subcategoryId) {
  try {
    await apiCall(`/event-subcategories/${subcategoryId}`, {
      method: 'DELETE',
    })
  } catch (error) {
    console.error('Failed to delete event subcategory:', error)
    throw error
  }
}
// Teams
export async function getTeams() {
  try {
    const result = await apiCall('/teams')
    return result.data || []
  } catch (error) {
    console.error('Failed to get teams:', error)
    return []
  }
}
export async function createTeam(team) {
  try {
    await apiCall('/teams', {
      method: 'POST',
      body: JSON.stringify(team),
    })
  } catch (error) {
    console.error('Failed to create team:', error)
    throw error
  }
}
// Sponsors
export async function getSponsors() {
  try {
    const result = await apiCall('/sponsors')
    return result.data || []
  } catch (error) {
    console.error('Failed to get sponsors:', error)
    return []
  }
}
export async function createSponsor(sponsor) {
  try {
    await apiCall('/sponsors', {
      method: 'POST',
      body: JSON.stringify(sponsor),
    })
  } catch (error) {
    console.error('Failed to create sponsor:', error)
    throw error
  }
}