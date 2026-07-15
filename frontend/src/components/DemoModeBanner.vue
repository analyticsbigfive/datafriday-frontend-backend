<template>
  <!-- Pilule flottante globale : toggle démo + indicateur permanent.
       ON  → pilule orange « Mode démo actif » (notification persistante).
       OFF → pilule neutre « Démo ». -->
  <div class="demo-pill" :class="{ 'demo-pill-on': demoOn }">
    <v-icon v-if="demoOn" size="16" class="demo-pill-icon">mdi-flask-outline</v-icon>
    <span class="demo-pill-label">{{ demoOn ? 'Mode démo actif' : 'Démo' }}</span>
    <v-switch
      :model-value="demoOn"
      :color="demoOn ? 'white' : '#FF6E40'"
      density="compact"
      hide-details
      inset
      class="demo-pill-switch"
      :aria-label="demoOn ? 'Désactiver le mode démo' : 'Activer le mode démo'"
      @update:model-value="toggleDemo"
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import { isDemoMode, enableDemoMode, disableDemoMode } from '@/utils/demoMode'

const demoOn = ref(isDemoMode())

function toggleDemo(value) {
  // enable/disable rechargent la page (?demo=1 / ?demo=0) → seed/reset propre.
  if (value) enableDemoMode()
  else disableDemoMode()
}

onMounted(() => {
  if (demoOn.value) {
    // Notification style app (vue-sonner) — une fois par session, après le
    // reload déclenché par l'activation.
    try {
      if (!sessionStorage.getItem('analyse_demo_toasted')) {
        toast.warning('Mode démo activé', {
          description: 'Données locales de démonstration (Adidas Arena). Aucune écriture serveur — tout est persisté en local.',
          duration: 6000,
        })
        sessionStorage.setItem('analyse_demo_toasted', '1')
      }
    } catch (_) { /* noop */ }
  } else {
    try { sessionStorage.removeItem('analyse_demo_toasted') } catch (_) { /* noop */ }
  }
})
</script>

<style scoped>
.demo-pill {
  position: fixed;
  left: 16px;
  bottom: 16px;
  z-index: 4000;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px 2px 14px;
  background: #fff;
  border: 1px solid #E5E7EB;
  border-radius: 9999px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.demo-pill-on {
  background: #FF6E40;
  border-color: #FF6E40;
  color: #fff;
}
.demo-pill-icon { color: #fff; }
.demo-pill-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
  white-space: nowrap;
}
.demo-pill-on .demo-pill-label { color: #fff; }
.demo-pill-switch {
  margin: 0;
  flex: 0 0 auto;
}
.demo-pill-switch :deep(.v-selection-control) { min-height: 0; }
</style>
