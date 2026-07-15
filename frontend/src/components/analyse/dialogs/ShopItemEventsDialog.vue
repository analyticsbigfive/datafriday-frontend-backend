<template>
  <v-dialog
    :model-value="modelValue"
    max-width="640"
    scrollable
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <v-card rounded="lg" class="pa-4">
      <v-card-title class="text-h6 pa-0 mb-2">
        {{ t('anEventsDialogTitle') }}
      </v-card-title>

      <div class="mb-3 text-body-2">
        <div>
          <span class="font-weight-medium">{{ t('anEventsDialogShop') }} :</span>
          {{ shopName }}
        </div>
        <div>
          <span class="font-weight-medium">{{ t('anEventsDialogItem') }} :</span>
          {{ menuItemName }}
        </div>
        <div class="text-medium-emphasis text-caption mt-1">
          {{ eventsList.length }}
          {{ eventsList.length !== 1 ? t('anDoorsDialogEvents') : t('anDoorsDialogEvent') }}
          — {{ t('anEventsDialogOrdered') }}
        </div>
      </div>

      <v-divider class="mb-3" />

      <div class="sie-list">
        <div v-if="eventsList.length === 0" class="text-center py-8 text-medium-emphasis">
          {{ t('anEventsDialogEmpty') }}
        </div>
        <div
          v-for="(ev, index) in eventsList"
          v-else
          :key="`${ev.eventId}-${ev.eventDate}`"
          class="sie-row d-flex align-center justify-space-between"
        >
          <div class="d-flex align-center ga-3 flex-grow-1 min-w-0">
            <span class="sie-index">{{ index + 1 }}</span>
            <div class="min-w-0">
              <div class="sie-name text-truncate">{{ ev.eventName }}</div>
              <div class="text-caption text-medium-emphasis">{{ formatDateMedium(ev.eventDate) }}</div>
            </div>
          </div>
          <div class="text-right ml-3 flex-shrink-0">
            <div class="sie-qty">{{ formatNumber(ev.quantity) }}</div>
            <div class="text-caption text-medium-emphasis">{{ formatCurrencyDetailed(ev.revenue) }}</div>
          </div>
        </div>
      </div>

      <div class="d-flex justify-end mt-3">
        <v-btn variant="text" @click="$emit('update:modelValue', false)">
          {{ t('anEventsDialogClose') }}
        </v-btn>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { formatNumber, formatCurrencyDetailed } from '@/composables/useFormatters'
import { formatDateMedium, compareEventDates } from '@/utils/dateFr'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  records: { type: Array, default: () => [] },
  shopName: { type: String, default: '' },
  menuItemName: { type: String, default: '' },
  // Liste d'events (store) pour résoudre nom/date si absents du record.
  events: { type: Array, default: () => [] },
})

defineEmits(['update:modelValue'])

// Agrège les records du combo PdV × article par évènement, puis trie
// chronologiquement (parité React `eventsForSelectedMenuItem`, AnalyseView.tsx:8540).
const eventsList = computed(() => {
  if (!props.shopName || !props.menuItemName) return []
  const map = new Map()
  for (const r of props.records) {
    if (r.shopName !== props.shopName) continue
    if ((r.menuItemName || r.itemName) !== props.menuItemName) continue
    const id = r.eventId || ''
    const key = `${id}|${r.eventDate || ''}`
    if (!map.has(key)) {
      const ev = props.events.find((e) => String(e.id) === String(id))
      map.set(key, {
        eventId: id,
        eventName: r.eventName || ev?.eventName || ev?.name || t('anTimelineDefaultEvent'),
        eventDate: r.eventDate || ev?.eventDate || ev?.date || '',
        quantity: 0,
        revenue: 0,
      })
    }
    const entry = map.get(key)
    entry.quantity += r.quantity || 0
    entry.revenue += r.revenue || 0
  }
  return [...map.values()].sort((a, b) => compareEventDates(a.eventDate, b.eventDate))
})
</script>

<style scoped>
.sie-list {
  max-height: 50vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sie-row {
  background-color: #F9FAFB;
  border-radius: 8px;
  padding: 10px 12px;
}
.sie-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  background-color: #EDE9FE;
  color: #7C3AED;
  font-weight: 600;
  font-size: 13px;
  flex-shrink: 0;
}
.sie-name {
  font-weight: 500;
  color: #212121;
  font-size: 14px;
}
.sie-qty {
  font-weight: 700;
  color: #212121;
  font-size: 14px;
}
.min-w-0 {
  min-width: 0;
}
</style>
