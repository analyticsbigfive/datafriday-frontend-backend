<template>
  <button
    type="button"
    class="wpt-toggle"
    :aria-label="label"
    :title="label"
    :aria-expanded="open"
    @click="$emit('toggle')"
  >
    <PanelLeftClose v-if="open" :size="22" color="white" />
    <PanelLeftOpen v-else :size="22" color="white" />
  </button>
</template>

<script setup>
// Bouton de repli du panneau latéral gauche, STANDARD sur toutes les pages
// workspace (calqué sur le toggle du bandeau rouge d'Analyse `.av-header`).
// Conçu pour vivre DANS un bandeau rouge (#ff3131) : fond blanc translucide.
import { PanelLeftClose, PanelLeftOpen } from 'lucide-vue-next'

defineProps({
  // Panneau ouvert (true) ou replié (false) — pilote l'icône.
  open: { type: Boolean, default: true },
  label: { type: String, default: '' },
})
defineEmits(['toggle'])
</script>

<style scoped>
.wpt-toggle {
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}
.wpt-toggle:hover { background: rgba(255, 255, 255, 0.32); }
.wpt-toggle:active { transform: scale(0.94); }
.wpt-toggle:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.85); outline-offset: 2px; }
</style>
