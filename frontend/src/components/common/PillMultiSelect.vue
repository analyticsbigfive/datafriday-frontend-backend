<template>
  <v-select
    :model-value="modelValue"
    :items="items"
    item-title="name"
    item-value="id"
    multiple
    clearable
    hide-details
    density="compact"
    variant="plain"
    persistent-placeholder
    :placeholder="placeholder"
    :menu-props="{ maxHeight: 320 }"
    class="pill-multi-select"
    @update:model-value="$emit('update:modelValue', $event || [])"
  >
    <template #selection="{ item, index }">
      <span v-if="index === 0" class="pill-multi-select__summary">
        <span class="pill-multi-select__name">{{ item.title }}</span>
        <span v-if="modelValue.length > 1" class="pill-multi-select__more">+{{ modelValue.length - 1 }}</span>
      </span>
    </template>
  </v-select>
</template>

<script>
// Sélecteur multi-choix compact en pastille (même gabarit que les filtres de la barre Menu Item) :
// une seule ligne de 34px quelle que soit la sélection, « premier choix +N » au lieu d'une pile
// de chips. v-model = tableau d'IDs, items = [{ id, name }].
export default {
  name: 'PillMultiSelect',
  props: {
    modelValue: { type: Array, default: () => [] },
    items: { type: Array, default: () => [] },
    placeholder: { type: String, default: '' },
  },
  emits: ['update:modelValue'],
}
</script>

<style scoped>
.pill-multi-select {
  width: 200px; max-width: 100%; flex: 0 0 auto;
  --v-input-control-height: 38px;
  --v-field-padding-top: 0px;
  --v-field-padding-bottom: 0px;
  --v-field-input-padding-top: 0px;
  --v-field-input-padding-bottom: 0px;
}
.pill-multi-select :deep(.v-input__control) { min-height: 38px; }
.pill-multi-select :deep(.v-field) {
  height: 38px; border-radius: 100px; border: 1.5px solid #e5e7eb;
  background: #f9fafb; box-shadow: none; outline: none;
}
.pill-multi-select :deep(.v-field:hover) { border-color: #d1d5db; }
.pill-multi-select :deep(.v-field--focused) { border-color: #ff3131; }
.pill-multi-select :deep(.v-field__outline),
.pill-multi-select :deep(.v-field__overlay) { display: none; }
.pill-multi-select :deep(.v-field__field) { height: 100%; align-items: center; }
.pill-multi-select :deep(.v-field__input) {
  min-height: 0; height: 100%; padding: 0 4px 0 14px; align-items: center; flex-wrap: nowrap;
  font-size: 12.5px; font-weight: 500; color: #374151;
}
.pill-multi-select :deep(.v-field__input input) { padding: 0; min-width: 0; height: 100%; align-self: center; }
.pill-multi-select :deep(input::placeholder) { color: #374151; opacity: 1; font-weight: 500; }
.pill-multi-select :deep(.v-field__append-inner),
.pill-multi-select :deep(.v-field__clearable) { padding: 0 6px 0 0; align-items: center; }
.pill-multi-select :deep(.v-select__selection) { margin: 0; min-width: 0; max-width: 100%; }
.pill-multi-select__summary { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
.pill-multi-select__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill-multi-select__more {
  flex: 0 0 auto; padding: 0 6px; border-radius: 100px; font-size: 11px; font-weight: 600;
  background: #ff3131; color: #fff;
}
</style>
