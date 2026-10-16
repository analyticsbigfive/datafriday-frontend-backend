<template>
  <div class="pos-warn" role="note">
    <v-icon size="18" class="pos-warn__icon">mdi-alert-circle-outline</v-icon>
    <div>{{ t('posSourcesWarning') }}</div>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

// Rappel d'exploitation : les ventes de la caisse s'ajoutent aux autres sources du PdV (PLAN piège 2).
const { t } = useI18n()
</script>

<style scoped>
.pos-warn {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-top: 4px;
  padding: 12px 16px;
  border: 1px solid #fde68a;
  border-radius: var(--fb-radius-panel, 12px);
  background: #fffbeb;
  color: #92400e;
  font-size: var(--fs-base);
  line-height: 1.5;
}
.pos-warn__icon {
  flex-shrink: 0;
  margin-top: 1px;
}
</style>
