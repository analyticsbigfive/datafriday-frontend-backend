<template>
  <div class="cl" role="status" aria-live="polite">
    <div class="cl__alert">
      <v-icon size="16" class="cl__ico" aria-hidden="true">mdi-progress-download</v-icon>
      <div class="cl__body">
        <span v-if="progress && progress.total > 0">{{ progressText }}</span>
        <span v-else>{{ t('anCmpLoading') }}</span>
        <div
          v-if="progress && progress.total > 0"
          class="cl__bar"
          role="progressbar"
          aria-valuemin="0"
          :aria-valuemax="progress.total"
          :aria-valuenow="progress.loaded"
        >
          <i :style="{ width: pct + '%' }"></i>
        </div>
      </div>
    </div>
    <div class="cl__row" aria-hidden="true">
      <div class="cl__skel cl__skel--kpi"></div>
      <div class="cl__skel cl__skel--kpi"></div>
      <div class="cl__skel cl__skel--kpi"></div>
    </div>
    <div class="cl__skel cl__skel--chart" aria-hidden="true"></div>
    <div class="cl__skel cl__skel--table" aria-hidden="true"></div>
  </div>
</template>

<script setup>
// Chargement du rapport : alerte avec barre de progression x / N (comme l'alerte
// anEventsLoadingProgress du principal) puis squelettes des cartes (aria-live pour l'annonce).
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  // { loaded, total } (useComparisonReport.progress)
  progress: { type: Object, default: null },
})

const { t } = useI18n()
const pct = computed(() => {
  const p = props.progress
  return p && p.total > 0 ? Math.min(100, Math.round((p.loaded / p.total) * 100)) : 0
})
const progressText = computed(() => t('anCmpLoadingProgress')
  .replace('{x}', String(props.progress?.loaded ?? 0))
  .replace('{n}', String(props.progress?.total ?? 0)))
</script>

<style scoped>
.cl { display: flex; flex-direction: column; gap: 14px; }
.cl__alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  background: var(--cr-cmp-bg);
  color: var(--cr-cmp);
  font-size: var(--fs-base);
}
.cl__ico { flex: none; margin-top: 1px; }
.cl__body { flex: 1; min-width: 0; }
.cl__bar {
  height: 6px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 99px;
  background: var(--cr-surface2);
}
.cl__bar i {
  display: block;
  height: 100%;
  border-radius: 99px;
  background: var(--cr-cmp);
  transition: width 0.12s linear;
}
.cl__row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.cl__skel {
  border-radius: 12px;
  background: linear-gradient(90deg, var(--cr-surface2) 25%, var(--cr-line) 50%, var(--cr-surface2) 75%);
  background-size: 200% 100%;
  animation: cl-sh 1.4s ease-in-out infinite;
}
.cl__skel--kpi { height: 92px; }
.cl__skel--chart { height: 300px; }
.cl__skel--table { height: 240px; }
@keyframes cl-sh { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
@media (prefers-reduced-motion: reduce) {
  .cl__skel { animation: none; }
  .cl__bar i { transition: none; }
}
</style>
