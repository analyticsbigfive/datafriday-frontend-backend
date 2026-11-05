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
    :menu-props="{ maxHeight: 320, zIndex: 10000, contentClass: 'pill-multi-menu' }"
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

<!-- Le menu Vuetify est téléporté hors du composant : styles non-scopés via contentClass.
     Même rendu que le menu des filtres voisins de la barre Menu Item (mil-filter-menu). -->
<style>
.pill-multi-menu {
  border-radius: 14px !important;
  box-shadow: 0 10px 34px rgba(17, 24, 39, .14) !important;
  overflow: hidden;
  margin-top: 6px;
}
.pill-multi-menu .v-list { padding: 6px !important; background: #fff; }
.pill-multi-menu .v-list-item {
  border-radius: 9px !important;
  min-height: 36px !important;
  margin-bottom: 2px;
  padding-inline: 10px !important;
}
.pill-multi-menu .v-list-item:last-child { margin-bottom: 0; }
.pill-multi-menu .v-list-item__overlay { opacity: 0 !important; }
.pill-multi-menu .v-list-item:hover { background: #f4f5f7; }
.pill-multi-menu .v-list-item-title {
  font-size: var(--fs-base) !important;
  font-weight: var(--fw-medium);
  color: #374151;
}
.pill-multi-menu .v-list-item--active { background: rgba(255, 49, 49, .08) !important; }
.pill-multi-menu .v-list-item--active .v-list-item-title { color: #ff3131 !important; font-weight: var(--fw-semibold); }
.pill-multi-menu .v-list-item .v-list-item__prepend > .v-selection-control { --v-selection-control-size: 18px; }
.pill-multi-menu .v-list-item .v-selection-control .v-icon { font-size: var(--fs-lg); opacity: 1; }
.pill-multi-menu .v-list-item--active .v-selection-control { color: #ff3131; }
.pill-multi-menu .v-list-item .v-list-item__spacer { width: 10px !important; }
.pill-multi-menu.v-theme--dark .v-list { background: #1f2937; }
.pill-multi-menu.v-theme--dark .v-list-item:hover { background: #374151; }
.pill-multi-menu.v-theme--dark .v-list-item-title { color: #e5e7eb; }
.pill-multi-menu.v-theme--dark .v-list-item--active { background: rgba(255, 49, 49, .16) !important; }
</style>
