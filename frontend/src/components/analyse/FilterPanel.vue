<template>
  <v-navigation-drawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :permanent="$vuetify.display.mdAndUp"
    :temporary="$vuetify.display.smAndDown"
    width="260"
    color="surface"
    class="analyse-filter-panel"
  >
    <div class="pa-4">
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
        @update:model-value="onConfigurationChange"
      />

      <!-- Outils -->
      <div class="section-label mb-2">{{ t('anTools') }}</div>
      <v-select
        :model-value="localToolbox"
        :items="[
          { title: 'Analyse', value: 'analyse' },
          { title: 'Prédire', value: 'predict' },
          { title: 'Préd. Événement', value: 'event-predict' },
          { title: 'Space Inventory', value: 'space-inventory' },
          { title: 'Logistic', value: 'logistic' },
          { title: 'Réarmement', value: 'restock' },
        ]"
        item-title="title"
        item-value="value"
        variant="outlined"
        rounded="lg"
        density="compact"
        bg-color="grey-lighten-5"
        hide-details
        class="mb-4"
        @update:model-value="onToolboxSelect"
      />

      <v-expansion-panels
        v-model="openPanels"
        variant="accordion"
        multiple
        class="filter-accordion"
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
        <v-expansion-panel value="dates">
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
              :min="0"
              :max="attendanceBounds.soldMax"
              :step="100"
              strict
              hide-details
              thumb-label
              color="#ff3131"
              track-color="grey-lighten-3"
              @update:model-value="(v) => setFilter('ticketsSoldRange', v)"
            />
            <div class="range-label mt-3">{{ t('anTicketsScanned') }}</div>
            <v-range-slider
              :model-value="filters.ticketsScannedRange"
              :min="0"
              :max="attendanceBounds.scannedMax"
              :step="100"
              strict
              hide-details
              thumb-label
              color="#ff3131"
              track-color="grey-lighten-3"
              @update:model-value="(v) => setFilter('ticketsScannedRange', v)"
            />
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= AVANCÉ ========================= -->
        <v-expansion-panel value="advanced">
          <v-expansion-panel-title class="section-title">
            Filtres avancés
            <template #actions>
              <v-chip v-if="advancedActiveCount" size="x-small" color="primary">
                {{ advancedActiveCount }}
              </v-chip>
              <v-icon size="18">mdi-chevron-down</v-icon>
            </template>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <MultiSelectFilter
              :label="t('anEventCategory')"
              :items="options.eventCategories.value"
              :model-value="filters.selectedEventCategories"
              @update:model-value="(v) => setFilterImmediate('selectedEventCategories', v)"
            />
            <MultiSelectFilter
              :label="t('anEventType')"
              :items="options.eventTypes.value"
              :model-value="filters.selectedEventTypes"
              @update:model-value="(v) => setFilterImmediate('selectedEventTypes', v)"
            />
            <MultiSelectFilter
              v-if="options.subcategories.value.length"
              label="Sous-catégorie"
              :items="options.subcategories.value"
              :model-value="filters.selectedSubcategories"
              @update:model-value="(v) => setFilterImmediate('selectedSubcategories', v)"
            />
            <MultiSelectFilter
              v-if="options.sessions.value.length"
              label="Sessions"
              :items="options.sessions.value"
              :model-value="filters.selectedSessions"
              @update:model-value="(v) => setFilterImmediate('selectedSessions', v)"
            />
            <MultiSelectFilter
              v-if="options.doorsOpenings.value.length"
              label="Ouverture des portes"
              :items="options.doorsOpenings.value"
              :model-value="filters.selectedDoorsOpenings"
              @update:model-value="(v) => setFilterImmediate('selectedDoorsOpenings', v)"
            />
            <MultiSelectFilter
              v-if="options.showTimes.value.length"
              label="Horaire du show"
              :items="options.showTimes.value"
              :model-value="filters.selectedShowTimes"
              @update:model-value="(v) => setFilterImmediate('selectedShowTimes', v)"
            />
            <!-- Sports : Équipe à domicile + équipe visiteur -->
            <MultiSelectFilter
              label="Équipe"
              :items="options.teams.value"
              :model-value="filters.selectedTeams"
              @update:model-value="(v) => setFilterImmediate('selectedTeams', v)"
            />
            <MultiSelectFilter
              v-if="categoryFlags.hasSports.value && options.visitingTeams.value.length"
              label="Équipe visiteur"
              :items="options.visitingTeams.value"
              :model-value="filters.selectedVisitingTeams"
              @update:model-value="(v) => setFilterImmediate('selectedVisitingTeams', v)"
            />
            <!-- Entertainment : Performer + opening act -->
            <MultiSelectFilter
              v-if="categoryFlags.hasEntertainment.value && options.performers.value.length"
              label="Performer"
              :items="options.performers.value"
              :model-value="filters.selectedPerformerNames"
              @update:model-value="(v) => setFilterImmediate('selectedPerformerNames', v)"
            />
            <MultiSelectFilter
              v-if="categoryFlags.hasEntertainment.value && options.openingActs.value.length"
              label="Première partie"
              :items="options.openingActs.value"
              :model-value="filters.selectedOpeningActs"
              @update:model-value="(v) => setFilterImmediate('selectedOpeningActs', v)"
            />
            <!-- Tradeshow / MICE : Sponsor -->
            <MultiSelectFilter
              label="Sponsor"
              :items="options.sponsors.value"
              :model-value="filters.selectedSponsors"
              @update:model-value="(v) => setFilterImmediate('selectedSponsors', v)"
            />
            <!-- Entr'acte (binaire oui/non) -->
            <div class="mt-2">
              <div class="ms-label mb-1">Entr'acte</div>
              <v-btn-toggle
                :model-value="filters.selectedIntermissions"
                @update:model-value="(v) => setFilterImmediate('selectedIntermissions', v || [])"
                multiple
                density="compact"
                variant="outlined"
                divided
                class="pill-toggle"
              >
                <v-btn value="yes" size="x-small">Oui</v-btn>
                <v-btn value="no" size="x-small">Non</v-btn>
              </v-btn-toggle>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>

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
            <MultiSelectFilter
              :label="t('anTypes')"
              :items="options.shopTypes.value"
              :model-value="filters.selectedShopTypes"
              @update:model-value="(v) => setFilterImmediate('selectedShopTypes', v)"
            />
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= ZONES ========================= -->
        <v-expansion-panel value="shop-areas">
          <v-expansion-panel-title class="section-title">{{ t('anZones') }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <MultiSelectFilter
              :label="t('anZones')"
              :items="options.shopAreas.value"
              :model-value="filters.selectedShopAreas"
              @update:model-value="(v) => setFilterImmediate('selectedShopAreas', v)"
            />
          </v-expansion-panel-text>
        </v-expansion-panel>

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
            <MultiSelectFilter
              :label="t('anItems')"
              :items="options.menuItemNames.value"
              :model-value="filters.selectedMenuItemIds"
              @update:model-value="(v) => setFilterImmediate('selectedMenuItemIds', v)"
            />
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= TYPE & CATÉGORIE ========================= -->
        <v-expansion-panel value="type-category">
          <v-expansion-panel-title class="section-title">{{ t('anTypeCategory') }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <MultiSelectFilter
              :label="t('anItemType')"
              :items="options.menuItemTypes.value"
              :model-value="filters.selectedMenuItemTypes"
              @update:model-value="(v) => setFilterImmediate('selectedMenuItemTypes', v)"
            />
            <MultiSelectFilter
              :label="t('anCategory')"
              :items="options.menuItemCategories.value"
              :model-value="filters.selectedMenuItemCategories"
              @update:model-value="(v) => setFilterImmediate('selectedMenuItemCategories', v)"
            />
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <!-- Comparison -->
      <div class="mt-4">
        <div class="section-label mb-2">{{ t('anComparison') }}</div>
        <v-btn-toggle
          :model-value="filters.comparisonMode"
          @update:model-value="(v) => v && setFilterImmediate('comparisonMode', v)"
          mandatory
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
  </v-navigation-drawer>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { t } from '@/i18n'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { useFilters } from '@/composables/useFilters'
import { getDateRangePresets } from '@/constants/dateRangePresets'
import MultiSelectFilter from './MultiSelectFilter.vue'

const route = useRoute()
const router = useRouter()
const store = useStore()
const spaceInventoryPath = computed(() => {
  const id = route.params?.spaceId
  return id ? `/spaces/${id}/inventory` : '/spaces'
})
const restockPath = computed(() => {
  const id = route.params?.spaceId
  return id ? `/spaces/${id}/restock` : '/spaces'
})
const logisticPath = computed(() => {
  const id = route.params?.spaceId
  return id ? `/spaces/${id}/logistic` : '/spaces'
})

// Selecting "Space Inventory" in the Outils dropdown navigates to the
// dedicated view instead of mutating the toolbox state (which only supports
// analyse / predict / event-predict).
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
  localToolbox.value = v
}

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
  setFilter,
  setFilterImmediate,
  resetFilters,
} = useFilters()

// Tous les panneaux de filtres sont repliés par défaut (demande UX) — on
// laisse l'utilisateur ouvrir uniquement ce dont il a besoin.
const openPanels = ref([])
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
  return presets.map((p) => ({ title: p.labelFr, value: p.value }))
})

// Si l'utilisateur passe en mode predict alors qu'un preset analyse-only est
// actif (ex. last7days), on retombe sur 'thismonth' qui existe dans les deux.
watch(
  () => store.state.analyse.selectedToolbox,
  () => {
    const valid = new Set(dateRangeItems.value.map((i) => i.value))
    if (!valid.has(filters.value.timeRange)) {
      setFilterImmediate('timeRange', 'thismonth')
    }
  }
)

// Configurations dispo pour le select (items au format Vuetify)
const configurationItems = computed(() => [
  { title: 'All Configurations', value: null },
  ...configurations.value
    .filter((c) => c.id !== 'cfg-all')
    .map((c) => ({
      title: `${c.name}${c.eventIds?.length ? ` (${c.eventIds.length})` : ''}`,
      value: c.id,
    })),
])

function onConfigurationChange(id) {
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
.analyse-filter-panel {
  border-right: 1px solid #EEEEEE !important;
}
/* Forcer position: fixed (overrides éventuels de layout v-main qui le mettent
   en static / relative). Top 104px = hauteur de la v-app-bar de l'analyse. */
.analyse-filter-panel.v-navigation-drawer--permanent {
  position: fixed !important;
  top: 104px !important;
  height: calc(100vh - 104px) !important;
  max-height: calc(100vh - 104px) !important;
  z-index: 5;
}
.analyse-filter-panel :deep(.v-navigation-drawer__content) {
  overflow-y: auto;
  height: 100%;
}
.section-label {
  font-size: 10px;
  font-weight: 700;
  color: #ff3131;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #212121;
  min-height: 40px;
}
.ms-label {
  font-size: 11px;
  font-weight: 500;
  color: #6B7280;
}
.filter-accordion :deep(.v-expansion-panel-title) {
  padding: 8px 12px;
  min-height: 40px;
  background-color: #FAFAFA;
}
.filter-accordion :deep(.v-expansion-panel-title--active) {
  background-color: #fff5f5;
  color: #ff3131;
}
.filter-accordion :deep(.v-expansion-panel-text__wrapper) {
  padding: 10px 12px 16px;
  background-color: #FFFFFF;
}
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
</style>
