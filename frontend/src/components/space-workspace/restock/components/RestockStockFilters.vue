<template>
  <div class="rsf" role="group" :aria-label="t('srStockFiltersLabel')">
    <v-select
      v-for="filter in filters"
      :key="filter.key"
      :model-value="filter.value"
      :items="filter.items"
      :placeholder="filter.placeholder"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      persistent-placeholder
      :menu-props="{ maxHeight: 320 }"
      :aria-label="filter.placeholder"
      class="rsf-select"
      @update:model-value="$emit('update:' + filter.key, $event || '')"
    />
  </div>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'

// Trois listes déroulantes (type, catégorie, fournisseur) à côté de la recherche
// de l'étape 1 de Commande. Les options viennent des lignes présentes
// (utils/stockRowFilters) ; une valeur vide veut dire « tous ».
export default {
  name: 'RestockStockFilters',
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
.rsf-select {
  width: 190px;
  max-width: 100%;
  flex: 0 0 auto;
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
}
.rsf-select :deep(.v-field) {
  border-radius: 8px;
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
}
.rsf-select :deep(.v-field__input) {
  min-height: 36px;
  padding-top: 0;
  padding-bottom: 0;
}
.rsf-select :deep(.v-select__selection-text),
.rsf-select :deep(input::placeholder) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #374151;
  opacity: 1;
}
</style>
