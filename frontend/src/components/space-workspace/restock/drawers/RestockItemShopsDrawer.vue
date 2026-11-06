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
          <span class="risd-label">{{ t('srColToDeposit') }}</span>
          <strong class="risd-num" data-test="total-deposit">{{ data.totalDeposit }}</strong>
        </span>
        <span class="risd-summary-item">
          <span class="risd-label">{{ t('srBreakdownToOrder') }}</span>
          <strong class="risd-num">{{ data.toOrder }}</strong>
        </span>
      </div>
      <div v-if="data.circuit" class="risd-circuit" data-test="circuit-header">
        <span class="risd-circuit-line" data-test="circuit-surplus">
          <span class="risd-label">{{ t('srCircuitCoveredBySurplus') }}{{ t('srLabelColon') }}</span>
          <strong v-value-pulse="data.circuit.coveredBySurplusLabel" class="risd-num">{{ data.circuit.coveredBySurplusLabel }}</strong>
          <span class="risd-label">({{ packsText(data.circuit.coveredBySurplusPacks) }})</span>
        </span>
        <span v-if="data.circuit.coveredByStorage > 0" class="risd-circuit-line" data-test="circuit-storage">
          <span class="risd-label">{{ t('srCircuitDrawnFromStorage') }}{{ t('srLabelColon') }}</span>
          <strong v-value-pulse="data.circuit.coveredByStorageLabel" class="risd-num">{{ data.circuit.coveredByStorageLabel }}</strong>
          <span class="risd-label">({{ packsText(data.circuit.coveredByStoragePacks) }})</span>
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
        <div v-if="badges(row).length" class="risd-badges" data-test="circuit-badges">
          <span
            v-for="badge in badges(row)"
            :key="badge.key"
            class="risd-badge"
            :class="`risd-badge--${badge.kind}`"
          >{{ badge.text }}</span>
        </div>
        <div class="risd-values">
          <span class="risd-value">
            <span class="risd-label">{{ t('srBreakdownPredict') }}</span>
            <strong v-value-pulse="row.predicted" class="risd-num">{{ row.predicted }}</strong>
          </span>
          <span class="risd-value">
            <span class="risd-label">{{ t('srBreakdownRemaining') }}</span>
            <strong v-value-pulse="row.remaining" class="risd-num">{{ row.remaining }}</strong>
          </span>
          <span class="risd-value">
            <span class="risd-label">{{ t('srBreakdownRequired') }}</span>
            <strong v-value-pulse="row.required" class="risd-num" :class="{ 'risd-ok': row.requiredOk }">{{ row.required }}</strong>
          </span>
          <span class="risd-value">
            <span class="risd-label">{{ t('srColToDeposit') }}</span>
            <strong v-value-pulse="row.deposit" class="risd-num">{{ row.deposit }}</strong>
          </span>
        </div>
        <div class="risd-slider-row">
          <input
            type="range"
            min="0"
            :max="Math.max(200, row.percent)"
            step="5"
            :value="row.percent"
            class="risd-slider"
            :aria-label="`${t('srShopsDrawerSliderAria')} ${row.shopName}`"
            data-test="shop-slider"
            @input="$emit('update-percent', { shopId: row.shopId, value: Number($event.target.value) })"
          />
          <!-- Valeur libre au-delà du curseur (retour Bertrand 2026-10-07). -->
          <span class="risd-percent risd-percent-input-wrap">
            <NumberField
              :model-value="row.percent"
              :decimals="0"
              :min="0"
              :aria-label="`${t('srShopsDrawerSliderAria')} ${row.shopName}`"
              class="risd-percent-input"
              data-test="shop-percent-input"
              @change="(v) => v != null && Number(v) !== Number(row.percent) && $emit('update-percent', { shopId: row.shopId, value: Number(v) })"
            />%
          </span>
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
import NumberField from '@/components/common/NumberField.vue'
import { vValuePulse } from '@/composables/useValuePulse'
import { circuitPackNounKey } from '@/utils/restockCircuitDisplay'

export default {
  name: 'RestockItemShopsDrawer',
  components: { EventDrawerShell, NumberField },
  directives: { valuePulse: vValuePulse },
  props: {
    modelValue: { type: Boolean, default: false },
    /**
     * { itemName, itemPercent, totalRequired, totalDeposit, toOrder, rows: [{ shopId,
     *   shopName, predicted, remaining, required, requiredOk, deposit,
     *   percent, overridden, circuit? }], circuit? } (circuit : sortie de
     *   buildItemCircuitDisplay, voir utils/restockCircuitDisplay), ou null quand aucun article n'est ouvert.
     */
    data: { type: Object, default: null },
  },
  emits: ['update:modelValue', 'update-percent', 'reset-percent'],
  setup() {
    const { t } = useI18n()
    return { t }
  },
  methods: {
    /** « N colis » (nom au singulier ou au pluriel selon N). */
    packsText(count) {
      return `${count} ${this.t(circuitPackNounKey(count))}`
    },
    /** Pastilles du circuit d'une carte PDV : cède, reçoit de, prélevé en réserve. */
    badges(row) {
      const c = row.circuit
      if (!c) return []
      const out = []
      if (c.role === 'donor' && c.packs > 0) {
        out.push({ key: 'ceded', kind: 'donor', text: this.t('srCircuitCedes').replace('{packs}', this.packsText(c.packs)) })
      }
      if (c.role === 'receiver') {
        c.counterparts.forEach((cp, i) => {
          out.push({
            key: `from-${i}`,
            kind: 'receiver',
            text: this.t('srCircuitReceives').replace('{packs}', this.packsText(cp.packs)).replace('{shop}', cp.shopName),
          })
        })
      }
      if (c.storagePacks > 0) {
        out.push({
          key: 'storage',
          kind: 'storage',
          text: this.t('srCircuitFromStorage').replace('{packs}', this.packsText(c.storagePacks)),
        })
      }
      return out
    },
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

.risd-circuit {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  padding: 8px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
}

.risd-circuit-line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}

.risd-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
}

.risd-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  line-height: 1.3;
  background: #f3f4f6;
  color: #374151;
}

.risd-badge--donor {
  background: #fff7ed;
  color: #c2410c;
}

.risd-badge--receiver {
  background: #eff6ff;
  color: #1d4ed8;
}

.risd-badge--storage {
  background: #f0fdf4;
  color: #15803d;
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

/* Valeur libre à côté du curseur : champ + « % ». */
.risd-percent-input-wrap {
  width: auto;
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
}
.risd-percent-input {
  width: 52px;
  text-align: right;
  font: inherit;
  color: inherit;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 4px;
  padding: 1px 4px;
  background: transparent;
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
