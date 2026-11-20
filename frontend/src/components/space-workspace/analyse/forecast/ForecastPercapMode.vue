<template>
  <!-- Deux façons de lire un Percap en hausse ou en baisse (boutons radio, un seul actif). -->
  <div class="fc-modes" role="radiogroup" :aria-labelledby="labelledby">
    <label
      v-for="m in modes"
      :key="m.value"
      class="fc-mode"
      :class="{ 'fc-mode--on': modelValue === m.value }"
    >
      <input
        type="radio"
        class="fc-mode__radio"
        :name="name"
        :value="m.value"
        :checked="modelValue === m.value"
        @change="emit('update:modelValue', m.value)"
      />
      <span class="fc-mode__txt">{{ m.label }}</span>
    </label>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { PERCAP_MODES } from '@/utils/forecastModificationModel'

defineProps({
  // Mode choisi (null tant que rien n'est choisi).
  modelValue: { type: String, default: null },
  // Nom du groupe de radios (unique dans la page).
  name: { type: String, required: true },
  labelledby: { type: String, default: undefined },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const modes = computed(() => [
  { value: PERCAP_MODES.TRANSFORMATION, label: t('fcstPercapModeTransformation') },
  { value: PERCAP_MODES.BASKET, label: t('fcstPercapModeBasket') },
])
</script>

<style scoped>
.fc-modes { display: flex; flex-direction: column; gap: 0.5rem; }
.fc-mode {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-height: 2.75rem;
  box-sizing: border-box;
  padding: 0.375rem 0.75rem;
  border: 1px solid var(--cf-line);
  border-radius: 10px;
  background: var(--cf-surface);
  font-size: var(--fs-base);
  line-height: 1.35;
  cursor: pointer;
}
.fc-mode:hover { background: var(--cf-surface2); }
.fc-mode--on {
  border-color: var(--cf-cmp);
  background: var(--cf-cmp-bg);
}
.fc-mode__radio {
  flex: none;
  width: 1.125rem;
  height: 1.125rem;
  margin: 0;
  accent-color: var(--cf-cmp);
}
.fc-mode:focus-within {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 2px;
}
.fc-mode__txt { min-width: 0; overflow-wrap: anywhere; }
</style>
