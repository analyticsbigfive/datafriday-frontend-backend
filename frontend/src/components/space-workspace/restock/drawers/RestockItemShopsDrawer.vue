<template>
  <EventDrawerShell
    :model-value="modelValue && !!data"
    :title="data ? data.itemName : ''"
    :subtitle="subtitle"
    side="left"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <template #icon>
      <v-icon color="white" size="20">mdi-storefront-outline</v-icon>
    </template>

    <template v-if="data">
      <div class="risd-summary">
        <span class="risd-summary-item">
          <span class="risd-label">{{ t('srShopsDrawerItemPercent') }}</span>
          <strong class="risd-num">{{ data.itemPercent }}%</strong>
        </span>
        <span class="risd-summary-item">
          <span class="risd-label">{{ t('srBreakdownRequired') }}</span>
          <strong class="risd-num">{{ data.totalRequired }}</strong>
        </span>
        <span class="risd-summary-item">
          <span class="risd-label">{{ t('srBreakdownToOrder') }}</span>
          <strong class="risd-num">{{ data.toOrder }}</strong>
        </span>
      </div>
      <p class="risd-hint">{{ t('srShopsDrawerHint') }}</p>

      <div v-if="!data.rows.length" class="risd-empty">{{ t('srShopsDrawerEmpty') }}</div>
      <div
        v-for="row in data.rows"
        :key="row.shopId"
        class="risd-row"
        :class="{ 'risd-row-overridden': row.overridden }"
        data-test="shop-row"
      >
        <div class="risd-row-head">
          <strong class="risd-shop">{{ row.shopName }}</strong>
        </div>
        <div class="risd-values">
          <span class="risd-value">
            <span class="risd-label">{{ t('srBreakdownPredict') }}</span>
            <strong class="risd-num">{{ row.predicted }}</strong>
          </span>
          <span class="risd-value">
            <span class="risd-label">{{ t('srBreakdownRemaining') }}</span>
            <strong class="risd-num">{{ row.remaining }}</strong>
          </span>
          <span class="risd-value">
            <span class="risd-label">{{ t('srBreakdownRequired') }}</span>
            <strong class="risd-num" :class="{ 'risd-ok': row.requiredOk }">{{ row.required }}</strong>
          </span>
          <span class="risd-value">
            <span class="risd-label">{{ t('srColToDeposit') }}</span>
            <strong class="risd-num">{{ row.deposit }}</strong>
          </span>
        </div>
        <div class="risd-slider-row">
          <input
            type="range"
            min="0"
            max="200"
            step="5"
            :value="row.percent"
            class="risd-slider"
            :aria-label="`${t('srShopsDrawerSliderAria')} ${row.shopName}`"
            data-test="shop-slider"
            @input="$emit('update-percent', { shopId: row.shopId, value: Number($event.target.value) })"
          />
          <span class="risd-percent">{{ row.percent }}%</span>
          <button
            type="button"
            class="risd-reset"
            :disabled="!row.overridden"
            :title="t('srShopsDrawerReset')"
            :aria-label="t('srShopsDrawerReset')"
            data-test="shop-reset"
            @click="$emit('reset-percent', { shopId: row.shopId })"
          ><v-icon size="16">mdi-restore</v-icon></button>
        </div>
      </div>
    </template>
  </EventDrawerShell>
</template>

<script>
// Chantier 388 : drawer gauche de répartition du besoin d'un article de stock
// par PDV (étape 1 du réarmement). Présentation pure : les lignes arrivent
// formatées du parent (SpaceRestockView.shopsDrawerData) et chaque réglage
// remonte en émission ; la garde de plan et le recalcul restent au parent.
import { useI18n } from '@/i18n/useI18n'
import EventDrawerShell from '@/components/events/drawers/EventDrawerShell.vue'

export default {
  name: 'RestockItemShopsDrawer',
  components: { EventDrawerShell },
  props: {
    modelValue: { type: Boolean, default: false },
    /**
     * { itemName, itemPercent, totalRequired, toOrder, rows: [{ shopId,
     *   shopName, predicted, remaining, required, requiredOk, deposit,
     *   percent, overridden }] }, ou null quand aucun article n'est ouvert.
     */
    data: { type: Object, default: null },
  },
  emits: ['update:modelValue', 'update-percent', 'reset-percent'],
  setup() {
    const { t } = useI18n()
    return { t }
  },
  computed: {
    subtitle() {
      const count = this.data ? this.data.rows.length : 0
      return `${count} ${count > 1 ? this.t('srShopPlural') : this.t('srShopSingular')}`
    },
  },
}
</script>

<style scoped>
.risd-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.risd-summary-item,
.risd-value {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}

.risd-label {
  color: #6b7280;
  font-size: var(--fs-sm);
}

.risd-num {
  color: #212121;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
}

.risd-ok {
  color: #16a34a;
}

.risd-hint {
  margin: 10px 2px 14px;
  color: #6b7280;
  font-size: var(--fs-sm);
}

.risd-empty {
  color: #6b7280;
  font-size: var(--fs-base);
}

.risd-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 8px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.risd-row-overridden {
  border-color: #fecaca;
  background: #fef2f2;
}

.risd-shop {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
}

.risd-values {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
}

.risd-slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.risd-slider {
  flex: 1;
  accent-color: var(--sr-primary, #ff3131);
}

.risd-percent {
  width: 44px;
  text-align: right;
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
}

.risd-reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  border: none;
  background: none;
  color: #64748b;
  cursor: pointer;
}

.risd-reset:hover:not(:disabled) {
  color: #ff3131;
}

.risd-reset:disabled {
  cursor: default;
  opacity: 0.35;
}
</style>
