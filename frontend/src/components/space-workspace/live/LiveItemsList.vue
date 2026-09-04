<template>
  <div class="sp-card pa-3" :class="{ 'summary-panel--dark': isDark }">
    <div class="d-flex align-center justify-space-between mb-2">
      <span class="section-title">{{ t('anItemPerformance') }}</span>
    </div>

    <div class="lb-list mb-2">
      <div
        v-for="(item, idx) in (showAll ? sorted : sorted.slice(0, 5))"
        :key="item.name"
        class="lb-card lb-card--items sp-clickable"
        :class="{ 'lb-card--active': selectedItemNames.includes(item.name) }"
        role="button"
        tabindex="0"
        @click="$emit('item-click', item.name)"
        @keydown.enter="$emit('item-click', item.name)"
      >
        <div class="lb-top">
          <v-avatar size="24" :color="rankColor(idx + 1)" class="rank-badge">
            <span class="rank-num">{{ idx + 1 }}</span>
          </v-avatar>
          <span class="item-name lb-name">{{ item.name }}</span>
          <span class="item-value lb-val">{{ formatCurrencyDetailed(item.revenue) }}</span>
        </div>
        <div class="lb-sub">
          <span class="lb-spacer"></span>
          <span class="item-units-below">{{ formatNumber(item.units) }} {{ t('anUnits') }}</span>
        </div>
        <div class="lb-meter">
          <i :style="{ width: shareWidth(item.revenue, maxRevenue) }"></i>
        </div>
      </div>
      <div v-if="!sorted.length" class="fp-check-empty">{{ t('anNoResults') }}</div>
    </div>

    <v-btn v-if="sorted.length > 5" variant="text" size="small" block class="show-all-btn" @click="showAll = !showAll">
      <v-icon size="16" class="mr-1">{{ showAll ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      {{ showAll ? t('anCollapse') : `${t('anSeeAll')} (${sorted.length})` }}
    </v-btn>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { RANK_COLORS } from '@/constants/analyseColors'

const { t } = useI18n()

const props = defineProps({
  records: { type: Array, default: () => [] },
  isDark: { type: Boolean, default: false },
  selectedItemNames: { type: Array, default: () => [] },
})
defineEmits(['item-click'])

const showAll = ref(false)

const sorted = computed(() => {
  const byItem = new Map()
  for (const r of props.records) {
    const name = r.menuItemName
    if (!name) continue
    if (!byItem.has(name)) byItem.set(name, { name, revenue: 0, units: 0 })
    const it = byItem.get(name)
    it.revenue += Number(r.revenue) || 0
    it.units += Number(r.quantity) || 0
  }
  return [...byItem.values()].sort((a, b) => b.revenue - a.revenue)
})
const maxRevenue = computed(() => sorted.value.reduce((m, i) => Math.max(m, i.revenue), 0) || 1)

function rankColor(rank) {
  if (rank === 1) return RANK_COLORS[1]
  if (rank === 2) return RANK_COLORS[2]
  return RANK_COLORS.default
}
function shareWidth(value, max) {
  const pct = max > 0 ? ((Number(value) || 0) / max) * 100 : 0
  return `${Math.max(0, Math.min(100, pct))}%`
}
</script>

<style scoped>
.sp-card {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.summary-panel--dark.sp-card { background: #1e293b; border-color: rgba(255, 255, 255, 0.10); }
.section-title {
  font-size: 0.6875rem;
  font-weight: var(--fw-bold);
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.lb-list { display: flex; flex-direction: column; gap: 8px; }
.lb-card {
  position: relative; overflow: hidden;
  background: #fff; border: 1px solid #e5e7eb; border-radius: 12px;
  padding: 10px 12px 11px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}
.summary-panel--dark .lb-card { background: #0f172a; border-color: rgba(255, 255, 255, 0.10); }
.lb-card::before {
  content: ""; position: absolute; inset: 0 auto 0 0; width: 3px;
  background: var(--lb-accent, #64748b);
}
.lb-card--items { --lb-accent: #f59e0b; }
.sp-clickable { cursor: pointer; }
.lb-card--active { border-color: var(--lb-accent, #64748b); box-shadow: inset 0 0 0 1px var(--lb-accent, #64748b); }
.lb-top { display: flex; align-items: center; gap: 10px; }
.lb-name {
  flex: 1 1 auto; min-width: 0; font-size: var(--fs-base)!important; font-weight: 700; color: #212121;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.summary-panel--dark .lb-name { color: #f9fafb; }
.lb-val {
  flex: none; margin-left: auto; font-size: var(--fs-md)!important; font-weight: var(--fw-bold)!important;
  color: #212121 !important; letter-spacing: -0.2px; font-variant-numeric: tabular-nums;
}
.summary-panel--dark .lb-val { color: #f9fafb !important; }
.lb-sub { display: flex; align-items: center; gap: 8px; min-height: 18px; margin: 5px 0 8px; padding-left: 34px; }
.lb-spacer { margin-left: auto; }
.lb-meter { height: 5px; border-radius: 4px; background: #eef2f7; overflow: hidden; }
.lb-meter > i {
  display: block; height: 100%; min-width: 3px; border-radius: 4px;
  background: var(--lb-accent, #64748b); transition: width 0.3s ease;
}
.rank-badge { color: #fff; }
.rank-num { font-size: var(--fs-xs); font-weight: 700; }
.item-units-below { font-size: var(--fs-xs); color: #9E9E9E; margin-top: 2px; }
.show-all-btn { font-size: var(--fs-xs); font-weight: 600; letter-spacing: 0.02em; color: #5B8DEF; margin-top: 4px; text-transform: none; }
.fp-check-empty { padding: 12px; text-align: center; font-size: var(--fs-base); color: #9ca3af; }
</style>
