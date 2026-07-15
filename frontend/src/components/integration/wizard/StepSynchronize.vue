<!--
  @deprecated — Ce composant n'est plus utilisé.
  Remplacé par StepProcessTimeline.vue (Step 4 du wizard IntegrationWizard.vue).
  Ne pas modifier ni réutiliser.
-->
<template>
  <div class="sync-wrap" :class="{ 'sync--dark': false }">

    <!-- ── Gradient Header ── -->
    <div class="sync-header">
      <div class="sync-header__icon">
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
      </div>
      <div class="sync-header__body">
        <p class="sync-header__title">{{ t('intgSyncHeaderTitle') }}</p>
        <p class="sync-header__sub">{{ t('intgSyncHeaderSub') }}</p>
      </div>
      <span class="sync-phase-badge" :class="{
        'sync-phase-badge--gray':   phase === 'idle',
        'sync-phase-badge--amber':  phase === 'syncing',
        'sync-phase-badge--green':  phase === 'done',
        'sync-phase-badge--red':    phase === 'error',
      }">
        {{ phase === 'idle' ? t('intgSyncBadgeReady') : phase === 'syncing' ? t('intgSyncBadgeInProgress') : phase === 'done' ? t('intgSyncBadgeDone') : t('intgSyncBadgeError') }}
      </span>
    </div>

    <!-- ────────────────────────────── IDLE ────────────────────────────── -->
    <template v-if="phase === 'idle'">
      <!-- Info card -->
      <div class="sync-info-card">
        <div class="sync-info-card__icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ff3131" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
        </div>
        <div>
          <p class="sync-info-card__title">{{ t('intgSyncWhatHappens') }}</p>
          <ol class="sync-steps-list">
            <li>{{ t('intgSyncStepCleanup') }}</li>
            <li>{{ t('intgSyncStepReprocess') }}</li>
            <li>{{ t('intgSyncStepDailyAgg') }}</li>
            <li>{{ t('intgSyncStepSummaries') }}</li>
          </ol>
        </div>
      </div>

      <div class="sync-center mt-4">
        <button class="sync-btn sync-btn--primary" :disabled="syncing" @click="handleSync">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          {{ t('intgSyncStartBtn') }}
        </button>
      </div>
    </template>

    <!-- ────────────────────────────── SYNCING ────────────────────────────── -->
    <template v-else-if="phase === 'syncing'">
      <div class="sync-card">
        <!-- Header row -->
        <div class="sync-card__top">
          <div>
            <p class="sync-card__title">{{ t('intgSyncInProgressTitle') }}</p>
            <p class="sync-card__sub">{{ t('intgSyncElapsed') }} {{ elapsedFormatted }} &nbsp;·&nbsp; {{ t('intgSyncEstimate') }}</p>
          </div>
          <span class="sync-pct-badge">{{ overallProgress }}%</span>
        </div>

        <!-- Overall progress bar -->
        <div class="sync-progress-track">
          <div class="sync-progress-fill" :style="{ width: overallProgress + '%' }"></div>
        </div>

        <!-- Phase list -->
        <div class="sync-phases">
          <div
            v-for="(step, idx) in syncSteps"
            :key="step.key"
            class="sync-phase"
            :class="{
              'sync-phase--done':    step.status === 'done',
              'sync-phase--running': step.status === 'running',
              'sync-phase--pending': step.status === 'pending',
            }"
          >
            <!-- Status icon -->
            <div class="sync-phase__icon">
              <v-progress-circular v-if="step.status === 'running'" indeterminate size="18" width="2" color="#ff3131" />
              <span v-else-if="step.status === 'done'" class="sync-phase__check">
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <span v-else class="sync-phase__dot"></span>
            </div>

            <!-- Label + mini bar -->
            <div class="sync-phase__body">
              <div class="sync-phase__label">{{ t('intgSyncPhase') }} {{ idx + 1 }}/4 : {{ step.label }}</div>
              <div v-if="step.status === 'running'" class="sync-phase__bar">
                <div class="sync-phase__bar-fill" :style="{ width: (overallProgress % 25 * 4) + '%' }"></div>
              </div>
            </div>

            <!-- Done chip -->
            <span v-if="step.status === 'done'" class="sync-done-chip">✓</span>
          </div>
        </div>
      </div>
    </template>

    <!-- ────────────────────────────── DONE ────────────────────────────── -->
    <template v-else-if="phase === 'done'">
      <!-- Success banner -->
      <div class="sync-banner sync-banner--green">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
        <span><strong>{{ t('intgSyncDoneTitle') }}</strong> {{ t('intgSyncDoneSub') }}</span>
      </div>

      <!-- Stats cards -->
      <div v-if="result" class="sync-stats">
        <div class="sync-stat-card">
          <p class="sync-stat-card__value">{{ result.eventsProcessed || 0 }}</p>
          <p class="sync-stat-card__label">{{ t('intgSyncStatEvents') }}</p>
        </div>
        <div class="sync-stat-card">
          <p class="sync-stat-card__value">{{ result.transactionsProcessed || 0 }}</p>
          <p class="sync-stat-card__label">{{ t('intgSyncStatTransactions') }}</p>
        </div>
        <div class="sync-stat-card">
          <p class="sync-stat-card__value">{{ result.aggregationsCreated || 0 }}</p>
          <p class="sync-stat-card__label">{{ t('intgSyncStatAggregations') }}</p>
        </div>
      </div>

      <div class="sync-center mt-4">
        <button class="sync-btn sync-btn--primary" @click="$emit('completed')">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          {{ t('intgSyncFinishBtn') }}
        </button>
      </div>
    </template>

    <!-- ────────────────────────────── ERROR ────────────────────────────── -->
    <template v-else-if="phase === 'error'">
      <div class="sync-banner sync-banner--red">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span><strong>{{ t('intgSyncErrorTitle') }}</strong> {{ error }}</span>
      </div>

      <div class="sync-center mt-4">
        <button class="sync-btn sync-btn--ghost" @click="handleRetry">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/></svg>
          {{ t('intgSyncRetryBtn') }}
        </button>
      </div>
    </template>

  </div>
</template>

<script>
import { useSynchronization } from '@/composables/useSynchronization'
import { useI18n } from '@/i18n/useI18n'

export default {
  name: 'StepSynchronize',
  props: {
    location: { type: Object, required: true },
    spaceId: { type: String, required: true },
  },
  emits: ['completed'],
  setup() {
    const { t } = useI18n()
    const {
      loading: syncing, error, result,
      phase: syncPhase,
      startSync, reset: resetSync,
    } = useSynchronization()
    return { t, syncing, error, result, syncPhase, startSync, resetSync }
  },
  data() {
    return {
      phase: 'idle',
      elapsedSeconds: 0,
      timerInterval: null,
    }
  },
  computed: {
    elapsedFormatted() {
      const m = Math.floor(this.elapsedSeconds / 60)
      const s = this.elapsedSeconds % 60
      return `${m}:${String(s).padStart(2, '0')}`
    },
    syncSteps() {
      return [
        { key: 'cleanup',     label: this.t('intgSyncPhaseCleanup'),     status: this.getStepStatus(0) },
        { key: 'processing',  label: this.t('intgSyncPhaseProcessing'),  status: this.getStepStatus(1) },
        { key: 'aggregating', label: this.t('intgSyncPhaseAggregating'), status: this.getStepStatus(2) },
        { key: 'summaries',   label: this.t('intgSyncPhaseSummaries'),   status: this.getStepStatus(3) },
      ]
    },
    overallProgress() {
      if (this.phase === 'done') return 100
      if (this.phase !== 'syncing') return 0
      const currentIdx = this.syncPhase - 1
      if (currentIdx < 0) return 0
      return Math.round(((currentIdx + 0.5) / 4) * 100)
    },
  },
  unmounted() {
    if (this.timerInterval) clearInterval(this.timerInterval)
  },
  methods: {
    getStepStatus(stepIdx) {
      const currentIdx = this.syncPhase - 1
      if (this.phase === 'done') return 'done'
      if (this.phase !== 'syncing') return 'pending'
      if (stepIdx < currentIdx) return 'done'
      if (stepIdx === currentIdx && this.syncing) return 'running'
      return 'pending'
    },
    async handleSync() {
      this.phase = 'syncing'
      this.elapsedSeconds = 0
      this.timerInterval = setInterval(() => this.elapsedSeconds++, 1000)
      try {
        await this.startSync(this.spaceId, this.location.id)
        this.phase = 'done'
      } catch {
        this.phase = 'error'
      } finally {
        clearInterval(this.timerInterval)
        this.timerInterval = null
      }
    },
    handleRetry() {
      this.resetSync()
      this.phase = 'idle'
      this.elapsedSeconds = 0
    },
  },
}
</script>

<style scoped>
/* ── Wrapper ── */
.sync-wrap { padding: 20px 24px; min-height: 100%; background: #f9fafb; }
.sync--dark { background: #111827; color: #e5e7eb; }

/* ── Gradient Header ── */
.sync-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 24px; border-radius: 18px; margin-bottom: 20px;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49,.25);
}
.sync-header__icon {
  width: 46px; height: 46px; border-radius: 12px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.sync-header__body { flex: 1; min-width: 0; }
.sync-header__title { font-size: 16px; font-weight: 700; color: #fff; margin: 0 0 3px; }
.sync-header__sub   { font-size: 12.5px; color: rgba(255,255,255,.72); margin: 0; }

.sync-phase-badge {
  display: inline-flex; align-items: center; padding: 4px 14px;
  border-radius: 100px; font-size: 12px; font-weight: 700;
  white-space: nowrap; flex-shrink: 0;
}
.sync-phase-badge--gray  { background: rgba(0,0,0,.15); color: rgba(255,255,255,.85); }
.sync-phase-badge--amber { background: rgba(245,158,11,.25); color: #fef3c7; }
.sync-phase-badge--green { background: rgba(255,255,255,.22); color: #fff; }
.sync-phase-badge--red   { background: rgba(255,255,255,.15); color: #fecaca; }

/* ── Idle info card ── */
.sync-info-card {
  display: flex; align-items: flex-start; gap: 16px;
  padding: 20px 22px; border-radius: 16px; background: #fff;
  border: 1.5px solid #fecaca;
}
.sync--dark .sync-info-card { background: #1f2937; border-color: #374151; }
.sync-info-card__icon {
  width: 52px; height: 52px; border-radius: 14px; flex-shrink: 0;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  display: flex; align-items: center; justify-content: center;
}
.sync-info-card__title { font-size: 14px; font-weight: 700; color: #111827; margin: 0 0 10px; }
.sync--dark .sync-info-card__title { color: #f3f4f6; }
.sync-steps-list {
  margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px;
  font-size: 13px; color: #6b7280; line-height: 1.5;
}
.sync-steps-list li { padding-left: 2px; }

/* ── Main syncing card ── */
.sync-card {
  padding: 20px 22px; border-radius: 16px; background: #fff;
  border: 1.5px solid #e5e7eb;
}
.sync--dark .sync-card { background: #1f2937; border-color: #374151; }

.sync-card__top {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 12px; margin-bottom: 14px;
}
.sync-card__title { font-size: 15px; font-weight: 700; color: #111827; margin: 0 0 4px; }
.sync--dark .sync-card__title { color: #f3f4f6; }
.sync-card__sub { font-size: 12px; color: #6b7280; margin: 0; }

.sync-pct-badge {
  flex-shrink: 0; padding: 4px 12px; border-radius: 100px;
  background: #fef2f2; color: #ff3131; font-size: 13px; font-weight: 700;
}

/* ── Overall progress bar ── */
.sync-progress-track {
  height: 6px; border-radius: 100px; background: #f3f4f6; overflow: hidden; margin-bottom: 18px;
}
.sync--dark .sync-progress-track { background: #374151; }
.sync-progress-fill {
  height: 100%; border-radius: 100px;
  background: linear-gradient(90deg, #ff3131, #b91c1c);
  transition: width .4s ease;
}

/* ── Phase list ── */
.sync-phases { display: flex; flex-direction: column; gap: 12px; }

.sync-phase {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 14px; border-radius: 12px; border: 1.5px solid #e5e7eb;
  background: #f9fafb; transition: border-color .18s, background .18s;
}
.sync--dark .sync-phase { background: #111827; border-color: #374151; }
.sync-phase--done    { border-color: #bbf7d0; background: #f0fdf4; }
.sync-phase--running { border-color: #fecaca; background: #fff; }
.sync-phase--pending { opacity: .5; }
.sync--dark .sync-phase--done { background: #052e16; border-color: #166534; }

.sync-phase__icon {
  width: 22px; height: 22px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
}
.sync-phase__check {
  width: 20px; height: 20px; border-radius: 50%;
  background: #16a34a; display: flex; align-items: center; justify-content: center;
}
.sync-phase__dot {
  width: 10px; height: 10px; border-radius: 50%;
  border: 2px solid #d1d5db; display: block;
}

.sync-phase__body { flex: 1; min-width: 0; }
.sync-phase__label { font-size: 13px; font-weight: 500; color: #111827; }
.sync--dark .sync-phase__label { color: #e5e7eb; }
.sync-phase--done .sync-phase__label { color: #166534; font-weight: 600; }
.sync--dark .sync-phase--done .sync-phase__label { color: #86efac; }

.sync-phase__bar {
  height: 3px; border-radius: 100px; background: #fecaca; overflow: hidden; margin-top: 5px;
}
.sync-phase__bar-fill {
  height: 100%; border-radius: 100px; background: #ff3131; transition: width .3s ease;
}

.sync-done-chip {
  padding: 2px 8px; border-radius: 100px;
  background: #dcfce7; color: #16a34a; font-size: 11px; font-weight: 700;
  flex-shrink: 0;
}

/* ── Banners ── */
.sync-banner {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 18px; border-radius: 14px; font-size: 13.5px; margin-bottom: 16px;
}
.sync-banner--green { background: #f0fdf4; border: 1.5px solid #bbf7d0; color: #166534; }
.sync-banner--red   { background: #fef2f2; border: 1.5px solid #fecaca; color: #ff3131; }

/* ── Stats cards ── */
.sync-stats {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
}
.sync-stat-card {
  padding: 18px 16px; border-radius: 16px; background: #fff;
  border: 1.5px solid #e5e7eb; text-align: center;
}
.sync--dark .sync-stat-card { background: #1f2937; border-color: #374151; }
.sync-stat-card__value {
  font-size: 28px; font-weight: 800; color: #ff3131; margin: 0 0 4px;
  background: linear-gradient(135deg, #ff3131, #b91c1c);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.sync-stat-card__label { font-size: 11.5px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: .5px; margin: 0; }

/* ── Centered action area ── */
.sync-center { display: flex; justify-content: center; }

/* ── Buttons ── */
.sync-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 11px 26px; border-radius: 100px; font-size: 14px; font-weight: 600;
  cursor: pointer; border: none; transition: all .2s; line-height: 1.4;
}
.sync-btn:disabled { opacity: .45; cursor: not-allowed; }
.sync-btn--primary {
  background: #ff3131; color: #fff;
  box-shadow: 0 4px 18px rgba(255, 49, 49,.3);
}
.sync-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 24px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.sync-btn--ghost { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.sync-btn--ghost:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; }
</style>
