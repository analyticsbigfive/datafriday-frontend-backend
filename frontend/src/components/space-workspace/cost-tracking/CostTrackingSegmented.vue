<template>
  <v-btn-toggle
    :model-value="modelValue"
    mandatory
    density="compact"
    role="group"
    :aria-label="ariaLabel"
    class="pill-toggle ct-seg"
    :class="{ 'ct-seg--sm': small, 'ct-seg--disabled': disabled }"
    :disabled="disabled"
    :title="disabled ? disabledHint : undefined"
    @update:model-value="onChange"
  >
    <v-btn v-for="opt in options" :key="opt.value" :value="opt.value" size="small">{{ opt.label }}</v-btn>
  </v-btn-toggle>
</template>

<script setup>
// Contrôle segmenté de la page Cost tracking. C'est la bascule commune de l'application :
// `v-btn-toggle.pill-toggle` (styles globaux dans App.vue, thème clair et sombre), déjà utilisée
// dans Analyse pour « Total / Moyenne » (SummaryPanel) et le tri (GenericByEventChart).
// Ajouts locaux : une seule ligne, texte jamais coupé, défilement horizontal si l'espace manque.
const props = defineProps({
  // [{ value, label }] : le libellé est déjà traduit.
  options: { type: Array, default: () => [] },
  modelValue: { type: String, default: '' },
  ariaLabel: { type: String, default: undefined },
  small: { type: Boolean, default: false },
  // Contrôle visible mais grisé quand il ne s'applique pas ; `disabledHint` dit pourquoi (info-bulle).
  disabled: { type: Boolean, default: false },
  disabledHint: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])

function onChange(value) {
  if (!props.disabled && value && value !== props.modelValue) emit('update:modelValue', value)
}
</script>

<style scoped>
.ct-seg {
  flex-wrap: nowrap;
  max-width: 100%;
  min-width: 0;
  height: 36px;
  overflow-x: auto;
  scrollbar-width: none;
}
.ct-seg::-webkit-scrollbar {
  display: none;
}
.ct-seg--sm {
  height: 32px;
}
.ct-seg--disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ct-seg--disabled :deep(.v-btn) {
  pointer-events: none;
}
.ct-seg :deep(.v-btn) {
  flex: none;
  min-width: 0;
  padding: 0 14px;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  letter-spacing: 0;
  line-height: 1;
  white-space: nowrap;
}
.ct-seg--sm :deep(.v-btn) {
  padding: 0 12px;
}
.ct-seg :deep(.v-btn--active) {
  font-weight: var(--fw-semibold);
}
</style>
