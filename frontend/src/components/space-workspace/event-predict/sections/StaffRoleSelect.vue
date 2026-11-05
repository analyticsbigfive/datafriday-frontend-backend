<template>
  <select
    class="staff-role-select"
    :class="{ 'is-missing': !modelValue }"
    :value="modelValue || ''"
    :disabled="disabled"
    :aria-label="t('epsRoleSelectLabel')"
    @change="$emit('update:modelValue', $event.target.value)"
  >
    <option value="" disabled>{{ t('epsRoleMissing') }}</option>
    <option v-for="r in roles" :key="r.id" :value="r.id">{{ r.name }}</option>
  </select>
</template>

<script setup>
import { t } from '@/i18n'

// Choix du rôle d'une ligne staff ajoutée à la main (créée sans rôle, donc à 0 €).
defineProps({
  modelValue: { type: String, default: null },
  roles: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})
defineEmits(['update:modelValue'])
</script>

<style scoped>
.staff-role-select {
  min-width: 140px; max-width: 220px; padding: 4px 10px; border-radius: 999px;
  border: 1px solid var(--fb-border, #e5e7eb); background: var(--fb-subtle, #fafafa);
  font-size: var(--fs-sm); font-weight: var(--fw-semibold); color: var(--fb-text, #212121);
  cursor: pointer;
}
.staff-role-select.is-missing {
  border-color: rgba(217, 119, 6, 0.5);
  background: var(--fb-warning-soft, #fffbeb);
  color: var(--fb-warning, #d97706);
}
.staff-role-select:focus { outline: none; border-color: #ff3131; }
</style>
