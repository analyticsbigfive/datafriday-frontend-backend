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
                 (fond blanc, rail latéral coloré, label majuscule, valeur sombre).
                 Section repliable indépendamment des autres (retour utilisateur 08/2026). -->
            <SidebarPanel :title="t('logiSummary')" storage-key="logistic-summary">
              <template #icon><ClipboardList :size="15" /></template>
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
            </SidebarPanel>

            <!-- Filtres — carte accordéon calquée sur Space Inventory
                 (InventoryFilterPanel) : carte blanche, titre .lg-fp-section,
                 badges #ff3131, bouton reset tonal. Facette RÉELLE Logistic : type de
                 denrée (la recherche est sous le bandeau). Masqué en Ventilation, où
                 il ne filtre rien (le filtre Fournisseur est dans sa barre). -->
            <SidebarPanel v-if="activeTab !== 'ventilation'" :title="t('logiFilters')" storage-key="logistic-filters">
              <template v-if="itemKindFilter.length || elementSearch" #meta>
                <button type="button" class="lg-fp-reset-inline" @click="resetLogisticFilters">
                  <v-icon size="14" class="mr-1">mdi-refresh</v-icon>
                  {{ t('invResetFilters') }}
                </button>
              </template>

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
            </SidebarPanel>

            <!-- Section Réconciliation : super admin / rôles avec la permission -->
            <SidebarPanel v-if="canReconcile" :title="t('logiReconciliation')" storage-key="logistic-reconciliation">
              <template #icon><GitCompare :size="15" /></template>
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
            </SidebarPanel>

            <!-- BUG-259-02 : section "Pertes" (transferts confirmés avec écart), séparée
                 de Réconciliation, qui modélise un écart de comptage, pas de transfert. -->
            <SidebarPanel v-if="canReconcile" :title="t('logiLossesTitle')" storage-key="logistic-losses">
              <template #icon><TrendingDown :size="15" /></template>
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
            </SidebarPanel>
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
                       niveau liste ; en drill-in, icône décorative (pas d'aside).
                       Desktop uniquement — cf. .lg-mobile-tools-trigger ci-dessous
                       pour l'équivalent mobile (ouvre le drawer d'outils, pas l'aside). -->
                  <WorkspacePanelToggle
                    v-if="!drillElement"
                    class="lg-header__toggle--desktop"
                    :open="showFilters"
                    :label="t('logiToggleFilters')"
                    @toggle="showFilters = !showFilters"
                  />
                  <div v-else class="lg-header__icon">
                    <v-icon size="22">mdi-warehouse</v-icon>
                  </div>
                  <!-- Mobile uniquement : ouvre WorkspaceMobileToolDrawer (nav entre
                       outils F&B), remplace le toggle filtres (aside masquée < 560px). -->
                  <button
                    v-if="!drillElement"
                    type="button"
                    class="lg-mobile-tools-trigger"
                    @click="showMobileToolDrawer = true"
                    :aria-label="t('srToolsLabel')"
                  >
                    <v-icon size="20">mdi-menu</v-icon>
                  </button>
                  <div class="lg-header__text">
                    <h1 class="lg-header__title">
                      {{ drillElement ? drillElement.element.name : t('logiPageTitle') }}
                    </h1>
                    <p v-if="drillElement" class="lg-header__subtitle">
                      {{ t('logiPageTitle') }}<span v-if="spaceLabel"> · {{ spaceLabel }}</span>
                    </p>
                    <!-- Puce de configuration : desktop uniquement, masquée < 560px
                         (.lg-header__config-wrap), toutes les configurations sont actives
                         par défaut sur mobile. Sélecteur d'events : partout. -->
                    <div v-else class="lg-header__selects">
                      <!-- Pas de configuration en Ventilation (Ulrich 2026-10-09) : le
                           périmètre vient des matchs choisis. -->
                      <div v-if="activeTab !== 'ventilation'" class="lg-header__config-wrap">
                        <LogisticConfigSelect
                          :configurations="configurations"
                          :model-value="selectedConfigId || 'all'"
                          @update:model-value="onConfigSelect"
                        />
                      </div>
                      <LogisticEventSelect
                        :events="eventSelection.events"
                        :model-value="eventSelection.selectedIds"
                        :label="eventSelection.label"
                        @update:model-value="eventSelection.select"
                      />
                    </div>
                  </div>
                </div>

                <div class="lg-header__right">
                  <!-- PIN d'accès des logisticiens, en Ventilation seulement (maquette
                       Bertrand 2026-10-09) : celui du premier match de la sélection. -->
                  <span v-if="!drillElement && activeTab === 'ventilation' && ventilationAccess.status?.window" class="lg-band-pin">
                    <template v-if="ventilationAccess.pin">{{ t('logiBandPin') }} : <strong>{{ ventilationAccess.pin }}</strong></template>
                    <template v-else>{{ t('logiBandPinStopped') }}</template>
                  </span>
                  <v-btn
                    v-if="drillElement"
                    variant="outlined"
                    size="small"
                    class="lg-hbtn"
                    @click="openHistory(drillElement.element)"
                    :title="t('logiHistoryBtn')"
                  >
                    <v-icon size="15" class="mr-1">mdi-history</v-icon>
                    <span class="lg-hbtn-label">{{ t('logiHistoryBtn') }}</span>
                  </v-btn>
                  <!-- Mobile uniquement (< 900px) : ouvre .lg-right-col (alertes restock +
                       tâches) en panneau droit — sinon elle atterrit tout en bas de page,
                       après une liste PDV parfois longue (cf. .lg-right-col--open). -->
                  <button
                    v-if="!drillElement"
                    type="button"
                    class="lg-mobile-right-trigger"
                    @click="showMobileRightPanel = true"
                    :aria-label="t('logiAggTitle')"
                  >
                    <v-icon size="20">mdi-play-circle-outline</v-icon>
                    <span v-if="aggregateStats.bad" class="lg-mobile-right-trigger__badge">{{ aggregateStats.bad }}</span>
                  </button>
                </div>
              </div>
            </header>

            <!-- Recherche collée sous le bandeau rouge, même largeur (design de
                 l'Inventaire pré-événement) : articles du PDV en drill-in, sinon
                 PDV + articles. -->
            <div class="lg-search-wrap">
              <AppSearchBar
                v-if="drillElement"
                v-model="search"
                :placeholder="t('logiSearchPlaceholder')"
                :clear-label="t('logiClear') || 'Clear'"
              />
              <AppSearchBar
                v-else
                v-model="elementSearch"
                :placeholder="t('logiSearchAllPlaceholder')"
                :clear-label="t('logiClear') || 'Clear'"
              />
            </div>

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
                <span class="lg-tab-label-full">{{ t(tab.labelKey) }}</span>
                <span class="lg-tab-label-short">{{ t(tab.labelKeyShort) }}</span>
                <span class="lg-tab-count">({{ tabCount(tab.value) }})</span>
              </button>
              <!-- Mode Ventilation : ce qu'il reste à déposer d'après la feuille de
                   réarmement du match (demande Bertrand 2026-10-08). -->
              <button
                type="button"
                class="lg-tab"
                :class="{ 'lg-tab-active': activeTab === 'ventilation' }"
                :aria-pressed="activeTab === 'ventilation'"
                @click="activeTab = 'ventilation'"
              >
                <v-icon size="16" class="mr-1">mdi-truck-delivery-outline</v-icon>
                <span>{{ t('logiVentilationBtn') }}</span>
                <span class="lg-tab-count">({{ ventilation.groups.length }})</span>
              </button>
              <!-- QR code des logisticiens (accès PIN à la feuille de ventilation). -->
              <button
                type="button"
                class="lg-tab lg-tab--qr"
                :title="t('logiVentilationAccessTitle')"
                :aria-label="t('logiVentilationAccessTitle')"
                @click="ventilation.accessDialog = true"
              >
                <v-icon size="18">mdi-qrcode</v-icon>
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
            <!-- ── NIVEAU 1 ter : mode Ventilation (à déposer, par article) ────── -->
            <template v-else-if="!drillElement && activeTab === 'ventilation'">
              <LogisticVentilationView
                :groups="ventilation.visibleGroups"
                :storages="ventilation.storages"
                :mode="ventilation.viewMode"
                :plan-name="ventilation.planName"
                :source="needSource"
                :loading="ventilation.loading"
                :event-predict-route="eventPredictRoute"
                :can-confirm="!!ventilation.eventId"
                :search="elementSearch"
                show-print
                :supplier-options="ventilation.supplierOptions"
                :supplier-filter="ventilation.supplierFilter"
                @update:supplier-filter="ventilation.supplierFilter = $event"
                @update:mode="ventilation.setViewMode"
                @confirm="openDepositConfirm"
                @print="printDialog = true"
              />
              <LogisticVentilationDeposits
                class="mt-3"
                :movements="ventilation.movements"
                :cancelling-id="ventilation.cancellingId"
                @cancel="cancelDeposit"
              />
            </template>

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
                <button
                  type="button"
                  class="lg-icon-btn lg-sort-bar__print"
                  :title="t('logiPrintTitle')"
                  :aria-label="t('logiPrintTitle')"
                  @click="printDialog = true"
                >
                  <v-icon size="20">mdi-printer-outline</v-icon>
                </button>
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
                :need-source="needSource"
                :units-per-pack-for="unitsPerPackFor"
                :search="elementSearch"
                @print="printDialog = true"
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
                  :need-source="needSource"
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

          <!-- Colonne droite : agrégat transversal ruptures/stock bas + panneau Tasks
               Restocker, niveau liste uniquement. Chaque section se replie/déplie
               indépendamment (SidebarPanel), la colonne elle-même scrolle si les deux
               sont ouvertes en même temps (retour utilisateur 08/2026 : plus de hauteur
               imposée à l'une par la présence de l'autre). -->
          <!-- Backdrop mobile uniquement : ferme .lg-right-col au clic hors panneau. -->
          <div
            v-if="!drillElement && showMobileRightPanel"
            class="lg-right-col-backdrop"
            @click="showMobileRightPanel = false"
          ></div>

          <div v-if="!drillElement" class="lg-right-col" :class="{ 'lg-right-col--open': showMobileRightPanel }">
            <!-- Fermeture, mobile uniquement (panneau droit en overlay < 900px). -->
            <button
              type="button"
              class="lg-right-col__close"
              :aria-label="t('logiClear') || 'Close'"
              @click="showMobileRightPanel = false"
            >
              <v-icon size="18">mdi-close</v-icon>
            </button>
            <SidebarPanel :title="t('logiAggTitle')" storage-key="logistic-restock-alerts">
              <template #icon><v-icon size="15">mdi-alert-decagram-outline</v-icon></template>
              <LogisticAggregateView
                :stats="aggregateStats"
                :loading="loading || stockLoading"
                @go="goToItem"
              />
            </SidebarPanel>
            <SidebarPanel :title="t('lgTasksTitle')" storage-key="logistic-tasks">
              <template #icon><v-icon size="15">mdi-clipboard-check-outline</v-icon></template>
              <template #meta>
                <button
                  type="button"
                  class="lg-tasks-refresh"
                  :title="t('lgTasksRefresh')"
                  :disabled="$refs.tasksPanelRef?.loading"
                  @click="$refs.tasksPanelRef?.fetchTasks()"
                >
                  <v-icon size="15" :class="{ 'lg-tasks-refresh-spin': $refs.tasksPanelRef?.loading }">mdi-refresh</v-icon>
                </button>
              </template>
              <LogisticTasksPanel ref="tasksPanelRef" :space-id="currentSpaceId" />
            </SidebarPanel>
          </div>
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

        <LogisticPrintDialog v-model="printDialog" :build-table="buildPrintTable" />
        <LogisticVentilationAccessDialog
          v-model="ventilation.accessDialog"
          :status="ventilationAccess.status"
          :loading="ventilationAccess.loading"
          :busy="ventilationAccess.busy"
          :error="ventilationAccess.error"
          :has-event="eventSelection.selectedIds.length > 0"
          :space-name="currentSpace?.name || ''"
          @action="ventilationAccess.run($event, currentSpaceId)"
        />
        <LogisticDepositConfirmDrawer
          v-model="ventilation.dialog"
          :deposit="ventilation.target"
          :saving="ventilation.saving"
          :error="ventilation.error"
          @submit="submitDeposit"
        />
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

        <!-- Mobile uniquement : drawer de nav entre outils F&B (déclenché par
             .lg-mobile-tools-trigger, remplace le WorkspaceToolSelect de l'aside
             masquée sur mobile). -->
        <WorkspaceMobileToolDrawer
          v-model="showMobileToolDrawer"
          :items="toolboxSelectItems"
          current-value="logistic"
          :title="t('srToolsLabel')"
          @select="onToolboxSelect"
        />

        <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3500">
          {{ snackbarText }}
        </v-snackbar>
      </div>
    </v-main>
  </v-app>
</template>

<script>
import { ref, reactive } from 'vue'
import { useStore } from 'vuex'
import { useRoute, useRouter } from 'vue-router'
import { safePush } from '@/utils/chunkReload'
import { useI18n } from '@/i18n/useI18n'
import { useInventoryLivePolling } from '@/composables/useInventoryLivePolling'
import WorkspaceAppHeader from '@/components/WorkspaceAppHeader.vue'
import AppSearchBar from '@/components/common/AppSearchBar.vue'
import WorkspaceToolSelect from '@/components/WorkspaceToolSelect.vue'
import LogisticElementRow from '@/components/space-workspace/logistic/LogisticElementRow.vue'
import LogisticItemCard from '@/components/space-workspace/logistic/LogisticItemCard.vue'
import LogisticMovementDialog from '@/components/space-workspace/shared/LogisticMovementDialog.vue'
import LogisticTransferConfirmDrawer from '@/components/space-workspace/logistic/drawers/LogisticTransferConfirmDrawer.vue'
import LogisticDepositConfirmDrawer from '@/components/space-workspace/logistic/drawers/LogisticDepositConfirmDrawer.vue'
import LogisticLossesDrawer from '@/components/space-workspace/logistic/drawers/LogisticLossesDrawer.vue'
import LogisticHistoryDrawer from '@/components/space-workspace/logistic/drawers/LogisticHistoryDrawer.vue'
import LogisticAggregateView from '@/components/space-workspace/logistic/LogisticAggregateView.vue'
import LogisticTasksPanel from '@/components/space-workspace/logistic/LogisticTasksPanel.vue'
import SidebarPanel from '@/components/SidebarPanel.vue'
import LogisticConfigSelect from '@/components/space-workspace/logistic/LogisticConfigSelect.vue'
import LogisticByItemView from '@/components/space-workspace/logistic/LogisticByItemView.vue'
import LogisticVentilationView from '@/components/space-workspace/logistic/LogisticVentilationView.vue'
import LogisticVentilationDeposits from '@/components/space-workspace/logistic/LogisticVentilationDeposits.vue'
import LogisticVentilationAccessDialog from '@/components/space-workspace/logistic/dialogs/LogisticVentilationAccessDialog.vue'
import LogisticPrintDialog from '@/components/space-workspace/logistic/dialogs/LogisticPrintDialog.vue'
import LogisticEventSelect from '@/components/space-workspace/logistic/LogisticEventSelect.vue'
import { getLatestInventory } from '@/api/endpoints/inventory.api'
import { downloadReconciliationCsv, downloadLossesCsv } from '@/api/endpoints/logistics.api'
import { getMarketPrices } from '@/api/endpoints/market.price.api'
import { ClipboardList, GitCompare, Download, TrendingDown } from 'lucide-vue-next'
import WorkspacePanelToggle from '@/components/WorkspacePanelToggle.vue'
import WorkspaceMobileToolDrawer from '@/components/WorkspaceMobileToolDrawer.vue'
import { loadPredictedNeed, lookupPredictedNeed, lookupPredictedNeedPacks } from '@/composables/usePredictedNeed'
import { normalizeStr } from '@/utils/predictiveAnalytics'
import { useLogisticVentilation } from '@/composables/useLogisticVentilation'
import { useVentilationLabels } from '@/composables/useVentilationLabels'
import { useLogisticEventSelection } from '@/composables/useLogisticEventSelection'
import { useVentilationAccess } from '@/composables/useVentilationAccess'
import { filterGroupsBySearch } from '@/utils/ventilationViews'
import { suppliersOf } from '@/utils/ventilationSuppliers'
import { ventilationExportTable, stockExportTable } from '@/utils/logisticExportTables'

const TABS = [
  { value: 'shops', labelKey: 'logiTabShops', labelKeyShort: 'logiTabShopsShort', icon: 'mdi-store' },
  { value: 'byItem', labelKey: 'logiTabByItem', labelKeyShort: 'logiTabByItemShort', icon: 'mdi-view-list' },
  { value: 'storage', labelKey: 'logiTabStorage', labelKeyShort: 'logiTabStorageShort', icon: 'mdi-warehouse' },
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
    LogisticDepositConfirmDrawer,
    LogisticLossesDrawer,
    LogisticHistoryDrawer,
    LogisticAggregateView,
    LogisticTasksPanel,
    SidebarPanel,
    ClipboardList,
    GitCompare,
    Download,
    TrendingDown,
    WorkspacePanelToggle,
    WorkspaceMobileToolDrawer,
    LogisticConfigSelect,
    LogisticByItemView,
    LogisticVentilationView,
    LogisticVentilationDeposits,
    LogisticVentilationAccessDialog,
    LogisticPrintDialog,
    LogisticEventSelect,
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const route = useRoute()
    const { t } = useI18n()
    // Temps réel (retour Bertrand 2026-10-07) : stock et derniers comptages relus toutes
    // les 10 s, onglet visible. Les comptages partent vers Logistic quelques secondes
    // après « Marquer compté » ; sans relecture, il fallait recharger la page.
    const liveRefresh = ref(null)
    useInventoryLivePolling(
      () => true,
      () => liveRefresh.value?.(),
      { intervalMs: 10 * 1000 },
    )
    // Mode Ventilation (feuille de réarmement, dépôts) : reactive() déballe les refs
    // du composable pour le template et `this.ventilation.*`.
    const ventilation = reactive(useLogisticVentilation({ store, t }))
    const ventilationLabels = useVentilationLabels()
    // Sélecteur d'events du bandeau (un ou plusieurs matchs, `?events=`).
    const eventSelection = reactive(useLogisticEventSelection({ route, router, t }))
    // PIN des logisticiens pour cette sélection (bandeau en Ventilation + fenêtre QR).
    const ventilationAccess = reactive(useVentilationAccess())
    return { store, router, route, t, liveRefresh, ventilation, ventilationLabels, eventSelection, ventilationAccess }
  },
  data() {
    return {
      TOOLBOX_ITEMS,
      tabs: TABS,
      activeTab: 'shops',
      // Drawer nav outils F&B, mobile uniquement (cf. .lg-mobile-tools-trigger).
      showMobileToolDrawer: false,
      // Panneau droit (alertes restock + tâches), overlay mobile uniquement
      // (cf. .lg-right-col--open / .lg-mobile-right-trigger).
      showMobileRightPanel: false,
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
      // 'restock' = feuille de réarmement du match (quantité « À déposer »),
      // 'forecast' = repli prévision Event Predict (« Besoin prédit »), null = rien.
      needSource: null,
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
      printDialog: false,
      // Dernier inventaire (valeurs grisées)
      latestCounts: {},
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
    can() { return this.store.getters['auth/can'] },
    canReconcile() { return this.can('front.fb.logisticReconcile') },
    /** « À déposer » (feuille de réarmement, composable Ventilation) ou prévision brute. */
    needIndex() {
      return this.needSource === 'restock' ? this.ventilation.needIndex : this.predictedNeed
    },
    /** Lien Event Predict du match, affiché quand la feuille de ventilation manque
     *  (réponse Bertrand 2026-10-08) ; null sans match ou sans le droit. */
    eventPredictRoute() {
      const can = this.store.getters['auth/can']
      const eventId = this.ventilation.eventId
      if (!eventId || !this.currentSpaceId) return null
      if (typeof can === 'function' && !can('front.fb.eventPredict')) return null
      return {
        name: 'space-analyse',
        params: { spaceId: this.currentSpaceId },
        query: { toolbox: 'event-predict', event: eventId },
      }
    },
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
      this.ensureVentilationAccess()
    },
    'ventilation.accessDialog'(open) {
      if (open) this.ensureVentilationAccess({ force: true })
    },
    /** Sélection d'events changée dans le bandeau : seule la Ventilation est relue. */
    'eventSelection.selectedIds'(next, prev) {
      if (this.route?.name !== 'space-logistic') return
      if ((next || []).join(',') === (prev || []).join(',')) return
      this.ensureVentilationAccess()
      if (!this.loading) this.fetchPredictedNeed()
    },
    /** BUG-259-02 : transferts en attente chargés à l'entrée dans le drill-in d'un élément. */
    'drillElement.element.id': {
      immediate: false,
      handler(elementId) {
        if (elementId) this.store.dispatch('logistics/loadPendingTransfers', { elementId })
      },
    },
  },
  created() {
    this.liveRefresh = () => this.refreshLive()
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
      // Recherche unifiée PDV + articles (barre collée sous le bandeau) : matche
      // le nom du PDV OU le nom d'au moins un article qu'il suit.
      const q = String(this.elementSearch || '').trim().toLowerCase()
      return entries.filter((e) => {
        if (q) {
          const nameMatch = String(e.element?.name || '').toLowerCase().includes(q)
          const itemMatch = this.itemsOf(e).some((it) => String(it.name || '').toLowerCase().includes(q))
          if (!nameMatch && !itemMatch) return false
        }
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
    /** PIN de la sélection : lu (et créé au besoin, PIN prédéfini) quand la
     *  Ventilation est affichée ou la fenêtre QR ouverte. */
    ensureVentilationAccess({ force = false } = {}) {
      if (!force && this.activeTab !== 'ventilation') return
      this.ventilationAccess.ensure(this.currentSpaceId, this.eventSelection.selectedIds)
    },
    /** Réinitialise les filtres (recherche, type de denrée, fournisseur). */
    resetLogisticFilters() {
      this.itemKindFilter = []
      this.elementSearch = ''
      this.ventilation.supplierFilter = []
    },
    /** Tableau de la liste affichée pour la fenêtre Imprimer (Excel / PDF / Impression). */
    buildPrintTable() {
      const tab = [...this.tabs, { value: 'ventilation', labelKey: 'logiVentilationBtn' }].find((x) => x.value === this.activeTab)
      const title = `${this.t('logiPageTitle')} · ${tab ? this.t(tab.labelKey) : ''}`
      const subtitle = [this.spaceLabel, this.ventilation.planName].filter(Boolean).join(' · ')
      if (this.activeTab === 'ventilation') {
        return ventilationExportTable({
          groups: filterGroupsBySearch(this.ventilation.visibleGroups, this.elementSearch),
          storages: this.ventilation.storages,
          mode: this.ventilation.viewMode,
          t: this.t,
          quantityLabel: this.ventilationLabels.quantityLabel,
          packSizeLabel: this.ventilationLabels.packSizeLabel,
          suppliersOf: (name) => suppliersOf(this.ventilation.supplierIndex, name),
          title,
          subtitle,
        })
      }
      const byItem = this.activeTab === 'byItem'
      const q = String(this.elementSearch || '').trim().toLowerCase()
      return stockExportTable({
        entries: byItem ? [...this.shopEntries, ...this.storageEntries] : this.currentEntries,
        byItem,
        // Onglet By Item : même recherche que sa liste (article OU emplacement).
        itemsFor: (entry) =>
          this.itemsOf(entry).filter(
            (item) =>
              this.itemMatchesFilters(item) &&
              (!byItem || !q || String(item.name || '').toLowerCase().includes(q) || String(entry.element.name || '').toLowerCase().includes(q)),
          ),
        expectedFor: this.expectedDisplay,
        statusFor: this.itemStatus,
        needFor: this.needIndex ? this.predictedNeedFor : null,
        t: this.t,
        title,
        subtitle,
      })
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
    /** Relecture silencieuse (sans squelette de chargement) pour le temps réel. */
    async refreshLive() {
      // keep-alive : vue cachée (autre écran affiché), rien à relire.
      if (this.route?.name !== 'space-logistic') return
      const spaceId = this.currentSpaceId
      if (!spaceId || this.loading) return
      const eventId = this.route?.query?.event || null
      const configId = this.route?.query?.configuration || this.route?.query?.config || (eventId ? null : 'all')
      await Promise.all([
        this.store.dispatch('logistics/loadStock', { spaceId, configId, eventId, silent: true }),
        this.loadLatestInventory(spaceId),
        // Mode Ventilation affiché : dépôts des logisticiens (QR) relus au même rythme.
        this.activeTab === 'ventilation' ? this.ventilation.refresh(spaceId) : null,
      ])
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
          this.eventSelection.load(spaceId),
          // Noms des fournisseurs du filtre de la Ventilation (best-effort).
          Promise.resolve(this.store.dispatch('suppliers/fetchSuppliers')).catch((e) =>
            console.warn('[logistics] fournisseurs indisponibles :', e?.message),
          ),
          this.loadLatestInventory(spaceId),
          this.loadMarketPriceImages(),
        ]
        if (this.canReconcile) {
          tasks.push(this.store.dispatch('logistics/loadReconciliations', { spaceId }))
          tasks.push(this.store.dispatch('logistics/loadLossesSummary', { spaceId }))
        }
        await Promise.all(tasks)
        // Après loadStock : le périmètre des éléments vient du stock chargé.
        this.fetchPredictedNeed()
      } finally {
        this.loading = false
      }
    },
    /** « À déposer » des matchs choisis dans le bandeau (`?events=`, sinon `?event=`,
     *  sinon le prochain match jusqu'à sa fin réelle). Priorité aux feuilles de
     *  réarmement sauvegardées (décision opérationnelle) sur la prévision brute Event
     *  Predict (repli, premier match seulement). Sans match, la colonne reste absente. */
    async fetchPredictedNeed() {
      this.predictedNeed = null
      this.needSource = null
      const eventIds = this.eventSelection.selectedIds
      this.ventilation.reset(eventIds)
      if (!eventIds.length) return
      const effectiveEventId = eventIds[0]

      try {
        // Feuilles de réarmement des matchs : « À déposer » (composable Ventilation).
        // Une feuille entièrement déposée ne retombe PAS sur la prévision brute.
        if (await this.ventilation.loadForEvents(this.currentSpaceId, eventIds)) {
          this.needSource = 'restock'
          return
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
      this.needSource = index ? 'forecast' : null
    },
    /** Article Logistic (identité par NOM) d'une destination correspondant à une
     *  ligne de la feuille, ou null s'il n'est pas dans le référentiel de l'élément. */
    logisticItemFor(elementId, itemName) {
      const entry = [...this.shopEntries, ...this.storageEntries].find((e) => String(e.element.id) === String(elementId))
      const nk = normalizeStr(itemName)
      return (entry ? this.itemsOf(entry) : []).find((it) => normalizeStr(it.name) === nk) || null
    },
    openDepositConfirm(payload) {
      const item = this.logisticItemFor(payload.row.shopId, payload.group.itemName)
      const logisticUnitsPerPack = item ? Number(this.unitsPerPackFor(payload.row.shopId, item)) || null : null
      this.ventilation.openConfirm(payload, { item, logisticUnitsPerPack })
    },
    async submitDeposit(quantities) {
      if (await this.ventilation.submit(quantities, this.currentSpaceId)) {
        this.toast(this.t('logiDepositSaved'), 'success')
      }
    },
    async cancelDeposit(movement) {
      try {
        if (!(await this.ventilation.cancel(movement, this.currentSpaceId))) return
        this.toast(this.t('logiVentilationCancelDone'), 'success')
        // Stock de l'emplacement relu (le mouvement inverse l'a modifié).
        await this.refreshLive()
      } catch (e) {
        this.toast(e?.response?.data?.message || e?.userMessage || this.t('logiMovementError'), 'error')
      }
    },
    /** Besoin prédit d'une denrée sur un élément — les lignes Logistic sont keyées
     *  par NOM, la résolution par nom normalisé est donc le chemin nominal ici. */
    predictedNeedFor(elementId, item) {
      return lookupPredictedNeed(this.needIndex, elementId, item)
    },
    /** Packs déjà décidés au réarmement pour cette denrée sur cet élément — natif
     *  (packaging.packedCount), null si l'index vient du repli Event Predict (pas
     *  de packs) ou si le conditionnement n'était pas connu sur cette ligne. */
    predictedNeedPacksFor(elementId, item) {
      return lookupPredictedNeedPacks(this.needIndex, elementId, item)
    },
    /** Dernier inventaire (tous events) → valeurs grisées. */
    async loadLatestInventory(spaceId) {
      try {
        const latest = await getLatestInventory(spaceId)
        this.latestCounts = latest?.inventoryCounts || {}
      } catch (e) {
        console.warn('[SpaceLogistic] latest inventory indisponible:', e?.message)
        this.latestCounts = {}
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
        // Repli du filtre Fournisseur de la Ventilation (la feuille de réarmement prime).
        this.ventilation.setMarketPrices(arr.map((mp) => ({ itemName: mp?.itemName, supplier: mp?.supplier, supplierId: mp?.supplierId })))
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
          currentMarketPriceId: item.marketPriceId,
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
          // ADR-0006 (chantier 377) : identité stable déjà résolue par le référentiel /stock —
          // préférée par le backend à la résolution par nom quand présente.
          itemKind: this.movementItem.refKind ?? undefined,
          itemRefId: this.movementItem.refKind ? this.movementItem.id : undefined,
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
        safePush(this.router, { name: 'space-analyse', params: { spaceId } })
      } else if (tool.value === 'live') {
        // Live = route DÉDIÉE `space-live` (pas un mode `?toolbox=`, cf.
        // router/index.js) : sans cette branche le `else` ci-dessous envoyait
        // sur Analyse avec un toolbox inconnu.
        safePush(this.router, { name: 'space-live', params: { spaceId } })
      } else if (tool.value === 'space-inventory') {
        safePush(this.router, { name: 'space-inventory', params: { spaceId }, query: ev ? { event: ev } : {} })
      } else if (tool.value === 'space-pre-inventory') {
        safePush(this.router, { name: 'space-pre-inventory', params: { spaceId }, query: ev ? { event: ev } : {} })
      } else if (tool.value === 'restock') {
        safePush(this.router, { name: 'space-restock', params: { spaceId }, query: ev ? { event: ev } : {} })
      } else {
        safePush(this.router, { name: 'space-analyse', params: { spaceId }, query: { toolbox: tool.value } })
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
  --lg-faint: var(--fb-faint, #9ca3af);
  --lg-primary: var(--fb-primary, #ff3131);
  height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--lg-bg);
  color: var(--lg-text);
}

/* ── Header : bandeau rouge (style MarketPriceListView) ── */
/* Bandeau rouge à bas carré, recherche collée dessous (parité .si-segrow--band
   de l'Inventaire pré-événement). */
.lg-header {
  /* 1er enfant de la colonne centre : gutters fournis par .lg-layout. */
  margin: 0;
  border-radius: 12px 12px 0 0;
  background: #ff3131;
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
  gap: 12px;
  padding: 15px;
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
.lg-header__selects { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
/* « PIN d'accès : 123456 » à droite du bandeau (maquette Bertrand 2026-10-09). */
.lg-band-pin { color: #fff; font-size: var(--fs-md); font-weight: var(--fw-semibold); white-space: nowrap; }
.lg-band-pin strong { font-weight: var(--fw-bold); letter-spacing: 0.06em; font-variant-numeric: tabular-nums; }
.lg-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #fff; line-height: 1.2; }
.lg-header__space { color: rgba(255, 255, 255, .78); font-weight: 700; }
.lg-header__subtitle { margin: 3px 0 0; font-size: 12.5px; color: rgba(255, 255, 255, .75); min-height: 15px; }
.lg-header__right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* Équivalent mobile (< 560px) du toggle filtres, masqué par défaut, activé dans
   le bloc @media plus bas. Desktop garde WorkspacePanelToggle (ouvre l'aside). */
.lg-mobile-tools-trigger {
  display: none;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  color: #fff;
}
.lg-mobile-tools-trigger:active { transform: scale(.94); }
/* Recherche collée sous le bandeau, même largeur (parité .si-search-wrap). */
.lg-search-wrap { margin: 0 0 16px; }
.lg-search-wrap :deep(.appsb) {
  border-bottom: 0;
  border-radius: 0 0 12px 12px;
  overflow: hidden;
}

/* Déclenche .lg-right-col en overlay < 900px (alertes restock + tâches). */
.lg-mobile-right-trigger {
  display: none;
  position: relative;
  width: 38px;
  height: 38px;
  border: 1.5px solid rgba(255, 255, 255, 0.62);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.1);
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  color: #fff;
}
.lg-mobile-right-trigger__badge {
  position: absolute;
  top: -4px;
  right: -4px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 8px;
  background: #111827;
  border: 1.5px solid #fff;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 13px;
  text-align: center;
}

/* Sélecteur d'espace dans le bandeau : texte en blanc sur le rouge. */
.lg-header__switcher { flex-shrink: 0; }
.lg-header__switcher :deep(.wsh-space-trigger) { color: #fff; }
.lg-header__switcher :deep(.wsh-space-trigger:hover) { background-color: rgba(255, 255, 255, .16); }
.lg-header__switcher :deep(.wsh-space-name) { color: #fff; }
.lg-header__switcher :deep(.wsh-space-chevron) { color: rgba(255, 255, 255, .85); }

/* Retour + actions : pilule blanche translucide bordée, alignée sur
   Space Inventory (.si-back / .si-actions :deep(.v-btn:not(.si-save-btn))). */
.lg-back,
.lg-hbtn {
  border: 1.5px solid rgba(255, 255, 255, 0.62) !important;
  border-radius: 100px !important;
  background: rgba(255, 255, 255, 0.1) !important;
  color: #fff !important;
}
.lg-back :deep(.v-icon),
.lg-hbtn :deep(.v-icon) {
  color: #fff !important;
}
.lg-back:hover,
.lg-hbtn:hover {
  border-color: #fff !important;
  background: #fff !important;
  color: var(--lg-primary) !important;
}
.lg-back:hover :deep(.v-icon),
.lg-hbtn:hover :deep(.v-icon) {
  color: var(--lg-primary) !important;
}
.lg-hbtn {
  text-transform: none;
  font-weight: 700;
  white-space: nowrap;
}

/* Recherche (blanc translucide sur rouge) */
/* Boutons harmonisés Market Price List : pilules, une ligne, taille contenue. */
.lg-header__right :deep(.v-btn) {
  border-radius: 100px !important;
  min-height: 34px;
  text-transform: none;
  white-space: nowrap;
  font-size: 12.5px;
}

/* Onglets soulignés (parité .si-subnav de l'Inventaire pré-événement). */
.lg-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--lg-border);
  flex-shrink: 0;
}
.lg-tab {
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  border: 0;
  border-radius: 0 !important;
  background: transparent;
  color: var(--lg-muted);
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.lg-tab-active { color: var(--lg-primary); border-bottom-color: var(--lg-primary); }
/* QR code des logisticiens : icône calée à droite de la barre d'onglets. */
.lg-tab--qr { margin-left: auto; padding: 8px 10px; }
.lg-tab-count { color: var(--lg-faint); font-weight: 500; margin-left: 4px; }
/* Libellé court, mobile uniquement (cf. @media plus bas) : masqué par défaut. */
.lg-tab-label-short { display: none; }

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
.lg-sort-bar__print { margin-left: auto; }
.lg-icon-btn { width: 34px; height: 34px; border: 0; border-radius: 10px; background: transparent; color: var(--lg-text); display: inline-flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
.lg-icon-btn:hover { background: var(--fb-subtle, #f3f4f6); }
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
/* Colonne droite : chaque SidebarPanel garde sa hauteur naturelle (ouvert ou
   replié à sa seule en-tête) ; si les deux sont ouvertes en même temps et
   dépassent le viewport, c'est la COLONNE qui scrolle (même pattern que
   .lg-aside), jamais une section qui écrase l'autre. */
.lg-right-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  padding-right: 2px;
}
/* Overlay mobile (< 900px, cf. @media plus bas) : masqués sur desktop où
   .lg-right-col reste une colonne de grille normale, toujours visible. */
.lg-right-col-backdrop { display: none; }
.lg-right-col__close { display: none; }
.lg-tasks-refresh {
  border: none; background: transparent; cursor: pointer; padding: 3px; border-radius: 7px;
  display: flex; align-items: center; opacity: 0.65; color: inherit;
}
.lg-tasks-refresh:hover { opacity: 1; background: rgba(0, 0, 0, 0.06); }
.lg-tasks-refresh:disabled { cursor: default; }
.lg-tasks-refresh-spin { animation: lg-tasks-refresh-spin 0.8s linear infinite; }
@keyframes lg-tasks-refresh-spin { to { transform: rotate(360deg); } }
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
  /* Pas d'espace entre le header app et le bandeau rouge, ni de marge gauche/
     droite sur celui-ci (même correctif que Space Inventory) : padding-top à 0
     (aside/right-col ne sont plus visibles en flux normal sur mobile, rien
     d'autre n'en dépend), bandeau tiré à -16px pour compenser le padding
     horizontal hérité de .lg-layout et atteindre les 2 bords de l'écran. */
  .lg-layout { padding: 0 16px 24px; }
  .lg-header {
    margin-left: -16px;
    margin-right: -16px;
    border-radius: 0;
  }
  /* Pleine largeur comme le bandeau, pour rester collée dessous. */
  .lg-search-wrap { margin: 0 -16px 12px; }
  .lg-search-wrap :deep(.appsb) { border-radius: 0; }

  /* .lg-right-col (alertes restock + tâches) : au lieu de rester dans le flux
     empilé (order: 3, systématiquement après une liste PDV parfois longue —
     retour utilisateur), devient un panneau overlay ouvert depuis la droite,
     déclenché par .lg-mobile-right-trigger dans le bandeau. */
  .lg-mobile-right-trigger { display: flex; }
  .lg-right-col-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: rgba(17, 24, 39, .45);
    z-index: 1000;
  }
  .lg-right-col {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    z-index: 1001;
    width: min(340px, 88vw);
    height: auto;
    background: var(--lg-surface, #fff);
    box-shadow: -8px 0 30px rgba(0, 0, 0, .18);
    padding: 44px 14px 14px;
    overflow-y: auto;
    transform: translateX(100%);
    transition: transform .26s cubic-bezier(.32, .72, 0, 1);
  }
  .lg-right-col--open { transform: translateX(0); }
  .lg-right-col__close {
    display: flex;
    position: absolute;
    top: 8px;
    right: 8px;
    width: 32px;
    height: 32px;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, .06);
    color: inherit;
    cursor: pointer;
  }
}

@media (max-width: 560px) {
  .lg-header__text { min-width: 0; }
  /* Téléphone : pilule d'events plus courte et PIN plus petit, pas de débordement. */
  .lg-header__selects :deep(.les-trigger-label) { max-width: 130px; }
  .lg-band-pin { font-size: var(--fs-sm); }
  .lg-header__title {
    font-size: 17px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lg-header__subtitle {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .lg-row { flex-wrap: wrap; }
  .lg-row-stats { justify-content: flex-start; }

  /* Drill-in "Container X" : tout tient sur une seule ligne (titre + bouton
     Historique) au lieu du bouton qui passait sur sa propre rangée en
     dessous. L'icône décorative entrepôt est retirée pour gagner la place. */
  .lg-header__icon { display: none; }
  .lg-header__inner { flex-wrap: nowrap; }
  .lg-header__right { width: auto; flex-shrink: 0; justify-content: flex-end; }

  /* Historique : pilule texte -> bouton rond icône seule (titre HTML garde
     le libellé accessible). */
  .lg-hbtn {
    width: 38px !important;
    height: 38px !important;
    min-height: 38px !important;
    padding: 0 !important;
    border-radius: 50% !important;
  }
  .lg-hbtn-label { display: none; }
  .lg-hbtn :deep(.mr-1) { margin-right: 0 !important; }

  /* ── Niveau LISTE (mobile) : aside/toolbox-select + tri supprimés (maquette),
     remplacés par le drawer d'outils, une recherche unifiée PDV+articles et
     des tabs compacts sans compteur. ── */
  .lg-aside { display: none; }
  .lg-header__toggle--desktop { display: none; }
  .lg-mobile-tools-trigger { display: flex; }
  /* Toutes les configurations actives par défaut sur mobile, pas de choix. */
  .lg-header__config-wrap { display: none; }

  .lg-tabs { gap: 6px; }
  .lg-tab { padding: 8px 10px; font-size: 0.8rem; }
  .lg-tab-label-full { display: none; }
  .lg-tab-label-short { display: inline; }
  .lg-tab-count { display: none; }

  .lg-sort-bar { display: none; }
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
