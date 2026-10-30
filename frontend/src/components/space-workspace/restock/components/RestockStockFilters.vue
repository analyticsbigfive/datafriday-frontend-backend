<template>
  <div class="rsf" role="group" :aria-label="t('srStockFiltersLabel')">
    <v-menu v-for="filter in filters" :key="filter.key" location="bottom end" offset="6" :max-height="320">
      <template #activator="{ props: menuProps }">
        <RestockSelectButton
          v-bind="menuProps"
          :label="filter.value || filter.placeholder"
          :active="!!filter.value"
          :aria-label="filter.placeholder"
        />
      </template>
      <v-list density="compact" class="rsf-list">
        <v-list-item :active="!filter.value" @click="$emit('update:' + filter.key, '')">
          <v-list-item-title class="rsf-item">{{ filter.placeholder }}</v-list-item-title>
        </v-list-item>
        <v-list-item
          v-for="option in filter.items"
          :key="option"
          :active="option === filter.value"
          @click="$emit('update:' + filter.key, option)"
        >
          <v-list-item-title class="rsf-item">{{ option }}</v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
  </div>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'
import RestockSelectButton from '@/components/space-workspace/restock/components/RestockSelectButton.vue'

// Trois sélecteurs (type, catégorie, fournisseur) à côté de la recherche de
// l'étape 1 de Commande, au même style que « Ajustement global » (RestockSelectButton).
// Les options viennent des lignes présentes (utils/stockRowFilters) ; une valeur
// vide veut dire « tous » : la première entrée du menu remet le filtre à zéro.
export default {
  name: 'RestockStockFilters',
  components: { RestockSelectButton },
  props: {
    type: { type: String, default: '' },
    category: { type: String, default: '' },
    supplier: { type: String, default: '' },
    options: { type: Object, default: () => ({ types: [], categories: [], suppliers: [] }) },
  },
  setup() {
    const { t } = useI18n()
    return { t }
  },
  emits: ['update:type', 'update:category', 'update:supplier'],
  computed: {
    filters() {
      const tr = this.t
      return [
        { key: 'type', value: this.type || null, items: this.options.types || [], placeholder: tr('srStockFilterAllTypes') },
        { key: 'category', value: this.category || null, items: this.options.categories || [], placeholder: tr('srStockFilterAllCategories') },
        { key: 'supplier', value: this.supplier || null, items: this.options.suppliers || [], placeholder: tr('srStockFilterAllSuppliers') },
      ]
    },
  },
}
</script>

<style scoped>
.rsf {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.rsf-item {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
}
</style>
