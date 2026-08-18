<template>
  <!-- Éditeur d'une dimension de filtre, affiché AU-DESSUS du leaderboard dans la
       colonne droite quand un tag multi-select est cliqué (cf. FilterSummary). -->
  <div class="fep-card" :class="{ 'fep-card--dark': isDark }">
    <div class="fep-head">
      <span class="fep-title">{{ t('anEditFilter') }} : {{ label }}</span>
      <v-btn
        icon
        variant="text"
        size="x-small"
        class="fep-close"
        :aria-label="t('anClose')"
        @click="$emit('close')"
      >
        <v-icon size="18">mdi-close</v-icon>
      </v-btn>
    </div>
    <div class="fep-body">
      <CheckboxListFilter
        :items="items"
        :model-value="modelValue"
        :counts="counts"
        @update:model-value="(v) => $emit('update:modelValue', v)"
      />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import CheckboxListFilter from '../filters/CheckboxListFilter.vue'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

defineProps({
  label: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
  counts: { type: Object, default: null },
})
defineEmits(['update:modelValue', 'close'])
</script>

<style scoped>
.fep-card {
  background: #ffffff;
  border: 1.5px solid #ff3131;
  border-radius: 16px;
  overflow: hidden;
}
.fep-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 8px 8px 14px;
  background: rgba(255, 49, 49, 0.06);
  border-bottom: 1px solid rgba(255, 49, 49, 0.14);
}
.fep-title {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: #1e293b;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.fep-close { color: #6b7280; }
.fep-body { padding: 10px 14px 4px; }
/* Le label rouge interne de CheckboxListFilter est redondant avec le header. */
.fep-body :deep(.cbf-label) { display: none; }
.fep-body :deep(.cbf-list) { max-height: 320px; }

/* ===================== DARK MODE ===================== */
.fep-card--dark {
  background: #1e293b;
  /* border rouge #ff3131 conservé (sémantique) */
}
.fep-card--dark .fep-head {
  background: rgba(255, 49, 49, 0.12);
  border-bottom-color: rgba(255, 49, 49, 0.22);
}
.fep-card--dark .fep-title {
  color: #f9fafb;
}
.fep-card--dark .fep-close {
  color: #94a3b8;
}
</style>
