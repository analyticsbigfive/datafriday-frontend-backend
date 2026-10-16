<template>
  <v-app class="pos-app">
    <WorkspaceAppHeader :space-name="page.spaceName.value" :kpis="headerKpis" show-home />
    <v-main>
      <div class="pos-view">
        <div class="pos-body" :class="bodyClass">
          <PosLeftColumn
            v-if="leftOpen"
            :type-options="filters.typeOptions.value"
            :menu-options="filters.menuOptions.value"
            :selected-types="filters.selectedTypes.value"
            :selected-menus="filters.selectedMenus.value"
            @toggle-type="filters.toggleType"
            @toggle-menu="filters.toggleMenu"
            @reset="filters.reset"
          />

          <div class="pos-main">
            <PosBand
              :events="page.events.value"
              :selected-event-id="page.selectedEventId.value"
              :is-live="page.isLive.value"
              :active-count="page.kpis.value.activePdv"
              :started-pin-count="startedPinCount"
              :all-pin-count="allPinCount"
              :bulk-working="actions.bulkWorking.value"
              :left-open="leftOpen"
              :right-open="rightOpen"
              @toggle-left="leftOpen = !leftOpen"
              @toggle-right="rightOpen = !rightOpen"
              @select-event="page.selectEvent"
              @start-all="actions.startAll"
              @stop-all="actions.stopAll"
              @print="onPrint"
            />

            <AppSearchBar
              v-if="tab === 'pdv'"
              v-model="filters.search.value"
              class="pos-main__search"
              :placeholder="t('posSearchPlaceholder')"
              :clear-label="t('invClear')"
            />

            <v-alert v-if="page.error.value" type="error" variant="tonal" density="compact" rounded="lg" class="mt-3">
              {{ page.error.value }}
            </v-alert>

            <v-alert
              v-else-if="!page.loading.value && !page.events.value.length"
              type="info"
              variant="tonal"
              density="compact"
              rounded="lg"
              class="mt-3"
            >
              {{ t('posNoEventAvailable') }}
            </v-alert>

            <template v-if="page.selectedEventId.value">
              <PosTabs
                v-model="tab"
                :pdv-count="filters.shown.value.length"
                :sales-count="page.kpis.value.tickets"
                :active-count="filters.activeCount.value"
                :inactive-count="filters.inactiveCount.value"
                :status-filter="filters.statusFilter.value"
                @toggle-status="filters.toggleStatus"
              />

              <PosPdvList
                v-if="tab === 'pdv'"
                :pdvs="filters.shown.value"
                :has-pdvs="page.pdvs.value.length > 0"
                :hr-options="hr.options.value"
                :can-edit-responsible="canEditResponsible"
                :can-manage="page.canManage.value"
                :working="actions.working"
                :loading="page.detailLoading.value"
                @toggle="actions.togglePdv"
                @open-cashier="actions.openCashier"
                @set-responsible="actions.setResponsible"
                @reset-pin="actions.resetPin"
              />

              <PosSalesHistory
                v-else
                :space-id="spaceId"
                :event-id="page.selectedEventId.value"
                :pdvs="page.pdvs.value"
                :methods="settingsApi.allMethods.value"
                :is-live="page.isLive.value"
              />
            </template>
          </div>

          <PosRightColumn
            v-if="rightOpen"
            :pdvs="page.pdvs.value"
            :total-revenue="page.kpis.value.revenueTtc"
            :is-live="page.isLive.value"
            :settings="page.selectedEventId.value ? settingsApi.settings.value : null"
            :methods="settingsApi.methods.value"
            :selected-ids="settingsApi.selectedIds.value"
            :notice="settingsApi.notice.value"
            :saving="settingsApi.saving.value"
            @save="settingsApi.save"
            @toggle-method="settingsApi.toggleMethod"
          />
        </div>
      </div>

      <v-snackbar v-model="noticeOpen" color="error" :timeout="6000" location="bottom">
        {{ actions.notice.value }}
      </v-snackbar>
    </v-main>
  </v-app>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from '@/i18n/useI18n'
import { useNumberFormat } from '@/composables/useNumberFormat'
import { usePosPage } from '@/composables/usePosPage'
import { usePosPdvFilters } from '@/composables/usePosPdvFilters'
import { usePosPdvActions } from '@/composables/usePosPdvActions'
import { usePosSettings } from '@/composables/usePosSettings'
import { usePosHrPersons } from '@/composables/usePosHrPersons'
import { printablePdvs, usePosPinSheet } from '@/composables/usePosPinSheet'
import WorkspaceAppHeader from '@/components/WorkspaceAppHeader.vue'
import AppSearchBar from '@/components/common/AppSearchBar.vue'
import PosBand from '../PosBand.vue'
import PosLeftColumn from '../PosLeftColumn.vue'
import PosPdvList from '../PosPdvList.vue'
import PosRightColumn from '../PosRightColumn.vue'
import PosSalesHistory from '../PosSalesHistory.vue'
import PosTabs from '../PosTabs.vue'

// Outil POS du workspace : configuration des caisses par PdV et par évènement. Orchestration
// seulement, la logique est dans les composables use-pos-* et les blocs dans ../Pos*.vue.
const route = useRoute()
const { t } = useI18n()
const { formatPrice } = useNumberFormat()

const wide = typeof window === 'undefined' ? true : window.innerWidth >= 1100
const leftOpen = ref(wide)
const rightOpen = ref(wide)
const tab = ref('pdv')

const spaceId = computed(() => String(route.params.spaceId || ''))
const page = usePosPage(spaceId)
const filters = usePosPdvFilters(page.pdvs)
const actions = usePosPdvActions({ spaceId, eventId: page.selectedEventId })
const settingsApi = usePosSettings({ spaceId, eventId: page.selectedEventId })
const hr = usePosHrPersons()
const pinSheet = usePosPinSheet()

// La liste RH exige un droit que le directeur POS n'a pas forcément : sans elle, lecture seule.
const canEditResponsible = computed(() => !hr.forbidden.value)

const startedPinCount = computed(() => printablePdvs(page.pdvs.value, { startedOnly: true }).length)
const allPinCount = computed(() => printablePdvs(page.pdvs.value, { startedOnly: false }).length)

const headerKpis = computed(() => {
  const k = page.kpis.value
  return [
    { label: t('posKpiActivePdv'), value: `${k.activePdv}/${k.totalPdv}`, color: 'primary' },
    { label: t('posKpiTickets'), value: String(k.tickets), color: 'grey' },
    { label: t('posKpiRevenue'), value: formatPrice(k.revenueTtc), color: 'grey' },
    { label: t('posKpiAverageBasket'), value: formatPrice(k.averageBasketTtc), color: 'success' },
  ]
})

const bodyClass = computed(() => ({
  'pos-body--left': leftOpen.value,
  'pos-body--right': rightOpen.value,
}))

const noticeOpen = computed({
  get: () => !!actions.notice.value,
  set: (open) => {
    if (!open) actions.notice.value = ''
  },
})

function onPrint({ startedOnly }) {
  pinSheet.print(page.pdvs.value, page.selectedEvent.value?.name, { startedOnly }).catch(() => {
    actions.notice.value = t('posActionError')
  })
}

onMounted(() => {
  hr.load()
  settingsApi.loadMethods()
})

// Les filtres de l'ancien évènement ne s'appliquent pas au suivant.
watch(page.selectedEventId, () => filters.reset())
</script>

<style scoped>
.pos-view {
  --fb-bg: #f5f5f5;
  --fb-surface: #ffffff;
  --fb-subtle: #fafafa;
  --fb-border: #e5e7eb;
  --fb-border-strong: #d1d5db;
  --fb-text: #212121;
  --fb-muted: #6b7280;
  --fb-faint: #9ca3af;
  --fb-primary: #d63031;
  --fb-primary-soft: #fff5f5;
  --fb-success: #16a34a;
  --fb-success-soft: #f0fdf4;
  --fb-warning: #d97706;
  --fb-warning-soft: #fffbeb;
  --fb-danger: #dc2626;
  --fb-danger-soft: #fef2f2;
  --fb-radius-control: 8px;
  --fb-radius-panel: 12px;
  --fb-radius-card: 16px;
  --fb-shadow-card: 0 1px 3px rgba(15, 23, 42, 0.05);

  min-height: calc(100vh - 64px);
  background: var(--fb-bg);
  color: var(--fb-text);
}
.v-theme--dataFridayDark .pos-view,
.dark .pos-view {
  --fb-bg: #111827;
  --fb-surface: #1f2937;
  --fb-subtle: #172033;
  --fb-border: #374151;
  --fb-border-strong: #4b5563;
  --fb-text: #f9fafb;
  --fb-muted: #d1d5db;
  --fb-faint: #9ca3af;
  --fb-primary-soft: rgba(214, 48, 49, 0.15);
  --fb-success-soft: rgba(22, 163, 74, 0.14);
  --fb-warning-soft: rgba(217, 119, 6, 0.14);
  --fb-danger-soft: rgba(220, 38, 38, 0.14);
  --fb-shadow-card: 0 1px 3px rgba(0, 0, 0, 0.28);
}

.pos-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
  margin: 18px 24px 24px;
}
.pos-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.pos-main__search {
  margin-top: 12px;
}

@media (min-width: 1100px) {
  /* Page à hauteur fixe sous la barre de 64 px : chaque colonne défile seule. */
  .pos-view {
    display: flex;
    flex-direction: column;
    height: calc(100vh - 64px);
    overflow: hidden;
  }
  .pos-body {
    flex: 1 1 auto;
    min-height: 0;
    grid-template-columns: minmax(0, 1fr);
  }
  .pos-body--left {
    grid-template-columns: 292px minmax(0, 1fr);
  }
  .pos-body--right {
    grid-template-columns: minmax(0, 1fr) 340px;
  }
  .pos-body--left.pos-body--right {
    grid-template-columns: 292px minmax(0, 1fr) 340px;
  }
  .pos-main {
    overflow-y: auto;
    padding-right: 4px;
    scrollbar-width: thin;
  }
}
</style>
