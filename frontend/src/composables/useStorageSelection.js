import { computed, ref, watch } from 'vue'
import {
  pruneSelection, toggleKey, selectedCardsOf, displayedSpaceIds, productsForSpaceClick, productRefsForSpaceClick,
} from '@/components/menu-fb/views/storage/utils/storageSelection'

/**
 * Sélection multiple de la page Stockage. `cards` = toutes les cartes (hors filtres) : la sélection
 * survit aux filtres et seules les clés disparues après rechargement sont retirées.
 */
export function useStorageSelection({ cards }) {
  const keys = ref([])
  const selectedCards = computed(() => selectedCardsOf(cards.value, keys.value))
  const count = computed(() => selectedCards.value.length)

  const isSelected = (card) => keys.value.includes(card.key)
  const toggle = (card) => { keys.value = toggleKey(keys.value, card.key) }
  const clear = () => { keys.value = [] }
  const spaceIdsFor = (card) => displayedSpaceIds(card, selectedCards.value)
  const productNamesFor = (card) => productsForSpaceClick(card, selectedCards.value)

  watch(cards, (list) => {
    const next = pruneSelection(keys.value, list)
    if (next.length !== keys.value.length) keys.value = next
  })

  const productRefsFor = (card) => productRefsForSpaceClick(card, selectedCards.value)

  return { count, isSelected, toggle, clear, spaceIdsFor, productNamesFor, productRefsFor }
}
