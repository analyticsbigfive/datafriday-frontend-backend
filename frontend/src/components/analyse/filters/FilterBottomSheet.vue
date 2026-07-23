<template>
  <!-- FAB déclencheur -->
  <v-btn
    class="filter-fab"
    color="#ff3131"
    icon
    size="large"
    elevation="6"
    :aria-label="t('anShowActiveFilters')"
    @click="open = true"
  >
    <v-badge
      :content="String(totalActiveCount)"
      :model-value="totalActiveCount > 0"
      color="warning"
      offset-x="-2"
      offset-y="-2"
    >
      <v-icon>mdi-filter-variant</v-icon>
      <v-tooltip activator="parent" location="left">{{ t('anActiveFilters') }}</v-tooltip>
    </v-badge>
  </v-btn>

  <v-bottom-sheet v-model="open" max-width="640" inset>
    <v-card :class="{ 'an-filter-sheet--dark': isDark }">
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2" color="#ff3131">mdi-filter-variant</v-icon>
        {{ t('anActiveFilters') }}
        <v-chip class="ml-2" size="x-small" color="#ff3131" label>{{ totalActiveCount }}</v-chip>
        <v-spacer />
        <v-btn icon variant="text" size="small" @click="open = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text class="pa-4">
        <p v-if="!totalActiveCount" class="text-medium-emphasis text-center my-6">
          {{ t('anNoActiveFilters') }}
        </p>

        <template v-else>
          <div v-for="group in groups" :key="group.key" class="mb-4">
            <div class="d-flex align-center mb-2">
              <v-icon :color="group.color" size="18" class="mr-2">{{ group.icon }}</v-icon>
              <span class="group-title">{{ group.title }}</span>
            </div>
            <div class="d-flex flex-wrap ga-2">
              <v-chip
                v-for="entry in group.entries"
                :key="entry.key + ':' + entry.label"
                size="small"
                closable
                variant="tonal"
                :color="group.color"
                @click:close="entry.onClear"
              >
                {{ entry.label }}
              </v-chip>
            </div>
          </div>
        </template>
      </v-card-text>

      <v-divider />

      <v-card-actions class="pa-4">
        <v-btn
          variant="outlined"
          color="error"
          prepend-icon="mdi-restore"
          :disabled="!totalActiveCount"
          @click="onReset"
        >
          {{ t('anResetAllFilters') }}
        </v-btn>
        <v-spacer />
        <v-btn variant="text" @click="open = false">{{ t('anClose') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-bottom-sheet>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useStore } from 'vuex'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'

const store = useStore()
const { t } = useI18n()
const open = ref(false)

const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const filters = computed(() => store.state.analyse.filters)
const attendanceBounds = computed(() => store.getters['analyse/attendanceBounds'])
const activeConfig = computed(() => store.getters['analyse/activeConfiguration'])

const TIMERANGE_LABELS = computed(() => ({
  all: t('anRangeAll'),
  today: t('anRangeToday'),
  yesterday: t('anRangeYesterday'),
  thisweek: t('anRangeThisWeek'),
  lastweek: t('anRangeLastWeek'),
  thismonth: t('anRangeThisMonth'),
  lastmonth: t('anRangeLastMonth'),
  nextmonth: t('anRangeNextMonth'),
  thisquarter: t('anRangeThisQuarter'),
  lastquarter: t('anRangeLastQuarter'),
  nextquarter: t('anRangeNextQuarter'),
  thisyear: t('anRangeThisYear'),
  this_year: t('anRangeThisYear'),
  year: t('anRangeLastYear'),
  lastyear: t('anRangeLastYear'),
  nextyear: t('anRangeNextYear'),
  custom: t('anRangeCustom'),
}))

function entriesForArray(key, items, formatter = (v) => v) {
  return (items || []).map((v) => ({
    key,
    label: formatter(v),
    onClear: () => setFilter(key, items.filter((x) => x !== v)),
  }))
}

const groups = computed(() => {
  const f = filters.value
  const list = []

  // Période
  const dateEntries = []
  // Défaut = 'all' (Tout l'historique) — aligné sur DEFAULT_FILTERS (store analyse).
  if (f.timeRange && f.timeRange !== 'all') {
    dateEntries.push({
      key: 'timeRange',
      label: TIMERANGE_LABELS.value[f.timeRange] || f.timeRange,
      onClear: () => setFilter('timeRange', 'all'),
    })
  }
  if (f.timeRange === 'custom') {
    if (f.startDate) {
      dateEntries.push({
        key: 'startDate',
        label: `${t('anFrom')} ${formatDate(f.startDate)}`,
        onClear: () => setFilter('startDate', null),
      })
    }
    if (f.endDate) {
      dateEntries.push({
        key: 'endDate',
        label: `${t('anTo')} ${formatDate(f.endDate)}`,
        onClear: () => setFilter('endDate', null),
      })
    }
  }
  if (dateEntries.length) {
    list.push({ key: 'date', title: t('anPeriod'), icon: 'mdi-calendar', color: '#FF6E40', entries: dateEntries })
  }

  // Configuration
  if (f.selectedConfigurationId && activeConfig.value) {
    list.push({
      key: 'config',
      title: t('anConfiguration'),
      icon: 'mdi-cog',
      color: '#5B8DEF',
      entries: [{
        key: 'selectedConfigurationId',
        label: activeConfig.value.name,
        onClear: () => setFilter('selectedConfigurationId', null),
      }],
    })
  }

  // Évènements
  const eventEntries = [
    ...entriesForArray('selectedEventIds', f.selectedEventIds, (id) => `${t('anEventLabel')} ${id.slice(-4)}`),
    ...entriesForArray('selectedEventTypes', f.selectedEventTypes),
    ...entriesForArray('selectedEventCategories', f.selectedEventCategories),
    ...entriesForArray('selectedSubcategories', f.selectedSubcategories),
    ...entriesForArray('selectedTeams', f.selectedTeams),
    ...entriesForArray('selectedVisitingTeams', f.selectedVisitingTeams),
    ...entriesForArray('selectedSponsors', f.selectedSponsors),
    ...entriesForArray('selectedPerformers', f.selectedPerformers),
  ]
  if (eventEntries.length) {
    list.push({ key: 'events', title: t('anEvents'), icon: 'mdi-calendar-star', color: '#7C4DFF', entries: eventEntries })
  }

  // Affluence
  const attendanceEntries = []
  const b = attendanceBounds.value
  if (Array.isArray(f.ticketsSoldRange) && (f.ticketsSoldRange[0] > 0 || f.ticketsSoldRange[1] < b.soldMax)) {
    attendanceEntries.push({
      key: 'ticketsSoldRange',
      label: `${t('anTicketsSold')} : ${formatNum(f.ticketsSoldRange[0])} – ${formatNum(f.ticketsSoldRange[1])}`,
      onClear: () => setFilter('ticketsSoldRange', [0, b.soldMax]),
    })
  }
  if (Array.isArray(f.ticketsScannedRange) && (f.ticketsScannedRange[0] > 0 || f.ticketsScannedRange[1] < b.scannedMax)) {
    attendanceEntries.push({
      key: 'ticketsScannedRange',
      label: `${t('anTicketsScanned')} : ${formatNum(f.ticketsScannedRange[0])} – ${formatNum(f.ticketsScannedRange[1])}`,
      onClear: () => setFilter('ticketsScannedRange', [0, b.scannedMax]),
    })
  }
  if (attendanceEntries.length) {
    list.push({ key: 'attendance', title: t('anAttendance'), icon: 'mdi-account-group', color: '#26A69A', entries: attendanceEntries })
  }

  // F&B (PdV / articles)
  const fbEntries = [
    ...entriesForArray('selectedShopIds', f.selectedShopIds),
    ...entriesForArray('selectedShopTypes', f.selectedShopTypes),
    ...entriesForArray('selectedShopAreas', f.selectedShopAreas),
    ...entriesForArray('selectedMenuItemIds', f.selectedMenuItemIds),
    ...entriesForArray('selectedMenuItemTypes', f.selectedMenuItemTypes),
    ...entriesForArray('selectedMenuItemCategories', f.selectedMenuItemCategories),
  ]
  if (fbEntries.length) {
    list.push({ key: 'fb', title: t('anFoodBev'), icon: 'mdi-silverware-fork-knife', color: '#EF5350', entries: fbEntries })
  }

  return list
})

const totalActiveCount = computed(() => groups.value.reduce((acc, g) => acc + g.entries.length, 0))

function setFilter(key, value) {
  store.dispatch('analyse/updateFilter', { key, value })
}
function formatNum(n) {
  return new Intl.NumberFormat('fr-FR').format(n || 0)
}
function formatDate(d) {
  try {
    return new Intl.DateTimeFormat('fr-FR').format(new Date(d))
  } catch {
    return String(d)
  }
}
function onReset() {
  store.dispatch('analyse/resetFilters')
  open.value = false
}
</script>


<style scoped>
.filter-fab {
  position: fixed;
  right: 24px;
  bottom: 88px;
  z-index: 1050;
  box-shadow: 0 4px 12px rgba(124, 77, 255, 0.4) !important;
}
@media (max-width: 600px) {
  .filter-fab {
    right: 16px;
    bottom: 24px;
  }
}
.group-title {
  font-size: 13px;
  font-weight: 700;
  color: #212121;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

/* ===================== DARK MODE ===================== */
/* v-card / titre / dividers suivent déjà le thème Vuetify global sombre :
   on ne force que le custom clair (.group-title #212121). */
.an-filter-sheet--dark .group-title {
  color: #f9fafb;
}
</style>
