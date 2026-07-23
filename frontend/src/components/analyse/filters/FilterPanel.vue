<template>
  <!-- Colonne gauche de la grille .an-body (ex v-navigation-drawer) : la
       largeur et le repli sont pilotés par la grille d'AnalyseView (pattern
       EventPredict .ep-side). -->
  <aside class="analyse-filter-panel">
    <!-- Outils : navigation inter-écrans EN PREMIER, HORS carte (posée sur le
         fond gris comme sur EventPredict) — WorkspaceToolSelect partagé. -->
    <WorkspaceToolSelect
      :model-value="localToolbox || 'analyse'"
      :items="toolboxItems"
      :label="t('anTools')"
      :aria-label="t('anTools')"
      class="fp-toolbox"
      @update:model-value="onToolboxSelect"
    />

    <div class="pa-4 fp-card">
      <!-- Configuration -->
      <div class="section-label mb-2">{{ t('anConfiguration') }}</div>
      <v-select
        :model-value="filters.selectedConfigurationId"
        :items="configurationItems"
        item-title="title"
        item-value="value"
        variant="outlined"
        rounded="lg"
        density="compact"
        bg-color="grey-lighten-5"
        hide-details
        class="mb-4"
        :menu-props="{ contentClass: 'fp-select-menu' }"
        @update:model-value="onConfigurationChange"
      />

      <v-expansion-panels
        v-model="openPanels"
        variant="accordion"
        multiple
        class="filter-accordion filter-group"
      >
        <!-- ========================= ÉVÉNEMENTS ========================= -->
        <v-expansion-panel value="events">
          <v-expansion-panel-title class="section-title">
            {{ t('anEvents') }}
            <template #actions>
              <v-chip v-if="filters.selectedEventIds.length" size="x-small" color="primary">
                {{ filters.selectedEventIds.length }}
              </v-chip>
              <v-icon size="18">mdi-chevron-down</v-icon>
            </template>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-text-field
              v-model="eventSearch"
              variant="outlined"
              rounded="lg"
              density="compact"
              bg-color="grey-lighten-5"
              hide-details
              prepend-inner-icon="mdi-magnify"
              :placeholder="t('anSearchEvent')"
              class="mb-2"
            />
            <div class="d-flex ga-1 mb-2">
              <v-btn size="x-small" variant="text" @click="selectAllEvents">{{ t('anAll') }}</v-btn>
              <v-btn size="x-small" variant="text" @click="clearEvents">{{ t('anNone') }}</v-btn>
            </div>
            <div class="events-scroll">
              <v-list density="compact" nav class="py-0">
                <v-list-item
                  v-for="event in filteredEventOptions"
                  :key="event.id"
                  :active="filters.selectedEventIds.includes(event.id)"
                  @click="toggleEvent(event.id)"
                  class="px-2"
                  min-height="36"
                >
                  <template #prepend>
                    <span class="event-dot" :style="{ background: event.color || '#5B8DEF' }" />
                  </template>
                  <v-list-item-title class="event-name">
                    {{ event.name }}
                    <v-chip
                      v-if="isFuture(event.date)"
                      size="x-small"
                      color="warning"
                      variant="tonal"
                      class="ml-1"
                      label
                    >{{ t('anScheduled') }}</v-chip>
                  </v-list-item-title>
                  <v-list-item-subtitle class="event-date">
                    {{ formatEventDate(event.date) }}
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= DATES ========================= -->
        <v-expansion-panel
          ref="datesPanelRef"
          value="dates"
          :class="{ 'fp-dates-highlight': datesHighlight }"
        >
          <v-expansion-panel-title class="section-title">{{ t('anDates') }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-select
              :model-value="filters.timeRange"
              :items="dateRangeItems"
              item-title="title"
              item-value="value"
              variant="outlined"
              rounded="lg"
              density="compact"
              bg-color="grey-lighten-5"
              hide-details
              @update:model-value="(v) => setFilterImmediate('timeRange', v)"
            />

            <div v-if="filters.timeRange === 'custom'" class="mt-3">
              <v-text-field
                :model-value="filters.startDate"
                type="date"
                :label="t('anStartDate')"
                variant="outlined"
                rounded="lg"
                density="compact"
                bg-color="grey-lighten-5"
                hide-details
                class="mb-2"
                @update:model-value="(v) => setFilterImmediate('startDate', v)"
              />
              <v-text-field
                :model-value="filters.endDate"
                type="date"
                :label="t('anEndDate')"
                variant="outlined"
                rounded="lg"
                density="compact"
                bg-color="grey-lighten-5"
                hide-details
                @update:model-value="(v) => setFilterImmediate('endDate', v)"
              />
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= AFFLUENCE ========================= -->
        <v-expansion-panel value="attendance">
          <v-expansion-panel-title class="section-title">{{ t('anAttendance') }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="range-label">{{ t('anTicketsSold') }}</div>
            <v-range-slider
              :model-value="filters.ticketsSoldRange"
              :min="attendanceBounds.soldMin"
              :max="attendanceBounds.soldMax"
              :step="100"
              strict
              hide-details
              thumb-label
              color="#ff3131"
              track-color="grey-lighten-3"
              @update:model-value="(v) => setFilter('ticketsSoldRange', v)"
            />
            <div class="range-values">
              <span>{{ fmtNum((filters.ticketsSoldRange || [])[0]) }}</span>
              <span>{{ fmtNum((filters.ticketsSoldRange || [])[1]) }}</span>
            </div>
            <div class="range-bounds">
              <span>Min: {{ fmtNum(attendanceBounds.soldMin) }}</span>
              <span>Max: {{ fmtNum(attendanceBounds.soldMax) }}</span>
            </div>

            <div class="range-label mt-4">{{ t('anTicketsScanned') }}</div>
            <v-range-slider
              :model-value="filters.ticketsScannedRange"
              :min="attendanceBounds.scannedMin"
              :max="attendanceBounds.scannedMax"
              :step="100"
              strict
              hide-details
              thumb-label
              color="#ff3131"
              track-color="grey-lighten-3"
              @update:model-value="(v) => setFilter('ticketsScannedRange', v)"
            />
            <div class="range-values">
              <span>{{ fmtNum((filters.ticketsScannedRange || [])[0]) }}</span>
              <span>{{ fmtNum((filters.ticketsScannedRange || [])[1]) }}</span>
            </div>
            <div class="range-bounds">
              <span>Min: {{ fmtNum(attendanceBounds.scannedMin) }}</span>
              <span>Max: {{ fmtNum(attendanceBounds.scannedMax) }}</span>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= AVANCÉ ========================= -->
        <v-expansion-panel value="advanced">
          <v-expansion-panel-title class="section-title">
            {{ t('anAdvancedFilters') }}
            <template #actions>
              <v-chip v-if="advancedActiveCount" size="x-small" color="primary">
                {{ advancedActiveCount }}
              </v-chip>
              <v-icon size="18">mdi-chevron-down</v-icon>
            </template>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <CheckboxListFilter
              :label="t('anEventCategory')"
              :items="options.eventCategories.value"
              :model-value="filters.selectedEventCategories"
              :counts="advCounts.category"
              @update:model-value="(v) => setFilterImmediate('selectedEventCategories', v)"
            />
            <CheckboxListFilter
              :label="t('anEventType')"
              :items="options.eventTypes.value"
              :model-value="filters.selectedEventTypes"
              :counts="advCounts.eventType"
              @update:model-value="(v) => setFilterImmediate('selectedEventTypes', v)"
            />
            <CheckboxListFilter
              v-if="options.subcategories.value.length"
              :label="t('anSubcategory')"
              :items="options.subcategories.value"
              :model-value="filters.selectedSubcategories"
              :counts="advCounts.subcategory"
              @update:model-value="(v) => setFilterImmediate('selectedSubcategories', v)"
            />
            <CheckboxListFilter
              v-if="options.sessions.value.length"
              :label="t('anSessions')"
              :items="options.sessions.value"
              :model-value="filters.selectedSessions"
              :counts="advCounts.session"
              @update:model-value="(v) => setFilterImmediate('selectedSessions', v)"
            />
            <CheckboxListFilter
              v-if="options.doorsOpenings.value.length"
              :label="t('anDoorsOpening')"
              :items="options.doorsOpenings.value"
              :model-value="filters.selectedDoorsOpenings"
              :counts="advCounts.doorsOpening"
              @update:model-value="(v) => setFilterImmediate('selectedDoorsOpenings', v)"
            />
            <CheckboxListFilter
              v-if="options.showTimes.value.length"
              :label="t('anShowTime')"
              :items="options.showTimes.value"
              :model-value="filters.selectedShowTimes"
              :counts="advCounts.showTime"
              @update:model-value="(v) => setFilterImmediate('selectedShowTimes', v)"
            />
            <!-- Sports : Équipe à domicile + équipe visiteur -->
            <CheckboxListFilter
              :label="t('anTeam')"
              :items="options.teams.value"
              :model-value="filters.selectedTeams"
              :counts="advCounts.team"
              @update:model-value="(v) => setFilterImmediate('selectedTeams', v)"
            />
            <CheckboxListFilter
              v-if="categoryFlags.hasSports.value && options.visitingTeams.value.length"
              :label="t('anVisitingTeam')"
              :items="options.visitingTeams.value"
              :model-value="filters.selectedVisitingTeams"
              :counts="advCounts.visitingTeam"
              @update:model-value="(v) => setFilterImmediate('selectedVisitingTeams', v)"
            />
            <!-- Entertainment : Performer + opening act -->
            <CheckboxListFilter
              v-if="categoryFlags.hasEntertainment.value && options.performers.value.length"
              :label="t('anPerformer')"
              :items="options.performers.value"
              :model-value="filters.selectedPerformerNames"
              :counts="advCounts.performer"
              @update:model-value="(v) => setFilterImmediate('selectedPerformerNames', v)"
            />
            <CheckboxListFilter
              v-if="categoryFlags.hasEntertainment.value && options.openingActs.value.length"
              :label="t('anOpeningAct')"
              :items="options.openingActs.value"
              :model-value="filters.selectedOpeningActs"
              :counts="advCounts.openingAct"
              @update:model-value="(v) => setFilterImmediate('selectedOpeningActs', v)"
            />
            <!-- Tradeshow / MICE : Sponsor -->
            <CheckboxListFilter
              :label="t('anSponsor')"
              :items="options.sponsors.value"
              :model-value="filters.selectedSponsors"
              :counts="advCounts.sponsor"
              @update:model-value="(v) => setFilterImmediate('selectedSponsors', v)"
            />
            <!-- Entr'acte (binaire oui/non) -->
            <div class="mt-2">
              <div class="ms-label mb-1">{{ t('anIntermission') }}</div>
              <v-btn-toggle
                :model-value="filters.selectedIntermissions"
                @update:model-value="(v) => setFilterImmediate('selectedIntermissions', v || [])"
                multiple
                density="compact"
                variant="outlined"
                divided
                class="pill-toggle"
              >
                <v-btn value="yes" size="x-small">{{ t('anYes') }}</v-btn>
                <v-btn value="no" size="x-small">{{ t('anNo') }}</v-btn>
              </v-btn-toggle>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- État catalogue (loading/empty/error) — pilote shops/items/types/catégories.
             Message par ÉTAT : seul `error` (vraie panne API) affiche l'échec + Retry ;
             les états vides (`empty-*`) ont un message neutre (avant : tout état
             non-loading affichait « Failed to load the catalog », mensonger). -->
        <v-alert
          v-if="filtersState !== 'ready'"
          :type="filtersState === 'error' ? 'error' : 'info'"
          variant="tonal"
          density="compact"
          class="ma-2 catalog-state-alert"
        >
          <div v-if="filtersState === 'loading'" class="d-flex align-center">
            <v-progress-circular indeterminate size="16" width="2" class="mr-2" />
            <span class="text-caption">{{ t('anCatalogLoading') }}</span>
          </div>
          <template v-else-if="filtersState === 'error'">
            <div class="text-caption">{{ t('anCatalogLoadError') }}</div>
            <v-btn
              size="x-small"
              variant="text"
              class="mt-1 px-0"
              @click="retryConfigContext"
            >
              <v-icon start size="14">mdi-refresh</v-icon>{{ t('anRetry') }}
            </v-btn>
          </template>
          <div v-else class="text-caption">{{ t(emptyStateKey) }}</div>
        </v-alert>

      <v-expansion-panels
        v-model="openPanels"
        variant="accordion"
        multiple
        class="filter-accordion filter-group"
      >
        <!-- ========================= POINTS DE VENTE ========================= -->
        <v-expansion-panel value="shops">
          <v-expansion-panel-title class="section-title">
            {{ t('anShops') }}
            <template #actions>
              <v-chip v-if="filters.selectedShopIds.length" size="x-small" color="primary">
                {{ filters.selectedShopIds.length }}
              </v-chip>
              <v-icon size="18">mdi-chevron-down</v-icon>
            </template>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-text-field
              v-model="shopSearch"
              variant="outlined"
              rounded="lg"
              density="compact"
              bg-color="grey-lighten-5"
              hide-details
              prepend-inner-icon="mdi-magnify"
              :placeholder="t('anSearchShop')"
              class="mb-2"
            />
            <v-list density="compact" nav class="py-0 shops-scroll">
              <v-list-item
                v-for="shop in filteredShopOptions"
                :key="shop"
                :active="filters.selectedShopIds.includes(shop)"
                @click="toggleShop(shop)"
                min-height="32"
              >
                <v-list-item-title class="text-caption">{{ shop }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= TYPES DE PdV ========================= -->
        <v-expansion-panel value="shop-types">
          <v-expansion-panel-title class="section-title">{{ t('anShopTypes') }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="fp-check-list">
              <label v-for="type in options.shopTypes.value" :key="type" class="fp-check-row">
                <input
                  type="checkbox"
                  class="fp-check"
                  :checked="filters.selectedShopTypes.includes(type)"
                  @change="toggleInFilter('selectedShopTypes', type)"
                />
                <span class="fp-check-name">{{ type }}</span>
                <span class="fp-check-count">{{ shopTypeCounts.get(type) || 0 }}</span>
              </label>
              <div v-if="!options.shopTypes.value.length" class="fp-check-empty">{{ t('anNoResults') }}</div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= ZONES ========================= -->
        <v-expansion-panel value="shop-areas">
          <v-expansion-panel-title class="section-title">{{ t('anZones') }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="fp-check-list">
              <label v-for="area in options.shopAreas.value" :key="area" class="fp-check-row">
                <input
                  type="checkbox"
                  class="fp-check"
                  :checked="filters.selectedShopAreas.includes(area)"
                  @change="toggleInFilter('selectedShopAreas', area)"
                />
                <span class="fp-check-name">{{ area }}</span>
                <span class="fp-check-count">{{ shopAreaCounts.get(area) || 0 }}</span>
              </label>
              <div v-if="!options.shopAreas.value.length" class="fp-check-empty">{{ t('anNoResults') }}</div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <v-expansion-panels
        v-model="openPanels"
        variant="accordion"
        multiple
        class="filter-accordion filter-group"
      >
        <!-- ========================= ARTICLES DU MENU ========================= -->
        <v-expansion-panel value="menu-items">
          <v-expansion-panel-title class="section-title">
            {{ t('anMenuItems') }}
            <template #actions>
              <v-chip v-if="filters.selectedMenuItemIds.length" size="x-small" color="primary">
                {{ filters.selectedMenuItemIds.length }}
              </v-chip>
              <v-icon size="18">mdi-chevron-down</v-icon>
            </template>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="fp-search">
              <Search :size="15" class="fp-search__icon" />
              <input
                v-model="menuItemFilterSearch"
                type="search"
                class="fp-search__input"
                :placeholder="t('anSearchMenuItems')"
              />
            </div>
            <div class="fp-check-list">
              <label v-for="name in filteredMenuItemNames" :key="name" class="fp-check-row">
                <input
                  type="checkbox"
                  class="fp-check"
                  :checked="filters.selectedMenuItemIds.includes(name)"
                  @change="toggleInFilter('selectedMenuItemIds', name)"
                />
                <span class="fp-check-name">{{ name }}</span>
                <span class="fp-check-count">{{ menuItemNameCounts.get(name) || 0 }}</span>
              </label>
              <div v-if="!filteredMenuItemNames.length" class="fp-check-empty">{{ t('anNoResults') }}</div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= TYPE & CATÉGORIE ========================= -->
        <v-expansion-panel value="type-category">
          <v-expansion-panel-title class="section-title">{{ t('anTypeCategory') }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="fp-sub-label">{{ t('anTypes') }}</div>
            <div class="fp-check-list">
              <label v-for="type in options.menuItemTypes.value" :key="type" class="fp-check-row">
                <input
                  type="checkbox"
                  class="fp-check"
                  :checked="filters.selectedMenuItemTypes.includes(type)"
                  @change="toggleInFilter('selectedMenuItemTypes', type)"
                />
                <span class="fp-check-name">{{ type }}</span>
                <span class="fp-check-count">{{ menuItemTypeCounts.get(type) || 0 }}</span>
              </label>
              <div v-if="!options.menuItemTypes.value.length" class="fp-check-empty">{{ t('anNoResults') }}</div>
            </div>

            <div class="fp-sub-label fp-sub-label--mt">{{ t('anCategory') }}</div>
            <div class="fp-check-list">
              <label v-for="cat in options.menuItemCategories.value" :key="cat" class="fp-check-row">
                <input
                  type="checkbox"
                  class="fp-check"
                  :checked="filters.selectedMenuItemCategories.includes(cat)"
                  @change="toggleInFilter('selectedMenuItemCategories', cat)"
                />
                <span class="fp-check-name">{{ cat }}</span>
                <span class="fp-check-count">{{ menuItemCategoryCounts.get(cat) || 0 }}</span>
              </label>
              <div v-if="!options.menuItemCategories.value.length" class="fp-check-empty">{{ t('anNoResults') }}</div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Comparison — masqué en « Tout l'historique » (pas de période de référence). -->
      <div v-if="filters.timeRange !== 'all'" class="mt-4">
        <div class="section-label mb-2">{{ t('anComparison') }}</div>
        <!-- Pas de `mandatory` : désélection possible = comparaison OFF (null). -->
        <v-btn-toggle
          :model-value="filters.comparisonMode"
          @update:model-value="(v) => setFilterImmediate('comparisonMode', v ?? null)"
          density="compact"
          color="#ff3131"
          variant="outlined"
          divided
        >
          <v-btn value="previous_period" size="x-small">{{ t('anPrevPeriod') }}</v-btn>
          <v-btn value="year_over_year" size="x-small">{{ t('anYearOverYear') }}</v-btn>
        </v-btn-toggle>
      </div>

      <!-- Reset -->
      <v-btn
        variant="tonal"
        color="#ff3131"
        size="small"
        rounded="lg"
        block
        class="mt-4"
        @click="resetFilters"
      >
        <v-icon start size="16">mdi-refresh</v-icon>
        {{ t('anResetFilters') }}
      </v-btn>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { useFilters } from '@/composables/useFilters'
import { getDateRangePresets, PRESET_I18N_KEYS } from '@/constants/dateRangePresets'
import CheckboxListFilter from './CheckboxListFilter.vue'
import WorkspaceToolSelect from '@/components/WorkspaceToolSelect.vue'
import { Search } from 'lucide-vue-next'
import { resolveShopType } from '@/utils/analyseDimensions'

const route = useRoute()
const router = useRouter()
const store = useStore()
const { t } = useI18n()
const spaceInventoryPath = computed(() => {
  const id = route.params?.spaceId
  return id ? `/spaces/${id}/inventory` : '/spaces'
})
const restockPath = computed(() => {
  const id = route.params?.spaceId
  return id ? `/spaces/${id}/restock` : '/spaces'
})
const livePath = computed(() => {
  const id = route.params?.spaceId
  return id ? `/spaces/${id}/live` : '/spaces'
})
const logisticPath = computed(() => {
  const id = route.params?.spaceId
  return id ? `/spaces/${id}/logistic` : '/spaces'
})

// Selecting "Inventory" / "Logistic" / "Réarmement" in the Outils dropdown
// navigates to the dedicated view instead of mutating the toolbox state (which
// only supports analyse / predict / event-predict).
function onToolboxSelect(v) {
  if (v === 'space-inventory') {
    router.push(spaceInventoryPath.value)
    return
  }
  if (v === 'logistic') {
    router.push(logisticPath.value)
    return
  }
  if (v === 'restock') {
    router.push(restockPath.value)
    return
  }
  if (v === 'live') {
    router.push(livePath.value)
    return
  }
  localToolbox.value = v
}

// Nav inter-écrans partagée : mêmes items/icônes que les autres pages
// (WorkspaceToolSelect). Ordre = tools en 1er dans la colonne gauche.
const toolboxItems = computed(() => [
  { value: 'analyse', label: t('anToolAnalyse'), icon: 'mdi-chart-line' },
  { value: 'predict', label: t('anToolPredict'), icon: 'mdi-trending-up' },
  { value: 'event-predict', label: t('anToolEventPredict'), icon: 'mdi-lightning-bolt' },
  { value: 'live', label: t('anToolLive'), icon: 'mdi-record-circle-outline' },
  { value: 'space-inventory', label: t('anToolInventory'), icon: 'mdi-package-variant' },
  { value: 'logistic', label: t('anToolLogistic'), icon: 'mdi-forklift' },
  { value: 'restock', label: t('anToolRestock'), icon: 'mdi-truck-delivery-outline' },
])

const props = defineProps({
  modelValue: { type: Boolean, default: true },
  events: { type: Array, default: () => [] },
  shops: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'update:toolbox'])


const {
  filters,
  options,
  categoryFlags,
  attendanceBounds,
  configurations,
  filtersState,
  setFilter,
  setFilterImmediate,
  resetFilters,
} = useFilters()

// États data-driven : loading (spinner) / error (retry enrichissement config) /
// empty-no-* (message neutre — aucune vente/config dans le scope, PAS un échec).
const emptyStateKey = computed(() => {
  switch (filtersState.value) {
    case 'empty-no-config': return 'anCatalogNoConfig'
    case 'empty-no-shops': return 'anCatalogNoShops'
    case 'empty-no-items': return 'anCatalogNoItems'
    default: return 'anCatalogNoShops'
  }
})
function retryConfigContext() {
  const cfg = filters.value.selectedConfigurationId
  if (cfg && cfg !== 'cfg-all') store.dispatch('analyse/loadConfigShopContext', cfg)
  else store.dispatch('analyse/loadAllConfigsShopContext')
}

// Tous les panneaux de filtres sont repliés par défaut (demande UX) — on
// laisse l'utilisateur ouvrir uniquement ce dont il a besoin.
const openPanels = ref([])

// « Période personnalisée » choisie depuis le bandeau : ouvre l'accordéon Dates,
// scrolle dessus et le met en exergue (pulse) pour guider vers les champs de
// dates. Appelé par AnalyseView via defineExpose.
const datesPanelRef = ref(null)
const datesHighlight = ref(false)
let datesHighlightTimer = null
function revealDates() {
  if (!openPanels.value.includes('dates')) {
    openPanels.value = [...openPanels.value, 'dates']
  }
  nextTick(() => {
    datesPanelRef.value?.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    datesHighlight.value = true
    clearTimeout(datesHighlightTimer)
    datesHighlightTimer = setTimeout(() => { datesHighlight.value = false }, 2600)
  })
}
defineExpose({ revealDates })
const eventSearch = ref('')
const shopSearch = ref('')

// Compteur des filtres avancés actifs (chip dans le titre du panneau)
const advancedActiveCount = computed(() => {
  const f = filters.value
  let n = 0
  const lists = [
    f.selectedEventCategories,
    f.selectedEventTypes,
    f.selectedSubcategories,
    f.selectedSessions,
    f.selectedDoorsOpenings,
    f.selectedShowTimes,
    f.selectedTeams,
    f.selectedVisitingTeams,
    f.selectedPerformerNames,
    f.selectedOpeningActs,
    f.selectedSponsors,
    f.selectedIntermissions,
  ]
  for (const l of lists) if (Array.isArray(l) && l.length) n++
  return n
})
// Sync local toolbox with store so dropdown reflects external changes (e.g.
// programmatic toolbox change when closing the EventPredict overlay).
const localToolbox = computed({
  get: () => store.state.analyse.selectedToolbox || 'analyse',
  set: (v) => emit('update:toolbox', v),
})

// Presets de dates selon toolbox actif (cf. React §6.1)
const dateRangeItems = computed(() => {
  const presets = getDateRangePresets(store.state.analyse.selectedToolbox || 'analyse')
  return presets.map((p) => ({
    title: (PRESET_I18N_KEYS[p.value] && t(PRESET_I18N_KEYS[p.value])) || p.labelFr,
    value: p.value,
  }))
})

// Si l'utilisateur passe en mode predict alors qu'un preset analyse-only est
// actif (ex. last7days), on retombe sur 'all' (aucun filtre de période) qui
// existe dans les deux listes — plus de forçage « ce mois-ci ».
watch(
  () => store.state.analyse.selectedToolbox,
  () => {
    const valid = new Set(dateRangeItems.value.map((i) => i.value))
    if (!valid.has(filters.value.timeRange)) {
      setFilterImmediate('timeRange', 'all')
    }
  }
)

// Configurations dispo pour le select (items au format Vuetify)
const configurationItems = computed(() => [
  { title: t('anFilterAllConfigurations'), value: null },
  ...configurations.value
    .filter((c) => c.id !== 'cfg-all')
    .map((c) => ({
      title: `${c.name}${c.eventIds?.length ? ` (${c.eventIds.length})` : ''}`,
      value: c.id,
    })),
])

function onConfigurationChange(id) {
  // Émission parasite du v-select (item momentanément absent pendant un re-commit
  // de `configurations`) → ignorer. `null` explicite = « All Configurations ».
  if (id === undefined) return
  setFilterImmediate('selectedConfigurationId', id)
  // Quand on change de config, on efface la sélection d'events pour ne pas
  // garder une sélection incompatible.
  setFilterImmediate('selectedEventIds', [])
}

const filteredEventOptions = computed(() => {
  if (!eventSearch.value) return props.events
  const q = eventSearch.value.toLowerCase()
  return props.events.filter((e) => e.name?.toLowerCase().includes(q))
})
const filteredShopOptions = computed(() => {
  if (!shopSearch.value) return props.shops
  const q = shopSearch.value.toLowerCase()
  return props.shops.filter((s) => s.toLowerCase().includes(q))
})

function toggleEvent(id) {
  const list = [...filters.value.selectedEventIds]
  const idx = list.indexOf(id)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(id)
  setFilterImmediate('selectedEventIds', list)
}
function toggleShop(name) {
  const list = [...filters.value.selectedShopIds]
  const idx = list.indexOf(name)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(name)
  setFilterImmediate('selectedShopIds', list)
}
function selectAllEvents() {
  setFilterImmediate('selectedEventIds', filteredEventOptions.value.map((e) => e.id))
}
function clearEvents() {
  setFilterImmediate('selectedEventIds', [])
}

// ── Attendance : format nombre fr (2 654, 80 000) ──
function fmtNum(n) {
  const v = Number(n)
  return Number.isFinite(v) ? v.toLocaleString('fr-FR') : '0'
}

// ── Menu Items / Type / Category : listes à cases + compteur (occurrences ventes) ──
const menuItemFilterSearch = ref('')
function countOccurrences(arr) {
  const m = new Map()
  for (const v of arr || []) { if (v) m.set(v, (m.get(v) || 0) + 1) }
  return m
}
const menuItemNameCounts = computed(() => countOccurrences(store.state.analyse?.soldItemOptions?.names))
const menuItemTypeCounts = computed(() => countOccurrences(store.state.analyse?.soldItemOptions?.types))
const menuItemCategoryCounts = computed(() => countOccurrences(store.state.analyse?.soldItemOptions?.categories))
const shopTypeCounts = computed(() => {
  const m = new Map()
  for (const r of (store.getters['analyse/optionsBaseRecords'] || [])) {
    const ty = resolveShopType(r)
    if (ty) m.set(ty, (m.get(ty) || 0) + 1)
  }
  return m
})
const shopAreaCounts = computed(() => countOccurrences((store.getters['analyse/optionsBaseRecords'] || []).map((r) => r?.shopArea)))

// ── Advanced Filters : compteurs par dimension (nb d'événements analysables) ──
const advCounts = computed(() => {
  const evs = store.getters['analyse/analysableEvents'] || []
  const fields = ['category', 'eventType', 'team', 'sponsor', 'subcategory', 'session', 'doorsOpening', 'showTime', 'performer', 'visitingTeam', 'openingAct']
  const maps = {}
  for (const f of fields) maps[f] = new Map()
  for (const e of evs) {
    for (const f of fields) {
      const v = e?.[f]
      if (v) maps[f].set(v, (maps[f].get(v) || 0) + 1)
    }
  }
  return maps
})
const filteredMenuItemNames = computed(() => {
  const q = menuItemFilterSearch.value.trim().toLowerCase()
  const list = options.menuItemNames.value || []
  return q ? list.filter((n) => String(n).toLowerCase().includes(q)) : list
})
function toggleInFilter(key, value) {
  const list = [...(filters.value[key] || [])]
  const idx = list.indexOf(value)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(value)
  setFilterImmediate(key, list)
}

function formatEventDate(d) {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return d
  }
}

// Badge "Prévu" pour les évènements futurs (cf. React §13.3)
function isFuture(d) {
  if (!d) return false
  try {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return new Date(d) > today
  } catch {
    return false
  }
}
</script>

<style scoped>
/* Colonne de grille (ex v-navigation-drawer) : fond transparent, la carte
   blanche (.fp-card) repose sur le gris d'AnalyseView. Empilement vertical
   comme .ep-side (toolbox hors carte, gap 12). */
.analyse-filter-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.fp-toolbox {
  margin: 0 0 2px; /* parité .ep-toolbox-select */
}
/* Le FilterPanel = une carte blanche détachée posée sur le fond gris d'AnalyseView. */
.fp-card {
  /* Carte blanche = look EventPredict (radius 18, border #d9e2ec). */
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 18px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}
/* Titre de section = kicker EventPredict (.ep-metrics-kicker) : 11px, gras 800,
   gris, majuscules, letter-spacing .08em. Harmonisé sur les 5 pages. */
.section-label {
  font-size: 0.6875rem;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
/* En-tête d'accordéon = kicker plat (parité panneau de droite SummaryPanel). */
.section-title {
  font-size: 0.6875rem;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.ms-label {
  font-size: 11px;
  font-weight: 500;
  color: #6B7280;
}

/* ── Inputs : style « form-control » (CSS + esprit Bootstrap 5), focus rouge marque ──
   Le :deep du panel pénètre aussi les <v-field> des MultiSelectFilter enfants. */
.analyse-filter-panel :deep(.v-field) {
  border-radius: 10px;
  border: 1.5px solid #e5e7eb;
  background: #f9fafb;
  box-shadow: none;
  transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
}
.analyse-filter-panel :deep(.v-field__outline) { display: none; }
.analyse-filter-panel :deep(.v-field:hover) { border-color: #d1d5db; }
.analyse-filter-panel :deep(.v-field--focused) {
  border-color: #ff3131;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .12);
}
.analyse-filter-panel :deep(.v-field__input) {
  font-size: 13px;
  min-height: 38px;
  color: #212121;
}
.analyse-filter-panel :deep(.v-field__prepend-inner),
.analyse-filter-panel :deep(.v-field__append-inner) { color: #9ca3af; }
.filter-accordion :deep(.v-expansion-panel-title) {
  padding: 8px 4px;
  min-height: 40px;
  background-color: transparent;
}
.filter-accordion :deep(.v-expansion-panel-title--active) {
  background-color: transparent;
  color: #ff3131;
}
.filter-accordion :deep(.v-expansion-panel-text__wrapper) {
  padding: 10px 12px 16px;
  background-color: #FFFFFF;
}
/* Découpage en 3 groupes (Événements / PdV / Menu) : marge entre chaque groupe */
.filter-group {
  margin-bottom: 20px;
  border-radius: 12px;
}
.filter-group:last-of-type {
  margin-bottom: 4px;
}

/* ── Listes à cases (Menu Items / Type & Category) ── */
.fp-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f3f4f6;
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 8px;
}
.fp-search__icon { color: #9ca3af; flex-shrink: 0; }
.fp-search__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13.5px;
  color: #111827;
}
.fp-search__input::placeholder { color: #9ca3af; }

.fp-check-list {
  display: flex;
  flex-direction: column;
  max-height: 300px;
  overflow-y: auto;
}
.fp-check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .12s ease;
}
.fp-check-row:hover { background: #f9fafb; }
.fp-check {
  appearance: none;
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 1.5px solid #d1d5db;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  position: relative;
  transition: border-color .15s ease, background .15s ease;
}
.fp-check:hover { border-color: #ff3131; }
.fp-check:checked { background: #ff3131; border-color: #ff3131; }
.fp-check:checked::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 1.5px;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.fp-check-name {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: #1f2937;
}
.fp-check-count {
  font-size: 13px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.fp-check-empty {
  padding: 12px;
  text-align: center;
  font-size: 13px;
  color: #9ca3af;
}
.fp-sub-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: #9ca3af;
  margin-bottom: 4px;
}
.fp-sub-label--mt { margin-top: 14px; }
.events-scroll,
.shops-scroll {
  max-height: 300px;
  overflow-y: auto;
  border-radius: 8px;
  background: #FAFAFA;
}
.event-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  margin-right: 8px;
  flex-shrink: 0;
}
.event-name {
  font-size: 13px !important;
  font-weight: 500;
  color: #212121;
}
.event-date {
  font-size: 11px !important;
  color: #9E9E9E !important;
}
.range-label {
  font-size: 10px;
  font-weight: 700;
  color: #ff3131;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 6px;
}
.range-values {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 13.5px;
  font-weight: 700;
  color: #1f2937;
  font-variant-numeric: tabular-nums;
}
.range-bounds {
  display: flex;
  justify-content: space-between;
  margin-top: 2px;
  font-size: 12px;
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
}
</style>

<!-- Menus des selects Configuration / Tools : téléportés → style GLOBAL scellé par .fp-select-menu -->
<style>
.fp-select-menu.v-overlay__content {
  border-radius: 14px !important;
  border: 1px solid #eef0f3 !important;
  box-shadow: 0 14px 36px rgba(17, 24, 39, .16) !important;
  overflow: hidden;
}
.fp-select-menu .v-list {
  padding: 6px !important;
  background: #fff;
}
.fp-select-menu .v-list-item {
  border-radius: 10px !important;
  min-height: 40px !important;
  margin: 1px 0;
  transition: background .12s ease;
}
.fp-select-menu .v-list-item:hover { background: #f9fafb; }
.fp-select-menu .v-list-item--active {
  background: rgba(255, 49, 49, .08) !important;
  color: #ff3131 !important;
}
.fp-select-menu .v-list-item--active .v-list-item-title { font-weight: 700; }
.fp-select-menu .v-list-item-title { font-size: 13.5px; }
.fp-select-menu .v-list::-webkit-scrollbar { width: 8px; }
.fp-select-menu .v-list::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 8px; }

/* Exergue de l'accordéon Dates quand « Période personnalisée » est choisie
   depuis le bandeau (revealDates) — pulse rouge charte, temporaire. */
.fp-dates-highlight {
  animation: fp-dates-pulse 1.3s ease-in-out 2;
  border-radius: 8px;
}
@keyframes fp-dates-pulse {
  0%, 100% { box-shadow: none; }
  50% { box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.45); }
}
</style>
