<template>
  <!-- Chrome « espace de travail » (chantier 379 : composant DÉDIÉ, zéro import
       d'AnalyseView) : propre <v-app> + barre blanche partagée WorkspaceAppHeader,
       puis bandeau rouge Live, à l'image de Restock/Logistique/Inventaire. -->
  <v-app class="lv-app" :class="{ 'lv-app--dark': isDark }">
    <WorkspaceAppHeader :space-name="spaceName" show-home />

    <v-main>
      <div class="lv-wrap" :class="{ 'lv-wrap--dark': isDark }">
        <LiveHeader
          :space-name="spaceName"
          :is-live="liveData.isLive.value"
          :event-name="liveData.event.value?.name || liveData.event.value?.eventName || ''"
          :since="liveData.liveSince.value"
          :is-dark="isDark"
          :can-edit="!!liveData.event.value"
          @open-tools="showToolDrawer = true"
          @edit-event="editOpen = true"
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
    </v-main>

    <!-- Nav entre outils (☰ du bandeau) — même drawer partagé que Restock/Logistique. -->
    <WorkspaceMobileToolDrawer
      v-model="showToolDrawer"
      :items="toolboxItems"
      current-value="live"
      :title="t('srToolsLabel')"
      @select="onToolboxSelect"
    />

    <!-- Voir / modifier l'event live (✏️) — même drawer /events, dates verrouillées. -->
    <EventFormDrawer
      v-model="editOpen"
      mode="edit"
      :initial-event="liveData.event.value"
      :is-dark="isDark"
      lock-date
      @submitted="liveData.refresh"
    />
  </v-app>
</template>

<script setup>
import { ref, computed, onMounted, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from 'vuex'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'
import { useLiveData } from '@/composables/useLiveData'
import WorkspaceAppHeader from '@/components/WorkspaceAppHeader.vue'
import WorkspaceMobileToolDrawer from '@/components/WorkspaceMobileToolDrawer.vue'
import { useWorkspaceToolbox } from '@/composables/useWorkspaceToolbox'
import EventFormDrawer from '@/components/events/drawers/EventFormDrawer.vue'
import LiveHeader from '../LiveHeader.vue'
import LiveKpiRow from '../LiveKpiRow.vue'
import LiveTimelineChart from '../LiveTimelineChart.vue'
import LiveCategoryBreakdown from '../LiveCategoryBreakdown.vue'
import LiveShopList from '../LiveShopList.vue'
import LiveInventoryPanel from '@/components/space-workspace/shared/LiveInventoryPanel.vue'

const { t } = useI18n()
const route = useRoute()
const store = useStore()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const spaceId = computed(() => route.params.spaceId)
const tab = ref('analyse')

// ☰ nav outils (drawer) + ✏️ édition d'event (drawer /events) — pilotés depuis le bandeau.
const showToolDrawer = ref(false)
const editOpen = ref(false)
const { toolboxItems, onToolboxSelect } = useWorkspaceToolbox('live')

// Nom d'espace pour la barre blanche + le titre du bandeau — résolu depuis le
// store `spaces` PARTAGÉ (getter `spaces/spaces`), pas le module `analyse`
// (chantier 379 : zéro dépendance à Analyse).
const spaceName = computed(() => {
  const list = store.getters['spaces/spaces'] || []
  const s = list.find((x) => String(x.id) === String(spaceId.value))
  return s?.name || s?.spaceName || ''
})

// Une instance de composable par montage — pas de state module-scope partagé entre
// deux espaces (contrairement au store Vuex `analyse`, dont c'était une source de
// bugs de fuite d'un espace à l'autre, cf. 11_LIVE.md §14/§16).
const liveData = useLiveData(spaceId.value)

onMounted(() => {
  store.dispatch('spaces/fetchSpaces')
  liveData.startPolling()
})
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
@media (max-width: 600px) {
  .lv-wrap { padding: 12px; }
  /* Onglets tactiles : évite tout débordement horizontal sur petit écran. */
  .lv-tabs { flex-wrap: wrap; }
}
</style>
