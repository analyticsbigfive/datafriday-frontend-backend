// État des filtres du « Résumé Inventaire » (widget actif, PdV cliqué, articles
// sélectionnés). Les règles vivent dans utils/inventoryFilters.js (pur) ; ce
// composable ne fait que porter l'état partagé entre la liste de gauche et le résumé.
import { ref } from 'vue'
import { WIDGET_TOTAL, nextWidget, nextShopId, toggleName, nextSelectAll } from '@/utils/inventoryFilters'

export function useInventorySummaryFilters() {
  const widget = ref(WIDGET_TOTAL)
  const shopId = ref(null)
  const selectedItems = ref([])

  /** Clic sur un widget : actif → retour à « Total articles ». */
  function toggleWidget(clicked) {
    widget.value = nextWidget(widget.value, clicked)
  }
  /** Clic sur un PdV de la liste de gauche : reclic = désélection. */
  function toggleShop(id) {
    shopId.value = nextShopId(shopId.value, id)
  }
  /** Clic sur un article du résumé : sélection multiple. */
  function toggleItem(name) {
    selectedItems.value = toggleName(selectedItems.value, name)
  }
  /** « Tout sélectionner » : coche toute la liste affichée, ou vide si tout est coché. */
  function toggleAllItems(rows) {
    selectedItems.value = nextSelectAll(selectedItems.value, rows)
  }
  function resetFilters() {
    widget.value = WIDGET_TOTAL
    shopId.value = null
    selectedItems.value = []
  }

  return { widget, shopId, selectedItems, toggleWidget, toggleShop, toggleItem, toggleAllItems, resetFilters }
}
