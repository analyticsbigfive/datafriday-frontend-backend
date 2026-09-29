<template>
  <!-- Mise à jour de Logistic pour CE point de vente (règle Bertrand 2026-09-29) :
       après l'ouverture des portes, plus aucun recalage automatique, le
       responsable logistique ou l'administrateur pousse PDV par PDV. Monté par
       InventoryShopCard seulement si l'utilisateur a front.fb.logisticReconcile. -->
  <button
    type="button"
    class="plu-btn"
    :title="t('invUpdateLogisticPdv')"
    :aria-label="t('invUpdateLogisticPdv')"
    :disabled="working || !hasCounts"
    @click="onClick"
  >
    <Loader2 v-if="working" :size="14" class="plu-spin" />
    <Warehouse v-else :size="14" />
  </button>

  <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="4000" location="bottom right">
    {{ snackbarText }}
  </v-snackbar>
</template>

<script setup>
import { ref } from 'vue'
import { Loader2, Warehouse } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { confirmDialog } from '@/composables/useConfirmDialog'
import { pushInventoryCountToLogistic } from '@/api/endpoints/inventory.api'

const { t } = useI18n()

const props = defineProps({
  spaceId: { type: String, required: true },
  eventId: { type: String, required: true },
  phase: { type: String, required: true }, // 'pre-event' | 'post-event'
  elementId: { type: String, required: true },
  elementName: { type: String, default: '' },
  // Rien de compté dans ce PDV : rien à pousser, bouton inactif.
  hasCounts: { type: Boolean, default: false },
})

const emit = defineEmits(['updated'])

const working = ref(false)
const snackbar = ref(false)
const snackbarText = ref('')
const snackbarColor = ref('success')

function notify(text, color) {
  snackbarText.value = text
  snackbarColor.value = color
  snackbar.value = true
}

async function onClick() {
  const ok = await confirmDialog({
    title: t('invUpdateLogisticPdvConfirmTitle'),
    message: t('invUpdateLogisticPdvConfirmMsg').replace('{pdv}', props.elementName || ''),
    confirmText: t('invUpdateLogistic'),
    cancelText: t('cancel') || 'Cancel',
    confirmColor: 'deep-orange',
    icon: 'mdi-warehouse',
  })
  if (!ok) return
  working.value = true
  try {
    await pushInventoryCountToLogistic(props.spaceId, props.eventId, props.phase, props.elementId)
    notify(t('invUpdateLogisticPdvSuccess').replace('{pdv}', props.elementName || ''), 'success')
    emit('updated', props.elementId)
  } catch (e) {
    notify(e?.userMessage || e?.response?.data?.message || t('invUpdateLogisticError'), 'error')
  } finally {
    working.value = false
  }
}
</script>

<style scoped>
.plu-btn {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 1.5px solid var(--fb-border, #e5e7eb);
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  cursor: pointer;
  flex-shrink: 0;
}
.plu-btn:hover:not(:disabled) { border-color: #ff3131; color: #ff3131; }
.plu-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.plu-spin { animation: plu-rotate 1s linear infinite; }
@keyframes plu-rotate { to { transform: rotate(360deg); } }
</style>
