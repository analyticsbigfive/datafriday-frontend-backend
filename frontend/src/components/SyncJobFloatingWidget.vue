<template>
  <v-card
    v-if="visible"
    class="sync-floating-widget"
    rounded="xl"
    elevation="6"
    width="300"
  >
    <v-card-text class="pa-4">
      <div class="d-flex align-center justify-space-between mb-3">
        <div class="d-flex align-center ga-2">
          <v-progress-circular
            v-if="jobData.status !== 'COMPLETED' && jobData.status !== 'FAILED'"
            indeterminate
            color="primary"
            size="18"
            width="2"
          />
          <v-icon v-else-if="jobData.status === 'COMPLETED'" color="success" size="20">mdi-check-circle</v-icon>
          <v-icon v-else color="error" size="20">mdi-alert-circle</v-icon>
          <span class="text-body-2 font-weight-medium">{{ t('intgSyncProgTitle') }}</span>
        </div>
        <v-btn
          icon
          variant="text"
          size="x-small"
          :aria-label="t('close')"
          @click="dismiss"
        >
          <v-icon size="16">mdi-close</v-icon>
        </v-btn>
      </div>

      <!-- Collecte -->
      <div class="mb-2">
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('sfwCollecting') }}</span>
          <span class="text-caption text-medium-emphasis">{{ formatNumber(jobData.totalCollected) }}</span>
        </div>
        <v-progress-linear
          :model-value="collectPct"
          :color="jobData.collectDone ? 'success' : 'primary'"
          height="4"
          rounded
          :indeterminate="!jobData.collectDone && jobData.totalChunks === 0"
        />
      </div>

      <!-- Insertion -->
      <div class="mb-3">
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">{{ t('sfwInserting') }}</span>
          <span class="text-caption text-medium-emphasis">{{ formatNumber(jobData.totalInserted) }} / {{ formatNumber(jobData.totalCollected) }}</span>
        </div>
        <v-progress-linear
          :model-value="insertPct"
          :color="jobData.status === 'COMPLETED' ? 'success' : 'secondary'"
          height="4"
          rounded
        />
      </div>

      <div v-if="jobData.status === 'COMPLETED'" class="text-caption text-success">
        {{ t('sfwDoneCount').replace('{n}', formatNumber(jobData.totalInserted)) }}
      </div>
      <div v-else-if="jobData.status === 'FAILED'" class="text-caption text-error">
        {{ jobData.errorMessage || t('intgSyncProgSyncFailed') }}
      </div>
      <div v-else class="text-caption text-medium-emphasis">
        {{ t('sfwInProgress').replace('{n}', combinedPct) }}
      </div>
    </v-card-text>
  </v-card>
</template>

<script>
import { getWeezeventJobStatus } from '@/api/endpoints/aggregation.api.js'
import { useI18n } from '@/i18n/useI18n'
import { formatNumber } from '@/composables/useFormatters'

const STORAGE_KEY = 'weezevent_active_job_id'
const POLL_INTERVAL = 5000
const HIDE_AFTER_DONE_MS = 10000

export default {
  name: 'SyncJobFloatingWidget',
  setup() {
    const { t } = useI18n()
    return { t, formatNumber }
  },
  data() {
    return {
      visible: false,
      jobId: null,
      jobData: this.freshJobData(),
      _pollTimer: null,
      _hideTimer: null,
    }
  },
  computed: {
    collectPct() {
      if (this.jobData.collectDone) return 100
      if (this.jobData.totalChunks === 0) return 0
      return Math.min(99, Math.round((this.jobData.processedChunks / this.jobData.totalChunks) * 100))
    },
    insertPct() {
      if (this.jobData.totalCollected === 0) return 0
      return Math.min(100, Math.round((this.jobData.totalInserted / this.jobData.totalCollected) * 100))
    },
    combinedPct() {
      return Math.round((this.collectPct + this.insertPct) / 2)
    },
  },
  mounted() {
    const savedId = localStorage.getItem(STORAGE_KEY)
    if (savedId) {
      this.jobId = savedId
      this.visible = true
      this._startPoll()
    }
    // Le widget vit dans App.vue (persistant inter-routes) : la vue qui démarre un sync
    // ne peut plus l'atteindre par ref, elle relaie via CustomEvent — même convention
    // que locale-changed/theme-changed.
    this._onJobMinimized = (event) => {
      const jobId = event.detail?.jobId
      if (jobId) this.activate(jobId)
    }
    window.addEventListener('weezevent-job-minimized', this._onJobMinimized)
  },
  beforeUnmount() {
    this._stopPoll()
    if (this._hideTimer) clearTimeout(this._hideTimer)
    window.removeEventListener('weezevent-job-minimized', this._onJobMinimized)
  },
  methods: {
    freshJobData() {
      return {
        status: 'PENDING',
        totalCollected: 0,
        totalInserted: 0,
        totalChunks: 0,
        processedChunks: 0,
        collectDone: false,
        errorMessage: null,
      }
    },
    /**
     * Expose this method so parent can activate the widget with a new jobId.
     */
    activate(jobId) {
      this._stopPoll()
      if (this._hideTimer) clearTimeout(this._hideTimer)
      this.jobId = jobId
      this.jobData = this.freshJobData()
      this.visible = true
      localStorage.setItem(STORAGE_KEY, jobId)
      this._startPoll()
    },
    dismiss() {
      this._stopPoll()
      if (this._hideTimer) clearTimeout(this._hideTimer)
      this.visible = false
      localStorage.removeItem(STORAGE_KEY)
    },
    _startPoll() {
      // Timeout d'INACTIVITÉ plutôt que de durée totale : tant que totalCollected/
      // totalInserted/processedChunks progressent, on continue d'attendre — un gros tenant
      // (ex. Auxerre) peut légitimement prendre plus de 10 min. On n'abandonne que si plus
      // aucun progrès n'est constaté pendant MAX_STALL_MS d'affilée (job vraiment bloqué :
      // worker orphelin, insert-worker planté…). Aligné sur SyncProgressDialog.vue /
      // StepProcessTimeline.vue.
      const MAX_STALL_MS = 10 * 60 * 1000
      let lastProgressAt = Date.now()
      let lastProgressSignature = null
      const poll = async () => {
        if (!this.jobId) return
        if (Date.now() - lastProgressAt >= MAX_STALL_MS) {
          this.jobData = { ...this.jobData, status: 'FAILED', errorMessage: this.jobData.errorMessage || this.t('intgSyncProgTimeout') }
          this._stopPoll()
          localStorage.removeItem(STORAGE_KEY)
          this._hideTimer = setTimeout(() => { this.visible = false }, HIDE_AFTER_DONE_MS)
          return
        }
        try {
          const data = await getWeezeventJobStatus(this.jobId)
          const signature = `${data.totalCollected ?? 0}|${data.totalInserted ?? 0}|${data.processedChunks ?? 0}`
          if (signature !== lastProgressSignature) {
            lastProgressSignature = signature
            lastProgressAt = Date.now()
          }
          this.jobData = {
            status: data.status,
            totalCollected: data.totalCollected ?? 0,
            totalInserted: data.totalInserted ?? 0,
            totalChunks: data.totalChunks ?? 0,
            processedChunks: data.processedChunks ?? 0,
            collectDone: data.collectDone ?? false,
            errorMessage: data.errorMessage ?? null,
          }
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            this._stopPoll()
            localStorage.removeItem(STORAGE_KEY)
            this._hideTimer = setTimeout(() => {
              this.visible = false
            }, HIDE_AFTER_DONE_MS)
          }
        } catch (e) {
          console.warn('[SyncJobFloatingWidget] poll error:', e)
        }
      }
      poll()
      this._pollTimer = setInterval(poll, POLL_INTERVAL)
    },
    _stopPoll() {
      if (this._pollTimer) {
        clearInterval(this._pollTimer)
        this._pollTimer = null
      }
    },
  },
}
</script>

<style scoped>
.sync-floating-widget {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 999;
}
</style>
