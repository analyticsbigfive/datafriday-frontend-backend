<template>
  <v-dialog :model-value="modelValue" max-width="1100" @update:model-value="$emit('update:modelValue', $event)">
    <div class="by-event-chart-dialog" :class="{ 'by-event-chart-dialog--dark': isDark }">
      <v-card
        v-if="!ready"
        flat
        rounded="lg"
        class="pa-5 mb-4"
      >
        <v-skeleton-loader type="heading, paragraph, image" />
      </v-card>
      <GenericByEventChart
        v-else
        :event-aggregates="eventAggregates"
        :records="records"
        :events="events"
        :cost-map="costMap"
        :initial-metric="metric"
      />
    </div>
  </v-dialog>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useTheme } from 'vuetify'
import GenericByEventChart from '../charts/GenericByEventChart.vue'

// Dark mode autonome. Ce dialog n'est qu'un conteneur (v-card flat + chart
// enfant qui suivent déjà le thème global) : la classe --dark est exposée pour
// parité/cohérence, aucune couleur claire n'est codée en dur ici.
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  metric: { type: String, default: 'revenue' },
  eventAggregates: { type: Array, default: () => [] },
  records: { type: Array, default: () => [] },
  events: { type: Array, default: () => [] },
  costMap: { type: Object, default: () => ({}) },
})

defineEmits(['update:modelValue'])

const ready = ref(false)
let frame = null

watch(() => props.modelValue, (open) => {
  if (frame != null) {
    cancelAnimationFrame(frame)
    frame = null
  }
  if (!open) {
    ready.value = false
    return
  }
  ready.value = false
  nextTick(() => {
    frame = requestAnimationFrame(() => {
      ready.value = true
      frame = null
    })
  })
})

onBeforeUnmount(() => {
  if (frame != null) {
    cancelAnimationFrame(frame)
    frame = null
  }
})
</script>
