<template>
  <v-app class="live-app" :class="{ 'live-app--dark': isDark }">
    <WorkspaceAppHeader :space-name="spaceName" :kpis="headerKpis" show-home />

    <v-main class="live-main">
      <div class="an-body" :class="{ 'an-side-collapsed': !drawer, 'an-summary-collapsed': !summaryDrawer }">
        <LiveFilterPanel :records="itemRecordsSource.itemRecords.value" :filters="filters" :is-dark="isDark" @update:filters="onFiltersUpdate" />

        <div class="an-main">
          <div id="live-capture-root" class="lv-wrap" :class="{ 'lv-wrap--dark': isDark }">
            <LiveHeader
              :space-name="spaceName"
              :is-live="liveData.isLive.value"
              :live-event="liveData.event.value"
              :is-dark="isDark"
              :drawer-open="drawer"
              :records="filteredItemRecords"
              @toggle-drawer="drawer = !drawer"
              @event-updated="onEventUpdated"
            />

            <div v-if="activeChips.length" class="av-tags d-flex align-center flex-wrap ga-2">
              <v-chip
                v-for="chip in activeChips"
                :key="chip.key"
                closable
                size="small"
                variant="tonal"
                class="chip-filter"
                @click:close="clearChip(chip)"
              >
                {{ chip.label }}
              </v-chip>
              <v-btn icon variant="text" size="small" class="av-tags__trash" :title="t('anClearAll')" @click="resetFilters">
                <v-icon size="18">mdi-trash-can-outline</v-icon>
              </v-btn>
            </div>

            <div class="an-live-tabs">
              <button class="an-live-tab" :class="{ 'an-live-tab--active': tab === 'analyse' }" @click="tab = 'analyse'">
                {{ t('anToolAnalyse') }}
              </button>
              <button class="an-live-tab" :class="{ 'an-live-tab--active': tab === 'inventory' }" @click="tab = 'inventory'">
                {{ t('anLiveInvTitle') }}
              </button>
            </div>

            <template v-if="tab === 'analyse'">
              <LiveKpiRow v-can="'stats.financial.view'" :metrics="metrics" :tx-per-minute="liveData.txPerMinute.value" :loading="liveData.loading.value" />
              <v-card v-can="'stats.financial.view'" flat rounded="lg" class="pa-4 mb-4">
                <EventTimelineChart
                  embedded
                  :event-id="liveData.eventId.value || ''"
                  :event-name="eventTitle"
                  :event-date="eventDateStr"
                  :timeline-data="filteredTimelineRows"
                  :menu-items="menuItemsCatalog"
                />
              </v-card>
              <ShopDistributionPieChart
                v-can="'stats.financial.view'"
                :records="filteredItemRecords"
                :loading="liveData.loading.value"
                @shop-click="(v) => toggleArrayFilter('selectedShopIds', v)"
                @shop-type-click="(v) => toggleArrayFilter('selectedShopTypes', v)"
                @shop-area-click="(v) => toggleArrayFilter('selectedShopAreas', v)"
              />
              <TransactionCategoryMixChart v-can="'stats.financial.view'" :records="filteredBasketRows" :loading="liveData.loading.value" />
              <MenuItemRevenueDistribution v-can="'stats.financial.view'" :records="filteredItemRecords" :loading="liveData.loading.value" />
            </template>

            <LiveInventoryPanel v-else :space-id="spaceId" :is-dark="isDark" :active="tab === 'inventory'" />
          </div>
        </div>

        <div v-can="'stats.financial.view'" class="an-right">
          <LiveShopList
            :shops="filteredShopTotals"
            :is-dark="isDark"
            :selected-shop-names="filters.selectedShopIds"
            @shop-click="(v) => toggleArrayFilter('selectedShopIds', v)"
          />
          <LiveItemsList
            :records="filteredItemRecords"
            :is-dark="isDark"
            :selected-item-names="filters.selectedMenuItemIds"
            @item-click="(v) => toggleArrayFilter('selectedMenuItemIds', v)"
          />
        </div>
      </div>

      <LiveSaleSimulatorWidget :space-id="spaceId" @simulated="onEventUpdated" />
    </v-main>
  </v-app>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onActivated, onDeactivated, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useStore } from 'vuex'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'
import { useLiveData } from '@/composables/useLiveData'
import { useLiveItemRecords } from '@/composables/useLiveItemRecords'
import { useMetricsCalculator } from '@/composables/useMetricsCalculator'
import { preprocessTimelineRecords } from '@/utils/timelineBucketing'
import { reconcileRecord } from '@/utils/analyseReconciliation'
import { useReconciliationContext } from '@/composables/useReconciliationContext'
import { resolveShopType } from '@/utils/analyseDimensions'
import { normalizeShopType } from '@/constants/shopTypes'
import { formatCurrency, formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { useNumberFormat } from '@/composables/useNumberFormat'
import WorkspaceAppHeader from '@/components/WorkspaceAppHeader.vue'
import LiveHeader from './LiveHeader.vue'
import LiveFilterPanel from './LiveFilterPanel.vue'
import LiveKpiRow from './LiveKpiRow.vue'
import EventTimelineChart from '@/components/analyse/charts/EventTimelineChart.vue'
import ShopDistributionPieChart from '@/components/analyse/charts/ShopDistributionPieChart.vue'
import TransactionCategoryMixChart from '@/components/analyse/charts/TransactionCategoryMixChart.vue'
import MenuItemRevenueDistribution from '@/components/analyse/tables/MenuItemRevenueDistribution.vue'
import LiveShopList from './LiveShopList.vue'
import LiveItemsList from './LiveItemsList.vue'
import LiveInventoryPanel from '@/components/analyse/panels/LiveInventoryPanel.vue'
import LiveSaleSimulatorWidget from '@/components/analyse/LiveSaleSimulatorWidget.vue'

const { t } = useI18n()
const { formatPercentLocale } = useNumberFormat()
const route = useRoute()
const store = useStore()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const spaceId = computed(() => route.params.spaceId)
const tab = ref('analyse')
const drawer = ref(true)
const summaryDrawer = ref(true)

// Nom d'espace : même source que tous les autres écrans de l'espace (Restock/Inventory/
// Logistic dispatchent tous `analyse/loadSpace` pour ce même besoin, cf.
// SpaceRestockView.vue/SpaceInventoryView.vue — c'est le cache app-wide « infos d'espace »,
// pas la logique de polling/filtres Live-spécifique dont useLiveData reste indépendant.
const spaceName = computed(() => store.state.analyse?.space?.name || t('anSpaceDefault'))
// `loadSpace` seul ne peuple PAS `configShopContext` (floor plan → shopArea/shopType
// des PdV) : AnalyseView le charge dans un 2e temps (`loadAllConfigsShopContext`,
// union « All Configurations »). Sans lui, `reconcileRecord` ne matche jamais aucun
// FloorElement → shopArea toujours vide (bug observé : Zones "aucun résultat").
// Pas de différé ici (contrairement à AnalyseView.vue, qui repousse ce fan-out de 3s
// pour ne pas concurrencer SON propre chargement, lourd : historique complet + poll
// 15s en continu). Live n'a ni l'un ni l'autre — son premier rendu critique est déjà
// juste live-status + un event-timeline, un différé n'aurait fait que retarder
// artificiellement Zones/Types dans le panneau de filtres pour un gain quasi nul.
let allConfigsCtxRequested = false
function requestAllConfigsContext() {
  if (allConfigsCtxRequested) return
  const st = store.state.analyse
  const hasAllConfigsCtx = st.configShopContext?.configId === null && (st.configShopContext?.floorElements?.length || 0) > 0
  if (st.configContextLoading || hasAllConfigsCtx) { allConfigsCtxRequested = true; return }
  allConfigsCtxRequested = true
  store.dispatch('analyse/loadAllConfigsShopContext')
}

async function ensureSpaceLoaded() {
  if (!store.state.analyse?.space || String(store.state.analyse.space.id) !== String(spaceId.value)) {
    // skipRecipeCatalog : Live n'éclate jamais un composant en ingrédients (ça reste
    // le seul droit de la feuille de course Restock, BUG-292-01) — évite le fan-out
    // /menu-components/:id (un appel par composant sans recette déjà connue, jusqu'à
    // plusieurs centaines sur un gros catalogue), inutile ici.
    await store.dispatch('analyse/loadSpace', { spaceId: spaceId.value, skipRecipeCatalog: true })
  }
  requestAllConfigsContext()
}

// Une instance de composable par montage — pas de state module-scope partagé entre
// deux espaces (contrairement au store Vuex `analyse`, dont c'était une source de
// bugs de fuite d'un espace à l'autre, cf. 11_LIVE.md §14/§16).
const liveData = useLiveData(spaceId.value)
const eventTitle = computed(() => liveData.event.value?.name || liveData.event.value?.eventName || '')
const eventDateStr = computed(() => liveData.event.value?.eventDate || liveData.event.value?.date || '')
// Catalogue statique (peuplé par `analyse/loadSpace`, comme menuItemCostMap) — utilisé
// par EventTimelineChart pour les libellés d'article, aucun rapport avec l'état de
// polling Live.
const menuItemsCatalog = computed(() => store.state.analyse?.menuItems || [])
// EventTimelineChart attend le format pré-traité (totalRevenue/totalQuantity/
// shopId/menuItemId par minute) — même util qu'Analyse (`useAnalyseItemRecords`
// l'utilise déjà en granularité summary), ici sur les lignes minute de Live.
// Réconcilié avec le MÊME contexte que les records item-level (`useReconciliationContext`,
// singleton app-wide) : sans ça, shopType/menuItemCategory de la timeline (bruts) ne
// matcheraient pas les valeurs canoniques du panneau de filtres — un clic sur un
// filtre viderait silencieusement la courbe.
const reconciliationCtx = useReconciliationContext()
const processedTimelineRows = computed(() => {
  const rows = preprocessTimelineRecords(liveData.timelineRows.value, { menuItemCostMap: itemRecordsSource.menuItemCostMap.value })
  return rows.map((r) => reconcileRecord(r, reconciliationCtx.value))
})

// Records item-level (grain PdV × article) du seul event live — alimente filtres,
// marge/per-cap, donuts et tables articles. Cf. useLiveItemRecords.js pour pourquoi
// c'est sûr de réutiliser useAnalyseItemRecords ici (catalogue statique, pas d'état
// de polling Live partagé).
const itemRecordsSource = useLiveItemRecords(liveData.timelineRows)

const filters = reactive({
  selectedShopIds: [],
  selectedShopTypes: [],
  selectedShopAreas: [],
  selectedMenuItemIds: [],
  selectedMenuItemTypes: [],
  selectedMenuItemCategories: [],
})
function toggleArrayFilter(key, value) {
  const list = [...filters[key]]
  const idx = list.indexOf(value)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(value)
  filters[key] = list
}
// `filters` est un objet réactif CONST — on ne peut pas le réassigner
// (`filters = $event`, invalide en JS et surtout muet en prod : le patch émis par
// LiveFilterPanel n'avait jamais atteint le reste de la page). On fusionne ses
// clés à la place, ce qui préserve la même référence réactive.
function onFiltersUpdate(patch) {
  Object.assign(filters, patch)
}
function resetFilters() {
  filters.selectedShopIds = []
  filters.selectedShopTypes = []
  filters.selectedShopAreas = []
  filters.selectedMenuItemIds = []
  filters.selectedMenuItemTypes = []
  filters.selectedMenuItemCategories = []
}
const activeChips = computed(() => {
  const chips = []
  for (const name of filters.selectedShopIds) chips.push({ key: `shop:${name}`, label: name, group: 'selectedShopIds', value: name })
  for (const v of filters.selectedShopTypes) chips.push({ key: `stype:${v}`, label: v, group: 'selectedShopTypes', value: v })
  for (const v of filters.selectedShopAreas) chips.push({ key: `sarea:${v}`, label: v, group: 'selectedShopAreas', value: v })
  for (const v of filters.selectedMenuItemIds) chips.push({ key: `item:${v}`, label: v, group: 'selectedMenuItemIds', value: v })
  for (const v of filters.selectedMenuItemTypes) chips.push({ key: `itype:${v}`, label: v, group: 'selectedMenuItemTypes', value: v })
  for (const v of filters.selectedMenuItemCategories) chips.push({ key: `icat:${v}`, label: v, group: 'selectedMenuItemCategories', value: v })
  return chips
})
function clearChip(chip) {
  toggleArrayFilter(chip.group, chip.value)
}

// Records filtrés — même logique que `filteredRecords` côté Analyse : un record ne
// survit que s'il matche TOUTES les dimensions actives (AND entre groupes, OR à
// l'intérieur d'un groupe). Partagée par tous les widgets du centre (KPIs, timeline,
// donuts, tables, colonne droite) — c'est ce qui fait que filtres, clics sur un
// donut/une ligne du classement retombent tous sur le MÊME périmètre affiché partout.
function matchesFilters(f, r) {
  if (f.selectedShopIds.length && !f.selectedShopIds.includes(r.shopName)) return false
  // resolveShopType, pas `r.shopType` brut : mêmes règles que ShopDistributionPieChart
  // et LiveFilterPanel (repli sur le type de l'article vendu si le PdV est générique) —
  // sinon un clic de donut/filtre ne matche jamais rien.
  if (f.selectedShopTypes.length && !f.selectedShopTypes.includes(resolveShopType(r))) return false
  if (f.selectedShopAreas.length && !f.selectedShopAreas.includes(r.shopArea)) return false
  if (f.selectedMenuItemIds.length && !f.selectedMenuItemIds.includes(r.menuItemName)) return false
  if (f.selectedMenuItemTypes.length && !f.selectedMenuItemTypes.includes(r.menuItemType)) return false
  if (f.selectedMenuItemCategories.length && !f.selectedMenuItemCategories.includes(r.menuItemCategory)) return false
  return true
}
const filteredItemRecords = computed(() => itemRecordsSource.itemRecords.value.filter((r) => matchesFilters(filters, r)))
const filteredTimelineRows = computed(() => processedTimelineRows.value.filter((r) => matchesFilters(filters, r)))

// Paniers (transaction-baskets) : chaque ligne porte une COMBINAISON de catégories/types/
// articles (`categoryCombo`/`typeCombo`/`itemCombo`) — un panier passe le filtre s'il
// CONTIENT au moins une des valeurs sélectionnées (même convention documentée côté Analyse,
// `buildBasketFilterPredicate` : filtrer « Bières » garde les paniers mixtes qui en
// contiennent). Le PdV, lui, est direct (une ligne = un seul shop).
function comboMatches(selected, combo) {
  if (!selected.length) return true
  return (combo || []).some((v) => selected.includes(v))
}
const filteredBasketRows = computed(() => {
  const f = filters
  return liveData.basketRows.value.filter((r) => {
    if (f.selectedShopIds.length && !f.selectedShopIds.includes(r.shopName)) return false
    // Paniers : pas de grain article unique par ligne (combo), donc pas de repli
    // possible sur menuItemType comme resolveShopType côté item-level — juste la
    // normalisation (casse/synonymes), pas le repli complet.
    if (f.selectedShopTypes.length && !f.selectedShopTypes.includes(normalizeShopType(r.shopType))) return false
    if (f.selectedShopAreas.length && !f.selectedShopAreas.includes(r.shopArea)) return false
    if (!comboMatches(f.selectedMenuItemIds, r.itemCombo)) return false
    if (!comboMatches(f.selectedMenuItemTypes, r.typeCombo)) return false
    if (!comboMatches(f.selectedMenuItemCategories, r.categoryCombo)) return false
    return true
  })
})

const filteredShopTotals = computed(() => {
  const byShop = new Map()
  for (const r of filteredItemRecords.value) {
    if (!byShop.has(r.shopId)) byShop.set(r.shopId, { shopId: r.shopId, shopName: r.shopName, revenue: 0, transactionCount: 0, itemsCount: 0 })
    const s = byShop.get(r.shopId)
    s.revenue += Number(r.revenue) || 0
    s.transactionCount += Number(r.transactionCount) || 0
    s.itemsCount += Number(r.quantity) || 0
  }
  return [...byShop.values()]
})

const liveEvents = computed(() => (liveData.event.value ? [liveData.event.value] : []))
const metrics = useMetricsCalculator({
  filteredShopGranularData: filteredItemRecords,
  chartFilteredEvents: liveEvents,
  menuItemCostMap: itemRecordsSource.menuItemCostMap,
})

// Bande KPI du header (parité AnalyseView.vue:1564-1585) — 1 seul event live : « Moy./Évén. »
// retombe sur le total par construction, ce qui est le comportement attendu (mode single-event).
const headerKpis = computed(() => {
  if (!store.getters['auth/can']('stats.financial.view')) return []
  if (liveData.loading.value && !itemRecordsSource.itemRecords.value.length) return []
  const rev = metrics.displayRevenue.value
  const trans = metrics.displayTransactions.value
  const att = metrics.displayAttendees.value
  return [
    { label: t('anHeaderKpiRevenue'), value: formatCurrency(rev), color: '#10B981' },
    { label: t('anHeaderKpiAvgPerEvent'), value: formatCurrency(metrics.displayAvgRevenue.value), color: '#F97316' },
    { label: t('anHeaderKpiCost'), value: formatCurrencyDetailed(metrics.displayCost.value), color: '#ff3131' },
    { label: t('anHeaderKpiTransactions'), value: formatNumber(trans), color: '#3B82F6' },
    { label: t('anHeaderKpiBasket'), value: formatCurrencyDetailed(trans ? rev / trans : 0), color: '#A855F7' },
    { label: t('anHeaderKpiAttendees'), value: formatNumber(att), color: '#0EA5E9' },
    { label: t('anHeaderKpiTransformation'), value: att ? formatPercentLocale((trans / att) * 100, 1) : '—', color: '#14B8A6' },
    { label: t('anHeaderKpiPerCap'), value: formatCurrencyDetailed(metrics.displayPerCapita.value), color: '#EC4899' },
  ]
})

function onEventUpdated() {
  liveData.refresh()
}

onMounted(() => { ensureSpaceLoaded(); liveData.startPolling() })
onActivated(() => { ensureSpaceLoaded(); liveData.startPolling() })
onDeactivated(() => liveData.stopPolling())
onBeforeUnmount(() => liveData.stopPolling())
</script>

<style scoped>
.live-main {
  background: #f8fafc;
}
.live-app--dark .live-main {
  background: #0f172a;
}
.an-body {
  position: relative;
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr) 340px;
  gap: 18px;
  padding: 18px 24px 24px;
  min-height: 0;
}
.an-body > :deep(.analyse-filter-panel),
.an-main,
.an-body > .an-right {
  width: auto;
  min-width: 0;
}
.an-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.an-body.an-side-collapsed {
  grid-template-columns: 0 minmax(0, 1fr) 340px;
}
.an-body.an-side-collapsed > :deep(.analyse-filter-panel) {
  opacity: 0;
  overflow: hidden;
  padding: 0;
  pointer-events: none;
}
.an-body.an-summary-collapsed {
  grid-template-columns: 292px minmax(0, 1fr) 0;
}
.an-body.an-side-collapsed.an-summary-collapsed {
  grid-template-columns: 0 minmax(0, 1fr) 0;
}
.an-body.an-summary-collapsed > .an-right {
  opacity: 0;
  overflow: hidden;
  padding: 0;
  pointer-events: none;
}
@media (max-width: 900px) {
  .an-body,
  .an-body.an-side-collapsed,
  .an-body.an-summary-collapsed {
    grid-template-columns: 1fr;
  }
  .an-body.an-side-collapsed > :deep(.analyse-filter-panel),
  .an-body.an-summary-collapsed > .an-right {
    opacity: 1;
    pointer-events: auto;
  }
}
.lv-wrap {
  max-width: 100%;
}
.av-tags {
  margin: -6px 0 12px;
}
.av-tags .chip-filter :deep(.v-chip__content) { color: #6d28d9; }
.av-tags__trash :deep(.v-icon) { color: #ff3131 !important; }
/* Onglets Analyse/Inventaire — pilule groupée, parité AnalyseView.vue:2520-2542. */
.an-live-tabs {
  display: inline-flex;
  gap: 2px;
  padding: 3px;
  background: #f3f4f6;
  border-radius: 999px;
  margin-bottom: 14px;
}
.live-app--dark .an-live-tabs { background: #0f172a; }
.an-live-tab {
  padding: 7px 16px;
  border-radius: 999px;
  border: none;
  background: transparent;
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: #6b7280;
  cursor: pointer;
}
.live-app--dark .an-live-tab { color: #94a3b8; }
.an-live-tab--active { background: #ff3131; color: #fff; }
.live-app--dark .an-live-tab--active { background: #ff3131; color: #fff; }
</style>
