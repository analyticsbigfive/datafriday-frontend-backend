<template>
  <div class="pos-state" role="status">
    <template v-if="error">
      <AlertCircle :size="40" aria-hidden="true" />
      <p class="pos-state__message">{{ t(messageKey) }}</p>
      <div class="pos-state__actions">
        <button type="button" class="pos-state__btn pos-state__btn--primary" @click="$emit('retry')">{{ t('guestPosRetry') }}</button>
        <button type="button" class="pos-state__btn" @click="$emit('leave')">{{ t('guestPosLeave') }}</button>
      </div>
    </template>
    <template v-else>
      <Loader2 :size="32" class="pos-state__spin" aria-hidden="true" />
      <p class="pos-state__message">{{ t('guestPosLoading') }}</p>
    </template>
  </div>
</template>

<script setup>
// Écran de chargement du catalogue, ou message clair si la caisse est arrêtée, l'évènement
// terminé ou le réseau coupé.
import { computed } from 'vue'
import { AlertCircle, Loader2 } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { posErrorMessageKey } from '@/utils/posErrors'

const props = defineProps({ error: { type: Object, default: null } })
defineEmits(['retry', 'leave'])

const { t } = useI18n()
const messageKey = computed(() => posErrorMessageKey(props.error))
</script>

<style scoped>
.pos-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--pos-muted); padding: 24px; text-align: center; }
.pos-state__message { margin: 0; max-width: 420px; font-size: var(--fs-lg); color: var(--pos-text); line-height: 1.4; }
.pos-state__actions { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.pos-state__btn { min-height: 48px; padding: 0 20px; border-radius: 10px; border: 1px solid var(--pos-border-strong); background: var(--pos-surface); color: var(--pos-text); font-size: var(--fs-md); font-weight: var(--fw-bold); cursor: pointer; }
.pos-state__btn--primary { border: 0; background: var(--pos-accent); color: #fff; }
.pos-state__spin { animation: pos-spin 1s linear infinite; }
@keyframes pos-spin { to { transform: rotate(360deg); } }
</style>
