<template>
  <div class="ct-switch">
    <div class="ct-switch__text">
      {{ label }}
      <small v-if="hint">{{ hint }}</small>
    </div>
    <button
      type="button"
      role="switch"
      class="ct-switch__toggle"
      :aria-checked="modelValue"
      :aria-label="label"
      :disabled="disabled"
      @click="$emit('update:modelValue', !modelValue)"
    />
  </div>
</template>

<script setup>
// Interrupteur avec libellé et aide, utilisé dans les options d'affichage.
defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.ct-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 0;
  font-size: var(--fs-md);
}
.ct-switch small {
  display: block;
  color: var(--ct-faint);
  font-size: var(--fs-xs);
}
.ct-switch__toggle {
  position: relative;
  flex: none;
  width: 36px;
  height: 20px;
  border: 0;
  border-radius: 99px;
  background: var(--ct-border-strong);
  cursor: pointer;
  transition: background 120ms;
}
.ct-switch__toggle::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #ffffff;
  transition: transform 120ms;
}
.ct-switch__toggle[aria-checked='true'] {
  background: var(--ct-brand);
}
.ct-switch__toggle[aria-checked='true']::after {
  transform: translateX(16px);
}
.ct-switch__toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
@media (prefers-reduced-motion: reduce) {
  .ct-switch__toggle,
  .ct-switch__toggle::after {
    transition: none;
  }
}
</style>
