<template>
  <div v-if="canUse" class="lssw-wrap">
    <div v-if="!hasLiveEvent" class="lssw-no-event">
      <v-icon size="14" class="mr-1">mdi-calendar-alert-outline</v-icon>
      <span>{{ t('anLiveNoEventBanner') }}</span>
      <button type="button" class="lssw-no-event-btn" @click="createEventOpen = true">
        {{ t('anLiveCreateEventBtn') }}
      </button>
    </div>

    <div class="lssw-auto">
      <label class="lssw-auto-realmode" :title="t('anLiveSimulateRealModeHint')">
        <input type="checkbox" v-model="autoRealMode" :disabled="!!activeRun" />
        {{ t('anLiveSimulateRealMode') }}
      </label>
      <select v-model.number="autoIntervalMs" class="lssw-auto-select" :disabled="!!activeRun">
        <option :value="10000">10s</option>
        <option :value="30000">30s</option>
        <option :value="60000">60s</option>
      </select>
      <button
        type="button"
        class="lssw-auto-btn"
        :class="{ 'lssw-auto-btn--active': !!activeRun }"
        @click="toggleRun"
      >
        <span v-if="activeRun" class="lssw-auto-dot"></span>
        <v-icon size="14" class="mr-1">{{ activeRun ? 'mdi-stop' : 'mdi-play' }}</v-icon>
        {{ activeRun ? t('anLiveSimulateAutoOn') : t('anLiveSimulateAutoOff') }}
      </button>
    </div>

    <div v-if="activeRun" class="lssw-run-status" :class="{ 'lssw-run-status--stale': isStale }">
      <v-icon v-if="isStale" size="12" class="mr-1" :title="t('anLiveSimulateRunStale')">mdi-alert-outline</v-icon>
      {{ activeRun.tickCount }} ventes · {{ lastTickLabel }}
    </div>
    <div v-if="runError" class="lssw-run-error">{{ runError }}</div>

    <div class="lssw-actions-row">
      <button
        class="lssw-fab"
        :title="t('anLiveSimulateBtn')"
        :aria-label="t('anLiveSimulateBtn')"
        @click="openDialog"
      >
        <v-icon size="20">mdi-flask-outline</v-icon>
      </button>
      <button
        type="button"
        class="lssw-history-btn"
        :title="t('anLiveSimulateHistoryBtn')"
        :aria-label="t('anLiveSimulateHistoryBtn')"
        @click="historyOpen = true"
      >
        <v-icon size="18">mdi-history</v-icon>
      </button>
    </div>

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
      :default-real-mode="true"
      @submit="onSubmit"
    />

    <EventFormDrawer
      v-model="createEventOpen"
      mode="create"
      :default-space-id="spaceId"
      :is-dark="true"
      @submitted="onEventCreated"
    />

    <LiveSimulationHistoryDialog v-model="historyOpen" :space-id="spaceId" />

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
//
// Le mode « Auto » (2026-08-03) est désormais 100% piloté côté SERVEUR (BullMQ Job
// Scheduler, LogisticsService.startSimulationRun/stopSimulationRun) — plus un
// setInterval navigateur : un run survit à la fermeture/rechargement de l'onglet,
// est retrouvable/arrêtable depuis n'importe quel chargement de la page (cf.
// loadActiveSimulationRun au montage), et le tirage aléatoire PDV/menu item se fait
// côté backend (LogisticsService.getSimulableShops), plus ici.
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import LogisticSimulateSaleDialog from '@/components/LogisticSimulateSaleDialog.vue'
import EventFormDrawer from '@/components/events/drawers/EventFormDrawer.vue'
import LiveSimulationHistoryDialog from './LiveSimulationHistoryDialog.vue'
import { useI18n } from '@/i18n/useI18n'
import { getSpaceLiveStatus } from '@/api/endpoints/space.api'
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
// `logistics/shopElements` renvoie les éléments à plat ({id,name,type,items,provider}).
// LogisticSimulateSaleDialog (partagé avec SpaceLogisticView.vue) attend la forme
// enveloppée { element:{id,name,provider}, items } — même transformation que
// SpaceLogisticView.vue:571-573 (shopEntries). Sans ça, s.element est undefined
// (crash "Cannot read properties of undefined (reading 'provider')").
const shops = computed(() =>
  (store.getters['logistics/shopElements'] || []).map((e) => ({
    element: { id: e.id, name: e.name, provider: e.provider },
    items: e.items || [],
  })),
)

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

async function onSubmit({ elementId, lines, realMode }) {
  saving.value = true
  error.value = null
  try {
    const res = await store.dispatch('logistics/simulateSale', { spaceId: props.spaceId, elementId, lines, realMode, ensureLiveEvent: true })
    lastElementId.value = elementId
    lastElementName.value = res?.elementName || shops.value.find((s) => s.element.id === elementId)?.element?.name || ''
    dialogOpen.value = false
    snackbarText.value = t('anLiveSimulateDone')
    snackbar.value = true
    emit('simulated')
    refreshLiveEventStatus()
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

// ── Run d'auto-simulation serveur (start/stop/status) ──────────────────────────
const autoIntervalMs = ref(30000)
// Défaut true : le tirage serveur est aléatoire — en mode strict, il resterait
// bloqué en boucle dès le premier article à la config de stock incomplète.
const autoRealMode = ref(true)
const runError = ref(null)
const activeRun = computed(() => store.state.logistics.activeRun)

const RUN_STALE_TICK_MULTIPLIER = 3
const isStale = computed(() => {
  const run = activeRun.value
  if (!run?.lastTickAt) return false
  const elapsed = Date.now() - new Date(run.lastTickAt).getTime()
  return elapsed > RUN_STALE_TICK_MULTIPLIER * (run.intervalMs || autoIntervalMs.value)
})
const lastTickLabel = computed(() => {
  const at = activeRun.value?.lastTickAt
  return at ? new Date(at).toLocaleTimeString() : '—'
})

async function toggleRun() {
  runError.value = null
  try {
    if (activeRun.value) {
      await store.dispatch('logistics/stopSimulationRun', { spaceId: props.spaceId, runId: activeRun.value.id })
      stopStatusPoll()
    } else {
      await store.dispatch('logistics/startSimulationRun', {
        spaceId: props.spaceId,
        intervalMs: autoIntervalMs.value,
        realMode: autoRealMode.value,
      })
      startStatusPoll()
    }
  } catch (e) {
    runError.value = e?.response?.data?.message || e?.userMessage || t('anLiveSimulateRunError')
  }
}

const STATUS_POLL_MS = 5000
let statusPollTimer = null
async function refreshActiveRun() {
  try {
    await store.dispatch('logistics/loadActiveSimulationRun', { spaceId: props.spaceId })
    if (!store.state.logistics.activeRun) stopStatusPoll()
    refreshLiveEventStatus()
  } catch (e) {
    // Best-effort : un raté de poll ne casse pas l'UI, on retente au tick suivant.
  }
}
function startStatusPoll() {
  stopStatusPoll()
  statusPollTimer = setInterval(refreshActiveRun, STATUS_POLL_MS)
}
function stopStatusPoll() {
  if (statusPollTimer) { clearInterval(statusPollTimer); statusPollTimer = null }
}

// ── Création d'event inline (si aucun event live pour cet espace) ──────────────
const hasLiveEvent = ref(true) // optimiste — évite un flash du bandeau avant la 1re vérif
const createEventOpen = ref(false)
async function refreshLiveEventStatus() {
  try {
    const res = await getSpaceLiveStatus(props.spaceId)
    hasLiveEvent.value = !!(res?.isLive && res?.eventId)
  } catch (e) {
    // Best-effort, même garde qu'AnalyseView.vue::applyLiveScope.
  }
}
function onEventCreated() {
  createEventOpen.value = false
  refreshLiveEventStatus()
}

// ── Historique / purge (LiveSimulationHistoryDialog) ────────────────────────────
const historyOpen = ref(false)

onMounted(async () => {
  refreshLiveEventStatus()
  // Reprend l'affichage d'un run déjà actif (démarré avant un reload/fermeture
  // d'onglet, ou depuis un autre onglet/session) — c'est le cœur du point A :
  // le run tourne côté serveur indépendamment de cet onglet, seul l'affichage a
  // besoin d'être resynchronisé.
  try {
    await store.dispatch('logistics/loadActiveSimulationRun', { spaceId: props.spaceId })
    if (store.state.logistics.activeRun) startStatusPoll()
  } catch (e) {
    // Best-effort — le bouton Auto restera juste à l'état "off" si l'appel échoue.
  }
})
// Arrête UNIQUEMENT le poll d'affichage local, jamais le run lui-même — c'est
// précisément le comportement inverse de l'ancien `onBeforeUnmount(stopAuto)`
// (setInterval navigateur), et le point central de la fonctionnalité : fermer cet
// onglet ne doit plus jamais arrêter silencieusement l'auto-simulation.
onBeforeUnmount(stopStatusPoll)
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
  max-width: 320px;
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
.lssw-actions-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.lssw-history-btn {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.lssw-history-btn:hover {
  background: rgba(0, 0, 0, 0.9);
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
.lssw-auto {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(0, 0, 0, 0.75);
  color: #fff;
  border-radius: 8px;
  padding: 4px 6px;
}
.lssw-auto-realmode {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  white-space: nowrap;
  cursor: pointer;
}
.lssw-auto-select {
  background: transparent;
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 6px;
  font-size: 0.72rem;
  padding: 2px 4px;
}
.lssw-auto-btn {
  border: none;
  background: transparent;
  color: #fff;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 6px;
}
.lssw-auto-btn--active {
  background: rgba(255, 49, 49, 0.35);
}
.lssw-auto-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff3131;
  margin-right: 5px;
  animation: lssw-pulse 1.2s ease-in-out infinite;
}
.lssw-run-status {
  background: rgba(0, 0, 0, 0.75);
  color: #cdeccd;
  border-radius: 8px;
  padding: 3px 8px;
  font-size: 0.72rem;
  display: flex;
  align-items: center;
}
.lssw-run-status--stale {
  color: #ffcf7a;
}
.lssw-run-error {
  background: rgba(255, 49, 49, 0.85);
  color: #fff;
  border-radius: 8px;
  padding: 4px 8px;
  font-size: 0.72rem;
  max-width: 280px;
}
.lssw-no-event {
  background: rgba(0, 0, 0, 0.8);
  color: #ffcf7a;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.72rem;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: 300px;
}
.lssw-no-event-btn {
  border: 1px solid rgba(255, 207, 122, 0.6);
  background: transparent;
  color: #ffcf7a;
  border-radius: 6px;
  font-size: 0.7rem;
  padding: 2px 6px;
  cursor: pointer;
  white-space: nowrap;
}
.lssw-no-event-btn:hover {
  background: rgba(255, 207, 122, 0.15);
}
@keyframes lssw-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
