<template>
  <div class="hr-tabsw" role="tablist">
    <button
      type="button"
      class="hr-tabsw__btn"
      :class="{ 'hr-tabsw__btn--active': active === 'suppliers' }"
      role="tab"
      :aria-selected="active === 'suppliers'"
      @click="$emit('switch', 'suppliers')"
    >
      {{ t('navHrSuppliers') }}
    </button>
    <button
      type="button"
      class="hr-tabsw__btn"
      :class="{ 'hr-tabsw__btn--active': active === 'positions' }"
      role="tab"
      :aria-selected="active === 'positions'"
      @click="$emit('switch', 'positions')"
    >
      {{ t('navHrPositions') }}
    </button>
  </div>
</template>

<script setup>
import { t } from '@/i18n'
import './hrForms.css'

defineProps({ active: { type: String, default: 'suppliers' } })
defineEmits(['switch'])
</script>
