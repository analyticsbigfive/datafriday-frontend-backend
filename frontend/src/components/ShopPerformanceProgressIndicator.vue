<template>
  <div
    v-if="!progress"
    class="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200"
  >
    <div class="flex items-center gap-3">
      <div class="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      <span class="text-sm text-gray-600">Initializing...</span>
    </div>
  </div>

  <div
    v-else
    class="mt-4 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
  >
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <span class="text-2xl">{{ getStatusIcon() }}</span>
        <div>
          <h3 class="font-semibold text-blue-900 dark:text-blue-100">
            {{
              progress.status === 'completed'
                ? 'Completed'
                : progress.status === 'failed'
                  ? 'Failed'
                  : 'Processing Shop Performance...'
            }}
          </h3>
          <p class="text-sm text-blue-700 dark:text-blue-300">{{ progress.currentTask }}</p>
        </div>
      </div>

      <div class="text-right">
        <div class="text-2xl font-bold text-blue-900 dark:text-blue-100">
          {{ Math.round(progress.progress) }}%
        </div>
        <div class="text-xs text-blue-600 dark:text-blue-400">
          Step {{ progress.currentStep }} of {{ progress.totalSteps }}
        </div>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="mb-4">
      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
        <div
          :class="`h-full transition-all duration-300 ease-out ${getStatusColor()}`"
          :style="{ width: `${progress.progress}%` }"
        ></div>
      </div>
    </div>

    <!-- Message -->
    <p class="text-sm text-blue-700 dark:text-blue-300 mb-3">{{ progress.message }}</p>

    <!-- Step Progress -->
    <div class="grid grid-cols-6 gap-2 mt-4">
      <div
        v-for="step in [1, 2, 3, 4, 5, 6]"
        :key="step"
        :class="[
          'h-2 rounded-full',
          step < progress.currentStep
            ? 'bg-green-500'
            : step === progress.currentStep
              ? 'bg-blue-500 animate-pulse'
              : 'bg-gray-200 dark:bg-gray-700'
        ]"
      ></div>
    </div>

    <!-- Step Labels -->
    <div class="grid grid-cols-6 gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400 text-center">
      <div>Validate</div>
      <div>Load Data</div>
      <div>Process</div>
      <div>Clear Old</div>
      <div>Save New</div>
      <div>Generate</div>
    </div>

    <!-- Error Message -->
    <div
      v-if="progress.status === 'failed' && progress.error"
      class="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md"
    >
      <p class="text-sm text-red-800 dark:text-red-200 font-medium">Error:</p>
      <p class="text-sm text-red-700 dark:text-red-300 mt-1">{{ progress.error }}</p>
    </div>

    <!-- Result Summary -->
    <div
      v-if="progress.status === 'completed' && progress.result"
      class="mt-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md"
    >
      <p class="text-sm font-medium text-green-900 dark:text-green-100 mb-2">Summary:</p>
      <div class="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span class="text-green-700 dark:text-green-300">Shops:</span>
          <span class="font-semibold text-green-900 dark:text-green-100">
            {{ progress.result.shopCount || 0 }}
          </span>
        </div>
        <div>
          <span class="text-green-700 dark:text-green-300">Menu Items:</span>
          <span class="font-semibold text-green-900 dark:text-green-100">
            {{ progress.result.menuItemCount || 0 }}
          </span>
        </div>
        <div>
          <span class="text-green-700 dark:text-green-300">Events:</span>
          <span class="font-semibold text-green-900 dark:text-green-100">
            {{ progress.result.eventCount || 0 }}
          </span>
        </div>
        <div>
          <span class="text-green-700 dark:text-green-300">Total Revenue:</span>
          <span class="font-semibold text-green-900 dark:text-green-100">
            €{{ (progress.result.totalRevenue != null ? Number(progress.result.totalRevenue).toFixed(2) : '0.00') }}
          </span>
        </div>
      </div>
    </div>

    <!-- Time Elapsed -->
    <div v-if="progress.status === 'processing'" class="mt-3 text-xs text-gray-500 text-center">
      Started {{ new Date(progress.startedAt).toLocaleTimeString() }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'ShopPerformanceProgressIndicator',

  props: {
    jobId: { type: String, required: true },
    onComplete: { type: Function, required: true },
    onError: { type: Function, required: true },
  },

  data() {
    return {
      progress: null,
      intervalId: null,
    }
  },

  mounted() {
    this.startPolling()
  },

  beforeUnmount() {
    this.stopPolling()
  },

  watch: {
    jobId() {
      this.stopPolling()
      this.progress = null
      this.startPolling()
    },
  },

  methods: {
    startPolling() {
      const pollProgress = async () => {
        try {
          const { projectId, publicAnonKey } = await import('../utils/supabase/info')

          const response = await fetch(
            `https://${projectId}.supabase.co/functions/v1/make-server-eb31619c/shop-performance-progress/${this.jobId}`,
            {
              headers: {
                Authorization: `Bearer ${publicAnonKey}`,
              },
            }
          )

          if (!response.ok) {
            console.error('[SHOP PERF PROGRESS] Failed to fetch progress:', response.status)
            return
          }

          const data = await response.json()

          if (data.success && data.progress) {
            this.progress = data.progress

            if (data.progress.status === 'completed') {
              this.stopPolling()
              this.onComplete(data.progress.result)
            } else if (data.progress.status === 'failed') {
              this.stopPolling()
              this.onError(data.progress.error || 'Unknown error')
            }
          }
        } catch (error) {
          console.error('[SHOP PERF PROGRESS] Error polling progress:', error)
        }
      }

      pollProgress()
      this.intervalId = setInterval(pollProgress, 1000)
    },

    stopPolling() {
      if (this.intervalId) {
        clearInterval(this.intervalId)
        this.intervalId = null
      }
    },

    getStatusColor() {
      switch (this.progress?.status) {
        case 'pending':
          return 'bg-gray-200'
        case 'processing':
          return 'bg-blue-500'
        case 'completed':
          return 'bg-green-500'
        case 'failed':
          return 'bg-red-500'
        default:
          return 'bg-gray-200'
      }
    },

    getStatusIcon() {
      switch (this.progress?.status) {
        case 'pending':
          return '⏳'
        case 'processing':
          return '⚙️'
        case 'completed':
          return '✅'
        case 'failed':
          return '❌'
        default:
          return '⏳'
      }
    },
  },
}
</script>