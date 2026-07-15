<template>
  <SpacesPage
    :on-open-space="onOpenSpace"
    :on-new-space="onNewSpace"
    :on-open-notifications="noop"
    :on-open-profile="noop"
    :on-open-menu="noop"
    :on-open-edit-space="noop"
    :on-edit-space-from-settings="noop"
    :on-open-data-integration="noop"
    :on-open-users="noop"
    :on-open-events="onOpenEvents"
    :on-open-hr="noop"
    :on-open-account="noop"
    :on-open-fb-integration="noop"
  />
</template>

<script setup>
import { useRouter } from 'vue-router'
import SpacesPage from '@/components/SpacesPage.vue'
import { clearDemoMode } from '@/utils/demoMode'

const router = useRouter()

function onOpenSpace(spaceId) {
  // Choix explicite d'un vrai espace → purge un flag démo collé qui ferait
  // afficher le mock (Adidas Arena) au lieu de l'espace demandé.
  clearDemoMode()
  router.push(`/spaces/${spaceId}`)
}
function onNewSpace() {
  router.push('/spaces')
}
function onOpenEvents() {
  router.push('/events')
}
function noop() {}
</script>
