<template>
  <div class="wts-root">
    <label v-if="label" class="wts-label">{{ label }}</label>
    <v-select
      :model-value="modelValue"
      :items="items"
      item-title="label"
      item-value="value"
      density="compact"
      variant="outlined"
      hide-details
      class="wts-select"
      :aria-label="ariaLabel || label"
      @update:model-value="$emit('update:modelValue', $event)"
    >
      <template #selection="{ item }">
        <span class="wts-selection">
          <v-icon size="16">{{ item.raw.icon }}</v-icon>
          <span>{{ item.raw.label }}</span>
        </span>
      </template>
      <template #item="{ props: itemProps, item }">
        <v-list-item v-bind="itemProps" :title="item.raw.label">
          <template #prepend>
            <v-icon size="17" color="primary">{{ item.raw.icon }}</v-icon>
          </template>
        </v-list-item>
      </template>
    </v-select>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, required: true },
  items: { type: Array, default: () => [] },
  label: { type: String, default: 'Outils' },
  ariaLabel: { type: String, default: '' },
})

defineEmits(['update:modelValue'])
</script>

<style scoped>
.wts-root {
  display: grid;
  gap: 7px;
  width: 100%;
  min-width: 0;
}

.wts-label {
  color: var(--fb-muted, #6b7280);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.wts-select :deep(.v-field) {
  min-height: 42px;
  border: 1.5px solid var(--fb-border, #e5e7eb);
  border-radius: 12px;
  background: var(--fb-surface, #fff);
  box-shadow: none;
  transition: border-color 0.2s, box-shadow 0.2s, background 0.2s;
}

.wts-select :deep(.v-field:hover) {
  border-color: var(--fb-border-strong, #d1d5db);
  background: var(--fb-subtle, #fafafa);
}

.wts-select :deep(.v-field--focused) {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1);
}

.wts-select :deep(.v-field__outline) {
  display: none;
}

.wts-select :deep(.v-field__input) {
  min-height: 40px;
  padding-top: 0;
  padding-bottom: 0;
  font-size: 13px;
}

.wts-selection {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--fb-text, #212121);
  font-weight: 700;
}

/* ===================== DARK MODE ===================== */
/* Les `--fb-*` ne sont déclarées que sous .event-predict-overlay /
   .space-inventory-view / .space-restock-view (style.css) : dans les autres
   hôtes (Analyse, Logistic) chaque var() retombait sur son littéral CLAIR, d'où
   un champ blanc en thème sombre. On garde donc la var en priorité (les hôtes
   qui la définissent gardent leur palette) et on bascule seulement le
   FALLBACK sur les valeurs sombres de style.css. */
.v-theme--dataFridayDark .wts-label {
  color: var(--fb-muted, #d1d5db);
}

.v-theme--dataFridayDark .wts-select :deep(.v-field) {
  border-color: var(--fb-border, #374151);
  background: var(--fb-surface, #1f2937);
}

.v-theme--dataFridayDark .wts-select :deep(.v-field:hover) {
  border-color: var(--fb-border-strong, #4b5563);
  background: var(--fb-subtle, #172033);
}

.v-theme--dataFridayDark .wts-selection {
  color: var(--fb-text, #f9fafb);
}
</style>
