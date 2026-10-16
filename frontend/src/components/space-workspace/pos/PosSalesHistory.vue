<template>
  <div class="pos-sh">
    <PosSalesFilters
      :pdvs="pdvs"
      :methods="methods"
      :element-id="history.elementId.value"
      :payment-method-id="history.paymentMethodId.value"
      :search="history.search.value"
      :exporting="history.exporting.value"
      @update:element-id="history.elementId.value = $event"
      @update:payment-method-id="history.paymentMethodId.value = $event"
      @update:search="history.search.value = $event"
      @export="history.exportCsv()"
    />

    <v-alert v-if="history.error.value" type="error" variant="tonal" density="compact" rounded="lg">
      {{ history.error.value }}
    </v-alert>

    <div class="pos-sh__summary">{{ summary }}</div>
    <v-progress-linear v-if="history.loading.value" indeterminate color="#ff3131" height="3" rounded />

    <PosSalesTable :rows="history.rows.value" :empty-text="emptyText" />

    <div v-if="history.hasMore.value" class="pos-sh__more">
      <v-btn variant="outlined" :loading="history.loading.value" @click="history.loadMore()">
        {{ t('posLoadMore') }}
      </v-btn>
    </div>
  </div>
</template>

<script setup>
import { computed, watch } from 'vue'
import { usePosFormat } from '@/composables/usePosFormat'
import { usePosSalesHistory } from '@/composables/usePosSalesHistory'
import PosSalesFilters from './PosSalesFilters.vue'
import PosSalesTable from './PosSalesTable.vue'

// Onglet « Historique des ventes » : filtres, résumé, tableau, pagination par curseur.
const props = defineProps({
  spaceId: { type: String, required: true },
  eventId: { type: String, default: null },
  pdvs: { type: Array, default: () => [] },
  methods: { type: Array, default: () => [] },
  isLive: { type: Boolean, default: false },
})

const { t, money } = usePosFormat()
const history = usePosSalesHistory({ spaceId: computed(() => props.spaceId), eventId: computed(() => props.eventId) })

// Chargé à l'affichage de l'onglet et à chaque changement d'évènement.
watch(
  () => props.eventId,
  () => history.load(),
  { immediate: true }
)

const hasFilter = computed(
  () => !!(history.elementId.value || history.paymentMethodId.value || history.search.value.trim())
)
const summary = computed(() => {
  const totals = history.totals.value
  if (!totals) return ''
  return t('posSalesSummary')
    .replace('{shown}', String(history.rows.value.length))
    .replace('{total}', String(totals.tickets))
    .replace('{revenue}', money(totals.revenueTtc))
    .replace('{tips}', money(totals.tipsTtc))
})
const emptyText = computed(() => (hasFilter.value || props.isLive ? t('posSalesEmptyFilters') : t('posSalesEmptyNotStarted')))
</script>

<style scoped>
.pos-sh {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-bottom: 8px;
}
.pos-sh__summary {
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-base);
}
.pos-sh__more {
  display: flex;
  justify-content: center;
}
</style>
