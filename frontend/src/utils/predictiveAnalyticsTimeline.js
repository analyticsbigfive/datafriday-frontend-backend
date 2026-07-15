// Timeline-based Predictive Analytics — Vue port
// Source: versionReact/Datafriday-main/src/app/utils/predictiveAnalyticsTimeline.ts
//
// Génère des records granulaires prédictifs à partir des timelines minute par
// minute des past events similaires. Utilisé pour alimenter en bulk les
// prédictions des futurs events (alternative à predictiveAnalytics qui se base
// sur shopGranularData all-time).

import { findAndScorePastEvents } from './predictiveAnalytics'
import { getEventTimeline } from './api'

/** Parse DD/MM/YYYY ou ISO en Date (local midnight). */
function parseDDMMYYYY(dateStr) {
  if (!dateStr) return null

  // ISO d'abord
  if (typeof dateStr === 'string' && dateStr.includes('-')) {
    const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) {
      return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))
    }
    const d = new Date(dateStr)
    if (!Number.isNaN(d.getTime())) return d
  }

  const parts = String(dateStr).split('/')
  if (parts.length !== 3) return null
  const day = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10) - 1
  const year = parseInt(parts[2], 10)
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null
  return new Date(year, month, day)
}

/**
 * Generate timeline-based predictions for one future event.
 * Aggregates timeline records of `scoredEvents` by (elementId, menuItemId) and
 * averages across past events to produce ONE granular forecast per shop/item.
 *
 * @param {object} futureEvent
 * @param {Array<{event:object, scorePercentage?:number}>} scoredEvents
 * @returns {Promise<Array<object>>} predictive ShopGranularRecord[]
 */
export async function generateTimelineBasedPredictions(futureEvent, scoredEvents) {
  if (!Array.isArray(scoredEvents) || scoredEvents.length === 0) {
    console.log(
      `[TIMELINE PREDICTIVE] No eligible events for ${futureEvent?.eventName}`,
    )
    return []
  }

  console.log(
    `[TIMELINE PREDICTIVE] Generating timeline-based predictions for ${futureEvent.eventName} ` +
      `using ${scoredEvents.length} similar past events`,
  )

  try {
    const timelineResults = await Promise.all(
      scoredEvents.map(async (se) => {
        try {
          return (await getEventTimeline(se.event.id)) || []
        } catch (err) {
          console.error(
            `[TIMELINE PREDICTIVE] timeline fetch failed for ${se.event.id}:`,
            err,
          )
          return []
        }
      }),
    )

    const allTimelineRecords = []
    timelineResults.forEach((records, idx) => {
      if (records && records.length) {
        console.log(
          `[TIMELINE PREDICTIVE] Event ${scoredEvents[idx].event.eventName}: ${records.length} records`,
        )
        allTimelineRecords.push(...records)
      }
    })

    if (allTimelineRecords.length === 0) {
      console.log('[TIMELINE PREDICTIVE] No timeline data found for similar events')
      return []
    }

    // Aggregate by elementId + menuItemId
    const shopMenuAggregates = new Map()
    const numPastEvents = scoredEvents.length

    allTimelineRecords.forEach((record) => {
      // shopId in timeline data == elementId
      const elementId = record.shopId
      const menuItemId = record.menuItemId || record.mappedMenuItemId
      if (!elementId || !menuItemId) return

      let shopMap = shopMenuAggregates.get(elementId)
      if (!shopMap) {
        shopMap = new Map()
        shopMenuAggregates.set(elementId, shopMap)
      }

      let agg = shopMap.get(menuItemId)
      if (!agg) {
        agg = {
          totalRevenue: 0,
          totalQuantity: 0,
          totalTransactions: 0,
          sampleRecord: record,
          eventCount: numPastEvents,
        }
        shopMap.set(menuItemId, agg)
      }
      agg.totalRevenue += record.totalRevenue || 0
      agg.totalQuantity += record.totalQuantity || 0
      agg.totalTransactions += record.transactionCount || 0
    })

    const avgScorePercentage =
      scoredEvents.reduce((sum, se) => sum + (se.scorePercentage || 0), 0) /
      scoredEvents.length
    const confidenceScore = Math.round(avgScorePercentage)

    const predictiveRecords = []
    shopMenuAggregates.forEach((menuItems, elementId) => {
      menuItems.forEach((agg, menuItemId) => {
        const sample = agg.sampleRecord || {}

        // Average across past events
        const avgRevenue = agg.totalRevenue / numPastEvents
        const avgQuantity = agg.totalQuantity / numPastEvents
        const avgTransactions = agg.totalTransactions / numPastEvents

        if (avgQuantity > 0.1) {
          predictiveRecords.push({
            eventId: futureEvent.id,
            eventName: futureEvent.eventName,
            eventDate: futureEvent.eventDate,
            elementId,
            elementName: sample.elementName || '',
            shopName: sample.shopName || '',
            menuItemId,
            menuItemName: sample.menuItemName || sample.itemName || '',
            menuItemType: sample.menuItemType || undefined,
            menuItemCategory: sample.menuItemCategory || undefined,
            quantity: Math.round(avgQuantity * 10) / 10,
            revenue: Math.round(avgRevenue * 100) / 100,
            transactionCount: Math.round(avgTransactions * 10) / 10,
            location: sample.location || '',
            isPredictive: true,
            confidenceScore,
          })
        }
      })
    })

    const totalPredictedRevenue = predictiveRecords.reduce(
      (s, r) => s + r.revenue,
      0,
    )
    console.log(
      `[TIMELINE PREDICTIVE] Generated ${predictiveRecords.length} records, ` +
        `total revenue ${totalPredictedRevenue.toFixed(2)}, confidence ${confidenceScore}%`,
    )
    return predictiveRecords
  } catch (error) {
    console.error('[TIMELINE PREDICTIVE] Error generating predictions:', error)
    return []
  }
}

/**
 * Generate timeline-based predictions for ALL future events.
 * @param {Array<object>} allEvents
 * @param {Array<object>} shopGranularData  used for scoring (filtered to !isPredictive)
 * @returns {Promise<Array<object>>}
 */
export async function generateTimelinePredictionsForAllFutureEvents(
  allEvents,
  shopGranularData,
) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const futureEvents = (allEvents || []).filter((event) => {
    const d = parseDDMMYYYY(event?.eventDate)
    return d && d > today
  })

  console.log(`[TIMELINE PREDICTIVE] Found ${futureEvents.length} future events`)
  if (futureEvents.length === 0) return []

  const allPredictiveRecords = []
  for (const futureEvent of futureEvents) {
    console.log(`[TIMELINE PREDICTIVE] Processing ${futureEvent.eventName}`)
    const scoredEvents = findAndScorePastEvents(
      futureEvent,
      allEvents,
      shopGranularData,
    )
    if (scoredEvents.length === 0) {
      console.log(
        `[TIMELINE PREDICTIVE] ${futureEvent.eventName}: no eligible past events`,
      )
      continue
    }
    const predictions = await generateTimelineBasedPredictions(
      futureEvent,
      scoredEvents,
    )
    allPredictiveRecords.push(...predictions)
  }

  console.log(
    `[TIMELINE PREDICTIVE] Generated ${allPredictiveRecords.length} records total`,
  )
  return allPredictiveRecords
}
