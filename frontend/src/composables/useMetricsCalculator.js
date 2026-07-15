/**
 * useMetricsCalculator — portage du hook React du même nom.
 *
 * Reçoit :
 *  - filteredShopGranularData : Ref<ShopGranularRecord[]>
 *  - chartFilteredEvents       : Ref<Event[]>
 *  - menuItemCostMap           : Ref<Record<string, number>>
 *  - options                   : { timelineActive, operatingMinutes? }
 *
 * Retourne des computed() avec toutes les métriques (total* et display*).
 */
import { computed, unref } from 'vue'

export function useMetricsCalculator({
  filteredShopGranularData,
  chartFilteredEvents,
  menuItemCostMap,
  isTimelineFilterActive,
  operatingMinutes,
  selectedEventIds,
  // Lot 4.1 / Transaction Rate panel — override calculé depuis la timeline
  // (somme des transactionRate par shop). Quand fourni et > 0, il remplace la
  // valeur basique `transactions / operatingMinutes`.
  overrideTransactionRate,
}) {
  const _records = () => unref(filteredShopGranularData) || []
  const _events = () => unref(chartFilteredEvents) || []
  const _costMap = () => unref(menuItemCostMap) || {}
  const _tl = () => !!unref(isTimelineFilterActive)
  const _ops = () => unref(operatingMinutes) || 0
  const _selectedEventIds = () => unref(selectedEventIds) || []
  const _override = () => unref(overrideTransactionRate)

  // Lot 3.1 — Mode «single event» : un seul event sélectionné dans les filtres.
  // Quand actif : pas de moyenne par événement (les « Moy./Évén. » retombent sur
  // le total) et les variations doivent être masquées côté UI.
  const isSingleEventMode = computed(() => _selectedEventIds().length === 1)

  const totals = computed(() => {
    const records = _records()
    const events = _events()
    const costMap = _costMap()
    const eventIdsWithRevenue = new Set()

    let revenue = 0
    let cost = 0
    let transactions = 0
    let ticketsScanned = 0

    for (const r of records) {
      const rowRevenue = r.revenue || 0
      revenue += rowRevenue
      cost += (costMap[r.menuItemId] || 0) * (r.quantity || 0)
      transactions += r.transactionCount || 0
      if (rowRevenue > 0 && r.eventId) eventIdsWithRevenue.add(r.eventId)
    }

    for (const e of events) {
      // Spectateurs : scanned (réel) → attendees → sold. Même définition que le
      // dialog ByEvent (filteredEventAggregates) pour que Per cap / Transfo /
      // Spectateurs du strip soient cohérents avec le détail par event.
      ticketsScanned += e.ticketsScanned ?? e.attendees ?? e.ticketsSold ?? 0
    }

    const eventsWithRevenueCount = eventIdsWithRevenue.size || events.length || 0
    const validEventsCount = events.length || eventsWithRevenueCount || 1

    return {
      revenue,
      cost,
      transactions,
      ticketsScanned,
      eventsWithRevenueCount,
      validEventsCount,
      avgRevenuePerEvent: eventsWithRevenueCount ? revenue / eventsWithRevenueCount : 0,
      avgPerTransaction: transactions ? revenue / transactions : 0,
      perCapita: ticketsScanned ? revenue / ticketsScanned : 0,
      margin: revenue ? ((revenue - cost) / revenue) * 100 : 0,
    }
  })

  const totalRevenue = computed(() => totals.value.revenue)
  const totalCost = computed(() => totals.value.cost)
  const totalTransactions = computed(() => totals.value.transactions)
  const totalTicketsScanned = computed(() => totals.value.ticketsScanned)
  const eventsWithRevenueCount = computed(() => totals.value.eventsWithRevenueCount)
  const validEventsCount = computed(() => totals.value.validEventsCount)
  const avgRevenuePerEvent = computed(() => totals.value.avgRevenuePerEvent)
  const avgPerTransaction = computed(() => totals.value.avgPerTransaction)
  const perCapita = computed(() => totals.value.perCapita)
  const margin = computed(() => totals.value.margin)

  // Display values — identiques en mode non-timeline (stubs pour extension future)
  const displayRevenue = computed(() => totalRevenue.value)
  const displayCost = computed(() => totalCost.value)
  const displayTransactions = computed(() => totalTransactions.value)
  const displayAvgRevenuePerEvent = computed(() => avgRevenuePerEvent.value)
  const displayAttendees = computed(() => totalTicketsScanned.value)
  const displayPerCapita = computed(() => perCapita.value)
  const displayAvgCost = computed(() =>
    validEventsCount.value ? displayCost.value / validEventsCount.value : 0
  )
  const displayAvgRevenue = computed(() =>
    eventsWithRevenueCount.value ? displayRevenue.value / eventsWithRevenueCount.value : 0
  )
  const displayMargin = computed(() => margin.value)
  const displayTransactionRate = computed(() => {
    const o = _override()
    if (o != null && o > 0) return o
    return _ops() ? displayTransactions.value / _ops() : 0
  })

  return {
    totalRevenue,
    totalCost,
    totalTransactions,
    totalTicketsScanned,
    perCapita,
    avgRevenuePerEvent,
    avgPerTransaction,
    margin,
    totals,
    eventsWithRevenueCount,
    validEventsCount,

    displayRevenue,
    displayCost,
    displayTransactions,
    displayAvgRevenuePerEvent,
    displayAttendees,
    displayPerCapita,
    displayAvgCost,
    displayAvgRevenue,
    displayMargin,
    displayTransactionRate,

    isSingleEventMode,
    isTimelineFilterActive: computed(() => _tl()),
  }
}
