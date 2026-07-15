<template>
  <div class="cbf mb-3">
    <div v-if="label" class="cbf-label">{{ label }}</div>
    <div class="cbf-list">
      <label v-for="opt in items" :key="opt" class="cbf-row">
        <input
          type="checkbox"
          class="cbf-check"
          :checked="(modelValue || []).includes(opt)"
          @change="toggle(opt)"
        />
        <span class="cbf-name">{{ opt }}</span>
        <span v-if="counts" class="cbf-count">{{ counts.get(opt) || 0 }}</span>
      </label>
      <div v-if="!items || !items.length" class="cbf-empty">{{ t('anNoResults') }}</div>
    </div>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  label: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
  counts: { type: Object, default: null }, // Map | null
})
const emit = defineEmits(['update:modelValue'])

function toggle(opt) {
  const list = [...(props.modelValue || [])]
  const idx = list.indexOf(opt)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(opt)
  emit('update:modelValue', list)
}
</script>

<style scoped>
.cbf-label {
  font-size: 10px;
  font-weight: 700;
  color: #ff3131;
  text-transform: uppercase;
  letter-spacing: .6px;
  margin-bottom: 4px;
}
.cbf-list {
  display: flex;
  flex-direction: column;
  max-height: 240px;
  overflow-y: auto;
}
.cbf-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .12s ease;
}
.cbf-row:hover { background: #f9fafb; }
.cbf-check {
  appearance: none;
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 1.5px solid #d1d5db;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  position: relative;
  transition: border-color .15s ease, background .15s ease;
}
.cbf-check:hover { border-color: #ff3131; }
.cbf-check:checked { background: #ff3131; border-color: #ff3131; }
.cbf-check:checked::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 1.5px;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.cbf-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.cbf-count {
  font-size: 13px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.cbf-empty {
  padding: 10px;
  text-align: center;
  font-size: 13px;
  color: #9ca3af;
}
</style>
