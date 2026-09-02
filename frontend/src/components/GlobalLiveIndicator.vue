<template>
  <button v-if="hasLiveEvents" class="gli-badge" :title="tooltip" @click="goToSpaces">
    <span class="gli-pulse"></span>
    {{ liveSpaceCount > 1 ? liveSpaceCount : '' }} {{ t('anToolLive') }}
  </button>
</template>

<script setup>
import { onBeforeUnmount, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { useGlobalLiveIndicator } from '@/composables/useGlobalLiveIndicator'

// Racine toujours montée (App.vue) : survit à la navigation inter-routes, même pattern
// que SyncJobFloatingWidget.vue. Démarré/arrêté sur (dé)connexion — pas la peine
// d'ouvrir une connexion SSE avant qu'un utilisateur soit authentifié.
const { t } = useI18n()
const router = useRouter()
const store = useStore()
const { hasLiveEvents, liveSpaceCount, start, stop } = useGlobalLiveIndicator()

const tooltip = computed(() => `${liveSpaceCount.value} ${t('anToolLive')}`)

function goToSpaces() {
  router.push('/spaces')
}

watch(
  () => store.getters['auth/userId'],
  (id) => { if (id) start(); else stop() },
  { immediate: true },
)

onBeforeUnmount(stop)
</script>

<style scoped>
.gli-badge {
  position: fixed;
  top: 12px;
  right: 16px;
  z-index: 1500;
  display: flex;
  align-items: center;
  gap: 6px;
  background: #ff3131;
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  letter-spacing: 0.3px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(255, 49, 49, 0.35);
}
.gli-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fff;
  animation: gli-pulse 1.4s ease-in-out infinite;
}
@keyframes gli-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .gli-pulse { animation: none; } }
</style>
