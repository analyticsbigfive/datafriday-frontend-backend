<template>
  <CostTrackingSegmented
    :options="options"
    :model-value="modelValue"
    :aria-label="t('ctGroupLabel')"
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import CostTrackingSegmented from './CostTrackingSegmented.vue'

// Bascule « Afficher par » : article, catégorie, type, fournisseur, composant, ingrédient.
// Suit les filtres tant qu'elle n'est pas forcée. Ingrédient avec un article filtré = sa recette.
defineProps({
  modelValue: { type: String, default: 'article' },
})
defineEmits(['update:modelValue'])

const { t } = useI18n()
const MODES = [
  { value: 'article', labelKey: 'ctGroupArticle' },
  { value: 'category', labelKey: 'ctGroupCategory' },
  { value: 'type', labelKey: 'ctGroupType' },
  { value: 'supplier', labelKey: 'ctGroupSupplier' },
  { value: 'component', labelKey: 'ctGroupComponent' },
  { value: 'ingredient', labelKey: 'ctGroupIngredient' },
]
const options = computed(() => MODES.map((m) => ({ value: m.value, label: t(m.labelKey) })))
</script>
