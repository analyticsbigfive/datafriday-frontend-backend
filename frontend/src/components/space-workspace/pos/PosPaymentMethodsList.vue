<template>
  <div class="pos-pm">
    <PosSettingRow
      v-for="method in methods"
      :key="method.id"
      :label="method.name"
      :hint="t('posPaymentKindHint').replace('{kind}', method.kind)"
      :model-value="selectedIds.includes(method.id)"
      :disabled="disabled"
      @update:model-value="$emit('toggle', method.id)"
    />
    <p v-if="!methods.length" class="pos-pm__empty">{{ t('posNoPaymentMethods') }}</p>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import PosSettingRow from './PosSettingRow.vue'

// Moyens de paiement de l'évènement, choisis parmi le référentiel (jamais une liste figée).
defineProps({
  methods: { type: Array, default: () => [] }, // moyens actifs du référentiel
  selectedIds: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
})
defineEmits(['toggle'])

const { t } = useI18n()
</script>

<style scoped>
.pos-pm__empty {
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid var(--fb-border, #e5e7eb);
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-base);
}
</style>
