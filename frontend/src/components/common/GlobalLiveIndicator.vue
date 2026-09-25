<template>
  <!-- Rien à afficher : le badge « Live » est rendu dans les en-têtes (LiveBadge.vue). -->
</template>

<script setup>
import { onBeforeUnmount, watch } from 'vue'
import { useStore } from 'vuex'
import { useGlobalLiveIndicator } from '@/composables/useGlobalLiveIndicator'

// Cycle de vie de la connexion SSE « un event est live quelque part » (chantier 379).
// Racine toujours montée (App.vue) : survit à la navigation inter-routes, même pattern
// que SyncJobFloatingWidget.vue. Démarré/arrêté sur (dé)connexion. L'affichage est fait
// par LiveBadge.vue dans chaque en-tête : en position fixe, le badge recouvrait l'avatar
// et les actions de droite de l'en-tête.
const store = useStore()
const { start, stop } = useGlobalLiveIndicator()

watch(
  () => store.getters['auth/userId'],
  (id) => { if (id) start(); else stop() },
  { immediate: true },
)

onBeforeUnmount(stop)
</script>
