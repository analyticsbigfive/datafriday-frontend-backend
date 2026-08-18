<template>
  <div>
    <div v-if="loading" class="sp-skeleton-page" aria-label="Chargement Event Predict">
      <header class="sp-skeleton-header">
        <span class="sp-skeleton-icon" />
        <div class="sp-skeleton-title">
          <span class="sp-skeleton-line sp-skeleton-line-title" />
          <span class="sp-skeleton-line sp-skeleton-line-short" />
        </div>
      </header>
      <div class="sp-skeleton-body">
        <aside class="sp-skeleton-side">
          <span class="sp-skeleton-line sp-skeleton-line-title" />
          <span v-for="n in 5" :key="`side-${n}`" class="sp-skeleton-card" />
        </aside>
        <main class="sp-skeleton-main">
          <span class="sp-skeleton-panel sp-skeleton-panel-chart" />
          <span class="sp-skeleton-panel" />
          <span class="sp-skeleton-panel" />
        </main>
        <aside class="sp-skeleton-metrics">
          <span v-for="n in 4" :key="`metric-${n}`" class="sp-skeleton-metric" />
        </aside>
      </div>
    </div>

    <v-alert
      v-else-if="error && !space"
      type="warning"
      variant="tonal"
      class="ma-6"
    >
      {{ error }}
    </v-alert>

    <EventPredictView
      v-else-if="space"
      :space="space"
      @close="onClose"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
// PERF: async → EventPredictView sort du chunk partagé 183 ; chargé à l'affichage.
const EventPredictView = defineAsyncComponent(() => import('@/components/space-workspace/event-predict/EventPredictView.vue'))

const route = useRoute()
const router = useRouter()
const store = useStore()

const space = computed(() => store.state.analyse.space)
const loading = computed(() => store.state.analyse.loading)
const error = computed(() => store.state.analyse.error)

onMounted(async () => {
  const { spaceId } = route.params
  // Recharge uniquement si on n'a pas déjà ce space en store
  if (!space.value || space.value.id !== spaceId) {
    await store.dispatch('analyse/loadSpace', spaceId)
  }
})

function onClose() {
  router.push({ name: 'space-analyse', params: { spaceId: route.params.spaceId } })
}
</script>

<style scoped>
.sp-skeleton-page {
  min-height: 100vh;
  background: #F5F5F5;
  color: #212121;
}

.sp-skeleton-header {
  min-height: 104px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  background: #FFFFFF;
  border-bottom: 1px solid #EEEEEE;
}

.sp-skeleton-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
}

.sp-skeleton-title {
  display: grid;
  gap: 8px;
  width: min(360px, 60vw);
}

.sp-skeleton-body {
  display: grid;
  grid-template-columns: 312px minmax(0, 1fr) 360px;
  gap: 16px;
  padding: 18px;
}

.sp-skeleton-side,
.sp-skeleton-main,
.sp-skeleton-metrics {
  display: grid;
  gap: 12px;
}

.sp-skeleton-side,
.sp-skeleton-metrics {
  align-content: start;
}

.sp-skeleton-card,
.sp-skeleton-panel,
.sp-skeleton-metric {
  border: 1px solid #EEEEEE;
  border-radius: 8px;
  background: #FFFFFF;
}

.sp-skeleton-card {
  height: 58px;
}

.sp-skeleton-panel {
  height: 180px;
}

.sp-skeleton-panel-chart {
  height: 340px;
}

.sp-skeleton-metric {
  height: 128px;
}

.sp-skeleton-icon,
.sp-skeleton-line,
.sp-skeleton-card,
.sp-skeleton-panel,
.sp-skeleton-metric {
  background: linear-gradient(90deg, #EEEEEE 0%, #F7F7F7 42%, #EEEEEE 78%);
  background-size: 220% 100%;
  animation: sp-shimmer 1.3s ease-in-out infinite;
}

.sp-skeleton-line {
  display: block;
  height: 10px;
  border-radius: 999px;
}

.sp-skeleton-line-title {
  width: 54%;
  height: 13px;
}

.sp-skeleton-line-short {
  width: 34%;
}

@keyframes sp-shimmer {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}

/* BUG-282 : skeleton clair = premier paint de la route Predict, flash blanc en
   thème sombre. Accroché à .dark (<html>). */
.dark .sp-skeleton-page {
  background: #111827;
  color: #d1d5db;
}
.dark .sp-skeleton-header {
  background: #1f2937;
  border-bottom-color: #374151;
}
.dark .sp-skeleton-card,
.dark .sp-skeleton-panel,
.dark .sp-skeleton-metric {
  border-color: #374151;
}
.dark .sp-skeleton-icon,
.dark .sp-skeleton-line,
.dark .sp-skeleton-card,
.dark .sp-skeleton-panel,
.dark .sp-skeleton-metric {
  background: linear-gradient(90deg, #1f2937 0%, #263548 42%, #1f2937 78%);
  background-size: 220% 100%;
}

@media (max-width: 1100px) {
  .sp-skeleton-body {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .sp-skeleton-header {
    min-height: auto;
    padding: 12px 16px;
  }

  .sp-skeleton-body {
    padding: 12px 16px;
  }
}
</style>
