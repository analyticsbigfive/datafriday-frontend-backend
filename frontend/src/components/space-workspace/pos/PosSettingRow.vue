<template>
  <div class="pos-set">
    <div class="pos-set__text">
      <div class="pos-set__label">{{ label }}</div>
      <div v-if="hint" class="pos-set__hint">{{ hint }}</div>
    </div>
    <slot>
      <v-switch
        :model-value="modelValue"
        color="success"
        density="compact"
        inset
        hide-details
        :disabled="disabled"
        :aria-label="label"
        @update:model-value="$emit('update:modelValue', !!$event)"
      />
    </slot>
  </div>
</template>

<script setup>
// Ligne de réglage de la colonne droite : libellé, aide, interrupteur (ou contrôle en slot).
defineProps({
  label: { type: String, required: true },
  hint: { type: String, default: '' },
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.pos-set {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  border-top: 1px solid var(--fb-border, #e5e7eb);
}
.pos-set__text {
  min-width: 0;
}
.pos-set__label {
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
}
.pos-set__hint {
  color: var(--fb-faint, #9ca3af);
  font-size: var(--fs-sm);
}
</style>
