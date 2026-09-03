<template>
  <div class="lsl-card" :class="{ 'lsl-card--dark': isDark }">
    <p class="lsl-title">{{ t('liveShopListTitle') }}</p>
    <div v-if="!sorted.length" class="lsl-empty">{{ t('liveEmptyNoBaskets') }}</div>
    <ul v-else class="lsl-list">
      <li v-for="shop in sorted" :key="shop.shopId" class="lsl-row">
        <span class="lsl-row__name">{{ shop.shopName }}</span>
        <div class="lsl-row__bar-wrap">
          <div class="lsl-row__bar" :style="{ width: barWidth(shop.revenue) + '%' }"></div>
        </div>
        <span class="lsl-row__value">{{ formatCurrency(shop.revenue) }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrencyDetailed } from '@/composables/useFormatters'

const { t } = useI18n()
const formatCurrency = (v) => formatCurrencyDetailed(v)

const props = defineProps({
  shops: { type: Array, default: () => [] },
  isDark: { type: Boolean, default: false },
})

const sorted = computed(() =>
  [...props.shops]
    .filter((s) => Number(s.revenue) > 0)
    .sort((a, b) => (Number(b.revenue) || 0) - (Number(a.revenue) || 0)),
)
const maxRevenue = computed(() => Math.max(1, ...sorted.value.map((s) => Number(s.revenue) || 0)))
function barWidth(revenue) {
  return Math.max(2, Math.round(((Number(revenue) || 0) / maxRevenue.value) * 100))
}
</script>

<style scoped>
.lsl-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  padding: 14px;
}
.lsl-card--dark { background: #1e293b; border-color: rgba(255, 255, 255, 0.1); }
.lsl-title { font-size: var(--fs-md); font-weight: var(--fw-bold); color: #111827; margin: 0 0 10px; }
.lsl-card--dark .lsl-title { color: #f9fafb; }
.lsl-empty { color: #9ca3af; font-size: var(--fs-md); }
.lsl-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.lsl-row { display: grid; grid-template-columns: 140px 1fr 90px; align-items: center; gap: 10px; }
.lsl-row__name { font-size: var(--fs-base); color: #374151; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lsl-card--dark .lsl-row__name { color: #d1d5db; }
.lsl-row__bar-wrap { height: 8px; border-radius: 4px; background: #f1f5f9; overflow: hidden; }
.lsl-card--dark .lsl-row__bar-wrap { background: rgba(255,255,255,0.08); }
.lsl-row__bar { height: 100%; border-radius: 4px; background: #5B8DEF; }
.lsl-row__value { font-size: var(--fs-base); font-weight: var(--fw-bold); text-align: right; color: #111827; font-variant-numeric: tabular-nums; }
.lsl-card--dark .lsl-row__value { color: #f9fafb; }
</style>
