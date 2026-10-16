// Catalogue de la caisse : rail de catégories avec compteurs, tuiles de la catégorie active,
// rafraîchissement silencieux de la disponibilité. Lit et écrit uniquement via le store guestPos.

import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { toCents } from '@/utils/posMoney'

/** Cadence de relecture de la disponibilité (les autres vendeurs du PdV consomment aussi le stock). */
const AVAILABILITY_REFRESH_MS = 60 * 1000

export function useGuestPosCatalog() {
  const store = useStore()
  const { t } = useI18n()

  const loading = computed(() => store.state.guestPos.loading)
  const loadError = computed(() => store.state.guestPos.loadError)
  const loaded = computed(() => !!store.state.guestPos.catalog)
  const cart = computed(() => store.state.guestPos.cart)
  const items = computed(() => store.getters['guestPos/items'])
  const activeCategoryId = computed(() => store.getters['guestPos/activeCategoryId'])

  // Une catégorie sans aucun article n'a rien à faire dans le rail.
  const categories = computed(() => {
    const counts = store.getters['guestPos/cartCounts']
    const used = new Set(items.value.map((item) => item.categoryId))
    return store.getters['guestPos/categories']
      .filter((category) => used.has(category.id))
      .map((category) => ({ id: category.id, label: category.label, count: counts[category.id] || 0 }))
  })

  const selectedCategoryId = computed(() => {
    const active = activeCategoryId.value
    if (categories.value.some((category) => category.id === active)) return active
    return categories.value[0]?.id ?? null
  })

  const tiles = computed(() =>
    items.value
      .filter((item) => item.categoryId === selectedCategoryId.value)
      .map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name,
        priceCents: toCents(item.unitPrice),
        originalPriceCents: item.originalUnitPrice != null ? toCents(item.originalUnitPrice) : null,
        // Libellé de promotion du catalogue, sinon la note de l'article (ex. « Consigne incluse »).
        label: item.promotionLabel || item.note || '',
        isPromotion: !!item.promotionLabel,
        out: item.availability === 'out',
        low: item.availability === 'low',
        quantity: cart.value[item.menuItemId] || 0,
      })),
  )

  const load = () => store.dispatch('guestPos/loadCatalog').catch(() => {})
  const select = (categoryId) => store.dispatch('guestPos/selectCategory', categoryId)
  const add = (menuItemId) => store.dispatch('guestPos/increment', menuItemId)

  let timer = null
  onMounted(() => {
    timer = setInterval(() => {
      if (!document.hidden && loaded.value) store.dispatch('guestPos/loadCatalog', { silent: true })
    }, AVAILABILITY_REFRESH_MS)
  })
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
  })

  return { t, loading, loadError, loaded, categories, selectedCategoryId, tiles, load, select, add }
}
