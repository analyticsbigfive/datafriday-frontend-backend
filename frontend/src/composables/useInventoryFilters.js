import { computed } from 'vue'

export function useInventoryFilters(params) {
  const {
    activeCards,
    activeTab,
    search,
    countingStatusTab,
    statusFor,
  } = params

  const filteredCards = computed(() => {
    let cards = activeCards.value || []
    const q = (search.value || '').trim().toLowerCase()

    if (q) {
      cards = cards.filter((c) => {
        if ((c?.element?.name || '').toLowerCase().includes(q)) return true
        const items = c.consolidatedInventory || c.storageInventory || c.merchInventory || []
        return items.some((it) => (it?.name || '').toLowerCase().includes(q))
      })
    }

    if (activeTab.value === 'shops') {
      cards = cards.filter((c) => statusFor(c) === countingStatusTab.value)
    }

    return cards
  })

  return { filteredCards }
}
