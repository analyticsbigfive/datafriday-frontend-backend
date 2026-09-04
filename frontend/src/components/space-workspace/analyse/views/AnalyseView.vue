<template>
  <v-app class="analyse-app" :class="{ 'analyse-app--dark': isDark }">
    <WorkspaceAppHeader
      :space-name="spaceName"
      :kpis="headerKpis"
      show-home
      @kpi-click="onOpenChart"
    />

    <v-main id="header" class="main-content">
      <!-- Grille 3 colonnes (pattern EventPredict .ep-body) : filtres | contenu
           | résumé. Le repli gauche est piloté par `drawer` (toggle du bandeau
           rouge), la colonne droite par `summaryDrawer`. -->
      <div
        class="an-body"
        :class="{ 'an-side-collapsed': !drawer, 'an-summary-collapsed': !summaryDrawer }"
      >
        <FilterPanel
          ref="filterPanelRef"
          :events="analysableEvents"
          :shops="shopNames"
          :is-live="isLive"
          @update:toolbox="onToolboxChange"
        />
        <!-- Mobile uniquement : backdrop de l'overlay filtres (ferme au clic hors panneau). -->
        <div v-if="drawer" class="an-mobile-filter-backdrop" @click="drawer = false"></div>

        <div class="an-main">
          <!-- Bloc sticky : bandeau ROUGE (titre + période/comparaison) PUIS la
               rangée de tags sur fond NEUTRE (hors du rouge). -->
          <div class="av-sticky">
            <div class="av-header">
              <!-- Ligne 1 : [Espace] : Analyse ......... [Copier] [Partager] -->
              <div class="av-header__row1 d-flex align-center ga-2">
                <!-- Desktop : toggle du panneau de filtres. Masqué < 560px (cf. @media),
                     remplacé par le ☰ mobile ci-dessous (drawer d'outils). -->
                <WorkspacePanelToggle
                  class="av-header__toggle--desktop"
                  :open="drawer"
                  :label="t('anHeaderToggleFilters')"
                  @toggle="drawer = !drawer"
                />
                <!-- Mobile uniquement : ouvre WorkspaceMobileToolDrawer (nav entre outils). -->
                <button
                  type="button"
                  class="av-mobile-tools-trigger"
                  :aria-label="t('srToolsLabel')"
                  @click="showMobileToolDrawer = true"
                >
                  <v-icon size="20">mdi-menu</v-icon>
                </button>
                <!-- Mobile uniquement : ouvre le panneau de filtres (+ config) en overlay. -->
                <button
                  type="button"
                  class="av-mobile-filter-trigger"
                  :aria-label="t('anHeaderToggleFilters')"
                  @click="drawer = !drawer"
                >
                  <v-icon size="20">mdi-filter-variant</v-icon>
                </button>
                <h1 class="av-header__title">{{ spaceName }} : {{ toolTitle }}</h1>
                <!-- Badge Live : basé sur la VRAIE détection (liveEventDetected, posé par
                     applyLiveScope() depuis /live-status), pas juste la route — corrigé
                     2026-08-05 (BUG-305-02) : affichait "● LIVE" même sans event dans la
                     fenêtre de 30 min, alors que le titre retombait sur "Analyse" à côté —
                     combinaison contradictoire, mal vue par l'utilisateur à raison. -->
                <span v-if="liveEventDetected" class="av-live-badge" :title="t('anToolLive')">
                  <span class="av-live-badge__dot"></span>{{ t('anToolLive') }}
                </span>
                <!-- Voir/modifier l'event en cours (module Live, 2026-08-05) : ouvre le même
                     drawer que /events, dates verrouillées, tous les autres champs éditables.
                     Visible dès qu'un event est résolu pour AUJOURD'HUI (liveEventId, cf.
                     findTodayEventId), PAS seulement pendant le pulse strict de 30 min
                     (liveEventDetected, réservé au badge ● LIVE) — sinon le bouton disparaissait
                     à la moindre pause de ventes alors que l'event est toujours en cours
                     (retour utilisateur 2026-08-05). -->
                <v-btn
                  v-if="liveEventId"
                  icon
                  variant="text"
                  size="small"
                  :title="t('anLiveEditEvent')"
                  :aria-label="t('anLiveEditEvent')"
                  class="fs-icon-btn"
                  @click="liveEventEditOpen = true"
                >
                  <v-icon size="18">mdi-pencil-outline</v-icon>
                </v-btn>
                <!-- BUG-356-01 v2/v3 (retours client + user, 24/08) : l'indicateur
                     « Non mappées » vit DANS le bandeau rouge — le bandeau dédié prenait
                     de la place. v3 : triangle warning `mdi-alert` (plus lisible que
                     link-variant-off) + VRAIE infobulle Vuetify (patron SummaryPanel)
                     au lieu du title natif. Visible seulement si volume > 0 ;
                     clic → Data Integration. Ne change aucun chiffre. -->
                <v-tooltip v-if="unmappedBannerText" location="bottom" max-width="300">
                  <template #activator="{ props: tipProps }">
                    <v-btn
                      v-bind="tipProps"
                      icon
                      variant="text"
                      size="small"
                      class="fs-icon-btn av-unmapped-warn"
                      :aria-label="unmappedBannerText"
                      @click="router.push({ name: 'data-integration-fb' })"
                    >
                      <v-icon size="18">mdi-alert</v-icon>
                    </v-btn>
                  </template>
                  <div class="av-unmapped-tip">
                    <div>{{ unmappedBannerText }}</div>
                    <div class="av-unmapped-tip__action">
                      {{ t('anUnmappedTipAction') }} {{ t('anUnmappedInfoLink') }}
                    </div>
                  </div>
                </v-tooltip>
                <v-spacer />
                <!-- Actions desktop (copier/partager/PDF/export). Sur téléphone, remplacées
                     par un menu ⋮ unique (cf. .av-header__actions--desktop @media). -->
                <div class="av-header__actions av-header__actions--desktop d-flex align-center">
                <v-btn
                  icon
                  variant="text"
                  size="small"
                  :loading="copying"
                  :title="t('anCopyImage')"
                  class="fs-icon-btn"
                  @click="onCopy"
                >
                  <v-icon size="18">mdi-content-copy</v-icon>
                </v-btn>
                <v-btn
                  icon
                  variant="text"
                  size="small"
                  :loading="sharing"
                  :title="t('anShare')"
                  class="fs-icon-btn"
                  @click="onShare"
                >
                  <v-icon size="18">mdi-share-variant-outline</v-icon>
                </v-btn>
                <!-- Export chiffré. Menu (et non clic direct) : deux formats.
                     Icône `table-arrow-down` et non `mdi-download`, déjà porté par
                     les exports d'un SEUL bloc (Perf PdV, table Articles) — deux
                     sens différents pour une même icône sur un même écran.
                     NE PAS reprendre `mdi-tray-arrow-down` : ce glyphe n'existe
                     qu'à partir de @mdi/font 6, le projet est en 5.9.55 → bouton
                     rond vide, sans erreur console.
                     Désactivé pendant les chargements : un classeur produit sur une
                     page à moitié enrichie est faux sans le dire. -->
                <!-- Rapport J+1 : PDF récapitulatif d'UN event passé (réel vs
                     prédictif). Icône `mdi-file-pdf-box` (présente en @mdi/font
                     5.9.55, contrairement à `mdi-file-pdf-outline`, v6+).
                     Visible UNIQUEMENT en mode Analyse (décision JLH 2026-08-04 :
                     le rapport porte sur du réalisé, pas sur une projection).
                     Désactivé hors mode mono-événement passé — le title reste
                     lisible sur bouton désactivé grâce au span englobant.
                     ET pas en Live (trouvé 2026-08-05) : `reportEvent` vérifie
                     seulement `date <= now`, pas que l'event soit TERMINÉ — un
                     event daté d'aujourd'hui passe ce test dès la 1re minute,
                     activant un bouton « réalisé » sur un event encore en cours. -->
                <span
                  v-if="selectedToolbox === 'analyse' && !isLive"
                  v-can="'stats.financial.view'"
                  :title="reportEvent ? t('rj1Button') : t('rj1ButtonHint')"
                >
                  <v-btn
                    icon
                    variant="text"
                    size="small"
                    :loading="generatingReport"
                    :disabled="!reportEvent || exportBusy"
                    :aria-label="t('rj1Button')"
                    class="fs-icon-btn"
                    @click="onGenerateReportJ1"
                  >
                    <v-icon size="18">mdi-file-pdf-box</v-icon>
                  </v-btn>
                </span>
                <v-menu location="bottom end">
                  <template #activator="{ props: exportProps }">
                    <v-btn
                      v-bind="exportProps"
                      icon
                      variant="text"
                      size="small"
                      :loading="exporting"
                      :disabled="exportBusy"
                      :title="t('anExportMenu')"
                      :aria-label="t('anExportMenu')"
                      class="fs-icon-btn"
                    >
                      <v-icon size="18">mdi-table-arrow-down</v-icon>
                    </v-btn>
                  </template>
                  <v-list density="compact">
                    <v-list-item @click="onExportXlsx">
                      <template #prepend>
                        <v-icon size="18">mdi-file-excel-outline</v-icon>
                      </template>
                      <v-list-item-title>{{ t('anExportXlsx') }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="onExportCsv">
                      <template #prepend>
                        <v-icon size="18">mdi-file-delimited-outline</v-icon>
                      </template>
                      <v-list-item-title>{{ t('anExportCsv') }}</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-menu>
                </div>

                <!-- Mobile uniquement : menu ⋮ regroupant les actions du bandeau. -->
                <v-menu location="bottom end">
                  <template #activator="{ props: moreProps }">
                    <button
                      v-bind="moreProps"
                      type="button"
                      class="av-mobile-more-trigger"
                      :aria-label="t('anExportMenu')"
                    >
                      <v-icon size="20">mdi-dots-vertical</v-icon>
                    </button>
                  </template>
                  <v-list density="compact">
                    <v-list-item :disabled="copying" @click="onCopy">
                      <template #prepend><v-icon size="18">mdi-content-copy</v-icon></template>
                      <v-list-item-title>{{ t('anCopyImage') }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item :disabled="sharing" @click="onShare">
                      <template #prepend><v-icon size="18">mdi-share-variant-outline</v-icon></template>
                      <v-list-item-title>{{ t('anShare') }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item
                      v-if="selectedToolbox === 'analyse' && !isLive"
                      v-can="'stats.financial.view'"
                      :disabled="!reportEvent || exportBusy"
                      @click="onGenerateReportJ1"
                    >
                      <template #prepend><v-icon size="18">mdi-file-pdf-box</v-icon></template>
                      <v-list-item-title>{{ t('rj1Button') }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item :disabled="exportBusy" @click="onExportXlsx">
                      <template #prepend><v-icon size="18">mdi-file-excel-outline</v-icon></template>
                      <v-list-item-title>{{ t('anExportXlsx') }}</v-list-item-title>
                    </v-list-item>
                    <v-list-item :disabled="exportBusy" @click="onExportCsv">
                      <template #prepend><v-icon size="18">mdi-file-delimited-outline</v-icon></template>
                      <v-list-item-title>{{ t('anExportCsv') }}</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-menu>
              </div>
              <!-- Ligne 2 : période + comparaison. Masquée en Live (trouvé
                   2026-08-05) : le select de période est éditable en apparence
                   mais applyLiveScope() force timeRange='all' à chaque tick (15s) —
                   même trappe que Dates/Configuration/Événements dans FilterPanel.
                   « Comparer à » s'auto-masque déjà quand timeRange==='all'
                   (FilterSummary.vue:22), mais le select de période, lui, reste
                   affiché et cliquable pour rien. -->
              <div v-if="!loading && !isLive" class="av-header__row2">
                <FilterSummary
                  :comparison-mode="filters.comparisonMode"
                  :comparison-empty="comparisonEmpty"
                  :comparison-window="comparisonWindowLabel"
                  :time-range="filters.timeRange"
                  :date-range-items="dateRangeItems"
                  @update:comparison-mode="(v) => setFilterImmediate('comparisonMode', v)"
                  @update:time-range="(v) => setFilterImmediate('timeRange', v)"
                />
              </div>
            </div>

            <!-- Tags des filtres actifs — fond neutre, sous le bandeau rouge.
                 Chip événements masqué en Live (trouvé 2026-08-05) : toujours
                 "1 événement(s) sélectionné(s)" (l'event live, forcé par
                 applyLiveScope), redondant avec le badge ● LIVE — et sa croix
                 de fermeture ne fait rien de durable (re-forcé au tick suivant). -->
            <div
              v-if="!loading && ((!isLive && (filters.selectedEventIds || []).length) || activeFilterChips.length)"
              class="av-tags d-flex align-center flex-wrap ga-2"
            >
              <v-chip
                v-if="!isLive && (filters.selectedEventIds || []).length"
                closable
                size="small"
                variant="tonal"
                class="chip-events"
                @click:close="clearEvents"
              >
                {{ (filters.selectedEventIds || []).length }} {{ t('anEventsSelected') }}
              </v-chip>
              <v-chip
                v-for="chip in activeFilterChips"
                :key="chip.key"
                closable
                size="small"
                variant="tonal"
                class="chip-filter"
                :class="{ 'chip-filter--editable': editableFilterKeys.has(chip.key) }"
                @click="editableFilterKeys.has(chip.key) && onEditChip(chip.key)"
                @click:close="clearChip(chip.key)"
              >
                {{ chip.label }}
              </v-chip>
              <v-btn
                icon
                variant="text"
                size="small"
                class="av-tags__trash"
                :title="t('anClearAll')"
                :aria-label="t('anClearAll')"
                @click="resetFilters"
              >
                <v-icon size="18">mdi-trash-can-outline</v-icon>
              </v-btn>
            </div>
          </div>
      <!-- Onglets Live (module Live v2, 11_LIVE.md §3) : bascule Analyse / Inventaire,
           visibles uniquement sur la route space-live. -->
      <div v-if="isLive" class="an-live-tabs">
        <button class="an-live-tab" :class="{ 'an-live-tab--active': liveTab === 'analyse' }" @click="liveTab = 'analyse'">{{ t('anToolAnalyse') }}</button>
        <button class="an-live-tab" :class="{ 'an-live-tab--active': liveTab === 'inventory' }" @click="liveTab = 'inventory'">{{ t('anLiveInvTitle') }}</button>
      </div>

      <LiveInventoryPanel
        v-if="showInventory"
        :space-id="route.params.spaceId"
        :is-dark="isDark"
        :active="showInventory"
      />

      <!-- Bouton flottant QA (module Live) : simuler une vraie vente Weezevent/Digifood
           pour tester le mode Live sans attendre un vrai event. -->
      <LiveSaleSimulatorWidget
        v-if="isLive"
        :space-id="route.params.spaceId"
        @simulated="livePoll"
      />

      <!-- pa-0 : les gutters viennent de la grille .an-body (18/24), le
           container ne doit pas ré-indenter le contenu vs le bandeau rouge. -->
      <v-container v-show="!showInventory" id="analyse-capture-root" fluid class="pa-0">
        <!-- Loading : skeleton fidèle à la structure de l'écran -->
        <template v-if="loading">
          <v-skeleton-loader
            type="chip, chip, chip, chip"
            class="mb-4 bg-transparent"
          />
          <v-row dense class="mb-4">
            <v-col v-for="i in 4" :key="i" cols="12" sm="6" lg="3">
              <v-skeleton-loader type="article" />
            </v-col>
          </v-row>
          <v-skeleton-loader type="image, list-item-two-line" class="mb-4" />
          <v-row dense>
            <v-col v-for="i in 3" :key="i" cols="12" md="4">
              <v-skeleton-loader type="card" />
            </v-col>
          </v-row>
        </template>

        <!-- Error -->
        <v-alert
          v-else-if="error"
          type="warning"
          variant="tonal"
          class="mb-4"
        >
          {{ error }} — {{ t('anDemoDataShown') }}
        </v-alert>

        <!-- Weezevent setup incomplete -->
        <v-alert
          v-if="!loading && weezeventSetupIncomplete"
          type="info"
          variant="tonal"
          icon="mdi-database-off-outline"
          class="mb-4"
        >
          <strong>{{ t('anWeezeventIncompleteTitle') }}</strong> —
          {{ t('anWeezeventIncompleteBody') }}
        </v-alert>


        <template v-if="!loading">
          <!-- FilterSummary déplacé dans la 2e ligne du header (extension). -->

          <!-- Scope event strict : config sélectionnée sans event rattaché. -->
          <v-alert
            v-if="noEventsForConfig"
            type="info"
            variant="tonal"
            icon="mdi-calendar-remove-outline"
            class="mb-4"
          >
            {{ t('anNoEventsForConfig') }}
          </v-alert>

          <!-- BUG-350-01 — état vide explicite : ne jamais laisser lire un 0 €
               comme « pas de ventes » quand c'est le détail qui manque. -->
          <v-alert
            v-if="itemLevelEmpty"
            type="info"
            variant="tonal"
            icon="mdi-database-off-outline"
            class="mb-4"
          >
            {{ t('anItemLevelEmpty') }}
          </v-alert>

          <!-- BUG-350-01 — le périmètre dépasse le cap item-level : le CA affiché
               sous-compte. Bandeau permanent, pas seulement un snackbar fugace. -->
          <v-alert
            v-if="itemRecordsTruncatedCount > 0"
            type="warning"
            variant="tonal"
            icon="mdi-alert-outline"
            class="mb-4"
          >
            {{ t('anItemLevelTruncated').replace('{n}', String(ITEM_LEVEL_EVENT_CAP)) }}
          </v-alert>


          <!-- BUG-363-01 — chargement progressif : indicateur x/N pendant que les
               paquets event-timeline arrivent (Jean Bouin, 77 events : remplace
               110 s d'écran figé sans feedback). -->
          <v-alert
            v-if="itemRecordsSourceState === 'loading' && itemRecordsLoadProgress.total > 1"
            type="info"
            variant="tonal"
            density="compact"
            icon="mdi-progress-download"
            class="mb-4"
          >
            {{ t('anEventsLoadingProgress').replace('{x}', String(itemRecordsLoadProgress.loaded)).replace('{n}', String(itemRecordsLoadProgress.total)) }}
            <!-- BUG-364-01 : barre DÉTERMINÉE (progression réelle connue par paquet,
                 pas de spinner — règle « zéro valeur provisoire »), même palette que
                 l'alerte tonale. -->
            <v-progress-linear
              :model-value="(itemRecordsLoadProgress.loaded / itemRecordsLoadProgress.total) * 100"
              color="info"
              height="6"
              rounded
              class="mt-2"
            />
          </v-alert>

          <v-row v-if="chartsLoading" dense class="mb-4">
            <v-col v-for="i in 4" :key="`kpi-sk-${i}`" cols="12" sm="6" lg="3">
              <v-skeleton-loader type="article" class="an-chart-skeleton" />
            </v-col>
          </v-row>
          <FinancialMetricsGrid
            v-else
            v-can="'stats.financial.view'"
            :metrics="metrics"
            :summary="itemSummary"
            :source-state="kpiSourceState"
            @open-chart="onOpenChart"
          />

          <!-- Lot 4.1 — Panneau Shop Performance by Transaction Rate -->
          <ShopPerformanceByTransactionRate
            v-if="showTransactionRateShops"
            v-can="'stats.financial.view'"
            :shops="shopPerformance.shops.value"
            :loading="shopPerformance.loading.value"
            :selected-shop-ids="filters.selectedShopIds || []"
            @close="showTransactionRateShops = false"
            @shop-click="(v) => toggleArrayFilter('selectedShopIds', v)"
          />

          <!-- Graph by-event inline (ouvert via clic KPI) : rendu AU-DESSUS de la
               carte Event Revenue, fond teinté = couleur du KPI cliqué. -->
          <v-card
            v-if="inlineChartVisible"
            v-can="'stats.financial.view'"
            flat
            rounded="lg"
            class="an-inline-kpi-chart mb-4"
            :style="{ '--kpi-color': inlineChartAccent }"
          >
            <div class="d-flex justify-end mb-1">
              <v-btn icon size="small" variant="text" @click="inlineChartVisible = false">
                <v-icon>mdi-close</v-icon>
              </v-btn>
            </div>
            <GenericByEventChart
              :key="byEventMetric"
              :event-aggregates="filteredEventAggregates"
              :records="chartRecords"
              :events="filteredEvents"
              :cost-map="menuItemCostMap"
              :initial-metric="byEventMetric"
            />
          </v-card>

          <!-- Carte unique : timeline XOR barres (cf. doc §13.6). Quand un event
               est sélectionné (clic barre / chip / Average), la timeline REMPLACE
               les barres dans la même carte ; sinon on affiche le graphe Event
               Revenue by shop (ou son skeleton pendant l'enrichissement). Placée
               HORS du gate `chartsLoading` + overlay loader (pas de démontage) :
               démonter/remonter le canvas pendant un reload provoquait le crash
               Chart.js « Cannot read properties of null (reading 'ownerDocument') »
               via le ResizeObserver « detached ». -->
          <v-card v-can="'stats.financial.view'" flat rounded="lg" class="pa-4 mb-4">
            <div v-if="isTimelineActive" class="ep-timeline-wrap">
              <!-- :key force un remount propre uniquement quand l'event
                   (ou la moyenne) change réellement. NE PAS y ajouter la
                   signature de filtres : remonter le canvas en cours d'update
                   est le crash Chart.js « ownerDocument » (cf. plus haut).
                   Les props selected-shops/-shop-types/-shop-areas ont été
                   RETIRÉES : `filteredTimelineData` est déjà filtré sur les 6
                   dimensions. Les remettre ferait tourner deux implémentations
                   de filtrage sur le même tableau — l'origine du bug corrigé. -->
              <EventTimelineChart
                embedded
                :key="`timeline-${selectedEventForTimeline?.eventId || 'none'}-${timelineEventsList.length}`"
                :event-id="selectedEventForTimeline?.eventId || ''"
                :event-name="timelineHeaderLabel"
                :event-date="selectedEventForTimeline?.eventDate || ''"
                :timeline-data="filteredTimelineData"
                :predicted-timeline-data="[]"
                :menu-items="[]"
                :filter-signature="timelineFilterSignature"
                closable
                @close="onCloseTimeline"
                @time-range-change="onTimelineRangeChange"
              />
              <div v-if="timelineLoading" class="ep-timeline-loader-overlay">
                <v-progress-circular indeterminate color="primary" size="48" class="mb-3" />
                <div class="text-body-1 font-weight-medium">
                  {{ t('anLoadingTimelineFor') }} {{ timelinePendingCount }}
                  {{ timelinePendingCount > 1 ? t('anEventsPlural') : t('anEventSingular') }}…
                </div>
                <div class="text-caption text-medium-emphasis mt-1">
                  {{ t('anAggregating15Min') }}
                </div>
              </div>
              <!-- Alerte : events écartés de la moyenne faute de coup d'envoi -->
              <v-alert
                v-if="!timelineLoading && timelineSkippedEvents.length"
                type="warning"
                variant="tonal"
                density="compact"
                rounded="lg"
                class="mt-3 an-unaligned-alert"
              >
                <div class="d-flex align-center justify-space-between flex-wrap ga-2">
                  <span class="text-body-2">
                    {{ timelineSkippedEvents.length }}
                    {{ timelineSkippedEvents.length > 1 ? t('anEventsPlural') : t('anEventSingular') }}
                    {{ t('anUnalignedAlert') }}
                  </span>
                  <v-btn size="small" variant="tonal" color="#B45309" @click="unalignedDialog = true">
                    <v-icon start size="16">mdi-eye-outline</v-icon>
                    {{ t('anUnalignedAlertView') }}
                  </v-btn>
                </div>
              </v-alert>
            </div>
            <template v-else>
              <v-skeleton-loader v-if="chartsLoading" type="image" class="an-chart-skeleton" />
              <EventRevenueByShopChart
                v-else
                embedded
                :records="chartRecords"
                :events="filteredEvents"
                :is-predict-mode="isPredictMode"
                @show-average="onShowAverage"
                @event-click="onChartBarClick"
                @period-drilldown="onPeriodDrilldown"
              />
            </template>
          </v-card>



          <!-- Camemberts : montés MÊME pendant la phase 2 (`:loading`) → 3 donuts
               en skeleton dans la carte réelle, au lieu d'un rectangle générique
               qui remplaçait toute la carte. Le donut « Par zone » garde en plus
               son propre pending (contexte PdV différé — cf. BUG-223). -->
          <ShopDistributionPieChart
            v-can="'stats.financial.view'"
            :records="chartRecords"
            :loading="chartsLoading"
            @shop-click="(v) => toggleArrayFilter('selectedShopIds', v)"
            @shop-type-click="(v) => toggleArrayFilter('selectedShopTypes', v)"
            @shop-area-click="(v) => toggleArrayFilter('selectedShopAreas', v)"
          />

          <!-- Combinaisons de catégories PAR TRANSACTION. Dans le conteneur
               `v-show="!showInventory"` : couvre donc Analyse, Live ET Predict
               (même composant, aucune garde !isLive). Son drill-down reste local
               au composant, cf. son en-tête. -->
          <TransactionCategoryMixChart
            v-can="'stats.financial.view'"
            :records="filteredBaskets"
            :loading="basketsLoading"
            :excluded-predicted-count="basketsMissingEventCount"
          />

          <!-- Phase 2 : skeletons des graphes SOUS la carte (le skeleton des
               barres vit désormais dans la carte ci-dessus). -->
          <template v-if="chartsLoading">
            <v-skeleton-loader type="image" class="mb-4 an-chart-skeleton" />
            <v-skeleton-loader type="table-heading, table-row-divider, table-row@4" class="mb-4 an-chart-skeleton" />
          </template>

          <!-- Distributions / tables (CA par shop/menu type) sous la carte. Toutes
               data-driven : tout ce qui est vendu s'affiche (parité React). -->
          <template v-else>
            <!-- Répartition/tableau ARTICLE : `articleRecords` et non `chartRecords`.
                 En mode Predict, le shop-level n'a aucune dimension article ; le grain
                 article des prévisions vient des scénarios Event Predict. Les events
                 prédits sans scénario n'en ont pas → compteur discret. -->
            <MenuItemRevenueDistribution
              v-can="'stats.financial.view'"
              :records="articleRecords"
              :loading="itemRecordsLoading || (isPredictMode && predictionsGenerating)"
              :missing-events-count="predictEventsWithoutScenarioCount"
              @item-click="(v) => toggleArrayFilter('selectedMenuItemIds', v)"
              @type-click="(v) => toggleArrayFilter('selectedMenuItemTypes', v)"
              @category-click="(v) => toggleArrayFilter('selectedMenuItemCategories', v)"
              @shop-type-click="(v) => toggleArrayFilter('selectedShopTypes', v)"
            />
            <MenuItemsByShopTable
              v-can="'stats.financial.view'"
              :records="articleRecords"
              :loading="itemRecordsLoading || (isPredictMode && predictionsGenerating)"
              :missing-events-count="predictEventsWithoutScenarioCount"
              @events-click="onTableEventsClick"
            />
          </template>
        </template>
      </v-container>
        </div>

        <!-- Colonne droite : éditeur de filtre (au-dessus, si un tag est cliqué)
             puis le leaderboard résumé. -->
        <div class="an-right">
          <FilterEditorPanel
            v-if="activeFilterEditor"
            :label="activeFilterEditor.label"
            :items="activeFilterEditor.items"
            :model-value="activeFilterEditor.selected"
            @update:model-value="(v) => setFilterImmediate(activeFilterDimension, v)"
            @close="activeFilterDimension = null"
          />
          <SummaryPanel
            v-can="'stats.financial.view'"
            :records="chartRecords"
            :item-records="itemLevelRecords"
            :events="filteredEvents"
            :shop-rates="shopPerformance.shops.value"
            :ensure-dataset="ensureAssistantDataset"
            @analyze="onAnalyzeQuery"
            @shop-click="(v) => toggleArrayFilter('selectedShopIds', v)"
            @event-click="(v) => toggleArrayFilter('selectedEventIds', v)"
            @item-click="(v) => toggleArrayFilterMany('selectedMenuItemIds', v)"
          />
        </div>
      </div>
    </v-main>

    <!-- Mobile uniquement : drawer de nav entre outils du workspace (☰ du header). -->
    <WorkspaceMobileToolDrawer
      v-model="showMobileToolDrawer"
      :items="toolboxItems"
      current-value="analyse"
      :title="t('srToolsLabel')"
      @select="onToolboxSelect"
    />

    <!-- Predict / Event Predict overlay -->
    <EventPredictView
      v-if="showPredictOverlay && space"
      :space="space"
      @close="closePredictOverlay"
    />

    <!-- Dialog : liste des évènements pour un combo PdV × article (clic cellule Events) -->
    <!-- Drill-down d'une cellule de MenuItemsByShopTable : MÊME dataset que la
         table (`articleRecords`), sinon en mode Predict le dialog interrogerait le
         shop-level sans nom d'article → toujours 0 event. Hors Predict,
         articleRecords === chartRecords : aucun changement. -->
    <ShopItemEventsDialog
      v-model="shopItemEventsDialog"
      :records="articleRecords"
      :shop-name="eventsDialogShop"
      :menu-item-name="eventsDialogItem"
      :events="filteredEvents"
    />

    <!-- Dialog : évènements écartés de la moyenne (pas de coup d'envoi) -->
    <UnalignedEventsDialog
      v-model="unalignedDialog"
      :events="timelineSkippedEvents"
      @edit-event="onEditUnalignedEvent"
    />

    <v-snackbar
      v-model="snackbar"
      :timeout="2500"
      location="bottom right"
      :color="snackbarColor"
    >
      {{ snackbarText }}
    </v-snackbar>

    <!-- Document du Rapport J+1 : monté hors écran UNIQUEMENT pendant la
         génération (useReportJ1), capturé par html2canvas puis démonté. -->
    <ReportJ1Document v-if="reportJ1Data" :data="reportJ1Data" />

    <!-- Édition de l'event live en cours (module Live, 2026-08-05) — même drawer
         que /events, dates verrouillées (lock-date). -->
    <EventFormDrawer
      v-model="liveEventEditOpen"
      mode="edit"
      :initial-event="liveEventObject"
      :is-dark="isDark"
      lock-date
      @submitted="liveShopDetailsPoll"
    />

  </v-app>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, onActivated, onDeactivated, watch, nextTick, defineAsyncComponent } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useDisplay, useTheme } from 'vuetify'
import WorkspacePanelToggle from '@/components/WorkspacePanelToggle.vue'
import WorkspaceMobileToolDrawer from '@/components/WorkspaceMobileToolDrawer.vue'
import { useWorkspaceToolbox } from '@/composables/useWorkspaceToolbox'

import WorkspaceAppHeader from '@/components/WorkspaceAppHeader.vue'
import { formatCurrency, formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'
import { useNumberFormat } from '@/composables/useNumberFormat'
import FilterPanel from '../filters/FilterPanel.vue'
import LiveInventoryPanel from '@/components/space-workspace/shared/LiveInventoryPanel.vue'
import LiveSaleSimulatorWidget from '../LiveSaleSimulatorWidget.vue'
import FilterSummary from '../filters/FilterSummary.vue'
import FinancialMetricsGrid from '../panels/FinancialMetricsGrid.vue'
import EventRevenueByShopChart from '../charts/EventRevenueByShopChart.vue'
import EventTimelineChart from '@/components/space-workspace/shared/EventTimelineChart.vue'
import ShopDistributionPieChart from '../charts/ShopDistributionPieChart.vue'
import TransactionCategoryMixChart from '../charts/TransactionCategoryMixChart.vue'
import MenuItemRevenueDistribution from '../tables/MenuItemRevenueDistribution.vue'
import MenuItemsByShopTable from '../tables/MenuItemsByShopTable.vue'
import SummaryPanel from '../panels/SummaryPanel.vue'
import FilterEditorPanel from '../panels/FilterEditorPanel.vue'
import ShopPerformanceByTransactionRate from '../charts/ShopPerformanceByTransactionRate.vue'
import { getDateRangePresets, PRESET_I18N_KEYS } from '@/constants/dateRangePresets'
import { getSpaceLiveStatus } from '@/api/endpoints/space.api'
// PERF: chargé en async → le chunk de la monolithe EventPredictView (~71KB gz JS
// + 13KB gz CSS) n'est téléchargé QUE lorsque l'overlay s'ouvre (v-if
// showPredictOverlay), plus à chaque navigation vers space-analyse.
const EventPredictView = defineAsyncComponent(() => import('@/components/space-workspace/event-predict/views/EventPredictView.vue'))
import GenericByEventChart from '../charts/GenericByEventChart.vue'
import ShopItemEventsDialog from '../dialogs/ShopItemEventsDialog.vue'
import UnalignedEventsDialog from '../dialogs/UnalignedEventsDialog.vue'

import { useFilters } from '@/composables/useFilters'
import { useMetricsCalculator } from '@/composables/useMetricsCalculator'
import { useShopPerformance } from '@/composables/useShopPerformance'
import { useAnalyseTimeline } from '@/composables/useAnalyseTimeline'
import { useAnalyseItemRecords, ITEM_LEVEL_EVENT_CAP } from '@/composables/useAnalyseItemRecords'
import { pickRevenueRecords, resolveKpiSourceState } from '@/utils/analyseRevenueSource'
import { useAnalyseCapture } from '@/composables/useAnalyseCapture'
import { useAnalyseDataset } from '@/composables/useAnalyseDataset'
import { useAnalyseExport } from '@/composables/useAnalyseExport'
import { useReportJ1 } from '@/composables/useReportJ1'
import ReportJ1Document from '../ReportJ1Document.vue'
import EventFormDrawer from '@/components/events/drawers/EventFormDrawer.vue'
import store from '@/store'
import { setAccessToken } from '@/api/client'
import { supabase } from '@/lib/supabase'
import { parseEventDate as parseEventDateLocal, formatDateShort } from '@/utils/dateFr'
import {
  resolveItemName,
  resolveItemType,
  resolveItemCategory,
  buildItemFilterPredicate,
} from '@/utils/analyseDimensions'
// BUG-364-01 : détection d'une plage horaire active (curseur de la courbe).
import { hasActiveRange } from '@/utils/timelineBucketing'
import { UNATTACHED_ITEM_KEY, reconcileRecord } from '@/utils/analyseReconciliation'
import { useReconciliationContext } from '@/composables/useReconciliationContext'
import { useTransactionBaskets } from '@/composables/useTransactionBaskets'
import { useAnalyseUnmapped } from '@/composables/useAnalyseUnmapped'
import { buildBasketFilterPredicate } from '@/utils/transactionBaskets'
import { sumShopTransactionRates } from '@/utils/shopPerformanceCompute'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()
// Format % localisé (« 47,0 % » fr / « 47.0% » en) — règle BUG-240.
const { formatPercentLocale } = useNumberFormat()

const route = useRoute()
const router = useRouter()
// Sur mobile / tablette, les drawers de filtre + résumé doivent être fermés
// par défaut pour ne pas masquer le contenu (cf. version Figma responsive).
const { mdAndDown } = useDisplay()

// Nav entre outils du workspace : drawer mobile « Outils » (☰), pattern Logistic.
const showMobileToolDrawer = ref(false)
const { toolboxItems, onToolboxSelect } = useWorkspaceToolbox('analyse')

// Dark mode : composant autonome via le thème Vuetify global (useTheme). Sert à
// scoper les overrides CSS custom sous `.analyse-app--dark` (le thème Vuetify
// gère déjà les v-card/v-btn/... ; ici on ne corrige que nos couleurs codées en dur).
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const drawer = ref(!mdAndDown.value)
// Panneau « Analyse des données » : ouvert par défaut sur desktop, fermé
// sur mobile/tablette. Les sections internes sont repliables via accordéon.
const summaryDrawer = ref(!mdAndDown.value)
const inlineChartVisible = ref(false)
const inlineChartAccent = ref('#64748b')
const byEventMetric = ref('revenue')

// Point 18 — dialog des évènements pour un combo PdV × article
const shopItemEventsDialog = ref(false)
const eventsDialogShop = ref('')
const eventsDialogItem = ref('')
function onTableEventsClick({ shopName, menuItemName }) {
  eventsDialogShop.value = shopName || ''
  eventsDialogItem.value = menuItemName || ''
  shopItemEventsDialog.value = true
}

const {
  filters,
  filteredEvents,
  filteredShopGranularData,
  activeFilterChips,
  analysableEvents,
  setFilterImmediate,
  toggleArrayFilter,
  toggleArrayFilterMany,
  resetFilters,
} = useFilters()

// Actif dès premier rendu, avant même récupération session Supabase. Évite
// flash contenu vide entre fin transition route et SET_LOADING du store.
const initialLoadPending = ref(true)
let analyseLoadRequestId = 0
const loading = computed(() => initialLoadPending.value || store.state.analyse.loading)
// Phase 2 (granular/menu) charge en arrière-plan après le premier rendu : tant
// qu'elle tourne et qu'aucun record n'est encore arrivé, on affiche un skeleton
// animé à la place des graphiques plutôt que le message « aucune donnée ».
const enriching = computed(() => store.state.analyse.enriching)
// BUG-350-01 — les graphes suivent la MÊME règle que les KPI : tant que la source
// canonique n'a pas répondu, squelette. Sans ce second terme, le graphe « CA
// évènement par shop » et les donuts peignaient le repli shop-level (42 PdV) puis
// le remplaçaient par l'item-level (38 PdV) — deux jeux de données, pas deux
// étapes de chargement.
const chartsLoading = computed(() =>
  kpiSourceState.value === 'loading' || (enriching.value && filteredRecords.value.length === 0)
)
const error = computed(() => store.state.analyse.error)
const weezeventSetupIncomplete = computed(() => store.state.analyse.weezeventSetupIncomplete)
const space = computed(() => store.state.analyse.space)
const events = computed(() => store.state.analyse.events)
const menuItemCostMap = computed(() => store.state.analyse.menuItemCostMap)
// summary enrichi avec variations (Précédent + N-1 calculées côté client si
// l'API ne les fournit pas — cf. doc §13.7).
const summary = computed(() => store.getters['analyse/summaryWithComparisons'])
const apiBaseUrl = process.env.VUE_APP_API_URL || 'http://localhost:3000/api/v1'

const spaceName = computed(() => space.value?.name || t('anSpaceDefault'))
const filteredRecords = computed(() => filteredShopGranularData.value)
const filteredEventAggregates = computed(() => store.getters['analyse/filteredEventAggregates'])

// Data-driven (parité React) : la liste de PdV vient des VENTES (records des
// events analysables), plus jamais du catalogue/config.
const shopNames = computed(() => store.getters['analyse/salesShopNames'])

// ---- Timeline (chargement, synthèse mock, fermeture) ----------------------
const {
  isTimelineActive,
  selectedEventForTimeline,
  eventTimelineData,
  timelineEventsList,
  timelineLoading,
  timelinePendingCount,
  timelineSkippedEvents,
  timelineHeaderLabel,
  loadTimelineForEvents,
  closeTimeline,
  onTimelineRangeChange,
} = useAnalyseTimeline({ setFilterImmediate })

// Dialog « évènements sans coup d'envoi » (écartés de la moyenne).
const unalignedDialog = ref(false)
// Ouvre la fiche de l'event (page /events) pour saisir son heure de coup d'envoi.
function onEditUnalignedEvent(ev) {
  unalignedDialog.value = false
  router.push({ name: 'events', query: { editEventId: ev.id } })
}

// Source item-level pour « Item performance » (SummaryPanel) et la table
// articles. `filteredRecords` (shop-details) est shop-level : menuItemName null
// → aucun détail article. On précharge donc `event-timeline` (grain article) pour
// TOUS les events visibles (`filteredEvents`) via useAnalyseItemRecords → couvre
// la VUE GLOBALE (tous events) ET le cas 1-event sélectionné (filteredEvents=[ev]).
const {
  itemRecords: globalItemRecords,
  loading: itemRecordsLoading,
  loadedEventIds: mainLoadedEventIds,
  fetchError: itemRecordsError,
  refresh: refreshItemRecords,
  clearCache: clearItemRecordsCache,
  // BUG-350-01 — cap porté à 100 ; au-delà la troncature subsiste et doit être dite.
  truncatedEventCount: itemRecordsTruncatedCount,
  sourceState: itemRecordsSourceState,
  // BUG-363-01 — progression du chargement par paquets (indicateur « x/N »).
  loadProgress: itemRecordsLoadProgress,
} = useAnalyseItemRecords(filteredEvents)

// Contexte de réconciliation PARTAGÉ avec useAnalyseItemRecords : voir
// `useReconciliationContext` pour le pourquoi (deux contextes construits
// séparément = deux catégories possibles pour la même ligne).
const reconciliationCtx = useReconciliationContext()

// `buildItemFilterPredicate` (analyseDimensions.js) est l'UNIQUE implémentation
// des filtres item-level, en miroir du getter store `filteredShopGranularData`
// qui ne couvre que le shop-level. Trois consommateurs : l'item-level réel
// ci-dessous, les records article des scénarios Predict, et la timeline. Le
// filtre event est déjà appliqué en amont (filteredEvents).
const itemLevelRecords = computed(() => {
  // BUG-364-01 (étape 5) : le montage est en grain SUMMARY (event × shop × produit,
  // sans minute). Le curseur horaire (`selectedTimeRange`, écrit par la courbe
  // ouverte) ne peut donc plus filtrer ces lignes — quand la courbe est OUVERTE et
  // qu'une plage est active, la source devient les lignes MINUTE de la courbe
  // (déjà chargées plein grain, même réconciliation, même prédicat). Les bornes
  // sont DATÉES : seules les lignes de l'event ouvert passent — la sémantique
  // d'avant, à l'identique. Courbe fermée : plage résiduelle inerte (skipMinute),
  // le curseur n'a jamais agi sans courbe ouverte.
  const cursorActive = isTimelineActive.value && hasActiveRange(filters.value?.selectedTimeRange)
  if (cursorActive) {
    return reconciledTimelineData.value.filter(buildItemFilterPredicate(filters.value || {}))
  }
  const recs = globalItemRecords.value || []
  if (!recs.length) return []
  return recs.filter(buildItemFilterPredicate(filters.value || {}, { skipMinute: true }))
})

// ─── Timeline : réconciliation + filtrage AVANT le graphique ───────────────
// `eventTimelineData` (useAnalyseTimeline) est un fetch INDÉPENDANT qui ne
// traverse ni le getter store ni le prédicat item-level. Résultat historique :
// la timeline affichait un périmètre différent du reste de la page, et le
// `passesFilters` interne du graphique ne recevait que 3 des 6 dimensions —
// dont 2 inertes (gardées par des maps jamais passées).
//
// On pré-filtre donc ici, avec le MÊME `reconcileRecord` + le MÊME
// `buildItemFilterPredicate` que les donuts. C'est ce qui garantit que cliquer
// une part de donut (qui émet une clé RÉCONCILIÉE, jusqu'à `UNATTACHED_ITEM_KEY`)
// retrouve bien des lignes côté timeline.
//
// Découpage en 2 computeds, calqué sur reconciledShopGranularData /
// filteredShopGranularData du store : la réconciliation est la moitié coûteuse
// et ne dépend pas des filtres — Vue la garde en cache d'un clic à l'autre.
const reconciledTimelineData = computed(() => {
  const recs = eventTimelineData.value || []
  if (!recs.length) return []
  return recs.map((r) => reconcileRecord(r, reconciliationCtx.value))
})

// `skipMinute` OBLIGATOIRE : `selectedTimeRange` est écrit PAR la timeline
// (useAnalyseTimeline). L'appliquer à sa propre entrée rétrécirait ses labels,
// ce qui redéfinit à quoi correspond un même pourcentage de curseur, que le
// drag suivant réémet → rétrécissement monotone jusqu'au vide.
const filteredTimelineData = computed(() =>
  reconciledTimelineData.value.filter(
    buildItemFilterPredicate(filters.value || {}, { skipMinute: true }),
  ),
)

// ─── Paniers : combinaisons de catégories PAR TRANSACTION ──────────────────
// Source DÉDIÉE (endpoint /transaction-baskets) et non dérivée de l'item-level :
// ce dernier est agrégé par (minute × PdV × article) et a donc PERDU l'identité
// du panier — impossible de savoir a posteriori ce qui a été acheté ensemble.
const {
  basketRecords,
  loading: basketsLoading,
  sourceState: basketsSourceState,
  refresh: refreshBaskets,
  clearCache: clearBasketsCache,
} = useTransactionBaskets(filteredEvents)

// ── Volume non mappé (BUG-356-01) — indicateur INFORMATIF du bandeau rouge ──
// Décision JLH 2026-08-24 : les ventes non mappées restent COMPTÉES, affichées
// « Non mappées ». v2 (retour client, même jour) : plus de bandeau dédié — une
// icône ambre dans le bandeau rouge, texte complet au survol, clic → Data
// Integration. Ne change aucun chiffre : distingue « rien vendu » de « rien de
// mappé » (piège BUG-300-01) et pointe le travail restant.
const { unmapped: analyseUnmapped, clearCache: clearUnmappedCache } =
  useAnalyseUnmapped(filteredEvents)
const unmappedBannerText = computed(() => {
  const x = analyseUnmapped.value
  if (!x.known || !x.lines) return ''
  return t('anUnmappedInfo')
    .replace('{lines}', formatNumber(x.lines))
    .replace('{revenue}', formatCurrency(x.revenueHt))
})

// Réconciliation AVANT filtrage, exactement comme la timeline — et pour la même
// raison : les donuts « type de PdV » / « zone » émettent des clés RÉCONCILIÉES
// (jusqu'à `UNATTACHED_SHOP_KEY`), alors que ces records sortent bruts du SQL.
// Filtrer sur leurs champs bruts viderait le donut au clic : la zone réconciliée
// vient de `element.floorName` en priorité, tandis que le record porte
// `se.attributes->>'area'` — la source de REPLI, pas celle qui gagne.
// Un record de panier n'a ni nom d'article ni menuItemId → `reconcileRecord`
// sort par son retour anticipé : dimensions PdV calculées, dimensions article
// vides, `categoryCombo`/`itemCombo` préservés par le spread. C'est ce qu'il faut.
const reconciledBaskets = computed(() => {
  const recs = basketRecords.value || []
  if (!recs.length) return []
  return recs.map((r) => reconcileRecord(r, reconciliationCtx.value))
})

// TOUS les filtres de la page s'appliquent. Les dimensions PdV/horaire passent par
// le prédicat partagé ; les dimensions article sont évaluées en « CONTIENT » sur les
// combinaisons du panier — filtrer « Bières » garde les tickets qui contiennent de
// la bière, paniers MIXTES compris (tranché par l'owner le 2026-07-29, question #42).
// Le sous-titre du graphique affiche le dénominateur retenu, qui bouge donc avec les
// filtres : c'est voulu, un pourcentage doit toujours dire sur quoi il porte.
const filteredBaskets = computed(() =>
  reconciledBaskets.value.filter(buildBasketFilterPredicate(filters.value || {})),
)

// Décision JLH 2026-08-24 — valeur UNIQUE de la carte TX/MIN : Σ des taux moyens
// par PdV (txn / minutes actives réelles de chaque shop), dérivée des paniers
// filtrés — donc réactive à TOUS les filtres de la page comme les autres KPI, et
// stable à l'ouverture/fermeture du panneau Shop Performance (l'ancien override
// au clic faisait sauter la carte d'une formule à l'autre). `null` = pas de
// valeur (predict, ou source paniers pas terminale → squelette via
// kpiSourceState) ; un périmètre chargé sans ticket donne 0, terminal et exact.
const perShopTransactionRateSum = computed(() =>
  isPredictRecords.value || basketsSourceState.value === 'loading'
    ? null
    : sumShopTransactionRates(filteredBaskets.value),
)

// Signature des filtres qui BOUGENT les données de la timeline. Sert au
// graphique à remettre son curseur horaire à pleine largeur : `rangePct` y est
// local, donc après un changement de filtre les mêmes pourcentages désigneraient
// d'autres heures sans que le composant réémette quoi que ce soit — le store
// et le curseur divergeraient en silence.
// `selectedTimeRange` en est EXCLU pour la même raison que `skipMinute`.
const timelineFilterSignature = computed(() => {
  const f = filters.value || {}
  return [
    // BUG-355-01 : `selectedEventIds` INCLUS. Sans lui, changer d'event conservait
    // une plage horaire DATÉE de l'event précédent — bornes d'un autre jour, donc
    // aucun record dans la fenêtre et les vues se vidaient en silence.
    f.selectedEventIds,
    f.selectedShopIds,
    f.selectedShopTypes,
    f.selectedShopAreas,
    f.selectedMenuItemIds,
    f.selectedMenuItemTypes,
    f.selectedMenuItemCategories,
  ]
    .map((arr) => [...(arr || [])].sort().join('|'))
    .join('~')
})

// ─── Dataset UNIQUE data-driven (parité React) ─────────────────────────────
// Toutes les vues (KPI/donuts/tables/perf droite) consomment le MÊME dataset :
// item-level réconcilié (enrichissement dims), SANS aucun gating assignation —
// tout ce qui est vendu compte (décision user 2026-07-02).
// Dataset OPTIONS du filtre articles : item-level BRUT (scopé events via
// filteredEvents) et NON itemLevelRecords — ce dernier applique déjà les
// sélections article/PdV/type/zone de l'utilisateur → les options se
// réduiraient à la sélection courante.
const soldItemOptionRecords = computed(() => globalItemRecords.value || [])
// Mode PREDICT : on consomme le shop-level (`filteredRecords` = filteredShopGranularData)
// qui INCLUT les records prédictifs des events À VENIR (regeneratePredictions). L'item-level
// (event-timeline) ne couvre QUE le passé → en predict il masquerait tous les events futurs.
// Le shop-level y est donc la source CANONIQUE, pas un repli.
//
// Mode ANALYSE : item-level uniquement (futurs déjà exclus en amont).
//
// BUG-350-01 — le repli shop-level a été RETIRÉ. Il publiait un CA calculé par un
// autre moteur (`SpaceRevenueMinuteAgg` : remises déduites, transactions non
// validées incluses, `menuItemId` toujours NULL donc marge figée à 100 %) comme
// s'il était définitif, puis le remplaçait quelques secondes plus tard par la
// vraie valeur — 7 % d'écart mesuré sur Jean Bouin, 28 % sur Auxerre (BUG-247-01).
// Règle retenue : aucune valeur provisoire nulle part. Tant que la source
// canonique n'a pas répondu, les consommateurs affichent un squelette
// (`kpiSourceState === 'loading'`), jamais un montant destiné à bouger.
const isPredictRecords = computed(() => store.state.analyse.selectedToolbox === 'predict')

// Le choix de source et la résolution de l'état vivent dans
// `utils/analyseRevenueSource.js` : arbitrage non tranché (QUESTIONS #62), il
// doit rester repérable et testable hors de ce SFC.
const recordsArgs = () => ({
  isPredict: isPredictRecords.value,
  itemLevelRecords: itemLevelRecords.value,
  shopLevelRecords: filteredRecords.value,
})
const chartRecords = computed(() => pickRevenueRecords(recordsArgs()))
const kpiRecords = computed(() => pickRevenueRecords(recordsArgs()))

// BUG-350-01 — 'loading' | 'ready' | 'empty', relayé à TOUS les consommateurs.
const kpiSourceState = computed(() =>
  resolveKpiSourceState({
    isPredict: isPredictRecords.value,
    itemLevelState: itemRecordsSourceState.value,
    // BUG-354-01 — les transactions et le panier moyen viennent des paniers : la bande
    // reste en squelette tant que cette seconde source canonique n'a pas répondu.
    transactionState: basketsSourceState.value,
  }),
)

// BUG-350-01 — état vide EXPLICITE : des events dans le périmètre, mais aucun
// record item-level et plus rien en vol (batch KO, PdV non mappés, dates d'event
// hors fenêtre — cf. « Match 10 Mai », BUG-247-01). Sans ce message, l'écran
// affiche 0 € et se lit comme « pas de ventes », ce qui est souvent faux.
const itemLevelEmpty = computed(() =>
  !isPredictRecords.value
  && kpiSourceState.value === 'empty'
  && (filteredEvents.value || []).length > 0
)

// ─── Grain ARTICLE en mode Predict ─────────────────────────────────────────
// `chartRecords` est shop-level en predict (menuItemId null partout) → les 2 vues
// article seraient vides. Le grain article des prévisions vient des SCÉNARIOS
// Event Predict (`version.predictedRecords`), reconstruits par le store dans
// regeneratePredictions. Ils portent des libellés bruts → on les RÉCONCILIE avec
// le même contexte que useAnalyseItemRecords (type/catégorie/zone catalogue).
const predictScenarioRecords = computed(() => {
  if (!isPredictRecords.value) return []
  const raw = store.state.analyse.predictScenarioItemRecords || []
  if (!raw.length) return []
  const eventIds = new Set((filteredEvents.value || []).map((e) => e?.id))
  const scoped = raw.filter((r) => eventIds.has(r.eventId))
  if (!scoped.length) return []
  // `skipMinute` : ces records sont PRÉ-AGRÉGÉS par (shop × article) et n'ont
  // donc pas de champ `minute`. `isMinuteInRange` renvoie false pour un `minute`
  // absent dès qu'une borne est posée (timelineBucketing.js:97) → sans l'option,
  // poser le slider horaire les ferait tous disparaître. La fenêtre horaire du
  // scénario est déjà appliquée en amont, côté EventPredict.
  const keep = buildItemFilterPredicate(filters.value || {}, { skipMinute: true })
  return scoped.map((r) => reconcileRecord(r, reconciliationCtx.value)).filter(keep)
})

// Events couverts par un scénario — dérivé du state BRUT, jamais de
// `predictScenarioRecords` (déjà filtré) : un event dont les filtres excluent tous
// les articles sortirait de l'ensemble et ses ventes RÉELLES rentreraient par la
// porte de derrière → double comptage partiel sous filtre PdV/article.
const scenarioEventIds = computed(
  () => new Set((store.state.analyse.predictScenarioItemRecords || []).map((r) => r.eventId)),
)

// Source des 2 vues article. Hors predict : inchangé (`chartRecords`). En predict :
// même périmètre que le reste de la page — réel item-level pour les events sans
// scénario, records de scénario pour les autres (un event passé AVEC scénario existe
// en double côté shop-level : réel + copie prédictive scalée, cf. `pastPredictive`).
const articleRecords = computed(() => {
  if (!isPredictRecords.value) return chartRecords.value
  const covered = scenarioEventIds.value
  const actualPast = itemLevelRecords.value.filter((r) => !covered.has(r.eventId))
  return [...actualPast, ...predictScenarioRecords.value]
})

// Mode PREDICT : un scénario produit des quantités par article, JAMAIS de tickets —
// il n'y a donc aucun panier à répartir pour ces events. On compte ceux qui ne
// remontent aucun panier plutôt que de les laisser disparaître du dénominateur en
// silence (même principe que `predictEventsWithoutScenarioCount` ci-dessous).
// Hors Predict, l'absence de panier signifie « aucune vente » et n'a pas à être
// signalée comme une lacune.
const basketsMissingEventCount = computed(() => {
  if (!isPredictRecords.value) return 0
  const withBaskets = new Set((basketRecords.value || []).map((r) => r.eventId))
  return (filteredEvents.value || []).filter((e) => e?.id && !withBaskets.has(e.id)).length
})

// Events visibles qui ont une prédiction shop-level mais AUCUN scénario sauvegardé :
// le moteur ne produit pas de dimension article → ils sont absents des 2 vues.
// Compté ici pour l'afficher plutôt que sous-compter en silence.
const predictEventsWithoutScenarioCount = computed(() => {
  if (!isPredictRecords.value) return 0
  const covered = scenarioEventIds.value
  const predicted = new Set(
    (filteredRecords.value || []).filter((r) => r.isPredictive).map((r) => r.eventId),
  )
  let n = 0
  for (const id of predicted) if (!covered.has(id)) n += 1
  return n
})

// Scope event strict (décision C) : une config sélectionnée sans aucun event rattaché
// → message dédié plutôt qu'une page vide trompeuse.
const noEventsForConfig = computed(
  () => !!filters.value.selectedConfigurationId && (analysableEvents.value || []).length === 0,
)

// ─── Comparaison Précédent/N-1 sur item-level (décision B) ─────────────────
// Le CA courant vient de l'item-level (décision A) ; pour que les variations
// soient cohérentes, on charge AUSSI l'item-level des events des périodes de
// comparaison (lazy, caché par useAnalyseItemRecords) et on recalcule curr/prev/YoY
// sur le MÊME dataset mappé+assigné. En mode predict / catalogue non prêt → on
// retombe sur le summary store (shop-level).
const comparisonEvents = computed(() => {
  // Comparaison OFF (défaut) → aucun event à charger, zéro fetch.
  if (!filters.value.comparisonMode) return []
  const prev = store.getters['analyse/previousPeriodBounds'] || {}
  const yoy = store.getters['analyse/yearOverYearBounds'] || {}
  const base = store.getters['analyse/eventsMatchingFiltersExceptDate'] || []
  const inRange = (d, b) => b.start && b.end && d >= b.start && d <= b.end
  return base.filter((e) => {
    // Parse robuste (DD/MM/YYYY ET ISO) : new Date('13/07/2025') = Invalid →
    // fenêtres de comparaison vides → variations Précédent/N-1 KO.
    const d = parseEventDateLocal(e.date || e.eventDate)
    return d && (inRange(d, prev) || inRange(d, yoy))
  })
})
// Séquencement (perf) : la comparaison ne démarre qu'après le chargement des
// timelines PRINCIPALES — divise le burst réseau du mount par deux. itemSummary
// masque déjà les variations pendant comparisonLoading.
const comparisonEventsGated = computed(() =>
  itemRecordsLoading.value ? [] : comparisonEvents.value,
)
// Cap élevé (100 vs 50) : les fenêtres prev∪N-1 couvrent jusqu'à 24 mois.
const {
  itemRecords: comparisonItemRecords,
  loading: comparisonLoading,
  loadedEventIds: comparisonLoadedEventIds,
  fetchError: comparisonItemRecordsError,
  clearCache: clearComparisonCache,
} = useAnalyseItemRecords(comparisonEventsGated, { maxEvents: 100 })

// État explicite « pas de données de comparaison » (au lieu du silence) : bornes
// de comparaison nulles OU aucun event dans la fenêtre du mode courant.
const comparisonEmpty = computed(() => {
  if (isPredictRecords.value || comparisonLoading.value) return false
  const mode = filters.value.comparisonMode
  if (!mode) return false
  const b = store.getters[
    mode === 'year_over_year' ? 'analyse/yearOverYearBounds' : 'analyse/previousPeriodBounds'
  ] || {}
  if (!b.start || !b.end) return true
  const base = store.getters['analyse/eventsMatchingFiltersExceptDate'] || []
  return !base.some((e) => {
    const d = parseEventDateLocal(e.date || e.eventDate)
    return d && d >= b.start && d <= b.end
  })
})

// Fenêtres de comparaison rendues VISIBLES (infobulle ⓘ) : période courante
// (dateBounds du preset) ET période comparée (dates réelles + nb d'events).
// Vide → la note comparisonEmpty prend le relais.
const comparisonWindowLabel = computed(() => {
  if (isPredictRecords.value) return ''
  const mode = filters.value.comparisonMode
  if (!mode) return ''
  const b = store.getters[
    mode === 'year_over_year' ? 'analyse/yearOverYearBounds' : 'analyse/previousPeriodBounds'
  ] || {}
  if (!b.start || !b.end) return ''
  const base = store.getters['analyse/eventsMatchingFiltersExceptDate'] || []
  let count = 0
  for (const e of base) {
    const d = parseEventDateLocal(e.date || e.eventDate)
    if (d && d >= b.start && d <= b.end) count++
  }
  if (!count) return ''
  const cur = store.getters['analyse/dateBounds'] || {}
  const fmt = (w) => `${formatDateShort(w.start)} → ${formatDateShort(w.end)}`
  const curPart = cur.start && cur.end ? `${t('anPeriod')} : ${fmt(cur)} · ` : ''
  return `${curPart}${t('anComparedToWindow')} ${fmt(b)} (${count} ${t('anEventsWord')})`
})

// « Tout l'historique » : toggle de comparaison MASQUÉ (FilterSummary/FilterPanel)
// → reset du mode, sinon flèches + infobulle resteraient pilotées par un état
// devenu invisible.
// « Période personnalisée » : ouvre le panneau de filtres gauche et met en
// exergue l'accordéon Dates (champs début/fin) pour guider la saisie.
const filterPanelRef = ref(null)
watch(() => filters.value.timeRange, (tr) => {
  if (tr === 'all' && filters.value.comparisonMode) {
    setFilterImmediate('comparisonMode', null)
  }
  if (tr === 'custom') {
    drawer.value = true
    nextTick(() => filterPanelRef.value?.revealDates?.())
  }
})

function itemTotals(records, events, idSet) {
  const costMap = store.state.analyse.menuItemCostMap || {}
  let revenue = 0, cost = 0, transactions = 0, attendees = 0
  // Parité React (validEventCount) : moyennes par event divisées par les
  // events AVEC CA (> 0) — un event sans ventes ne dilue pas la moyenne.
  // BUG-284 : revByEvent rempli dans LA MÊME passe que les totaux (avant : 2ᵉ
  // boucle complète sur records) — mêmes accumulations, même ordre, résultat
  // identique au bit près, une passe au lieu de deux par appel (×3 appels).
  const revByEvent = new Map()
  for (const r of records) {
    if (!idSet.has(r.eventId)) continue
    revenue += r.revenue || 0
    cost += (costMap[r.menuItemId] || 0) * (r.quantity || 0)
    transactions += r.transactionCount || 0
    revByEvent.set(r.eventId, (revByEvent.get(r.eventId) || 0) + (r.revenue || 0))
  }
  for (const e of events) {
    if (!idSet.has(e.id)) continue
    attendees += e.ticketsScanned ?? e.attendees ?? e.ticketsSold ?? 0
  }
  const eventCount = idSet.size
  let validEventCount = 0
  for (const v of revByEvent.values()) if (v > 0) validEventCount++
  return {
    revenue, cost, transactions, attendees, eventCount, validEventCount,
    avgRevenuePerEvent: validEventCount ? revenue / validEventCount : 0,
    avgCost: validEventCount ? cost / validEventCount : 0,
    avgPerTransaction: transactions ? revenue / transactions : 0,
    perCapita: attendees ? revenue / attendees : 0,
    margin: revenue ? ((revenue - cost) / revenue) * 100 : 0,
    transferRate: attendees ? (transactions / attendees) * 100 : 0,
  }
}
function buildVar(curr, prev) {
  if (!prev || !prev.eventCount) return {}
  const pct = (c, p) => (p ? ((c - p) / p) * 100 : null)
  return {
    revenue: pct(curr.revenue, prev.revenue),
    avgRevenuePerEvent: pct(curr.avgRevenuePerEvent, prev.avgRevenuePerEvent),
    cost: pct(curr.cost, prev.cost),
    avgCost: pct(curr.avgCost, prev.avgCost),
    transactions: pct(curr.transactions, prev.transactions),
    avgPerTransaction: pct(curr.avgPerTransaction, prev.avgPerTransaction),
    perCapita: pct(curr.perCapita, prev.perCapita),
    // Parité stricte avec buildVariations (store) — headerVariation lit
    // avgTransaction et attendees.
    avgTransaction: pct(curr.avgPerTransaction, prev.avgPerTransaction),
    attendees: pct(curr.attendees, prev.attendees),
    // Marge = points de % (parité React) ; transfo = pct diff des TAUX.
    margin: curr.margin - prev.margin,
    transferRate: pct(curr.transferRate, prev.transferRate),
  }
}
// Summary branché sur le grid KPI : variations item-level en mode analyse (dès que
// l'item-level est chargé), sinon summary store (shop-level). Variations masquées
// tant que l'item-level des périodes de comparaison charge (évite un faux « -100% »).
const itemSummary = computed(() => {
  if (isPredictRecords.value) return summary.value
  // BUG-350-01 — hors predict, plus de repli sur `summary` (store, shop-level) :
  // afficher une variation calculée sur l'AUTRE moteur à côté d'une valeur
  // item-level, c'est exactement la divergence valeur/variation du bug #9 du
  // module 02. Sans item-level → pas de variation, pas de faux %.
  if (!itemLevelRecords.value.length) {
    return { ...(summary.value || {}), variations: {}, variationsYoY: {} }
  }
  const base = { ...(summary.value || {}), comparisonMode: filters.value.comparisonMode }
  if (comparisonLoading.value) return { ...base, variations: {}, variationsYoY: {} }
  const kept = comparisonItemRecords.value
  const eventsBase = store.getters['analyse/eventsMatchingFiltersExceptDate'] || []
  const idsInBounds = (b) => {
    const s = new Set()
    if (!b?.start || !b?.end) return s
    for (const e of eventsBase) {
      const d = parseEventDateLocal(e.date || e.eventDate)
      if (d && d >= b.start && d <= b.end) s.add(e.id)
    }
    return s
  }
  // Intersection avec les events réellement fetchés (cap useAnalyseItemRecords) :
  // eventCount/attendees restent cohérents avec le revenue partiel. Biais résiduel
  // au-delà du cap : les totaux absolus comparent des échantillons, mais les
  // ratios (panier, per-capita, marge, transfo) couvrent le même set d'events.
  const withLoaded = (set, loaded) => new Set([...set].filter((id) => loaded.has(id)))
  // Côté COURANT = filteredEvents (déjà bornés par le preset daté ; en 'all'
  // la comparaison est désactivée — parité React).
  const curIds = withLoaded(new Set(filteredEvents.value.map((e) => e.id)), mainLoadedEventIds.value)
  const cur = itemTotals(itemLevelRecords.value, filteredEvents.value, curIds)
  const prev = itemTotals(kept, eventsBase,
    withLoaded(idsInBounds(store.getters['analyse/previousPeriodBounds']), comparisonLoadedEventIds.value))
  const yoy = itemTotals(kept, eventsBase,
    withLoaded(idsInBounds(store.getters['analyse/yearOverYearBounds']), comparisonLoadedEventIds.value))
  return { ...base, variations: buildVar(cur, prev), variationsYoY: buildVar(cur, yoy) }
})

// Fermeture demandée par utilisateur : revenir à vue overview complète.
// Sans reset event, graphe reste limité à barre ayant ouvert timeline.
function onCloseTimeline() {
  closeTimeline()
  setFilterImmediate('selectedEventIds', [])
  setFilterImmediate('selectedShopIds', [])
  setFilterImmediate('selectedShopTypes', [])
  setFilterImmediate('selectedShopAreas', [])
}

// ---- Capture / partage (html2canvas, clipboard, Web Share API) -----------
const { copying, sharing, snackbar, snackbarText, snackbarColor, onCopy, onShare } =
  useAnalyseCapture({ spaceName })

// Échec du batch event-timeline (item-level) : sans signalement, l'écran est
// indistinguable d'un « 0 article pour cette configuration » (fiche 164). Le
// composable garantit une seule alerte par session (flag module _warnedBatchKo).
watch([itemRecordsError, comparisonItemRecordsError], ([mainErr, compErr]) => {
  if (!mainErr && !compErr) return
  snackbarText.value = t('anItemTimelineLoadError')
  snackbarColor.value = 'warning'
  snackbar.value = true
})

// BUG-350-01 — le cap item-level est passé de 50 à 100, mais la troncature n'a
// pas disparu : au-delà de 100 events dans le périmètre, le CA des suivants
// n'entre dans AUCUNE vue item-level. Ce total sous-compte, il doit le dire.
// Snackbar une fois par montage + bandeau permanent (`itemLevelTruncated`) tant
// que la condition tient : le bandeau est la garantie, le snackbar l'alerte.
let _warnedTruncation = false
watch(itemRecordsTruncatedCount, (n) => {
  if (!n || _warnedTruncation) return
  _warnedTruncation = true
  snackbarText.value = t('anItemLevelTruncated').replace('{n}', String(ITEM_LEVEL_EVENT_CAP))
  snackbarColor.value = 'warning'
  snackbar.value = true
}, { immediate: true })

// Contexte PdV (shops DataFriday + assignation item↔PdV) rechargé à chaque
// changement de configuration → la réconciliation (getters shop-level + item-level)
// se recompose. « All Configurations » (null) → union de toutes les configs
// (décision D : lazy, uniquement sur sélection explicite).
watch(
  () => store.state.analyse.filters.selectedConfigurationId,
  (cfgId) => {
    if (cfgId && cfgId !== 'cfg-all') store.dispatch('analyse/loadConfigShopContext', cfgId)
    // Union « All Configurations » : pas pendant l'overlay Event Predict (fan-out
    // configs × shops invisible derrière) — relancée au retour (watcher toolbox).
    else if (store.state.analyse.selectedToolbox !== 'event-predict') store.dispatch('analyse/loadAllConfigsShopContext')
    // Reflète la config sélectionnée dans l'URL (`?config=<id>`) → rechargement /
    // partage de lien restaure la même configuration. `replace` (pas `push`) pour
    // ne pas polluer l'historique à chaque changement de filtre.
    try {
      const nextQuery = { ...route.query }
      if (cfgId && cfgId !== 'cfg-all') nextQuery.config = cfgId
      else delete nextQuery.config
      if (nextQuery.config !== route.query.config) {
        router.replace({ path: route.path, query: nextQuery })
      }
    } catch (_) { /* router pas prêt */ }
  },
)

// PERF (décision « différer seulement ») : le contexte « All Configurations »
// (N+1 : configs × (getConfiguration + assignation Edge + shopMenuItems PAR SHOP))
// ne bloque plus le chargement — loadSpace ne le dispatch plus. On le déclenche
// ICI, après la fin de la phase 2 (enriching=false), avec repli idle 3 s si la
// phase 2 traîne. L'enrichissement dims arrive donc en fond (réconciliation se
// recompose au commit — comportement existant). Garde : ne rien faire si une
// config précise a été sélectionnée entre-temps (son contexte se charge déjà) ou
// si le contexte union est déjà chargé/en cours.
let allConfigsCtxRequested = false
function requestDeferredAllConfigsContext() {
  if (allConfigsCtxRequested) return
  const st = store.state.analyse
  if (!st.spaceId && !st.space?.id) return // space pas encore chargé → retenter plus tard
  // Event Predict ouvert : l'union serait du travail invisible (configs × shops).
  // Ne PAS latcher — le watcher selectedToolbox relancera au retour sur Analyse.
  if (st.selectedToolbox === 'event-predict') return
  const sel = st.filters.selectedConfigurationId
  // Config précise sélectionnée entre-temps, ou contexte déjà en cours/chargé →
  // le différé n'a plus rien à faire.
  if (
    (sel && sel !== 'cfg-all') ||
    st.configContextLoading ||
    (st.configShopContext?.configId === null && (st.configShopContext?.floorElements?.length || 0) > 0)
  ) {
    allConfigsCtxRequested = true
    return
  }
  allConfigsCtxRequested = true
  store.dispatch('analyse/loadAllConfigsShopContext')
}
// Retour depuis Event Predict : l'union sautée pendant l'overlay part maintenant.
watch(
  () => store.state.analyse.selectedToolbox,
  (tb, prev) => {
    if (prev === 'event-predict' && tb !== 'event-predict') requestDeferredAllConfigsContext()
  },
)
// Déclencheur principal : fin de la phase 2 (enrichissement).
watch(
  () => store.state.analyse.enriching,
  (enriching, prev) => {
    if (prev === true && enriching === false) requestDeferredAllConfigsContext()
  },
)
// Repli : 3 s après la fin de la phase 1 (si la phase 2 traîne, on lance quand même).
watch(
  () => store.state.analyse.loading,
  (loading, prev) => {
    if (prev === true && loading === false && typeof window !== 'undefined') {
      allConfigsCtxRequested = false // nouveau cycle de chargement (space chargé/rechargé)
      window.setTimeout(requestDeferredAllConfigsContext, 3000)
    }
  },
)

// Remonte au store les OPTIONS du filtre articles (articles VENDUS) dérivées du
// dataset item-level → getters salesMenuItem*. Data-driven partout, y compris en
// predict : les options reflètent ce qui s'est vendu, skip des agrégats shop-level
// (`noitem`) qui n'ont pas de dimension article.
watch(
  soldItemOptionRecords,
  () => {
    const names = new Set()
    const types = new Set()
    const categories = new Set()
    for (const r of soldItemOptionRecords.value) {
      if (r.mapStatus === 'noitem') continue
      const n = resolveItemName(r)
      if (n && n !== UNATTACHED_ITEM_KEY) names.add(n)
      const t = resolveItemType(r)
      if (t && t !== UNATTACHED_ITEM_KEY) types.add(t)
      const c = resolveItemCategory(r)
      if (c && c !== UNATTACHED_ITEM_KEY) categories.add(c)
    }
    store.dispatch('analyse/setSoldItemOptions', {
      names: [...names], types: [...types], categories: [...categories],
    })
  },
  { immediate: true },
)

// Le fetch item-level vit hors store : sans ce relais, `filtersState` voit des
// options articles vides pendant le chargement et affiche « Aucun article
// disponible pour cette configuration. » alors que les donuts tournent encore.
watch(
  itemRecordsLoading,
  (v) => store.dispatch('analyse/setSoldItemOptionsLoading', v),
  { immediate: true },
)

// Purge les sélections de filtres obsolètes (article/PdV/type/zone) dès que les options
// se stabilisent — typiquement après un changement de config (scope events recomposé).
// Gardé par filtersState === 'ready' ; l'action ignore en plus toute dimension dont les
// options sont encore vides (anti-race chargement item-level).
watch(
  () => [
    store.getters['analyse/salesShopNames'],
    store.getters['analyse/salesMenuItemNames'],
    store.getters['analyse/salesShopTypes'],
    store.getters['analyse/salesShopAreas'],
    store.getters['analyse/salesMenuItemTypes'],
    store.getters['analyse/salesMenuItemCategories'],
  ],
  () => {
    if (store.getters['analyse/filtersState'] !== 'ready') return
    store.dispatch('analyse/pruneFiltersToOptions')
  },
)

// BUG-146-01 (décision Bertrand 25/08) — CA/transactions de la bande KPI depuis le
// rollup `Event.revenue`/`transactionCount` (même donnée qu'Events Library et que la
// carte d'accueil → cohérence au centime par construction), UNIQUEMENT quand le
// périmètre affiché est « des events entiers » : mode Analyse, aucun filtre qui
// découpe l'INTÉRIEUR des events (PdV / type / zone / article / curseur horaire).
// Les filtres d'events (catégories, équipes, dates…) réduisent `filteredEvents` et
// restent compatibles — le rollup se somme sur les events filtrés. `null` sinon →
// formules record-level historiques.
const intraEventFiltersActive = computed(() => {
  const f = filters.value || {}
  const some = (v) => Array.isArray(v) && v.length > 0
  const tr = f.selectedTimeRange
  return (
    some(f.selectedShopIds) || some(f.selectedShopTypes) || some(f.selectedShopAreas) ||
    some(f.selectedMenuItemIds) || some(f.selectedMenuItemTypes) || some(f.selectedMenuItemCategories) ||
    !!(tr && (tr.start || tr.end))
  )
})
const eventRollupTotals = computed(() => {
  if (isPredictRecords.value || intraEventFiltersActive.value) return null
  const evs = filteredEvents.value || []
  if (!evs.length) return null
  let revenue = 0
  let transactions = 0
  let eventsWithRevenueCount = 0
  for (const e of evs) {
    // Un event sans rollup (jamais agrégé : `revenue` null/undefined) invalide la
    // bascule — mélanger rollup et absence sous-compterait en silence.
    const r = e.revenue
    if (r == null || Number.isNaN(Number(r))) return null
    revenue += Number(r)
    transactions += Number(e.transactionCount || 0)
    if (Number(r) > 0) eventsWithRevenueCount++
  }
  return { revenue, transactions, eventsWithRevenueCount }
})

const metrics = useMetricsCalculator({
  filteredShopGranularData: kpiRecords,
  chartFilteredEvents: filteredEvents,
  menuItemCostMap,
  eventRollupTotals,
  isTimelineFilterActive: isTimelineActive,
  // operatingMinutes doit refléter les events filtrés (et non l'ensemble brut)
  // pour que la métrique « Transaction Rate » réagisse aux filtres.
  // Utilise event.durationMinutes si disponible, sinon fallback 180 min.
  operatingMinutes: computed(() =>
    filteredEvents.value.reduce((sum, e) => sum + (e.durationMinutes || 180), 0)
  ),
  selectedEventIds: computed(() => filters.value.selectedEventIds || []),
  // BUG-354-01 — les transactions viennent des PANIERS (un ticket = une ligne),
  // plus de la somme du grain article qui comptait un ticket autant de fois qu'il
  // portait d'articles distincts. `null` tant que la source n'a pas répondu.
  // `null` tant que la source paniers n'est pas terminale — `basketsLoading` seul ne
  // suffit pas : au tout premier rendu il vaut encore `false` alors que le batch n'est
  // pas parti, et `filteredBaskets` vaut `[]` (donc « 0 transaction »). L'état à 3
  // valeurs distingue « pas encore » de « rien à afficher ». Pendant 'loading', la
  // bande KPI est de toute façon en squelette (`kpiSourceState`).
  transactionRecords: computed(() =>
    isPredictRecords.value || basketsSourceState.value === 'loading'
      ? null
      : filteredBaskets.value,
  ),
  // Décision JLH 2026-08-24 — Σ des taux par PdV en permanence (voir la
  // définition de `perShopTransactionRateSum`) : plus d'override conditionné à
  // l'ouverture du panneau, le chiffre de la carte ne bouge plus au clic.
  perShopTransactionRate: perShopTransactionRateSum,
})

// ---- KPI de la bande centre du header (WorkspaceAppHeader) -----------------
// Les 8 KPI (ex-AnalyseAppHeader) alimentent la bande KPI partagée. Couleurs
// hex conservées (WorkspaceAppHeader.kpiVars gère l'hex).
// Variation de comparaison (Précédent / N-1 selon le toggle) pour une métrique.
// Source = itemSummary (variations recalculées localement, cohérentes KPI).
function headerVariation(key) {
  const s = itemSummary.value
  if (!s) return null
  // Pas de fallback : mode null = comparaison OFF → aucune flèche.
  const mode = s.comparisonMode
  if (!mode) return null
  const src = (mode === 'year_over_year' ? s.variationsYoY : s.variations) || {}
  const raw = src[key]
  return raw == null || !Number.isFinite(raw) ? null : raw
}

const headerKpis = computed(() => {
  const m = metrics
  // BUG-350-01 — la bande KPI du header suit la même règle que les tuiles : tant
  // que la source canonique n'a pas répondu, aucune valeur. `WorkspaceAppHeader`
  // n'affiche pas de chip sans donnée → liste vide plutôt que 8 montants faux.
  if (kpiSourceState.value === 'loading') return []
  const rev = m.displayRevenue?.value ?? 0
  const trans = m.displayTransactions?.value ?? 0
  const att = m.displayAttendees?.value ?? 0
  return [
    { label: t('anHeaderKpiRevenue'), kind: 'revenue', value: formatCurrency(rev), color: '#10B981', variation: headerVariation('revenue') },
    { label: t('anHeaderKpiAvgPerEvent'), kind: 'avg-revenue', value: formatCurrency(m.displayAvgRevenue?.value ?? 0), color: '#F97316', variation: headerVariation('avgRevenuePerEvent') },
    { label: t('anHeaderKpiCost'), kind: 'cost', value: formatCurrencyDetailed(m.displayCost?.value ?? 0), color: '#ff3131', variation: headerVariation('cost'), invert: true },
    { label: t('anHeaderKpiTransactions'), kind: 'transactions', value: formatNumber(trans), color: '#3B82F6', variation: headerVariation('transactions') },
    // Locale-aware (règle BUG-240 « plus jamais de fr-FR en dur ») : ces trois
    // valeurs suivaient le format français même en interface anglaise.
    { label: t('anHeaderKpiBasket'), kind: 'avg-trans', value: formatCurrencyDetailed(trans ? rev / trans : 0), color: '#A855F7', variation: headerVariation('avgTransaction') },
    { label: t('anHeaderKpiAttendees'), kind: 'attendees', value: formatNumber(att), color: '#0EA5E9', variation: headerVariation('attendees') },
    { label: t('anHeaderKpiTransformation'), kind: 'transformation', value: att ? formatPercentLocale((trans / att) * 100, 1) : '—', color: '#14B8A6', variation: headerVariation('transferRate') },
    { label: t('anHeaderKpiPerCap'), kind: 'percap', value: formatCurrencyDetailed(m.displayPerCapita?.value ?? 0), color: '#EC4899', variation: headerVariation('perCapita') },
  ]
})

// ---- Shop Performance / Transaction Rate panel ----------------------------
const showTransactionRateShops = ref(false)
// Data-driven : tous les PdV vendeurs (records filtrés), aucun scoping config.
const shopPerformance = useShopPerformance({
  shopGranularData: filteredRecords,
  spaceId: computed(() => route.params.spaceId),
  // BUG-287-01 : la plage horaire de la timeline fenêtre txn/min + agrégats.
  timeRange: computed(() => filters.value?.selectedTimeRange || null),
  // BUG-364-01 — sources PARTAGÉES : la page possède déjà la timeline item-level
  // (useAnalyseItemRecords) et les paniers (useTransactionBaskets) pour les mêmes
  // events. Les passer ici supprime le re-téléchargement ET la copie mémoire que
  // ce composable gardait en double (5ᵉ point de rétention, ~164 Mo).
  // BUG-364-01 (étape 5) : le montage est en grain summary (sans minute) ; quand le
  // curseur horaire est actif (courbe ouverte), le panneau bascule sur les lignes
  // MINUTE de la courbe — même source que les KPIs, même sémantique fenêtrée.
  sharedTimelineRecords: computed(() =>
    isTimelineActive.value && hasActiveRange(filters.value?.selectedTimeRange)
      ? reconciledTimelineData.value
      : globalItemRecords.value,
  ),
  sharedBasketRecords: basketRecords,
  sharedReady: computed(
    () => itemRecordsSourceState.value !== 'loading' && basketsSourceState.value !== 'loading',
  ),
})

// Ferme automatiquement le panneau si la sélection devient vide
watch(filteredEvents, (evs) => {
  if (!evs || evs.length === 0) {
    showTransactionRateShops.value = false
    shopPerformance.reset()
  } else if (showTransactionRateShops.value) {
    // Recalcul des agregates quand la selection change
    shopPerformance.enrich(evs)
  }
})

// ---- Dataset partagé + export xlsx/csv ------------------------------------
// Placé ICI et pas plus haut : le composable lit `metrics` et `shopPerformance`,
// définis juste au-dessus. Il ne déclenche aucune requête — il agrège des records
// déjà en mémoire, en tâche idle, une fois les trois chargements terminés.
const exportBusy = computed(
  () => chartsLoading.value || itemRecordsLoading.value || basketsLoading.value,
)

const { ensureDataset } = useAnalyseDataset({
  spaceName,
  filters,
  activeFilterChips,
  filteredEvents,
  filteredRecords,
  chartRecords,
  articleRecords,
  itemLevelRecords,
  filteredBaskets,
  filteredEventAggregates,
  filteredTimelineData,
  timelineHeaderLabel,
  metrics,
  itemSummary,
  shopPerformance,
  // `isPredictRecords` et non `isPredictMode` : même prédicat, mais déclaré plus
  // haut dans le setup. `isPredictMode` ne l'est qu'après ce bloc.
  isPredictMode: isPredictRecords,
  busy: exportBusy,
})

// Construction à la demande du dataset au clic « Analyser » (assistant local),
// pour que ses outils KPI lisent les mêmes chiffres que le bandeau. Garde busy :
// pendant un chargement, figer un dataset sur des records partiels serait pire
// que le repli getter de l'assistant.
const ensureAssistantDataset = () => (exportBusy.value ? null : ensureDataset())

const { exporting, onExportXlsx, onExportCsv } = useAnalyseExport({
  ensureDataset,
  spaceName,
  isPredictMode: isPredictRecords,
  // Réutilise le snackbar déjà monté pour la capture d'écran : un échec
  // d'export doit se voir, pas finir dans la console (défaut des deux exports
  // par bloc existants).
  notify: (text, color = 'success') => {
    snackbarText.value = text
    snackbarColor.value = color
    snackbar.value = true
  },
})

// ---- Rapport J+1 (PDF pour UN event passé) --------------------------------
// Actif uniquement en mode mono-événement (même définition que le calculateur)
// ET si cet event est passé : un « rapport J+1 » d'un event futur n'a pas de
// réel à raconter. En dehors de ce cas, bouton désactivé + tooltip explicite.
const reportEvent = computed(() => {
  const ids = filters.value.selectedEventIds || []
  if (ids.length !== 1) return null
  const ev = (filteredEvents.value || []).find((e) => e?.id === ids[0]) || null
  if (!ev) return null
  const d = parseEventDateLocal(ev.date ?? ev.eventDate)
  if (!d || d.getTime() > Date.now()) return null
  return ev
})

const {
  generatingReport,
  reportData: reportJ1Data,
  onGenerateReportJ1,
} = useReportJ1({
  space,
  reportEvent,
  events,
  metrics,
  articleRecords,
  busy: exportBusy,
  notify: (text, color = 'success') => {
    snackbarText.value = text
    snackbarColor.value = color
    snackbar.value = true
  },
})

// Auto-declenchement de la timeline des qu'un (ou plusieurs) event(s) sont
// sélectionnés comme filtre via FilterSummary, chip, ou tout autre input.
// Évite à l'utilisateur de devoir cliquer sur une barre du graphe pour voir
// la timeline minute-par-minute de l'event qu'il a déjà filtré.
//
// Garde-fous :
//  - ne se déclenche que si la timeline n'est pas déjà active ;
//  - se met à jour si la sélection change (passage d'un event à un autre) ;
//  - se ferme automatiquement quand la sélection est vidée.
watch(
  () => filters.value.selectedEventIds || [],
  (ids, prev = []) => {
    const sameLen = ids.length === (prev?.length || 0)
    const sameContent = sameLen && ids.every((x) => prev.includes(x))
    if (sameContent) return

    // BUG-359-01 — au remontage après un changement d'espace, ce watcher
    // (`immediate: true`) tire AVANT loadSpace : le store contient encore les
    // events ET la sélection de l'ANCIEN espace → la timeline s'ouvrait titrée
    // avec le match de l'espace précédent pendant que le fetch partait avec le
    // nouveau spaceId. Tant que le store n'est pas aligné sur la route, on ne
    // déclenche rien : le reset des filtres au changement d'espace (store,
    // CLEAR_SPACE_KEYED_CACHES) refera passer ce watcher avec un état cohérent.
    if (String(store.state.analyse.spaceId || '') !== String(route.params.spaceId || '')) return

    if (!ids || ids.length === 0) {
      if (isTimelineActive.value) closeTimeline()
      return
    }

    // Plus d'un event sélectionné → on masque la timeline ; les KPI/charts
    // par event/shop filtrent normalement sur ces N events.
    if (ids.length > 1) {
      if (isTimelineActive.value) closeTimeline()
      return
    }

    // Un seul event → afficher sa timeline.
    const pool = filteredEvents.value?.length ? filteredEvents.value : events.value
    const evs = ids
      .map((id) => pool.find((e) => e.id === id))
      .filter(Boolean)
    if (!evs.length) return

    // Déjà actif sur le même event → rien à faire (évite reload inutile).
    const currentId = selectedEventForTimeline.value?.eventId
    if (isTimelineActive.value && evs.length === 1 && currentId === evs[0].id) {
      return
    }
    loadTimelineForEvents(evs)
  },
  { immediate: true, flush: 'post' },
)

// Mode MOYENNE uniquement : un filtre qui change l'ENSEMBLE des events (dates,
// type d'event, curseurs billetterie…) doit relancer le fetch — le snapshot ne
// contient que les events chargés au moment du dernier `loadTimelineForEvents`,
// et aucun filtrage client ne peut inventer un event absent.
// Trois garde-fous, tous porteurs :
//  - comparaison par CONTENU (`filteredEvents` est un computed qui produit un
//    tableau neuf à chaque évaluation → une comparaison de référence tirerait en
//    boucle) ;
//  - restreint à la moyenne : le cas mono-event appartient au watcher
//    `selectedEventIds` ci-dessus, les deux se battraient sinon ;
//  - pas de boucle possible : `filteredEvents` ne lit pas `selectedTimeRange`,
//    que la timeline est seule à écrire.
watch(
  () => (filteredEvents.value || []).map((e) => e?.id).filter(Boolean).sort().join(','),
  (sig, prev) => {
    if (sig === prev) return
    if (!isTimelineActive.value) return
    if (selectedEventForTimeline.value?.eventId !== 'average') return
    if (!filteredEvents.value?.length) {
      closeTimeline()
      return
    }
    loadTimelineForEvents(filteredEvents.value)
  },
)

function clearEvents() {
  setFilterImmediate('selectedEventIds', [])
}
function clearChip(key) {
  // Certains chips ne sont pas des filtres tableau : leur valeur « effacée »
  // est portée par chip.clearValue (ex. timeRange → preset défaut,
  // selectedConfigurationId → null). [] par défaut pour les multi-sélections.
  const chip = (activeFilterChips.value || []).find((c) => c.key === key)
  const cleared = chip && 'clearValue' in chip ? chip.clearValue : []
  setFilterImmediate(key, cleared)
  if (key === 'timeRange') {
    setFilterImmediate('startDate', null)
    setFilterImmediate('endDate', null)
  }
}

// Lot 2 / BUG-284 — le toggle d'un filtre tableau (clic camembert / segment) vit
// désormais dans useFilters (version coalescée 150 ms par clé) : un clic ne
// déclenche plus la vague de recalculs qu'après accalmie, et des clics rapides
// sur la même clé se cumulent sans écrasement.
const previousToolbox = ref('analyse')
// Predict reste inline dans AnalyseView (mode banner + futurs inclus).
// Seul Event Predict ouvre l'overlay full-screen.
const selectedToolbox = computed(() => store.state.analyse.selectedToolbox)
// Fermer un graph KPI inline dès qu'on change d'outil (Analyse → Predict / EP).
watch(selectedToolbox, () => { inlineChartVisible.value = false })

// ── Bandeau : sélecteur de période (ligne 2) ──────────────────────────────
// Presets statiques + saisons de l'espace courant (Rapport Saison), en queue de
// liste sous la valeur `season:<id>` — résolue par le getter store `dateBounds`.
const dateRangeItems = computed(() => {
  const presets = getDateRangePresets(selectedToolbox.value || 'analyse')
  const items = presets.map((p) => ({
    title: (PRESET_I18N_KEYS[p.value] && t(PRESET_I18N_KEYS[p.value])) || p.labelFr,
    value: p.value,
  }))
  const spaceId = route.params.spaceId
  const seasons = spaceId ? store.getters['seasons/seasonsForSpace'](spaceId) : []
  for (const s of seasons) items.push({ title: s.name, value: `season:${s.id}` })
  return items
})

// ── Tags cliquables → éditeur de dimension dans la colonne droite ──────────
// key (= clé d'état filtre = chip.key) → { labelKey, getter (options analyse/*) }.
const DIMENSION_EDITORS = {
  selectedShopIds: { labelKey: 'anShops', getter: 'salesShopNames' },
  selectedShopTypes: { labelKey: 'anTypes', getter: 'salesShopTypes' },
  selectedShopAreas: { labelKey: 'anZones', getter: 'salesShopAreas' },
  selectedMenuItemTypes: { labelKey: 'anItemType', getter: 'salesMenuItemTypes' },
  selectedMenuItemCategories: { labelKey: 'anCategory', getter: 'salesMenuItemCategories' },
  selectedEventCategories: { labelKey: 'anEventCategory', getter: 'uniqueEventCategories' },
  selectedEventTypes: { labelKey: 'anEventType', getter: 'uniqueEventTypes' },
  selectedTeams: { labelKey: 'anTeam', getter: 'uniqueTeams' },
  selectedSponsors: { labelKey: 'anSponsor', getter: 'uniqueSponsors' },
  selectedSubcategories: { labelKey: 'anSubcategory', getter: 'uniqueSubcategories' },
  selectedSessions: { labelKey: 'anSessions', getter: 'uniqueSessions' },
  selectedDoorsOpenings: { labelKey: 'anDoorsOpening', getter: 'uniqueDoorsOpenings' },
  selectedShowTimes: { labelKey: 'anShowTime', getter: 'uniqueShowTimes' },
  selectedPerformerNames: { labelKey: 'anPerformer', getter: 'uniquePerformers' },
  selectedVisitingTeams: { labelKey: 'anVisitingTeam', getter: 'uniqueVisitingTeams' },
  selectedOpeningActs: { labelKey: 'anOpeningAct', getter: 'uniqueOpeningActs' },
}
const editableFilterKeys = new Set(Object.keys(DIMENSION_EDITORS))
const activeFilterDimension = ref(null)
function onEditChip(key) {
  if (!DIMENSION_EDITORS[key]) return
  activeFilterDimension.value = key
  summaryDrawer.value = true
}
const activeFilterEditor = computed(() => {
  const key = activeFilterDimension.value
  const def = key && DIMENSION_EDITORS[key]
  if (!def) return null
  return {
    label: t(def.labelKey),
    items: store.getters['analyse/' + def.getter] || [],
    selected: filters.value?.[key] || [],
  }
})
const isPredictMode = computed(() => selectedToolbox.value === 'predict')
// Libellé « Nom — date » de l'évènement quand la sélection en contient EXACTEMENT
// un, chaîne vide sinon. Recherche dans `analysableEvents` (et non `events`) avec
// la même comparaison stricte d'id que le store (`new Set(selectedEventIds).has(e.id)`,
// appliqué lui aussi sur analysableEvents) : le titre ne peut donc pas nommer un
// évènement hors périmètre pendant que la page affiche des zéros. Date omise si
// absente/illisible (formatDateShort renvoie '' dans ce cas).
const singleSelectedEventLabel = computed(() => {
  const ids = filters.value.selectedEventIds || []
  if (ids.length !== 1) return ''
  const ev = (analysableEvents.value || []).find((e) => e.id === ids[0])
  const name = ev?.name || ev?.eventName || ''
  if (!name) return ''
  const date = formatDateShort(ev.date || ev.eventDate)
  return date ? `${name} — ${date}` : name
})
// Titre du bandeau selon l'outil actif (Analyse / Prédire / Préd. Événement).
const toolTitle = computed(() => {
  if (selectedToolbox.value === 'predict') return t('anToolPredict')
  if (selectedToolbox.value === 'event-predict') return t('anToolEventPredict')
  // Un seul évènement sélectionné : son nom remplace « Analyse » (le mot n'apporte
  // rien quand la page est déjà cadrée sur un évènement précis).
  if (singleSelectedEventLabel.value) return singleSelectedEventLabel.value
  return t('analyseTitle')
})
const predictionsGenerating = computed(() => store.state.analyse.predictionsGenerating)
const showPredictOverlay = computed(() => selectedToolbox.value === 'event-predict')
// Seule implémentation vivante (le getter store homonyme, jamais lu et avec une
// condition `>` stricte divergente, a été supprimé — bug #10 doc 02_ANALYSE).
// `>=` : un event ayant lieu AUJOURD'HUI compte comme futur (prédictible).
const futureEventsCount = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return (events.value || []).filter((e) => {
    const d = parseEventDateLocal(e.eventDate || e.date)
    return d && d.getTime() >= today.getTime()
  }).length
})
function onToolboxChange(v) {
  const current = store.state.analyse.selectedToolbox || 'analyse'
  if (v === current) return
  if (v === 'event-predict' && current !== 'event-predict') {
    previousToolbox.value = current
  }
  // Bascule synchrone : le différé rAF+setTimeout et l'overlay de transition
  // provoquaient un flicker (voile 2 s aveugle + frame vide entre les vues).
  // Le contenu Analyse reste monté (v-show) et Event Predict gère son propre
  // skeleton — aucun voile intermédiaire nécessaire.
  store.commit('analyse/SET_TOOLBOX', v)
  // Sync toolbox to URL query so the Predict mode has its own shareable URL
  // (`/spaces/<id>?toolbox=predict`). Browser back/forward navigates between
  // Analyse and Predict like real pages.
  try {
    const nextQuery = { ...route.query }
    if (v === 'analyse') {
      delete nextQuery.toolbox
    } else {
      nextQuery.toolbox = v
    }
    router.replace({ path: route.path, query: nextQuery })
  } catch (_) { /* router not ready */ }
}
function closePredictOverlay() {
  store.commit('analyse/SET_TOOLBOX', previousToolbox.value || 'analyse')
}
// Couleur d'accent par KPI (réutilise les hex de headerKpis / KPI_CARDS) →
// fond teinté de la zone graph inline.
const KIND_ACCENT = {
  revenue: '#10B981',
  'avg-revenue': '#F97316',
  cost: '#ff3131',
  transactions: '#3B82F6',
  'avg-trans': '#A855F7',
  attendees: '#0EA5E9',
  transformation: '#14B8A6',
  percap: '#EC4899',
  'transaction-rate': '#A855F7',
  margin: '#3B82F6',
}

function onOpenChart(kind) {
  // Carte TX/MIN (transaction-rate) → conserve l'ancien comportement : enrichit
  // les shops (txn/min) et toggle le panneau Shop Performance dédié.
  if (kind === 'transaction-rate') {
    const wasHidden = !showTransactionRateShops.value
    showTransactionRateShops.value = !showTransactionRateShops.value
    if (wasHidden) shopPerformance.enrich(filteredEvents.value)
    return
  }
  // Autres KPI (chips header + cartes) → graph by-event INLINE au-dessus d'Event
  // Revenue. Transformation (header) bascule aussi en inline (transferRate).
  const map = {
    cost: 'cost',
    revenue: 'revenue',
    'avg-revenue': 'revenue',
    margin: 'revenue',
    transactions: 'transactions',
    'avg-trans': 'avgTransaction',
    attendees: 'attendees',
    percap: 'perCap',
    transformation: 'transferRate',
    'transaction-rate': 'transferRate',
  }
  const metric = map[kind] || 'revenue'
  // Toggle : re-clic sur le KPI déjà affiché → ferme.
  if (inlineChartVisible.value && byEventMetric.value === metric) {
    inlineChartVisible.value = false
    return
  }
  byEventMetric.value = metric
  inlineChartAccent.value = KIND_ACCENT[kind] || '#64748b'
  inlineChartVisible.value = true
}

// Lot 1.1 — clic sur une barre du graphe CA par event
function onChartBarClick(eventId) {
  const ev = events.value.find((e) => e.id === eventId)
  if (!ev) return
  // Mode Predict → clic sur une barre ouvre Event Predict pour CET event.
  // BUG-349-01 : un event PASSÉ (ou en cours) est désormais rejeté côté
  // EventPredictView (fallback sur le prochain event futur + toast) — seul un
  // event futur est réellement ciblé. La version par défaut locale
  // (localStorage) est passée en query si présente. Cible : SpacePredictView →
  // EventPredictView.applyDeepLinkFromRoute.
  if (isPredictMode.value) {
    const spaceId = route.params?.spaceId || store.state.analyse?.space?.id
    if (!spaceId) {
      // Fallback : pas de spaceId résolu → on retombe sur l'overlay legacy.
      store.commit('analyse/SET_PENDING_PREDICT_EVENT_ID', ev.id)
      store.commit('analyse/SET_TOOLBOX', 'event-predict')
      return
    }
    let defaultVersionId = null
    try {
      const raw = localStorage.getItem(`analyse:event-predict-default-version:${ev.id}`)
      if (raw) defaultVersionId = JSON.parse(raw)?.defaultVersionId || null
    } catch (_) { /* noop */ }
    const query = { event: ev.id }
    if (defaultVersionId) query.version = defaultVersionId
    // Navigation de route réelle : RouteTransitionLoader (watcher $route) gère
    // l'overlay — le dispatch manuel doublonnait.
    router.push({ path: `/spaces/${spaceId}/predict`, query })
    return
  }
  // Sinon → on filtre la page sur cet event (les KPI, pies, tables suivent)
  // ET on bascule en mode timeline pour cet event en parallèle.
  setFilterImmediate('selectedEventIds', [ev.id])
  loadTimelineForEvents([ev])
}

// Lot 1.1 — clic sur une barre en mode mensuel/trimestriel/annuel → drilldown
function onPeriodDrilldown({ mode, key }) {
  if (!key) return
  let start = null
  let end = null
  if (mode === 'yearly') {
    const y = Number(key)
    if (!Number.isFinite(y)) return
    start = new Date(y, 0, 1)
    end = new Date(y, 11, 31, 23, 59, 59)
  } else if (mode === 'quarterly') {
    const m = /^(\d{4})-Q([1-4])$/.exec(key)
    if (!m) return
    const y = Number(m[1])
    const q = Number(m[2])
    const startMonth = (q - 1) * 3
    start = new Date(y, startMonth, 1)
    end = new Date(y, startMonth + 3, 0, 23, 59, 59)
  } else if (mode === 'monthly') {
    const m = /^(\d{4})-(\d{2})$/.exec(key)
    if (!m) return
    const y = Number(m[1])
    const mo = Number(m[2]) - 1
    start = new Date(y, mo, 1)
    end = new Date(y, mo + 1, 0, 23, 59, 59)
  }
  if (!start || !end) return
  setFilterImmediate('timeRange', 'custom')
  setFilterImmediate('startDate', start.toISOString())
  setFilterImmediate('endDate', end.toISOString())
}
function onAnalyzeQuery(/* q */) {
  // L'assistant local s'exécute désormais directement dans SummaryPanel.vue.
  // On garde le handler pour compatibilité avec l'événement émis (no-op).
}

function onShowAverage() {
  // Bascule directe en mode timeline : l'alignement des coups d'envoi est géré
  // par useAnalyseTimeline (parité EventPredict) — l'ancien dialog « choisir une
  // heure d'ouverture » (alignement par EXCLUSION) est supprimé.
  loadTimelineForEvents(filteredEvents.value)
}

// ---------- Timeline header label & close ----------------------------------
// (délégués à useAnalyseTimeline : timelineHeaderLabel, onCloseTimeline, onTimelineRangeChange)

// ---- Copier / Partager (screenshot) --------------------------------------
// (délégué à useAnalyseCapture : copying, sharing, snackbar, snackbarText, snackbarColor, onCopy, onShare)

// ── Mode flux « Live » (docs/modules/11_LIVE.md, greffe D) ──────────────────
// Sur la route dédiée `space-live`, on rafraîchit périodiquement TOUTES les
// sources KPI, pas seulement la timeline :
//  - `event-timeline` (loadTimelineForEvents) ET `useAnalyseItemRecords`
//    (Revenue/Per Cap/Margin/Avg-Tx en dépendent, cf. kpiRecords) sont repollés
//    avec `bypassCache: true` : le cache session de `getSpaceEventTimelineBatch`
//    (`space.api.js`) suppose un event IMMUABLE (vrai une fois l'event terminé,
//    faux pendant un live) — sans ce bypass, tout poll après le 1er est servi
//    depuis ce cache mémoire et n'atteint jamais le réseau.
//  - `loadSpace` (shop-details/shopGranularData → Shop Performance, Event
//    Revenue by Shop, Shop distribution, et `menuItemCostMap` utilisé pour le
//    calcul de marge) : alignée sur le même intervalle que le reste (15s,
//    2026-07-29) — un `menuItemCostMap` rafraîchi seulement toutes les 45s
//    pendant que le CA l'était toutes les 15s faisait dériver la marge affichée
//    jusqu'à 30s derrière le CA. Le bug historique qui remettait
//    `selectedConfigurationId` à null est corrigé (bug 225,
//    `resolveConfigSelectionAfterLoad`, store/modules/analyse.js), donc ce
//    re-dispatch plus fréquent est sûr.
// keepAlive (route space-live) → on démarre/arrête via onActivated/onDeactivated.
const isLive = computed(() => route.name === 'space-live')
// Relais vers le store (module Live, docs/modules/11_LIVE.md) : `optionsBaseRecords`
// (Types de PDV/Zones/Points de vente) a besoin de savoir qu'on est en Live pour se
// scoper au seul event live plutôt qu'à tout l'historique analysable de l'espace.
// `watch` (pas juste un commit au montage) : suit route.name en continu, y compris
// sous keepAlive où le composant ne démonte jamais entre Live et Analyse classique.
watch(isLive, (v) => store.commit('analyse/SET_LIVE_ROUTE', v), { immediate: true })
// Onglet actif du mode Live (module Live v2) : 'analyse' (défaut) | 'inventory'.
const liveTab = ref('analyse')
// Passe à true dès qu'applyLiveScope() a réellement modifié les filtres (donc
// uniquement pour une instance jamais utilisée en Live, ex. l'Analyse classique, pas
// de resetFilters() au démontage). Sans ce garde-fou, chaque démontage d'AnalyseView
// (y compris une simple Analyse qui n'a jamais vu /live) déclenchait un reset
// réactif inutile, travail superflu pile au moment du teardown, cf. onDeactivated/
// onBeforeUnmount ci-dessous.
const liveScopeApplied = ref(false)
const showInventory = computed(() => isLive.value && liveTab.value === 'inventory')
// Event live courant, dérivé du scope déjà posé par applyLiveScope() (pas de
// nouvel appel réseau) — passé à LiveInventoryPanel pour l'init de stock
// depuis l'Inventaire pré-événement (docs/modules/11_LIVE.md §15).
const liveEventId = computed(() => (isLive.value ? (filters.value.selectedEventIds || [])[0] || '' : ''))
const liveEventName = computed(() => {
  if (!liveEventId.value) return ''
  const ev = (store.state.analyse.events || []).find((e) => e.id === liveEventId.value)
  return ev?.name || ev?.eventName || ''
})
// Objet event complet (module Live, 2026-08-05) — pour le drawer d'édition
// (EventFormDrawer::initialEvent). Même liste que liveEventName ci-dessus.
const liveEventObject = computed(() => (store.state.analyse.events || []).find((e) => e.id === liveEventId.value) || null)
const liveEventEditOpen = ref(false)
// Détection RÉELLE d'un event live (posée par applyLiveScope() depuis
// /live-status), distincte de `isLive` (route seule). Corrigé 2026-08-05
// (BUG-305-02) : le badge ● LIVE et le bouton d'édition ne doivent s'afficher
// que si un event est VRAIMENT dans la fenêtre live, pas juste parce qu'on est
// sur la route /live.
const liveEventDetected = ref(false)
const LIVE_POLL_MS = 15000
let livePollTimer = null
async function livePoll() {
  // Re-résout l'event live à CHAQUE tick, sans ça un scope figé au premier appel
  // (ex. page ouverte avant la 1re vente, ou avant qu'un Event existe) ne se
  // corrige jamais tout seul : la timeline/KPI continuent de tourner sur l'ancien
  // scope pendant que de vraies transactions arrivent (cause racine confirmée
  // 2026-08-03, auparavant applyLiveScope() ne tournait qu'au mount/activate).
  await applyLiveScope()
  if (isTimelineActive.value) loadTimelineForEvents(filteredEvents.value, { bypassCache: true })
  refreshItemRecords()
  // Les paniers ont leur PROPRE cache session (`_basketCache`, space.api.js) avec
  // la même hypothèse d'immuabilité : sans ce bypass, le donut « catégories par
  // transaction » resterait figé pendant que tout le reste de la page tique.
  refreshBaskets()
  liveShopDetailsPoll()
}
// Module Live (docs/modules/11_LIVE.md §14) : snapshot dédié qui ne rafraîchit
// QUE les ventes (shopGranularData/menuItemCostMap/summary), pas tout le
// catalogue de l'espace — `loadSpace`/`fetchSpaceData` reste le chemin du
// premier chargement (mount), pas des ticks live suivants.
function liveShopDetailsPoll() {
  const spaceId = route.params.spaceId
  if (spaceId) store.dispatch('analyse/refreshLiveShopSnapshot', { spaceId })
}
function startLivePolling() {
  stopLivePolling()
  if (!isLive.value) return
  livePollTimer = setInterval(livePoll, LIVE_POLL_MS)
}
function stopLivePolling() {
  if (livePollTimer) { clearInterval(livePollTimer); livePollTimer = null }
}
onActivated(() => {
  startLivePolling()
  // Le composant reste en mémoire (keepAlive) : revenir sur /live après être
  // passé par un autre outil ne redéclenche pas onMounted, on resynchronise
  // quand même sur l'event réellement live à chaque retour sur l'écran.
  // resetFilters() AVANT applyLiveScope() : neutralise tout filtre secondaire
  // laissé par une session Analyse précédente (catégorie, recherche, plages de
  // tickets...) qui pourrait sinon exclure silencieusement l'event live de
  // filteredEvents malgré selectedEventIds, applyLiveScope() écrase ensuite les 3
  // clés essentielles (config/timeRange/selectedEventIds) par-dessus ce reset.
  if (isLive.value) resetFilters()
  applyLiveScope()
})
// Redondant à dessein (comme pour stopLivePolling) : selon que /live vers /analyse
// bascule une route keepAlive vers keepAlive (onDeactivated) ou détruit le wrapper
// <keep-alive> lui-même (onBeforeUnmount, cf. DashboardView.vue), un seul des
// deux hooks se déclenche réellement, jamais les deux, jamais aucun.
// resetFilters() gardé par liveScopeApplied : sur une instance qui n'a jamais
// scopé sur Live (Analyse classique), ce reset ne servirait à rien, évite le
// recalcul réactif superflu pile au moment du démontage.
function resetLiveFiltersIfNeeded() {
  stopLivePolling()
  if (liveScopeApplied.value) {
    resetFilters()
    liveScopeApplied.value = false
  }
  // Sinon `liveEventDetected` garderait sa dernière valeur (badge/bouton
  // édition qui persisteraient hors de la route Live).
  liveEventDetected.value = false
}
onDeactivated(resetLiveFiltersIfNeeded)
// BUG-364-01 — purge des caches composables au VRAI démontage (pas onDeactivated :
// la route Live keepAlive doit garder ses données). Jusqu'ici la purge n'existait
// qu'au changement d'espace (watcher route plus bas) : quitter l'Analyse pour un
// autre module laissait ~164 Mo de records préprocessés en mémoire pour rien.
// Le cache session module-level de space.api.js (LRU 30, borné) n'est PAS touché —
// revenir sur la page reste instantané pour les events encore dans le LRU.
onBeforeUnmount(() => {
  resetLiveFiltersIfNeeded()
  clearItemRecordsCache()
  clearComparisonCache()
  clearBasketsCache()
  clearUnmappedCache()
  shopPerformance.reset()
})

onMounted(() => {
  ensureAuthAndLoad(route.params.spaceId)
  startLivePolling()
  // Saisons (Rapport Saison) : alimente les presets `season:<id>` des pickers
  // de dates. Cache 15 min côté store, échec non bloquant (picker inchangé).
  store.dispatch('seasons/fetchAll').catch(() => {})
  // Deep-link : ?toolbox=predict|analyse|event-predict sync l'état toolbox.
  // L'URL est la SOURCE DE VÉRITÉ au montage : sans ?toolbox=, on force le
  // retour à 'analyse'. Sans ce reset, un selectedToolbox résiduel du store
  // ('event-predict' d'une visite précédente) rouvrait l'overlay EventPredict
  // en cliquant un space depuis l'accueil, qui réécrivait ensuite ?event=
  // dans l'URL (bug « redirigé vers EventPredict », 2026-07-06).
  const tb = String(route.query?.toolbox || '').toLowerCase()
  if (tb === 'predict' || tb === 'event-predict') {
    if (store.state.analyse.selectedToolbox !== tb) {
      store.commit('analyse/SET_TOOLBOX', tb)
    }
  } else if (store.state.analyse.selectedToolbox !== 'analyse') {
    store.commit('analyse/SET_TOOLBOX', 'analyse')
  }
})

watch(
  () => route.params.spaceId,
  (id, prevId) => {
    if (!id) return
    // BUG-285 : changement d'espace SANS remontage de la vue (key = route.name) —
    // les caches par eventId des composables gardaient les lignes de l'ancien
    // espace, dont les ids ne seront plus jamais redemandés. On purge.
    if (prevId && prevId !== id) {
      clearItemRecordsCache()
      clearComparisonCache()
      clearBasketsCache()
      clearUnmappedCache()
      // BUG-300-01 — reset immédiat du latch du différé « All Configurations »
      // (le watcher `loading` le remet aussi à false, mais plus tard) : la
      // cause racine du « Par zone » vide était la garde « déjà chargé » de
      // requestDeferredAllConfigsContext, qui voyait le contexte de l'ANCIEN
      // espace — purgé désormais par CLEAR_SPACE_KEYED_CACHES (store).
      allConfigsCtxRequested = false
      // BUG-359-01 — le détail timeline ouvert appartient à l'ancien espace
      // (instance survivante = route keepAlive, key = route.name) : on le ferme
      // avant de charger le nouveau, sinon il reste affiché avec le match de
      // l'espace précédent.
      if (isTimelineActive.value) closeTimeline()
    }
    ensureAuthAndLoad(id)
  }
)

// La vue n'est plus remontée sur un changement de query (DashboardView key =
// route.path) : le back/forward navigateur entre `?toolbox=` doit donc être
// rejoué ici. Les bascules via l'UI passent déjà par onToolboxSelect (commit
// direct) → ce watcher est un no-op dans ce cas (état déjà à jour).
watch(
  () => route.query?.toolbox,
  (tb) => {
    const v = String(tb || 'analyse').toLowerCase()
    const valid = v === 'predict' || v === 'event-predict' || v === 'analyse'
    if (!valid) return
    if (store.state.analyse.selectedToolbox !== v) {
      store.commit('analyse/SET_TOOLBOX', v)
    }
  }
)

// Auto-déclenchement de la génération de records prédictifs en mode predict
// (cf. React §8.1) — purge à la sortie du mode pour ne pas polluer le mode analyse.
watch(
  [() => store.state.analyse.selectedToolbox, () => store.state.analyse.events.length, () => store.state.analyse.shopGranularData.length],
  ([tb, evCount, recCount], [prevTb] = []) => {
    if (tb === 'predict' && evCount > 0 && recCount > 0) {
      // Source de vérité = MOTEUR. On régénère tant qu'il n'existe pas de
      // records prédictifs `_engine` : en démo, ça remplace les prédictions
      // pré-calibrées du mock par celles du moteur (cohérence avec event-predict)
      // et applique l'overlay des versions actives/par défaut (→ CA ajusté). Le
      // tag `_engine` empêche la boucle de re-déclenchement du watch.
      const hasEnginePredictive = store.state.analyse.shopGranularData.some(
        (r) => r.isPredictive && r._engine,
      )
      if (!hasEnginePredictive) store.dispatch('analyse/regeneratePredictions')
    } else if (prevTb === 'predict' && tb !== 'predict' && tb !== 'event-predict') {
      store.dispatch('analyse/clearPredictions')
    }
  },
  { immediate: true }
)

async function ensureAuthAndLoad(spaceId) {
  const requestId = ++analyseLoadRequestId
  initialLoadPending.value = true
  // Capté AVANT loadSpace : loadSpace remet selectedConfigurationId à null, ce qui
  // déclenche le watcher qui efface `?config` de l'URL → on perdrait le deep-link.
  const urlConfig = String(route.query?.config || '')
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (token) setAccessToken(token)
  } catch (e) {
    console.warn('[AnalyseView] Unable to fetch Supabase session:', e?.message)
  }
  try {
    await store.dispatch('analyse/loadSpace', { spaceId, isLive: isLive.value })
    // Prefetch market prices (catalogue global tenant, partagé Inventory/Logistic/
    // Restock) HORS chemin critique : la query coûte ~60s à froid. Le charger dès
    // l'entrée dans l'espace chauffe le cache (SWR) avant l'ouverture d'Inventory.
    // Fire-and-forget : ne bloque pas le rendu Analyse ; no-op si déjà en cache.
    store.dispatch('inventory/loadMarketPrices')
    // Restaure la configuration depuis l'URL (`?config=<id>`) si elle est valide.
    // Permet le partage / rechargement d'un lien pointant une configuration précise.
    if (urlConfig && urlConfig !== 'cfg-all') {
      const exists = (store.state.analyse.configurations || []).some((c) => c.id === urlConfig)
      if (exists && store.state.analyse.filters.selectedConfigurationId !== urlConfig) {
        store.dispatch('analyse/updateFilter', { key: 'selectedConfigurationId', value: urlConfig })
      }
    }
    // Même garde-fou qu'onActivated : neutralise les filtres secondaires résiduels
    // d'une session Analyse avant de (re)scoper sur l'event live.
    if (isLive.value) resetFilters()
    await applyLiveScope()
  } finally {
    // Navigation rapide entre spaces : ancienne requête ne doit pas masquer
    // skeleton de nouvelle requête encore active.
    if (requestId === analyseLoadRequestId) initialLoadPending.value = false
  }
}

// Module Live : sans ça, /live hérite tel quel du dernier filtre actif sur Analyse
// classique (même state.filters partagé) — un `timeRange:'all'` résiduel affiche
// tout l'historique de l'espace au lieu du seul event en cours. Scope explicitement
// sur l'event live (selectedEventIds + configuration remise à "Toutes" pour ne pas
// l'exclure silencieusement, cf. filteredEvents) ; à défaut, repli sur "Aujourd'hui"
// plutôt que "Tout l'historique". Best-effort (comme SpaceItem.vue checkLiveStatus) :
// n'empêche jamais l'affichage si l'appel échoue.
async function applyLiveScope() {
  if (!isLive.value) return
  const spaceId = route.params.spaceId
  if (!spaceId) return
  liveScopeApplied.value = true
  try {
    const res = await getSpaceLiveStatus(spaceId)
    // `liveEventDetected` (badge ● LIVE, pulse) reste STRICT : vente réelle dans
    // les 30 dernières minutes (getLiveStatus). Mais titre/bouton d'édition ne
    // doivent pas disparaître à la moindre pause de ventes (>30 min sans vente =
    // event toujours en cours, juste un creux) — trouvé le 2026-08-05 (retour
    // utilisateur : "pourquoi Analyse alors que je suis sur Live", bouton
    // d'édition introuvable). Repli : un event dont la fenêtre couvre AUJOURD'HUI
    // pour cet espace (`findTodayEventId`, sur `state.events` déjà à jour, aucun
    // appel réseau de plus) sert d'ancre stable pour le reste de l'écran.
    liveEventDetected.value = !!(res?.isLive && res?.eventId)
    const anchorEventId = res?.eventId || findTodayEventId()
    if (anchorEventId) {
      setFilterImmediate('selectedConfigurationId', null)
      setFilterImmediate('timeRange', 'all')
      setFilterImmediate('selectedEventIds', [anchorEventId])
    } else {
      setFilterImmediate('selectedEventIds', [])
      setFilterImmediate('timeRange', 'today')
    }
  } catch (e) {
    liveEventDetected.value = false
    console.warn('[AnalyseView] applyLiveScope KO —', e?.message)
  }
}

/**
 * Event de CET espace dont la fenêtre [eventStartDate, eventEndDate] (repli sur
 * `date`/`eventDate` seul si pas de bornes) couvre AUJOURD'HUI — repli de
 * `applyLiveScope()` quand aucune vente n'est tombée dans les 30 dernières
 * minutes mais qu'un event est bien "celui du jour". `state.events` est déjà
 * tenu à jour par le poll live (BUG-302-02) : lecture pure, pas de fetch.
 */
function findTodayEventId() {
  const events = store.state.analyse.events || []
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const todayEnd = new Date(today); todayEnd.setHours(23, 59, 59, 999)
  for (const e of events) {
    const start = parseEventDateLocal(e.eventStartDate || e.date || e.eventDate)
    if (!start) continue
    const end = parseEventDateLocal(e.eventEndDate || e.date || e.eventDate) || start
    if (start <= todayEnd && end >= today) return e.id
  }
  return null
}
</script>

<style scoped lang="scss">
/* Graph KPI inline : fond teinté par la couleur du KPI cliqué (--kpi-color). */
.an-inline-kpi-chart {
  background: color-mix(in srgb, var(--kpi-color, #64748b) 8%, transparent);
  border-top: 3px solid var(--kpi-color, #64748b);

  /* Le GenericByEventChart interne est une v-card blanche → transparente pour
     laisser voir la teinte du KPI. */
  :deep(.v-card) {
    background: transparent !important;
    box-shadow: none !important;
    margin-bottom: 0 !important;
  }
}

/* Bandeau de section : carte rouge arrondie détachée (marge tout autour). */
// ── Grille 3 colonnes (pattern EventPredict .ep-body) ──────────────────────
.an-body {
  position: relative;
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr) 340px;
  gap: 18px;
  padding: 18px 24px 24px;
  // Scroll INDÉPENDANT par colonne (modèle Event Predict) : le body borne la
  // hauteur, chaque colonne gère son propre overflow. Header = 64px.
  height: calc(100vh - 64px);
  overflow: hidden;
  min-height: 0;
}
.an-body > :deep(.analyse-filter-panel),
.an-main,
.an-body > .an-right {
  width: auto;
  min-width: 0;
  min-height: 0;
  max-height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}
/* Colonne droite : éditeur de filtre (optionnel) au-dessus du leaderboard. */
.an-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
// Repli gauche : track à 0, le centre s'élargit (toggle du bandeau rouge).
.an-body.an-side-collapsed {
  grid-template-columns: 0 minmax(0, 1fr) 340px;
}
.an-body.an-side-collapsed > :deep(.analyse-filter-panel) {
  opacity: 0;
  overflow: hidden;
  padding: 0;
  pointer-events: none;
}
// Repli droit (summaryDrawer) : symétrique.
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

/* Bloc sticky : bandeau rouge + tags neutres épinglés ensemble au scroll. */
.av-sticky {
  position: sticky;
  top: 0;
  z-index: 20;
  margin-bottom: 18px;
  background: #f6f8fb; /* couvre le contenu qui scrolle dessous */
}
.av-header {
  border-radius: 18px;
  background: #ff3131;
  box-shadow: 0 8px 24px rgba(255, 49, 49, 0.28);
}
/* Indicateur « Non mappées » (BUG-356-01 v2/v3) : triangle warning ambre sur le
   bandeau rouge — les autres icônes y sont blanches, celle-ci doit se lire comme
   un avertissement. */
.av-unmapped-warn .v-icon {
  color: #ffd54f;
}

.av-unmapped-tip__action {
  margin-top: 4px;
  font-weight: 600;
  opacity: 0.85;
}

/* Badge Live (module Live) : pastille claire + point pulsant sur le bandeau rouge. */
.av-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 11px;
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.22);
  color: #fff;
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  flex-shrink: 0;
}
.av-live-badge__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.6);
  animation: av-live-pulse 1.4s infinite;
}
@keyframes av-live-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0.6); }
  70%  { box-shadow: 0 0 0 7px rgba(255, 255, 255, 0); }
  100% { box-shadow: 0 0 0 0 rgba(255, 255, 255, 0); }
}
/* Onglets Live (Analyse / Inventaire) — segmented control. */
.an-live-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  margin: 2px 0 14px;
  border-radius: 100px;
  background: #f3f4f6;
}
.an-live-tab {
  padding: 6px 18px;
  border: none;
  background: transparent;
  border-radius: 100px;
  font-size: 0.85rem;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.an-live-tab--active { background: #ff3131; color: #fff; }
.analyse-app--dark .an-live-tabs { background: #0f172a; }
.analyse-app--dark .an-live-tab { color: #94a3b8; }
.analyse-app--dark .an-live-tab--active { background: #ff3131; color: #fff; }
/* Ligne 1 : toggle + « Espace : Analyse » + copier/partager. */
.av-header__row1 {
  padding: 14px 22px 8px;
}
.av-header__title {
  font-size: var(--fs-xl);
  font-weight: var(--fw-bold);
  color: #fff;
  margin: 0;
  line-height: 1.2;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* Mobile uniquement : ☰ ouvrant le drawer d'outils (pattern Logistic). Masqué en
   desktop, activé au palier téléphone plus bas. */
.av-mobile-tools-trigger,
.av-mobile-filter-trigger,
.av-mobile-more-trigger {
  display: none;
  width: 40px;
  height: 40px;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.2);
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  color: #fff;
}
.av-mobile-tools-trigger:active,
.av-mobile-filter-trigger:active,
.av-mobile-more-trigger:active { transform: scale(0.94); }
/* Backdrop de l'overlay filtres (mobile only) — masqué en desktop. */
.an-mobile-filter-backdrop { display: none; }

/* Palier téléphone (≤600px, convention parapluie) : bascule header desktop → mobile. */
@media (max-width: 600px) {
  .av-header__toggle--desktop { display: none; }
  .av-header__actions--desktop { display: none !important; } /* bat le d-flex Vuetify */
  .av-mobile-tools-trigger,
  .av-mobile-filter-trigger,
  .av-mobile-more-trigger { display: flex; }

  /* Panneau de filtres : overlay coulissant depuis la gauche (au lieu de monopoliser le
     haut de l'écran). Piloté par `drawer` (an-side-collapsed = fermé) ; ouvert par le bouton
     entonnoir. Fermé au clic sur le backdrop. */
  .an-body > :deep(.analyse-filter-panel) {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 86%;
    max-width: 330px;
    margin: 0;
    border-radius: 0;
    z-index: 3000;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    box-shadow: 4px 0 24px rgba(0, 0, 0, 0.18);
    overflow-y: auto;
    opacity: 1 !important;
    pointer-events: auto !important;
  }
  .an-body:not(.an-side-collapsed) > :deep(.analyse-filter-panel) {
    transform: translateX(0);
  }
  /* Sélecteur « OUTILS » du panneau masqué : redondant avec le ☰ (drawer d'outils). */
  .an-body > :deep(.analyse-filter-panel .fp-toolbox) { display: none; }

  .an-mobile-filter-backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 2999;
    background: rgba(0, 0, 0, 0.4);
  }

  /* Téléphone : on abandonne le scroll indépendant par colonne (modèle desktop 3 colonnes).
     .main-content devient LE conteneur scrollé (au lieu de overflow:hidden) → tout flue dans
     un seul scroll, le résumé (« Analyse des données / Performance des PDV ») se place à la
     FIN, et le bandeau rouge sticky (av-sticky, top:0) se fige juste sous l'app-bar (64px). */
  .main-content {
    overflow-y: auto;
    overflow-x: hidden; /* évite une barre horizontale due au full-bleed du bandeau */
    -webkit-overflow-scrolling: touch;
  }
  .an-body {
    height: auto;
    overflow: visible;
    /* Padding réduit sur téléphone ; le bandeau rouge en ressort en pleine largeur. */
    padding: 12px 12px 24px;
    /* VRAIE 1 colonne : `!important` bat la règle de base 3-classes
       `.an-body.an-side-collapsed.an-summary-collapsed { grid-template-columns: 0 1fr 0 }`.
       Sans ça, le panneau filtres en position:fixed (hors flux) décalait an-main dans la
       piste à 0 (bandeau/KPI écrasés à gauche) et le résumé prenait tout le 1fr. */
    grid-template-columns: 1fr !important;
  }
  .an-main,
  .an-body > .an-right {
    max-height: none;
    overflow: visible;
  }
  /* Bandeau rouge PLEINE LARGEUR (référence Inventaire post .si-segrow--band) : plein cadre
     bord à bord, coins carrés, sans l'ombre de carte flottante. Full-bleed = on annule le
     padding haut/latéral de .an-body via des marges négatives. */
  .av-sticky {
    margin: -12px -12px 12px;
  }
  .av-header {
    border-radius: 0;
    box-shadow: none;
  }
}
/* Ligne 2 : période + comparaison, posées SUR le rouge (blanc translucide). */
.av-header__row2 {
  padding: 0 22px 14px;
}
.av-header__row2 :deep(.fs-period .v-field) {
  background: rgba(255, 255, 255, 0.14);
  border-radius: 999px;
}
.av-header__row2 :deep(.fs-period .v-field__outline) { display: none; }
.av-header__row2 :deep(.fs-period .v-field__input),
.av-header__row2 :deep(.fs-period .v-select__selection-text),
.av-header__row2 :deep(.fs-period .v-field .v-icon) {
  color: #ffffff !important;
}
.av-header__row2 :deep(.fs-compare-label) { color: rgba(255, 255, 255, 0.9) !important; }
.av-header__row2 :deep(.compare-toggle) {
  background-color: rgba(255, 255, 255, 0.14) !important;
}
.av-header__row2 :deep(.compare-pill) { color: #ffffff !important; }
.av-header__row2 :deep(.compare-pill--active) {
  background-color: rgba(255, 255, 255, 0.92) !important;
  color: #ff3131 !important;
}
.av-header__row2 :deep(.compare-pill:hover) {
  background-color: rgba(255, 255, 255, 0.24) !important;
}
/* Copier / partager (ligne 1) — ronds blancs sur le rouge. */
.av-header__row1 :deep(.fs-icon-btn) {
  width: 34px !important;
  height: 34px !important;
  border: 1.5px solid rgba(255, 255, 255, 0.62) !important;
  border-radius: 100px !important;
  background: rgba(255, 255, 255, 0.1) !important;
  color: #ffffff !important;
}
.av-header__row1 :deep(.fs-icon-btn:hover) {
  background: rgba(255, 255, 255, 0.2) !important;
}

/* ── Tags des filtres actifs : fond NEUTRE, sous le bandeau rouge. ────────── */
.av-tags {
  padding: 12px 6px 0;
}
.av-tags .chip-events,
.av-tags .chip-events :deep(.v-chip__content) {
  background-color: #f1f3f5 !important;
  color: #1e293b !important;
  border-radius: 999px !important;
  font-weight: 500;
}
.av-tags .chip-filter,
.av-tags .chip-filter :deep(.v-chip__content) {
  background-color: #ede9fe !important;
  color: #5b21b6 !important;
  border-radius: 999px !important;
  font-weight: 500;
}
.av-tags .chip-filter :deep(.v-icon) { color: #6d28d9 !important; }
.av-tags .chip-filter--editable { cursor: pointer; }
.av-tags .chip-filter--editable:hover { filter: brightness(0.96); }
.av-tags__trash :deep(.v-icon) { color: #ff3131 !important; }

.analyse-app {
  background-color: #f6f8fb; /* fond unifié EP */
  // Empêche le scroll global : chaque colonne (filtres, contenu, résumé)
  // gère son propre overflow vertical pour une expérience type dashboard.
  height: 100vh;
  overflow: hidden;
}

.demo-fab-wrap {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 9999;
}
.demo-fab {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18) !important;
}
.ep-timeline-wrap {
  position: relative;
}
.ep-timeline-loader-overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 24px;
  border-radius: 8px;
  z-index: 5;
}
.main-content {
  background-color: #f6f8fb; /* fond unifié EP */
  height: 100vh;
  /* Plus de scroll page global : chaque colonne de .an-body scrolle seule. */
  overflow: hidden;
  /* Offset sous l'app-bar géré par Vuetify (76px) — les anciens hacks
     padding-top:0 / --v-layout-top:2px (header 104px) coupaient le haut
     du bandeau et des colonnes. */
}
// Le conteneur scrollé démarre sous l'app-bar avec height 100vh → son bas
// dépasse le viewport et la DERNIÈRE carte (« Menu items by POS ») était coupée.
// Espace de respiration en bas → la dernière carte remonte au-dessus de la zone
// clippée et reste entièrement scrollable.
:deep(#analyse-capture-root) {
  padding-bottom: 140px !important;
}
// Ex-hacks v-navigation-drawer supprimés : FilterPanel / SummaryPanel sont
// désormais des colonnes de la grille .an-body (scroll = page entière).

// Skeleton des graphiques pendant la phase 2 : carte blanche + image haute
// pour mimer la taille réelle des charts (shimmer Vuetify déjà animé).
.an-chart-skeleton {
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: #fff;
  overflow: hidden;
  :deep(.v-skeleton-loader__image) {
    height: 280px;
  }
}

/* ═══════════════════════════ DARK MODE ═══════════════════════════════════════
   Toutes les règles sont scopées sous `.analyse-app--dark` → le mode clair n'est
   JAMAIS modifié. On n'override QUE nos couleurs claires codées en dur : le rouge
   de marque (#ff3131) et les v-card/v-btn/... Vuetify (thème global déjà sombre)
   restent intacts. Le bandeau rouge (.av-header) et ses éléments blancs internes
   sont conservés tels quels (contraste correct sur le rouge). */
.analyse-app--dark {
  /* Fonds de page (ex-#f6f8fb) → fond sombre unifié. */
  background-color: #0f172a;

  .main-content {
    background-color: #0f172a;
  }

  /* Bloc sticky : couvre le contenu qui scrolle dessous → même fond sombre. */
  .av-sticky {
    background: #0f172a;
  }

  /* Tags des filtres actifs (fond neutre sous le bandeau rouge). */
  .av-tags .chip-events,
  .av-tags .chip-events :deep(.v-chip__content) {
    background-color: rgba(255, 255, 255, 0.08) !important;
    color: #e2e8f0 !important;
  }
  /* Chips filtre : identité VIOLETTE conservée, éclaircie pour le fond sombre. */
  .av-tags .chip-filter,
  .av-tags .chip-filter :deep(.v-chip__content) {
    background-color: rgba(124, 77, 255, 0.20) !important;
    color: #c4b5fd !important;
  }
  .av-tags .chip-filter :deep(.v-icon) {
    color: #c4b5fd !important;
  }
  /* .av-tags__trash conserve le rouge de marque #ff3131 (déjà lisible). */

  /* Overlay loader de la timeline : voile SOMBRE au lieu du blanc translucide. */
  .ep-timeline-loader-overlay {
    background: rgba(17, 24, 39, 0.72);
  }

  /* Skeleton des graphes : carte sombre + bordure discrète (ex-#fff / #e2e8f0). */
  .an-chart-skeleton {
    border-color: rgba(255, 255, 255, 0.10);
    background: #1e293b;
  }
}

</style>
