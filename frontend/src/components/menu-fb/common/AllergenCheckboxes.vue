<template>
  <!-- Cases à cocher des allergènes, partagées par les fiches Menu Item et Composant
       (liste unique : utils/allergens.js). -->
  <div class="allergen-grid">
    <v-checkbox
      v-for="opt in ALLERGEN_OPTIONS"
      :key="opt.value"
      :model-value="modelValue"
      :value="opt.value"
      :label="t(opt.labelKey)"
      hide-details
      density="compact"
      @update:model-value="$emit('update:modelValue', $event || [])"
    />
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import { ALLERGEN_OPTIONS } from '@/utils/allergens'

defineProps({
  modelValue: { type: Array, default: () => [] },
})
defineEmits(['update:modelValue'])

const { t } = useI18n()
</script>

<style scoped>
.allergen-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 4px;
}
</style>
