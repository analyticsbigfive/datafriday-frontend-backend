import { ref } from 'vue'
import { useStore } from 'vuex'
import {
  getProductMappings,
  createProductMapping,
  deleteProductMapping,
} from '@/api/endpoints/mapping.api'

export function useMenuMapping() {
  const store = useStore()
  const weezeventProducts = ref([])
  const menuItems = ref([])
  const localMappings = ref({})   // productId → menuItemId  (confirmed, saved to API)
  const autoSuggestions = ref({}) // productId → menuItemId  (name-match, NOT saved yet)
  const savingRows = ref({})      // productId → 'saving' | 'saved' | 'error'
  const loading = ref(false)
  const saving = ref(false)
  const error = ref(null)

  async function loadData(locationId) {
    loading.value = true
    error.value = null
    try {
      const [, mappingsRes] = await Promise.all([
        Promise.all([
          store.dispatch('weezeventProducts/fetchForLocation', { locationId }),
          store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true }),
        ]),
        getProductMappings(locationId),
      ])

      weezeventProducts.value = store.getters['weezeventProducts/forLocation'](locationId)
      menuItems.value = store.getters['menuItems/rows']

      // Confirmed mappings from DB
      const allMappings = mappingsRes?.data || mappingsRes || []
      const productIds = new Set(weezeventProducts.value.map(p => p.id))
      const map = {}
      for (const m of allMappings) {
        if (productIds.has(m.weezeventProductId)) {
          map[m.weezeventProductId] = m.menuItemId
        }
      }
      localMappings.value = map
      savingRows.value = {}

      // Auto-suggestions: only for unmapped products, score >= 70, NOT saved
      const suggestions = {}
      for (const product of weezeventProducts.value) {
        if (localMappings.value[product.id]) continue
        const match = findBestMatch(product, menuItems.value)
        if (match && (match.matchScore || 0) >= 70) {
          suggestions[product.id] = match.id
        }
      }
      autoSuggestions.value = suggestions
    } catch (err) {
      error.value = err.message
    } finally {
      loading.value = false
    }
  }

  // Saves a single mapping immediately (or removes it)
  async function updateMapping(productId, menuItemId) {
    // Update local state
    const updated = { ...localMappings.value }
    if (menuItemId == null) {
      delete updated[productId]
    } else {
      updated[productId] = menuItemId
    }
    localMappings.value = updated

    // Remove suggestion for this row (user made an explicit choice)
    const suggestions = { ...autoSuggestions.value }
    delete suggestions[productId]
    autoSuggestions.value = suggestions

    // Persist to API
    savingRows.value = { ...savingRows.value, [productId]: 'saving' }
    try {
      if (menuItemId == null) {
        await deleteProductMapping(productId)
      } else {
        await createProductMapping(productId, menuItemId)
      }
      savingRows.value = { ...savingRows.value, [productId]: 'saved' }
    } catch (err) {
      console.error('[useMenuMapping] auto-save error:', err)
      savingRows.value = { ...savingRows.value, [productId]: 'error' }
    }
  }

  function acceptSuggestion(productId) {
    const menuItemId = autoSuggestions.value[productId]
    if (menuItemId) return updateMapping(productId, menuItemId)
  }

  function rejectSuggestion(productId) {
    const suggestions = { ...autoSuggestions.value }
    delete suggestions[productId]
    autoSuggestions.value = suggestions
  }

  async function applyAllSuggestions() {
    for (const [productId, menuItemId] of Object.entries(autoSuggestions.value)) {
      if (!localMappings.value[productId] && menuItemId) {
        await updateMapping(productId, menuItemId)
      }
    }
    autoSuggestions.value = {}
  }

  function suggestMenuItem(productName) {
    return findBestMatch(productName, menuItems.value)
  }

  function getMappedCount() {
    return Object.values(localMappings.value).filter(Boolean).length
  }

  function getSuggestionCount() {
    return Object.keys(autoSuggestions.value).filter(id => !localMappings.value[id]).length
  }

  function hasPendingSaves() {
    return Object.values(savingRows.value).some(s => s === 'saving')
  }

  // ─── Matching helpers ───────────────────────────────────

  function findBestMatch(productOrName, items) {
    const productName = typeof productOrName === 'string' ? productOrName : productOrName?.name
    const productPrice = typeof productOrName === 'string' ? null : (productOrName?.basePrice ?? null)
    if (!productName || !items.length) return null
    const normalize = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim()
    const tokenize = s => normalize(s).split(/\s+/).filter(w => w.length >= 2)
    const normName = normalize(productName)
    const nameTokens = tokenize(productName)
    const priceKnown = productPrice != null
    let best = null
    let bestScore = 0
    for (const item of items) {
      // Hard filter: when product price is known, reject items with a different price
      if (priceKnown) {
        const itemPrice = item.basePrice ?? null
        if (itemPrice != null && Math.abs(Number(productPrice) - Number(itemPrice)) >= 0.01) continue
      }

      const normItem = normalize(item.name || '')

      // Name score (0–1)
      let nameScore
      if (normName === normItem) {
        nameScore = 1.0
      } else {
        const itemTokens = tokenize(item.name || '')
        let tokenScore = 0
        if (nameTokens.length > 0 && itemTokens.length > 0) {
          const common = nameTokens.filter(t =>
            itemTokens.some(e =>
              e === t ||
              (e.length >= 3 && t.length >= 3 && (e.startsWith(t) || t.startsWith(e)))
            )
          )
          tokenScore = (common.length * 2) / (nameTokens.length + itemTokens.length)
        }
        nameScore = Math.max(tokenScore, similarity(normName, normItem))
        // Stricter name threshold when price is unknown — prevents confusing similar variants
        if (nameScore <= (priceKnown ? 0.5 : 0.70)) continue
      }

      let combined
      if (priceKnown) {
        // Prix connu : pondération prix 60% + nom 40%
        const priceExact = item.basePrice != null
          && Math.abs(Number(productPrice) - Number(item.basePrice)) < 0.01
        const priceScore = priceExact ? 1.0 : 0.85
        combined = nameScore * 0.4 + priceScore * 0.6
      } else {
        // Prix inconnu : nom seul, plafonné à 80% pour signaler "non vérifié par le prix"
        combined = nameScore
      }

      if (combined > bestScore) {
        bestScore = combined
        const displayScore = priceKnown ? combined : Math.min(combined, 0.80)
        best = { ...item, matchScore: Math.round(displayScore * 100) }
      }
    }
    return best && bestScore > 0.5 ? best : null
  }

  function similarity(a, b) {
    if (a === b) return 1
    const longer = a.length > b.length ? a : b
    const shorter = a.length > b.length ? b : a
    if (longer.length === 0) return 1
    const costs = []
    for (let i = 0; i <= longer.length; i++) {
      let lastValue = i
      for (let j = 0; j <= shorter.length; j++) {
        if (i === 0) { costs[j] = j }
        else if (j > 0) {
          let newValue = costs[j - 1]
          if (longer[i - 1] !== shorter[j - 1])
            newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
          costs[j - 1] = lastValue
          lastValue = newValue
        }
      }
      if (i > 0) costs[shorter.length] = lastValue
    }
    return (longer.length - costs[shorter.length]) / longer.length
  }

  return {
    weezeventProducts,
    menuItems,
    localMappings,
    autoSuggestions,
    savingRows,
    loading,
    saving,
    error,
    loadData,
    suggestMenuItem,
    updateMapping,
    acceptSuggestion,
    rejectSuggestion,
    applyAllSuggestions,
    getMappedCount,
    getSuggestionCount,
    hasPendingSaves,
  }
}
