<template>
  <div
    v-if="progress"
    class="mt-3 pt-3 border-t dark:border-gray-700 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg p-3"
  >
    <div class="space-y-2">
      <div class="flex justify-between items-center text-sm">
        <div class="flex items-center gap-2">
          <span class="text-gray-600 dark:text-gray-400">
            {{ progress.phase }}
          </span>

          <span
            v-if="isLargeDataset && progress.status === 'fetching'"
            class="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full"
          >
            Large dataset
          </span>
        </div>

        <span class="font-medium dark:text-white">
          {{ progress.percentage }}%
        </span>
      </div>

      <!-- Progress Bar -->
      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div
          class="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-500 ease-out"
          :style="{ width: `${progress.percentage}%` }"
        />
      </div>

      <!-- Initializing Phase -->
      <div v-if="progress.status === 'initializing'" class="text-xs text-gray-500 dark:text-gray-400">
        <span>Preparing to process transactions...</span>
      </div>

      <!-- Detailed Stats -->
      <div
        v-if="progress.status === 'fetching' && progress.current > 0"
        class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400"
      >
        <span>
          {{ (progress.current || 0).toLocaleString() }} / {{ (progress.total || 0).toLocaleString() }} rows
        </span>

        <template v-if="progress.rowsPerSecond && progress.rowsPerSecond > 0">
          <span>•</span>
          <span>
            {{ progress.rowsPerSecond.toLocaleString() }} rows/sec
          </span>
        </template>

        <template v-if="progress.aggregatedPoints && progress.aggregatedPoints > 0">
          <span>•</span>
          <span>
            {{ progress.aggregatedPoints.toLocaleString() }} data points
          </span>
        </template>

        <template v-if="progress.estimatedTimeRemaining && progress.estimatedTimeRemaining > 0">
          <span>•</span>
          <span>
            ETA: {{ progress.estimatedTimeRemaining }}s
          </span>
        </template>
      </div>

      <!-- Finalizing Phase -->
      <div v-if="progress.status === 'finalizing'" class="text-xs text-gray-500 dark:text-gray-400">
        <span v-if="progress.aggregatedPoints && progress.aggregatedPoints > 0">
          Sorting {{ progress.aggregatedPoints.toLocaleString() }} data points...
        </span>
        <span v-else>Finalizing results...</span>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'EventTimelineProgressIndicator',

  props: {
    progress: {
      type: Object, // or null
      default: null,
    },
  },

  computed: {
    isLargeDataset() {
      return !!(this.progress && this.progress.total && this.progress.total >= 10000)
    },
  },
}
</script>