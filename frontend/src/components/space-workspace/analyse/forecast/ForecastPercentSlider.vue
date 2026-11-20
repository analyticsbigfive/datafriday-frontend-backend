<template>
  <!-- Curseur de variation en % (-100 a +100) : % signé et, quand la valeur de base du
       rapport est connue, la valeur simulée (« 12,40 € → 13,64 € »). -->
  <div class="fc-slider">
    <div class="fc-slider__head">
      <label :for="id" class="fc-slider__lab">{{ label }}</label>
      <b class="fc-slider__pct">{{ pctText }}</b>
    </div>
    <input
      :id="id"
      class="fc-slider__input"
      type="range"
      :min="PCT_MIN"
      :max="PCT_MAX"
      step="1"
      :value="modelValue"
      :aria-valuetext="valueText"
      data-swipe-lock
      @input="onInput"
    />
    <p v-if="resultText" class="fc-slider__res">{{ resultText }}</p>
  </div>
</template>

<script setup>
// Curseur contrôlé (v-model). Le marquage data-swipe-lock empêche le swipe mobile
// Principal / Comparaison de s'activer quand on fait glisser le curseur.
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useNumberFormat } from '@/composables/useNumberFormat'
import { formatCurrencyDetailed } from '@/composables/useFormatters'
import { PCT_MAX, PCT_MIN } from '@/utils/forecastModificationModel'
import { signedPercent, fillTemplate } from '@/utils/forecastModificationLabels'
import { resultingValue } from '@/utils/forecastSliderMeta'

const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  modelValue: { type: Number, default: 0 },
  // Valeur de base du rapport (null : on n'affiche que le %).
  base: { type: Number, default: null },
  // 'currency' (euros) ou 'percent' (points de pourcentage) : format de la valeur de base.
  unit: { type: String, default: null },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const { formatPercentLocale } = useNumberFormat()

const format = (v) => (props.unit === 'percent' ? formatPercentLocale(v, 1) : formatCurrencyDetailed(v))

const pctText = computed(() => signedPercent(props.modelValue))
const result = computed(() => resultingValue(props.base, props.modelValue))
const resultText = computed(() => (
  result.value == null ? '' : `${format(props.base)} → ${format(result.value)}`
))
const valueText = computed(() => (
  result.value == null
    ? pctText.value
    : fillTemplate(t('fcstSliderValueText'), {
      pct: pctText.value,
      from: format(props.base),
      to: format(result.value),
    })
))

function onInput(event) {
  emit('update:modelValue', Number(event.target.value))
}
</script>

<style scoped>
.fc-slider { margin-bottom: 0.875rem; min-width: 0; }
.fc-slider__head {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.25rem 0.5rem;
}
.fc-slider__lab {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  line-height: 1.3;
  color: var(--cf-muted);
}
.fc-slider__pct {
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  color: var(--cf-fg);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.fc-slider__input {
  display: block;
  box-sizing: border-box;
  width: 100%;
  height: 2.75rem;
  margin: 0;
  accent-color: var(--cf-cmp);
}
.fc-slider__input:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 2px;
}
.fc-slider__res {
  margin: 0;
  font-size: var(--fs-base);
  line-height: 1.35;
  color: var(--cf-muted);
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
</style>
