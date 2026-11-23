<template>
  <!-- Bandeau rouge de l'outil Prévision : décochée (défaut), les events passés affichent leurs
       ventes réelles ; cochée, ils affichent leur scénario Event Predict. -->
  <label class="fc-past" :for="id">
    <input
      :id="id"
      class="fc-past__box"
      type="checkbox"
      :checked="modelValue"
      @change="onChange"
    />
    <span class="fc-past__text">{{ t('fcstPastScenarioLabel') }}</span>
  </label>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

defineProps({
  id: { type: String, default: 'fc-past-scenario' },
  modelValue: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

function onChange(event) {
  emit('update:modelValue', event.target.checked)
}
</script>

<style scoped>
.fc-past {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 1.75rem;
  cursor: pointer;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: #ffffff;
}
.fc-past__box {
  width: 1.125rem;
  height: 1.125rem;
  margin: 0;
  flex: none;
  accent-color: #ffffff;
  cursor: pointer;
}
.fc-past__box:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: 2px;
}
.fc-past__text {
  min-width: 0;
  overflow-wrap: anywhere;
}
@media (max-width: 900px) {
  .fc-past { min-height: 2.75rem; }
}
</style>
