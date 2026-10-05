<template>
  <!-- Incident Jean Bouin 2026-10-01 : CA enregistré (bande KPI) sans détail de vente
       (graphiques, coût). Sans ce bandeau, l'écran montre deux réalités sans l'expliquer. -->
  <v-alert
    v-if="events.length"
    type="warning"
    variant="tonal"
    icon="mdi-database-alert-outline"
    class="mb-4"
  >
    <div class="d-flex align-center justify-space-between flex-wrap ga-2">
      <div>
        <strong>{{ t('anAggGapTitle') }}</strong>
        <div class="text-body-2 mt-1">
          {{ t('anAggGapBody').replace('{n}', String(events.length)) }}
        </div>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ eventsLabel }}
        </div>
      </div>
      <v-btn size="small" variant="tonal" color="warning" @click="$emit('open-data-integration')">
        <v-icon start size="16">mdi-database-sync-outline</v-icon>
        {{ t('anUnmappedInfoLink') }}
      </v-btn>
    </div>
  </v-alert>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatDateShort } from '@/utils/dateFr'

const props = defineProps({
  // Events au CA enregistré mais sans détail de vente (useAggregationGap).
  events: { type: Array, default: () => [] },
})
defineEmits(['open-data-integration'])

const { t } = useI18n()

// Les 5 plus récents, nommés ; le reste résumé par un compte.
const MAX_LISTED = 5
const eventsLabel = computed(() => {
  const sorted = [...props.events].sort(
    (a, b) => new Date(b.eventDate || b.date || 0) - new Date(a.eventDate || a.date || 0),
  )
  const listed = sorted.slice(0, MAX_LISTED).map((e) => {
    const d = formatDateShort(e.eventDate || e.date)
    return d ? `${e.name} (${d})` : e.name
  })
  const rest = sorted.length - listed.length
  return rest > 0
    ? `${listed.join(', ')} ${t('anAggGapMore').replace('{n}', String(rest))}`
    : listed.join(', ')
})
</script>
