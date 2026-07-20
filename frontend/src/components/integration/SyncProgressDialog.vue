<template>
  <v-dialog
    :model-value="open"
    max-width="520"
    persistent
    @update:model-value="!$event && $emit('cancel')"
  >
    <v-card rounded="xl" style="overflow: hidden; padding: 0;">

      <!-- Gradient Header -->
      <div class="spd-header">
        <div class="spd-header__icon-badge">
          <!-- Job mode icons -->
          <template v-if="jobId">
            <v-progress-circular
              v-if="jobData.status !== 'COMPLETED' && jobData.status !== 'FAILED'"
              indeterminate
              color="white"
              size="22"
              width="3"
            />
            <v-icon v-else-if="jobData.status === 'COMPLETED'" color="white" size="24">mdi-check-circle</v-icon>
            <v-icon v-else color="white" size="24">mdi-alert-circle</v-icon>
          </template>
          <!-- Legacy mode icons -->
          <template v-else>
            <v-progress-circular v-if="isRunning" indeterminate color="white" size="22" width="3" />
            <v-icon v-else-if="isAllDone && hasZeroCounts" color="white" size="24">mdi-alert-circle</v-icon>
            <v-icon v-else-if="isAllDone" color="white" size="24">mdi-check-circle</v-icon>
            <v-icon v-else color="white" size="24">mdi-alert-circle</v-icon>
          </template>
        </div>
        <div class="spd-header__text">
          <div class="spd-header__title">
            <template v-if="jobId && jobData.status === 'COMPLETED'">{{ t('intgSyncProgTitleDone') }}</template>
            <template v-else>{{ t('intgSyncProgTitle') }}</template>
          </div>
          <div class="spd-header__sub">
            {{ integrationName }}
            <template v-if="jobId && jobData.fromDate && jobData.toDate">
              <span class="mx-1 opacity-60">•</span>
              <span>{{ t('intgSyncProgFrom') }} {{ formatDateShort(jobData.fromDate) }} {{ t('intgSyncProgTo') }} {{ formatDateShort(jobData.toDate) }}</span>
              <template v-if="jobData.status === 'COMPLETED' && jobData.completedAt && jobData.startedAt">
                <span class="mx-1 opacity-60">•</span>
                <span>{{ t('intgSyncProgDuration') }} {{ formatDuration(jobData.startedAt, jobData.completedAt) }}</span>
              </template>
            </template>
          </div>
        </div>
      </div>

      <v-card-text class="px-6 py-4">
        <!-- ======= MODE JOB (bissection asynchrone) ======= -->
        <template v-if="jobId">
          <!-- Phase 1 : Collecte (masquée quand terminé) -->
          <div v-if="jobData.status !== 'COMPLETED'" class="spd-phase mb-4">
            <div class="spd-phase__header">
              <span class="spd-phase__label">
                <v-icon size="15" class="mr-1" :color="jobData.collectDone ? '#166534' : '#ff3131'">mdi-download-outline</v-icon>
                {{ t('intgSyncProgPhase1Label') }}
              </span>
              <span class="spd-phase__count">
                {{ jobData.totalCollected.toLocaleString('fr-FR') }} {{ t('intgSyncProgTransactions') }}
                <template v-if="jobData.totalChunks > 0">
                  ({{ jobData.processedChunks }}/{{ jobData.totalChunks }} {{ t('intgSyncProgSegments') }})
                </template>
              </span>
            </div>
            <v-progress-linear
              :model-value="jobCollectPct"
              :color="jobData.collectDone ? 'success' : '#ff3131'"
              height="6"
              rounded
              :indeterminate="!jobData.collectDone && jobData.totalChunks === 0"
            />
          </div>

          <!-- Phase 2 : Insertion (masquée quand terminé) -->
          <div v-if="jobData.status !== 'COMPLETED'" class="spd-phase mb-4">
            <div class="spd-phase__header">
              <span class="spd-phase__label">
                <v-icon size="15" class="mr-1" :color="jobData.status === 'COMPLETED' ? '#166534' : '#6b7280'">mdi-database-import-outline</v-icon>
                {{ t('intgSyncProgPhase2Label') }}
              </span>
              <span class="spd-phase__count">
                {{ jobData.totalInserted.toLocaleString('fr-FR') }} / {{ jobData.totalCollected.toLocaleString('fr-FR') }}
              </span>
            </div>
            <v-progress-linear
              :model-value="jobInsertPct"
              :color="jobData.status === 'COMPLETED' ? 'success' : 'secondary'"
              height="6"
              rounded
              :indeterminate="jobData.totalInserted === 0 && jobData.status !== 'COMPLETED'"
            />
          </div>

          <!-- Résumé final COMPLETED -->
          <template v-if="jobData.status === 'COMPLETED'">
            <div class="spd-stat-row mb-2">
              <div class="spd-stat-card spd-stat-card--red">
                <div class="spd-stat-card__value">{{ jobData.totalCollected.toLocaleString('fr-FR') }}</div>
                <div class="spd-stat-card__label">{{ t('intgSyncProgStatCollected') }}</div>
              </div>
              <div class="spd-stat-card spd-stat-card--green">
                <div class="spd-stat-card__value">{{ jobData.totalInserted.toLocaleString('fr-FR') }}</div>
                <div class="spd-stat-card__label">{{ t('intgSyncProgStatNew') }}</div>
              </div>
              <div class="spd-stat-card spd-stat-card--grey">
                <div class="spd-stat-card__value">{{ (jobData.totalCollected - jobData.totalInserted).toLocaleString('fr-FR') }}</div>
                <div class="spd-stat-card__label">{{ t('intgSyncProgStatDuplicates') }}</div>
              </div>
            </div>
          </template>

          <!-- Résumé final FAILED -->
          <div v-if="jobData.status === 'FAILED'" class="spd-alert spd-alert--error mb-3">
            <v-icon size="16" color="#ff3131">mdi-alert-circle-outline</v-icon>
            <span>{{ jobData.errorMessage || t('intgSyncProgSyncFailed') }}</span>
          </div>
        </template>

        <!-- ======= MODE LEGACY (étapes BullMQ) ======= -->
        <div v-else class="sync-steps">
          <div
            v-for="step in steps"
            :key="step.key"
            class="sync-step"
            :class="`sync-step--${step.status}`"
          >
            <!-- Status icon -->
            <div class="sync-step__icon">
              <v-progress-circular
                v-if="step.status === 'running'"
                indeterminate
                color="#ff3131"
                size="20"
                width="2"
              />
              <v-icon v-else-if="step.status === 'done' && step.count > 0" color="success" size="22">mdi-check-circle</v-icon>
              <v-icon v-else-if="step.status === 'done' && step.count === 0" color="warning" size="22">mdi-alert-circle-outline</v-icon>
              <v-icon v-else-if="step.status === 'error'" color="error" size="22">mdi-alert-circle</v-icon>
              <v-icon v-else color="grey-lighten-1" size="22">mdi-circle-outline</v-icon>
            </div>

            <!-- Step info -->
            <div class="sync-step__body flex-grow-1">
              <div class="d-flex align-center justify-space-between mb-1">
                <span
                  class="text-body-2 font-weight-medium"
                  :class="{
                    'text-success': step.status === 'done' && step.count > 0,
                    'text-warning': step.status === 'done' && step.count === 0,
                    'text-error': step.status === 'error',
                    'text-medium-emphasis': step.status === 'pending',
                  }"
                >
                  {{ step.label }}
                </span>
                <div class="d-flex align-center ga-2">
                  <span v-if="step.status === 'done' && step.count != null" class="text-caption text-medium-emphasis">
                    {{ formatCount(step.count) }} {{ t('intgSyncProgInDb') }}
                    <template v-if="step.newCount > 0">(+{{ formatCount(step.newCount) }} {{ t('intgSyncProgNewPlural') }})</template>
                  </span>
                  <span v-if="step.status === 'running' && step.liveCount != null" class="text-caption text-medium-emphasis">
                    {{ formatCount(step.liveCount) }} {{ t('intgSyncProgInDbEllipsis') }}
                  </span>
                  <span v-if="step.status === 'done' && step.duration" class="text-caption text-medium-emphasis">
                    [{{ step.duration }}]
                  </span>
                  <span v-if="step.status === 'running'" class="text-caption text-medium-emphasis">
                    <template v-if="step.progress > 0">
                      {{ step.progress }}%
                    </template>
                    <template v-else>
                      {{ elapsed[step.key] >= 1000 ? Math.floor(elapsed[step.key] / 1000) + 's...' : t('intgSyncProgStarting') }}
                    </template>
                  </span>
                  <span v-if="step.status === 'error'" class="text-caption text-error">
                    {{ step.errorMessage || t('intgSyncProgError') }}
                  </span>
                </div>
              </div>

              <!-- Progress bar -->
              <v-progress-linear
                v-if="step.status === 'running' || step.status === 'done'"
                :model-value="step.status === 'done' ? 100 : (step.progress > 0 ? step.progress : (fakeProgress[step.key] ?? 0))"
                :color="step.status === 'done' ? (step.count > 0 ? 'success' : 'warning') : '#ff3131'"
                height="4"
                rounded
                class="mt-2"
                style="transition: width 0.4s ease, background-color 0.3s ease"
              />
            </div>
          </div>
        </div>

        <!-- Results section (legacy mode, all done) -->
        <template v-if="!jobId && isAllDone && results">
          <div class="spd-divider my-4" />
          <div class="spd-section-label mb-3">{{ t('intgSyncProgDataInDb') }}</div>
          <div class="spd-stat-row mb-2">
            <div class="spd-stat-card spd-stat-card--red">
              <div class="spd-stat-card__value">{{ formatCount(results.transactions) }}</div>
              <div class="spd-stat-card__label">{{ t('intgSyncProgStatTransactions') }}</div>
            </div>
            <div class="spd-stat-card" :class="results.events > 0 ? 'spd-stat-card--blue' : 'spd-stat-card--warn'">
              <div class="spd-stat-card__value">{{ formatCount(results.events) }}</div>
              <div class="spd-stat-card__label">{{ t('intgSyncProgStatEvents') }}</div>
            </div>
            <div class="spd-stat-card" :class="results.products > 0 ? 'spd-stat-card--purple' : 'spd-stat-card--warn'">
              <div class="spd-stat-card__value">{{ formatCount(results.products) }}</div>
              <div class="spd-stat-card__label">{{ t('intgSyncProgStatProducts') }}</div>
            </div>
          </div>
          <div class="spd-stat-row mb-2">
            <div class="spd-stat-card" :class="results.locations > 0 ? 'spd-stat-card--green' : 'spd-stat-card--warn'">
              <div class="spd-stat-card__value">{{ formatCount(results.locations ?? 0) }}</div>
              <div class="spd-stat-card__label">{{ t('intgSyncProgStatLocations') }}</div>
            </div>
            <div class="spd-stat-card" :class="results.merchants > 0 ? 'spd-stat-card--green' : 'spd-stat-card--warn'">
              <div class="spd-stat-card__value">{{ formatCount(results.merchants ?? 0) }}</div>
              <div class="spd-stat-card__label">{{ t('intgSyncProgStatMerchants') }}</div>
            </div>
          </div>

          <div v-if="hasMore" class="spd-alert spd-alert--info mt-3">
            <v-icon size="15" color="#1e40af">mdi-information-outline</v-icon>
            <span>{{ t('intgSyncProgHasMore') }}</span>
          </div>

          <template v-if="unmappedLocations.length > 0">
            <div class="spd-divider my-4" />
            <div class="d-flex align-center justify-space-between mb-2">
              <div class="spd-section-label">{{ t('intgSyncProgLocationsDetected') }} ({{ unmappedLocations.length }})</div>
              <span class="spd-warn-chip">
                <v-icon size="12">mdi-alert</v-icon>
                {{ unmappedLocations.length }} {{ t('intgSyncProgUnmapped') }}
              </span>
            </div>
            <div class="location-list mb-3">
              <div v-for="loc in unmappedLocations" :key="loc.id" class="location-unmapped-item">
                <v-icon size="16" color="warning" class="mr-2">mdi-alert-circle-outline</v-icon>
                <span class="text-body-2">{{ loc.name }}</span>
                <span class="text-caption text-medium-emphasis ml-auto">{{ t('intgSyncProgNotYetMapped') }}</span>
              </div>
            </div>
            <div class="spd-alert spd-alert--warning">
              <v-icon size="15" color="#92400e">mdi-information-outline</v-icon>
              <span>{{ t('intgSyncProgLocationsHint') }}</span>
            </div>
          </template>
        </template>

        <template v-if="!jobId && (!isAllDone || isAllDone)">
          <div class="spd-divider my-4" />
          <div class="spd-meta">
            <div class="spd-meta__row">
              <v-icon size="13" color="#9ca3af" class="mr-1">mdi-calendar-clock</v-icon>
              <span class="spd-meta__label">{{ t('intgSyncProgLastTransaction') }}</span>
              <strong class="spd-meta__val">{{ lastTransactionDate ? formatDate(lastTransactionDate) : t('intgSyncProgUnknown') }}</strong>
            </div>
            <div class="spd-meta__row">
              <v-icon size="13" color="#9ca3af" class="mr-1">mdi-sync</v-icon>
              <span class="spd-meta__label">{{ t('intgSyncProgLastSync') }}</span>
              <strong class="spd-meta__val">{{ lastSyncAt ? formatRelative(lastSyncAt) : t('intgSyncProgNever') }}</strong>
            </div>
          </div>
        </template>
      </v-card-text>

      <!-- Actions -->
      <div class="spd-actions">
        <!-- Job mode actions -->
        <template v-if="jobId">
          <button
            v-if="jobData.status !== 'COMPLETED' && jobData.status !== 'FAILED'"
            class="iw-btn iw-btn--cancel"
            @click="minimizeJob"
          >
            <v-icon size="15" class="me-1">mdi-arrow-collapse-down</v-icon>
            {{ t('intgSyncProgCloseBackground') }}
          </button>
          <template v-if="jobData.status === 'COMPLETED' || jobData.status === 'FAILED'">
            <button class="iw-btn iw-btn--cancel" @click="$emit('done')">
              {{ t('intgSyncProgClose') }}
            </button>
            <button
              v-if="jobData.status === 'COMPLETED'"
              class="iw-btn iw-btn--primary"
              @click="$emit('retry')"
            >
              <v-icon size="15" class="me-1">mdi-refresh</v-icon>
              {{ t('intgSyncProgResyncPeriod') }}
            </button>
          </template>
        </template>

        <!-- Legacy mode actions -->
        <template v-else>
          <button v-if="!isAllDone && !hasError" class="iw-btn iw-btn--cancel" @click="$emit('cancel')">
            {{ t('intgSyncProgCancel') }}
          </button>
          <button v-if="isAllDone || hasError" class="iw-btn iw-btn--cancel" @click="$emit('done')">
            {{ t('intgSyncProgClose') }}
          </button>
          <button v-if="hasError" class="iw-btn iw-btn--primary" @click="$emit('retry')">
            <v-icon size="15" class="me-1">mdi-refresh</v-icon>
            {{ t('intgSyncProgRetrySync') }}
          </button>
          <button v-if="isAllDone && unmappedLocations.length > 0" class="iw-btn iw-btn--primary" @click="$emit('configure-locations')">
            <v-icon size="15" class="me-1">mdi-map-marker-plus</v-icon>
            {{ t('intgSyncProgConfigureLocations') }}
            <v-icon size="15" class="ms-1">mdi-arrow-right</v-icon>
          </button>
        </template>
      </div>

    </v-card>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'

export default {
  name: 'SyncProgressDialog',
  setup() {
    const { t } = useI18n()
    return { t }
  },
  props: {
    open: { type: Boolean, default: false },
    integrationName: { type: String, default: '' },
    steps: {
      type: Array,
      default: () => [],
      // Each step: { key, label, status: 'pending'|'running'|'done'|'error', count, duration, progress, errorMessage }
    },
    lastSyncAt: { type: String, default: null },
    lastTransactionDate: { type: String, default: null },
    results: { type: Object, default: null },
    hasMore: { type: Boolean, default: false },
    unmappedLocations: { type: Array, default: () => [] },
    /** Job mode — lorsque défini, bascule en mode polling bissection */
    jobId: { type: String, default: null },
  },
  emits: ['cancel', 'done', 'configure-locations', 'retry', 'job-minimized'],
  data() {
    return {
      elapsed: {},
      fakeProgress: {},
      _startTimes: {},
      _ticker: null,
      // Job mode state
      jobData: {
        status: 'PENDING',
        totalCollected: 0,
        totalInserted: 0,
        totalChunks: 0,
        processedChunks: 0,
        collectDone: false,
        errorMessage: null,
        startedAt: null,
        completedAt: null,
        fromDate: null,
        toDate: null,
      },
      _pollTimer: null,
    }
  },
  computed: {
    isRunning() {
      return this.steps.some(s => s.status === 'running') && !this.steps.some(s => s.status === 'error')
    },
    isAllDone() {
      return this.steps.length > 0 && this.steps.every(s => s.status === 'done')
    },
    hasZeroCounts() {
      return this.steps.some(s => s.status === 'done' && s.count === 0)
    },
    hasError() {
      return this.steps.some(s => s.status === 'error')
    },
    jobCollectPct() {
      if (this.jobData.collectDone) return 100
      if (this.jobData.totalChunks === 0) return 0
      return Math.min(99, Math.round((this.jobData.processedChunks / this.jobData.totalChunks) * 100))
    },
    jobInsertPct() {
      if (this.jobData.totalCollected === 0) return 0
      return Math.min(100, Math.round((this.jobData.totalInserted / this.jobData.totalCollected) * 100))
    },
  },
  watch: {
    jobId: {
      immediate: true,
      handler(id) {
        this._stopJobPoll()
        if (id) this._startJobPoll(id)
      },
    },
    steps: {
      handler(steps) {
        const hasRunning = steps.some(s => s.status === 'running')
        if (hasRunning) {
          for (const step of steps) {
            if (step.status === 'running' && !this._startTimes[step.key]) {
              this._startTimes[step.key] = Date.now()
            }
          }
          if (!this._ticker) {
            this._ticker = setInterval(() => {
              const now = Date.now()
              const newElapsed = { ...this.elapsed }
              const newFake = { ...this.fakeProgress }
              for (const step of this.steps) {
                if (step.status === 'running') {
                  const ms = now - (this._startTimes[step.key] || now)
                  newElapsed[step.key] = ms
                  newFake[step.key] = Math.min(90, Math.round(90 * (1 - Math.exp(-ms / 30000))))
                }
              }
              this.elapsed = newElapsed
              this.fakeProgress = newFake
            }, 250)
          }
        } else if (this._ticker) {
          clearInterval(this._ticker)
          this._ticker = null
        }
      },
      deep: true,
      immediate: true,
    },
  },
  beforeUnmount() {
    if (this._ticker) clearInterval(this._ticker)
    this._stopJobPoll()
  },
  methods: {
    async _startJobPoll(jobId) {
      const { getWeezeventJobStatus } = await import('@/api/endpoints/aggregation.api.js')
      // Aligné sur le MAX_WAIT_MS de StepProcessTimeline.vue : un job qui n'atteint
      // jamais d'état terminal (worker orphelin…) ne doit pas poller indéfiniment.
      const MAX_WAIT_MS = 10 * 60 * 1000
      const startedPollingAt = Date.now()
      const poll = async () => {
        if (Date.now() - startedPollingAt >= MAX_WAIT_MS) {
          this.jobData = { ...this.jobData, status: 'FAILED', errorMessage: this.t('intgSyncProgTimeout') }
          this._stopJobPoll()
          return
        }
        try {
          const data = await getWeezeventJobStatus(jobId)
          this.jobData = {
            status: data.status,
            totalCollected: data.totalCollected ?? 0,
            totalInserted: data.totalInserted ?? 0,
            totalChunks: data.totalChunks ?? 0,
            processedChunks: data.processedChunks ?? 0,
            collectDone: data.collectDone ?? false,
            errorMessage: data.errorMessage ?? null,
            startedAt: data.startedAt ?? null,
            completedAt: data.completedAt ?? null,
            fromDate: data.fromDate ?? null,
            toDate: data.toDate ?? null,
          }
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            this._stopJobPoll()
          }
        } catch (e) {
          console.error('[SyncProgressDialog] poll error:', e)
        }
      }
      await poll()
      if (this.jobData.status !== 'COMPLETED' && this.jobData.status !== 'FAILED') {
        this._pollTimer = setInterval(poll, 3000)
      }
    },
    _stopJobPoll() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer)
        this._pollTimer = null
      }
    },
    minimizeJob() {
      if (this.jobId) {
        localStorage.setItem('weezevent_active_job_id', this.jobId)
      }
      // Le widget flottant reprend le polling à partir d'ici — sans ça, les deux
      // tourneraient en parallèle sur le même job.
      this._stopJobPoll()
      this.$emit('job-minimized', this.jobId)
      this.$emit('done')
    },
    formatCount(n) {
      if (n == null) return ''
      return n.toLocaleString('fr-FR')
    },
    formatDateShort(dateStr) {
      if (!dateStr) return ''
      const d = new Date(dateStr)
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    },
    formatDuration(startedAt, completedAt) {
      const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
      const totalSec = Math.round(ms / 1000)
      const min = Math.floor(totalSec / 60)
      const sec = totalSec % 60
      if (min > 0) return `${min} min ${sec} sec`
      return `${sec} sec`
    },
    formatRelative(dateStr) {
      const diff = Date.now() - new Date(dateStr).getTime()
      const minutes = Math.floor(diff / 60000)
      if (minutes < 1) return this.t('intgSyncProgRelSecondsAgo')
      if (minutes < 60) return `${this.t('intgSyncProgRelAgo')} ${minutes} min`
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return `${this.t('intgSyncProgRelAgo')} ${hours}h`
      return new Date(dateStr).toLocaleDateString('fr-FR')
    },
    formatDate(dateStr) {
      const d = new Date(dateStr)
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    },
  },
}
</script>

<style scoped>
/* ── Gradient Header ── */
.spd-header {
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.2);
  padding: 22px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.spd-header__icon-badge {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.spd-header__text {
  min-width: 0;
}
.spd-header__title {
  font-size: 16px;
  font-weight: 700;
  color: #fff;
}
.spd-header__sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
  margin-top: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Phase progress blocks ── */
.spd-phase__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.spd-phase__label {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
  display: flex;
  align-items: center;
}
.spd-phase__count {
  font-size: 11.5px;
  color: #9ca3af;
}

/* ── Stat row ── */
.spd-stat-row {
  display: flex;
  gap: 10px;
}
.spd-stat-card {
  flex: 1;
  border-radius: 10px;
  border: 1px solid #e5e7eb;
  padding: 12px 8px;
  text-align: center;
  background: #fafafa;
}
.spd-stat-card__value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1;
}
.spd-stat-card__label {
  font-size: 11px;
  color: #9ca3af;
  margin-top: 4px;
}
.spd-stat-card--red  { background: #fef2f2; border-color: #fecaca; }
.spd-stat-card--red .spd-stat-card__value { color: #ff3131; }
.spd-stat-card--green { background: #f0fdf4; border-color: #bbf7d0; }
.spd-stat-card--green .spd-stat-card__value { color: #166534; }
.spd-stat-card--grey  { background: #f9fafb; border-color: #e5e7eb; }
.spd-stat-card--grey .spd-stat-card__value { color: #6b7280; }
.spd-stat-card--blue  { background: #eff6ff; border-color: #bfdbfe; }
.spd-stat-card--blue .spd-stat-card__value { color: #1e40af; }
.spd-stat-card--purple { background: #f5f3ff; border-color: #ddd6fe; }
.spd-stat-card--purple .spd-stat-card__value { color: #5b21b6; }
.spd-stat-card--warn  { background: #fffbeb; border-color: #fde68a; }
.spd-stat-card--warn .spd-stat-card__value { color: #92400e; }

/* ── Alerts ── */
.spd-alert {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 12.5px;
}
.spd-alert--info    { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
.spd-alert--warning { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
.spd-alert--error   { background: #fef2f2; border: 1px solid #fecaca; color: #ff3131; }

/* ── Section label ── */
.spd-section-label {
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.9px;
  color: #9ca3af;
}
.spd-divider {
  height: 1px;
  background: #f0f0f0;
}
.spd-warn-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  padding: 3px 10px;
  border-radius: 100px;
}

/* ── Meta info ── */
.spd-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.spd-meta__row {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #6b7280;
}
.spd-meta__label {
  margin-right: 4px;
}
.spd-meta__val {
  color: #374151;
}

/* ── Actions bar ── */
.spd-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 24px;
  border-top: 1px solid #f0f0f0;
  flex-wrap: wrap;
}

/* ── Buttons ── */
.iw-btn {
  display: inline-flex;
  align-items: center;
  padding: 9px 20px;
  border-radius: 100px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  white-space: nowrap;
}
.iw-btn--primary {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 14px rgba(255, 49, 49, 0.3);
}
.iw-btn--primary:hover {
  box-shadow: 0 6px 20px rgba(255, 49, 49, 0.4);
  transform: translateY(-1px);
}
.iw-btn--cancel {
  background: transparent;
  border: 1.5px solid #e5e7eb;
  color: #6b7280;
}
.iw-btn--cancel:hover {
  border-color: #9ca3af;
  background: #f3f4f6;
  color: #374151;
}

/* ── Sync steps (legacy) ── */
.sync-steps {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.sync-step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.sync-step__icon {
  width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding-top: 1px;
}
.sync-step__body {
  min-width: 0;
}
.sync-step--pending .sync-step__body span.text-body-2 {
  opacity: 0.5;
}

/* ── Unmapped locations list ── */
.location-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.location-unmapped-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
}
</style>
