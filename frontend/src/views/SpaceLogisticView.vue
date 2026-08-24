<template>
  <v-app class="lg-app">
    <!-- Header type Analyse/Inventory (propre <v-app>, pas de teleport → robuste). -->
    <!-- Switcher d'espace dans le header (le bandeau rouge ne le porte plus). -->
    <WorkspaceAppHeader :space-name="spaceLabel" show-home />
    <v-main>
      <div class="space-logistic-view">
        <!-- Bandeau rouge déplacé dans la colonne CENTRE (.lg-main), pattern
             EventPredict : 1er enfant de la colonne, pas full-width. -->
        <div class="lg-layout" :class="{ 'lg-layout-full': drillElement, 'lg-layout--no-aside': !drillElement && !showFilters }">
          <!-- Colonne gauche : filtres + section Réconciliation — niveau liste uniquement,
               masquable via le toggle du bandeau (showFilters). -->
          <aside v-if="!drillElement && showFilters" class="lg-aside">
            <WorkspaceToolSelect
              model-value="logistic"
              :items="toolboxSelectItems"
              :label="t('srToolsLabel')"
              :aria-label="t('srToolboxNavLabel')"
              class="lg-toolbox-select"
              @update:model-value="onToolboxSelect"
            />

            <!-- Résumé AVANT les filtres — cellules KPI style EventPredict/Analyse
                 (fond blanc, rail latéral coloré, label majuscule, valeur sombre). -->
            <div class="lg-panel lg-summary-panel">
              <div class="lg-panel-title">
                <ClipboardList :size="15" class="me-1" />
                {{ t('logiSummary') }}
              </div>
              <div class="lg-summary-grid">
                <div class="lg-kpi-cell" style="--lg-kpi:#ff3131">
                  <div class="lg-kpi-label">{{ t('logiSummaryElements') }}</div>
                  <div class="lg-kpi-value">{{ summaryElementsCount }}</div>
                </div>
                <div class="lg-kpi-cell" style="--lg-kpi:#64748b">
                  <div class="lg-kpi-label">{{ t('logiSummaryItems') }}</div>
                  <div class="lg-kpi-value">{{ summaryItemsCount }}</div>
                </div>
                <div class="lg-kpi-cell" style="--lg-kpi:#dc2626">
                  <div class="lg-kpi-label">{{ t('logiAggStatRuptures') }}</div>
                  <div class="lg-kpi-value">{{ aggregateStats.bad }}</div>
                </div>
                <div class="lg-kpi-cell" style="--lg-kpi:#d97706">
                  <div class="lg-kpi-label">{{ t('logiAggStatLow') }}</div>
                  <div class="lg-kpi-value">{{ aggregateStats.warn }}</div>
                </div>
              </div>
              <div v-if="anchorLabel" class="lg-summary-anchor">
                {{ t('logiSince') }} {{ anchorLabel }}
              </div>
            </div>

            <!-- Filtres — carte accordéon calquée sur Space Inventory
                 (InventoryFilterPanel) : carte blanche, titre .lg-fp-section,
                 badges #ff3131, bouton reset tonal. Facettes RÉELLES Logistic
                 seulement (recherche PdV + type de denrée) — pas de section vide. -->
            <div class="lg-filter-panel">
              <div class="lg-fp-head">
                <h3 class="lg-fp-title">{{ t('logiFilters') }}</h3>
                <button
                  v-if="itemKindFilter.length || elementSearch"
                  type="button"
                  class="lg-fp-reset-inline"
                  @click="resetLogisticFilters"
                >
                  <v-icon size="14" class="mr-1">mdi-refresh</v-icon>
                  {{ t('invResetFilters') }}
                </button>
              </div>

              <AppSearchBar
                v-model="elementSearch"
                dense
                :placeholder="t('logiFilterElements')"
                :clear-label="t('logiClear') || 'Clear'"
                class="lg-panel-search mb-3"
              />

              <div class="lg-fp-accordion">
                <button
                  type="button"
                  class="lg-fp-section"
                  :class="{ 'lg-fp-section--active': kindPanelOpen }"
                  :aria-expanded="kindPanelOpen"
                  @click="kindPanelOpen = !kindPanelOpen"
                >
                  <span>{{ t('logiItemKind') }}</span>
                  <span class="lg-fp-section-actions">
                    <span v-if="itemKindFilter.length" class="lg-fp-badge">{{ itemKindFilter.length }}</span>
                    <v-icon size="18">{{ kindPanelOpen ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
                  </span>
                </button>
                <div v-show="kindPanelOpen" class="lg-fp-section-body">
                  <div class="lg-chip-row">
                    <button
                      v-for="opt in itemKindOptions"
                      :key="opt.value"
                      type="button"
                      class="lg-chip"
                      :class="{ 'lg-chip-active': itemKindFilter.includes(opt.value) }"
                      @click="toggleItemKind(opt.value)"
                    >
                      {{ t(opt.labelKey) }}
                    </button>
                  </div>
                </div>
              </div>

              <v-btn
                variant="tonal"
                color="#ff3131"
                size="small"
                rounded="lg"
                block
                class="mt-4"
                @click="resetLogisticFilters"
              >
                <v-icon start size="16">mdi-refresh</v-icon>
                {{ t('invResetFilters') }}
              </v-btn>
            </div>

            <!-- Section Réconciliation : super admin / rôles avec la permission -->
            <div v-if="canReconcile" class="lg-panel">
              <div class="lg-panel-title">
                <GitCompare :size="15" class="me-1" />
                {{ t('logiReconciliation') }}
              </div>
              <div v-if="!reconciliations.length" class="lg-panel-empty">
                {{ t('logiReconciliationEmpty') }}
              </div>
              <div v-for="reco in reconciliations" :key="reco.id" class="lg-reco-row">
                <div class="lg-reco-info">
                  <div class="lg-reco-name">{{ reco.eventName || t('logiReconciliationNoEvent') }}</div>
                  <div class="lg-reco-date">{{ formatDate(reco.createdAt) }} · {{ reco.lineCount }} {{ t('logiLines') }}</div>
                </div>
                <button type="button" class="lg-bs-icon-btn btn btn-sm" :title="t('logiDownloadCsv')" @click="downloadReco(reco)">
                  <Download :size="16" />
                </button>
              </div>
            </div>

            <!-- BUG-259-02 : section "Pertes" (transferts confirmés avec écart), séparée
                 de Réconciliation, qui modélise un écart de comptage, pas de transfert. -->
            <div v-if="canReconcile" class="lg-panel">
              <div class="lg-panel-title">
                <TrendingDown :size="15" class="me-1" />
                {{ t('logiLossesTitle') }}
              </div>
              <div v-if="!lossesSummary.count" class="lg-panel-empty">
                {{ t('logiLossesEmpty') }}
              </div>
              <template v-else>
                <div class="lg-losses-summary">
                  {{ lossesSummary.count }} {{ t('logiLossesCount') }}
                </div>
                <div class="lg-losses-actions">
                  <v-btn size="small" variant="text" class="lg-losses-view-btn" @click="lossesDrawer = true">
                    {{ t('logiLossesViewAll') }}
                  </v-btn>
                  <button type="button" class="lg-bs-icon-btn btn btn-sm" :title="t('logiLossesDownloadAll')" @click="downloadAllLosses">
                    <Download :size="16" />
                  </button>
                </div>
              </template>
            </div>
          </aside>

          <section class="lg-main">
            <!-- Header : liste des PDV, ou drill-in "Stock : {PDV}" — 1er enfant
                 de la colonne centre (pattern EventPredict). -->
            <header class="lg-header sticky-header">
              <div class="lg-header__inner">
                <div class="lg-header__left">
                  <!-- Flèche retour : uniquement en drill-in, pour fermer le détail. -->
                  <v-btn v-if="drillElement" icon variant="text" size="small" class="lg-back" @click="closeDrill()">
                    <v-icon size="20">mdi-arrow-left</v-icon>
                  </v-btn>
                  <!-- Toggle STANDARD du panneau de filtres (composant partagé) au
                       niveau liste ; en drill-in, icône décorative (pas d'aside). -->
                  <WorkspacePanelToggle
                    v-if="!drillElement"
                    :open="showFilters"
                    :label="t('logiToggleFilters')"
                    @toggle="showFilters = !showFilters"
                  />
                  <div v-else class="lg-header__icon">
                    <v-icon size="22">mdi-warehouse</v-icon>
                  </div>
                  <div class="lg-header__text">
                    <h1 class="lg-header__title">
                      {{ drillElement ? drillElement.element.name : t('logiPageTitle') }}
                    </h1>
                    <p v-if="drillElement" class="lg-header__subtitle">
                      {{ t('logiPageTitle') }}<span v-if="spaceLabel"> · {{ spaceLabel }}</span>
                    </p>
                    <LogisticConfigSelect
                      v-else
                      :configurations="configurations"
                      :model-value="selectedConfigId || 'all'"
                      @update:model-value="onConfigSelect"
                    />
                  </div>
                </div>

                <div class="lg-header__right">
                  <v-btn v-if="drillElement" variant="outlined" size="small" class="lg-hbtn" @click="openHistory(drillElement.element)">
                    <v-icon size="15" class="mr-1">mdi-history</v-icon>
                    {{ t('logiHistoryBtn') }}
                  </v-btn>
                  <v-btn icon variant="outlined" size="small" class="lg-hbtn" :loading="stockLoading" @click="refresh">
                    <v-icon size="18">mdi-refresh</v-icon>
                  </v-btn>
                  <!-- QA : simuler une vente Weezevent — niveau liste, permission logisticReconcile.
                       Désactivé en vue agrégée (question 57, tranchée : Ulrich 2026-08-19, option a) —
                       ces actions ont besoin d'une config précise (prix/menu). -->
                  <span v-if="!drillElement && canReconcile" :title="isAggregateView ? t('logiQaDisabledAggregate') : undefined">
                    <v-btn
                      variant="outlined"
                      size="small"
                      class="lg-simulate-btn"
                      :disabled="isAggregateView"
                      @click="openSimulate"
                    >
                      <v-icon size="16" class="mr-1">mdi-flask-outline</v-icon>
                      {{ t('logiSimulateBtn') }}
                    </v-btn>
                  </span>
                  <!-- Reset inventory : niveau liste, permission logisticReconcile -->
                  <span v-if="!drillElement && canReconcile" :title="isAggregateView ? t('logiQaDisabledAggregate') : undefined">
                    <v-btn
                      variant="flat"
                      class="lg-reset-btn"
                      :loading="resetting"
                      :disabled="isAggregateView || !hasCountedValues"
                      @click="resetDialog = true"
                    >
                      <v-icon size="16" class="mr-1">mdi-restore</v-icon>
                      {{ t('logiResetBtn') }}
                    </v-btn>
                  </span>
                </div>
              </div>
            </header>

            <!-- Recherche drill-in — sous le bandeau, largeur colonne. -->
            <AppSearchBar
              v-if="drillElement"
              v-model="search"
              :placeholder="t('logiSearchPlaceholder')"
              :clear-label="t('logiClear') || 'Clear'"
            />

            <!-- Onglets : uniquement niveau liste -->
            <div v-if="!drillElement" class="lg-tabs">
              <button
                v-for="tab in tabs"
                :key="tab.value"
                type="button"
                class="lg-tab"
                :class="{ 'lg-tab-active': activeTab === tab.value }"
                @click="activeTab = tab.value"
              >
                <v-icon size="16" class="mr-1">{{ tab.icon }}</v-icon>
                {{ t(tab.labelKey) }}
                <span class="lg-tab-count">({{ tabCount(tab.value) }})</span>
              </button>
            </div>
            <!-- Squelettes : reprennent la forme réelle (ligne PDV ou carte item)
                 pour éviter un flash de valeurs à 0 pendant le chargement. -->
            <template v-if="loading || stockLoading">
              <div v-if="!drillElement" class="lg-rows">
                <div v-for="n in 4" :key="n" class="lg-row lg-row-skeleton">
                  <div class="lg-row-main">
                    <v-skeleton-loader type="text" width="72" />
                    <v-skeleton-loader type="text" width="120" class="mt-1" />
                  </div>
                  <div class="lg-row-stats">
                    <v-skeleton-loader type="text" width="28" />
                    <v-skeleton-loader type="text" width="28" />
                  </div>
                  <div class="lg-row-actions">
                    <v-skeleton-loader type="button" width="96" />
                    <v-skeleton-loader type="button" width="120" />
                  </div>
                </div>
              </div>
              <div v-else class="lg-item-grid">
                <v-skeleton-loader
                  v-for="n in 6"
                  :key="n"
                  type="list-item-avatar-two-line, actions"
                  class="lg-item-card lg-item-skeleton"
                />
              </div>
            </template>

            <!-- ── NIVEAU 1 : liste des PDV / Storage ─────────────────────────── -->
            <template v-else-if="!drillElement && activeTab !== 'byItem'">
              <div v-if="currentEntries.length" class="lg-sort-bar">
                <span class="lg-sort-label">{{ t('logiSort') }}</span>
                <div class="lg-chip-row">
                  <button
                    v-for="opt in sortOptions"
                    :key="opt.value"
                    type="button"
                    class="lg-chip"
                    :class="{ 'lg-chip-active': sortMode === opt.value }"
                    @click="sortMode = opt.value"
                  >
                    {{ t(opt.labelKey) }}
                  </button>
                </div>
              </div>
              <v-alert
                v-if="!currentEntries.length"
                type="info"
                variant="tonal"
                density="comfortable"
                class="ma-2"
              >
                {{ t('logiEmpty') }}
              </v-alert>
              <div v-else class="lg-rows">
                <LogisticElementRow
                  v-for="entry in currentEntries"
                  :key="entry.element.id"
                  :element="entry.element"
                  :total-items="itemsOf(entry).length"
                  :total-packed="totalPackedFor(entry)"
                  :total-loose="totalLooseFor(entry)"
                  :rupture-count="entryStatusCounts(entry).bad"
                  :low-count="entryStatusCounts(entry).warn"
                  :config-tags="configNamesFor(entry.element)"
                  @open="drillElement = entry"
                  @open-history="openHistory(entry.element)"
                />
              </div>
            </template>

            <!-- ── NIVEAU 1 bis : vue « By Item » (chantier 341) ──────────────── -->
            <template v-else-if="!drillElement && activeTab === 'byItem'">
              <LogisticByItemView
                :entries="[...shopEntries, ...storageEntries]"
                :item-kind-filter="itemKindFilter"
                :item-status="itemStatus"
                :is-counted="(elementId, item) => !!countedFor(elementId, item)"
                :expected-display="expectedDisplay"
                :resolve-item-picture="resolveItemPicture"
                :config-names-for="configNamesFor"
                :predicted-need-for="predictedNeedFor"
                :predicted-need-packs-for="predictedNeedPacksFor"
                :units-per-pack-for="unitsPerPackFor"
                @go="goToItem"
                @add="openMovement($event.element, $event.item, 'add')"
                @remove="openMovement($event.element, $event.item, 'remove')"
              />
            </template>

            <!-- ── NIVEAU 2 : drill-in grille de cartes-articles ──────────────── -->
            <template v-else>
              <div v-if="!visibleItems(drillElement).length" class="lg-card-empty">
                {{ t('logiNoItems') }}
              </div>
              <div v-else class="lg-item-grid">
                <LogisticItemCard
                  v-for="item in visibleItems(drillElement)"
                  :key="item.name"
                  :item="item"
                  :picture="resolveItemPicture(item)"
                  :expected="expectedDisplay(drillElement.element.id, item)"
                  :units-per-pack="unitsPerPackFor(drillElement.element.id, item)"
                  :predicted-need="predictedNeedFor(drillElement.element.id, item)"
                  :predicted-need-packs="predictedNeedPacksFor(drillElement.element.id, item)"
                  :used-in-label="usedInLabel(item)"
                  :status="itemStatus(drillElement.element.id, item)"
                  :pending-transfers="pendingTransfersFor(drillElement.element.id, item.name)"
                  :outgoing-pending-transfers="outgoingPendingTransfersFor(drillElement.element.id, item.name)"
                  @add="openMovement(drillElement.element, item, 'add')"
                  @remove="openMovement(drillElement.element, item, 'remove')"
                  @open-transfer="openTransferConfirm($event, drillElement.element, item, unitsPerPackFor(drillElement.element.id, item))"
                />
              </div>
            </template>
          </section>

          <!-- Colonne droite : agrégat transversal ruptures/stock bas — niveau liste uniquement -->
          <LogisticAggregateView
            v-if="!drillElement"
            :stats="aggregateStats"
            :loading="loading || stockLoading"
            @go="goToItem"
          />
        </div>

        <!-- Popup ajout / suppression -->
        <LogisticMovementDialog
          v-model="movementDialog"
          :mode="movementMode"
          :item="movementItem"
          :units-per-pack="movementUnitsPerPack"
          :element="movementElement"
          :shops="shopElements"
          :storages="storageElementsList"
          :current-stock="movementCurrentStock"
          :market-prices="movementMarketPrices"
          :market-prices-loading="movementMarketPricesLoading"
          :saving="movementSaving"
          :error="movementError"
          @submit="submitMovement"
        />

        <!-- BUG-259-02 : confirmation d'un transfert en attente -->
        <LogisticTransferConfirmDrawer
          v-model="transferConfirmDialog"
          :transfer="transferConfirmTransfer"
          :element-name="transferConfirmElement?.name"
          :item="transferConfirmItem"
          :units-per-pack="transferConfirmUnitsPerPack"
          :saving="transferConfirmSaving"
          :error="transferConfirmError"
          @submit="submitTransferConfirm"
        />

        <!-- BUG-259-02 : liste complète des pertes de transfert -->
        <LogisticLossesDrawer
          v-model="lossesDrawer"
          :space-id="currentSpaceId"
          :space-name="spaceLabel"
          @toast="onLossesToast"
        />

        <!-- Historique d'un PDV/storage -->
        <LogisticHistoryDrawer v-model="historyDrawer" :element="historyElement" />

        <!-- QA : simuler une vente Weezevent -->
        <LogisticSimulateSaleDialog
          v-model="simulateDialog"
          :shops="shopEntries"
          :saving="simulateSaving"
          :purging="simulatePurging"
          :error="simulateError"
          :result="simulateResult"
          @submit="submitSimulateSale"
          @purge="purgeSimulated"
          @reset-result="simulateResult = null"
        />

        <!-- Confirmation Inventory Reset -->
        <v-dialog v-model="resetDialog" max-width="440">
          <v-card class="lg-dialog">
            <v-card-title class="lg-reset-title">
              <v-icon size="20" color="#ff3131" class="mr-2">mdi-restore</v-icon>
              {{ t('logiResetBtn') }}
            </v-card-title>
            <v-card-text>
              {{ t('logiResetConfirm') }}
              <div v-if="latestInventoryEventName" class="lg-reset-event">
                {{ t('logiResetEvent') }} : <strong>{{ latestInventoryEventName }}</strong>
              </div>
            </v-card-text>
            <v-card-actions class="px-4 pb-4">
              <v-spacer />
              <v-btn variant="text" @click="resetDialog = false">{{ t('logiCancel') }}</v-btn>
              <v-btn color="#ff3131" variant="flat" :loading="resetting" @click="confirmReset">
                {{ t('logiResetGo') }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>

        <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3500">
          {{ snackbarText }}
        </v-snackbar>
      </div>
    </v-main>
  </v-app>
</template>

<script>
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/i18n/useI18n'
import WorkspaceAppHeader from '@/components/WorkspaceAppHeader.vue'
import AppSearchBar from '@/components/common/AppSearchBar.vue'
import WorkspaceToolSelect from '@/components/WorkspaceToolSelect.vue'
import LogisticElementRow from '@/components/LogisticElementRow.vue'
import LogisticItemCard from '@/components/LogisticItemCard.vue'
import LogisticMovementDialog from '@/components/LogisticMovementDialog.vue'
import LogisticTransferConfirmDrawer from '@/components/LogisticTransferConfirmDrawer.vue'
import LogisticLossesDrawer from '@/components/LogisticLossesDrawer.vue'
import LogisticHistoryDrawer from '@/components/LogisticHistoryDrawer.vue'
import LogisticAggregateView from '@/components/LogisticAggregateView.vue'
import LogisticSimulateSaleDialog from '@/components/LogisticSimulateSaleDialog.vue'
import LogisticConfigSelect from '@/components/LogisticConfigSelect.vue'
import LogisticByItemView from '@/components/LogisticByItemView.vue'
import { getLatestInventory } from '@/api/endpoints/inventory.api'
import { downloadReconciliationCsv, downloadLossesCsv } from '@/api/endpoints/logistics.api'
import { getMarketPrices } from '@/api/endpoints/market.price.api'
import { ClipboardList, GitCompare, Download, TrendingDown } from 'lucide-vue-next'
import WorkspacePanelToggle from '@/components/WorkspacePanelToggle.vue'
import { loadPredictedNeed, lookupPredictedNeed, lookupPredictedNeedPacks, buildRestockNeedIndex } from '@/composables/usePredictedNeed'
import { listRestockPlans, getRestockPlan } from '@/api/endpoints/restock.api'

const TABS = [
  { value: 'shops', labelKey: 'logiTabShops', icon: 'mdi-store' },
  { value: 'storage', labelKey: 'logiTabStorage', icon: 'mdi-warehouse' },
  { value: 'byItem', labelKey: 'logiTabByItem', icon: 'mdi-view-list' },
]

const ITEM_KIND_OPTIONS = [
  { value: 'ingredient', labelKey: 'logiKindIngredient' },
  { value: 'component', labelKey: 'logiKindComponent' },
  { value: 'packaging', labelKey: 'logiKindPackaging' },
  { value: 'product', labelKey: 'logiKindProduct' },
]

const SORT_OPTIONS = [
  { value: 'name', labelKey: 'logiSortName' },
  { value: 'ruptures', labelKey: 'logiSortRuptures' },
  { value: 'stock-asc', labelKey: 'logiSortStock' },
]

// Miroir de TOOLBOX_ITEMS (SpaceRestockView.vue) : même dropdown Outils sur
// les 3 écrans (Inventory/Logistic/Restock) pour naviguer sans repasser par Analyse.
const TOOLBOX_ITEMS = [
  { value: 'analyse', labelKey: 'srToolAnalyse', icon: 'mdi-chart-line', permission: 'front.fb.analyse' },
  { value: 'predict', labelKey: 'srToolPredict', icon: 'mdi-trending-up', permission: 'front.fb.predict' },
  { value: 'event-predict', labelKey: 'srToolEventPredict', icon: 'mdi-lightning-bolt', permission: 'front.fb.eventPredict' },
  { value: 'live', labelKey: 'srToolLive', icon: 'mdi-record-circle-outline', permission: 'front.fb.live' },
  { value: 'space-pre-inventory', labelKey: 'invToolPreInventory', icon: 'mdi-clipboard-arrow-up-outline', permission: 'front.fb.spaceInventory' },
  { value: 'space-inventory', labelKey: 'srToolSpaceInventory', icon: 'mdi-package-variant', permission: 'front.fb.spaceInventory' },
  { value: 'logistic', labelKey: 'srToolLogistic', icon: 'mdi-forklift' },
  { value: 'restock', labelKey: 'srToolRestock', icon: 'mdi-truck-delivery-outline', permission: ['front.fb.restock', 'front.fb.restockBoard'] },
]

/**
 * Interface Logistic : stock attendu à tout moment par PDV/Storage.
 * Structure à 2 niveaux (miroir Space Inventory) : liste des PDV
 * (LogisticElementRow) → drill-in par PDV (grille LogisticItemCard, Ajouter/
 * Supprimer en bas de carte). Référentiel d'items RÉSOLU CÔTÉ SERVEUR
 * (LogisticsService.getStock) — pas de dépendance à useInventoryData ni au
 * catalogue complet (analyse/loadSpace) : la réponse /logistics/:spaceId/stock
 * porte déjà espace/configs/éléments/items nommés. Stock attendu = store
 * `logistics` (StockLevel − ventes dérivées, casse de pack). Valeurs du
 * dernier inventaire affichées en grisé ; « Inventory Reset » remplace
 * l'attendu par le compté et archive les écarts dans la section
 * Réconciliation (permission dédiée).
 */
export default {
  name: 'SpaceLogisticView',
  components: {
    WorkspaceAppHeader,
    AppSearchBar,
    WorkspaceToolSelect,
    LogisticElementRow,
    LogisticItemCard,
    LogisticMovementDialog,
    LogisticTransferConfirmDrawer,
    LogisticLossesDrawer,
    LogisticHistoryDrawer,
    LogisticAggregateView,
    ClipboardList,
    GitCompare,
    Download,
    TrendingDown,
    WorkspacePanelToggle,
    LogisticSimulateSaleDialog,
    LogisticConfigSelect,
    LogisticByItemView,
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const route = useRoute()
    const { t } = useI18n()
    return { store, router, route, t }
  },
  data() {
    return {
      TOOLBOX_ITEMS,
      tabs: TABS,
      activeTab: 'shops',
      loading: false,
      // Affichage du panneau de filtres (colonne gauche) — bascule via l'icône
      // du bandeau. Ouvert par défaut.
      showFilters: true,
      search: '',
      elementSearch: '',
      itemKindOptions: ITEM_KIND_OPTIONS,
      sortOptions: SORT_OPTIONS,
      itemKindFilter: [],
      // Panneau accordéon « Type de denrée » du filtre gauche (ouvert par défaut).
      kindPanelOpen: true,
      sortMode: 'name',
      // Besoin prédit Event Predict (version par défaut du match de l'URL) —
      // colonne SÉPARÉE, brute : ce qu'il faut amener, sans netting du stock déjà
      // là (le netting reste l'écran Réarmement). null hors contexte event.
      predictedNeed: null,
      // Drill-in : entry { element, consolidatedInventory|storageInventory } ouvert, ou null (niveau liste)
      drillElement: null,
      // Popup mouvement
      movementDialog: false,
      movementMode: 'add',
      movementItem: null,
      movementElement: null,
      movementSaving: false,
      movementError: null,
      movementMarketPrices: [],
      movementMarketPricesLoading: false,
      // Historique
      historyDrawer: false,
      historyElement: null,
      // BUG-259-02 : confirmation d'un transfert en attente
      transferConfirmDialog: false,
      transferConfirmTransfer: null,
      transferConfirmElement: null,
      transferConfirmItem: null,
      transferConfirmUnitsPerPack: null,
      transferConfirmSaving: false,
      transferConfirmError: null,
      // BUG-259-02 : section "Pertes" (drawer liste complète)
      lossesDrawer: false,
      // QA : simuler une vente Weezevent
      simulateDialog: false,
      simulateSaving: false,
      simulatePurging: false,
      simulateError: null,
      simulateResult: null,
      // Reset
      resetDialog: false,
      // Dernier inventaire (valeurs grisées + source du reset)
      latestCounts: {},
      latestInventoryEventId: null,
      latestInventoryEventName: null,
      snackbar: false,
      snackbarText: '',
      snackbarColor: 'success',
      // Photos denrées : index MarketPrice.image (base64 data-URI) par id, source
      // réelle des visuels ingrédients (MenuItem.picture quasi vide en base).
      // Chargé une fois via getMarketPrices() ; repli du champ item.picture backend.
      marketPriceImages: {},
    }
  },
  computed: {
    // Espace/configs/référentiel : tout vient désormais de /logistics/:spaceId/stock
    // (LogisticsService.getStock) — plus de dépendance à `analyse` ni à useInventoryData.
    currentSpace() { return this.store.state.logistics?.space || null },
    currentSpaceId() { return this.route?.params?.spaceId || this.currentSpace?.id || null },
    spaceLabel() { return this.currentSpace?.name || this.route?.params?.spaceId || null },
    configurations() { return this.store.state.logistics?.configurations || [] },
    selectedConfigId() { return this.store.state.logistics?.resolvedConfigId || null },
    /** Vue agrégée toutes configs (chantier 341) — désactive les actions QA scopées à une config. */
    isAggregateView() { return this.selectedConfigId === 'all' || !this.selectedConfigId },
    can() { return this.store.getters['auth/can'] },
    canReconcile() { return this.can('front.fb.logisticReconcile') },
    toolboxSelectItems() {
      const can = this.store.getters['auth/can']
      return TOOLBOX_ITEMS
        .filter((tool) => {
          if (typeof can !== 'function' || !tool.permission) return true
          return Array.isArray(tool.permission)
            ? tool.permission.some((permission) => can(permission))
            : can(tool.permission)
        })
        .map((tool) => ({ ...tool, label: this.t(tool.labelKey) }))
    },
    stockLoading() { return !!this.store.state.logistics?.loading },
    resetting() { return !!this.store.state.logistics?.resetting },
    reconciliations() { return this.store.state.logistics?.reconciliations || [] },
    lossesSummary() { return this.store.state.logistics?.lossesSummary || { count: 0, totalLostPacked: 0, totalLostLoose: 0 } },
    anchorLabel() {
      const at = this.store.state.logistics?.anchor?.at
      return at ? this.formatDate(at) : null
    },
    /** Entrées niveau 1, shape { element:{id,name,configIds}, items } — miroir de l'ancien wrapper
     *  useInventoryData. configIds n'est peuplé que côté backend en vue agrégée (chantier 341). */
    shopEntries() {
      return (this.store.getters['logistics/shopElements'] || []).map((e) => ({ element: { id: e.id, name: e.name, configIds: e.configIds || [], floorGroupId: e.floorGroupId ?? null }, items: e.items || [] }))
    },
    storageEntries() {
      return (this.store.getters['logistics/storageElements'] || []).map((e) => ({ element: { id: e.id, name: e.name, configIds: e.configIds || [], floorGroupId: e.floorGroupId ?? null }, items: e.items || [] }))
    },
    /** Candidats aux transferts, avec le stock actuel de la denrée (pour choisir en
     *  connaissance de cause). PDV : uniquement ceux qui suivent déjà la denrée
     *  (sinon le stock envoyé devient invisible côté receveur). Storage : un storage
     *  peut tout stocker, pas de filtre — juste 0/0 si jamais suivi là-bas. */
    shopElements() {
      const itemName = this.movementItem?.name
      return this.shopEntries
        .filter((s) => !itemName || this.itemsOf(s).some((it) => it.name === itemName))
        .map((s) => this.elementWithStock(s, itemName))
    },
    storageElementsList() {
      const itemName = this.movementItem?.name
      return this.storageEntries.map((s) => this.elementWithStock(s, itemName))
    },
    filteredShops() {
      return this.sortEntries(this.filterEntries(this.shopEntries))
    },
    filteredStorages() {
      return this.sortEntries(this.filterEntries(this.storageEntries))
    },
    currentEntries() {
      return this.activeTab === 'shops' ? this.filteredShops : this.filteredStorages
    },
    hasActiveItemFilters() {
      return this.itemKindFilter.length > 0
    },
    /** Résumé rapide : totaux sur TOUT l'espace (indépendant du filtre/onglet courant). */
    summaryElementsCount() {
      return this.shopEntries.length + this.storageEntries.length
    },
    summaryItemsCount() {
      const seen = new Set()
      for (const entry of [...this.shopEntries, ...this.storageEntries]) {
        for (const item of this.itemsOf(entry)) seen.add(item.name)
      }
      return seen.size
    },
    hasCountedValues() {
      // Au moins UN comptage réel (une map de shops vides ne compte pas).
      return Object.values(this.latestCounts).some(
        (shopCounts) => shopCounts && Object.keys(shopCounts).length > 0,
      )
    },
    /** 3e colonne : agrégat transversal (rupture/stock bas/jamais compté) sur TOUT l'espace. */
    aggregateStats() {
      let bad = 0
      let warn = 0
      let uncounted = 0
      const rows = []
      for (const entry of [...this.shopEntries, ...this.storageEntries]) {
        for (const item of this.itemsOf(entry)) {
          const status = this.itemStatus(entry.element.id, item)
          if (status === 'bad') bad++
          else if (status === 'warn') warn++
          if (!this.countedFor(entry.element.id, item)) uncounted++
          if (status !== 'ok') {
            const expected = this.expectedDisplay(entry.element.id, item)
            rows.push({
              elementId: entry.element.id,
              elementName: entry.element.name,
              itemName: item.name,
              picture: this.resolveItemPicture(item),
              status,
              packed: expected.packed,
              loose: expected.loose,
            })
          }
        }
      }
      rows.sort((a, b) => {
        const severity = (r) => (r.status === 'bad' ? 2 : 1)
        return severity(b) - severity(a) || a.itemName.localeCompare(b.itemName, 'fr')
      })
      return { bad, warn, uncounted, rows }
    },
    routeContextKey() {
      const cfg = this.route?.query?.configuration || this.route?.query?.config || ''
      return `${this.route?.params?.spaceId || ''}::${this.route?.query?.event || ''}::${cfg}`
    },
    /** Stock actuel de la denrée sur l'élément courant du popup — plafond des suppressions. */
    movementCurrentStock() {
      if (!this.movementElement || !this.movementItem) return { packed: 0, loose: 0 }
      return this.expectedDisplay(this.movementElement.id, this.movementItem)
    },
    movementUnitsPerPack() {
      if (!this.movementElement || !this.movementItem) return null
      return this.unitsPerPackFor(this.movementElement.id, this.movementItem)
    },
  },
  watch: {
    routeContextKey: {
      immediate: true,
      handler() {
        // keep-alive : this.route est la route GLOBALE — quand l'utilisateur navigue
        // ailleurs, la vue reste vivante et la clé change. Sans ce guard, la vue
        // cachée rechargerait tout (loadSpace concurrent, stock d'un autre espace…).
        if (this.route?.name !== 'space-logistic') return
        this.closeDrill()
        const spaceId = this.route?.params?.spaceId
        if (spaceId) this.loadForSpace(spaceId)
      },
    },
    activeTab() {
      this.closeDrill()
    },
    /** BUG-259-02 : transferts en attente chargés à l'entrée dans le drill-in d'un élément. */
    'drillElement.element.id': {
      immediate: false,
      handler(elementId) {
        if (elementId) this.store.dispatch('logistics/loadPendingTransfers', { elementId })
      },
    },
  },
  activated() {
    // Retour sur la vue keep-alive : le watcher a été court-circuité pendant
    // l'absence — recharge si le contexte a changé entre-temps.
    if (this.route?.name === 'space-logistic' && this.routeContextKey !== this._loadedContextKey) {
      const spaceId = this.route?.params?.spaceId
      if (spaceId) this.loadForSpace(spaceId)
    }
  },
  methods: {
    formatDate(d) {
      const date = new Date(d)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    },
    filterEntries(entries) {
      const q = String(this.elementSearch || '').trim().toLowerCase()
      return entries.filter((e) => {
        if (q && !String(e.element?.name || '').toLowerCase().includes(q)) return false
        if (this.hasActiveItemFilters) {
          return this.itemsOf(e).some((it) => this.itemMatchesFilters(it))
        }
        return true
      })
    },
    itemsOf(entry) {
      return entry.items || []
    },
    visibleItems(entry) {
      const items = this.itemsOf(entry)
      const q = String(this.search || '').trim().toLowerCase()
      return items.filter((it) => {
        if (q && !String(it.name || '').toLowerCase().includes(q)) return false
        return this.itemMatchesFilters(it)
      })
    },
    /** Filtre restant : type de denrée. Le statut du stock est couvert par le tri
     *  (« Ruptures d'abord ») et la 3e colonne Ruptures & réappro. */
    itemMatchesFilters(item) {
      if (this.itemKindFilter.length && !this.itemKindFilter.includes(item.kind || 'product')) return false
      return true
    },
    toggleItemKind(value) {
      const i = this.itemKindFilter.indexOf(value)
      if (i === -1) this.itemKindFilter.push(value)
      else this.itemKindFilter.splice(i, 1)
    },
    /** Réinitialise les filtres du panneau gauche (recherche PdV + type de denrée). */
    resetLogisticFilters() {
      this.itemKindFilter = []
      this.elementSearch = ''
    },
    /** Nb affiché sur chaque tab — shops/storage comptent les entrées filtrées, byItem
     *  compte les denrées distinctes de tout l'espace (indépendant du tab actif). */
    tabCount(tabValue) {
      if (tabValue === 'shops') return this.filteredShops.length
      if (tabValue === 'storage') return this.filteredStorages.length
      return this.summaryItemsCount
    },
    /** Noms de config d'un élément (chantier 341) — pour le tag "Plan Max, Plan Réduit"
     *  sur les lignes PDV en vue agrégée. Vide en mode single-config (configIds absent). */
    configNamesFor(element) {
      const ids = element?.configIds || []
      if (!ids.length) return []
      return ids
        .map((id) => this.configurations.find((c) => String(c.id) === String(id)))
        .filter(Boolean)
        .map((c) => c.name || c.title)
    },
    /** Changement de configuration depuis le sélecteur (LogisticConfigSelect) — recharge
     *  le stock et met à jour l'URL pour rester deep-linkable (remplace l'ancien
     *  deep-link invisible ?configuration= par un choix piloté par l'UI). */
    onConfigSelect(configId) {
      const spaceId = this.currentSpaceId
      if (!spaceId) return
      this.router.replace({ query: { ...this.route.query, configuration: configId } })
      this.store.dispatch('logistics/loadStock', { spaceId, configId })
    },
    /** 'bad' (rupture) | 'warn' (stock bas, mêmes critères que itemMatchesFilters) | 'ok'. */
    itemStatus(elementId, item) {
      const expected = this.expectedDisplay(elementId, item)
      if (expected.packed === 0 && expected.loose === 0) return 'bad'
      if (expected.packed === 0 && expected.loose > 0) return 'warn'
      return 'ok'
    },
    entryStatusCounts(entry) {
      let bad = 0
      let warn = 0
      for (const item of this.itemsOf(entry)) {
        const s = this.itemStatus(entry.element.id, item)
        if (s === 'bad') bad++
        else if (s === 'warn') warn++
      }
      return { bad, warn }
    },
    sortEntries(entries) {
      const arr = [...entries]
      if (this.sortMode === 'ruptures') {
        arr.sort((a, b) => {
          const sev = (e) => { const c = this.entryStatusCounts(e); return c.bad * 10 + c.warn }
          return sev(b) - sev(a)
        })
      } else if (this.sortMode === 'stock-asc') {
        arr.sort((a, b) => (this.totalPackedFor(a) + this.totalLooseFor(a)) - (this.totalPackedFor(b) + this.totalLooseFor(b)))
      } else {
        arr.sort((a, b) => String(a.element?.name || '').localeCompare(String(b.element?.name || ''), 'fr'))
      }
      return arr
    },
    /** 3e colonne : drill-in direct + ouverture du popup Ajouter sur (élément, denrée). */
    goToItem({ elementId, itemName }) {
      let entry = this.shopEntries.find((e) => e.element.id === elementId)
      let tab = 'shops'
      if (!entry) {
        entry = this.storageEntries.find((e) => e.element.id === elementId)
        tab = 'storage'
      }
      if (!entry) return
      this.activeTab = tab
      this.drillElement = entry
      const item = this.itemsOf(entry).find((it) => it.name === itemName)
      if (item) this.openMovement(entry.element, item, 'add')
    },
    /** Plats/menu items qui utilisent cette denrée. Ex-miroir de
     * InventoryCountingInterface.itemUsedIn — divergence assumée depuis les
     * retours maquette 17/08 : l'inventaire affiche désormais un compteur +
     * infobulle (itemUsedInNames, liste complète), la Logistique garde la
     * ligne texte tronquée à 3 (hors périmètre de la demande). */
    usedInLabel(item) {
      const arr = Array.isArray(item?.usedIn) ? item.usedIn : []
      const names = arr.map((u) => u?.name || u?.menuItemName).filter(Boolean)
      return [...new Set(names)].slice(0, 3).join(', ')
    },
    totalPackedFor(entry) {
      return this.itemsOf(entry).reduce(
        (sum, item) => sum + this.expectedDisplay(entry.element.id, item).packed, 0,
      )
    },
    totalLooseFor(entry) {
      return Math.round(
        this.itemsOf(entry).reduce(
          (sum, item) => sum + this.expectedDisplay(entry.element.id, item).loose, 0,
        ) * 100,
      ) / 100
    },
    closeDrill() {
      this.drillElement = null
      this.search = ''
    },
    async loadForSpace(spaceId) {
      this._loadedContextKey = this.routeContextKey
      this.loading = true
      try {
        // configId/eventId : le backend résout lui-même (priorité configId > event > 1re config,
        // cf. LogisticsService.getStock) — plus besoin de charger configurations/events avant.
        // Chantier 341 : défaut = 'all' (vue agrégée) SAUF un ?event= présent sans ?configuration=
        // explicite — dans ce cas on laisse le backend résoudre via la config de l'event (deep-link
        // existant depuis Event Predict), sinon 'all' l'écraserait silencieusement.
        const eventId = this.route?.query?.event || null
        const configId = this.route?.query?.configuration || this.route?.query?.config || (eventId ? null : 'all')
        const tasks = [
          this.store.dispatch('logistics/loadStock', { spaceId, configId, eventId }),
          this.loadLatestInventory(spaceId),
          this.loadMarketPriceImages(),
        ]
        if (this.canReconcile) {
          tasks.push(this.store.dispatch('logistics/loadReconciliations', { spaceId }))
          tasks.push(this.store.dispatch('logistics/loadLossesSummary', { spaceId }))
        }
        await Promise.all(tasks)
        // Après loadStock : le périmètre des éléments vient du stock chargé.
        this.fetchPredictedNeed(eventId)
      } finally {
        this.loading = false
      }
    },
    /** Besoin prédit du match ciblé par `?event=`, ou à défaut le prochain event de
     *  l'espace (`nextEventId`, résolu serveur — retour PO 2026-08-19 : Logistic doit
     *  être calibré par défaut, pas seulement via un deep-link explicite). Priorité à
     *  la feuille de réarmement sauvegardée (RestockPlan.restockLines, décision
     *  opérationnelle) sur la prévision brute Event Predict (repli). Hors tout contexte
     *  event, la colonne reste absente : un besoin sans match n'a pas de sens. */
    async fetchPredictedNeed(eventId) {
      this.predictedNeed = null
      const effectiveEventId = eventId || this.store.state.logistics?.nextEventId || null
      if (!effectiveEventId) return

      try {
        const plans = await listRestockPlans(this.currentSpaceId)
        const match = (plans || []).find((p) => (p.selectedEventIds || []).map(String).includes(String(effectiveEventId)))
        if (match) {
          const full = await getRestockPlan(match.id)
          const restockIndex = buildRestockNeedIndex(full?.restockLines)
          if (restockIndex) {
            this.predictedNeed = restockIndex
            return
          }
        }
      } catch (e) {
        console.warn('[logistics] lookup feuille de réarmement échoué, repli Event Predict :', e?.message)
      }

      const elements = [...this.shopEntries, ...this.storageEntries].map((e) => ({
        id: e.element.id,
        name: e.element.name,
      }))
      const { index } = await loadPredictedNeed({
        eventId: effectiveEventId,
        elements,
        menuItems: this.store.state.analyse?.menuItems || [],
        components: this.store.state.analyse?.components || [],
      })
      this.predictedNeed = index
    },
    /** Besoin prédit d'une denrée sur un élément — les lignes Logistic sont keyées
     *  par NOM, la résolution par nom normalisé est donc le chemin nominal ici. */
    predictedNeedFor(elementId, item) {
      return lookupPredictedNeed(this.predictedNeed, elementId, item)
    },
    /** Packs déjà décidés au réarmement pour cette denrée sur cet élément — natif
     *  (packaging.packedCount), null si l'index vient du repli Event Predict (pas
     *  de packs) ou si le conditionnement n'était pas connu sur cette ligne. */
    predictedNeedPacksFor(elementId, item) {
      return lookupPredictedNeedPacks(this.predictedNeed, elementId, item)
    },
    /** Dernier inventaire (tous events) → valeurs grisées + source du reset. */
    async loadLatestInventory(spaceId) {
      try {
        const latest = await getLatestInventory(spaceId)
        this.latestCounts = latest?.inventoryCounts || {}
        this.latestInventoryEventId = latest?.eventId || null
        this.latestInventoryEventName = latest?.eventName || null
      } catch (e) {
        console.warn('[SpaceLogistic] latest inventory indisponible:', e?.message)
        this.latestCounts = {}
        this.latestInventoryEventId = null
        this.latestInventoryEventName = null
      }
    },
    /** Charge une fois l'index MarketPrice.image (id → data-URI) : source réelle
     *  des photos denrées (repli du champ item.picture backend, souvent vide).
     *  Idempotent : ne recharge pas si déjà peuplé. */
    async loadMarketPriceImages() {
      if (Object.keys(this.marketPriceImages).length) return
      try {
        const list = await getMarketPrices()
        const arr = Array.isArray(list) ? list : (list?.data || list?.marketPrices || [])
        const map = {}
        for (const mp of arr) {
          if (mp?.id && mp?.image) map[String(mp.id)] = mp.image
        }
        this.marketPriceImages = map
      } catch (e) {
        console.warn('[SpaceLogistic] market prices images indisponibles:', e?.message)
      }
    },
    /** Photo d'une denrée : champ backend item.picture d'abord, sinon repli sur
     *  l'image du Market Price lié (marketPriceId). MenuItem.picture ignoré
     *  (quasi vide en base — 3/8933). */
    resolveItemPicture(item) {
      if (item?.picture) return item.picture
      const mpId = item?.marketPriceId
      return (mpId && this.marketPriceImages[String(mpId)]) || null
    },
    refresh() {
      const spaceId = this.currentSpaceId
      if (!spaceId) return
      const configId = this.selectedConfigId
      this.store.dispatch('logistics/loadStock', { spaceId, configId })
      this.loadLatestInventory(spaceId)
      if (this.canReconcile) {
        this.store.dispatch('logistics/loadReconciliations', { spaceId })
        this.store.dispatch('logistics/loadLossesSummary', { spaceId })
      }
    },
    /** Stock attendu affiché (level − ventes, casse de pack) — 0/0 si non suivi. */
    expectedDisplay(elementId, item) {
      const expected = this.store.getters['logistics/expectedFor'](elementId, item.name)
      if (!expected) return { packed: 0, loose: 0 }
      return { packed: expected.packed, loose: expected.loose }
    },
    /** Élément candidat au transfert, enrichi du stock actuel de la denrée en cours. */
    elementWithStock(entry, itemName) {
      const expected = itemName ? this.expectedDisplay(entry.element.id, { name: itemName }) : { packed: 0, loose: 0 }
      return { id: entry.element.id, name: entry.element.name, packed: expected.packed, loose: expected.loose, floorGroupId: entry.element.floorGroupId ?? null }
    },
    unitsPerPackFor(elementId, item) {
      const level = this.store.getters['logistics/levelFor'](elementId, item.name)
      // Niveau réel (dernier mouvement) prioritaire, sinon la valeur du référentiel
      // (résolue côté serveur depuis le market price lié à la denrée).
      return level?.unitsPerPack || item.unitsPerPack || null
    },
    /** BUG-259-02 : transferts entrants en attente pour cette denrée sur cet élément. */
    pendingTransfersFor(elementId, itemName) {
      return this.store.getters['logistics/pendingTransfersFor'](elementId, itemName)
    },
    /** BUG-259-02 : transferts émis par cet élément, encore en attente côté destinataire. */
    outgoingPendingTransfersFor(elementId, itemName) {
      return this.store.getters['logistics/outgoingPendingTransfersFor'](elementId, itemName)
    },
    openTransferConfirm(transfer, element, item, unitsPerPack) {
      this.transferConfirmTransfer = transfer
      this.transferConfirmElement = { id: element.id, name: element.name }
      this.transferConfirmItem = item || null
      this.transferConfirmUnitsPerPack = unitsPerPack ?? null
      this.transferConfirmError = null
      this.transferConfirmDialog = true
    },
    async submitTransferConfirm({ movementId, packed, loose }) {
      if (!this.transferConfirmElement) return
      this.transferConfirmSaving = true
      this.transferConfirmError = null
      try {
        await this.store.dispatch('logistics/confirmTransfer', {
          movementId,
          elementId: this.transferConfirmElement.id,
          packed,
          loose,
        })
        this.transferConfirmDialog = false
        this.toast(this.t('logiTransferConfirmed'), 'success')
      } catch (e) {
        this.transferConfirmError =
          e?.response?.data?.message || e?.userMessage || this.t('logiTransferConfirmError')
      } finally {
        this.transferConfirmSaving = false
      }
    },
    /** Comptage du dernier inventaire pour ce (shop, item) — null si absent. */
    countedFor(elementId, item) {
      const count = this.latestCounts?.[elementId]?.[item.id]
      if (!count) return null
      return {
        packedUnits: Number(count.packedUnits) || 0,
        looseUnits: Number(count.looseUnits) || 0,
        isCounted: !!count.isCounted,
      }
    },
    async openMovement(element, item, mode) {
      this.movementElement = { id: element.id, name: element.name, floorGroupId: element.floorGroupId ?? null }
      this.movementItem = item
      this.movementMode = mode
      this.movementError = null
      this.movementMarketPrices = []
      this.movementMarketPricesLoading = true
      this.movementDialog = true
      try {
        // Market prices candidats pour CETTE denrée — scopé, pas le catalogue complet.
        this.movementMarketPrices = await this.store.dispatch('logistics/loadMarketPricesForItem', {
          spaceId: this.currentSpaceId,
          itemKey: item.name,
        })
      } finally {
        this.movementMarketPricesLoading = false
      }
    },
    async submitMovement(payload) {
      const spaceId = this.currentSpaceId
      if (!spaceId || !this.movementElement || !this.movementItem) return
      this.movementSaving = true
      this.movementError = null
      try {
        await this.store.dispatch('logistics/createMovement', {
          spaceId,
          elementId: this.movementElement.id,
          itemKey: this.movementItem.name,
          ...payload,
        })
        this.movementDialog = false
        this.toast(this.t('logiMovementSaved'), 'success')
      } catch (e) {
        this.movementError =
          e?.response?.data?.message || e?.userMessage || this.t('logiMovementError')
      } finally {
        this.movementSaving = false
      }
    },
    openHistory(element) {
      this.historyElement = { id: element.id, name: element.name }
      this.historyDrawer = true
    },
    openSimulate() {
      this.simulateError = null
      this.simulateResult = null
      this.simulateDialog = true
    },
    /**
     * QA : simule une vente puis compare l'attendu avant/après pour les denrées
     * réellement impactées (consumptionPreview renvoyé par le backend). L'« avant »
     * DOIT être lu du state courant AVANT le loadStock qui suit (sinon écrasé).
     */
    async submitSimulateSale({ elementId, lines, realMode }) {
      const spaceId = this.currentSpaceId
      if (!spaceId) return
      this.simulateSaving = true
      this.simulateError = null
      try {
        const res = await this.store.dispatch('logistics/simulateSale', { spaceId, elementId, lines, realMode })
        const itemKeys = [...new Set((res?.consumptionPreview || []).map((c) => c.itemKey))]
        const before = {}
        for (const key of itemKeys) before[key] = this.expectedDisplay(elementId, { name: key })
        await this.store.dispatch('logistics/loadStock', { spaceId, configId: this.selectedConfigId })
        const shopEntry = this.shopEntries.find((e) => e.element.id === elementId)
        this.simulateResult = {
          elementId,
          elementName: shopEntry?.element?.name || res?.elementName,
          lines: itemKeys.map((itemKey) => ({
            itemKey,
            before: before[itemKey],
            after: this.expectedDisplay(elementId, { name: itemKey }),
          })),
        }
      } catch (e) {
        this.simulateError = e?.response?.data?.message || e?.userMessage || this.t('logiSimulateError')
      } finally {
        this.simulateSaving = false
      }
    },
    async purgeSimulated(elementId) {
      const spaceId = this.currentSpaceId
      if (!spaceId || !elementId) return
      this.simulatePurging = true
      try {
        await this.store.dispatch('logistics/purgeSimulatedSales', { spaceId, elementId })
        this.simulateResult = null
        this.simulateDialog = false
        this.toast(this.t('logiSimulatePurged'), 'success')
      } catch (e) {
        this.toast(this.t('logiSimulatePurgeError'), 'error')
      } finally {
        this.simulatePurging = false
      }
    },
    /**
     * Inventory Reset : construit les lignes depuis le référentiel courant ×
     * comptages du dernier inventaire. Toute ligne suivie (niveau existant) ou
     * comptée est remplacée par sa valeur comptée (0 si non comptée) — spec :
     * « remplacer toutes les valeurs par les valeurs comptées ».
     */
    async confirmReset() {
      const spaceId = this.currentSpaceId
      if (!spaceId) return
      const lines = []
      const seen = new Set()
      const pushLine = (elementId, item) => {
        const key = `${elementId}::${item.name}`
        if (seen.has(key)) return
        const counted = this.countedFor(elementId, item)
        const level = this.store.getters['logistics/levelFor'](elementId, item.name)
        if (!counted && !level) return // jamais suivi ni compté → rien à reseter
        seen.add(key)
        const line = {
          elementId,
          itemKey: item.name,
          countedPacked: counted?.packedUnits ?? 0,
          countedLoose: counted?.looseUnits ?? 0,
        }
        const upp = this.unitsPerPackFor(elementId, item)
        if (upp) line.unitsPerPack = Number(upp)
        lines.push(line)
      }
      for (const entry of this.shopEntries) {
        for (const item of this.itemsOf(entry)) pushLine(entry.element.id, item)
      }
      for (const entry of this.storageEntries) {
        for (const item of this.itemsOf(entry)) pushLine(entry.element.id, item)
      }
      // Niveaux suivis dont l'item a quitté le référentiel (menu changé, renommage) :
      // inclus à 0 compté — « toutes les valeurs remplacées par les valeurs comptées »,
      // sinon ils survivraient au reset avec une valeur périmée.
      for (const level of Object.values(this.store.state.logistics?.levels || {})) {
        pushLine(level.elementId, { name: level.itemKey, id: null, marketPriceId: level.marketPriceId })
      }
      if (!lines.length) {
        this.toast(this.t('logiResetNothing'), 'warning')
        return
      }
      try {
        await this.store.dispatch('logistics/reset', {
          spaceId,
          eventId: this.latestInventoryEventId,
          eventName: this.latestInventoryEventName,
          lines,
        })
        this.resetDialog = false
        this.toast(this.t('logiResetDone'), 'success')
      } catch (e) {
        this.toast(e?.response?.data?.message || this.t('logiResetError'), 'error')
      }
    },
    async downloadReco(reco) {
      const day = this.formatDate(reco.createdAt).replace(/\s/g, '-')
      try {
        await downloadReconciliationCsv(reco.id, `reconciliation-${day}.csv`)
      } catch (e) {
        this.toast(this.t('logiDownloadError'), 'error')
      }
    },
    toast(text, color = 'success') {
      this.snackbarText = text
      this.snackbarColor = color
      this.snackbar = true
    },
    onLossesToast({ message, color }) {
      this.toast(message, color)
    },
    async downloadAllLosses() {
      const spaceId = this.currentSpaceId
      if (!spaceId) return
      await downloadLossesCsv(spaceId, `pertes-transfert-${spaceId}.csv`)
    },
    goBack() {
      const spaceId = this.route?.params?.spaceId
      if (window.history.length > 1) this.router.back()
      else if (spaceId) this.router.push({ name: 'space-analyse', params: { spaceId } })
      else this.router.push('/spaces')
    },
    onToolboxSelect(value) {
      const tool = TOOLBOX_ITEMS.find((item) => item.value === value)
      if (tool) this.navigateToTool(tool)
    },
    navigateToTool(tool) {
      if (tool.value === 'logistic') return
      const spaceId = this.currentSpaceId
      const ev = this.route?.query?.event || null
      if (tool.value === 'analyse') {
        this.router.push({ name: 'space-analyse', params: { spaceId } })
      } else if (tool.value === 'live') {
        // Live = route DÉDIÉE `space-live` (pas un mode `?toolbox=`, cf.
        // router/index.js) : sans cette branche le `else` ci-dessous envoyait
        // sur Analyse avec un toolbox inconnu.
        this.router.push({ name: 'space-live', params: { spaceId } })
      } else if (tool.value === 'space-inventory') {
        this.router.push({ name: 'space-inventory', params: { spaceId }, query: ev ? { event: ev } : {} })
      } else if (tool.value === 'space-pre-inventory') {
        this.router.push({ name: 'space-pre-inventory', params: { spaceId }, query: ev ? { event: ev } : {} })
      } else if (tool.value === 'restock') {
        this.router.push({ name: 'space-restock', params: { spaceId }, query: ev ? { event: ev } : {} })
      } else {
        this.router.push({ name: 'space-analyse', params: { spaceId }, query: { toolbox: tool.value } })
      }
    },
  },
  beforeUnmount() {
    this.store.dispatch('logistics/clear')
  },
}
</script>

<style scoped>
.space-logistic-view {
  --lg-bg: var(--fb-bg, #f5f5f5);
  --lg-surface: var(--fb-surface, #ffffff);
  --lg-border: var(--fb-border, #e5e7eb);
  --lg-text: var(--fb-text, #212121);
  --lg-muted: var(--fb-muted, #6b7280);
  --lg-primary: var(--fb-primary, #ff3131);
  height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--lg-bg);
  color: var(--lg-text);
}

/* ── Header : bandeau rouge (style MarketPriceListView) ── */
/* Bandeau rouge en carte arrondie détachée (marge tout autour). */
.lg-header {
  /* 1er enfant de la colonne centre : gutters fournis par .lg-layout. */
  margin: 0 0 16px;
  border-radius: 18px;
  background: #ff3131;
  box-shadow: 0 8px 24px rgba(255, 49, 49, .28);
  flex-shrink: 0;
  /* Épinglé au scroll sous le header blanc (miroir .ede-summary EventPredict). */
  position: sticky;
  top: 0;
  z-index: 20;
}
.lg-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px;
  flex-wrap: wrap;
}
.lg-header__left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.lg-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex; align-items: center; justify-content: center;
  color: #fff; flex-shrink: 0;
}
.lg-header__icon :deep(.v-icon) { color: #fff; }
/* Icône-bouton : bascule le panneau de filtres. */
.lg-header__toggle {
  width: 44px; height: 44px; border: 0; border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; cursor: pointer;
  color: #fff;
  transition: background .15s ease, transform .15s ease;
}
.lg-header__toggle:hover { background: rgba(255, 255, 255, .32); }
.lg-header__toggle:active { transform: scale(.94); }
.lg-header__toggle:focus-visible { outline: 2px solid rgba(255, 255, 255, .85); outline-offset: 2px; }
.lg-header__text { min-width: 0; }
.lg-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #fff; line-height: 1.2; }
.lg-header__space { color: rgba(255, 255, 255, .78); font-weight: 700; }
.lg-header__subtitle { margin: 3px 0 0; font-size: 12.5px; color: rgba(255, 255, 255, .75); min-height: 15px; }
.lg-header__right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
/* Sélecteur d'espace dans le bandeau : texte en blanc sur le rouge. */
.lg-header__switcher { flex-shrink: 0; }
.lg-header__switcher :deep(.wsh-space-trigger) { color: #fff; }
.lg-header__switcher :deep(.wsh-space-trigger:hover) { background-color: rgba(255, 255, 255, .16); }
.lg-header__switcher :deep(.wsh-space-name) { color: #fff; }
.lg-header__switcher :deep(.wsh-space-chevron) { color: rgba(255, 255, 255, .85); }

/* Retour + actions : pilule blanche translucide bordée, alignée sur
   Space Inventory (.si-back / .si-actions :deep(.v-btn:not(.si-save-btn))). */
.lg-back,
.lg-hbtn,
.lg-reset-btn,
.lg-simulate-btn {
  border: 1.5px solid rgba(255, 255, 255, 0.62) !important;
  border-radius: 100px !important;
  background: rgba(255, 255, 255, 0.1) !important;
  color: #fff !important;
}
.lg-back :deep(.v-icon),
.lg-hbtn :deep(.v-icon),
.lg-reset-btn :deep(.v-icon),
.lg-simulate-btn :deep(.v-icon) {
  color: #fff !important;
}
.lg-back:hover,
.lg-hbtn:hover,
.lg-reset-btn:hover,
.lg-simulate-btn:hover {
  border-color: #fff !important;
  background: #fff !important;
  color: var(--lg-primary) !important;
}
.lg-back:hover :deep(.v-icon),
.lg-hbtn:hover :deep(.v-icon),
.lg-reset-btn:hover :deep(.v-icon),
.lg-simulate-btn:hover :deep(.v-icon) {
  color: var(--lg-primary) !important;
}
.lg-hbtn,
.lg-reset-btn,
.lg-simulate-btn {
  text-transform: none;
  font-weight: 700;
  white-space: nowrap;
}

/* Recherche (blanc translucide sur rouge) */
.lg-search-field { min-width: 180px; max-width: 240px; }
/* Boutons harmonisés Market Price List : pilules, une ligne, taille contenue. */
.lg-header__right :deep(.v-btn) {
  border-radius: 100px !important;
  min-height: 34px;
  text-transform: none;
  white-space: nowrap;
  font-size: 12.5px;
}
/* Barre de recherche du panneau latéral : alignée sur le contenu du panneau. */
.lg-panel-search :deep(.appsb__inner) {
  padding-left: 0;
  padding-right: 0;
}

.lg-tabs {
  display: flex;
  gap: 4px;
  /* Dans la colonne centre : gutters fournis par .lg-layout. */
  padding: 0 0 10px;
  flex-shrink: 0;
}
.lg-tab {
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  border: 0;
  border-radius: 10px 10px 0 0;
  background: transparent;
  color: var(--lg-muted);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
}
.lg-tab-active { background: var(--lg-surface); color: var(--lg-primary); }
.lg-tab-count { margin-left: 4px; font-weight: 500; }

/* Défilement indépendant par colonne : la page elle-même ne scrolle plus
   (header/onglets fixes), .lg-layout occupe la hauteur restante et chaque
   colonne (aside/main/lg-agg) scrolle en interne — évite la double
   scrollbar (page + colonne agrégat) qui apparaissait avant. */
.lg-layout {
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr) 340px;
  gap: 18px;
  padding: 18px 24px 24px;
  align-items: stretch;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.lg-layout-full { grid-template-columns: 1fr; }
/* Panneau de filtres masqué : la colonne aside disparaît, le contenu s'élargit. */
.lg-layout--no-aside { grid-template-columns: 1fr 280px; }

.lg-sort-bar { display: flex; align-items: center; gap: 10px; margin: 0 2px 12px; }
.lg-sort-label { font-size: 0.76rem; font-weight: 700; color: var(--lg-muted); text-transform: uppercase; letter-spacing: 0.03em; }
.lg-aside {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
.lg-panel {
  background: var(--lg-surface);
  border: 1px solid var(--lg-border);
  border-radius: var(--fb-radius-panel, 12px);
  padding: 12px;
}
/* Titre de section = kicker EventPredict (.ep-metrics-kicker) : 11px, gras 800,
   letter-spacing .08em. Couleur = var thème (dark-safe). */
.lg-panel-title {
  display: flex;
  align-items: center;
  font-size: 0.6875rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--lg-muted);
  margin-bottom: 8px;
}
.lg-panel-empty { color: var(--fb-faint, #9ca3af); font-size: 0.82rem; }

.lg-filter-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--lg-muted);
  margin: 12px 0 6px;
}
.lg-chip-row { display: flex; flex-wrap: wrap; gap: 6px; }
.lg-chip {
  border: 1px solid var(--lg-border);
  background: var(--lg-surface);
  color: var(--lg-muted);
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 140ms ease, color 140ms ease, background 140ms ease;
}
.lg-chip:hover { border-color: rgba(255, 49, 49, 0.4); background: rgba(255, 49, 49, 0.05); color: #ff3131; }
.lg-chip-active {
  background: var(--lg-primary);
  border-color: var(--lg-primary);
  color: #fff;
}
.lg-chip-active:hover { background: var(--lg-primary); color: #fff; }

/* ── Champ Bootstrap (section Filtres) ── */
.lg-bs-field .input-group-text {
  background: var(--lg-surface);
  border: 1px solid var(--lg-border);
  border-right: 0;
  color: var(--lg-muted);
}
.lg-bs-field .form-control {
  border: 1px solid var(--lg-border);
  border-left: 0;
  font-size: 0.85rem;
  color: var(--lg-text);
  /* Sans ça, le `background-color` blanc de Bootstrap (chargé globalement dans
     main.js) reprend la main → champ blanc à texte blanc en thème sombre. */
  background: var(--lg-surface);
  box-shadow: none;
}
.lg-bs-field .form-control::placeholder { color: var(--fb-faint, #9ca3af); }
.lg-bs-field:focus-within .input-group-text,
.lg-bs-field:focus-within .form-control { border-color: #ff3131; }
.lg-bs-field:focus-within {
  border-radius: 8px;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .12);
}

/* ── Bouton icône Bootstrap (download réconciliation) ── */
.lg-bs-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 30px; height: 30px; padding: 0; flex-shrink: 0;
  border: 1px solid var(--lg-border); border-radius: 8px;
  background: var(--lg-surface); color: var(--lg-muted);
  cursor: pointer; transition: all .15s ease;
}
.lg-bs-icon-btn:hover { border-color: #ff3131; color: #ff3131; background: rgba(255, 49, 49, .06); }

.lg-summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
/* Cellule KPI = parité EventPredict/Analyse (wsh-kpi-cell) : fond blanc, border
   neutre + rail latéral 3px coloré, label majuscule discret, valeur sombre. */
.lg-kpi-cell {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 7px 10px 7px 12px;
  border: 1px solid var(--lg-border);
  border-radius: 9px;
  background: var(--lg-surface);
  box-shadow: var(--fb-shadow-card, 0 1px 2px rgba(15, 23, 42, 0.04));
}
.lg-kpi-cell::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: var(--lg-kpi, #64748b);
}
.lg-kpi-label {
  color: #64748b;
  font-size: 8px;
  font-weight: 700;
  line-height: 1.1;
  margin-bottom: 2px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lg-kpi-value {
  font-size: 16px;
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.2px;
  color: var(--lg-text);
  font-variant-numeric: tabular-nums;
}
.lg-summary-anchor { margin-top: 10px; font-size: 0.76rem; color: var(--lg-muted); }

/* ── Filtre restylé : carte accordéon calquée sur InventoryFilterPanel ── */
.lg-filter-panel {
  border: 1px solid var(--lg-border);
  border-radius: 18px;
  background: var(--lg-surface);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.04));
  padding: 12px 10px;
}
.lg-fp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  min-height: 28px;
}
.lg-fp-title { font-size: 13px; font-weight: 700; color: var(--lg-text); margin: 0; }
.lg-fp-reset-inline {
  display: inline-flex;
  align-items: center;
  border: 0;
  background: transparent;
  color: #ff3131;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.lg-fp-accordion {
  border: 1px solid var(--lg-border);
  border-radius: 10px;
  overflow: hidden;
}
/* En-tête d'accordéon = kicker plat (parité panneau de droite). */
.lg-fp-section {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  min-height: 40px;
  border: 0;
  background: transparent;
  color: #64748b;
  font-size: 0.6875rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  cursor: pointer;
  text-align: left;
}
.lg-fp-section--active { background: transparent; color: #ff3131; }
.lg-fp-section-actions { display: inline-flex; align-items: center; gap: 6px; }
.lg-fp-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #ff3131;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
.lg-fp-section-body { padding: 10px 12px 14px; background: var(--lg-surface); }

.lg-reco-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px solid var(--fb-subtle, #f3f4f6);
}
.lg-reco-row:last-child { border-bottom: 0; }
.lg-reco-name { font-size: 0.82rem; font-weight: 600; }
.lg-reco-date { font-size: 0.72rem; color: var(--lg-muted); }

.lg-losses-summary { font-size: 0.82rem; font-weight: 600; padding: 4px 0; }
.lg-losses-actions { display: flex; align-items: center; gap: 8px; margin-top: 6px; }
.lg-losses-view-btn { text-transform: none; padding: 0 8px; }

.lg-main { min-width: 0; height: 100%; min-height: 0; overflow-y: auto; padding-right: 2px; }
.lg-center { display: flex; justify-content: center; padding: 48px 0; }
.lg-row-skeleton { pointer-events: none; }
.lg-item-skeleton { border-radius: var(--fb-radius-control, 10px); overflow: hidden; }

/* Niveau 1 : liste des PDV */
.lg-rows { display: flex; flex-direction: column; gap: 10px; }

/* Niveau 2 : grille de cartes-articles */
.lg-item-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
}
.lg-card-empty { color: var(--fb-faint, #9ca3af); font-size: 0.85rem; padding: 24px 8px; text-align: center; }

.lg-reset-title { display: flex; align-items: center; font-weight: 700; padding: 16px 20px 8px; }
.lg-reset-event { margin-top: 10px; font-size: 0.88rem; }
.lg-dialog { border-radius: 16px; }

@media (max-width: 900px) {
  /* Empilé : plus de colonnes indépendantes — la page entière redevient
     scrollable normalement (1 seule scrollbar, celle du document). */
  .space-logistic-view { height: auto; overflow: visible; }
  .lg-layout { grid-template-columns: 1fr; overflow: visible; height: auto; }
  .lg-main { height: auto; overflow: visible; }
  /* Empilé : la liste d'abord (l'essentiel), puis l'agrégat, filtres en dernier
     (déjà visibles, pas besoin de les voir avant la liste elle-même). */
  .lg-main { order: 1; }
  .lg-aside { position: static; order: 2; height: auto; overflow: visible; }
  .lg-item-grid { grid-template-columns: 1fr; }
  .lg-header__inner { padding: 12px 16px; }
  .lg-layout { padding: 12px 16px 24px; }
  .lg-search-field { max-width: none; flex: 1 1 auto; }
}

@media (max-width: 560px) {
  .lg-header__text { min-width: 0; }
  .lg-header__title { font-size: 17px; }
  .lg-header__right { width: 100%; justify-content: flex-start; }
  .lg-row { flex-wrap: wrap; }
  .lg-row-stats { justify-content: flex-start; }
}

/* ===================== DARK MODE =====================
   La vue est déclarée dans le contrat `--fb-*` de style.css : fonds, bordures
   et textes basculent seuls via `--lg-*`. Ne restent que les kickers ardoise
   (#64748b), calibrés pour du texte sur fond clair. Le bandeau rouge #ff3131 et
   ses contrôles blancs sont identiques dans les deux thèmes (parité Analyse). */
.v-theme--dataFridayDark .lg-kpi-label,
.v-theme--dataFridayDark .lg-fp-section {
  color: #94a3b8;
}
</style>
