<template>
  <!-- Rien à afficher : le badge « Live » est rendu dans les en-têtes (LiveBadge.vue). -->
</template>

<script setup>
import { onBeforeUnmount, watch } from 'vue'
import { useStore } from 'vuex'
import { useGlobalLiveIndicator } from '@/composables/useGlobalLiveIndicator'

// Cycle de vie de la connexion SSE globale (chantier 379) : « un event est live quelque
// part » et signaux de notification serveur.
// Racine toujours montée (App.vue) : survit à la navigation inter-routes, même pattern
// que SyncJobFloatingWidget.vue. Démarré/arrêté sur (dé)connexion. L'affichage est fait
// par LiveBadge.vue dans chaque en-tête : en position fixe, le badge recouvrait l'avatar
// et les actions de droite de l'en-tête.
const store = useStore()
const { start, stop, onNotification, connected } = useGlobalLiveIndicator()

watch(
  () => store.getters['auth/userId'],
  (id) => { if (id) start(); else stop() },
  { immediate: true },
)

// Notifications serveur portées par ce même flux : rechargement à chaque signal, et poll de
// secours seulement quand le flux est coupé (reconnexion = rattrapage immédiat).
const offNotification = onNotification(() => store.dispatch('serverNotifications/fetch'))
watch(
  () => store.getters['auth/userId'] && connected.value,
  (live) => { if (store.getters['auth/userId']) store.dispatch('serverNotifications/setStreamConnected', !!live) },
  { immediate: true },
)

onBeforeUnmount(() => {
  offNotification()
  stop()
})
</script>
