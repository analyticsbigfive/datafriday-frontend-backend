<template>
  <div v-if="canUse" class="lssw-wrap">
    <div class="lssw-auto">
      <label class="lssw-auto-realmode" :title="t('anLiveSimulateRealModeHint')">
        <input type="checkbox" v-model="autoRealMode" />
        {{ t('anLiveSimulateRealMode') }}
      </label>
      <select v-model.number="autoIntervalMs" class="lssw-auto-select" :disabled="autoRunning">
        <option :value="10000">10s</option>
        <option :value="30000">30s</option>
        <option :value="60000">60s</option>
      </select>
      <button
        type="button"
        class="lssw-auto-btn"
        :class="{ 'lssw-auto-btn--active': autoRunning }"
        @click="toggleAuto"
      >
        <span v-if="autoRunning" class="lssw-auto-dot"></span>
        <v-icon size="14" class="mr-1">{{ autoRunning ? 'mdi-stop' : 'mdi-play' }}</v-icon>
        {{ autoRunning ? t('anLiveSimulateAutoOn') : t('anLiveSimulateAutoOff') }}
      </button>
    </div>

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
      :default-real-mode="true"
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
import { ref, computed, onBeforeUnmount } from 'vue'
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

// ── Mode auto : simule une vente à intervalle réglable, sans ouvrir la dialog ──
const autoIntervalMs = ref(30000)
const autoRunning = ref(false)
// Défaut true : l'auto tire des PDV/items au hasard — en mode strict, il resterait
// bloqué en boucle dès le premier article à la config de stock incomplète.
const autoRealMode = ref(true)
let autoTimer = null

/** Même dérivation que LogisticSimulateSaleDialog.menuItemOptions (usedIn résolu côté serveur). */
function menuItemsForShop(shop) {
  const map = new Map()
  for (const item of shop.items || []) {
    for (const u of item.usedIn || []) {
      if (u?.id && !map.has(u.id)) map.set(u.id, u.name)
    }
  }
  return [...map.entries()].map(([value, title]) => ({ value, title }))
}

function pickRandom(arr) {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null
}

async function autoSimulateOnce() {
  if (!shops.value.length) {
    try {
      await store.dispatch('logistics/loadStock', { spaceId: props.spaceId })
    } catch (e) {
      return // réessaie au tick suivant
    }
  }
  const candidates = shops.value.filter((s) => menuItemsForShop(s).length > 0)
  const shop = pickRandom(candidates)
  if (!shop) return // aucun PDV simulable pour l'instant — réessaie au tick suivant
  const menuItem = pickRandom(menuItemsForShop(shop))
  if (!menuItem) return
  try {
    const res = await store.dispatch('logistics/simulateSale', {
      spaceId: props.spaceId,
      elementId: shop.element.id,
      lines: [{ menuItemId: menuItem.value, quantity: 1 }],
      realMode: autoRealMode.value,
      ensureLiveEvent: true,
    })
    lastElementId.value = shop.element.id
    lastElementName.value = res?.elementName || shop.element.name
    emit('simulated')
  } catch (e) {
    // Best-effort : tirage temporairement non simulable (ex. stock épuisé) — ne
    // stoppe pas la boucle, un autre tirage aléatoire aura lieu au tick suivant.
    console.warn('[LiveSaleSimulatorWidget] auto-simulate KO —', e?.response?.data?.message || e?.message)
  }
}

function startAuto() {
  stopAuto()
  autoRunning.value = true
  autoTimer = setInterval(autoSimulateOnce, autoIntervalMs.value)
}
function stopAuto() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null }
  autoRunning.value = false
}
function toggleAuto() {
  if (autoRunning.value) stopAuto()
  else startAuto()
}

onBeforeUnmount(stopAuto)
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
@keyframes lssw-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}
</style>
