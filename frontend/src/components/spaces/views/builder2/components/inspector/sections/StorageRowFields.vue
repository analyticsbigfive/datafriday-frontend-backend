<template>
  <div class="srf">
    <!-- Stock tampon : champ puis nom du packaging -->
    <div class="srf__buffer">
      <span class="srf__label">{{ t('b2BufferStock') }}</span>
      <input
        class="srf__qty"
        type="number"
        min="0"
        :step="step"
        :value="quantity"
        @change="(e) => emit('quantity', e.target.value)"
      />
      <span v-if="unitLabel" class="srf__unit" :title="unitLabel">{{ unitLabel }}</span>
    </div>

    <!-- Stock min / max sur une seule ligne + jauge -->
    <div class="srf__bounds">
      <label class="srf__field">
        <span>{{ t('b2StockMin') }}</span>
        <input
          class="srf__input"
          type="number"
          min="0"
          :step="step"
          :value="min"
          @change="(e) => emit('min', e.target.value)"
        />
      </label>
      <label class="srf__field">
        <span>{{ t('b2StockMax') }}</span>
        <input
          class="srf__input"
          type="number"
          min="0"
          :step="step"
          :value="max"
          @change="(e) => emit('max', e.target.value)"
        />
      </label>
    </div>
    <div v-if="gauge" class="srf__gauge" :title="gaugeTitle">
      <div class="srf__gauge-fill" :class="{ 'srf__gauge-fill--low': gauge.low }" :style="{ width: gauge.pct + '%' }" />
    </div>
    <div v-if="hint" class="srf__hint">{{ hint }}</div>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

defineProps({
  quantity: { type: [Number, String], default: '' },
  min: { type: [Number, String], default: '' },
  max: { type: [Number, String], default: '' },
  step: { type: String, default: '1' },
  unitLabel: { type: String, default: null },
  hint: { type: String, default: '' },
  gauge: { type: Object, default: null },
  gaugeTitle: { type: String, default: '' },
})
const emit = defineEmits(['quantity', 'min', 'max'])
const { t } = useI18n()
</script>

<style scoped>
.srf { margin-top: 7px; }
.srf__buffer {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}
.srf__label,
.srf__field {
  font-size: var(--fs-xs);
  color: #9ca3af;
}
.srf__label { flex-shrink: 0; }
.srf__qty {
  width: 58px;
  text-align: right;
  font-size: var(--fs-sm);
  font-weight: 500;
  color: #374151;
  background: rgb(var(--v-theme-surface));
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 4px 8px;
  outline: none;
  -moz-appearance: textfield;
}
.srf__unit {
  min-width: 0;
  font-size: var(--fs-xs);
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.srf__bounds {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 7px;
}
.srf__field {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
.srf__input {
  width: 46px;
  text-align: right;
  font-size: var(--fs-xs);
  color: #374151;
  background: rgb(var(--v-theme-surface));
  border: 1px solid #e5e7eb;
  border-radius: 7px;
  padding: 2px 6px;
  outline: none;
  -moz-appearance: textfield;
}
.srf__qty::-webkit-outer-spin-button,
.srf__qty::-webkit-inner-spin-button,
.srf__input::-webkit-outer-spin-button,
.srf__input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.srf__qty:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 2px rgba(255, 49, 49, 0.12);
}
.srf__input:focus { border-color: #ff3131; }
.srf__gauge {
  height: 6px;
  margin-top: 7px;
  border-radius: 100px;
  background: #ececee;
  overflow: hidden;
}
.srf__gauge-fill {
  height: 100%;
  border-radius: 100px;
  background: #10b981;
  transition: width 0.2s ease, background 0.2s ease;
}
.srf__gauge-fill--low { background: #ff3131; }
.srf__hint {
  margin-top: 3px;
  font-size: var(--fs-xs);
  color: #9ca3af;
}
.dark .srf__qty,
.dark .srf__input { color: #d1d5db; border-color: #374151; }
.dark .srf__gauge { background: #374151; }
</style>
