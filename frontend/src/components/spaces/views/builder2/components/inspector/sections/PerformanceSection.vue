<template>
  <SectionCard :title="t('b2PerformanceTitle')" icon="mdi-chart-line">
    <div class="ps-grid">
      <div v-for="field in FIELDS" :key="field.key" class="ps-field">
        <label class="ps-label" :for="`ps-${field.key}`">{{ t(field.labelKey) }}</label>
        <input
          :id="`ps-${field.key}`"
          class="ps-input"
          type="number"
          inputmode="decimal"
          placeholder="0.0"
          :value="performance[field.key]"
          @change="(e) => commit(field.key, e.target.value)"
        />
      </div>
    </div>
  </SectionCard>
</template>

<script setup>
import { computed, inject } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import SectionCard from './SectionCard.vue'
import { putElementPerformance } from '@/api/endpoints/builder-v2.api'

const FIELDS = [
  { key: 'revenue', labelKey: 'b2Revenue' },
  { key: 'numberOfPOS', labelKey: 'b2NumberOfPOS' },
  { key: 'numberOfTransactions', labelKey: 'b2NumberOfTransactions' },
  { key: 'transactionsPerMinute', labelKey: 'b2TransactionsPerMinute' },
  { key: 'staffCost', labelKey: 'b2StaffCost' },
  { key: 'revenuePerEmployee', labelKey: 'b2RevenuePerEmployee' },
]

const { t } = useI18n()
const store = inject('builderStore')
const element = computed(() => store.selectedElement.value)
// Tranche de la CONFIG ACTIVE (perfs par config depuis le scoping backend) ;
// clé '' = lignes legacy d'un élément sans config adhérente.
const configKey = computed(() => store.state.activeConfigId || '')
const performance = computed(() => {
  const byConfig = element.value?.performanceByConfig || {}
  return byConfig[configKey.value] || byConfig[''] || {}
})

function commit(key, raw) {
  const el = element.value
  if (!el) return
  const value = raw === '' ? 0 : Number(raw)
  if (Number.isNaN(value)) return
  const next = { ...performance.value, [key]: value }
  const cfgId = store.state.activeConfigId || undefined
  store.patchElementLocal(el.id, {
    performanceByConfig: { ...(el.performanceByConfig || {}), [cfgId || '']: next },
  })
  store.queue.push(() => putElementPerformance(el.id, next, cfgId), {
    key: `perf:${el.id}:${cfgId || ''}`,
    onError: (err) => store.notify(err?.response?.data?.message || t('b2ToastSavePerformanceFailed')),
  })
}
</script>

<style scoped>
.ps-grid {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.ps-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ps-label {
  font-size: 13px;
  font-weight: 600;
  color: rgb(var(--v-theme-on-surface));
}
.ps-input {
  width: 100%;
  padding: 11px 14px;
  font-size: 14px;
  color: rgb(var(--v-theme-on-surface));
  background: rgba(var(--v-theme-on-surface), 0.05);
  border: 1px solid transparent;
  border-radius: 10px;
  outline: none;
  transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.ps-input::placeholder { color: rgba(var(--v-theme-on-surface), 0.4); }
.ps-input:hover { background: rgba(var(--v-theme-on-surface), 0.07); }
.ps-input:focus {
  background: rgb(var(--v-theme-surface));
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.12);
}
</style>
