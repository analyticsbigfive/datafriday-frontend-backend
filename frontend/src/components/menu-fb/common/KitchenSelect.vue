<template>
  <v-select
    :model-value="modelValue"
    :items="options"
    item-title="title"
    item-value="value"
    clearable
    variant="outlined"
    density="compact"
    hide-details="auto"
    :menu-props="{ zIndex: 10000 }"
    @update:model-value="$emit('update:modelValue', $event ?? null)"
  />
</template>

<script setup>
// Cuisine d'une fiche : « Cuisine Locale » ou une cuisine de Settings (cf.
// useKitchenOptions, partagé avec la fiche Menu Item).
import { useKitchenOptions } from '@/composables/useKitchenOptions'

const props = defineProps({
  modelValue: { type: String, default: null },
  // Espaces de la fiche : limite la liste aux cuisines rattachées.
  spaceIds: { type: Array, default: () => [] },
  // Relation `kitchen { id, name }` de la fiche : nom de la cuisine actuelle.
  currentKitchen: { type: Object, default: null },
})
defineEmits(['update:modelValue'])

const { options } = useKitchenOptions(() => props.spaceIds, () => props.modelValue, () => props.currentKitchen)
</script>
