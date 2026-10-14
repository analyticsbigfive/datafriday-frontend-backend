<template>
  <div>
    <ComparisonField :label="t('anCmpTypeLabel')" :for-id="`${uid}-type`">
      <ComparisonSelect
        :id="`${uid}-type`"
        :model-value="type"
        :options="toOptions(options.types)"
        :empty-label="t('anCmpAll')"
        @update:model-value="(v) => emit('change', 'type', v)"
      />
    </ComparisonField>
    <div class="cf-row2">
      <ComparisonField :label="t('anCmpCategoryLabel')" :for-id="`${uid}-cat`">
        <ComparisonSelect
          :id="`${uid}-cat`"
          :model-value="category"
          :options="toOptions(options.categories)"
          :empty-label="t('anCmpAll')"
          @update:model-value="(v) => emit('change', 'category', v)"
        />
      </ComparisonField>
      <ComparisonField :label="t('anCmpSubcategoryLabel')" :for-id="`${uid}-sub`">
        <ComparisonSelect
          :id="`${uid}-sub`"
          :model-value="subcategory"
          :options="toOptions(options.subcategories)"
          :empty-label="t('anCmpAll')"
          @update:model-value="(v) => emit('change', 'subcategory', v)"
        />
      </ComparisonField>
    </div>
  </div>
</template>

<script setup>
// Type / catégorie / sous-catégorie interdépendants. La cascade elle-même est calculée par
// le parent (cascadeEventTaxonomy) : ici, valeurs et options reçues, `change` émis.
import { getCurrentInstance } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import ComparisonField from './ComparisonField.vue'
import ComparisonSelect from './ComparisonSelect.vue'

defineProps({
  type: { type: String, default: '' },
  category: { type: String, default: '' },
  subcategory: { type: String, default: '' },
  // { types, categories, subcategories } : listes de chaînes.
  options: { type: Object, default: () => ({ types: [], categories: [], subcategories: [] }) },
})
// change(field: 'type' | 'category' | 'subcategory', value: string)
const emit = defineEmits(['change'])

const { t } = useI18n()
const uid = `cf-cat-${getCurrentInstance().uid}`
const toOptions = (list) => (list || []).map((v) => ({ value: v, label: v }))
</script>

<style scoped>
.cf-row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
</style>
