<template>
  <PosSettingRow :label="t('posLowStockLabel')" :hint="t('posLowStockHint')">
    <input
      type="number"
      class="pos-ls__input"
      min="0"
      max="9999"
      step="1"
      :value="modelValue"
      :disabled="disabled"
      :aria-label="t('posLowStockLabel')"
      @change="onChange"
    />
  </PosSettingRow>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import PosSettingRow from './PosSettingRow.vue'

// Seuil « stock bas » (0 = jamais). Enregistré à la validation du champ, pas à chaque frappe.
const props = defineProps({
  modelValue: { type: Number, default: 5 },
  disabled: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()

function onChange(event) {
  const raw = Number(event.target.value)
  const next = Number.isFinite(raw) ? Math.max(0, Math.min(9999, Math.round(raw))) : props.modelValue
  event.target.value = String(next)
  if (next !== props.modelValue) emit('update:modelValue', next)
}
</script>

<style scoped>
.pos-ls__input {
  width: 72px;
  height: 36px;
  box-sizing: border-box;
  padding: 0 8px;
  border: 1px solid var(--fb-border-strong, #d1d5db);
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-surface, #ffffff);
  color: var(--fb-text, #212121);
  font: inherit;
  font-size: var(--fs-md);
  text-align: right;
}
.pos-ls__input:focus {
  border-color: var(--fb-primary, #d63031);
  outline: none;
}
</style>
