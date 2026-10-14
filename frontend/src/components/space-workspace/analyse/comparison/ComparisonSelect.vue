<template>
  <!-- Liste déroulante native du formulaire de comparaison (rayon 10 px, flèche de la maquette).
       Options plates (`options`) ou groupées (`groups`), option vide facultative. -->
  <select
    :id="id"
    class="cf-fld"
    :value="modelValue"
    :disabled="disabled"
    :aria-describedby="describedby"
    @change="emit('update:modelValue', $event.target.value)"
  >
    <option v-if="emptyLabel" value="" :selected="!modelValue">{{ emptyLabel }}</option>
    <template v-if="groups">
      <optgroup v-for="g in groups" :key="g.key" :label="g.label">
        <option
          v-for="o in g.options"
          :key="o.value"
          :value="o.value"
          :disabled="o.disabled"
          :selected="o.value === modelValue"
        >{{ o.disabled && disabledSuffix ? `${o.label} (${disabledSuffix})` : o.label }}</option>
      </optgroup>
    </template>
    <template v-else>
      <option
        v-for="o in options"
        :key="o.value"
        :value="o.value"
        :disabled="o.disabled"
        :selected="o.value === modelValue"
      >{{ o.disabled && disabledSuffix ? `${o.label} (${disabledSuffix})` : o.label }}</option>
    </template>
  </select>
</template>

<script setup>
defineProps({
  id: { type: String, required: true },
  modelValue: { type: String, default: '' },
  // [{ value, label, disabled? }]
  options: { type: Array, default: () => [] },
  // [{ key, label, options: [{ value, label, disabled? }] }]
  groups: { type: Array, default: null },
  // Libellé de l'option vide (« Tous ») ; absent = pas d'option vide.
  emptyLabel: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  describedby: { type: String, default: undefined },
  // Mention ajoutée au libellé des options désactivées.
  disabledSuffix: { type: String, default: '' },
})
const emit = defineEmits(['update:modelValue'])
</script>

<style scoped>
.cf-fld {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  height: 38px;
  box-sizing: border-box;
  padding: 0 30px 0 12px;
  border: 1px solid var(--cf-line);
  border-radius: 10px;
  background: var(--cf-surface) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%239aa3b0'/%3E%3C/svg%3E") no-repeat right 12px center;
  color: var(--cf-fg);
  font: inherit;
  font-size: var(--fs-md);
  cursor: pointer;
  text-overflow: ellipsis;
}
.cf-fld:hover:not(:disabled) { border-color: var(--cf-cmp-line); }
.cf-fld:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 1px;
}
.cf-fld:disabled { opacity: 0.5; cursor: not-allowed; }
@media (max-width: 900px) {
  .cf-fld { height: 44px; }
}
</style>
