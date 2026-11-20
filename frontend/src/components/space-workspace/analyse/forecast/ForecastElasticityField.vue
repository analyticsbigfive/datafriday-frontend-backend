<template>
  <!-- Élasticité prix : un réglage pour toute la liste, de -3 à 0 (0 par défaut). La mention
       dessous traduit la valeur en exemple concret (effet d'une hausse de prix de 10 %). -->
  <ComparisonField :label="t('fcstElasticityLabel')" :for-id="id" :hint="hint" :hint-id="`${id}-hint`">
    <input
      :id="id"
      class="fc-num"
      type="number"
      inputmode="decimal"
      :min="ELASTICITY_MIN"
      :max="ELASTICITY_MAX"
      :step="ELASTICITY_STEP"
      :value="modelValue"
      :aria-describedby="`${id}-hint`"
      @change="onChange"
    />
  </ComparisonField>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { fillTemplate } from '@/utils/forecastModificationLabels'
import {
  ELASTICITY_MAX,
  ELASTICITY_MIN,
  ELASTICITY_STEP,
  clampElasticity,
  priceEffect,
} from '@/utils/forecastElasticity'
import ComparisonField from '../comparison/ComparisonField.vue'

const props = defineProps({
  id: { type: String, required: true },
  modelValue: { type: Number, default: 0 },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

// Valeur hors bornes ou vide : ramenée dans [-3, 0], et le champ affiche la valeur retenue.
function onChange(event) {
  const value = clampElasticity(event.target.value)
  event.target.value = String(value)
  emit('update:modelValue', value)
}

const hint = computed(() => {
  const e = clampElasticity(props.modelValue)
  if (e === 0) return t('fcstElasticityHintZero')
  const change = (priceEffect(1.1, e).quantity - 1) * 100
  const pct = `${change < 0 ? '-' : '+'}${Math.abs(change).toFixed(1).replace('.', ',')} %`
  return fillTemplate(t('fcstElasticityHint'), { pct })
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
@media (max-width: 900px) {
  .fc-num { height: 2.75rem; }
}
</style>
