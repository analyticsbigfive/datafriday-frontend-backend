<template>
  <!-- « Recompter » ce point de vente en post-event (demande Bertrand 2026-09-29) :
       ses articles repassent à compter, quantités remises à 0 ; la feuille du match
       se met à jour quand il est de nouveau complet. Monté par InventoryShopCard en
       post-event seulement, avec front.fb.logisticReconcile. -->
  <button
    type="button"
    class="prc-btn"
    :title="t('invRecountPdv')"
    :aria-label="t('invRecountPdv')"
    :disabled="working || !hasCounts"
    @click="onClick"
  >
    <Loader2 v-if="working" :size="14" class="prc-spin" />
    <RotateCcw v-else :size="14" />
  </button>

  <v-snackbar v-model="snackbar" :color="snackbarColor" :timeout="4000" location="bottom right">
    {{ snackbarText }}
  </v-snackbar>
</template>

<script setup>
import { ref } from 'vue'
import { Loader2, RotateCcw } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { confirmDialog } from '@/composables/useConfirmDialog'
import { recountInventoryElement } from '@/api/endpoints/inventory.api'

const { t } = useI18n()

const props = defineProps({
  spaceId: { type: String, required: true },
  eventId: { type: String, required: true },
  elementId: { type: String, required: true },
  elementName: { type: String, default: '' },
  // Rien de saisi dans ce PDV : rien à remettre à zéro.
  hasCounts: { type: Boolean, default: false },
})

const emit = defineEmits(['recounted'])

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
    title: t('invRecountPdvConfirmTitle'),
    message: t('invRecountPdvConfirmMsg').replace('{pdv}', props.elementName || ''),
    confirmText: t('invRecountPdv'),
    cancelText: t('cancel') || 'Cancel',
    confirmColor: 'deep-orange',
    icon: 'mdi-restore',
  })
  if (!ok) return
  working.value = true
  try {
    await recountInventoryElement(props.spaceId, props.eventId, props.elementId)
    notify(t('invRecountPdvSuccess').replace('{pdv}', props.elementName || ''), 'success')
    emit('recounted', props.elementId)
  } catch (e) {
    notify(e?.userMessage || e?.response?.data?.message || t('invRecountPdvError'), 'error')
  } finally {
    working.value = false
  }
}
</script>

<style scoped>
.prc-btn {
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
.prc-btn:hover:not(:disabled) { border-color: #ff3131; color: #ff3131; }
.prc-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.prc-spin { animation: prc-rotate 1s linear infinite; }
@keyframes prc-rotate { to { transform: rotate(360deg); } }
</style>
