/**
 * useCostTrackingOptions : listes Fournisseur et Composant des filtres. Dépendent de Type, Catégorie,
 * Article et de la période (fournisseurs actifs sur la période) : rechargées quand ils changent. Seule la dernière requête écrit (jeton).
 */
import { ref, watch } from 'vue'
import { getCostTrackingOptions } from '@/api/endpoints/cost-tracking.api'

/**
 * @param {Object} opts
 * @param {import('vue').Ref<string|null>} opts.spaceId
 * @param {import('vue').Ref<boolean>} opts.enabled
 * @param {import('vue').Ref<string|null>} opts.typeId
 * @param {import('vue').Ref<string|null>} opts.categoryId
 * @param {import('vue').Ref<string|null>} opts.menuItemId
 * @param {import('vue').Ref<{from: string, to: string}>} [opts.range] période des fournisseurs proposés
 * @param {(options: {suppliers: Array, components: Array}) => void} [opts.onLoaded]
 */
export function useCostTrackingOptions({ spaceId, enabled, typeId, categoryId, menuItemId, range, onLoaded }) {
  const suppliers = ref([])
  const components = ref([])
  let token = 0

  async function load() {
    const mine = ++token
    if (!enabled.value || !spaceId.value) {
      suppliers.value = []
      components.value = []
      return
    }
    try {
      const res = await getCostTrackingOptions(spaceId.value, {
        typeId: typeId.value || undefined,
        categoryId: categoryId.value || undefined,
        menuItemId: menuItemId.value || undefined,
        from: range?.value?.from || undefined,
        to: range?.value?.to || undefined,
      })
      if (mine !== token) return
      suppliers.value = res?.suppliers || []
      components.value = res?.components || []
      if (onLoaded) onLoaded({ suppliers: suppliers.value, components: components.value })
    } catch (e) {
      if (mine !== token) return
      suppliers.value = []
      components.value = []
    }
  }

  watch([spaceId, enabled, typeId, categoryId, menuItemId, () => range?.value?.from, () => range?.value?.to], load, { immediate: true })

  return { supplierOptions: suppliers, componentOptions: components, loadOptions: load }
}
