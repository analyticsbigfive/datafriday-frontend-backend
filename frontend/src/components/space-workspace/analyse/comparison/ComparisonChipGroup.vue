<template>
  <!-- Groupe de puces à sélection multiple (aria-pressed). Pilotée par props + v-model. -->
  <div class="cf-chips" role="group" :aria-labelledby="labelledby">
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      class="cf-chip"
      :aria-pressed="isOn(item.value) ? 'true' : 'false'"
      @click="toggle(item.value)"
    >
      <v-icon v-if="item.icon" size="14" class="cf-chip__ico">{{ item.icon }}</v-icon>{{ item.label }}
    </button>
    <span v-if="!items.length" class="cf-chips__empty">{{ emptyText }}</span>
  </div>
</template>

<script setup>
const props = defineProps({
  // [{ value, label, icon? }] (icon = nom mdi)
  items: { type: Array, default: () => [] },
  modelValue: { type: Array, default: () => [] },
  labelledby: { type: String, default: undefined },
  emptyText: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])

const isOn = (value) => (props.modelValue || []).includes(value)

function toggle(value) {
  const list = [...(props.modelValue || [])]
  const i = list.indexOf(value)
  if (i >= 0) list.splice(i, 1)
  else list.push(value)
  emit('update:modelValue', list)
}
</script>

<style scoped>
.cf-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.cf-chip {
  display: inline-flex;
  align-items: center;
  height: 28px;
  box-sizing: border-box;
  padding: 0 11px;
  border: 1px solid var(--cf-line);
  border-radius: 99px;
  background: var(--cf-surface);
  color: var(--cf-fg);
  font: inherit;
  font-size: var(--fs-sm);
  line-height: 1;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.cf-chip__ico { margin-right: 4px; }
.cf-chip:hover:not(:disabled) { background: var(--cf-surface2); }
.cf-chip[aria-pressed='true'] {
  background: var(--cf-cmp);
  border-color: var(--cf-cmp);
  color: var(--cf-cmp-on);
}
.cf-chip[aria-pressed='true']:hover:not(:disabled) { background: var(--cf-cmp); }
.cf-chip:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 2px;
}
.cf-chip:disabled { cursor: not-allowed; }
.cf-chips__empty {
  font-size: var(--fs-sm);
  color: var(--cf-muted);
}
@media (prefers-reduced-motion: reduce) {
  .cf-chip { transition: none; }
}
/* Mobile : cibles tactiles >= 44 px, les puces passent à la ligne. */
@media (max-width: 900px) {
  .cf-chips { gap: 8px; }
  .cf-chip { min-height: 44px; height: auto; padding: 0 14px; }
}
</style>
