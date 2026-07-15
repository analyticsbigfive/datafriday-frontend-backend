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
          <span class="text-body-2 font-weight-medium">Sync Weezevent</span>
        </div>
        <v-btn
          icon
          variant="text"
          size="x-small"
          @click="dismiss"
        >
          <v-icon size="16">mdi-close</v-icon>
        </v-btn>
      </div>

      <!-- Collecte -->
      <div class="mb-2">
        <div class="d-flex justify-space-between mb-1">
          <span class="text-caption text-medium-emphasis">Collecte</span>
          <span class="text-caption text-medium-emphasis">{{ jobData.totalCollected.toLocaleString('fr-FR') }}</span>
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
          <span class="text-caption text-medium-emphasis">Insertion</span>
          <span class="text-caption text-medium-emphasis">{{ jobData.totalInserted.toLocaleString('fr-FR') }} / {{ jobData.totalCollected.toLocaleString('fr-FR') }}</span>
        </div>
        <v-progress-linear
          :model-value="insertPct"
          :color="jobData.status === 'COMPLETED' ? 'success' : 'secondary'"
          height="4"
          rounded
        />
      </div>

      <div v-if="jobData.status === 'COMPLETED'" class="text-caption text-success">
        Terminé — {{ jobData.totalInserted.toLocaleString('fr-FR') }} transactions insérées
      </div>
      <div v-else-if="jobData.status === 'FAILED'" class="text-caption text-error">
        {{ jobData.errorMessage || 'La synchronisation a échoué.' }}
      </div>
      <div v-else class="text-caption text-medium-emphasis">
        En cours… {{ combinedPct }}%
      </div>
    </v-card-text>
  </v-card>
</template>

<script>
import { getWeezeventJobStatus } from '@/api/endpoints/aggregation.api.js'

const STORAGE_KEY = 'weezevent_active_job_id'
const POLL_INTERVAL = 5000
const HIDE_AFTER_DONE_MS = 10000

export default {
  name: 'SyncJobFloatingWidget',
  data() {
    return {
      visible: false,
      jobId: null,
      jobData: {
        status: 'PENDING',
        totalCollected: 0,
        totalInserted: 0,
        totalChunks: 0,
        processedChunks: 0,
        collectDone: false,
        errorMessage: null,
      },
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
  },
  beforeUnmount() {
    this._stopPoll()
    if (this._hideTimer) clearTimeout(this._hideTimer)
  },
  methods: {
    /**
     * Expose this method so parent can activate the widget with a new jobId.
     */
    activate(jobId) {
      this._stopPoll()
      if (this._hideTimer) clearTimeout(this._hideTimer)
      this.jobId = jobId
      this.jobData = {
        status: 'PENDING',
        totalCollected: 0,
        totalInserted: 0,
        totalChunks: 0,
        processedChunks: 0,
        collectDone: false,
        errorMessage: null,
      }
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
      const poll = async () => {
        if (!this.jobId) return
        try {
          const data = await getWeezeventJobStatus(this.jobId)
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
