<template>
  <PosCollapsibleCard :title="t('posSalesCardTitle')">
    <template #header-extra>
      <span class="pos-ss__chip" :class="isLive ? 'pos-ss__chip--live' : 'pos-ss__chip--upcoming'">
        {{ isLive ? t('posLiveChip') : t('posUpcomingChip') }}
      </span>
    </template>

    <div class="pos-ss__total">
      <span class="pos-ss__total-label">{{ t('posRevenue') }}</span>
      <span class="pos-ss__total-value">{{ money(totalRevenue) }}</span>
    </div>

    <div v-if="rows.length" class="pos-ss__rows">
      <div v-for="row in rows" :key="row.elementId" class="pos-ss__row">
        <div class="pos-ss__line">
          <span class="pos-ss__name">{{ row.name }}</span>
          <span class="pos-ss__ca">{{ money(row.sales.revenueTtc) }}</span>
        </div>
        <div class="pos-ss__bar"><div class="pos-ss__fill" :style="{ width: barWidth(row) }" /></div>
        <div class="pos-ss__tickets">{{ t('posTicketsCount').replace('{count}', String(row.sales.tickets)) }}</div>
      </div>
    </div>
    <p v-else class="pos-ss__empty">{{ isLive ? t('posNoCashierStarted') : t('posSalesAfterStart') }}</p>
  </PosCollapsibleCard>
</template>

<script setup>
import { computed } from 'vue'
import { usePosFormat } from '@/composables/usePosFormat'
import PosCollapsibleCard from './PosCollapsibleCard.vue'

// Ventes POS par PdV (colonne droite) : CA total et barre relative par caisse.
const props = defineProps({
  pdvs: { type: Array, default: () => [] },
  totalRevenue: { type: Number, default: 0 },
  isLive: { type: Boolean, default: false },
})

const { t, money } = usePosFormat()
const rows = computed(() =>
  props.pdvs
    .filter((p) => p.sales && (p.status !== 'inactive' || p.sales.tickets > 0))
    .sort((a, b) => b.sales.revenueTtc - a.sales.revenueTtc)
)
const maxRevenue = computed(() => rows.value.reduce((max, p) => Math.max(max, p.sales.revenueTtc), 0) || 1)
const barWidth = (row) => `${Math.round((row.sales.revenueTtc / maxRevenue.value) * 100)}%`
</script>

<style scoped>
.pos-ss__chip {
  padding: 3px 10px;
  border-radius: 999px;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
}
.pos-ss__chip--live {
  background: var(--fb-success-soft, #f0fdf4);
  color: var(--fb-success, #16a34a);
}
.pos-ss__chip--upcoming {
  background: var(--fb-warning-soft, #fffbeb);
  color: #b45309;
}
.pos-ss__total {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.pos-ss__total-label {
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-sm);
}
.pos-ss__total-value {
  font-size: var(--fs-xxl);
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
}
.pos-ss__rows {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--fb-border, #e5e7eb);
}
.pos-ss__row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.pos-ss__line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: var(--fs-base);
}
.pos-ss__name {
  min-width: 0;
  font-weight: var(--fw-semibold);
}
.pos-ss__ca {
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
}
.pos-ss__bar {
  height: 6px;
  overflow: hidden;
  border-radius: 3px;
  background: var(--fb-border, #e5e7eb);
}
.pos-ss__fill {
  height: 6px;
  border-radius: 3px;
  background: var(--fb-primary, #d63031);
}
.pos-ss__tickets {
  color: var(--fb-faint, #9ca3af);
  font-size: var(--fs-sm);
}
.pos-ss__empty {
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--fb-border, #e5e7eb);
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-base);
  line-height: 1.5;
}
</style>
