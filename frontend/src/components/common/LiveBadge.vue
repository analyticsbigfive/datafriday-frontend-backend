<template>
  <!-- Badge « N Live » dans le flux de l'en-tête (à gauche de la cloche). Il était en
       position fixe par-dessus l'en-tête et masquait l'avatar et les actions de droite. -->
  <button v-if="hasLiveEvents" type="button" class="live-badge" :title="tooltip" @click="goToSpaces">
    <span class="live-badge__pulse"></span>
    {{ liveSpaceCount > 1 ? liveSpaceCount : '' }} {{ t('anToolLive') }}
  </button>
</template>

<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from '@/i18n/useI18n'
import { useGlobalLiveIndicator } from '@/composables/useGlobalLiveIndicator'

// Lecture seule : la connexion SSE est ouverte et fermée par GlobalLiveIndicator.vue
// (racine, liée à l'état auth). Singleton partagé, aucune connexion en plus ici.
const { t } = useI18n()
const router = useRouter()
const { hasLiveEvents, liveSpaceCount } = useGlobalLiveIndicator()

const tooltip = computed(() => `${liveSpaceCount.value} ${t('anToolLive')}`)

function goToSpaces() {
  router.push('/spaces')
}
</script>

<style scoped>
.live-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  gap: 6px;
  margin-right: 8px;
  background: #ff3131;
  color: #fff;
  border: none;
  border-radius: 999px;
  padding: 5px 12px;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  letter-spacing: 0.3px;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(255, 49, 49, 0.35);
}
.live-badge__pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #fff;
  animation: live-badge-pulse 1.4s ease-in-out infinite;
}
@keyframes live-badge-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .live-badge__pulse { animation: none; } }
</style>
