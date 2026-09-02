<template>
  <div class="lv-wrap" :class="{ 'lv-wrap--dark': isDark }">
    <LiveHeader
      :is-live="liveData.isLive.value"
      :event-name="liveData.event.value?.name || liveData.event.value?.eventName || ''"
      :since="liveData.liveSince.value"
      :is-dark="isDark"
    />

    <div class="lv-tabs">
      <button class="lv-tab" :class="{ 'lv-tab--active': tab === 'analyse' }" @click="tab = 'analyse'">
        {{ t('anToolAnalyse') }}
      </button>
      <button class="lv-tab" :class="{ 'lv-tab--active': tab === 'inventory' }" @click="tab = 'inventory'">
        {{ t('anLiveInvTitle') }}
      </button>
    </div>

    <template v-if="tab === 'analyse'">
      <LiveKpiRow
        :revenue="liveData.revenue.value"
        :transaction-count="liveData.transactionCount.value"
        :tx-per-minute="liveData.txPerMinute.value"
        :avg-spend-per-tx="liveData.avgSpendPerTx.value"
        :items-count="liveData.itemsCount.value"
        :loading="liveData.loading.value"
      />
      <div class="lv-grid">
        <LiveTimelineChart :rows="liveData.timelineByMinute.value" :is-dark="isDark" />
        <LiveCategoryBreakdown :items="liveData.categoryBreakdown.value" :is-dark="isDark" />
      </div>
      <LiveShopList :shops="liveData.shopTotals.value" :is-dark="isDark" />
    </template>

    <LiveInventoryPanel v-else :space-id="spaceId" :is-dark="isDark" :active="tab === 'inventory'" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'
import { useLiveData } from '@/composables/useLiveData'
import LiveHeader from './LiveHeader.vue'
import LiveKpiRow from './LiveKpiRow.vue'
import LiveTimelineChart from './LiveTimelineChart.vue'
import LiveCategoryBreakdown from './LiveCategoryBreakdown.vue'
import LiveShopList from './LiveShopList.vue'
import LiveInventoryPanel from '@/components/analyse/panels/LiveInventoryPanel.vue'

const { t } = useI18n()
const route = useRoute()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const spaceId = computed(() => route.params.spaceId)
const tab = ref('analyse')

// Une instance de composable par montage — pas de state module-scope partagé entre
// deux espaces (contrairement au store Vuex `analyse`, dont c'était une source de
// bugs de fuite d'un espace à l'autre, cf. 11_LIVE.md §14/§16).
const liveData = useLiveData(spaceId.value)

onMounted(() => liveData.startPolling())
onActivated(() => liveData.startPolling())
onDeactivated(() => liveData.stopPolling())
onBeforeUnmount(() => liveData.stopPolling())
</script>

<style scoped>
.lv-wrap {
  padding: 16px;
  max-width: 1400px;
  margin: 0 auto;
}
.lv-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 14px;
}
.lv-tab {
  padding: 7px 16px;
  border-radius: 999px;
  border: 1px solid #e5e7eb;
  background: #fff;
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: #6b7280;
  cursor: pointer;
}
.lv-wrap--dark .lv-tab { background: #1e293b; border-color: rgba(255,255,255,0.1); color: #9ca3af; }
.lv-tab--active { background: #ff3131; border-color: #ff3131; color: #fff; }
.lv-grid {
  display: grid;
  grid-template-columns: 1.4fr 1fr;
  gap: 14px;
}
@media (max-width: 900px) {
  .lv-grid { grid-template-columns: 1fr; }
}
</style>
