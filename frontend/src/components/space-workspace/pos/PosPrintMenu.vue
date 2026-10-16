<template>
  <v-menu offset="6">
    <template #activator="{ props: menuProps }">
      <v-btn v-bind="menuProps" variant="outlined" class="pos-print" :disabled="disabled">
        <v-icon size="16" class="mr-1">mdi-printer</v-icon>
        {{ t('posPrintPins') }}
        <v-icon size="16" class="ml-1">mdi-chevron-down</v-icon>
      </v-btn>
    </template>
    <v-list density="compact" min-width="240">
      <v-list-item :disabled="!startedCount" @click="$emit('print', { startedOnly: true })">
        <v-list-item-title>{{ t('posPrintStarted') }}</v-list-item-title>
      </v-list-item>
      <v-list-item :disabled="!allCount" @click="$emit('print', { startedOnly: false })">
        <v-list-item-title>{{ t('posPrintAll') }}</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

// Menu « Imprimer les PIN » : fiches QR + PIN des caisses démarrées ou de tous les PdV avec PIN.
defineProps({
  startedCount: { type: Number, default: 0 },
  allCount: { type: Number, default: 0 },
  disabled: { type: Boolean, default: false },
})
defineEmits(['print'])

const { t } = useI18n()
</script>

<style scoped>
.pos-print {
  height: 38px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: var(--fb-radius-control, 8px);
  background: transparent;
  color: #ffffff;
  font-size: var(--fs-base);
  font-weight: var(--fw-bold);
  text-transform: none;
  letter-spacing: 0;
}
.pos-print:hover {
  background: #ffffff;
  color: #ff3131;
}
.pos-print :deep(.v-icon) {
  color: inherit !important;
}
</style>
