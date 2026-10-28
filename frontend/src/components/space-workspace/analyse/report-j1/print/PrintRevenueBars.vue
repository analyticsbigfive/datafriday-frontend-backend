<template>
  <div class="pr" :style="{ width: width + 'px', height: height + 'px' }">
    <div v-for="b in rows" :key="b.label" class="pr__row" :style="{ height: rowH + 'px' }">
      <span class="pr__label" :style="{ width: labelW + 'px' }">{{ clampAtWord(b.label, labelChars) }}</span>
      <span class="pr__track">
        <i class="pr__fill" :style="{ width: barWidth(b.value), background: b.isOthers ? '#B0BEC5' : '#3B82F6' }"></i>
      </span>
      <span class="pr__value" :style="{ width: VALUE_W + 'px' }">{{ formatCurrency(b.value) }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrency } from '@/composables/useFormatters'
import { barsTopN, clampAtWord } from '@/utils/reportJ1Page2Tables'

const props = defineProps({
  data: { type: Object, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
})
const { t } = useI18n()

const MIN_ROW_H = 24
const MAX_ROW_H = 34
const VALUE_W = 84
const labelW = computed(() => Math.min(210, Math.floor(props.width * 0.3)))
const labelChars = computed(() => Math.max(8, Math.floor(labelW.value / 6.6)))

const bars = computed(() => props.data?.bars || [])
const cap = computed(() => Math.max(1, Math.floor(props.height / MIN_ROW_H)))
const rows = computed(() => barsTopN(bars.value, cap.value, { othersLabel: t('rj1P2Others') }))
const rowH = computed(() => Math.max(MIN_ROW_H, Math.min(MAX_ROW_H, Math.floor(props.height / Math.max(1, rows.value.length)))))
const max = computed(() => Math.max(1, ...rows.value.map((b) => b.value)))
const barWidth = (v) => `${Math.max(1, (v / max.value) * 100)}%`
</script>

<style scoped>
.pr { box-sizing: border-box; }
.pr__row { display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #f1f5f9; box-sizing: border-box; }
.pr__label { flex-shrink: 0; font-size: var(--fs-sm); color: #1e293b; white-space: nowrap; line-height: 1.3; }
.pr__track { flex: 1; min-width: 0; height: 12px; border-radius: 6px; background: #eef2f7; display: block; }
.pr__fill { display: block; height: 12px; border-radius: 6px; }
.pr__value { flex-shrink: 0; text-align: right; font-size: var(--fs-sm); font-weight: var(--fw-bold); color: #0f172a; font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
