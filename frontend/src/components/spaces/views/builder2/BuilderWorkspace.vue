<template>
  <div class="b2-root d-flex flex-column">
    <BuilderHeader />
    <!-- Barre d'activité globale : visible dès qu'une requête est en vol (action
         structurelle, autosave, re-bootstrap) — jamais d'attente réseau sans loader. -->
    <div class="b2-activity">
      <v-progress-linear
        v-if="store.isBusy.value"
        indeterminate
        color="#ff3131"
        height="2"
      />
    </div>

    <!-- Chargement -->
    <div v-if="store.state.loading && !store.state.bootstrapped" class="flex-grow-1 d-flex align-center justify-center">
      <v-progress-circular indeterminate color="#ff3131" size="48" width="4" />
    </div>

    <!-- Erreur bloquante (ex. backend v2 pas encore déployé) -->
    <div v-else-if="store.state.error" class="flex-grow-1 d-flex align-center justify-center pa-8">
      <div class="text-center" style="max-width: 460px;">
        <v-icon icon="mdi-server-off" size="48" color="grey-lighten-1" class="mb-3" />
        <div class="text-subtitle-1 font-weight-medium mb-2">{{ t('b2ErrorLoadTitle') }}</div>
        <div class="text-body-2 text-medium-emphasis mb-4">{{ store.state.error }}</div>
        <v-btn color="#ff3131" variant="flat" rounded="lg" class="text-white" @click="store.bootstrap()">{{ t('b2Retry') }}</v-btn>
      </div>
    </div>

    <!-- État vide : aucune configuration (doc WF-04) -->
    <div v-else-if="store.configsSorted.value.length === 0" class="flex-grow-1 d-flex align-center justify-center pa-8">
      <div class="text-center" style="max-width: 420px;">
        <v-icon icon="mdi-floor-plan" size="56" color="grey-lighten-1" class="mb-3" />
        <div class="text-h6 font-weight-medium mb-1">{{ t('b2EmptyConfigsTitle') }}</div>
        <div class="text-body-2 text-medium-emphasis mb-4">
          {{ t('b2EmptyConfigsBody') }}
        </div>
        <v-btn color="#ff3131" variant="flat" rounded="lg" class="text-white" :loading="creatingFirst" @click="createFirstConfig">
          <v-icon icon="mdi-plus" size="16" class="me-1" /> {{ t('b2CreateConfigCta') }}
        </v-btn>
      </div>
    </div>

    <!-- Espace de travail 3 volets (layout v1 conservé — doc §5).
         Plein écran plan : le plan 2D occupe tout, palette conservée à gauche
         (on doit pouvoir continuer à dessiner), iso + inspecteur masqués. -->
    <div v-else class="b2-grid flex-grow-1" :class="{ 'b2-grid--fullscreen': store.state.isPlanFullscreen }">
      <aside class="b2-left">
        <ZonePanel />
        <v-divider />
        <PalettePanel />
      </aside>

      <main class="b2-center">
        <v-card v-if="!store.state.isPlanFullscreen" rounded="lg" elevation="1" class="b2-pane">
          <IsoView />
        </v-card>
        <v-card rounded="lg" elevation="1" class="b2-pane">
          <PlanCanvas />
        </v-card>
      </main>

      <aside v-if="!store.state.isPlanFullscreen" class="b2-right">
        <InspectorPanel v-if="store.selectedElement.value" />
        <ElementListPanel v-else />
      </aside>
    </div>

    <!-- Notifications du store -->
    <v-snackbar v-model="toastVisible" :color="store.state.toast?.color || 'error'" location="top" rounded="lg" :timeout="5000">
      {{ store.state.toast?.message }}
    </v-snackbar>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, provide } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { getBuilderStore } from './stores/builderStore'
import { useBuilderBootstrap } from './composables/useBuilderBootstrap'
import BuilderHeader from './components/BuilderHeader.vue'
import ZonePanel from './components/panels/ZonePanel.vue'
import PalettePanel from './components/panels/PalettePanel.vue'
import ElementListPanel from './components/panels/ElementListPanel.vue'
import PlanCanvas from './components/canvas/PlanCanvas.vue'
import IsoView from './components/iso/IsoView.vue'
import InspectorPanel from './components/inspector/InspectorPanel.vue'

const props = defineProps({
  spaceId: { type: String, required: true },
})

const { t } = useI18n()
const store = getBuilderStore(props.spaceId)
provide('builderStore', store)
useBuilderBootstrap(store)

// ── Raccourcis clavier : undo/redo ───────────────────────────────────────────
function onKeydown(event) {
  const target = event.target
  if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    store.history.undo()
  } else if (
    ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y')
    || ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'z')
  ) {
    event.preventDefault()
    store.history.redo()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))

// ── Toast ────────────────────────────────────────────────────────────────────
const toastVisible = ref(false)
watch(() => store.state.toast, (toast) => {
  if (toast) toastVisible.value = true
})

// ── Premier lancement : config + RDC en un clic ─────────────────────────────
const creatingFirst = ref(false)
async function createFirstConfig() {
  creatingFirst.value = true
  try {
    await store.createConfig({ name: 'Configuration 1' })
    if (store.zonesSorted.value.length === 0) await store.addZone('FLOOR')
  } catch (err) {
    store.notify(err?.response?.data?.message || t('b2ToastCreateFailedGeneric'))
  } finally {
    creatingFirst.value = false
  }
}
</script>

<style scoped>
.b2-root {
  height: calc(100vh - 64px);
  overflow: hidden;
  background: rgb(var(--v-theme-background));
  animation: b2FadeIn 0.4s ease-out;
}
/* Hauteur RÉSERVÉE (pas de saut de layout quand la barre apparaît/disparaît). */
.b2-activity {
  height: 2px;
  flex-shrink: 0;
}
.b2-grid {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 340px;
  gap: 10px;
  padding: 10px;
  min-height: 0;
}
.b2-left,
.b2-right {
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  overflow-y: auto;
  min-height: 0;
  transition: box-shadow 0.3s ease;
}
.b2-left  { box-shadow:  4px 0 16px rgba(0, 0, 0, 0.05); }
.b2-right { box-shadow: -4px 0 16px rgba(0, 0, 0, 0.05); }

/* Scrollbar fine comme v1 */
.b2-left::-webkit-scrollbar,
.b2-right::-webkit-scrollbar { width: 6px; }
.b2-left::-webkit-scrollbar-track,
.b2-right::-webkit-scrollbar-track { background: transparent; }
.b2-left::-webkit-scrollbar-thumb,
.b2-right::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-on-surface), 0.18);
  border-radius: 3px;
}
.b2-left::-webkit-scrollbar-thumb:hover,
.b2-right::-webkit-scrollbar-thumb:hover { background: rgba(var(--v-theme-on-surface), 0.32); }

.b2-center {
  display: grid;
  grid-template-rows: minmax(0, 2fr) minmax(0, 3fr);
  gap: 10px;
  min-height: 0;
}
.b2-grid--fullscreen {
  grid-template-columns: 280px minmax(0, 1fr);
}
.b2-grid--fullscreen .b2-center {
  grid-template-rows: minmax(0, 1fr);
}
.b2-pane {
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 49, 49, 0.08) !important;
  transition: box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
}
.b2-pane:hover {
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.10) !important;
}

@media (max-width: 1100px) {
  .b2-grid {
    grid-template-columns: 240px minmax(0, 1fr);
  }
  .b2-right {
    display: none;
  }
}

@keyframes b2FadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
</style>
