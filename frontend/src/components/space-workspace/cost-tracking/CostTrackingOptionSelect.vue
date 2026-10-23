<template>
  <div class="ct-field">
    <label :for="id">{{ label }}</label>
    <select :id="id" class="ct-select" :value="modelValue || ''" @change="$emit('update:modelValue', $event.target.value || null)">
      <option value="">{{ allLabel }}</option>
      <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
    </select>
    <div v-if="hint" class="ct-field__hint">{{ hint }}</div>
  </div>
</template>

<script setup>
// Liste déroulante « Tous / une valeur » des filtres Fournisseur et Composant.
// options : [{ value, label }]. Émet update:modelValue (null pour « Tous »).
defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  allLabel: { type: String, required: true },
  hint: { type: String, default: '' },
  options: { type: Array, default: () => [] },
  modelValue: { type: String, default: null },
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.ct-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}
.ct-field label {
  color: var(--ct-muted);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
}
.ct-field__hint {
  color: var(--ct-muted);
  font-size: var(--fs-xs);
}
.ct-select {
  width: 100%;
  height: 40px;
  padding: 0 10px;
  border: 1px solid var(--ct-border-strong);
  border-radius: 6px;
  background: var(--ct-surface);
  color: var(--ct-text);
  font-size: var(--fs-md);
}
</style>
