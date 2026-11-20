<template>
  <!-- Portée des modifications : une case. Décochée (défaut), tous les events affichés, passés
       compris ; cochée, seuls les events prédits sont modifiés. La mention dessous dit ce que
       l'état courant fait. -->
  <ComparisonField
    :label="t('fcstScopeLabel')"
    :label-id="`${id}-label`"
    :hint="predictedOnly ? t('fcstScopeHintPredicted') : t('fcstScopeHintAll')"
    :hint-id="`${id}-hint`"
  >
    <label class="fc-scope" :for="id">
      <input
        :id="id"
        class="fc-scope__box"
        type="checkbox"
        :checked="predictedOnly"
        :aria-describedby="`${id}-hint`"
        @change="onChange"
      />
      <span class="fc-scope__text">{{ t('fcstScopePredictedLabel') }}</span>
    </label>
  </ComparisonField>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { FORECAST_SCOPES, isPredictedOnly } from '@/utils/forecastScope'
import ComparisonField from '../comparison/ComparisonField.vue'

const props = defineProps({
  id: { type: String, required: true },
  // 'all' | 'predicted' (utils/forecastScope)
  modelValue: { type: String, default: FORECAST_SCOPES.ALL },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

const predictedOnly = computed(() => isPredictedOnly(props.modelValue))

function onChange(event) {
  emit('update:modelValue', event.target.checked ? FORECAST_SCOPES.PREDICTED : FORECAST_SCOPES.ALL)
}
</script>

<style scoped>
.fc-scope {
  display: inline-flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 2.375rem;
  cursor: pointer;
  font-size: var(--fs-md);
  color: var(--cf-fg);
}
.fc-scope__box {
  width: 1.125rem;
  height: 1.125rem;
  margin: 0;
  flex: none;
  accent-color: var(--cf-cmp);
  cursor: pointer;
}
.fc-scope__box:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 2px;
}
@media (max-width: 900px) {
  .fc-scope { min-height: 2.75rem; }
}
</style>
