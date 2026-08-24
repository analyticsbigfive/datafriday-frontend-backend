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
  // BUG-354-01 — SOURCE des transactions. Les records item-level sont au grain
  // (minute × PdV × ARTICLE) : leur `transactionCount` compte les tickets distincts
  // DE CET ARTICLE, donc un panier à 3 articles différents y pèse 3. Les sommer
  // surcompte. Les records paniers (endpoint transaction-baskets) sont au grain
  // (minute × PdV × combinaison) construit sur UNE ligne par ticket : chaque ticket
  // y apparaît exactement une fois, la somme est donc le nombre réel de tickets et
  // reste filtrable par PdV/horaire. Quand fourni, il remplace la somme item-level.
  transactionRecords = null,
}) {
  const _records = () => unref(filteredShopGranularData) || []
  const _txRecords = () => unref(transactionRecords)
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
    // BUG-350-01 — au moins une ligne rattachée à un article : sans ça aucun coût
    // ne PEUT être résolu et la marge vaut 100 % par construction (voir plus bas).
    let hasCostableRow = false

    for (const r of records) {
      const rowRevenue = r.revenue || 0
      revenue += rowRevenue
      cost += (costMap[r.menuItemId] || 0) * (r.quantity || 0)
      if (r.menuItemId) hasCostableRow = true
      transactions += r.transactionCount || 0
      if (rowRevenue > 0 && r.eventId) eventIdsWithRevenue.add(r.eventId)
    }

    // BUG-354-01 — bascule sur la source ticket quand elle est disponible. `null`
    // (source pas encore chargée) ≠ `[]` (chargée, aucun ticket sur ce périmètre) :
    // seul le second doit ramener 0, le premier garde la valeur item-level plutôt
    // que d'afficher un 0 provisoire (règle « aucune valeur provisoire »).
    const txRecords = _txRecords()
    if (Array.isArray(txRecords)) {
      transactions = 0
      for (const b of txRecords) transactions += b.transactionCount || 0
    }

    for (const e of events) {
      // Spectateurs : scanned (réel) → attendees → sold. Même définition que le
      // dialog ByEvent (filteredEventAggregates) pour que Per cap / Transfo /
      // Spectateurs du strip soient cohérents avec le détail par event.
      ticketsScanned += e.ticketsScanned ?? e.attendees ?? e.ticketsSold ?? 0
    }

    const eventsWithRevenueCount = eventIdsWithRevenue.size || events.length || 0
    const validEventsCount = events.length || eventsWithRevenueCount || 1

    // BUG-350-01 — `null` (affiché « — ») et non 0/100 quand aucun coût ne peut
    // être résolu. Deux cas, tous deux structurels, pas transitoires :
    //  - records shop-level : la RPC `get_space_shop_details` force `menuItemId`
    //    à NULL → `costMap[undefined]` = 0 sur CHAQUE ligne → marge 100 % quoi
    //    qu'il arrive. Ce n'est pas une marge, c'est l'absence de grain article ;
    //  - `menuItemCostMap` vide (catalogue pas encore chargé, ou aucun
    //    `MenuItem.totalCost` saisi).
    // Sans ce garde-fou, l'écran a longtemps publié « MARGE 100,0 % » comme un
    // résultat. Les consommateurs doivent traiter `null` (KpiCard rend « — »).
    const costResolvable = hasCostableRow && Object.keys(costMap).length > 0
    const margin = !revenue || !costResolvable
      ? null
      : ((revenue - cost) / revenue) * 100

    return {
      revenue,
      cost,
      costResolvable,
      transactions,
      ticketsScanned,
      eventsWithRevenueCount,
      validEventsCount,
      avgRevenuePerEvent: eventsWithRevenueCount ? revenue / eventsWithRevenueCount : 0,
      avgPerTransaction: transactions ? revenue / transactions : 0,
      perCapita: ticketsScanned ? revenue / ticketsScanned : 0,
      margin,
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
  // BUG-350-01 — false = la marge n'est pas calculable sur ce lot (voir `totals`).
  const costResolvable = computed(() => totals.value.costResolvable)

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
    costResolvable,
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
