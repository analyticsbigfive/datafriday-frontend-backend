<template>
  <div class="cf-notice" role="status">
    <v-icon size="16" class="cf-notice__ico" aria-hidden="true">mdi-chart-timeline-variant</v-icon>
    <span>{{ text }}</span>
  </div>
</template>

<script setup>
// Encart du mode Predict : combien d'events du principal ont un scénario sauvegardé.
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  checking: { type: Boolean, default: false },
  coveredCount: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
})

const { t } = useI18n()
const text = computed(() => (
  props.checking
    ? t('anCmpPredictInfoChecking')
    : t('anCmpPredictInfo').replace('{n}', String(props.coveredCount)).replace('{m}', String(props.total))
))
</script>

<style scoped>
.cf-notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 14px;
  padding: 9px 12px;
  border-radius: 10px;
  font-size: var(--fs-base);
  line-height: 1.35;
  background: var(--cf-cmp-bg);
  color: var(--cf-cmp);
}
.cf-notice__ico { flex: none; margin-top: 1px; }
</style>
