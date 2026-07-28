<template>
  <div class="multi-select-filter mb-3" :class="{ 'multi-select-filter--dark': isDark }">
    <div v-if="label" class="filter-label mb-1">{{ label }}</div>
    <v-select
      :model-value="modelValue"
      :items="items"
      variant="outlined"
      rounded="lg"
      density="compact"
      bg-color="grey-lighten-5"
      hide-details
      multiple
      chips
      closable-chips
      clearable
      :menu-props="{ maxHeight: 300, contentClass: isDark ? 'ms-menu ms-menu--dark' : 'ms-menu' }"
      :placeholder="t('anAll')"
      @update:model-value="$emit('update:modelValue', $event || [])"
    >
      <template #selection="{ item, index }">
        <v-chip
          v-if="index < 2"
          size="x-small"
          color="#ff3131"
          variant="tonal"
          closable
          @click:close="removeItem(item.value)"
        >
          {{ item.title }}
        </v-chip>
        <span v-else-if="index === 2" class="text-caption text-medium-emphasis">
          +{{ modelValue.length - 2 }}
        </span>
      </template>
    </v-select>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const props = defineProps({
  label: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

function removeItem(value) {
  emit('update:modelValue', props.modelValue.filter((v) => v !== value))
}
</script>

<style scoped>
.filter-label {
  font-size: var(--fs-xs);
  font-weight: 700;
  color: #ff3131;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 4px;
}

/* ── Input : style « form-control » (CSS + esprit Bootstrap), focus rouge marque ── */
.multi-select-filter :deep(.v-field) {
  border-radius: 10px;
  border: 1.5px solid #e5e7eb;
  background: #f9fafb;
  box-shadow: none;
  transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
}
.multi-select-filter :deep(.v-field__outline) { display: none; }
.multi-select-filter :deep(.v-field:hover) { border-color: #d1d5db; }
.multi-select-filter :deep(.v-field--focused) {
  border-color: #ff3131;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .12);
}
.multi-select-filter :deep(.v-field__input) { font-size: var(--fs-base); min-height: 38px; }

/* ── Dark mode (autonome via useTheme) ── */
.multi-select-filter--dark :deep(.v-field) {
  border-color: rgba(255, 255, 255, 0.10);
  background: #0f172a;
}
.multi-select-filter--dark :deep(.v-field:hover) { border-color: rgba(255, 255, 255, 0.18); }
.multi-select-filter--dark :deep(.v-field--focused) {
  border-color: #ff3131;
  background: #1e293b;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .18);
}
.multi-select-filter--dark :deep(.v-field__input) { color: #e2e8f0; }
</style>

<!-- Dropdown téléporté hors du composant → style GLOBAL scellé par .ms-menu -->
<style>
.ms-menu.v-overlay__content {
  border-radius: 14px !important;
  border: 1px solid #eef0f3 !important;
  box-shadow: 0 14px 36px rgba(17, 24, 39, .16) !important;
  overflow: hidden;
}
.ms-menu .v-list {
  padding: 6px !important;
  background: #fff;
}
.ms-menu .v-list-item {
  border-radius: 10px !important;
  min-height: 40px !important;
  margin: 1px 0;
  transition: background .12s ease;
}
.ms-menu .v-list-item:hover { background: #f9fafb; }
.ms-menu .v-list-item--active {
  background: rgba(255, 49, 49, .08) !important;
  color: #ff3131 !important;
}
.ms-menu .v-list-item--active .v-list-item-title { font-weight: 700; }
.ms-menu .v-list-item-title { font-size: var(--fs-base); }
/* Case à cocher accent rouge marque */
.ms-menu .v-selection-control__input > .v-icon { color: #ff3131 !important; }
/* Scrollbar discrète */
.ms-menu .v-list::-webkit-scrollbar { width: 8px; }
.ms-menu .v-list::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 8px; }

/* ── Dark mode du dropdown téléporté (classe sur sa racine propre) ── */
.ms-menu--dark.v-overlay__content {
  border-color: rgba(255, 255, 255, 0.10) !important;
  box-shadow: 0 14px 36px rgba(0, 0, 0, .5) !important;
}
.ms-menu--dark .v-list { background: #1e293b; }
.ms-menu--dark .v-list-item:hover { background: rgba(255, 255, 255, 0.05); }
.ms-menu--dark .v-list-item--active {
  background: rgba(255, 49, 49, .16) !important;
  color: #ff5a5a !important;
}
.ms-menu--dark .v-list-item-title { color: #e2e8f0; }
.ms-menu--dark .v-list::-webkit-scrollbar-thumb { background: #374151; }
</style>
