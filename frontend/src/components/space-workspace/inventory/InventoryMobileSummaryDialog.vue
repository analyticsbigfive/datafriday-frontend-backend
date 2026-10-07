<template>
  <!-- « Résumé Inventaire » mobile (design Bertrand 2026-10-07) : la colonne de droite
       du bureau (résumé pre et post-event) en plein écran. Le contenu est fourni par
       la vue (slot), qui garde ses données et ses actions. -->
  <v-dialog
    :model-value="modelValue"
    fullscreen
    transition="dialog-bottom-transition"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card class="ims-card">
      <div class="ims-head">
        <span class="ims-title">{{ t('invSummaryBtn') }}</span>
        <v-btn icon variant="text" :aria-label="t('invClose')" @click="$emit('update:modelValue', false)">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>
      <div class="ims-body">
        <slot />
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

defineProps({
  modelValue: { type: Boolean, default: false },
})
defineEmits(['update:modelValue'])

const { t } = useI18n()
</script>

<style scoped>
.ims-card {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.ims-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 16px;
  border-bottom: 1px solid var(--fb-border, #e5e7eb);
}
.ims-title {
  font-weight: 700;
}
.ims-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
</style>
