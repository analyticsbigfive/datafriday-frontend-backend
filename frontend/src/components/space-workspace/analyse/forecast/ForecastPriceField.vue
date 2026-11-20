<template>
  <!-- Nouveau prix TTC d'un Menu Item (euros, >= 0) ; le prix HT dérivé s'affiche dessous. -->
  <ComparisonField :label="t('fcstPriceLabel')" :for-id="id" :hint="hint">
    <input
      :id="id"
      class="fc-num"
      type="number"
      inputmode="decimal"
      min="0"
      step="0.01"
      :value="modelValue"
      :aria-invalid="invalid ? 'true' : undefined"
      @input="emit('update:modelValue', $event.target.value)"
    />
  </ComparisonField>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrencyDetailed } from '@/composables/useFormatters'
import { htFromTtc } from '@/utils/price'
import { fillTemplate } from '@/utils/forecastModificationLabels'
import ComparisonField from '../comparison/ComparisonField.vue'

const props = defineProps({
  id: { type: String, required: true },
  // Saisie brute (chaîne du champ) : vide tant que rien n'est tapé.
  modelValue: { type: [String, Number], default: '' },
  // Taux de TVA du Menu Item choisi, en % (null : pas de HT affiché).
  vatRate: { type: Number, default: null },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const typed = computed(() => (props.modelValue === '' ? null : Number(props.modelValue)))
const invalid = computed(() => typed.value != null && (!Number.isFinite(typed.value) || typed.value < 0))
const hint = computed(() => {
  if (invalid.value) return t('fcstPriceInvalid')
  if (typed.value == null || !(props.vatRate > 0)) return ''
  return fillTemplate(t('fcstPriceHt'), { price: formatCurrencyDetailed(htFromTtc(typed.value, props.vatRate)) })
})
</script>

<style scoped>
.fc-num {
  width: 100%;
  height: 2.375rem;
  box-sizing: border-box;
  padding: 0 0.75rem;
  border: 1px solid var(--cf-line);
  border-radius: 10px;
  background: var(--cf-surface);
  color: var(--cf-fg);
  font: inherit;
  font-size: var(--fs-md);
  font-variant-numeric: tabular-nums;
}
.fc-num:hover { border-color: var(--cf-cmp-line); }
.fc-num:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 1px;
}
.fc-num[aria-invalid='true'] { border-color: var(--cf-warn); }
@media (max-width: 900px) {
  .fc-num { height: 2.75rem; }
}
</style>
