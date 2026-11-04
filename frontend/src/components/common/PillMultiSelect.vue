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
    menu-icon="mdi-chevron-down"
    :placeholder="placeholder"
    :menu-props="{ maxHeight: 320, zIndex: 10000 }"
    class="pill-multi-select"
    @update:model-value="$emit('update:modelValue', $event || [])"
  >
    <template #selection="{ item, index }">
      <span v-if="index === 0" class="pill-multi-select__summary">
        <span class="pill-multi-select__name">{{ item.title }}</span>
        <span v-if="modelValue.length > 1" class="pill-multi-select__more">+{{ modelValue.length - 1 }}</span>
      </span>
    </template>
    <template v-if="$slots['no-data']" #no-data>
      <slot name="no-data" />
    </template>
  </v-select>
</template>

<script>
// Sélecteur multi-choix compact en pastille (même gabarit que les filtres de la barre Menu Item) :
// une seule ligne de 38px quelle que soit la sélection, « premier choix +N » au lieu d'une pile
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
  height: 38px; border-radius: 999px; border: 1.5px solid #e5e7eb;
  background: #fff; box-shadow: none; outline: none;
  transition: border-color 0.15s;
}
.pill-multi-select :deep(.v-field:hover) { border-color: #d1d5db; }
.pill-multi-select :deep(.v-field--focused) { border-color: #ff3131; }
.pill-multi-select :deep(.v-field__outline),
.pill-multi-select :deep(.v-field__overlay) { display: none; }
.pill-multi-select :deep(.v-field__field) { height: 100%; align-items: center; }
/* Retrait gauche : Vuetify (plain) force --v-field-padding-start à 0 ; on le fixe ici en
   padding-inline pour rester cohérent avec l'input du v-select (voir plus bas). */
.pill-multi-select :deep(.v-field__input) {
  min-height: 0; height: 100%; align-items: center; flex-wrap: nowrap;
  padding-block: 0; padding-inline-start: 14px; padding-inline-end: 4px;
  font-size: var(--fs-base); font-weight: var(--fw-medium); color: #374151;
}
/* Cause de l'ancien collage à gauche : dans un v-select, l'input (qui porte le placeholder) est
   en position absolue left:0 et tire son retrait de `padding-inline: inherit`. L'ancien
   `padding: 0` l'annulait, donc « Toutes les saisons » collait au bord. On hérite à nouveau. */
.pill-multi-select :deep(.v-field__input > input) {
  padding-block: 0; padding-inline: inherit; min-width: 0; height: 100%; align-self: center;
}
.pill-multi-select :deep(input::placeholder) { color: #374151; opacity: 1; font-weight: var(--fw-medium); }
.pill-multi-select :deep(.v-field__append-inner),
.pill-multi-select :deep(.v-field__clearable) { padding: 0 8px 0 0; align-items: center; }
.pill-multi-select :deep(.v-select__menu-icon) { margin-inline-start: 0; font-size: var(--fs-lg); color: #9ca3af; opacity: 1; }
.pill-multi-select :deep(.v-select__selection) { margin: 0; min-width: 0; max-width: 100%; }
.pill-multi-select__summary { display: inline-flex; align-items: center; gap: 6px; min-width: 0; max-width: 100%; }
.pill-multi-select__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pill-multi-select__more {
  flex: 0 0 auto; padding: 0 6px; border-radius: 999px;
  font-size: var(--fs-xs); font-weight: var(--fw-semibold);
  background: #ff3131; color: #fff;
}
</style>
