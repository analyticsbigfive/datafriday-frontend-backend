<template>
  <v-dialog :model-value="modelValue" max-width="440" @update:model-value="$emit('update:modelValue', $event)">
    <v-card>
      <v-card-title class="pmd__title">{{ t('paymentMethodDeleteTitle') }}</v-card-title>
      <v-card-text>
        <p class="pmd__text">{{ t('paymentMethodDeleteConfirm') }} <strong>{{ method?.name }}</strong> ?</p>
        <p class="pmd__hint">{{ t('paymentMethodDeleteSubtitle') }}</p>
        <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mt-3">{{ error }}</v-alert>
      </v-card-text>
      <v-card-actions class="pmd__actions">
        <v-spacer />
        <v-btn variant="text" @click="$emit('update:modelValue', false)">{{ t('cancel') }}</v-btn>
        <v-btn color="error" variant="flat" :loading="loading" @click="$emit('confirm')">{{ t('delete') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

// Confirmation de suppression d'un moyen de paiement (jamais proposée pour un moyen système).
defineProps({
  modelValue: { type: Boolean, default: false },
  method: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
defineEmits(['update:modelValue', 'confirm'])

const { t } = useI18n()
</script>

<style scoped>
.pmd__title {
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
}
.pmd__text {
  margin: 0 0 4px;
  font-size: var(--fs-md);
}
.pmd__hint {
  margin: 0;
  color: #6b7280;
  font-size: var(--fs-base);
}
.pmd__actions {
  padding: 0 24px 16px;
}
</style>
