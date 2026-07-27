<template>
  <div v-if="canUse" class="lssw-wrap">
    <button
      class="lssw-fab"
      :title="t('anLiveSimulateBtn')"
      :aria-label="t('anLiveSimulateBtn')"
      @click="openDialog"
    >
      <v-icon size="20">mdi-flask-outline</v-icon>
    </button>

    <div v-if="lastElementId" class="lssw-purge">
      <button type="button" class="lssw-purge-btn" :disabled="purging" @click="purgeLast">
        <v-icon size="14" class="mr-1">mdi-delete-sweep-outline</v-icon>
        {{ t('anLiveSimulatePurge') }} {{ lastElementName }}
      </button>
    </div>

    <LogisticSimulateSaleDialog
      v-model="dialogOpen"
      :shops="shops"
      :saving="saving"
      :purging="false"
      :error="error"
      :result="null"
      @submit="onSubmit"
    />

    <v-snackbar v-model="snackbar" :timeout="3000" color="success">{{ snackbarText }}</v-snackbar>
  </div>
</template>

<script setup>
// Bouton flottant de test du module Live (docs/modules/11_LIVE.md) : réutilise TEL
// QUEL le mécanisme QA existant du module Logistique (`simulateSale`/
// `purgeSimulatedSales`, backend `logistics.service.ts`) — une vraie transaction est
// écrite en base (table WeezeventTransaction), taguée `metadata.isSimulated=true`,
// consommée par le pipeline réel (event-timeline, live-status, getStock) exactement
// comme une vraie vente. Le PDV choisi doit déjà être mappé à une intégration réelle
// (Weezevent ou Digifood) et le menu item déjà mappé à un produit — sinon le backend
// refuse explicitement. Purge scopée par PDV, comme dans Logistique.
import { ref, computed } from 'vue'
import LogisticSimulateSaleDialog from '@/components/LogisticSimulateSaleDialog.vue'
import { useI18n } from '@/i18n/useI18n'
import store from '@/store'

const props = defineProps({
  spaceId: { type: String, required: true },
})
const emit = defineEmits(['simulated'])

const { t } = useI18n()

// Même garde que le bouton équivalent dans SpaceLogisticView.vue (canReconcile) —
// le endpoint backend l'exige de toute façon, pas la peine d'élargir la permission
// juste pour ce point d'entrée.
const canUse = computed(() => store.getters['auth/can']('front.fb.logisticReconcile'))
const shops = computed(() => store.getters['logistics/shopElements'] || [])

const dialogOpen = ref(false)
const saving = ref(false)
const purging = ref(false)
const error = ref(null)
const lastElementId = ref(null)
const lastElementName = ref(null)
const snackbar = ref(false)
const snackbarText = ref('')

async function openDialog() {
  error.value = null
  // Paresseux : ne charge le référentiel Logistique que si l'utilisateur n'a pas
  // déjà visité l'écran Logistique cette session (évite un chargement systématique
  // à chaque visite de l'écran Live).
  if (!shops.value.length) {
    await store.dispatch('logistics/loadStock', { spaceId: props.spaceId })
  }
  dialogOpen.value = true
}

async function onSubmit({ elementId, lines }) {
  saving.value = true
  error.value = null
  try {
    const res = await store.dispatch('logistics/simulateSale', { spaceId: props.spaceId, elementId, lines })
    lastElementId.value = elementId
    lastElementName.value = res?.elementName || shops.value.find((s) => s.element.id === elementId)?.element?.name || ''
    dialogOpen.value = false
    snackbarText.value = t('anLiveSimulateDone')
    snackbar.value = true
    emit('simulated')
  } catch (e) {
    error.value = e?.response?.data?.message || e?.userMessage || t('anLiveSimulateError')
  } finally {
    saving.value = false
  }
}

async function purgeLast() {
  if (!lastElementId.value) return
  purging.value = true
  try {
    await store.dispatch('logistics/purgeSimulatedSales', { spaceId: props.spaceId, elementId: lastElementId.value })
    snackbarText.value = t('anLiveSimulatePurged')
    snackbar.value = true
    lastElementId.value = null
    lastElementName.value = null
    emit('simulated')
  } catch (e) {
    error.value = t('anLiveSimulatePurgeError')
  } finally {
    purging.value = false
  }
}
</script>

<style scoped>
.lssw-wrap {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
}
.lssw-fab {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: #ff3131;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
}
.lssw-fab:hover {
  filter: brightness(1.05);
}
.lssw-purge {
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  border-radius: 8px;
  padding: 4px 8px;
}
.lssw-purge-btn {
  border: none;
  background: transparent;
  color: #fff;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 2px 4px;
}
.lssw-purge-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
