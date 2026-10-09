<template>
  <!-- Filtre Fournisseur de la Ventilation (maquette Bertrand du 2026-10-09) : liste
       déroulante « Tous les fournisseurs », plusieurs choix possibles. -->
  <v-menu location="bottom end" offset="6" :close-on-content-click="false">
    <template #activator="{ props: menuProps }">
      <button
        type="button"
        class="lss-trigger"
        :class="{ 'lss-trigger--active': modelValue.length }"
        v-bind="menuProps"
        :aria-label="t('logiSupplierFilter')"
      >
        <span class="lss-label">{{ label }}</span>
        <v-icon size="16">mdi-chevron-down</v-icon>
      </button>
    </template>

    <div class="lss-menu">
      <button type="button" class="lss-item" :class="{ 'lss-item--active': !modelValue.length }" @click="$emit('update:modelValue', [])">
        <span class="lss-check" :class="{ 'lss-check--on': !modelValue.length }">
          <v-icon v-if="!modelValue.length" size="13">mdi-check</v-icon>
        </span>
        <span class="lss-name">{{ t('logiSupplierAll') }}</span>
      </button>
      <div class="lss-sep" />
      <button
        v-for="opt in options"
        :key="opt.value"
        type="button"
        class="lss-item"
        :class="{ 'lss-item--active': isChecked(opt.value) }"
        :aria-pressed="isChecked(opt.value)"
        @click="toggle(opt.value)"
      >
        <span class="lss-check" :class="{ 'lss-check--on': isChecked(opt.value) }">
          <v-icon v-if="isChecked(opt.value)" size="13">mdi-check</v-icon>
        </span>
        <span class="lss-name">{{ opt.label || t('logiNoSupplier') }}</span>
      </button>
    </div>
  </v-menu>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  /** supplierOptions (utils/ventilationSuppliers.js) : `{ value, label }`, label null = sans fournisseur. */
  options: { type: Array, default: () => [] },
  /** Valeurs choisies ; vide = tous les fournisseurs. */
  modelValue: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const label = computed(() => {
  const chosen = props.modelValue
  if (!chosen.length) return t('logiSupplierAll')
  if (chosen.length > 1) return t('logiSupplierCount').replace('{n}', String(chosen.length))
  const opt = props.options.find((o) => o.value === chosen[0])
  return opt?.label || t('logiNoSupplier')
})

function isChecked(value) {
  return props.modelValue.includes(value)
}
function toggle(value) {
  emit('update:modelValue', isChecked(value) ? props.modelValue.filter((v) => v !== value) : [...props.modelValue, value])
}
</script>

<style scoped>
.lss-trigger { display: inline-flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 180px; max-width: 260px; padding: 6px 10px 6px 14px; border: 1px solid var(--fb-border, #e5e7eb); border-radius: 10px; background: var(--fb-surface, #fff); color: var(--fb-text, #212121); font-size: var(--fs-sm); font-weight: var(--fw-semibold); cursor: pointer; }
.lss-trigger--active { border-color: #ff3131; color: #ff3131; }
.lss-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lss-menu { width: 280px; max-height: 60vh; overflow-y: auto; background: var(--fb-surface, #fff); border: 1px solid var(--fb-border, #e5e7eb); border-radius: 14px; box-shadow: 0 16px 40px rgba(15, 23, 42, .22); padding: 8px; }
.lss-item { width: 100%; box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 8px 10px; border: 0; border-radius: 9px; background: transparent; text-align: left; cursor: pointer; font: inherit; color: inherit; }
.lss-item:hover { background: var(--fb-subtle, #f7f7f8); }
.lss-item--active { background: var(--fb-danger-soft, #fef2f2); }
.lss-check { width: 18px; height: 18px; border-radius: 5px; border: 1.5px solid var(--fb-border-strong, #cbd5e1); display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #fff; }
.lss-check--on { background: #ff3131; border-color: #ff3131; }
.lss-name { font-size: var(--fs-md); font-weight: var(--fw-semibold); color: var(--fb-text, #212121); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lss-sep { height: 1px; background: var(--fb-border, #e5e7eb); margin: 6px 4px; }
</style>
