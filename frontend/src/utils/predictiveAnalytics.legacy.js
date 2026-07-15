// Predictive Analytics Utility
// Finds similar past events and generates predictive sales data for future events

const DEFAULT_WEIGHTS = {
  eventType: 10,
  category: 10,
  subcategory: 8,
  team: 9,
  visitingTeam: 9,
  sponsor: 5,
  performer: 8,
  openingAct: 4,
  attendance: 10,
  dayOfWeek: 7,
  timeOfDay: 9,
};

/**
 * Parse DD/MM/YYYY date string to Date object
 */
function parseDDMMYYYY(dateStr) {
  if (!dateStr) return null;
  
  // Try ISO format first
  if (dateStr.includes('-')) {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) return date;
  }
  
  // Parse DD/MM/YYYY
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  
  return new Date(year, month, day);
}

/**
 * Calculate similarity score between two events
 * Higher score = more similar
 * FLEXIBLE ALGORITHM: Only includes attributes that both events have in the scoring
 */
export function calculateEventSimilarity(
  targetEvent,
  candidateEvent,
  weights = DEFAULT_WEIGHTS
) {
  let score = 0;
  let maxPossibleScore = 0;

  // Event Type match - only count if BOTH events have this attribute
  if (targetEvent.eventType && candidateEvent.eventType) {
    maxPossibleScore += weights.eventType;
    if (targetEvent.eventType === candidateEvent.eventType) {
      score += weights.eventType;
    }
  }

  // Category match - only count if BOTH events have this attribute
  if (targetEvent.category && candidateEvent.category) {
    maxPossibleScore += weights.category;
    if (targetEvent.category === candidateEvent.category) {
      score += weights.category;
    }
  }

  // Subcategory match - only count if BOTH events have this attribute
  if (targetEvent.subcategory && candidateEvent.subcategory) {
    maxPossibleScore += weights.subcategory;
    if (targetEvent.subcategory === candidateEvent.subcategory) {
      score += weights.subcategory;
    }
  }

  // Team match (for sports events) - only count if BOTH events have this attribute
  if (targetEvent.team && candidateEvent.team) {
    maxPossibleScore += weights.team;
    if (targetEvent.team === candidateEvent.team) {
      score += weights.team;
    }
  }

  // Visiting Team match - only count if BOTH events have this attribute
  if (targetEvent.visitingTeamId && candidateEvent.visitingTeamId) {
    maxPossibleScore += weights.visitingTeam;
    if (targetEvent.visitingTeamId === candidateEvent.visitingTeamId) {
      score += weights.visitingTeam;
    }
  }

  // Sponsor match (for tradeshow/MICE events) - only count if BOTH events have this attribute
  if (targetEvent.sponsorName && candidateEvent.sponsorName) {
    maxPossibleScore += weights.sponsor;
    if (targetEvent.sponsorName === candidateEvent.sponsorName) {
      score += weights.sponsor;
    }
  }

  // Performer match (for concerts/shows) - only count if BOTH events have this attribute
  if (targetEvent.performerName && candidateEvent.performerName) {
    maxPossibleScore += weights.performer;
    if (targetEvent.performerName === candidateEvent.performerName) {
      score += weights.performer;
    }
  }

  // Opening Act match - only count if BOTH events have this attribute
  if (targetEvent.openingActName && candidateEvent.openingActName) {
    maxPossibleScore += weights.openingAct;
    if (targetEvent.openingActName === candidateEvent.openingActName) {
      score += weights.openingAct;
    }
  }

  // Attendance similarity (within 10% range) - only count if BOTH events have this attribute
  const targetAttendance = targetEvent.ticketsSold || targetEvent.ticketsScanned || 0;
  const candidateAttendance = candidateEvent.ticketsSold || candidateEvent.ticketsScanned || 0;
  
  if (targetAttendance > 0 && candidateAttendance > 0) {
    maxPossibleScore += weights.attendance;
    const attendanceRatio = Math.min(targetAttendance, candidateAttendance) / 
                            Math.max(targetAttendance, candidateAttendance);
    
    // Give full credit if within 10%, partial credit based on ratio
    if (attendanceRatio >= 0.9) {
      // Within 10% - give full credit
      score += weights.attendance;
    } else {
      // Outside 10% - give proportional credit based on ratio
      score += weights.attendance * attendanceRatio;
    }
  }

  // Day of week similarity - ALWAYS included (every event has a date)
  const targetDate = parseDDMMYYYY(targetEvent.eventDate);
  const candidateDate = parseDDMMYYYY(candidateEvent.eventDate);
  
  if (targetDate && candidateDate) {
    maxPossibleScore += weights.dayOfWeek;
    const targetDay = targetDate.getDay();
    const candidateDay = candidateDate.getDay();
    
    if (targetDay === candidateDay) {
      score += weights.dayOfWeek;
    } else if (
      // Weekend vs weekend or weekday vs weekday
      (targetDay === 0 || targetDay === 6) === (candidateDay === 0 || candidateDay === 6)
    ) {
      score += weights.dayOfWeek * 0.5;
    }
  }

  // Time of day similarity (based on show time) - only count if BOTH events have this attribute
  const targetShowTime = targetEvent.sessions?.[0]?.showTime;
  const candidateShowTime = candidateEvent.sessions?.[0]?.showTime;
  
  if (targetShowTime && candidateShowTime) {
    maxPossibleScore += weights.timeOfDay;
    const targetHour = parseInt(targetShowTime.split(':')[0]);
    const candidateHour = parseInt(candidateShowTime.split(':')[0]);
    const hourDiff = Math.abs(targetHour - candidateHour);
    
    if (hourDiff === 0) {
      score += weights.timeOfDay;
    } else if (hourDiff === 1) {
      score += weights.timeOfDay * 0.75;
    }
  }

  // Return normalized score (0-1)
  // If maxPossibleScore is 0 (no common attributes), return 0
  return maxPossibleScore > 0 ? score / maxPossibleScore : 0;
}

/**
 * Find similar past events for a future event
 * RELAXED ALGORITHM: Uses a flexible minimum score and falls back to best available matches
 */
export function findSimilarPastEvents(
  futureEvent,
  allEvents,
  minSimilarityScore = 0.05, // REDUCED from 0.3 to 0.05 (5%) for more flexibility
  maxResults = 10
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Filter to only past events with revenue data
  const pastEvents = allEvents.filter(event => {
    if (event.id === futureEvent.id) return false;
    
    const eventDate = parseDDMMYYYY(event.eventDate);
    if (!eventDate || eventDate > today) return false;
    
    // Only include events with actual revenue data
    if (!event.event_revenue_HT || event.event_revenue_HT === 0) return false;
    
    return true;
  });

  if (pastEvents.length === 0) {
    console.log(`[PREDICTIVE] ${futureEvent.eventName}: No past events with revenue data available`);
    console.log(`[PREDICTIVE] ${futureEvent.eventName}: Total events checked: ${allEvents.length}`);
    const pastEventsWithoutRevenue = allEvents.filter(event => {
      const eventDate = parseDDMMYYYY(event.eventDate);
      return eventDate && eventDate <= today;
    });
    console.log(`[PREDICTIVE] ${futureEvent.eventName}: Past events (without revenue filter): ${pastEventsWithoutRevenue.length}`);
    return [];
  }

  console.log(`[PREDICTIVE] ${futureEvent.eventName}: Found ${pastEvents.length} past events with revenue`);

  // Calculate similarity scores
  const scoredEvents = pastEvents.map(event => ({
    event,
    similarityScore: calculateEventSimilarity(futureEvent, event),
  }));

  // Sort by score
  scoredEvents.sort((a, b) => b.similarityScore - a.similarityScore);

  // Log top 3 similarity scores for debugging
  const top3 = scoredEvents.slice(0, 3);
  console.log(`[PREDICTIVE] ${futureEvent.eventName}: Top 3 similarity scores:`, 
    top3.map(se => `${se.event.eventName} = ${(se.similarityScore * 100).toFixed(1)}%`).join(', ')
  );

  // Filter by minimum similarity
  const similarEvents = scoredEvents.filter(item => item.similarityScore >= minSimilarityScore);

  // If we found enough similar events, return them
  if (similarEvents.length >= 3) {
    return similarEvents.slice(0, maxResults);
  }

  // FALLBACK: If not enough similar events, use the top matches even if below threshold
  // This ensures we always get predictions (with lower confidence)
  console.log(`[PREDICTIVE] Only ${similarEvents.length} events above ${minSimilarityScore} threshold, using top ${Math.min(5, pastEvents.length)} matches as fallback`);
  return scoredEvents.slice(0, Math.min(5, pastEvents.length));
}

/**
 * Generate predictive sales data for a future event based on similar past events
 */
export function generatePredictiveData(
  futureEvent,
  similarEvents,
  shopGranularData
) {
  if (similarEvents.length === 0) {
    console.log(`[PREDICTIVE] No similar events found for ${futureEvent.eventName}`);
    return [];
  }

  console.log(`[PREDICTIVE] Generating predictions for ${futureEvent.eventName} based on ${similarEvents.length} similar events`);

  // Group shop data by event, element (shop), and menu item
  const eventShopMenuData = new Map();
  
  shopGranularData.forEach(record => {
    if (!eventShopMenuData.has(record.eventId)) {
      eventShopMenuData.set(record.eventId, new Map());
    }
    const eventData = eventShopMenuData.get(record.eventId);
    
    if (!eventData.has(record.elementId)) {
      eventData.set(record.elementId, new Map());
    }
    const shopData = eventData.get(record.elementId);
    
    if (!shopData.has(record.menuItemId)) {
      shopData.set(record.menuItemId, []);
    }
    shopData.get(record.menuItemId).push(record);
  });

  // Collect all unique shop/menu item combinations from similar events
  const shopMenuCombinations = new Map();
  const shopMenuRevenues = new Map();
  
  similarEvents.forEach(({ event, similarityScore }) => {
    const eventData = eventShopMenuData.get(event.id);
    if (!eventData) return;

    eventData.forEach((shopData, elementId) => {
      if (!shopMenuCombinations.has(elementId)) {
        shopMenuCombinations.set(elementId, new Map());
        shopMenuRevenues.set(elementId, new Map());
      }
      
      shopData.forEach((records, menuItemId) => {
        const totalQuantity = records.reduce((sum, r) => sum + (r.quantity || 0), 0);
        const totalRevenue = records.reduce((sum, r) => sum + (r.revenue || 0), 0);
        
        if (!shopMenuCombinations.get(elementId).has(menuItemId)) {
          shopMenuCombinations.get(elementId).set(menuItemId, []);
          shopMenuRevenues.get(elementId).set(menuItemId, []);
        }
        
        // Weight by similarity score
        shopMenuCombinations.get(elementId).get(menuItemId).push(totalQuantity * similarityScore);
        shopMenuRevenues.get(elementId).get(menuItemId).push(totalRevenue * similarityScore);
      });
    });
  });

  // Calculate weighted averages and generate predictive records
  const predictiveRecords = [];
  const totalSimilarityWeight = similarEvents.reduce((sum, { similarityScore }) => sum + similarityScore, 0);
  
  // Calculate confidence score based on:
  // 1. Average similarity score of source events (0-100%)
  // 2. Number of similar events used (more events = higher confidence)
  const avgSimilarityScore = totalSimilarityWeight / similarEvents.length;
  const eventCountFactor = Math.min(similarEvents.length / 10, 1); // Max out at 10 events
  const confidenceScore = Math.round((avgSimilarityScore * 0.7 + eventCountFactor * 0.3) * 100);
  
  console.log(`[PREDICTIVE] Confidence calculation:`, {
    avgSimilarity: (avgSimilarityScore * 100).toFixed(1) + '%',
    eventCount: similarEvents.length,
    finalConfidence: confidenceScore + '%'
  });
  
  shopMenuCombinations.forEach((menuItems, elementId) => {
    menuItems.forEach((quantities, menuItemId) => {
      const revenues = shopMenuRevenues.get(elementId).get(menuItemId);
      
      // Calculate weighted average
      const avgQuantity = quantities.reduce((sum, q) => sum + q, 0) / totalSimilarityWeight;
      const avgRevenue = revenues.reduce((sum, r) => sum + r, 0) / totalSimilarityWeight;
      
      // Only create record if there's meaningful data
      if (avgQuantity > 0.1) { // Threshold to avoid noise
        // Find a sample record to get additional metadata (elementName, menuItemName, etc.)
        const sampleRecords = shopGranularData.filter(
          r => r.elementId === elementId && r.menuItemId === menuItemId
        );
        const sampleRecord = sampleRecords[0];
        
        predictiveRecords.push({
          eventId: futureEvent.id,
          eventName: futureEvent.eventName,
          eventDate: futureEvent.eventDate,
          elementId,
          elementName: sampleRecord?.elementName || '',
          shopName: sampleRecord?.shopName || '',
          menuItemId,
          menuItemName: sampleRecord?.menuItemName || '',
          menuItemType: sampleRecord?.menuItemType || null,
          menuItemCategory: sampleRecord?.menuItemCategory || null,
          quantity: Math.round(avgQuantity * 10) / 10, // Round to 1 decimal
          revenue: Math.round(avgRevenue * 100) / 100, // Round to 2 decimals
          transactionCount: Math.round((avgQuantity / 2) * 10) / 10, // Estimate transaction count
          location: sampleRecord?.location || '',
          isPredictive: true,
          confidenceScore: confidenceScore, // Add confidence score (0-100)
        });
      }
    });
  });

  console.log(`[PREDICTIVE] Generated ${predictiveRecords.length} predictive records for ${futureEvent.eventName}`);
  
  return predictiveRecords;
}

/**
 * Generate predictive data for all future events
 */
export function generatePredictionsForAllFutureEvents(
  allEvents,
  shopGranularData
) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find all future events
  const futureEvents = allEvents.filter(event => {
    const eventDate = parseDDMMYYYY(event.eventDate);
    return eventDate && eventDate > today;
  });

  console.log(`[PREDICTIVE] Found ${futureEvents.length} future events`);

  // Generate predictions for each future event
  const allPredictiveRecords = [];
  
  futureEvents.forEach(futureEvent => {
    const similarEvents = findSimilarPastEvents(futureEvent, allEvents);
    
    if (similarEvents.length > 0) {
      const bestMatch = similarEvents[0];
      const topMatches = similarEvents.slice(0, 3).map(se => 
        `${se.event.eventName} (${(se.similarityScore * 100).toFixed(0)}%)` 
      ).join(', ');
      console.log(`[PREDICTIVE] ${futureEvent.eventName}: Found ${similarEvents.length} similar events - Top matches: ${topMatches}`);
      
      const predictions = generatePredictiveData(futureEvent, similarEvents, shopGranularData);
      allPredictiveRecords.push(...predictions);
    } else {
      console.log(`[PREDICTIVE] ${futureEvent.eventName}: No similar events found`);
    }
  });

  console.log(`[PREDICTIVE] Generated total of ${allPredictiveRecords.length} predictive records for ${futureEvents.length} future events`);
  
  return allPredictiveRecords;
}