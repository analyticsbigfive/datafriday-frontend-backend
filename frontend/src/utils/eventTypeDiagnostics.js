// Diagnostic utility to check event type usage and find orphaned entries
import * as eventApi from './eventApi.js';

export async function analyzeEventTypes() {
  try {
    const [eventTypes, categories, events] = await Promise.all([
      eventApi.getEventTypes(),
      eventApi.getEventCategories(),
      eventApi.getAllEvents()
    ]);

    return eventTypes.map(type => {
      // Find categories linked to this type
      const linkedCategories = categories.filter(cat => cat.eventTypeId === type.id);
      
      // Find events linked to this type
      const linkedEvents = events.filter(event => event.eventTypeId === type.id);
      
      return {
        id: type.id,
        name: type.name,
        categoryCount: linkedCategories.length,
        eventCount: linkedEvents.length,
        categories: linkedCategories.map(cat => cat.name),
        isOrphaned: linkedCategories.length === 0 && linkedEvents.length === 0
      };
    });
  } catch (error) {
    console.error('Failed to analyze event types:', error);
    return [];
  }
}

export async function getOrphanedEventTypes() {
  const analysis = await analyzeEventTypes();
  return analysis.filter(type => type.isOrphaned);
}

export async function deleteOrphanedEventTypes() {
  const orphaned = await getOrphanedEventTypes();
  let deleted = 0;
  let errors = 0;

  for (const type of orphaned) {
    try {
      await eventApi.deleteEventType(type.id);
      deleted++;
    } catch (error) {
      console.error(`Failed to delete orphaned event type ${type.name}:`, error);
      errors++;
    }
  }

  return { deleted, errors };
}