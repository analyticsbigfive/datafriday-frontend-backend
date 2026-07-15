<template>
  <Teleport to="body">
    <div class="event-predict-overlay">
      <!-- Header calqué sur WorkspaceAppHeader (Restock / Space Inventory) SANS
           la bande KPI : logo + flèche menu + accueil + sélecteur d'espace à
           gauche, cluster notifications / réglages / profil à droite.
           Overlay téléporté → on reste sur un <div> (pas de <v-app-bar>) et on
           réplique les classes wsh-* pour un rendu identique. -->
      <div class="ep-header">
        <!-- Logo DataFriday retiré : porté par le rail Dashboard permanent à
             gauche. On garde le chevron pour déployer/replier ce rail. -->

        <v-btn
          icon
          variant="text"
          size="small"
          class="ep-nav-trigger"
          :aria-label="t('epNavToggle')"
          :title="t('epNavToggle')"
          @click="openMainNavigation"
        >
          <ChevronLeft v-if="navExpanded" class="w-5 h-5" />
          <ChevronRight v-else class="w-5 h-5" />
        </v-btn>
        <!-- Accueil AVANT le sélecteur d'espace (ordre standard des headers). -->
        <v-btn
          icon
          variant="text"
          size="small"
          class="ml-1"
          aria-label="Accueil"
          title="Accueil"
          @click="$router.push({ name: 'spaces' })"
        >
          <v-icon size="20">mdi-home</v-icon>
        </v-btn>
        <!-- Sélecteur d'espace (dropdown), identique à Restock / Inventory. -->
        <WorkspaceSpaceSwitcher :space-name="space?.name || ''" />

      <div class="ep-header-actions">
        <!-- Cluster droit standard : notifications + réglages + profil. -->
        <NotificationBell :aria-label="t('epNotifications')" />
        <v-btn
          icon
          variant="text"
          size="small"
          :aria-label="t('epSettings')"
          @click="openHeaderSettings"
        >
          <Settings :size="20" />
        </v-btn>
        <!-- Menu profil PARTAGÉ : identique aux autres pages (Profil + déco). -->
        <WorkspaceUserMenu compact />
      </div>
    </div>

    <!-- UX honnête : les datasets lourds (granular REST, mappings Edge) chargent
         en arrière-plan après le premier rendu — on le DIT au lieu de rester muet. -->
    <div v-if="!loading && heavyLoading" class="ep-heavy-loading text-caption">
      <v-progress-circular indeterminate size="12" width="2" class="mr-1" />
      {{ t('epDetailedDataLoading') }}
    </div>


    <!-- Loading -->
    <div v-if="loading" class="ep-loading ep-loading-skeleton" :aria-label="t('epPredictiveDataLoadingAria')">
      <aside class="ep-skeleton-side">
        <span class="ep-skeleton-line ep-skeleton-line-title" />
        <span v-for="n in 5" :key="`event-${n}`" class="ep-skeleton-event" />
      </aside>
      <main class="ep-skeleton-main">
        <section class="ep-skeleton-panel ep-skeleton-chart" />
        <section class="ep-skeleton-panel">
          <span class="ep-skeleton-line ep-skeleton-line-title" />
          <span v-for="n in 4" :key="`row-${n}`" class="ep-skeleton-row" />
        </section>
      </main>
      <aside class="ep-skeleton-metrics">
        <span v-for="n in 4" :key="`metric-${n}`" class="ep-skeleton-metric" />
      </aside>
    </div>

    <div v-else class="ep-body" :class="{ 'ep-side-collapsed': sideCollapsed }">
      <!-- LEFT: Event selector -->
      <div class="ep-side">
        <!-- Sous-menu outils (Analyse / Predict / Event Predict / Inventaire /
             Réarmement) : dropdown au-dessus du calendrier (remplace l'ancienne
             rangée de boutons horizontale). -->
        <WorkspaceToolSelect
          model-value="event-predict"
          :items="visibleToolboxItems"
          :label="t('epTools')"
          :aria-label="t('epToolsNavigation')"
          class="ep-toolbox-select"
          @update:model-value="onToolboxSelect"
        />
        <Card class="ep-event-selector-card">
          <CardHeader class="ep-event-selector-header">
            <p class="ep-event-selector-subtitle">
              {{ futureEventOptions.length }}
              {{ futureEventOptions.length > 1 ? t('epUpcomingEventPlural') : t('epUpcomingEventSingular') }}
            </p>
          </CardHeader>
          <CardContent>
            <div v-if="events.length === 0" class="text-sm text-muted-foreground">
              {{ t('epNoEventAvailable') }}
            </div>

            <!-- Calendrier des évènements à venir (toujours affiché, compact).
                 Le libellé "June 2026" (en-tête des contrôles) sert de sélecteur
                 unique mois + année. Dates sélectionnables marquées en rouge.
                 (Le détail des évènements PASSÉS utilisés + leur CA reste visible
                 dans la liste « sources » plus bas.) -->
            <div v-else-if="futureDateValues.length" class="ep-calendar-wrap">
              <v-date-picker
                :model-value="selectedDate"
                :allowed-dates="isFutureEventDate"
                :min="today"
                hide-header
                show-adjacent-months
                control-variant="modal"
                color="primary"
                class="ep-date-picker"
                :aria-label="t('epChooseUpcomingEventDate')"
                @update:model-value="onCalendarChange"
              >
                <template #controls="{ monthYearText, prevMonth, nextMonth, disabled }">
                  <div class="ep-calendar-controls">
                    <button
                      type="button"
                      class="ep-calendar-nav-btn"
                      :disabled="disabled.includes('prev-month')"
                      :aria-label="t('epPreviousMonth')"
                      @click="prevMonth"
                    >
                      <v-icon size="18">mdi-chevron-left</v-icon>
                    </button>
                    <span class="ep-calendar-month">{{ monthYearText }}</span>
                    <button
                      type="button"
                      class="ep-calendar-nav-btn"
                      :disabled="disabled.includes('next-month')"
                      :aria-label="t('epNextMonth')"
                      @click="nextMonth"
                    >
                      <v-icon size="18">mdi-chevron-right</v-icon>
                    </button>
                  </div>
                </template>
              </v-date-picker>
            </div>
          </CardContent>
        </Card>

        <!-- ============ Event Details mini-card (cf. React :1999-2056) ============
             Affiche le nom/date courte de l'event sélectionné + badge état
             (Version Active / Default) + show time / tickets scanned read-only,
             + boutons Reset / Save as. Visible uniquement single-event. -->
        <Card
          v-if="selectedEvent && multiSelectIds.length <= 1"
          class="ep-side-event-card"
        >
          <CardContent class="ep-side-event-content">
            <!-- Identité de l'évènement (lecture seule) -->
            <div class="ep-side-event-head">
              <div class="ep-side-event-name">{{ selectedEvent.eventName }}</div>
            </div>
            <div class="ep-side-event-date">{{ formatDateWithDay(selectedEvent.eventDate) }}</div>
            <!-- Stats masquées si la donnée est absente en base (pas de « Not set » / « 0 »). -->
            <div
              v-if="hasShowTimeData || hasTicketsScannedData"
              class="ep-side-event-stats"
            >
              <div v-if="hasShowTimeData" class="ep-side-event-row">
                <span class="ep-muted">{{ t('epTimeLabel') }}</span>
                <span class="ep-side-event-row-val">
                  {{ selectedEvent.sessions[0].showTime }}
                </span>
              </div>
              <div v-if="hasTicketsScannedData" class="ep-side-event-row">
                <span class="ep-muted">{{ t('epTicketsScannedLabel') }}</span>
                <span class="ep-side-event-row-val">
                  {{ Number(selectedEvent.ticketsScanned).toLocaleString() }}
                </span>
              </div>
            </div>

            <!-- Zone Version : sépare clairement les actions de version de
                 l'identité de l'évènement (retour UX « box prête à confusion »). -->
            <div class="ep-side-version-zone">
              <div class="ep-side-version-zone-head">
                <span class="ep-side-version-zone-label">{{ t('epVersion') }}</span>
                <span
                  v-if="currentEditingVersionId"
                  class="ep-side-badge ep-side-badge-secondary"
                  :title="`${t('epActiveVersionTitle')} : ${editingVersionName || t('epUnnamed')}`"
                >{{ editingVersionName || t('epActiveVersion') }}</span>
                <span v-else class="ep-side-badge ep-side-badge-outline">{{ t('epDraftUnsaved') }}</span>
                <span
                  v-if="hasUnsavedChanges"
                  class="ep-side-badge ep-side-badge-dirty"
                  :title="t('epNotSavedTitle')"
                >● {{ t('epNotSaved') }}</span>
              </div>
              <p class="ep-side-version-zone-hint">
                {{ t('epSaveHintFr') }}<br />
                {{ t('epSaveHintEn') }}
              </p>
              <div class="ep-side-event-actions">
                <Button
                  variant="outline"
                  size="sm"
                  class="ep-side-event-btn"
                  :title="t('epResetTitle')"
                  @click="handleReset"
                >
                  <RotateCcw class="w-4 h-4 mr-1" />
                  {{ t('epReset') }}
                </Button>
                <Button
                  size="sm"
                  class="ep-side-event-btn"
                  :class="{ 'ep-save-dirty': hasUnsavedChanges }"
                  :title="t('epSaveAsTitle')"
                  @click="onSaveVersion"
                >
                  <Save class="w-4 h-4 mr-1" />
                  {{ t('epSaveAs') }}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- ============ Saved Versions (cf. React :2060-2158) ============
             Cartes empilées (pas un tableau), radio default + 3 icon buttons
             (rename / duplicate / delete) + Update button conditionnel. -->
        <div
          v-if="selectedEvent && versions.length > 0 && multiSelectIds.length <= 1"
          class="ep-side-versions"
        >
          <div class="ep-side-versions-label">{{ t('epSavedVersions') }}</div>
          <Card
            v-for="v in sortedVersions"
            :key="v.id"
            class="ep-side-version-card"
            :class="{ 'is-editing': currentEditingVersionId === v.id }"
            role="button"
            tabindex="0"
            @click="onLoadVersion(v)"
            @keydown.enter.prevent="onLoadVersion(v)"
            @keydown.space.prevent="onLoadVersion(v)"
          >
            <CardHeader class="ep-side-version-header">
              <div class="ep-side-version-head-row">
                <div class="ep-side-version-head-left">
                  <button
                    type="button"
                    class="ep-side-radio"
                    :class="{ 'is-checked': currentEditingVersionId === v.id }"
                    :title="currentEditingVersionId === v.id ? t('epActiveVersion') : t('epActivateThisVersion')"
                    @click.stop="onSelectVersion(v)"
                  >
                    <span v-if="currentEditingVersionId === v.id" class="ep-side-radio-dot" />
                  </button>
                  <button
                    type="button"
                    class="ep-side-version-name"
                    @click.stop="onSelectVersion(v)"
                  >
                    {{ v.name }}
                  </button>
                  <span
                    v-if="currentEditingVersionId === v.id"
                    class="ep-side-badge ep-side-badge-active"
                  >{{ t('epActive') }}</span>
                </div>
                <div class="ep-side-version-actions">
                  <button
                    type="button"
                    class="ep-side-icon-btn"
                    :title="t('epRename')"
                    @click.stop="onRenameVersion(v)"
                  ><Pencil class="w-3 h-3" /></button>
                  <button
                    type="button"
                    class="ep-side-icon-btn"
                    :title="t('epDuplicate')"
                    @click.stop="onDuplicateVersion(v.id)"
                  ><Copy class="w-3 h-3" /></button>
                  <button
                    type="button"
                    class="ep-side-icon-btn"
                    :title="t('epShareLinkCopy')"
                    @click.stop="onShareVersion(v)"
                  ><Link2 class="w-3 h-3" /></button>
                  <button
                    type="button"
                    class="ep-side-icon-btn ep-side-icon-danger"
                    :title="t('delete')"
                    @click.stop="onDeleteVersion(v.id)"
                  ><Trash2 class="w-3 h-3" /></button>
                </div>
              </div>
            </CardHeader>
            <CardContent class="ep-side-version-content">
              <div class="ep-side-version-stats">
                <div class="ep-side-version-stat-row">
                  <span class="ep-muted">{{ t('epRevenueHt') }}</span>
                  <span class="ep-side-version-stat-val">
                    €{{ Math.round(Number(v.adjustedTotalRevenue ?? v.totalRevenue ?? 0)).toLocaleString("en-US") }}
                  </span>
                </div>
                <div class="ep-side-version-stat-row">
                  <span class="ep-muted">{{ t('epPerCap') }}</span>
                  <span class="ep-side-version-stat-val">
                    €{{ Math.round(Number(v.adjustedPerCapita ?? v.perCapita ?? 0)).toLocaleString("en-US") }}
                  </span>
                </div>
              </div>
              <Button
                v-if="currentEditingVersionId === v.id"
                size="sm"
                class="ep-side-update-btn"
                :class="{ 'ep-save-dirty': hasUnsavedChanges }"
                :disabled="!hasUnsavedChanges"
                @click.stop="onUpdateVersion(v.id)"
              >
                {{ t('epUpdate') }}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <!-- Rail de repli de la colonne gauche : élargit le centre.
           Sibling direct de .ep-side/.ep-main (pas un enfant de .ep-main) :
           .ep-main a overflow-x:hidden qui clippait ce bouton absolu quand il
           débordait sa boîte (surtout replié, left:4px < x de départ de .ep-main),
           le rendant impossible à re-cliquer pour ré-ouvrir le panneau. -->
      <!-- RIGHT: Prediction details -->
      <div class="ep-main">
        <!-- Empty state placeholder (cf. React :2166-2177) -->
        <Card v-if="!selectedEvent" class="ep-empty-state">
          <CardContent class="ep-empty-state-content">
            <div class="ep-empty-state-icon">
              <CalendarIcon class="w-6 h-6" />
            </div>
            <h2 class="ep-empty-state-title">{{ t('epEmptyTitle') }}</h2>
            <p class="ep-empty-state-text">
              {{ t('epEmptyText') }}
            </p>

            <!-- Sélecteur d'event à prédire (même rôle que l'autocomplete
                 sidebar, limité aux events FUTURS = cibles de prédiction). -->
            <v-autocomplete
              :model-value="selectedEventId"
              v-model:search="eventSearch"
              :items="futureEventOptions"
              item-title="label"
              item-value="id"
              prepend-inner-icon="mdi-magnify"
              menu-icon="mdi-chevron-down"
              :placeholder="t('epSelectEventPlaceholder')"
              variant="outlined"
              density="comfortable"
              hide-details
              auto-select-first
              clearable
              :no-data-text="t('epNoUpcomingEvent')"
              class="ep-empty-state-select"
              @update:model-value="selectEvent"
              @update:focused="(f) => { if (f) eventSearch = '' }"
            >
              <template #item="{ props: itemProps, item }">
                <v-list-item v-bind="itemProps" :title="item.raw.eventName">
                  <template #subtitle>{{ formatDateWithDay(item.raw.eventDate) }}</template>
                </v-list-item>
              </template>
            </v-autocomplete>

            <div class="ep-empty-state-stats">
              <span class="ep-empty-state-chip">
                {{ futureEventOptions.length }}
                {{ futureEventOptions.length > 1 ? t('epUpcomingEventPlural') : t('epUpcomingEventSingular') }}
              </span>
              <span class="ep-empty-state-chip">
                {{ pastEventOptions.length }}
                {{ pastEventOptions.length > 1 ? t('epPastEventPlural') : t('epPastEventSingular') }}
              </span>
              <span class="ep-empty-state-chip">{{ space?.name || "—" }}</span>
            </div>
          </CardContent>
        </Card>

        <template v-else>
          <!-- ============ Mode MULTI-EVENT (cf. React :2319-2351) ============
               Quand plusieurs events sont sélectionnés, on masque toutes les
               sections détail (timeline, menus, stock up, métriques) et on
               affiche un placeholder listant les events + un rappel UX. -->
          <template v-if="multiSelectIds.length > 1">
            <Card class="ep-multi-placeholder">
              <CardHeader>
                <CardTitle>{{ t('epMultiTitle') }}</CardTitle>
                <CardDescription>
                  {{ t('epMultiDescPrefix') }}
                  {{ multiSelectIds.length }}
                  {{ multiSelectIds.length > 1 ? t('epEventWordPlural') : t('epEventWordSingular') }}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div class="ep-multi-list">
                  <div
                    v-for="ev in events.filter((e) => multiSelectIds.includes(e.id))"
                    :key="ev.id"
                    class="ep-multi-list-row"
                  >
                    <div>
                      <div class="ep-multi-list-name">{{ ev.eventName }}</div>
                      <div class="ep-multi-list-date">{{ formatDateWithDay(ev.eventDate) }}</div>
                    </div>
                    <span v-if="ev.ticketsSold" class="ep-multi-list-badge">
                      {{ Number(ev.ticketsSold).toLocaleString() }} {{ t('epTickets') }}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card class="ep-multi-tip">
              <CardContent>
                <strong>{{ t('epTip') }}</strong> {{ t('epMultiTip') }}
              </CardContent>
            </Card>
          </template>

          <!-- ============ Mode SINGLE-EVENT ============ -->
          <template v-else>
          <!-- EventDetailsEditor : éditeur de métadonnées event (cf. React
               :2196-2205 future events et :2298-2306 past events). -->
          <EventDetailsEditor
            :event="predictEditorEvent"
            :configurations="configurations"
            :event-types="eventTypes"
            :event-categories="eventCategories"
            :event-subcategories="eventSubcategories"
            :teams="teams"
            :from-mock="fromMock"
            :show-attendance="true"
            :show-sessions="anyEventHasShowTime"
            @event-update="handleEventUpdate"
            @event-create="handleEventCreate"
            @event-live="handleEventLiveUpdate"
            @configuration-change="handleConfigurationChange"
            @team-created="handleTeamCreated"
          >
            <!-- Toggle STANDARD du panneau gauche dans le bandeau rouge. -->
            <template #lead>
              <WorkspacePanelToggle
                :open="!sideCollapsed"
                :label="sideCollapsed ? t('epShowPanel') : t('epCollapsePanel')"
                @toggle="sideCollapsed = !sideCollapsed"
              />
            </template>
          </EventDetailsEditor>

          <!-- Note: la carte "Synthèse financière" inline a été retirée
               (Lot 6) — les 4 cards Total Revenue / PerCap / Avg/Trans /
               Transformation sont maintenant rendues dans la colonne de
               droite `ep-metrics` (cf. React :2356-2446). -->

          <!-- Note: les "Versions enregistrées" sont maintenant rendues dans
               la sidebar gauche (cf. React :2060-2158 + Lot 10) — la table
               inline a été retirée. -->

          <!-- Note: la card "Selected event summary" a été supprimée
               (conformité React §2196-2289) — les KPI sont dans la colonne
               droite et l'éditeur d'event au-dessus. -->

          <!-- ============ Mode PAST event (cf. React :2294-2317) ============
               Pour un event passé, on n'affiche QUE la timeline chart réelle
               (pas de scoring past events, pas de MenusSection, pas de
               StockUp, pas de timeline prédictive). -->
          <template v-if="isPastSelectedEvent">
            <Card class="ep-past-timeline-card">
              <CardHeader>
                <CardTitle>{{ t('epRealTimelineTitle') }}</CardTitle>
                <CardDescription>
                  {{ t('epRealTimelineDesc') }}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  v-if="pastTimelineLoading"
                  class="text-sm text-muted-foreground"
                >
                  {{ t('epRealTimelineLoading') }}
                </div>
                <div
                  v-else-if="!pastTimelineData.length"
                  class="text-sm text-muted-foreground"
                >
                  {{ t('epNoTimelineData') }}
                </div>
                <EventTimelineChart
                  v-else
                  class="ep-timeline-chart"
                  :event-id="selectedEvent.id"
                  :event-name="selectedEvent.eventName"
                  :event-date="selectedEvent.eventDate"
                  :timeline-data="pastTimelineData"
                  :menu-items="menuItems"
                  :element-id-to-shop-name-map="elementIdToShopNameMap"
                  :element-id-to-types-map="elementIdToTypesMap"
                  :element-id-to-area-map="elementIdToAreaMap"
                  :item-name-to-menu-item-id-map="itemNameToMenuItemIdMap"
                  :closable="false"
                  :initial-range="selectedTimeRange"
                  @time-range-change="onTimelineRangeChange"
                />
              </CardContent>
            </Card>
          </template>

          <!-- ============ Mode FUTURE event (conformité React :2192-2280) ============
               Ordre : Timeline → Configuration settings → Stock up.
               (Past events scoring breakdown reste en bas, en debug/info.) -->
          <template v-else>

          <!-- 1) Timeline prédictive (auto-loaded, cf. React :2226-2247) -->
          <div id="ep-anchor-timeline"></div>
          <!-- Loading = calcul en cours OU pas encore lancé (hasCalculated=false).
               Empêche le bandeau « Timeline indisponible » de s'afficher au 1er
               rendu avant que l'algorithme ait tourné. -->
          <div
            v-if="timeline.timelineLoading || !timeline.hasCalculated"
            class="ep-section-loading"
          >
            <Loader2 class="w-4 h-4 mr-1 ep-spin" />
            <span>{{ t('epScoringLoading') }}</span>
          </div>
          <!-- Échec du calcul : message d'erreur distinct (pas le bandeau vide). -->
          <v-alert
            v-else-if="timeline.timelineError"
            type="error"
            variant="tonal"
            density="comfortable"
            class="ep-timeline-empty-alert mb-3"
          >
            <strong>{{ t('epTimelineCalcErrorTitle') }}</strong>
            {{ t('epTimelineCalcErrorText') }}
          </v-alert>
          <template v-else>
            <div
              v-if="timeline.isLowConfidencePrediction"
              class="ep-timeline-warning"
            >
              {{ t('epLowConfidenceWarning') }}
            </div>

            <!-- SECTION 2 — skeleton tant que le scoring n'est pas terminé
                 (calculs parallèles, affichage ordonné). -->
            <Card
              v-if="timeline.timelineLoading && !timeline.scoringReady"
              class="ep-prediction-base mb-3"
              :aria-label="t('epScoringLoadingAria')"
            >
              <CardHeader>
                <span class="ep-skeleton-line ep-skeleton-line-title" />
                <span class="ep-skeleton-line" style="width: 55%" />
              </CardHeader>
            </Card>
            <!-- Base de prédiction (au-dessus du graphique) : compteur + sélection.
                 Permet de voir et de modifier les events sources utilisés. -->
            <Card v-else-if="scoredPastEvents.length > 0" class="ep-prediction-base mb-3">
              <CardHeader class="ep-prediction-base-header">
                <div>
                  <CardTitle class="text-base">
                    {{ t('epPredictionBasedOn') }}
                    <span class="ep-base-count">{{ activeScoredEvents.length }}</span>
                    /
                    <span class="ep-base-count-total">{{ scoredPastEvents.length }}</span>
                    {{ scoredPastEvents.length > 1 ? t('epPastEventPlural') : t('epPastEventSingular') }}
                    <v-icon
                      size="16"
                      class="ep-algo-info-icon ml-1"
                      role="button"
                      tabindex="0"
                      style="cursor: pointer; vertical-align: middle; opacity: 0.7;"
                      :title="t('epAlgoSelectionTitle')"
                      @click="showAlgoInfo"
                      @keyup.enter="showAlgoInfo"
                    >mdi-information-outline</v-icon>
                  </CardTitle>
                  <CardDescription>
                    {{ t('epPredictionSourcesDescription') }}
                  </CardDescription>
                </div>
                <div class="ep-prediction-base-actions">
                  <button
                    type="button"
                    class="ep-sources-btn"
                    :aria-label="t('epSources')"
                    :title="t('epSources')"
                    @click="showSourcesDrawer = true"
                  >
                    <v-icon size="17">mdi-source-branch</v-icon>
                  </button>
                </div>
              </CardHeader>
            </Card>

            <!-- Drawer de sélection des events sources (remplace la liste inline).
                 Recalcul PARTIEL à l'apply : overridePredictionIds → re-pondération
                 + timeline (fetchs servis par restTimelineCache, zéro réseau). -->
            <EventPredictSourcesDrawer
              v-model="showSourcesDrawer"
              :scored-events="scoredPastEvents"
              :unselected-events="drawerUnselectedEvents"
              :selected-ids="Array.from(selectedPastEventIds)"
              :loading="timeline.timelineLoading"
              @apply="applySourcesSelection"
            />

            <!-- SECTION 3 — skeleton du graphe pendant le calcul de la timeline
                 (initial ET recalcul partiel « Sauvegarder & Recalculer »). -->
            <div
              v-if="timeline.timelineLoading"
              class="ep-skeleton-panel ep-skeleton-chart mb-3"
              :aria-label="t('epTimelineCalcAria')"
            />
            <!-- Bandeau diagnostic : explique pourquoi la timeline est vide
                 (sinon l'utilisateur voit un graphe vide sans raison). -->
            <v-alert
              v-if="!timeline.timelineLoading && timeline.hasCalculated && !timelineByMinute.length"
              type="warning"
              variant="tonal"
              density="comfortable"
              class="ep-timeline-empty-alert mb-3"
            >
              <strong>{{ t('epTimelineUnavailableTitle') }}</strong>
              <template v-if="timeline.insufficientData">
                {{ t('epTimelineNoComparable') }}
              </template>
              <template v-else-if="timeline.usedFallback">
                {{ t('epTimelineFallbackNoSales') }}
              </template>
              <template v-else>
                {{ t('epTimelineNoUsableSales') }}
              </template>
            </v-alert>
            <!-- Bandeau info : timeline présente mais NON recalée (aucun event
                 comparable n'a de Show Time → courbes en heure brute). Invite
                 l'utilisateur à renseigner les horaires pour un alignement précis. -->
            <v-alert
              v-if="!timeline.timelineLoading && timeline.unalignedTimeline && timelineByMinute.length > 0"
              type="info"
              variant="tonal"
              density="comfortable"
              class="ep-timeline-empty-alert mb-3"
            >
              <strong>{{ t('epTimelineAlignmentUnavailableTitle') }}</strong>
              {{ t('epTimelineAlignmentUnavailableText') }}
            </v-alert>
            <EventTimelineChart
              v-if="!timeline.timelineLoading && timelineByMinute.length > 0"
              class="ep-timeline-chart"
              :event-id="selectedEventId || ''"
              :event-name="selectedEvent?.eventName || ''"
              :event-date="selectedEvent?.eventDate || ''"
              :timeline-data="[]"
              :predicted-timeline-data="timeline.predictedTimelineData || []"
              :menu-items="menuItems"
              :element-id-to-shop-name-map="elementIdToShopNameMap"
              :element-id-to-types-map="elementIdToTypesMap"
              :element-id-to-area-map="elementIdToAreaMap"
              :item-name-to-menu-item-id-map="itemNameToMenuItemIdMap"
              :initial-range="selectedTimeRange"
              @time-range-change="onTimelineRangeChange"
            />
            <v-chip
              v-if="selectedTimeRange.start || selectedTimeRange.end"
              size="small"
              color="primary"
              variant="tonal"
              closable
              class="mt-2"
              @click:close="selectedTimeRange = { start: null, end: null, startPct: null, endPct: null }; scheduleDraftSave()"
            >
              {{ t('epTimeRange') }} {{ selectedTimeRange.start || '—' }} → {{ selectedTimeRange.end || '—' }}
            </v-chip>
          </template>

          <!-- Fenêtre « terminal » : traçabilité de l'algo (lecture seule, repliée
               par défaut, non bloquante). Données déjà calculées par le composable. -->
          <!-- Toggle MODE DEBUG : visible seulement en dev ou avec ?debugPrediction=1
               (masqué par défaut). N'altère PAS la prédiction — expose la trace. -->
          <div v-if="debugPredictionAvailable" class="ep-debug-toggle">
            <label>
              <input type="checkbox" v-model="debugMode" />
              {{ t('epDebugMode') }}
            </label>
          </div>
          <AlgoTraceTerminal
            v-if="debugPredictionAvailable"
            :candidates="timeline.candidateEvents || []"
            :selected-ids="timeline.selectedPredictionEventIds || []"
            :excluded-count="(timeline.excludedSameSubcategoryEvents ? timeline.excludedSameSubcategoryEvents.length : 0) + (timeline.excludedSameCategoryEvents ? timeline.excludedSameCategoryEvents.length : 0)"
            :loading="timeline.timelineLoading"
            :low-confidence="timeline.isLowConfidencePrediction"
            :insufficient="timeline.insufficientData"
            :target-label="algoTraceTargetLabel"
            :debug="debugPredictionAvailable && debugMode"
            :prediction-trace="timeline.predictionDebugTrace"
            :timeline-trace="timeline.timelineDebugTrace"
            :target-event="selectedEvent"
            :excluded-ids="Array.from(excludedPastEventIds)"
          />

          <!-- 4) Past events scoring breakdown : déplacé au-dessus du graphique
               (cf. demande utilisateur) — ce bloc reste supprimé ici. -->

          </template>
          <!-- /future-event mode -->

          <!-- ============ Configuration / Stock (TOUS events) ============
               Coeur d'EventPredict : ajustement des ventes par shop / menu item
               + stock up. Rendu pour event passé OU futur, alimenté par la
               timeline réelle (passé) ou prédictive (futur) via
               `activeTimelineData`. -->
          <div id="ep-anchor-configuration"></div>
          <div id="ep-anchor-stockup"></div>
          <Tabs
            :value="predictSectionTab"
            class-name="ep-predict-section-tabs"
            @update:value="(value) => (predictSectionTab = value)"
          >
            <div class="ep-predict-section-header">
              <TabsList class-name="ep-predict-section-tabs-list">
                <TabsTrigger
                  value="configuration"
                  class-name="ep-predict-section-trigger"
                >
                  <v-icon size="16">mdi-tune-variant</v-icon>
                  {{ t('epConfigurationTab') }}
                </TabsTrigger>
                <TabsTrigger
                  value="stockup"
                  class-name="ep-predict-section-trigger"
                >
                  <v-icon size="16">mdi-package-variant-closed</v-icon>
                  {{ t('epStockTab') }}
                </TabsTrigger>
              </TabsList>

              <div
                v-if="predictSectionTab === 'configuration' || predictSectionTab === 'stockup'"
                class="ep-view-mode-wrap"
              >
                <span class="ep-view-mode-label">{{ t('epDisplayMode') }}</span>
                <Tabs
                  :value="viewMode"
                  class-name="ep-view-mode-tabs"
                  @update:value="setViewMode"
                >
                  <TabsList class-name="grid w-full grid-cols-2">
                    <TabsTrigger value="shop">
                      <v-icon size="14" class="mr-1">mdi-store-outline</v-icon>
                      {{ t('epViewModeShop') }}
                    </TabsTrigger>
                    <TabsTrigger value="item">
                      <v-icon size="14" class="mr-1">mdi-tag-outline</v-icon>
                      {{ t('epViewModeItem') }}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>

            <TabsContent
              value="configuration"
              class-name="ep-predict-section-panel"
            >
              <!-- PERF: ne monter la section que lorsque son onglet est actif
                   (v-if, pas v-show). Évite que les DEUX sections (Menus + Stock-up)
                   tournent leurs pipelines computed lourds simultanément. L'état
                   (ajustements/quantités) est remonté au parent → remount sûr. -->
              <!-- SECTION 4 — skeleton tant que (timeline + Space Menu) ne sont
                   pas tous les deux prêts : les ajustements dérivent des deux. -->
              <div
                v-if="predictSectionTab === 'configuration' && !adjustedReady"
                class="ep-skeleton-panel"
                :aria-label="t('epAdjustmentsLoadingAria')"
              >
                <span class="ep-skeleton-line ep-skeleton-line-title" />
                <span v-for="n in 4" :key="`adj-skel-${n}`" class="ep-skeleton-row" />
              </div>
              <EventPredictMenusSection
                v-else-if="predictSectionTab === 'configuration'"
                :configuration="selectedEventConfiguration"
                :menu-items="menuItems"
                :ingredients="ingredients"
                :components="components"
                :suppliers="suppliers"
                :space-id="space?.id || ''"
                :event-id="selectedEventId || ''"
                :predicted-timeline-data="activeTimelineData"
                :weezevent-price-map="weezeventProductPriceMap"
                :weezevent-cost-map="weezeventProductCostMap"
                :menu-item-cost-map="effectiveMenuItemCostMap"
                :selected-menu-items="effectiveMenuConfig"
                :quantity-adjustments="quantityAdjustments"
                :manual-quantities="manualQuantities"
                :is-open-by-shop="isOpenByShop"
                :config-has-shops="configHasShops"
                :config-shops="configShopElements"
                :map-status-by-shop="menuItemMapStatusByShop"
                :menu-assignment-missing="menuAssignmentMissing"
                :shop-menu-assignment="shopMenuAssignmentForSection"
                :shop-menu-assignment-items="shopMenuAssignmentItemsForSection"
                :shop-menu-membership="shopMenuMembership"
                :unmapped-items-by-shop="unmappedItemsByShop"
                :view-mode="viewMode"
                :items-context="predictionItemsContext"
                :product-types="productTypes"
                :product-categories="productCategories"
                @update:selected-menu-items="onMenuConfigChange"
                @update:quantity-adjustments="onAdjustmentsChange"
                @update:manual-quantities="onManualQuantitiesChange"
                @update:view-mode="setViewMode"
                @manual-info="showManualInfo"
                @remap-request="openRemapDialog"
                @assign-shop-item="handleAssignShopItem"
                @assign-shop-items="handleAssignShopItems"
                @assign-blocked="handleAssignBlocked"
              />
              <!-- Lien Configuration → Inventaire de l'espace : après avoir réglé la
                   config (PdV/menu), compter le restant avant de passer au Stock up. -->
              <div class="ep-config-inv-link">
                <a href="#" @click.prevent="goToInventory">
                  <v-icon size="15" class="mr-1">mdi-package-variant</v-icon>
                  {{ t('epInventoryLink') }}
                </a>
              </div>
            </TabsContent>

            <TabsContent
              value="stockup"
              class-name="ep-predict-section-panel"
            >
              <!-- Lien direct Stock up → Réarmement : les quantités ajustées
                   alimentent le réarmement par point de vente. -->
              <div class="ep-stockup-cta">
                <div class="ep-stockup-cta-text">
                  <strong>{{ t('epRestockReadyTitle') }}</strong>
                  <span>{{ t('epRestockReadyText') }}</span>
                </div>
                <div class="ep-stockup-cta-actions">
                  <!-- Inventaire AVANT réarmement : compter le restant sur place avant
                       de générer la feuille de réarmement (gap = besoin − restant). -->
                  <Button
                    size="sm"
                    variant="outline"
                    class="ep-stockup-cta-btn"
                    :title="t('epOpenInventoryForEvent')"
                    @click="goToInventory"
                  >
                    <v-icon size="16" class="mr-1">mdi-package-variant</v-icon>
                    {{ t('epSpaceInventory') }}
                  </Button>
                  <Button
                    size="sm"
                    class="ep-stockup-cta-btn"
                    :title="t('epOpenRestockForEvent')"
                    @click="goToRestock"
                  >
                    <v-icon size="16" class="mr-1">mdi-truck-delivery-outline</v-icon>
                    {{ t('epGoToRestock') }}
                  </Button>
                </div>
              </div>
              <EventPredictStockUpSection
                v-if="predictSectionTab === 'stockup'"
                :key="`stockup-${currentEditingVersionId || 'default'}`"
                :configuration="selectedEventConfiguration"
                :menu-items="menuItems"
                :ingredients="ingredients"
                :components="components"
                :predicted-timeline-data="activeTimelineData"
                :selected-menu-items="selectedMenuItemsByShop"
                :quantity-adjustments="quantityAdjustments"
                :manual-quantities="manualQuantities"
                :view-mode="viewMode"
                :menu-item-cost-map="effectiveMenuItemCostMap"
                :items-context="predictionItemsContext"
              />
            </TabsContent>
          </Tabs>
          </template>
          <!-- /single-event mode -->
        </template>
      </div>

      <!-- ============ RIGHT COLUMN : Event Metrics Widgets ============
           Affichée uniquement quand un seul event est sélectionné (cf. React
           :2357 `selectedEventIds.length === 1 && selectedEvent`). 4 cards
           en 2×2 : Total Revenue / PerCap / Avg/Trans / Transformation. -->
      <div
        v-if="selectedEvent && multiSelectIds.length <= 1"
        class="ep-metrics"
      >
        <nav class="ep-metrics-anchors" :aria-label="t('epSectionsAria')">
          <a href="#ep-anchor-summary" @click.prevent="scrollToAnchor('ep-anchor-summary')">{{ t('epSummary') }}</a>
          <a href="#ep-anchor-configuration" @click.prevent="scrollToAnchor('ep-anchor-configuration')">{{ t('epConfigurationTab') }}</a>
          <a href="#ep-anchor-timeline" @click.prevent="scrollToAnchor('ep-anchor-timeline')">{{ t('epTimeline') }}</a>
          <a href="#ep-anchor-stockup" @click.prevent="scrollToAnchor('ep-anchor-stockup')">{{ t('epStockTab') }}</a>
        </nav>
        <div id="ep-anchor-summary" class="ep-metrics-head">
          <div class="ep-metrics-kicker-row">
            <p class="ep-metrics-kicker">{{ t('epSummary') }}</p>
            <span
              v-if="hasUnsavedChanges"
              class="ep-side-badge ep-side-badge-dirty"
              :title="t('epUnsavedClickSaveTitle')"
            >● {{ t('epNotSaved') }}</span>
          </div>
          <h2 class="ep-metrics-title">
            {{ selectedEvent.eventName || selectedEvent.name || t('epEventFallbackName') }}
          </h2>
          <p class="ep-metrics-subtitle">
            {{ formatDateWithDay(selectedEvent.eventDate || selectedEvent.date || '') }}
            <span v-if="selectedEvent.sessions?.[0]?.showTime">
              · {{ selectedEvent.sessions[0].showTime }}
            </span>
          </p>
        </div>
        <div class="ep-metrics-grid">
          <!-- Total Revenue -->
          <div class="ep-metric-card ep-metric-card-primary">
            <h3 class="ep-metric-label">{{ t('epTotalRevenueHt') }}</h3>
            <p v-if="predictedReady" class="ep-metric-value">
              €{{ Math.round(totalPredictedRevenue).toLocaleString("en-US") }}
            </p>
            <span v-else class="ep-skel-value" :aria-label="t('epCalculatingAria')" />
            <div class="ep-metric-adjusted">
              <p class="ep-metric-adjusted-label">{{ t('epmAdjusted') }}</p>
              <p v-if="adjustedReady" class="ep-metric-adjusted-value">
                €{{ Math.round(totalAdjustedRevenue).toLocaleString("en-US") }}
              </p>
              <span v-else class="ep-skel-value ep-skel-value-sm" :aria-label="t('epWaitingSpaceMenuAria')" />
            </div>
          </div>

          <!-- Cost -->
          <div class="ep-metric-card ep-metric-card-neutral">
            <h3 class="ep-metric-label">{{ t('epMetricCost') }}</h3>
            <p v-if="predictedReady" class="ep-metric-value">
              €{{ Math.round(totalPredictedCost).toLocaleString("en-US") }}
            </p>
            <span v-else class="ep-skel-value" :aria-label="t('epCalculatingAria')" />
            <div class="ep-metric-adjusted">
              <p class="ep-metric-adjusted-label">{{ t('epmAdjusted') }}</p>
              <p v-if="adjustedReady" class="ep-metric-adjusted-value">
                €{{ Math.round(totalAdjustedCost).toLocaleString("en-US") }}
              </p>
              <span v-else class="ep-skel-value ep-skel-value-sm" :aria-label="t('epWaitingSpaceMenuAria')" />
            </div>
          </div>

          <!-- Margin -->
          <div class="ep-metric-card ep-metric-card-success">
            <h3 class="ep-metric-label">{{ t('epMetricMargin') }}</h3>
            <p v-if="predictedReady" class="ep-metric-value">{{ predictedMargin.toFixed(2) }}%</p>
            <span v-else class="ep-skel-value" :aria-label="t('epCalculatingAria')" />
            <div class="ep-metric-adjusted">
              <p class="ep-metric-adjusted-label">{{ t('epmAdjusted') }}</p>
              <p v-if="adjustedReady" class="ep-metric-adjusted-value">
                {{ adjustedMargin.toFixed(2) }}%
              </p>
              <span v-else class="ep-skel-value ep-skel-value-sm" :aria-label="t('epWaitingSpaceMenuAria')" />
            </div>
          </div>

          <!-- PerCap (dépend de l'affluence → masqué si pas de billetterie) -->
          <div class="ep-metric-card ep-metric-card-success">
            <h3 class="ep-metric-label">{{ t('epPerCap').replace(':', '') }}</h3>
            <p v-if="predictedReady" class="ep-metric-value">
              €{{ Math.round(perCapitaPredicted).toLocaleString("en-US") }}
            </p>
            <span v-else class="ep-skel-value" :aria-label="t('epCalculatingAria')" />
            <div class="ep-metric-adjusted">
              <p class="ep-metric-adjusted-label">{{ t('epmAdjusted') }}</p>
              <p v-if="adjustedReady" class="ep-metric-adjusted-value">
                €{{ Math.round(perCapitaAdjusted).toLocaleString("en-US") }}
              </p>
              <span v-else class="ep-skel-value ep-skel-value-sm" :aria-label="t('epWaitingSpaceMenuAria')" />
            </div>
          </div>

          <!-- Panier (avg / transaction) -->
          <div class="ep-metric-card ep-metric-card-neutral">
            <h3 class="ep-metric-label">{{ t('epMetricBasket') }}</h3>
            <p v-if="predictedReady" class="ep-metric-value">
              €{{ Math.round(avgPerTransaction).toLocaleString("en-US") }}
            </p>
            <span v-else class="ep-skel-value" :aria-label="t('epCalculatingAria')" />
            <div class="ep-metric-adjusted">
              <p class="ep-metric-adjusted-label">{{ t('epmAdjusted') }}</p>
              <p v-if="adjustedReady" class="ep-metric-adjusted-value">
                €{{ Math.round(adjustedAvgPerTransaction).toLocaleString("en-US") }}
              </p>
              <span v-else class="ep-skel-value ep-skel-value-sm" :aria-label="t('epWaitingSpaceMenuAria')" />
            </div>
          </div>

          <!-- Transformation (dépend de l'affluence → masqué si pas de billetterie) -->
          <div class="ep-metric-card ep-metric-card-warning">
            <h3 class="ep-metric-label">{{ t('epMetricTransformation') }}</h3>
            <p v-if="predictedReady" class="ep-metric-value">{{ transformationRate.toFixed(2) }}%</p>
            <span v-else class="ep-skel-value" :aria-label="t('epCalculatingAria')" />
            <div class="ep-metric-adjusted">
              <p class="ep-metric-adjusted-label">{{ t('epmAdjusted') }}</p>
              <p v-if="adjustedReady" class="ep-metric-adjusted-value">
                {{ adjustedTransformationRate.toFixed(2) }}%
              </p>
              <span v-else class="ep-skel-value ep-skel-value-sm" :aria-label="t('epWaitingSpaceMenuAria')" />
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>

    <!-- Dialog Vuetify universel : prompt + confirm (cf. React §13.5) -->
    <v-dialog v-model="dlg.open" max-width="420" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1">{{ dlg.title }}</v-card-title>
        <v-card-text>
          <p v-if="dlg.message" class="text-body-2 mb-3" style="white-space: pre-line;">{{ dlg.message }}</p>
          <v-text-field
            v-if="dlg.type === 'prompt'"
            v-model="dlg.value"
            :label="dlg.placeholder"
            variant="outlined"
            density="compact"
            hide-details
            autofocus
            @keyup.enter="onDialogConfirm"
          />
          <v-text-field
            v-if="dlg.type === 'date'"
            v-model="dlg.value"
            type="date"
            :label="dlg.placeholder || t('epDialogDate')"
            variant="outlined"
            density="compact"
            hide-details
            autofocus
            @keyup.enter="onDialogConfirm"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn v-if="dlg.type !== 'info'" variant="text" @click="onDialogCancel">{{ t('cancel') }}</v-btn>
          <v-btn color="primary" variant="flat" @click="onDialogConfirm">
            {{ dlg.confirmLabel || 'OK' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Lot 2 — popup de remapping (rattacher un élément vendu au menu du shop) -->
    <v-dialog v-model="remapDlg.open" max-width="520" persistent>
      <v-card>
        <v-card-title class="text-subtitle-1">{{ t('epRemapDialogTitle') }}</v-card-title>
        <v-card-text>
          <div class="ep-remap-context">
            <span><strong>{{ t('epTenantLabel') }}</strong> {{ tenantId || '—' }}</span>
            <span><strong>{{ t('epSpaceLabel') }}</strong> {{ space?.name || space?.id || '—' }}</span>
            <span><strong>{{ t('epConfigLabel') }}</strong> {{ selectedEventConfiguration?.name || '—' }}</span>
            <span><strong>{{ t('epPosLabel') }}</strong> {{ remapDlg.shopName || '—' }}</span>
          </div>
          <v-divider class="my-3" />
          <p class="text-body-2 mb-2">
            {{ t('epSoldItemLabel') }} <strong>{{ remapDlg.soldItem && remapDlg.soldItem.name }}</strong>
          </p>
          <v-select
            :model-value="remapDlg.targetId"
            :items="remapDlg.candidates"
            item-title="name"
            item-value="id"
            :label="t('epAssignReplaceLabel')"
            variant="outlined"
            density="compact"
            hide-details
            @update:model-value="onRemapTargetChange"
          />
          <v-alert
            v-if="remapDlg.supplierWarn"
            type="warning"
            variant="tonal"
            density="compact"
            class="mt-3"
          >{{ remapDlg.supplierWarn }}</v-alert>
          <p v-if="!remapDlg.shopId" class="text-caption text-error mt-2">
            {{ t('epShopBackendMissing') }}
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="remapDlg.saving" @click="closeRemapDialog">{{ t('cancel') }}</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="remapDlg.saving"
            :disabled="!remapDlg.targetId || !remapDlg.shopId"
            @click="applyRemap"
          >{{ t('epApply') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar
      v-model="snackbar"
      :color="snackbarColor"
      :timeout="snackbarTimeout"
      location="bottom right"
    >
      {{ snackbarText }}
      <template v-slot:actions>
        <v-btn
          v-if="snackbarReloadAction"
          variant="text"
          @click="reloadAndRecompute"
        >{{ t('epReload') }}</v-btn>
        <v-btn variant="text" @click="snackbar = false">{{ t('close') }}</v-btn>
      </template>
    </v-snackbar>
  </Teleport>
</template>

<script>
import { reactive, computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from "@/i18n/useI18n";
import {
  ChevronRight,
  ChevronLeft,
  Calendar as CalendarIcon,
  Info,
  RotateCcw,
  Loader2,
  Save,
  Pencil,
  Copy,
  Trash2,
  Link2,
  Settings,
} from "lucide-vue-next";

import Button from "../ui/button.vue";
import Card from "../ui/card.vue";
import CardHeader from "../ui/cardHeader.vue";
import CardTitle from "../ui/cardTitle.vue";
import CardDescription from "../ui/cardDescription.vue";
import CardContent from "../ui/cardContent.vue";

import * as eventApi from "../utils/eventApi";
import { getSpaceEventTimeline, getSpaceShopGranular } from "../api/endpoints/space.api";
import {
  createEvent,
  updateEvent,
  getEventTypes as restGetEventTypes,
  getEventCategories as restGetEventCategories,
  getEventSubcategories as restGetEventSubcategories,
} from "../api/endpoints/event.api";
import * as api from "../utils/api";
import store from "../store";
import {
  findAndScorePastEvents,
  generatePredictionsForEvent,
  isAdhocEvent,
  normalizeStr,
} from "../utils/predictiveAnalytics";
import { findBestMatch } from "../utils/menuItemMatching";
import { getShopMenus } from "../api/endpoints/space-menu.api";
import { getTeams as restGetTeams } from "../api/endpoints/team.api";
import { getAllMenuItems as restGetAllMenuItems } from "../api/endpoints/menu-item.api";
import { assignMenuItemsToShop } from "../api/endpoints/menu.api";
import { resolveIngredientSupplierId } from "../utils/menuItemAvailability";
import { runWithConcurrency } from "../utils/asyncPool";
import { htFromTtc, menuItemPriceHt } from "../utils/price";
import { useEventPredictVersions } from "../composables/useEventPredictVersions";
import { usePredictiveTimeline } from "../composables/usePredictiveTimeline";
import {
  aggregateTimelinePerMinute,
  preprocessTimelineRecords,
  windowPredictedRecords,
  hasActiveRange,
} from "../utils/timelineBucketing";
import EventPredictMenusSection from "./EventPredictMenusSection.vue";
import EventPredictStockUpSection from "./EventPredictStockUpSection.vue";
import EventTimelineChart from "./analyse/charts/EventTimelineChart.vue";
import EventDetailsEditor from "./EventDetailsEditor.vue";
import EventPredictSourcesDrawer from "./EventPredictSourcesDrawer.vue";
import WorkspaceToolSelect from "@/components/WorkspaceToolSelect.vue";
import WorkspacePanelToggle from "@/components/WorkspacePanelToggle.vue";
import WorkspaceUserMenu from "@/components/WorkspaceUserMenu.vue";
import WorkspaceSpaceSwitcher from "@/components/WorkspaceSpaceSwitcher.vue";
import NotificationBell from "@/components/NotificationBell.vue";
import AlgoTraceTerminal from "./AlgoTraceTerminal.vue";
import Tabs from "../ui/tabs.vue";
import TabsList from "../ui/tabsList.vue";
import TabsTrigger from "../ui/tabsTrigger.vue";
import TabsContent from "../ui/tabsContent.vue";
import { parseEventDate as parseDDMMYYYY } from "../utils/dateFr";
import { isDemoMode } from "../utils/demoMode";
import { mergeEffectiveMenuConfig } from "../utils/menuConfigSelection";
import { setLastPredictedEvent, setPredictedRecords } from "../data/localDb";

// PERF : les Edge Functions de mappings (shop-element / menu-item) sont lentes
// (5-10 s) et leurs données changent rarement → cache localStorage par space,
// TTL 15 min, stale-while-revalidate : on sert le cache immédiatement et on
// revalide en arrière-plan (la prochaine visite verra la version fraîche).
const EDGE_MAPPINGS_TTL_MS = 15 * 60 * 1000;
function fetchEdgeMappingsSWR(spaceId) {
  const key = `ep:edge-mappings:${spaceId}`;
  const fetchFresh = () =>
    // shop-element-mappings + menu-item-mappings = make-server Edge Function (projet
    // Supabase uvxx MORT → 500/522). Aucun jumeau NestJS (registry KV legacy). La
    // réconciliation EventPredict passe désormais par getShopMenus NestJS + le
    // fallback config de buildShopMappings (dérive shopName/type/area des éléments
    // de config quand shopNamesMap est vide) + findBestMatch pour les items. On NE
    // tape PLUS le backend mort → paire vide (comportement identique au dead-call,
    // sans les 500/timeouts). Voir docs/BACKEND_TEAMS_EVENTS.md pour le contexte migration.
    Promise.all([
      Promise.resolve([]),
      Promise.resolve([]),
    ]).then((pair) => {
      try {
        localStorage.setItem(key, JSON.stringify({ at: Date.now(), pair }));
      } catch (_) { /* quota plein : cache best-effort */ }
      return pair;
    });
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const { at, pair } = JSON.parse(raw);
      if (Array.isArray(pair) && Date.now() - at < EDGE_MAPPINGS_TTL_MS) {
        fetchFresh(); // revalidation en fond
        return Promise.resolve(pair);
      }
    }
  } catch (_) { /* cache illisible → fetch */ }
  return fetchFresh();
}

const TOOLBOX_ITEMS = [
  { value: 'analyse', labelKey: 'epToolAnalyse', icon: 'mdi-chart-line', permission: 'front.fb.analyse' },
  { value: 'predict', labelKey: 'epToolPredict', icon: 'mdi-trending-up', permission: 'front.fb.predict' },
  { value: 'event-predict', labelKey: 'epToolEventPredict', icon: 'mdi-lightning-bolt', permission: 'front.fb.eventPredict' },
  { value: 'space-inventory', labelKey: 'epToolSpaceInventory', icon: 'mdi-package-variant', permission: 'front.fb.spaceInventory' },
  { value: 'logistic', labelKey: 'epToolLogistic', icon: 'mdi-forklift', permission: 'front.fb.logistic' },
  { value: 'restock', labelKey: 'epToolRestock', icon: 'mdi-truck-delivery-outline', permission: ['front.fb.restock', 'front.fb.restockBoard'] },
];

export default {
  name: "EventPredictView",
  components: {
    AlgoTraceTerminal,
    Button,
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    ChevronRight,
    ChevronLeft,
    CalendarIcon,
    Info,
    RotateCcw,
    Loader2,
    Save,
    Pencil,
    Copy,
    Trash2,
    Link2,
    Settings,
    NotificationBell,
    EventPredictMenusSection,
    EventPredictStockUpSection,
    EventTimelineChart,
    EventDetailsEditor,
    WorkspacePanelToggle,
    WorkspaceUserMenu,
    EventPredictSourcesDrawer,
    WorkspaceToolSelect,
    WorkspaceSpaceSwitcher,
    Tabs,
    TabsList,
    TabsTrigger,
    TabsContent,
  },
  props: {
    space: { type: Object, required: true },
  },
  emits: ["close"],
  setup(props) {
    const { t } = useI18n();
    const versionsApi = useEventPredictVersions();
    const route = useRoute();
    // Mode debug prédiction DISPONIBLE : dev build OU query `?debugPrediction=1`.
    // Masqué par défaut ailleurs. Ne calcule la trace QUE dans ces sessions
    // (coût nul pour l'utilisateur normal). Le toggle runtime `debugMode`
    // (data) décide de l'affichage effectif.
    // process.env.NODE_ENV : injecté par webpack (vue-cli-service). PAS
    // import.meta.env (Vite) — non supporté par le build Babel/webpack ici.
    // Mode debug OPT-IN par URL uniquement (`?debugPrediction=1`) — plus de
    // dérogation dev : la checkbox n'apparaît jamais pour un usage normal,
    // même en local (décision user 2026-07-06).
    const debugPredictionAvailable = computed(
      () => route.query?.debugPrediction === '1',
    );
    // Toggle runtime du mode debug (checkbox UI). Vit dans setup (et non data)
    // car il pilote AUSSI le COÛT des traces côté composable : disponible ne
    // suffit pas — en dev, `debugPredictionAvailable` est toujours vrai et
    // chaque calcul payait findAndScorePastEventsWithTrace (re-scoring complet
    // en double) + traces alors que la checkbox était décochée. Coût réel
    // seulement quand l'utilisateur ACTIVE le mode.
    const debugMode = ref(false);
    // Holders plain objects (non auto-unwrapped) so the composable's
    // closures see fresh data when we mutate `.value` from watchers.
    const eventsHolder = { value: [] };
    const granularHolder = { value: [] };
    const timeline = reactive(usePredictiveTimeline({
      events: eventsHolder,
      shopGranularData: granularHolder,
      // spaceId requis par la source REST des timelines passées (point 2).
      spaceId: () => props.space?.id,
      // Stubs : la version Vue allégée n'expose pas les taxonomies. On
      // retombe sur les noms déjà présents sur l'event si dispo.
      getEventTypeName: () => undefined,
      getCategoryName: () => undefined,
      getSubcategoryName: () => undefined,
      // Trace debug déterministe calculée SEULEMENT quand le toggle est actif
      // (pas juste disponible) — sinon coût de re-scoring à chaque calcul.
      isDebug: () => debugPredictionAvailable.value && debugMode.value,
    }));
    return { t, versionsApi, timeline, eventsHolder, granularHolder, debugPredictionAvailable, debugMode };
  },
  data() {
    return {
      TOOLBOX_ITEMS,
      // Reflète l'état du rail Dashboard (déplié/replié) diffusé par
      // DashboardView → oriente le chevron du header (large = flèche gauche).
      navExpanded: false,
      // (debugMode a migré dans setup() : il pilote le coût des traces du
      // composable, pas seulement l'affichage.)
      loading: true,
      // Datasets lourds (granular REST, mappings Edge) en cours de chargement
      // en arrière-plan (finishHeavyLoad) → indicateur discret sous le header.
      heavyLoading: false,
      snackbar: false,
      snackbarText: "",
      snackbarColor: "success",
      // Durée + action contextuelle du snackbar (armés ponctuellement, ex.
      // nudge post-Save « prédiction impactée » → bouton Recharger). Reset par
      // le watcher `snackbar` à la fermeture pour ne pas fuir sur le suivant.
      snackbarTimeout: 3000,
      snackbarReloadAction: false,
      events: [],
      shopGranularData: [],
      menuItemCostMap: {},
      menuItems: [],
      ingredients: [],
      components: [],
      suppliers: [],
      selectedEventId: null,
      // Multi-sélection (cf. React §13.4) : tableau d'event ids cochés. Le
      // `selectedEventId` reste l'event "actif" dans la sélection (focus
      // versions/scoring/synthèse). Quand multiSelectIds.length > 1, la
      // synthèse financière agrège sur tous les events sélectionnés.
      multiSelectIds: [],
      // Past events the user opted-in for the prediction (subset of scored ones)
      excludedPastEventIds: new Set(),
      // Events HORS top 10 (écartés, hors classement, ad hoc) cochés à la main
      // dans le drawer : ajoutés à la sélection (poids manuel 30 % côté
      // composable si non scorés).
      manualIncludedPastEventIds: new Set(),
      // Affichage/repli de la liste des events de base au-dessus du graphique.
      // Ouvert par défaut : transparence du matching (on montre explicitement
      // quels events passés sont retenus pour la prédiction).
      // Détail des events passés ayant servi à la prédiction : REPLIÉ par
      // défaut (bouton « Voir » pour déplier). Évite de noyer la prévision sous
      // la liste des sources.
      // Drawer de sélection des events sources de la prédiction.
      showSourcesDrawer: false,
      predictSectionTab: "configuration", // 'configuration' | 'stockup'
      viewMode: "shop", // 'shop' | 'item'
      // Texte de recherche de l'autocomplete event (contrôlé pour vider le
      // filtre à l'ouverture → on voit TOUS les events, passés inclus).
      eventSearch: "",
      // Calendrier secondaire replié par défaut (sélection via l'autocomplete).
      calendarOpen: true,
      // Colonne gauche (sélecteur + versions) repliable pour élargir le centre.
      sideCollapsed: false,
      // Quantity adjustments per record (key: `${elementId}-${menuItemId}`, value: percent 0..200)
      quantityAdjustments: {},
      // Quantités ABSOLUES manuelles pour les couples (shop, item) dont la
      // prédiction = 0 (le pourcentage de quantityAdjustments × 0 = 0 → inutile).
      // Clé: `${elementId}-${menuItemId}` → unités. Persisté comme
      // quantityAdjustments (draft + version). N'altère PAS les prédictions.
      manualQuantities: {},
      // Configuration menu liftée du composant `EventPredictMenusSection`
      // (cf. React EventPredictView eventMenuConfig :132). Map<elementId,
      // string[]> représentant les menu items sélectionnés par shop.
      // - Object vide / absent pour un shop : fallback sur la dérivation
      //   automatique depuis `predictedRecords` (cf. effectiveMenuConfig).
      // - Object peuplé : "fige" la sélection (utile pour les versions
      //   sauvegardées et le calcul Stock up).
      eventMenuConfig: {},
      // Tick to force recompute when adjustments map mutates
      _adjustTick: 0,
      // Autosave brouillon : timer de debounce pour persister les ajustements
      // en ligne (non encore enregistrés dans une version) par event.
      _draftTimer: null,
      // Debounce du recompute prédiction après une édition LIVE (event-live).
      _liveRecomputeTimer: null,
      // Debounce des rechargements de timeline prédictive : plusieurs triggers
      // (watcher event + config + version) en cascade → un seul fetch.
      _timelineTimer: null,
      // Debounce du rechargement de la timeline prédictive quand l'utilisateur
      // (dé)coche des events passés sources → recalcule le CA pris en compte.
      _predictionReloadTimer: null,
      // Cross-filtering : filtre actif par clic sur un shop ou un article
      // dans EventPredictMenusSection. null = pas de filtre.
      crossFilterShop: null,
      crossFilterItem: null,
      // Plage horaire sélectionnée via clic sur la timeline (HH:MM → HH:MM).
      // Filtre informatif pour l'instant — affiché en chip pour signaler à
      // l'utilisateur qu'il a zoomé sur une fenêtre temporelle.
      selectedTimeRange: { start: null, end: null },
      // --- Version management snapshots (cf. React EventPredictView §10.4) ---
      // Snapshot par event de l'état "Events Library" initial — utilisé par
      // performReset() pour restaurer l'event tel qu'il a été chargé.
      // Object<eventId, Event>.
      originalEventStates: {},
      // Snapshot par event de la config menu "par défaut" (menuConfig +
      // quantityAdjustments) au moment où l'event est ouvert pour la 1re fois.
      // Object<eventId, { menuConfig:Object, quantityAdjustments:Object,
      //                   excludedPastEventIds:string[] }>.
      originalMenuConfigs: {},
      // Baseline de la version actuellement éditée (currentEditingVersionId)
      // pour détection des modifications non sauvegardées.
      originalVersionMenuConfig: {},
      originalVersionQuantityAdjustments: {},
      // Quantités manuelles (items à prédiction 0) au load de la version →
      // marque "dirty" si l'utilisateur les modifie (cf. bouton Update).
      originalVersionManualQuantities: {},
      originalVersionPredictionEventIds: [],
      // Snapshot complet de l'event au load de la version → permet de
      // détecter qu'un édit du nom / date / sessions de l'event marque la
      // version comme "dirty" et active le bouton Update.
      originalVersionEventSnapshot: null,
      // Plage horaire (slider timeline) au load de la version → marque "dirty"
      // si l'utilisateur la modifie.
      originalVersionTimeRange: { start: null, end: null },
      // Tracking auto-load : évite que la default version ne soit ré-appliquée
      // tant qu'on reste sur le même event (cf. React :1902-1927).
      autoLoadedEvents: new Set(),
      // Tick pour forcer le recompute de hasVersionChanges.
      _versionDirtyTick: 0,
      // Past-event timeline data fetched from backend (cf. React :584-615).
      // Stocké côté Vue séparé du predictedTimelineData (timeline future).
      pastTimelineData: [],
      pastTimelineLoading: false,
      // Référentiels nécessaires à EventDetailsEditor (cf. React :94-104).
      eventTypes: [],
      eventCategories: [],
      eventSubcategories: [],
      teams: [],
      // Mapping registry → noms/types/areas pour EventTimelineChart (cf. React
      // :101-104 + :430-525). Stockés comme Map (le composant TimelineChart
      // accepte Map ou Object).
      elementIdToShopNameMap: null, // Map<registryElementId, rawShopName>
      elementIdToTypesMap: null, // Map<registryElementId, string[]>
      elementIdToAreaMap: null, // Map<registryElementId, areaName>
      itemNameToMenuItemIdMap: null, // Map<itemName, menuItemId>
      // Réconciliation Lot 1 : assignation shop↔menu-item de la config courante,
      // lue via NestJS getShopMenus (/space-menu/shop/{id}, MÊME source que le
      // drawer Space Menu, flag `enabled`). Map<elementId, Set<menuItemId>>.
      shopMenuAssignment: null,
      // Mêmes assignations mais en OBJETS (id/name/basePrice/category) pour
      // afficher le menu réel indépendamment du catalogue espace.
      // Map<elementId, MenuItem[]>. null = pas encore chargée.
      shopMenuAssignmentItems: null,
      // Appartenance COMPLÈTE au Space Menu du shop (enabled+disabled) pour le
      // garde-fou d'ouverture. Map<normalizeStr(shopName), {ids:Set, names:Set}>.
      shopMenuMembership: null,
      // Cache par configId (évite re-fetch au changement d'event même config).
      _shopMenuAssignmentCache: null,
      // Cache local des shops NestJS par spaceId (stateless store, alimenté par fetchForSpace).
      _spaceShopsCache: {},
      // Passe à true après une tentative de chargement (distingue "pas chargé"
      // de "chargé vide" → arme le warning menuAssignmentMissing).
      _assignmentLoaded: false,
      // Lot 2 — popup de remapping (rattacher un élément vendu → menu item du shop).
      remapDlg: {
        open: false,
        saving: false,
        shopName: "",
        elementId: "",
        shopId: "",
        soldItem: null, // { id, name }
        targetId: null,
        candidates: [], // [{ id, name, basePrice }]
        supplierWarn: "",
      },
      // Dialog Vuetify universel (remplace window.prompt / window.confirm)
      dlg: {
        open: false,
        type: 'prompt', // 'prompt' | 'confirm'
        title: '',
        message: '',
        placeholder: '',
        value: '',
        confirmLabel: 'OK',
        _resolve: null,
      },
    };
  },
  computed: {
    // Taxonomie catalogue (store analyse) → résolution typeId/categoryId → nom
    // pour la classification Food/Beverage/Combo dans EventPredictMenusSection.
    productTypes() {
      return store.state.analyse?.productTypesList || [];
    },
    productCategories() {
      return store.state.analyse?.productCategoriesList || [];
    },
    // ---- Compte utilisateur du header (parité WorkspaceAppHeader) ----
    headerUser() {
      return this.$store.getters['auth/user'] || this.$store.state.auth?.user || null;
    },
    headerUserName() {
      return this.headerUser?.user_metadata?.full_name || this.headerUser?.email || 'Utilisateur';
    },
    headerUserEmail() {
      return this.headerUser?.email || '';
    },
    headerUserInitials() {
      const n = this.headerUserName || 'U';
      return n.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
    },
    // ---- Plan de chargement séquencé (calculs parallèles, affichage ordonné) ----
    /** Section 3 prête : timeline calculée (CA prédit affichable). */
    predictedReady() {
      if (this.isPastSelectedEvent) return true;
      return !this.timeline.timelineLoading && this.timeline.hasCalculated;
    },
    /** Section 4 prête : Space Menu chargé ET timeline calculée → l'Adjusted
     *  (dérivé des deux) est complet. Skeleton sinon — jamais de valeur à
     *  moitié prête. */
    adjustedReady() {
      return this.predictedReady && this._assignmentLoaded;
    },
    // Outils visibles selon les permissions RBAC du rôle (ADMIN voit tout).
    visibleToolboxItems() {
      const can = this.$store.getters['auth/can'];
      const allowed = (perm) => !perm || (Array.isArray(perm) ? perm.some(can) : can(perm));
      return TOOLBOX_ITEMS
        .filter((tool) => allowed(tool.permission))
        .map((tool) => ({ ...tool, label: this.t(tool.labelKey) }));
    },
    today() {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    },
    futureEvents() {
      return this.events
        .filter((ev) => {
          const d = parseDDMMYYYY(ev.eventDate);
          return d && d.getTime() >= this.today.getTime();
        })
        .sort((a, b) => {
          const da = parseDDMMYYYY(a.eventDate)?.getTime() || 0;
          const db = parseDDMMYYYY(b.eventDate)?.getTime() || 0;
          return da - db;
        });
    },
    // Liste des timestamps des dates futures (pour allowedDates du calendrier)
    futureDateValues() {
      return this.futureEvents
        .map((e) => parseDDMMYYYY(e.eventDate))
        .filter(Boolean);
    },
    /**
     * Options du sélecteur `v-autocomplete` (recherche + suggestions + liste
     * déroulante). Tous les events, futurs d'abord (cas principal d'EventPredict
     * = créer une prédiction pour un évènement à venir) puis passés. `label`
     * concatène nom + date pour que la recherche texte matche les deux.
     */
    eventOptions() {
      const todayTs = this.today.getTime();
      return this.events
        .map((ev) => {
          const d = parseDDMMYYYY(ev.eventDate);
          return {
            id: ev.id,
            eventName: ev.eventName || ev.name || "Évènement",
            eventDate: ev.eventDate || "",
            showTime: ev.sessions?.[0]?.showTime || "",
            isPast: d ? d.getTime() < todayTs : false,
            label: `${ev.eventName || ev.name || ""} ${ev.eventDate || ""}`.trim(),
          };
        })
        .sort((a, b) => {
          if (a.isPast !== b.isPast) return a.isPast ? 1 : -1;
          const da = parseDDMMYYYY(a.eventDate)?.getTime() || 0;
          const db = parseDDMMYYYY(b.eventDate)?.getTime() || 0;
          return a.isPast ? db - da : da - db;
        });
    },
    /** Options du sélecteur empty-state : uniquement les events passés (bases). */
    pastEventOptions() {
      return this.eventOptions.filter((o) => o.isPast);
    },
    /**
     * Options des sélecteurs (sidebar + empty-state) : uniquement les events À
     * VENIR. EventPredict ne prédit que des évènements futurs ; les passés
     * alimentent le scoring interne, ils ne sont plus choisissables comme cible.
     */
    futureEventOptions() {
      return this.eventOptions.filter((o) => !o.isPast);
    },
    /** Date (objet Date) de l'event sélectionné, pour le calendrier secondaire. */
    selectedDate() {
      const ev = this.selectedEvent;
      return ev ? parseDDMMYYYY(ev.eventDate) || null : null;
    },
    /**
     * Dates (objets Date) des évènements PASSÉS réellement utilisés pour la
     * prédiction (= activeScoredEvents). Sert à les surligner dans le calendrier
     * d'affichage (lecture seule, mode `multiple`).
     */
    usedEventDates() {
      return this.activeScoredEvents
        .map((s) => parseDDMMYYYY(s.event.eventDate))
        .filter(Boolean);
    },
    /**
     * True si AU MOINS un event du space porte une billetterie (ticketsSold ou
     * ticketsScanned). Sinon on masque tout le « côté ticket » (carte
     * Attendance + pill scanned + ligne mini-card) — inutile pour ce space.
     */
    anyEventHasTickets() {
      return (this.events || []).some(
        (e) =>
          Number(e?.ticketsSold) > 0 || Number(e?.ticketsScanned) > 0,
      );
    },
    /**
     * True si AU MOINS un event du space a un showTime (session non vide).
     * Sinon on masque tout le « côté show time » (carte Times + pill +
     * ligne mini-card) — même logique que les tickets.
     */
    anyEventHasShowTime() {
      return (this.events || []).some((e) => {
        const s = Array.isArray(e?.sessions) ? e.sessions : [];
        return s.some((x) => x && x.showTime);
      });
    },
    /** Show time réellement présent en base pour l'event sélectionné. */
    hasShowTimeData() {
      const st = this.selectedEvent?.sessions?.[0]?.showTime;
      return st != null && st !== "";
    },
    /** Tickets scanned réellement présents en base (null/undefined → masqué). */
    hasTicketsScannedData() {
      const t = this.selectedEvent?.ticketsScanned;
      return t != null && t !== "";
    },
    /** Nom de la version en cours d'édition (pour le badge "Version active"). */
    editingVersionName() {
      const id = this.currentEditingVersionId;
      if (!id) return "";
      const v = (this.versions || []).find((x) => x.id === id);
      return v?.name || "";
    },
    /**
     * Map prix RÉELS depuis les produits Weezevent (store, chargés au load du
     * space). Clé = id produit (= weezeventProductId de la timeline), + alias
     * weezeventId + nom (lowercase) → basePrice. Utilisé par
     * EventPredictMenusSection pour afficher le vrai prix (et non rev/qté).
     */
    weezeventProductPriceMap() {
      // LEVIER UNIQUE HT : `basePrice` Weezevent est du TTC → on le détaxe ICI
      // (seul point d'entrée du prix Weezevent) via `vatRate`. Tout le chemin
      // aval (CA prédit/ajusté, marge, per-capita, snapshot version → Restock)
      // hérite du HT sans re-conversion. Ne JAMAIS re-détaxer en aval.
      // Cf. docs/HT_TTC_PREDICT.md + src/utils/price.js.
      const out = {};
      const list = store.state.analyse?.weezeventProducts || [];
      for (const p of list) {
        if (!p) continue;
        const price = htFromTtc(p.basePrice, p.vatRate); // TTC → HT (garde-fou taux)
        if (price == null || !Number.isFinite(price)) continue;
        if (p.id) out[String(p.id)] = price;
        if (p.weezeventId) out[String(p.weezeventId)] = price;
        if (p.name) out[String(p.name).toLowerCase()] = price;
      }
      return out;
    },
    /**
     * Map COÛT unitaire par produit Weezevent : weezeventProductId →
     * MenuItem.totalCost (via WeezeventProductMapping). Permet de calculer
     * Cost + Margin sur les items synthétiques (Weezevent non mappés au catalogue
     * directement, mais reliés par la table de mapping).
     */
    /**
     * Costmap RÉACTIVE passée aux sections Menus/StockUp. `this.menuItemCostMap`
     * est un snapshot pris une fois dans loadAll : s'il est capturé avant la fin
     * de la phase 2 (background) de loadSpace, il reste vide pour toute la
     * session → cost/margin intermittents. On merge donc avec le store (qui, lui,
     * reçoit le commit phase 2) ; le snapshot local garde la priorité.
     */
    effectiveMenuItemCostMap() {
      return {
        ...(store.state.analyse?.menuItemCostMap || {}),
        ...(this.menuItemCostMap || {}),
      };
    },
    weezeventProductCostMap() {
      const mappings = store.state.analyse?.weezeventProductMappings || [];
      const mis = store.state.analyse?.menuItems || this.menuItems || [];
      const costMap = store.state.analyse?.menuItemCostMap || this.menuItemCostMap || {};
      const byId = new Map();
      for (const mi of mis) if (mi?.id) byId.set(String(mi.id), mi);
      const out = {};
      for (const m of mappings) {
        const wpid = m.weezeventProductId;
        const miId = m.menuItemId;
        if (!wpid || !miId) continue;
        const mi = byId.get(String(miId));
        let cost = null;
        if (mi && mi.totalCost != null) cost = Number(mi.totalCost);
        else if (mi && mi.cost != null) cost = Number(mi.cost);
        else if (costMap[miId] != null) cost = Number(costMap[miId]);
        if (cost != null && Number.isFinite(cost)) out[String(wpid)] = cost;
      }
      return out;
    },
    /**
     * Timeline alimentant la section Configuration (ajustement ventes shop /
     * menu item) + Stock up. Event futur → timeline prédictive ; event passé →
     * timeline réelle. Permet d'ajuster les ventes quel que soit l'event.
     */
    activeTimelineData() {
      return this.isPastSelectedEvent
        ? (this.pastTimelineData || [])
        : (this.timeline?.predictedTimelineData || []);
    },
    /**
     * Event passé à EventDetailsEditor. EventPredict prédit désormais un event
     * FUTUR DIRECTEMENT (plus de clonage depuis un event passé). On édite donc
     * l'event sélectionné EN PLACE — id CONSERVÉ → le Save de l'éditeur fait un
     * UPDATE (PATCH), jamais un create. Évite la duplication d'events à chaque
     * Save. Les prédictions / ajustements sont enregistrés séparément en
     * VERSIONS (boutons Save / Update de la sidebar).
     */
    predictEditorEvent() {
      const ev = this.selectedEvent;
      if (!ev) return null;
      return { ...ev };
    },
    // Sélection courante du calendrier (Date[] en mode upcoming, Date en past)
    multiSelectDates: {
      get() {
        if (this.sidebarEventTab === "past") {
          // Mode simple : retourne juste la date de l'event sélectionné.
          const ev = this.events.find((e) => e.id === this.selectedEventId);
          return ev ? parseDDMMYYYY(ev.eventDate) || null : null;
        }
        return this.multiSelectIds
          .map((id) => {
            const ev = this.events.find((e) => e.id === id);
            return ev ? parseDDMMYYYY(ev.eventDate) : null;
          })
          .filter(Boolean);
      },
      set(dates) {
        // setter no-op : la mutation passe par onCalendarChange (handler explicite)
        // pour pouvoir mapper dates → eventIds.
        void dates;
      },
    },
    pastEvents() {
      return this.events
        .filter((ev) => {
          const d = parseDDMMYYYY(ev.eventDate);
          return d && d.getTime() < this.today.getTime();
        })
        .sort((a, b) => {
          // DESC : plus récent en premier
          const da = parseDDMMYYYY(a.eventDate)?.getTime() || 0;
          const db = parseDDMMYYYY(b.eventDate)?.getTime() || 0;
          return db - da;
        });
    },
    /** Tous les events (sélecteur unifié — plus de toggle Upcoming/Past). */
    sidebarEvents() {
      return this.events;
    },
    /** Dates timestamps pour `allowed-dates` du calendrier (tous events). */
    sidebarDateValues() {
      return this.sidebarEvents
        .map((e) => parseDDMMYYYY(e.eventDate))
        .filter(Boolean);
    },
    selectedEvent() {
      return this.events.find((e) => e.id === this.selectedEventId) || null;
    },
    /** Liste plate des configurations du space (depuis le store analyse). */
    configurations() {
      return store.state.analyse?.configurations || [];
    },
    /**
     * Indique si les données chargées viennent du mock Adidas Arena (et
     * non d'une API live). Utilisé pour :
     *  - skip l'appel API updateEvent dans EventDetailsEditor
     *  - générer pastTimelineData depuis shopGranularData local
     *  - éviter les appels Supabase KV qui crashent en mock
     */
    fromMock() {
      return !!store.state.analyse?.fromMock;
    },
    /** True si l'event sélectionné a une date >= aujourd'hui (cf. React :554-556). */
    isFutureSelectedEvent() {
      const ev = this.selectedEvent;
      if (!ev) return false;
      const d = parseDDMMYYYY(ev.eventDate);
      if (!d) return false;
      return d.getTime() >= this.today.getTime();
    },
    /** True si l'event sélectionné est dans le passé. */
    isPastSelectedEvent() {
      const ev = this.selectedEvent;
      if (!ev) return false;
      return !this.isFutureSelectedEvent;
    },
    /** Libellé cible pour la fenêtre terminal : "Nom · Type · Catégorie · Sous-cat"
     *  (n'utilise que des champs string sûrs présents sur l'event). */
    algoTraceTargetLabel() {
      const ev = this.selectedEvent;
      if (!ev) return '';
      const name = ev.eventName || ev.name || '';
      const meta = [ev.eventType, ev.category, ev.subcategory].filter(
        (x) => typeof x === 'string' && x.trim(),
      );
      return meta.length ? `${name} · ${meta.join(' · ')}` : name;
    },
    /**
     * Configuration rattachée à l'event sélectionné. Résolue d'abord depuis
     * le store analyse (`state.analyse.configurations`), avec fallback sur
     * `selectedEvent.configuration` si jamais le store n'est pas chargé
     * (cas API live sans passage préalable par AnalyseView).
     */
    selectedEventConfiguration() {
      const ev = this.selectedEvent;
      if (!ev) return null;
      const cfgId = ev.configurationId;
      const storeCfgs = store.state.analyse?.configurations || [];
      if (cfgId) {
        const found = storeCfgs.find((c) => c.id === cfgId);
        if (found) return found;
        // Store chargé mais id ABSENT = config supprimée (hard-delete backend).
        // On NE ressuscite PAS l'objet `ev.configuration` embarqué (afficherait
        // une config morte). Filet embarqué UNIQUEMENT si la liste n'est pas
        // encore chargée (EventPredict live, sans passage par AnalyseView).
        return storeCfgs.length ? null : (ev.configuration || null);
      }
      return storeCfgs.length ? null : (ev.configuration || null);
    },
    /**
     * Map `nomShop (lowercased) → isOpen` pour les shops de la config de
     * l'event, sourcée depuis `/spaces/:id/shops` (`isOpen` = menuItemsCount>0),
     * filtrée sur `event.configurationId`.
     * Clé = NOM (pas l'id d'élément) : l'API /configurations ne renvoie PAS le
     * layout `.data`, donc matcher par id est impossible. Le NOM est stable
     * entre /shops et les fbElements du child (config OU synthetic). `{}` en
     * mock / sans data → le child retombe sur l'heuristique legacy.
     */
    isOpenByShop() {
      const spaceId = this.space?.id;
      if (!spaceId || this.fromMock) return {};
      const rows = this._spaceShopsCache[spaceId] || [];
      if (!rows.length) return {};
      const cfgId = this.selectedEvent?.configurationId || null;
      const scoped = cfgId
        ? rows.filter((r) => (r?.configId ?? r?._raw?.configId) === cfgId)
        : rows;
      const out = {};
      for (const r of scoped) {
        const name = String(r?.name || "").trim().toLowerCase();
        if (!name) continue;
        out[name] = r?.isOpen === true || Number(r?.menuItemsCount) > 0;
      }
      return out;
    },
    /**
     * False = la config de l'event n'a AUCUN point de vente (shop) assigné
     * (`/shops` filtré par config = 0 ligne) → MenusSection affiche un message
     * + lien Space Menus au lieu de shops synthétiques. `true` par défaut
     * (mock / pas de données /shops) pour ne rien bloquer.
     */
    configHasShops() {
      if (this.fromMock) return true;
      const spaceId = this.space?.id;
      if (!spaceId) return true;
      const rows = this._spaceShopsCache[spaceId] || [];
      if (!rows.length) return true;
      const cfgId = this.selectedEvent?.configurationId || null;
      if (!cfgId) return true;
      return rows.some((r) => (r?.configId ?? r?._raw?.configId) === cfgId);
    },
    /**
     * Shops RÉELS de la config de l'event, sourcés depuis `/spaces/:id/shops`
     * (store spaceShops), filtrés sur `event.configurationId`. Forme élément
     * consommée par MenusSection.fbElements ({id,name,type,attributes,...}).
     *
     * Pourquoi : `/configurations` (liste) ne renvoie PAS `.data.floors` (layout),
     * donc MenusSection retombait sur des shops synthétiques dérivés de la timeline
     * — vides/maigres pour un event FUTUR (aucune vente). Les rows /shops portent
     * le vrai `id` (=== elementId config → assignation menu valide), `isOpen` et le
     * bon `configId`, donc TOUS les shops de la config s'affichent. `[]` en mock /
     * sans données → MenusSection garde son fallback synthetic.
     */
    configShopElements() {
      const spaceId = this.space?.id;
      if (!spaceId || this.fromMock) return [];
      const rows = this._spaceShopsCache[spaceId] || [];
      if (!rows.length) return [];
      const cfgId = this.selectedEvent?.configurationId || null;
      const scoped = cfgId
        ? rows.filter((r) => (r?.configId ?? r?._raw?.configId) === cfgId)
        : rows;
      return scoped.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type || "shop",
        shopTypes: r.shopTypes,
        attributes: r.attributes,
        image: r.image,
        notes: r.notes,
        locationId: r.locationId,
        locationName: r.locationName,
        floorLevel: r.floorLevel,
        isOpen: r.isOpen,
        menuItemsCount: r.menuItemsCount,
      }));
    },
    /** Tenant courant (organisation) pour l'en-tête de la popup remap. */
    tenantId() {
      try {
        return store.getters["auth/tenantId"] || "";
      } catch (_) {
        return "";
      }
    },
    /** Index `menuItemId → objet menu item` (catalogue espace). */
    menuItemById() {
      const out = new Map();
      for (const mi of this.menuItems || []) {
        if (mi?.id) out.set(mi.id, mi);
      }
      return out;
    },
    /**
     * `record.elementId → nom de shop config normalisé`. Pont vers l'assignation
     * (keyée par nom) : un record prédit porte `elementId` (= id élément config),
     * mais son `shopName` peut différer du nom config. On résout via le NOM de
     * l'élément config — le MÊME que MenusSection utilise (element.name).
     */
    configElementNormNameById() {
      const out = new Map();
      const cfg = this.selectedEventConfiguration;
      const data = cfg?.data || cfg;
      const add = (arr) =>
        (arr || []).forEach((el) => {
          if (el?.id) out.set(el.id, normalizeStr(el.name));
        });
      if (data) {
        (data.floors || []).forEach((f) => add(f.elements));
        add(data.forecourt?.elements);
        add(data.externalMerch?.elements);
      }
      return out;
    },
    /** Index `id → objet item assigné` (depuis NestJS getShopMenus). Porte
     *  nom/prix même si l'item n'est pas au catalogue espace. */
    assignmentItemById() {
      const m = new Map();
      const items = this.shopMenuAssignmentItems;
      if (items instanceof Map)
        items.forEach((arr) =>
          arr.forEach((it) => {
            if (it?.id) m.set(it.id, it);
          }),
        );
      return m;
    },
    /**
     * Index `nom vendu normalisé → menuItemId` depuis les menu-item-mappings
     * (itemNameToMenuItemIdMap = fnbItem → menuItemId, construit par
     * buildShopMappings @3697). Sert le fallback nom quand le libellé prédit
     * diffère du nom du menu item mais possède un mapping explicite.
     */
    normFnbToMenuItemId() {
      const out = new Map();
      const src = this.itemNameToMenuItemIdMap;
      if (src instanceof Map) {
        src.forEach((mid, fnb) => {
          const n = normalizeStr(fnb);
          if (n) out.set(n, mid);
        });
      }
      return out;
    },
    /**
     * Records prédits réconciliés aux menu items réellement assignés aux shops
     * de la configuration sélectionnée (Lot 1). Chaque record reçoit :
     *  - `mapStatus` : 'mapped' | 'remapped' | 'unmapped' | 'nodata'
     *  - `reconciledMenuItemId` : id à utiliser en aval (corrigé si 'remapped').
     * 'nodata' = aucune assignation chargée (globale ou pour ce shop) → AUCUN
     * filtrage (anti-régression : on garde le comportement historique tant que
     * l'attribution shop↔item n'existe pas côté données ; le warning informe).
     */
    reconciledRecords() {
      const records = this.predictedRecords || [];
      const assignment = this.shopMenuAssignment;
      const hasAssignment = assignment instanceof Map && assignment.size > 0;
      if (!hasAssignment) {
        return records.map((r) =>
          r ? { ...r, mapStatus: 'nodata', reconciledMenuItemId: r.menuItemId } : r,
        );
      }
      const byId = this.menuItemById;
      const assignById = this.assignmentItemById;
      const normFnb = this.normFnbToMenuItemId;
      const elemNormName = this.configElementNormNameById;
      let sawUnmapped = false;
      const out = records.map((r) => {
        if (!r) return r;
        // `shopKey` = NOM de shop normalisé : clé UNIVERSELLE (assignation +
        // mapStatus + non-rattachés), résolue par MenusSection via element.name.
        // Préférence : nom élément config (si layout chargé) → shopName → elementName.
        const shopKey =
          elemNormName.get(r.elementId) ||
          normalizeStr(r.shopName) ||
          normalizeStr(r.elementName);
        const set =
          assignment.get(shopKey) ||
          assignment.get(normalizeStr(r.shopName)) ||
          assignment.get(normalizeStr(r.elementName));
        if (!set || set.size === 0) {
          // Shop sans assignation propre → ne pas masquer ses quantités.
          return { ...r, mapStatus: 'nodata', reconciledMenuItemId: r.menuItemId, shopKey };
        }
        if (r.menuItemId && set.has(r.menuItemId)) {
          return { ...r, mapStatus: 'mapped', reconciledMenuItemId: r.menuItemId, shopKey };
        }
        // 1) mapping nom→id explicite (menu-item-mappings) si l'id ∈ shop assigné.
        const norm = normalizeStr(r.menuItemName);
        if (norm) {
          const mappedId = normFnb.get(norm);
          if (mappedId && set.has(mappedId)) {
            return { ...r, mapStatus: 'remapped', reconciledMenuItemId: mappedId, shopKey };
          }
        }
        // 2) matcher nom (findBestMatch, MÊME algo que /data-integration/fb) contre
        //    les items RÉELLEMENT assignés au shop. Prix omis volontairement (évite
        //    les rejets dus au mélange HT/TTC ; cf. mémoire ht-ttc-predict-analyse).
        const candidates = [];
        set.forEach((mid) => {
          const mi = assignById.get(mid) || byId.get(mid);
          if (mi) candidates.push(mi);
        });
        const best = findBestMatch({ name: r.menuItemName, basePrice: null }, candidates);
        if (best && (best.matchScore || 0) >= 70) {
          return {
            ...r,
            mapStatus: best.id === r.menuItemId ? 'mapped' : 'remapped',
            reconciledMenuItemId: best.id,
            shopKey,
          };
        }
        sawUnmapped = true;
        // eslint-disable-next-line no-console
        console.warn(
          `[EVENT PREDICT] item prédit sans correspondance dans le shop : ` +
            `"${r.menuItemName}" (${r.shopName || r.elementId})`,
        );
        return { ...r, mapStatus: 'unmapped', reconciledMenuItemId: r.menuItemId, shopKey };
      });
      void sawUnmapped;
      return out;
    },
    /**
     * Statut de réconciliation par shop → item (pour les badges MenusSection).
     * `{ [elementId]: { [menuItemId]: 'mapped'|'remapped'|'unmapped' } }`.
     * Les 'nodata' sont omis (pas d'information d'assignation → pas de badge).
     */
    menuItemMapStatusByShop() {
      const out = {};
      for (const r of this.reconciledRecords || []) {
        if (!r || !r.shopKey || r.mapStatus === 'nodata') continue;
        const mid = r.reconciledMenuItemId || r.menuItemId;
        if (!mid) continue;
        (out[r.shopKey] || (out[r.shopKey] = {}))[mid] = r.mapStatus;
      }
      return out;
    },
    /**
     * `true` quand l'assignation a été tentée (config présente, hors mock) mais
     * qu'AUCUN menu item n'est attribué aux shops de la config → warning visible
     * dans MenusSection. cf. mémoire two-backends-space-menu.
     */
    menuAssignmentMissing() {
      if (this.fromMock) return false;
      if (!this.selectedEvent?.configurationId) return false;
      if (!this._assignmentLoaded) return false;
      const a = this.shopMenuAssignment;
      return !(a instanceof Map) || a.size === 0;
    },
    /**
     * Contexte des LISTES d'articles des sections (Configuration + Stock up),
     * pour distinguer clairement 5 états au lieu du seul « fbElements vide ».
     * Priorité descendante (première vraie gagne) :
     *  - 'loading'        : données/scoring en cours → JAMAIS de message vide.
     *  - 'no-config'      : config absente ou sans point de vente.
     *  - 'no-mapping'     : PdV présents mais aucun menu item assigné.
     *  - 'not-calculated' : event futur dont la prédiction n'est pas encore prête.
     *  - 'ready'          : la section affiche sa liste (message « vide » seulement
     *                       si la liste est réellement vide).
     * Consommé par les 2 sections via `:items-context`.
     */
    predictionItemsContext() {
      if (
        this.loading ||
        this.heavyLoading ||
        this.timeline?.timelineLoading ||
        (this.isPastSelectedEvent && this.pastTimelineLoading)
      ) {
        return "loading";
      }
      if (!this.configHasShops || !this.selectedEventConfiguration) {
        return "no-config";
      }
      if (this.menuAssignmentMissing) {
        return "no-mapping";
      }
      if (!this.isPastSelectedEvent && !(this.activeTimelineData || []).length) {
        return "not-calculated";
      }
      return "ready";
    },
    /**
     * Assignation sérialisée `Object<elementId, string[]>` pour MenusSection :
     * la liste affichée par shop sera contrainte à ces menuItemId (menu RÉEL),
     * au lieu du catalogue filtré par type. Vide → MenusSection garde son
     * comportement catalogue (anti-régression).
     */
    shopMenuAssignmentForSection() {
      const out = {};
      const a = this.shopMenuAssignment;
      if (a instanceof Map) a.forEach((set, elementId) => {
        out[elementId] = Array.from(set);
      });
      return out;
    },
    /** Items assignés par shop (OBJETS) pour MenusSection — affichage du menu
     *  réel indépendant du catalogue. Object<elementId, MenuItem[]>. */
    shopMenuAssignmentItemsForSection() {
      const out = {};
      const a = this.shopMenuAssignmentItems;
      if (a instanceof Map) a.forEach((items, elementId) => {
        out[elementId] = items;
      });
      return out;
    },
    /**
     * Items prédits SANS correspondance dans le menu assigné, par shop, pour la
     * section repliable « Non rattachés » de MenusSection.
     * `Object<elementId, [{ id, name, category, basePrice, isAvailable:false }]>`.
     */
    unmappedItemsByShop() {
      const out = {};
      const byId = this.menuItemById;
      for (const r of this.reconciledRecords || []) {
        if (!r || r.mapStatus !== 'unmapped' || !r.shopKey) continue;
        const mid = r.menuItemId;
        if (!mid) continue;
        // Skip records sans libellé exploitable (ex. menuItemName null).
        const nm = r.menuItemName;
        if (!nm || nm === 'null') continue;
        const arr = out[r.shopKey] || (out[r.shopKey] = []);
        if (arr.some((x) => x.id === mid)) continue;
        const cat = byId.get(mid);
        arr.push({
          id: mid,
          name: r.menuItemName || (cat && cat.name) || String(mid),
          category: r.menuItemCategory || (cat && cat.category) || '',
          basePrice: cat ? cat.basePrice : undefined,
          isAvailable: false,
          _predicted: true,
        });
      }
      return out;
    },
    /**
     * Sélection menu items par shop dérivée des `reconciledRecords` (fallback
     * quand `eventMenuConfig` est vide pour un shop). On utilise le
     * `reconciledMenuItemId` (corrigé pour les records 'remapped') et on conserve
     * TOUS les records non-nuls (y compris 'unmapped') pour ne jamais masquer une
     * quantité — l'état 'unmapped' est signalé via badge, pas par suppression.
     */
    derivedMenuConfigFromRecords() {
      // Défaut des cases cochées (event SANS version sauvegardée). Règle métier :
      // coché = article ATTACHÉ au Space Menu du shop = assigné ET activé
      // (enabled). Un shop dont tous les items sont désactivés (ex. Auxerre 1B :
      // 40 assignés / 0 enabled) → 0 coché ; ses ventes prédites restent dans le
      // CA BRUT mais hors CA AJUSTÉ tant qu'on ne coche pas manuellement.
      // `shopMenuAssignment` (Map<shopNorm, Set<enabledId>>) est réactif : recalc
      // dès que l'assignation NestJS a chargé.
      const assign = this.shopMenuAssignment;
      if (assign instanceof Map && assign.size > 0) {
        const out = {};
        const seed = (elementId, name) => {
          const ids = assign.get(normalizeStr(name));
          if (ids && ids.size) out[elementId] = [...ids];
        };
        // Résout shopNorm → elementId via les shops RÉELS de la config (/shops :
        // r.id === elementId config, même clé que fbElements du child).
        for (const el of this.configShopElements) seed(el.id, el.name);
        // Repli layout config (event futur sans row /shops mais data.floors présent).
        if (!Object.keys(out).length) {
          for (const [elementId, shopNorm] of this.configElementNormNameById) {
            const ids = assign.get(shopNorm);
            if (ids && ids.size) out[elementId] = [...ids];
          }
        }
        return out;
      }
      // Feature Space Menu inactive (aucune assignation dans la config) → repli
      // legacy : cocher les articles réellement prédits (qté > 0).
      const out = {};
      for (const r of this.reconciledRecords || []) {
        if (!r || !r.elementId) continue;
        const mid = r.reconciledMenuItemId || r.menuItemId;
        if (!mid) continue;
        if ((r.quantity || 0) <= 0) continue;
        const arr = out[r.elementId] || (out[r.elementId] = []);
        if (!arr.includes(mid)) arr.push(mid);
      }
      return out;
    },
    /**
     * `eventMenuConfig` "effectif" passé au reste du composant (Stock up,
     * snapshot version). Logique extraite dans `mergeEffectiveMenuConfig`
     * (src/utils/menuConfigSelection.js) : testable sans importer ce SFC
     * (EventPredictView.vue traîne axios via ses imports API, incompatible
     * Jest en l'état — cf. docs/PLAN_EVENTPREDICT_SPACE_MENU_SELECTION.md).
     */
    effectiveMenuConfig() {
      return mergeEffectiveMenuConfig(this.eventMenuConfig, this.derivedMenuConfigFromRecords);
    },
    /** Alias historique passé à `<EventPredictStockUpSection>`. */
    selectedMenuItemsByShop() {
      return this.effectiveMenuConfig;
    },
    /**
     * Clés d'alias `${shop}|${item}` des couples (shop, article) COCHÉS
     * (`effectiveMenuConfig`). Gate unique du CA AJUSTÉ global (timelineRevenueTotals
     * + adjustedRecords). Réactif : recalcule à chaque coche/décoche. Chaque couple
     * expose 2 alias shop (elementId, nom normalisé) × 2 alias item (menuItemId, nom
     * minuscule) car la timeline et la sélection ne partagent pas toujours les mêmes
     * ids (cross-config) — mêmes alias que ceux comparés dans timelineRevenueTotals.
     */
    /**
     * Shops FERMÉS de la config, clé = nom normalisé (= `a.shopNorm` de la
     * timeline). Fermé = `isOpen` faux ET aucun article activé (menuItemsCount 0),
     * ex. Auxerre 1B/3ABC. Sert à EXCLURE ces PDV du CA (brut + ajusté) : on ne
     * vend pas sur un shop fermé. Cohérent avec le gate `isShopOpen` du child.
     */
    closedShopNormSet() {
      const s = new Set();
      for (const el of this.configShopElements) {
        const open = el.isOpen === true || Number(el.menuItemsCount) > 0;
        if (!open && el.name) s.add(normalizeStr(el.name));
      }
      return s;
    },
    selectedKeySet() {
      const cfg = this.effectiveMenuConfig || {};
      const elNorm = this.configElementNormNameById;
      const miById = this.menuItemById;
      const set = new Set();
      for (const elementId of Object.keys(cfg)) {
        const shopNorm = elNorm.get(elementId) || null;
        const shops = [elementId, shopNorm].filter(Boolean);
        for (const miId of cfg[elementId] || []) {
          const mi = miById.get(miId);
          const nameLower = mi && mi.name ? String(mi.name).toLowerCase() : null;
          const items = [miId, nameLower].filter(Boolean);
          for (const s of shops) for (const i of items) set.add(`${s}|${i}`);
        }
      }
      return set;
    },
    /**
     * Dataset pré-traité minute-level (cf. React
     * `predictiveAnalyticsTimeline.ts` §1.3). 1 point par minute, agrégé
     * toutes shops & items confondus, enrichi cost / margin / basket.
     * Source canonique pour les mini-charts et les futures consommations
     * (export, comparateur de versions, etc.) — évite de recalculer la
     * pipeline à chaque consommateur.
     */
    preprocessedTimelinePerMinute() {
      return aggregateTimelinePerMinute(
        this.timeline?.predictedTimelineData || [],
        { menuItemCostMap: this.menuItemCostMap || {} },
      );
    },
    /**
     * Agrégation minute-level de la timeline prédictive — mini-courbe
     * revenu/temps. L'axe reste léger côté Chart.js, mais les données sources
     * restent fiables à 1 minute pour les filtres et ratios.
     */
    timelineByMinute() {
      const data = this.timeline?.predictedTimelineData || [];
      if (!data.length) return [];
      return aggregateTimelinePerMinute(data).map((p) => ({
        minute: p.minute,
        revenue: p.totalRevenue,
        qty: p.totalQuantity,
      }));
    },
    timelineTotalRevenue() {
      return (this.timeline?.predictedTimelineData || []).reduce(
        (s, r) => s + (r.totalRevenue || 0),
        0,
      );
    },
    /** Hauteur normalis\u00e9e (0..1) par minute pour la mini-courbe SVG. */
    timelineSparkPath() {
      const arr = this.timelineByMinute;
      if (arr.length < 2) return "";
      const max = Math.max(...arr.map((p) => p.revenue)) || 1;
      const w = 100;
      const h = 30;
      return arr
        .map((p, i) => {
          const x = (i / (arr.length - 1)) * w;
          const y = h - (p.revenue / max) * h;
          return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
    },
    scoredPastEvents() {
      if (!this.selectedEvent) return [];
      return findAndScorePastEvents(
        this.selectedEvent,
        this.pastEvents,
        this.shopGranularData,
      ).slice(0, 10);
    },
    selectedPastEventIds() {
      // start from all top-10 scored events, minus the user-excluded ones,
      // plus les events cochés à la main dans le drawer (hors top 10).
      const ids = new Set(this.scoredPastEvents.map((s) => s.event.id));
      this.excludedPastEventIds.forEach((id) => ids.delete(id));
      this.manualIncludedPastEventIds.forEach((id) => ids.add(id));
      return ids;
    },
    /**
     * Candidats NON sélectionnés pour le drawer : hors top 10 (score plus bas),
     * écartés par l'algo (même sous-catégorie/catégorie, poids manuel 30 %),
     * ad hoc (exclus du scoring automatique). Dédupliqués, top 10 exclu.
     * Cochables à la main → réintégrés via overridePredictionIds.
     */
    drawerUnselectedEvents() {
      const seen = new Set(this.scoredPastEvents.map((s) => s.event.id));
      const out = [];
      const push = (se, reason) => {
        const id = se?.event?.id;
        if (!id || seen.has(id)) return;
        seen.add(id);
        out.push({ ...se, reason });
      };
      for (const se of this.timeline.candidateEvents || []) {
        push(se, `Hors top 10 — score plus bas (${se.score}/${se.maxPossibleScore})`);
      }
      for (const se of this.timeline.excludedSameSubcategoryEvents || []) {
        push(se, "Écarté par l'algo — même sous-catégorie (poids manuel 30 %)");
      }
      for (const se of this.timeline.excludedSameCategoryEvents || []) {
        push(se, "Écarté par l'algo — même catégorie (poids manuel 30 %)");
      }
      // Ad hoc : jamais scorés automatiquement, sélectionnables à la main.
      for (const e of this.pastEvents || []) {
        if (!isAdhocEvent(e)) continue;
        push(
          { event: e, score: 0, maxPossibleScore: 0, scorePercentage: 0, breakdown: {} },
          'Ad hoc — exclu du scoring automatique',
        );
      }
      return out;
    },
    activeScoredEvents() {
      return this.scoredPastEvents.filter((s) =>
        this.selectedPastEventIds.has(s.event.id),
      );
    },
    totalActiveScore() {
      return this.activeScoredEvents.reduce((s, m) => s + m.score, 0);
    },
    usedPastEvents() {
      return this.activeScoredEvents.map((s) => s.event);
    },
    predictedRecords() {
      if (!this.selectedEvent) return [];
      const ids = Array.from(this.selectedPastEventIds);
      // Aucune source sélectionnée (« Tout exclure ») → aucune prédiction.
      // Sans ce garde, generatePredictionsForEvent([]) retombe sur le top-10
      // (forcedPastEventIds vide = pas de filtre) et afficherait le CA complet.
      if (ids.length === 0) return [];
      return generatePredictionsForEvent(
        this.selectedEvent,
        this.pastEvents,
        this.shopGranularData,
        ids,
      );
    },
    /**
     * Plage horaire active depuis le slider du `EventTimelineChart`. Si
     * aucune borne n'est posée → équivalent à l'event entier.
     */
    isTimeRangeWindowed() {
      return hasActiveRange(this.selectedTimeRange);
    },
    /**
     * Records shop×item filtrés par la plage horaire du slider. Quand le
     * slider est neutre, retourne `predictedRecords` tel quel (référence
     * stable → Vue computed cache les downstream).
     *
     * Cf. `src/utils/predictiveTimelinePreprocess.js`. Le filtrage applique
     * un ratio par (shopId, menuItemId) dérivé de `predictedTimelineData`
     * (lui-même bucketé à la minute par `usePredictiveTimeline`).
     */
    windowedPredictedRecords() {
      if (!this.isTimeRangeWindowed) return this.predictedRecords;
      return windowPredictedRecords(
        this.predictedRecords,
        this.timeline?.predictedTimelineData || [],
        this.selectedTimeRange,
      );
    },
    totalPredictedUnits() {
      return this.windowedPredictedRecords.reduce((s, r) => s + (r.quantity || 0), 0);
    },
    /**
     * CA prédit/ajusté calculé depuis la MÊME source que la section
     * Configuration (activeTimelineData + quantityAdjustments, clés
     * `${shopId}-${itemKey}`). Garantit que le Summary + les versions reflètent
     * exactement les ajustements faits par l'utilisateur (shops synthétiques
     * inclus). Respecte la fenêtre horaire `selectedTimeRange` si posée.
     */
    timelineRevenueTotals() {
      // touch tick → recalcul à chaque mutation des ajustements
      void this._adjustTick;
      const data = this.activeTimelineData || [];
      const adj = this.quantityAdjustments || {};
      const pm = this.weezeventProductPriceMap || {};
      const cm = this.weezeventProductCostMap || {};
      const cmm = this.menuItemCostMap || {};
      const closedSet = this.closedShopNormSet;
      const r0 = this.selectedTimeRange || {};
      const start = r0.start || null;
      const end = r0.end || null;
      // Agrège par shop|item : quantité + CA brut (fallback prix) + prix réel.
      const agg = new Map();
      for (const r of data) {
        const m = r.minute;
        if (start && m && m < start) continue;
        if (end && m && m > end) continue;
        const shopId = r.shopId || r.shop;
        if (!shopId) continue;
        const nameLower =
          r.itemName || r.menuItemName
            ? String(r.itemName || r.menuItemName).toLowerCase()
            : '';
        const itemKey = r.menuItemId || r.mappedMenuItemId || nameLower;
        const k = `${shopId}|${itemKey}`;
        let a = agg.get(k);
        if (!a) {
          a = {
            shopId,
            itemKey,
            qty: 0,
            rev: 0,
            wpid: r.weezeventProductId || null,
            nameLower,
            shopNorm: normalizeStr(r.shopName || r.elementName) || null,
          };
          agg.set(k, a);
        }
        a.qty += Number(r.totalQuantity || r.quantity || 0);
        a.rev += Number(r.totalRevenue || r.revenue || 0);
        if (!a.wpid && r.weezeventProductId) a.wpid = r.weezeventProductId;
      }
      let predicted = 0;
      let adjusted = 0;
      let predictedCost = 0;
      let adjustedCost = 0;
      for (const a of agg.values()) {
        // Shop FERMÉ (connu) → exclu du CA (brut ET ajusté) : on ne vend pas sur
        // un PDV fermé (ex. Auxerre 1B/3ABC). On n'exclut QUE les shops
        // explicitement fermés — un shop ouvert au nom non résolu reste compté.
        if (a.shopNorm && closedSet.has(a.shopNorm)) continue;
        // Prix unitaire réel (Weezevent) sinon CA/qté ; CA = qté × prix réel.
        let price = null;
        if (a.wpid != null && pm[String(a.wpid)] != null) price = pm[String(a.wpid)];
        else if (a.nameLower && pm[a.nameLower] != null) price = pm[a.nameLower];
        // Prix Weezevent à 0 (basePrice manquant/nul côté data, ex. "DEMI BIERE
        // 25cl") = traité comme ABSENT → repli sur le CA réel de la timeline
        // (rev/qté). Sans ce garde, `price === 0` était préféré et écrasait le CA
        // réel : 214 demi-bières × 0 € = 0, ~1113 € de CA perdus sur un event.
        const unit = (price != null && Number(price) > 0)
          ? Number(price)
          : (a.qty > 0 ? a.rev / a.qty : 0);
        const pRev = a.qty * unit;
        // Coût unitaire = MenuItem.totalCost via mapping Weezevent, sinon
        // fallback sur menuItemCostMap (clé = menuItemId) pour ne pas sous-estimer
        // le coût (et donc surestimer la marge) des items non mappés Weezevent.
        let uc = a.wpid != null && cm[String(a.wpid)] != null ? Number(cm[String(a.wpid)]) : 0;
        if (!uc && a.itemKey != null && cmm[a.itemKey] != null) uc = Number(cmm[a.itemKey]) || 0;
        const pCost = a.qty * uc;
        // CA BRUT = TOUS les articles prédits du périmètre config/space (attachés
        // OU non). Le prédit compte tout — le filtre d'attachement ne joue plus ici.
        predicted += pRev;
        predictedCost += pCost;
        // CA AJUSTÉ = uniquement les articles COCHÉS (`selectedKeySet`, dérivé de la
        // sélection ; défaut = attachés+activés). La case est l'unique gate : décoché
        // → 0 ; coché → prédit × slider %. Match par alias (shopId|shopNorm) ×
        // (itemKey|nomLower) car timeline et sélection ne partagent pas toujours les
        // mêmes ids (cross-config) — même schéma d'alias que `predictedItemKeySet`.
        const sk = this.selectedKeySet;
        const isSel =
          sk.has(`${a.shopId}|${a.itemKey}`) ||
          (a.shopNorm && sk.has(`${a.shopNorm}|${a.itemKey}`)) ||
          (a.nameLower && sk.has(`${a.shopId}|${a.nameLower}`)) ||
          (a.shopNorm && a.nameLower && sk.has(`${a.shopNorm}|${a.nameLower}`));
        const pct = isSel ? Number(adj[`${a.shopId}-${a.itemKey}`] ?? 100) : 0;
        adjusted += pRev * (pct / 100);
        adjustedCost += pCost * (pct / 100);
      }
      return { predicted, adjusted, predictedCost, adjustedCost };
    },
    totalPredictedRevenue() {
      const t = this.timelineRevenueTotals;
      if (t.predicted > 0) return t.predicted;
      // Fallback : pipeline de scoring (events futurs sans timeline directe).
      return this.windowedPredictedRecords.reduce((s, r) => s + (r.revenue || 0), 0);
    },
    confidenceScore() {
      // Confidence reste event-wide (lié au scoring des past events, pas à
      // la fenêtre temporelle).
      const recs = this.predictedRecords;
      if (recs.length === 0) return 0;
      return recs[0].confidenceScore || 0;
    },
    // Cf. React §10.3 — quantité ajustée = predicted * (adjustment / 100)
    adjustedRecords() {
      // touch tick so changes to quantityAdjustments reactively update
      // eslint-disable-next-line no-unused-expressions
      this._adjustTick;
      // CA AJUSTÉ (fallback scoring, events futurs sans timeline) gaté par la
      // sélection : coché → prédit × slider % (défaut 100) ; décoché → 0. La case
      // est l'unique gate (défaut = attachés). Remplace l'ancien défaut mapStatus
      // unmapped→0 (le prédit/CA brut, lui, garde tous les records).
      const cfg = this.effectiveMenuConfig || {};
      return this.reconciledRecords.map((r) => {
        const key = `${r.elementId}-${r.menuItemId}`;
        const mid = r.reconciledMenuItemId || r.menuItemId;
        const sel = Array.isArray(cfg[r.elementId]) && cfg[r.elementId].includes(mid);
        const pct = sel ? Number(this.quantityAdjustments[key] ?? 100) : 0;
        const factor = pct / 100;
        return {
          ...r,
          adjustedQuantity: Math.round((r.quantity || 0) * factor),
          adjustedRevenue: Math.round((r.revenue || 0) * factor * 100) / 100,
        };
      });
    },
    /**
     * Adjusted records après application de la fenêtre temporelle. Ratios
     * par (shop, item) appliqués sur `adjustedQuantity` / `adjustedRevenue`
     * (mêmes ratios que pour les records bruts → cohérence des KPI).
     */
    windowedAdjustedRecords() {
      if (!this.isTimeRangeWindowed) return this.adjustedRecords;
      const windowed = windowPredictedRecords(
        this.adjustedRecords.map((r) => ({
          ...r,
          // Mappe les champs ajustés sur les noms attendus par le ratio.
          quantity: r.adjustedQuantity,
          revenue: r.adjustedRevenue,
        })),
        this.timeline?.predictedTimelineData || [],
        this.selectedTimeRange,
      );
      return windowed.map((r) => ({
        ...r,
        adjustedQuantity: Math.round(r.quantity || 0),
        adjustedRevenue: Math.round((r.revenue || 0) * 100) / 100,
      }));
    },
    /**
     * Records synthétiques pour les items à quantité MANUELLE (la prédiction
     * algo vaut 0 : aucune vente prévue). N'impactent QUE les métriques
     * AJUSTÉES — le prédit reste 0. On itère `effectiveMenuConfig`
     * (shopId → menuItemIds sélectionnés) pour reconstruire les couples
     * (shop, item) sans parser les clés composites `${shopId}-${menuItemId}`
     * (les ids sont des UUID à tirets → split ambigu).
     */
    /**
     * Clés `${shopAlias}|${itemAlias}` des items RÉELLEMENT prédits (qté > 0)
     * dans la timeline active. Sert de garde-fou : une quantité manuelle
     * dormante (saisie quand l'item était à 0, puis l'item redevient prédit
     * après changement des sources) ne doit pas être comptée deux fois.
     */
    /**
     * Clés (shop × item) des items prédits SANS correspondance dans le Space
     * Menu de la configuration (mapStatus 'unmapped'). Sert au CA AJUSTÉ :
     * ces items partent à 0 par défaut (exclus du menu du shop), l'utilisateur
     * peut les réallouer via slider/quantité. Le CA PRÉDIT les garde (toutes
     * ventes passées, Space Menu ignoré). Combos de clés (elementId, nom shop
     * normalisé) × (menuItemId, nom item normalisé) : les records timeline et
     * les records prédits ne partagent pas toujours les mêmes ids (cross-config).
     */
    unmappedMenuKeySet() {
      const set = new Set();
      for (const r of this.reconciledRecords || []) {
        if (!r || r.mapStatus !== 'unmapped') continue;
        const shops = [r.elementId, r.shopKey, normalizeStr(r.shopName)].filter(Boolean);
        const items = [r.menuItemId, normalizeStr(r.menuItemName)].filter(Boolean);
        for (const s of shops) for (const i of items) set.add(`${s}|${i}`);
      }
      return set;
    },
    predictedItemKeySet() {
      const set = new Set();
      for (const r of (this.activeTimelineData || [])) {
        if ((Number(r.totalQuantity || r.quantity || 0)) <= 0) continue;
        const shops = [r.shopId, r.shop].filter(Boolean);
        const nameLower = (r.itemName || r.menuItemName || '').toString().toLowerCase();
        const items = [r.menuItemId, r.mappedMenuItemId, nameLower].filter(Boolean);
        for (const s of shops) for (const i of items) set.add(`${s}|${i}`);
      }
      return set;
    },
    /**
     * Prix unitaire + nom par item (clé = synthItemKey de la timeline :
     * menuItemId || mappedMenuItemId || nom) dérivés de `activeTimelineData`,
     * avec la MÊME résolution de prix que
     * EventPredictMenusSection.syntheticItemsById (weezeventProductId → prix
     * Weezevent, sinon nom, sinon prix moyen CA/qté). Indispensable : les items
     * à quantité MANUELLE sont SYNTHÉTIQUES (absents du catalogue `menuItems`)
     * → `miById` ne les trouvait pas, le prix tombait à 0, d'où le CA manuel
     * absent du Summary alors que les cartes shop l'affichaient.
     */
    manualItemInfoByKey() {
      const pm = this.weezeventProductPriceMap || {};
      const agg = new Map();
      for (const r of (this.activeTimelineData || [])) {
        const id = r.menuItemId || r.mappedMenuItemId;
        const nm = r.itemName || r.menuItemName || (id ? String(id) : '');
        const key = id ? String(id) : (nm ? String(nm).toLowerCase() : '');
        if (!key) continue;
        let e = agg.get(key);
        if (!e) { e = { name: nm, rev: 0, qty: 0, wpid: r.weezeventProductId || null }; agg.set(key, e); }
        if (!e.wpid && r.weezeventProductId) e.wpid = r.weezeventProductId;
        e.rev += Number(r.totalRevenue || r.revenue || 0);
        e.qty += Number(r.totalQuantity || r.quantity || 0);
      }
      const out = new Map();
      for (const [key, e] of agg) {
        const nameLower = String(e.name || '').toLowerCase();
        // Prix Weezevent > 0 prioritaire ; un prix à 0 (basePrice data nul, ex.
        // "DEMI BIERE 25cl") est traité comme ABSENT → repli rev/qté, sinon le 0
        // écraserait le CA réel (parité fix timelineRevenueTotals).
        let price = null;
        const wp = e.wpid != null ? pm[String(e.wpid)] : null;
        const np = pm[nameLower];
        if (wp != null && Number(wp) > 0) price = wp;
        else if (np != null && Number(np) > 0) price = np;
        else if (e.qty > 0) price = e.rev / e.qty;
        out.set(key, { name: e.name || '', price: Number(price) || 0 });
      }
      return out;
    },
    manualQuantityRecords() {
      void this._adjustTick;
      const mq = this.manualQuantities || {};
      if (!Object.keys(mq).length) return [];
      const cfg = this.effectiveMenuConfig || {};
      const miById = new Map((this.menuItems || []).map((m) => [String(m.id), m]));
      const priceMap = this.weezeventProductPriceMap || {};
      const costMap = this.menuItemCostMap || {};
      const predictedKeys = this.predictedItemKeySet;
      const out = [];
      const adjMap = this.quantityAdjustments || {};
      for (const shopId of Object.keys(cfg)) {
        for (const menuItemId of (cfg[shopId] || [])) {
          const rawQty = Number(mq[`${shopId}-${menuItemId}`]) || 0;
          if (rawQty <= 0) continue;
          // Le slider % du shop scale aussi les items 0-vente (parité
          // getAdjustedQuantity Menus/StockUp) → le CA doit refléter la qté
          // ajustée, pas la manuelle brute.
          const adjPct = Number(adjMap[`${shopId}-${menuItemId}`] ?? 100);
          const qty = Math.round((rawQty * adjPct) / 100);
          if (qty <= 0) continue;
          // Item déjà prédit (qté > 0) → la quantité manuelle est ignorée (le
          // curseur % prend le relais côté UI). Évite le double comptage.
          const mi0 = miById.get(String(menuItemId));
          const nameLower0 = (mi0?.name || '').toString().toLowerCase();
          if (
            predictedKeys.has(`${shopId}|${menuItemId}`) ||
            (nameLower0 && predictedKeys.has(`${shopId}|${nameLower0}`))
          ) continue;
          const info = this.manualItemInfoByKey.get(String(menuItemId)) || {};
          const mi = miById.get(String(menuItemId));
          const name = info.name || mi?.name || '';
          // Prix : item manuel SYNTHÉTIQUE (hors catalogue) → résolu via la
          // timeline/Weezevent (parité cartes shop), puis fallbacks catalogue/nom.
          // `info.price` vient de manualItemInfoByKey → déjà HT (map détaxé /
          // rev÷qty). Le fallback catalogue est résolu en HT via le helper
          // partagé (HT backend prioritaire, sinon détaxe via vatRate effectif).
          let price = Number(info.price) || 0;
          if (!price) {
            price = Number(menuItemPriceHt(mi, this.space?.id)) || 0;
          }
          if (!price && name && priceMap[name.toLowerCase()] != null) {
            price = Number(priceMap[name.toLowerCase()]) || 0; // map = HT
          }
          const unitCost = Number(costMap[menuItemId]) || 0;
          out.push({
            shopId,
            menuItemId,
            itemName: name || null,
            totalQuantity: qty,
            totalRevenue: qty * price,
            totalCost: qty * unitCost,
            isManual: true,
          });
        }
      }
      return out;
    },
    manualAdjustedUnits() {
      return this.manualQuantityRecords.reduce((s, r) => s + (r.totalQuantity || 0), 0);
    },
    manualAdjustedRevenue() {
      return this.manualQuantityRecords.reduce((s, r) => s + (r.totalRevenue || 0), 0);
    },
    manualAdjustedCost() {
      return this.manualQuantityRecords.reduce((s, r) => s + (r.totalCost || 0), 0);
    },
    totalAdjustedRevenue() {
      const t = this.timelineRevenueTotals;
      const base = t.predicted > 0
        ? Math.round(t.adjusted)
        // Fallback : pipeline de scoring (events futurs sans timeline directe).
        : Math.round(
            this.windowedAdjustedRecords.reduce((s, r) => s + (r.adjustedRevenue || 0), 0),
          );
      // Quantités manuelles (items prédits 0) : impactent le CA AJUSTÉ uniquement.
      return base + Math.round(this.manualAdjustedRevenue);
    },
    totalAdjustedUnits() {
      return this.windowedAdjustedRecords.reduce((s, r) => s + (r.adjustedQuantity || 0), 0)
        + this.manualAdjustedUnits;
    },
    totalPredictedCost() {
      const t = this.timelineRevenueTotals;
      if (t.predicted > 0) return t.predictedCost;
      // Fallback : pipeline de scoring (events futurs sans timeline directe).
      const map = this.menuItemCostMap || {};
      return this.windowedPredictedRecords.reduce(
        (s, r) => s + (map[r.menuItemId] || 0) * (r.quantity || 0),
        0,
      );
    },
    totalAdjustedCost() {
      const t = this.timelineRevenueTotals;
      const map = this.menuItemCostMap || {};
      const base = t.predicted > 0
        ? t.adjustedCost
        : this.windowedAdjustedRecords.reduce(
            (s, r) => s + (map[r.menuItemId] || 0) * (r.adjustedQuantity || 0),
            0,
          );
      // Coût des items manuels → marge ajustée cohérente (CA et coût alignés).
      return base + this.manualAdjustedCost;
    },
    predictedMargin() {
      const rev = this.totalPredictedRevenue;
      if (!rev) return 0;
      return ((rev - this.totalPredictedCost) / rev) * 100;
    },
    adjustedMargin() {
      const rev = this.totalAdjustedRevenue;
      if (!rev) return 0;
      return ((rev - this.totalAdjustedCost) / rev) * 100;
    },
    perCapitaPredicted() {
      const att = this.selectedEvent?.ticketsScanned || this.selectedEvent?.ticketsSold || 0;
      if (!att) return 0;
      return this.totalPredictedRevenue / att;
    },
    perCapitaAdjusted() {
      const att = this.selectedEvent?.ticketsScanned || this.selectedEvent?.ticketsSold || 0;
      if (!att) return 0;
      return this.totalAdjustedRevenue / att;
    },
    transformationRate() {
      // Approximation : transactions / attendees * 100 (sur records prédits bruts)
      const att = this.selectedEvent?.ticketsScanned || this.selectedEvent?.ticketsSold || 0;
      const transactions = (this.windowedPredictedRecords || []).reduce(
        (s, r) => s + (r.transactionCount || r.quantity || 0),
        0,
      );
      if (!att) return 0;
      return (transactions / att) * 100;
    },
    /** Transformation rate après ajustements (cf. React eventMetrics.adjustedTransformationRate). */
    adjustedTransformationRate() {
      const att = this.selectedEvent?.ticketsScanned || this.selectedEvent?.ticketsSold || 0;
      const transactions = (this.windowedAdjustedRecords || []).reduce(
        (s, r) => s + (r.transactionCount || r.adjustedQuantity || 0),
        0,
      );
      if (!att) return 0;
      return (transactions / att) * 100;
    },
    /**
     * Total des transactions prédites (brut). Utilisé pour Avg/Transaction
     * (cf. React eventMetrics.avgPerTransaction).
     */
    totalPredictedTransactions() {
      return (this.windowedPredictedRecords || []).reduce(
        (s, r) => s + (r.transactionCount || r.quantity || 0),
        0,
      );
    },
    totalAdjustedTransactions() {
      return (this.windowedAdjustedRecords || []).reduce(
        (s, r) => s + (r.transactionCount || r.adjustedQuantity || 0),
        0,
      );
    },
    /** CA / transactions (brut). */
    avgPerTransaction() {
      const t = this.totalPredictedTransactions;
      if (!t) return 0;
      return this.totalPredictedRevenue / t;
    },
    /** CA ajusté / transactions ajustées. */
    adjustedAvgPerTransaction() {
      const t = this.totalAdjustedTransactions;
      if (!t) return 0;
      return this.totalAdjustedRevenue / t;
    },
    versions() {
      return this.versionsApi.versions.value;
    },
    // Liste des scénarios triée pour l'affichage : le plus récemment modifié en
    // premier (timestamp = updatedAt || createdAt, présent sur chaque version).
    // Copie triée — `versions` reste en ordre d'insertion pour la logique par id.
    sortedVersions() {
      const list = this.versions || [];
      return [...list].sort((a, b) => {
        const ta = a && a.timestamp ? Date.parse(a.timestamp) : 0;
        const tb = b && b.timestamp ? Date.parse(b.timestamp) : 0;
        return (tb || 0) - (ta || 0);
      });
    },
    defaultVersionId() {
      return this.versionsApi.defaultVersionId.value;
    },
    activeVersionId() {
      return this.versionsApi.activeVersionId.value;
    },
    currentEditingVersionId() {
      return this.versionsApi.currentEditingVersionId.value;
    },
    /**
     * Détecte si la version actuellement éditée a été modifiée depuis son
     * chargement (cf. React :1304-1340 `hasVersionChanges`).
     * Compare :
     *  - quantityAdjustments (clés + valeurs)
     *  - selectedPastEventIds (set d'IDs d'events passés actifs)
     *  - (menuConfig à brancher quand EventPredictMenusSection sera lifté)
     */
    hasVersionChanges() {
      // Force la réactivité via le tick.
      void this._versionDirtyTick;
      if (!this.currentEditingVersionId) return false;

      // 1) quantityAdjustments
      const curAdj = this.quantityAdjustments || {};
      const origAdj = this.originalVersionQuantityAdjustments || {};
      const curKeys = Object.keys(curAdj);
      const origKeys = Object.keys(origAdj);
      if (curKeys.length !== origKeys.length) return true;
      for (const k of curKeys) {
        if (origAdj[k] === undefined) return true;
        if (Number(origAdj[k]) !== Number(curAdj[k])) return true;
      }

      // 1b) manualQuantities (items à prédiction 0). Comparaison tolérante :
      // une clé absente vaut 0 (handleManualQuantity écrit 0 plutôt que delete).
      const curMan = this.manualQuantities || {};
      const origMan = this.originalVersionManualQuantities || {};
      const manKeys = new Set([...Object.keys(curMan), ...Object.keys(origMan)]);
      for (const k of manKeys) {
        if ((Number(curMan[k]) || 0) !== (Number(origMan[k]) || 0)) return true;
      }

      // 2) selectedPastEventIds (subset des events passés actifs)
      const curSel = Array.from(this.selectedPastEventIds || []).sort();
      const origSel = [...(this.originalVersionPredictionEventIds || [])].sort();
      if (curSel.length !== origSel.length) return true;
      for (let i = 0; i < curSel.length; i++) {
        if (curSel[i] !== origSel[i]) return true;
      }

      // 3) eventSnapshot — détecte les éditions de paramètres event (nom,
      // date, sessions, ticketsScanned…). Centralise la save : toute mutation
      // de l'event passe par la version en cours d'édition.
      // Champs ÉDITABLES seulement (cf. eventEditableSig) — cf. hasUnsavedChanges.
      const curEv = this.eventEditableSig(this.selectedEvent);
      const origEv = this.eventEditableSig(this.originalVersionEventSnapshot);
      if (curEv !== origEv) return true;

      // 4) menuConfig — comparaison clé à clé sur l'eventMenuConfig effectif
      // (cf. React :1308-1317 boucle sur eventMenuConfig).
      const curMenu = this.effectiveMenuConfig || {};
      const origMenu = this.originalVersionMenuConfig || {};
      const curMenuKeys = Object.keys(curMenu);
      const origMenuKeys = Object.keys(origMenu);
      if (curMenuKeys.length !== origMenuKeys.length) return true;
      for (const sid of curMenuKeys) {
        const cur = Array.isArray(curMenu[sid]) ? curMenu[sid] : [];
        const orig = Array.isArray(origMenu[sid]) ? origMenu[sid] : null;
        if (orig === null) return true;
        if (cur.length !== orig.length) return true;
        const curSorted = [...cur].sort();
        const origSorted = [...orig].sort();
        for (let i = 0; i < curSorted.length; i++) {
          if (curSorted[i] !== origSorted[i]) return true;
        }
      }

      return false;
    },
    /**
     * Modifications NON SAUVEGARDÉES sur toute la page (timeline + configuration
     * settings + ajustements + events passés + paramètres event). Couvre le cas
     * « édition d'une version » (vs baseline version) ET « brouillon » (vs état
     * initial de l'event). Pilote le bouton Save réactif + le garde-fou de
     * sortie. Inclut la plage horaire (selectedTimeRange), absente de
     * `hasVersionChanges`.
     */
    hasUnsavedChanges() {
      void this._versionDirtyTick;
      void this._adjustTick;
      if (!this.selectedEvent) return false;

      const sameAdj = (a, b) => {
        a = a || {}; b = b || {};
        const ak = Object.keys(a), bk = Object.keys(b);
        if (ak.length !== bk.length) return false;
        for (const k of ak) if (Number(a[k]) !== Number(b[k])) return false;
        return true;
      };
      const sameMenu = (a, b) => {
        a = a || {}; b = b || {};
        const ak = Object.keys(a), bk = Object.keys(b);
        if (ak.length !== bk.length) return false;
        for (const sid of ak) {
          const ca = [...(a[sid] || [])].sort();
          const cb = Array.isArray(b[sid]) ? [...b[sid]].sort() : null;
          if (!cb || ca.length !== cb.length) return false;
          for (let i = 0; i < ca.length; i++) if (ca[i] !== cb[i]) return false;
        }
        return true;
      };
      const sameRange = (a, b) => {
        a = a || {}; b = b || {};
        return (a.start || null) === (b.start || null) &&
          (a.end || null) === (b.end || null);
      };
      const sameIds = (a, b) => {
        const sa = [...(a || [])].sort(), sb = [...(b || [])].sort();
        if (sa.length !== sb.length) return false;
        for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false;
        return true;
      };
      // Quantités manuelles : clé absente = 0 (handleManualQuantity écrit 0).
      const sameManual = (a, b) => {
        a = a || {}; b = b || {};
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const k of keys) if ((Number(a[k]) || 0) !== (Number(b[k]) || 0)) return false;
        return true;
      };

      if (this.currentEditingVersionId) {
        // Édition d'une version → comparaison à la baseline de la version.
        if (!sameAdj(this.quantityAdjustments, this.originalVersionQuantityAdjustments)) return true;
        if (!sameManual(this.manualQuantities, this.originalVersionManualQuantities)) return true;
        if (!sameMenu(this.effectiveMenuConfig, this.originalVersionMenuConfig)) return true;
        if (!sameIds(Array.from(this.selectedPastEventIds || []), this.originalVersionPredictionEventIds)) return true;
        if (!sameRange(this.selectedTimeRange, this.originalVersionTimeRange)) return true;
        // Champs ÉDITABLES seulement (cf. eventEditableSig) — pas le JSON complet,
        // sinon normalisation/ids dérivés → dirty à tort à chaque navigation.
        const curEv = this.eventEditableSig(this.selectedEvent);
        const origEv = this.eventEditableSig(this.originalVersionEventSnapshot);
        if (curEv !== origEv) return true;
        return false;
      }

      // Brouillon (aucune version éditée) → comparaison à l'état initial de
      // l'event (capturé à la 1re ouverture).
      const base = this.originalMenuConfigs[this.selectedEventId] || null;
      if (!sameAdj(this.quantityAdjustments, base?.quantityAdjustments || {})) return true;
      if (!sameManual(this.manualQuantities, base?.manualQuantities || {})) return true;
      if (base && !sameMenu(this.eventMenuConfig, base.menuConfig || {})) return true;
      if (!sameIds(Array.from(this.excludedPastEventIds || []), base?.excludedPastEventIds || [])) return true;
      if (!sameIds(Array.from(this.manualIncludedPastEventIds || []), base?.manualIncludedPastEventIds || [])) return true;
      if (!sameRange(this.selectedTimeRange, base?.selectedTimeRange || { start: null, end: null })) return true;
      return false;
    },
    predictionRows() {
      const map = new Map();
      const keyFn =
        this.viewMode === "shop"
          ? (r) => r.shopName || r.elementName || "Unknown shop"
          : (r) => r.menuItemName || r.menuItemId || "Unknown item";

      // Utilise les records filtrés par fenêtre temporelle pour rester
      // cohérent avec le KPI strip (cf. slider EventTimelineChart).
      for (const r of this.windowedPredictedRecords) {
        const k = keyFn(r);
        const cur = map.get(k) || { label: k, quantity: 0, revenue: 0 };
        cur.quantity += r.quantity || 0;
        cur.revenue += r.revenue || 0;
        map.set(k, cur);
      }
      return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
    },
  },
  watch: {
    // Reset des extras du snackbar à sa fermeture : le bouton Recharger et le
    // timeout long ne sont armés que pour le nudge post-Save ; sans ça ils
    // fuiraient sur le snackbar suivant (qui n'arme pas ces champs).
    snackbar(val) {
      if (!val) {
        this.snackbarReloadAction = false;
        this.snackbarTimeout = 3000;
      }
    },
    // La vue n'est plus remontée sur un changement de query (DashboardView
    // key = route.path) : le back/forward navigateur entre `?event=` doit être
    // rejoué ici. Une sélection UI écrit l'URL via syncEventQueryToUrl → ce
    // watcher voit alors id === selectedEventId → no-op (pas de boucle).
    '$route.query.event'(newId) {
      const id = newId || null;
      if (!id || id === this.selectedEventId) return;
      if (!this.events.find((e) => e.id === id)) return;
      this.selectEvent(id);
    },
    // Pending event id pushed by AnalyseView when user clicks a Predict bar.
    // Re-apply each time it changes — without this the EventPredict view
    // would stay locked on the first event it loaded with.
    '$store.state.analyse.pendingPredictEventId'(newId) {
      if (!newId) return;
      const ev = this.events.find((e) => e.id === newId);
      if (!ev) return;
      this.selectedEventId = newId;
      this.multiSelectIds = [newId];
      this.$store.commit('analyse/SET_PENDING_PREDICT_EVENT_ID', null);
    },
    selectedEventId(newId, oldId) {
      // Quand on change d'event, on repart de la baseline "défaut" pour le
      // nouvel event. La version par défaut sera ré-appliquée par
      // loadVersionsForEvent si elle existe.
      this.excludedPastEventIds = new Set();
      this.manualIncludedPastEventIds = new Set();
      this._versionPickIds = null;
      this.quantityAdjustments = {};
      this.manualQuantities = {};
      this.eventMenuConfig = {};
      this.versionsApi.currentEditingVersionId.value = null;
      this.clearVersionBaseline();
      // Reset past timeline (refetch si event passé).
      this.pastTimelineData = [];
      // L'ancien event garde son originalEventState/MenuConfig dans la map ;
      // ne PAS le vider (sinon perte d'historique pour reset si on revient).
      this._adjustTick++;
      if (newId) {
        // Snapshot original avant tout auto-load de version.
        this.captureOriginalsForEvent(newId);
        // PERF : debounce court — une rafale de sélections (multi-select rapide,
        // calendrier) ne déclenche qu'UN GET /predict-versions, pour le dernier
        // event retenu. Le composable garde en plus son single-flight interne.
        clearTimeout(this._versionsLoadTimer);
        this._versionsLoadTimer = setTimeout(() => {
          if (this.selectedEventId === newId) this.loadVersionsForEvent(newId);
        }, 150);
        // Réinitialise la timeline prédictive.
        this.timeline.reset();
        // Si l'event est passé, fetch la timeline réelle (cf. React :584-615).
        if (this.isPastSelectedEvent) {
          this.loadPastTimeline(newId);
        } else {
          // Conformité React : pour un event futur on charge automatiquement
          // la timeline prédictive (pas de bouton manuel). Debounce → évite la
          // cascade de fetchs quand config/version se règlent dans la foulée.
          this.scheduleLoadTimeline()
        }
        // Réconciliation Lot 1 : (re)charge l'assignation menu de la config de
        // ce nouvel event (no-op + cache si même configId).
        this.loadShopMenuAssignment();
      }
      // Sync URL ?event= avec la sélection courante (deep-link / refresh /
      // partage). Capture tous les chemins de sélection (autocomplete,
      // calendrier, deep-link, toggleMultiEvent…) en un seul point.
      this.syncEventQueryToUrl(newId);
      // Sync aussi la configuration de l'event courant dans l'URL.
      const ev = this.events.find((e) => e.id === newId);
      this.syncConfigQueryToUrl(ev?.configurationId || null);
      void oldId;
    },
    // Écrit le pont localStorage dès que la timeline prédictive est PRÊTE, pas
    // seulement au save/navigate. Supprime la race où « aller au réarmement »
    // lit `current` vide parce qu'activeTimelineData se calcule encore (async).
    // Debounce 300 ms pour absorber les recalculs en rafale (config/version).
    activeTimelineData(rows) {
      if (!Array.isArray(rows) || rows.length === 0) return;
      clearTimeout(this._bridgePersistTimer);
      this._bridgePersistTimer = setTimeout(() => {
        this.persistPredictedRecordsForRestock(this.currentEditingVersionId);
      }, 300);
    },
    // Reclassement d'une sélection de version/brouillon restaurée AVANT le
    // scoring (top-10 vide au boot → tout était parti en « manuel ») : dès que
    // le scoring réel est prêt, on répartit les ids mémorisés en exclusions
    // (top-10 non cochés) + ajouts manuels (hors top-10), puis on libère
    // l'override forcé. La sélection EFFECTIVE ne change pas (mêmes ids) →
    // aucune relance timeline, le CA reste identique.
    // Activer le mode debug relance UN calcul (coalescé) pour produire la
    // trace : les traces ne sont plus calculées en tâche de fond (coût de
    // re-scoring), donc l'event courant n'en a pas encore. Désactiver ne
    // relance rien (le memo non-debug re-sert l'ancien résultat instantané).
    debugMode(on) {
      if (on && this.selectedEvent && !this.isPastSelectedEvent) {
        this.scheduleLoadTimeline();
      }
    },
    'timeline.scoringReady'(ready) {
      if (!ready || !this._versionPickIds || this._versionPickIds.size === 0) return;
      const top = new Set(this.scoredPastEvents.map((se) => se.event.id));
      if (top.size === 0) return;
      const picked = this._versionPickIds;
      const exclude = new Set();
      top.forEach((id) => { if (!picked.has(id)) exclude.add(id); });
      const manual = new Set();
      picked.forEach((id) => { if (!top.has(id)) manual.add(id); });
      this.excludedPastEventIds = exclude;
      this.manualIncludedPastEventIds = manual;
      this._versionPickIds = null;
    },
  },
  async mounted() {
    // Écoute l'état du rail Dashboard (déplié/replié) AVANT de signaler l'overlay
    // actif : DashboardView rediffuse l'état dans la foulée → chevron initialisé.
    this._navStateHandler = (e) => { this.navExpanded = !!e.detail?.expanded; };
    window.addEventListener('datafriday:main-navigation-state', this._navStateHandler);
    // Signale à DashboardView que l'overlay EventPredict est actif → il bascule
    // son drawer en rail permanent qui POUSSE cet overlay (left:--df-nav-left)
    // au lieu de le recouvrir. Émis avant loadAll pour décaler dès le 1er rendu.
    window.dispatchEvent(new CustomEvent('datafriday:eventpredict-active', { detail: { active: true } }));
    // Garde-fou navigateur (refresh / fermeture onglet / navigation externe)
    // quand des modifications ne sont pas sauvegardées.
    window.addEventListener('beforeunload', this._beforeUnloadGuard);
    await this.loadAll();
    // Deep-link: ?event=...&version=... → auto-select after loadAll has
    // populated events + versions.
    this.applyDeepLinkFromRoute();
  },
  beforeUnmount() {
    // Overlay fermé → DashboardView repasse son drawer en mode route normal.
    window.dispatchEvent(new CustomEvent('datafriday:eventpredict-active', { detail: { active: false } }));
    window.removeEventListener('datafriday:main-navigation-state', this._navStateHandler);
    window.removeEventListener('beforeunload', this._beforeUnloadGuard);
    if (this._bridgePersistTimer) {
      clearTimeout(this._bridgePersistTimer);
      this._bridgePersistTimer = null;
    }
    if (this._timelineTimer) {
      clearTimeout(this._timelineTimer);
      this._timelineTimer = null;
    }
    // Flush du brouillon en attente : si on quitte juste après un ajustement
    // (dans la fenêtre de debounce), on persiste quand même avant de partir.
    if (this._draftTimer) {
      clearTimeout(this._draftTimer);
      this._draftTimer = null;
      this.saveDraftNow();
    }
    if (this._predictionReloadTimer) {
      clearTimeout(this._predictionReloadTimer);
      this._predictionReloadTimer = null;
    }
    if (this._liveRecomputeTimer) {
      clearTimeout(this._liveRecomputeTimer);
      this._liveRecomputeTimer = null;
    }
  },
  methods: {
    scrollToAnchor(id) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    getEventConfigName(ev) {
      if (!ev?.configurationId) return '';
      const cfg = (store.state.analyse?.configurations || []).find((c) => c.id === ev.configurationId);
      return cfg?.name || '';
    },
    /**
     * Clic sur une heure de la timeline → resserre la plage horaire.
     * Émis par EventTimelineChart via `time-range-change` (start/end HH:MM).
     */
    onTimelineRangeChange(payload) {
      this.selectedTimeRange = {
        start: payload?.start || null,
        end: payload?.end || null,
        // On conserve aussi les pourcentages pour ré-hydrater le curseur au retour.
        startPct: Number.isFinite(payload?.startPct) ? payload.startPct : null,
        endPct: Number.isFinite(payload?.endPct) ? payload.endPct : null,
      };
      // La fenêtre horaire reshape la courbe ET le CA affiché → on l'autosave
      // comme les autres ajustements pour qu'elle survive à la navigation.
      this.scheduleDraftSave();
    },
    async loadAll() {
      this.loading = true;
      try {
        const demo = isDemoMode();

        // PERF: toutes les phases réseau indépendantes partent EN PARALLÈLE (un
        // seul burst) au lieu de la cascade série loadSpace → spaceShops →
        // Promise.all → granular → mappings. Chacune ne dépend que de space.id ;
        // on n'attend chaque promesse que juste avant son consommateur.

        // loadSpace (conditionnel) — alimente store.configurations/events, requis
        // par buildShopMappings + les lectures store plus bas. Awaité juste avant
        // ces consommateurs, pas ici, pour ne pas sérialiser le reste.
        let loadSpacePromise = Promise.resolve();
        try {
          const cfgs = store.state.analyse?.configurations || [];
          const evs = store.state.analyse?.events || [];
          // Charge (ou recharge) le space via le store si events OU configs
          // manquent. Le store est alimenté par useSpaceData → API REST
          // (datafriday-api), source autoritaire de TOUS les events du space.
          if (!cfgs.length || !evs.length) {
            loadSpacePromise = store
              .dispatch("analyse/loadSpace", this.space.id)
              .catch((e) => {
                // eslint-disable-next-line no-console
                console.warn("[EVENT PREDICT] store loadSpace failed:", e?.message);
              });
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[EVENT PREDICT] store loadSpace failed:", e?.message);
        }

        // Shops open/closed (scoping Configuration) — écrit dans le store, pas de
        // dépendance de retour. Action cachée 15 min, no-op sans spaceId.
        const spaceShopsPromise =
          this.space?.id && !demo
            ? store
                .dispatch("spaceShops/fetchForSpace", { spaceId: this.space.id })
                .then((rows) => {
                  if (Array.isArray(rows)) {
                    this._spaceShopsCache = { ...this._spaceShopsCache, [this.space.id]: rows };
                  }
                })
                .catch((e) => {
                  console.warn("[EVENT PREDICT] spaceShops fetch failed:", e?.message);
                })
            : Promise.resolve();

        // Mappings backend (registry ↔ config) — hoistés hors de buildShopMappings
        // pour overlap avec le batch principal (ne dépendent que de space.id).
        // SWR : cache localStorage 15 min + revalidation en fond (Edge lente).
        const mappingsPromise = fetchEdgeMappingsSWR(this.space.id);

        // Granular REST direct (même backend NestJS que les events → eventId
        // alignés). Hoisté hors de la cascade série. Le store n'est PAS toujours
        // pré-chargé avec le granular (loadSpace n'est dispatché que si events/cfgs
        // manquent), et l'Edge Function Supabase peut renvoyer 0 → fetch explicite
        // pour garantir une source de ventes.
        const granPromise = demo
          ? Promise.resolve(null)
          : getSpaceShopGranular(this.space.id, { page: 1, limit: 500 }).catch(
              (e) => {
                // eslint-disable-next-line no-console
                console.warn("[EVENT PREDICT] getSpaceShopGranular REST failed:", e?.message);
                return null;
              },
            );

        // PERF (garde « déjà-hydraté ») : sur l'overlay de space-analyse, le store
        // `analyse` est déjà peuplé par AnalyseView. On évite alors 2 appels
        // redondants — getAllMenuItems (catalogue GLOBAL, long pôle) et
        // getAllShopDetailsBySpace (Edge Function Supabase, souvent lente/down) —
        // quand le store couvre déjà des menuItems ENRICHIS (avec components,
        // requis par l'algo) et du granular non vide. On NE touche PAS au granular
        // REST (eventIds alignés → répare le join) ni aux référentiels (non backés
        // par le store). Lecture de l'état AVANT loadSpace (cas overlay réel).
        const storeAtLoad = store.state.analyse || {};
        const storeHasEnrichedMenuItems =
          Array.isArray(storeAtLoad.menuItems) &&
          storeAtLoad.menuItems.some(
            (mi) => Array.isArray(mi.components) && mi.components.length,
          );
        const [
          allEvents,
          shopGranular,
          menuItems,
        ] = demo
          ? [[], [], []]
          : await Promise.all([
              // Events viennent du STORE (REST useSpaceData), pas de l'Edge
              // Function `getAllEvents` qui renvoie un set partiel/obsolète
              // (2 events au lieu des 11 réels du space). Voir evSource ci-dessous.
              Promise.resolve([]),
              // getAllShopDetailsBySpace (shop-performance-by-space) = Edge Function
              // du projet uvxx MORT → 500. REDONDANT avec getSpaceShopGranular
              // (NestJS, `granPromise` ci-dessus, avalé par finishHeavyLoad qui swap
              // si meilleur recouvrement). On NE tape PLUS le backend mort → [] ; le
              // granular vient du store (useSpaceData) + REST NestJS.
              Promise.resolve([]),
              // getAllMenuItems : MIGRÉ make-server (uvxx MORT) → NestJS
              // (menu-item.api, /menu-items paginé). Non-enrichi → loadAll retombe
              // sur le store (apiMisEnriched plus bas). Gaté par storeHasEnrichedMenuItems.
              storeHasEnrichedMenuItems
                ? Promise.resolve([])
                : restGetAllMenuItems().catch(() => []),
            ]);

        // PERF: NE PAS attendre le granular REST lourd ici. getSpaceShopGranular
        // (`/shop-details?granular=1`) est le gros join ventes — son propre
        // commentaire dit « Called in background after the initial page load » —
        // et bloquait le paint jusqu'à 30s (timeout) quand le backend est lent.
        // 1re passe : on seed la source granular depuis le STORE (déjà chargé par
        // useSpaceData) ci-dessous (restGran=[]). Le REST est avalé en arrière-plan
        // par finishHeavyLoad() qui swap si meilleur recouvrement event↔ventes.
        let restGran = [];

        // Scope par tenant : si l'API REST renvoie les référentiels de TOUS les
        // tenants, on ne garde que ceux du tenant du space courant (sinon le
        // select Type afficherait Sport/Football d'autres clients). `tenantId`
        // est porté par le space (cf. payload réel).
        const tenantId = this.space?.tenantId || null;
        const byTenant = (arr) => {
          const list = Array.isArray(arr) ? arr : [];
          if (!tenantId) return list;
          const scoped = list.filter((x) => !x?.tenantId || x.tenantId === tenantId);
          // Si aucun match (API déjà scopée ou tenantId absent côté data), garder tout.
          return scoped.length ? scoped : list;
        };
        // PERF : les 4 référentiels (types/catégories/sous-catégories/teams) ne
        // gatent PLUS le premier paint (ils n'alimentent que les selects et la
        // résolution de libellés) — fire-and-forget, appliqués à l'arrivée.
        // Référentiels depuis l'API REST — PAS l'Edge Function (renvoie []).
        if (!demo) {
          Promise.all([
            restGetEventTypes().then((r) => r?.data ?? r ?? []).catch(() => []),
            restGetEventCategories().then((r) => r?.data ?? r ?? []).catch(() => []),
            restGetEventSubcategories().then((r) => r?.data ?? r ?? []).catch(() => []),
            // getTeams : MIGRÉ vers l'API NestJS (team.api → GET /teams, projet alsgd).
            // Tant que le backend n'expose pas encore /teams, renvoie [] sur 404
            // (rapide, pas le 500/522 de l'ancienne make-server uvxx morte). Dès le
            // déploiement backend (docs/BACKEND_TEAMS_EVENTS.md), le catalogue se
            // peuple automatiquement. Repli : ensureReferentialsFromEvents dérive des
            // events ; le scoring lit event.visitingTeamId (intact dans tous les cas).
            restGetTeams().catch(() => []),
          ]).then(([eventTypes, eventCategories, eventSubcategories, teams]) => {
            this.eventTypes = byTenant(eventTypes);
            this.eventCategories = byTenant(eventCategories);
            this.eventSubcategories = byTenant(eventSubcategories);
            this.teams = Array.isArray(teams) ? teams : [];
          });
        }

        // loadSpace alimente store.configurations/events (instantané dans le cas
        // réel : déjà hydraté par useSpaceData). spaceShops = liste shops
        // open/closed (rapide). On les attend car les lectures store ci-dessous
        // en dépendent.
        await loadSpacePromise;
        await spaceShopsPromise;

        // PERF: buildShopMappings (Edge Function `shop-element-mappings` /
        // `menu-item-mappings`, lente / souvent down, timeout 30s) NE bloque PLUS
        // le paint. Ces mappings n'alimentent QUE l'agrégation par registry du
        // chart — qui résout déjà les noms via `record.shopName` sans la map.
        // Avalés en arrière-plan par finishHeavyLoad(). On stash les promesses
        // (déjà lancées en parallèle) pour ce suivi.
        this._pendingGranPromise = granPromise;
        this._pendingMappingsPromise = mappingsPromise;
        // Tant que le granular REST est en vol, loadTimeline saute le run de
        // boot à 0 vente (cf. garde loadTimeline) ; finishHeavyLoad lèvera ce
        // flag puis garantira un run terminal.
        this._granSettled = false;

        // Fallback sur le store Vuex (mode mock Adidas Arena ou API down).
        // L'écran AnalyseView a déjà chargé events + shopGranularData via
        // useSpaceData : on les réutilise pour que la prévision marche.
        const storeEvents = store.state.analyse?.events || [];
        const storeRecords = store.state.analyse?.shopGranularData || [];

        // Garder uniquement les events API rattachés au space courant.
        // Sinon, en mode mock/demo, l'API renvoie les events d'autres spaces
        // qui font masque sur les events du store et tout est filtré ensuite.
        const apiEventsForSpace = Array.isArray(allEvents)
          ? allEvents.filter((ev) => !ev.spaceId || ev.spaceId === this.space.id)
          : [];
        // Source PRIMAIRE = store (REST, tous les events du space avec leurs
        // paramètres complets). `apiEventsForSpace` n'est qu'un fallback.
        const evSource = storeEvents.length ? storeEvents : apiEventsForSpace;

        // Choix + RÉPARATION de la source de VENTES granular (REST direct / store
        // NestJS / Edge Function Supabase, ré-alignées par date+nom). Logique
        // extraite dans selectGranularSource() — réutilisée par finishHeavyLoad()
        // pour ré-évaluer avec le REST lourd une fois arrivé. 1re passe : restGran=[]
        // (le REST lent n'est PAS attendu) → seed immédiat depuis store/supabase.
        const sel = this.selectGranularSource(
          restGran,
          storeRecords,
          shopGranular,
          evSource,
        );
        const granSource = sel.data;
        this._granDiag = sel.diag;
        // eslint-disable-next-line no-console
        console.log(
          `[EVENT PREDICT] granular source — ${sel.candidates
            .map((c) => `${c.name}:${c.data.length}(ov ${c.overlap})`)
            .join(" ")} → choisi:${sel.diag.source} (${granSource.length} records, ${sel.diag.events} events)`,
        );

        // Filter granular records belonging to this space when possible.
        // On garde les records `isPredictive` : ils servent au court-circuit
        // de usePredictiveTimeline pour afficher directement la pr\u00e9diction
        // du mock sans repasser par scoring + scaling. `findAndScorePastEvents`
        // filtre ces records en interne lors du scoring.
        this.shopGranularData = granSource;
        this.granularHolder.value = this.shopGranularData;

        // Filter events for the current space + normalise (name↔eventName,
        // sessions JSON-strings → objets) pour que TOUS les params s'affichent.
        this.events = evSource
          .filter((ev) => !ev.spaceId || ev.spaceId === this.space.id)
          .map((ev) => this.normalizeEvent(ev));
        this.eventsHolder.value = this.events;

        // Si les référentiels (types / catégories / sous-catégories / équipes)
        // sont vides (mode démo, API down, ou backend qui ne les expose pas),
        // on les dérive depuis les events eux-mêmes pour que les selects de
        // EventDetailsEditor soient renseignés et que l'utilisateur puisse
        // éditer les détails sans dropdown vide.
        this.ensureReferentialsFromEvents();

        // Build menu item cost map (id → unit cost) avec fallback store
        const costMap = {};
        const miSource = (Array.isArray(menuItems) && menuItems.length)
          ? menuItems
          : [];
        for (const mi of miSource) {
          // Clé seulement si coût réel : une clé à 0 masquerait la valeur du
          // store dans effectiveMenuItemCostMap (merge local-prioritaire) et
          // bloquait déjà le fallback store ci-dessous (map non vide).
          const c = Number(mi?.unitCost || mi?.cost || 0);
          if (mi?.id && c > 0) costMap[mi.id] = c;
        }
        // Si vide, reprendre depuis le store (mock Arena)
        if (Object.keys(costMap).length === 0) {
          const storeCostMap = store.state.analyse?.menuItemCostMap || {};
          Object.assign(costMap, storeCostMap);
        }
        this.menuItemCostMap = costMap;
        this.menuItems = miSource;

        // Si menuItems API vide ou non-enrichi (pas de components), prendre le store
        // (mock Arena enrichi avec components/readyForSale/spaceIds — requis par
        // EventPredictMenusSection / StockUpSection pour l'algorithme).
        const storeAnalyse = store.state.analyse || {};
        const storeMis = Array.isArray(storeAnalyse.menuItems) ? storeAnalyse.menuItems : [];
        const apiMisEnriched = this.menuItems.length > 0
          && this.menuItems.some((mi) => Array.isArray(mi.components) && mi.components.length);
        if (!apiMisEnriched && storeMis.length) {
          this.menuItems = storeMis;
        }
        this.suppliers = Array.isArray(storeAnalyse.suppliers) ? storeAnalyse.suppliers : [];
        this.ingredients = Array.isArray(storeAnalyse.ingredients) ? storeAnalyse.ingredients : [];
        this.components = Array.isArray(storeAnalyse.components) ? storeAnalyse.components : [];

        // Auto-select : 3 sources d'event id (par priorité) :
        //   1) deep-link route query `?event=...`
        //   2) `pendingPredictEventId` (clic depuis Predict)
        //   3) premier event futur
        const routeEventId = this.$route?.query?.event || this.$route?.query?.eventId || null;
        const pendingId = store.state.analyse?.pendingPredictEventId || null;
        // Cible explicite (deep-link / clic depuis Predict) — SEULE à pouvoir
        // déclencher le fallback mock ci-dessous.
        const deepLinkTarget = routeEventId || pendingId;

        // Si une cible EXPLICITE est demandée mais introuvable dans la liste
        // d'events chargée (API down / autre navigateur sans cache mock), bascule
        // en demo mode et recharge le mock pour qu'au moins la prédiction
        // partagée fonctionne. Sans ça l'écran retombe sur futureEvents[0]
        // ("PSB vs Nanterre") et l'utilisateur voit 0 partout.
        if (demo && deepLinkTarget && !this.events.find((e) => e.id === deepLinkTarget)) {
          try {
            localStorage.setItem('analyse_demo', '1');
          } catch (_) { /* noop */ }
          try {
            const { ADIDAS_ARENA_MOCK } = await import('@/data/adidasArenaMock');
            // Push mock events + granular data into the store so the rest of
            // the component finds the target id.
            store.commit('analyse/SET_EVENTS', ADIDAS_ARENA_MOCK.events || []);
            store.commit('analyse/SET_SHOP_GRANULAR', ADIDAS_ARENA_MOCK.shopGranularData || []);
            store.commit('analyse/SET_CONFIGURATIONS', ADIDAS_ARENA_MOCK.configurations || []);
            store.commit('analyse/SET_MENU_ITEMS', ADIDAS_ARENA_MOCK.menuItems || []);
            store.commit('analyse/SET_MENU_ITEM_COST_MAP', ADIDAS_ARENA_MOCK.menuItemCostMap || {});
            store.commit('analyse/SET_SUPPLIERS', ADIDAS_ARENA_MOCK.suppliers || []);
            store.commit('analyse/SET_INGREDIENTS', ADIDAS_ARENA_MOCK.ingredients || []);
            store.commit('analyse/SET_COMPONENTS', ADIDAS_ARENA_MOCK.components || []);
            store.commit('analyse/SET_FROM_MOCK', true);
            this.events = store.state.analyse.events;
            this.shopGranularData = store.state.analyse.shopGranularData;
          } catch (err) {
            console.warn('[EVENT PREDICT] mock fallback failed:', err?.message);
          }
        }

        // Sélection par défaut (B.1) : si aucun deep-link explicite (clic depuis
        // Predict ou query `?event=`), on présélectionne l'event FUTUR le plus
        // proche dans le temps (futureEvents est trié par date croissante).
        const autoEvent = !deepLinkTarget ? (this.futureEvents[0] || null) : null;
        const targetId = deepLinkTarget || autoEvent?.id || null;
        const initialEvent = targetId
          ? this.events.find((e) => e.id === targetId) || null
          : null;
        if (pendingId) {
          store.commit('analyse/SET_PENDING_PREDICT_EVENT_ID', null);
        }
        if (initialEvent) {
          this.selectedEventId = initialEvent.id;
          this.multiSelectIds = [initialEvent.id];
          this.rememberLastEvent(initialEvent.id);
          // Capture snapshot initial AVANT auto-load de la default version
          // pour que performReset() puisse y revenir.
          this.captureOriginalsForEvent(this.selectedEventId);
          // PERF: libère le gate `loading` MAINTENANT — le shell (sélecteur d'event
          // + bandeau KPI) paint immédiatement avec les events + granular du STORE.
          // Le chart streame derrière son propre spinner (`timeline.timelineLoading`,
          // template :481). Le watcher `selectedEventId` (:2258/:2268) a déjà déclenché
          // loadVersionsForEvent + scheduleLoadTimeline (scoring sur granular store).
          // On garde l'await ci-dessous pour préserver l'ordre (deep-link `?version=`
          // dans applyDeepLinkFromRoute + diagnostic auto-select).
          this.loading = false;
          // Données lourdes (granular REST + mappings Edge) en arrière-plan, sans
          // bloquer le paint ; swap + recompute timeline si meilleur recouvrement.
          this.finishHeavyLoad();
          await this.loadVersionsForEvent(this.selectedEventId);
          // Si l'auto-select est un event passé, fetch sa timeline réelle.
          if (this.isPastSelectedEvent) {
            this.loadPastTimeline(this.selectedEventId);
          }
          // Diagnostic présélection auto (1 log + 1 toast) : event futur retenu
          // par défaut + nombre d'évènements passés similaires trouvés. 0 match
          // = matching à vérifier (ex. configurationId absent côté events passés).
          if (autoEvent && initialEvent.id === autoEvent.id) {
            const matched = this.scoredPastEvents.length;
            console.log(
              `[EVENT PREDICT] Présélection auto de l'évènement futur le plus proche : ` +
                `${initialEvent.eventName} (${initialEvent.eventDate}) — ` +
                `${matched} évènement(s) passé(s) similaire(s)`,
            );
            this.snackbarText = matched > 0
              ? `Évènement le plus proche présélectionné : ${initialEvent.eventName} — ${matched} évènement(s) passé(s) similaire(s)`
              : `Évènement le plus proche présélectionné : ${initialEvent.eventName} — aucun évènement passé similaire (vérifier le matching)`;
            this.snackbarColor = matched > 0 ? 'info' : 'warning';
            this.snackbar = true;
          }
        }
        // Pas d'event présélectionné : charger quand même les données lourdes en
        // arrière-plan (idempotent — no-op si déjà lancé dans le bloc ci-dessus).
        this.finishHeavyLoad();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[EVENT PREDICT] Failed to load:", err);
      } finally {
        this.loading = false;
      }
    },
    /**
     * Sélectionne + RÉPARE la source de ventes granular parmi 3 candidats (REST
     * direct / store NestJS / Edge Function Supabase), ré-alignés par date+nom sur
     * les events du space, et garde celle au MEILLEUR recouvrement event↔ventes.
     * Extrait de loadAll pour être réutilisé par finishHeavyLoad() (ré-évaluation
     * une fois le granular REST lourd arrivé).
     */
    selectGranularSource(restGran, storeRecords, shopGranular, events) {
      const spaceEvents = (Array.isArray(events) ? events : []).filter(
        (ev) => !ev.spaceId || ev.spaceId === this.space.id,
      );
      const eventIdSet = new Set(spaceEvents.map((ev) => ev.id));
      const dayKey = (d) => {
        const dt = parseDDMMYYYY(d);
        return dt ? `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}` : null;
      };
      const dateToEventId = new Map();
      const nameToEventId = new Map();
      spaceEvents.forEach((ev) => {
        const dk = dayKey(ev.eventDate || ev.date);
        if (dk && !dateToEventId.has(dk)) dateToEventId.set(dk, ev.id);
        const nm = String(ev.eventName || ev.name || "").trim().toLowerCase();
        if (nm && !nameToEventId.has(nm)) nameToEventId.set(nm, ev.id);
      });
      const repairJoin = (arr) =>
        (Array.isArray(arr) ? arr : []).map((r) => {
          if (!r || eventIdSet.has(r.eventId)) return r;
          const mapped =
            dateToEventId.get(dayKey(r.eventDate)) ||
            nameToEventId.get(String(r.eventName || "").trim().toLowerCase());
          return mapped ? { ...r, eventId: mapped } : r;
        });
      const granOverlap = (arr) => {
        const seen = new Set();
        for (const r of arr || []) {
          if (r && eventIdSet.has(r.eventId)) seen.add(r.eventId);
        }
        return seen.size;
      };
      const candidates = [
        { name: "rest", data: repairJoin(restGran) },
        { name: "store", data: repairJoin(storeRecords) },
        { name: "supabase", data: repairJoin(Array.isArray(shopGranular) ? shopGranular : []) },
      ].map((c) => ({ ...c, overlap: granOverlap(c.data) }));
      candidates.sort(
        (a, b) => b.overlap - a.overlap || b.data.length - a.data.length,
      );
      const chosen =
        candidates.find((c) => c.overlap > 0) ||
        candidates.find((c) => c.data.length) ||
        candidates[0];
      return {
        data: chosen.data,
        diag: {
          events: eventIdSet.size,
          records: chosen.data.length,
          overlap: chosen.overlap,
          source: chosen.name,
        },
        candidates,
      };
    },
    /**
     * Suivi non-bloquant lancé APRÈS le paint du shell : avale les données lourdes
     * sorties du chemin critique (granular REST `getSpaceShopGranular` + mappings
     * registry Edge), pour ne pas faire tourner le skeleton ~30s sur des backends
     * lents. Idempotent (1 seul passage par cycle de chargement).
     */
    async finishHeavyLoad() {
      if (this._heavyLoadInFlight) return;
      this._heavyLoadInFlight = true;
      this.heavyLoading = true;
      // 0) Space Menu (assignation shop↔item) : ne dépend PAS du scoring ni du
      // granular → lancé TOUT DE SUITE, en parallèle des awaits ci-dessous.
      // Alimente l'Adjusted (le skeleton « Adjusted » tombe quand il arrive).
      this.loadShopMenuAssignment();
      // 1) Granular REST lourd : si meilleur recouvrement que la source store
      //    courante, on swap et on recharge la timeline (le spinner couvre).
      try {
        const g = await (this._pendingGranPromise || Promise.resolve(null));
        if (g) {
          const raw = g?.shopGranularData || g?.records || (Array.isArray(g) ? g : []);
          const restGran = (raw || []).map((r) =>
            r && (r.revenue == null || (r.revenue === 0 && r.revenueHt != null))
              ? { ...r, revenue: r.revenueHt ?? 0 }
              : r,
          );
          if (restGran.length) {
            const storeRecords = store.state.analyse?.shopGranularData || [];
            const sel = this.selectGranularSource(restGran, storeRecords, [], this.events);
            // Swap UNIQUEMENT si le REST améliore SIGNIFICATIVEMENT le recouvrement
            // (>10 % ou source initialement vide) : un swap re-render tout et
            // recharge la timeline — pas pour un gain marginal (anti-churn).
            const prevOv = this._granDiag?.overlap ?? -1;
            const gain = sel.diag.overlap - Math.max(prevOv, 0);
            if (sel.data.length && sel.diag.overlap > prevOv && (prevOv <= 0 || gain >= Math.max(1, prevOv * 0.1))) {
              this._granDiag = sel.diag;
              this.shopGranularData = sel.data;
              this.granularHolder.value = this.shopGranularData;
              // eslint-disable-next-line no-console
              console.log(
                `[EVENT PREDICT] granular REST swap → ${sel.diag.source} ` +
                  `(${sel.data.length} records, ov ${sel.diag.overlap})`,
              );
              if (this.selectedEvent && !this.isPastSelectedEvent) {
                this.scheduleLoadTimeline();
              }
            }
          }
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[EVENT PREDICT] background granular failed:", e?.message);
      }
      // Source granular arrêtée (swap fait, REST vide, ou échec) : les runs de
      // boot sautés par la garde loadTimeline doivent aboutir à un état
      // TERMINAL (courbe ou « données insuffisantes »), jamais à un spinner.
      this._granSettled = true;
      if (
        this.selectedEvent &&
        !this.isPastSelectedEvent &&
        !this.timeline.hasCalculated &&
        !this.timeline.timelineLoading
      ) {
        this.scheduleLoadTimeline();
      }
      // 2) Mappings registry (Edge, lente) : alimentent l'agrégation du chart.
      try {
        const prefetchedMappings = await (this._pendingMappingsPromise || Promise.resolve(null));
        await this.buildShopMappings(prefetchedMappings || undefined);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("[EVENT PREDICT] shop mappings build failed:", err?.message);
      }
      // (3 → 0 : l'assignation shop↔menu-item est désormais lancée en tête de
      // cette fonction, en parallèle — cf. plan de chargement séquencé.)
      this.heavyLoading = false;
    },
    /**
     * Charge l'assignation shop↔menu-item de la config courante via l'Edge
     * Function (`getSpaceMenuConfiguration` — MÊME store que l'écran Space Menus,
     * cf. mémoire two-backends-space-menu). Parsing identique à
     * useSpaceMenu.js:34. Cache par configId. Alimente la réconciliation Lot 1.
     */
    async loadShopMenuAssignment() {
      const spaceId = this.space?.id;
      const cfgId = this.selectedEvent?.configurationId || null;
      if (!spaceId || !cfgId || this.fromMock) {
        this.shopMenuAssignment = null;
        this.shopMenuAssignmentItems = null;
        this.shopMenuMembership = null;
        // Rien à charger (mock / pas de config) → l'Adjusted ne doit pas
        // rester bloqué en skeleton : « chargé » avec assignation nulle.
        this._assignmentLoaded = true;
        return;
      }
      const cache =
        this._shopMenuAssignmentCache || (this._shopMenuAssignmentCache = {});
      if (cache[cfgId]) {
        this.shopMenuAssignment = cache[cfgId].ids;
        this.shopMenuAssignmentItems = cache[cfgId].items;
        this.shopMenuMembership = cache[cfgId].membership || null;
        this._assignmentLoaded = true;
        return;
      }
      // Fetch frais : l'Adjusted repasse en skeleton le temps du chargement
      // (une section ne s'affiche jamais avec des données à moitié prêtes).
      this._assignmentLoaded = false;
      // Shops de la config = MÊME source que le drawer Space Menu (spaceShops
      // /shops, filtré par configId). Donne le shopId que getShopMenus attend.
      try {
        const fetched = await store.dispatch("spaceShops/fetchForSpace", { spaceId }).catch(() => []);
        if (Array.isArray(fetched)) {
          this._spaceShopsCache = { ...this._spaceShopsCache, [spaceId]: fetched };
        }
      } catch (_) {
        /* noop */
      }
      const rows = (this._spaceShopsCache[spaceId] || []).filter(
        (r) => (r?.configId ?? r?._raw?.configId) === cfgId,
      );
      if (!rows.length) {
        this.shopMenuAssignment = null;
        this.shopMenuAssignmentItems = null;
        this.shopMenuMembership = null;
        this._assignmentLoaded = true;
        return;
      }
      try {
        // NestJS /space-menu/shop/{id} par shop (MÊME source que ShopMenuItemsDrawer).
        // Concurrence bornée (≤3) : sans plafond, cette boucle par shop tirait
        // /space-menu/shop/:id en parallèle EN PLUS de la boucle Analyse (config
        // context) → 429 Render. Pool + résultats collectés par index.
        // Passe par le store `shopMenuItems` (single-flight + cache TTL keyé
        // `shopId::configId`) PARTAGÉ avec Restock + Inventory → chaque (shop,
        // config) n'est fetché qu'une fois, dédupliqué : effondre le burst
        // /space-menu/shop qui provoquait des 429 (assignation vide → items
        // grisés + comptage instable 6↔3). Cap 3 conservé pour borner la
        // concurrence au premier remplissage du cache.
        const results = new Array(rows.length);
        await runWithConcurrency(rows, 3, async (r) => {
          const idx = rows.indexOf(r);
          const shopId = String(r?.id ?? r?._id ?? r?.shopId ?? "");
          const name = r?.name ?? r?.shopName ?? "";
          if (!shopId) { results[idx] = { name, items: [] }; return; }
          try {
            await store.dispatch("shopMenuItems/fetchForShop", { shopId, configId: cfgId });
            const forShop = store.getters["shopMenuItems/forShop"];
            const items = typeof forShop === "function" ? forShop(shopId, cfgId) || [] : [];
            results[idx] = { name, items };
          } catch (_) {
            results[idx] = { name, items: [] };
          }
        });
        // Clé = NOM de shop normalisé : join stable entre les espaces d'id
        // (records, éléments config, /shops) — comme buildShopMappings.
        const idMap = new Map();
        const itemMap = new Map();
        // Appartenance COMPLÈTE au Space Menu du shop (enabled ET disabled) :
        // garde-fou anti-ouverture avec un item hors menu. Un item réel désactivé
        // (shop fermé) DOIT rester distinguable d'un item Weezevent non mappé, donc
        // construit AVANT le filtre `enabled` et hors du `continue`.
        const membershipMap = new Map();
        for (const { name, items: rawItems } of results) {
          const items = Array.isArray(rawItems) ? rawItems : [];
          const key = normalizeStr(name);
          if (key && items.length) {
            membershipMap.set(key, {
              ids: new Set(items.map((it) => String(it.id))),
              names: new Set(
                items.map((it) => normalizeStr(it.name)).filter(Boolean),
              ),
            });
          }
          const enabled = items.filter((it) => it && it.enabled === true);
          if (!enabled.length) continue;
          if (!key) continue;
          idMap.set(key, new Set(enabled.map((it) => it.id)));
          itemMap.set(
            key,
            enabled.map((it) => ({
              id: it.id,
              name: it.name,
              basePrice: it.basePrice,
              category: it.productCategory?.name || it.category || "",
              picture: it.picture || null,
            })),
          );
        }
        cache[cfgId] = { ids: idMap, items: itemMap, membership: membershipMap };
        this.shopMenuAssignment = idMap;
        this.shopMenuAssignmentItems = itemMap;
        this.shopMenuMembership = membershipMap;
        // eslint-disable-next-line no-console
        console.log(
          `[EVENT PREDICT] assignation NestJS chargée : ${idMap.size}/${rows.length} shops avec menu (clé=nom)`,
        );
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
          "[EVENT PREDICT] chargement assignation menu shop (NestJS) échoué:",
          e?.message,
        );
        this.shopMenuAssignment = null;
        this.shopMenuAssignmentItems = null;
      } finally {
        this._assignmentLoaded = true;
      }
    },
    /** Ligne spaceShops (NestJS) correspondant au nom de shop, filtrée par config. */
    resolveShopRow(name) {
      const spaceId = this.space?.id;
      if (!spaceId) return null;
      const cfgId = this.selectedEvent?.configurationId || null;
      const key = normalizeStr(name);
      const rows = this._spaceShopsCache[spaceId] || [];
      return (
        rows.find((r) => {
          const rc = r?.configId ?? r?._raw?.configId;
          return (!cfgId || rc === cfgId) && normalizeStr(r?.name ?? r?.shopName) === key;
        }) || null
      );
    },
    /** Soft-warn fournisseur (best-effort) — ne bloque jamais. */
    checkRemapSupplier(targetId) {
      this.remapDlg.supplierWarn = "";
      const marketPrices = store.state.inventory?.marketPrices || [];
      if (!marketPrices.length || !targetId) return; // données indispo → pas de jugement
      const mi = this.menuItemById.get(targetId);
      if (!mi) return;
      const ctx = {
        ingredients: this.ingredients || [],
        marketPrices,
        suppliers: this.suppliers || [],
        spaceId: this.space?.id,
      };
      const comps = Array.isArray(mi.components) ? mi.components : [];
      const ingIds = comps
        .filter((c) => c && (c.itemType === "Ingredient" || c.sourceType === "Ingredient"))
        .map((c) => c.sourceId || c.id)
        .filter(Boolean);
      if (!ingIds.length) return;
      const resolved = ingIds.some((id) => resolveIngredientSupplierId(id, null, ctx));
      if (!resolved)
        this.remapDlg.supplierWarn =
          "Aucun fournisseur résolu pour cet item — il pourra ne pas être réarmé.";
    },
    onRemapTargetChange(id) {
      this.remapDlg.targetId = id;
      this.checkRemapSupplier(id);
    },
    /** Ouvre la popup de remapping pour un élément vendu non rattaché. Les
     *  candidats = menu items DU SHOP (roster getShopMenus), pas le catalogue. */
    async openRemapDialog(payload) {
      const { shopName, elementId, soldItem } = payload || {};
      if (!soldItem) return;
      const row = this.resolveShopRow(shopName);
      const shopId = row ? String(row.id ?? row._id ?? row.shopId ?? "") : "";
      this.remapDlg = {
        open: true,
        saving: false,
        loading: true,
        shopName: shopName || (row && (row.name || row.shopName)) || "",
        elementId: elementId || "",
        shopId,
        soldItem,
        targetId: null,
        candidates: [],
        supplierWarn: "",
      };
      // Roster = menu items du shop (NestJS getShopMenus), tous statuts confondus.
      // Scopé par la config de l'event courant (assignation v2 par config).
      let roster = [];
      if (shopId) {
        try {
          const res = await getShopMenus(shopId, this.selectedEvent?.configurationId || null);
          const items = Array.isArray(res?.menuItems)
            ? res.menuItems
            : Array.isArray(res?.data?.menuItems)
              ? res.data.menuItems
              : [];
          roster = items
            .filter((it) => it && it.id && it.name)
            .map((it) => ({ id: it.id, name: it.name, basePrice: it.basePrice }));
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn("[EVENT PREDICT] getShopMenus (roster popup) échoué:", e?.message);
        }
      }
      // Suggestion : l'item lui-même s'il est au roster, sinon findBestMatch sur le roster.
      let targetId = roster.some((c) => c.id === soldItem.id) ? soldItem.id : null;
      if (!targetId) {
        const best = findBestMatch({ name: soldItem.name, basePrice: null }, roster);
        if (best) targetId = best.id;
      }
      if (!this.remapDlg.open) return; // fermé entre-temps
      this.remapDlg.candidates = roster;
      this.remapDlg.targetId = targetId;
      this.remapDlg.loading = false;
      this.checkRemapSupplier(targetId);
    },
    closeRemapDialog() {
      this.remapDlg.open = false;
    },
    /** Applique le remapping : assigne l'item au shop (NestJS) + mapping nom + refresh. */
    async applyRemap() {
      const d = this.remapDlg;
      if (!d.targetId || d.saving) return;
      const spaceId = this.space?.id;
      const cfgId = this.selectedEvent?.configurationId || null;
      if (!spaceId || !cfgId || !d.shopId) {
        this.snackbarColor = "error";
        this.snackbarText = "Point de vente introuvable pour l'assignation.";
        this.snackbar = true;
        return;
      }
      this.remapDlg.saving = true;
      try {
        // Map COMPLÈTE = assignation courante du shop + la cible (préserve l'existant).
        const currentSet =
          this.shopMenuAssignment instanceof Map
            ? this.shopMenuAssignment.get(normalizeStr(d.shopName)) || new Set()
            : new Set();
        const selected = new Set(currentSet);
        selected.add(d.targetId);
        // Univers = roster du shop (getShopMenus) ∪ assignés courants ∪ cible.
        const universe = new Set([
          ...selected,
          ...(d.candidates || []).map((c) => c.id).filter(Boolean),
        ]);
        const map = {};
        universe.forEach((id) => {
          map[id] = selected.has(id);
        });
        await assignMenuItemsToShop(spaceId, cfgId, d.shopId, map);
        // (Ancien mapping nom→item via Edge Function `menu-item-mappings` SUPPRIMÉ :
        // backend uvxx MORT, ET sa lecture (fetchEdgeMappingsSWR → menuMappings) est
        // désormais vide (Phase 3) → écriture vestigiale. La réconciliation passe par
        // l'assignation NestJS ci-dessus + findBestMatch. Dernier appel uvxx d'EventPredict retiré.)
        // Refresh : invalider cache shop + assignation → recompute réactif (sans reload).
        try {
          store.dispatch("shopMenuItems/invalidateForShop", d.shopId);
        } catch (_) {
          /* noop */
        }
        if (this._shopMenuAssignmentCache) delete this._shopMenuAssignmentCache[cfgId];
        await this.loadShopMenuAssignment();
        this.snackbarColor = "success";
        this.snackbarText = `Article rattaché au menu de « ${d.shopName} ».`;
        this.snackbar = true;
        this.remapDlg.open = false;
      } catch (e) {
        this.snackbarColor = "error";
        this.snackbarText = "Échec de l'assignation : " + (e?.message || "erreur");
        this.snackbar = true;
      } finally {
        this.remapDlg.saving = false;
      }
    },
    /**
     * Case cochée sur un item d'un PDV FERMÉ (onglet Closed) : write-through
     * vers Space Menus — MÊME endpoint NestJS POST /space-menu que l'écran
     * Space Menus (ShopMenuItemsDrawer/SpaceMenuItemView) → source de vérité
     * unique, synchro dans les deux sens. Dès qu'un item est activé,
     * menuItemsCount > 0 → `isOpenByShop` recompute → le PDV passe « Opened ».
     */
    /**
     * Garde-fou déclenché par l'enfant : on a tenté d'ouvrir un PDV fermé en
     * cochant un item ABSENT de son Space Menu (ex. item Weezevent non mappé).
     * On n'assigne rien — on invite à remapper d'abord.
     */
    handleAssignBlocked({ shopName, itemName }) {
      const label = itemName ? `« ${itemName} »` : "Cet article";
      this.snackbarColor = "error";
      this.snackbarText = `${label} n'est pas dans le menu de « ${shopName} ». Rattachez-le d'abord (bouton Remapper).`;
      this.snackbar = true;
    },
    async handleAssignShopItem({ shopName, menuItemId, enabled }) {
      const spaceId = this.space?.id;
      const cfgId = this.selectedEvent?.configurationId || null;
      const row = this.resolveShopRow(shopName);
      const shopId = row ? String(row.id ?? row._id ?? row.shopId ?? "") : "";
      if (!spaceId || !cfgId || !shopId || !menuItemId) {
        this.snackbarColor = "error";
        this.snackbarText = "Point de vente introuvable pour l'assignation.";
        this.snackbar = true;
        return;
      }
      try {
        // Map PARTIELLE { id: bool } : même forme que SpaceMenuItemView (le
        // backend merge, il n'écrase pas le reste du menu du shop).
        await assignMenuItemsToShop(spaceId, cfgId, shopId, {
          [menuItemId]: enabled === true,
        });
        // MAJ optimiste de la ligne /shops locale : menuItemsCount pilote
        // isOpenByShop → bascule immédiate Opened/Closed sans refetch /shops.
        const rows = this._spaceShopsCache[spaceId] || [];
        const nextRows = rows.map((r) => {
          if (String(r?.id ?? r?._id ?? r?.shopId ?? "") !== shopId) return r;
          const count = Math.max(
            0,
            Number(r?.menuItemsCount || 0) + (enabled ? 1 : -1),
          );
          return { ...r, menuItemsCount: count, isOpen: count > 0 };
        });
        this._spaceShopsCache = { ...this._spaceShopsCache, [spaceId]: nextRows };
        // Invalidation caches assignation (même refresh que applyRemap).
        try {
          store.dispatch("shopMenuItems/invalidateForShop", shopId);
        } catch (_) {
          /* noop */
        }
        if (this._shopMenuAssignmentCache) delete this._shopMenuAssignmentCache[cfgId];
        await this.loadShopMenuAssignment();
        this.snackbarColor = "success";
        this.snackbarText = enabled
          ? `Article activé dans le menu de « ${shopName} » (Space Menus mis à jour).`
          : `Article retiré du menu de « ${shopName} » (Space Menus mis à jour).`;
        this.snackbar = true;
      } catch (e) {
        this.snackbarColor = "error";
        this.snackbarText = "Échec de la mise à jour Space Menus : " + (e?.message || "erreur");
        this.snackbar = true;
      }
    },
    /**
     * Select All d'un shop (MenusSection) : 1 SEUL appel réseau pour tout le
     * lot de changements (au lieu d'1 par item comme le ferait le toggle
     * unitaire). Le backend merge la map partielle, il n'écrase pas le reste
     * du menu du shop (même contrat que `handleAssignShopItem`). Refetch
     * complet (pas de MAJ optimiste ligne par ligne, trop de champs bougent
     * d'un coup) via `loadShopMenuAssignment`, même pattern que `applyRemap`.
     */
    async handleAssignShopItems({ shopName, changes }) {
      const spaceId = this.space?.id;
      const cfgId = this.selectedEvent?.configurationId || null;
      // Résolution par NOM via resolveShopRow, PAS par elementId : même contrat
      // que `handleAssignShopItem` — elementId===shopId est un invariant NON
      // vérifié (cf. [[analyse-config-shop-perimeter]]), un fallback dessus
      // écrirait silencieusement sur le mauvais shop si l'invariant casse.
      const row = this.resolveShopRow(shopName);
      const shopId = row ? String(row.id ?? row._id ?? row.shopId ?? "") : "";
      if (!spaceId || !cfgId || !shopId || !changes || !Object.keys(changes).length) {
        this.snackbarColor = "error";
        this.snackbarText = "Point de vente introuvable pour l'assignation groupée.";
        this.snackbar = true;
        return;
      }
      try {
        await assignMenuItemsToShop(spaceId, cfgId, shopId, changes);
        try {
          store.dispatch("shopMenuItems/invalidateForShop", shopId);
        } catch (_) {
          /* noop */
        }
        if (this._shopMenuAssignmentCache) delete this._shopMenuAssignmentCache[cfgId];
        await this.loadShopMenuAssignment();
        this.snackbarColor = "success";
        this.snackbarText = `Menu de « ${shopName} » mis à jour (${Object.keys(changes).length} article(s), Space Menus synchro).`;
        this.snackbar = true;
      } catch (e) {
        this.snackbarColor = "error";
        this.snackbarText = "Échec de l'assignation groupée : " + (e?.message || "erreur");
        this.snackbar = true;
      }
    },
    selectEvent(id) {
      // Sélection simple unifiée (autocomplete OU calendrier). `id` peut être
      // null quand on efface l'autocomplete.
      this.selectedEventId = id || null;
      this.multiSelectIds = id ? [id] : [];
      if (id) this.rememberLastEvent(id);
    },
    /**
     * Écrit l'event sélectionné dans l'URL (?event=<id>) sans polluer
     * l'historique. Préserve les autres clés (toolbox, version/versionId) et
     * court-circuite si déjà en phase → la lecture au mount (loadAll /
     * applyDeepLinkFromRoute) reste la source de vérité au chargement.
     */
    syncEventQueryToUrl(newId) {
      const cur = this.$route?.query?.event || this.$route?.query?.eventId || null;
      const next = newId || null;
      if (cur === next) return; // déjà synchro (inclut lecture au mount) → no-op
      const query = { ...this.$route.query };
      delete query.eventId; // alias legacy : on ne garde que `event` canonique
      if (next) query.event = next; else delete query.event;
      this.$router.replace({ path: this.$route.path, query }).catch(() => {});
    },
    /**
     * Écrit la configuration choisie dans l'URL (?configuration=<id>) sans
     * polluer l'historique. Préserve les autres clés (toolbox, event, version).
     * La config est un HARD FILTER du scoring → la mettre dans l'URL rend le
     * lien reproductible (même prévision au partage / refresh).
     */
    syncConfigQueryToUrl(cfgId) {
      const cur = this.$route?.query?.configuration || null;
      const next = cfgId || null;
      if (cur === next) return; // déjà synchro → no-op
      const query = { ...this.$route.query };
      if (next) query.configuration = next; else delete query.configuration;
      this.$router.replace({ path: this.$route.path, query }).catch(() => {});
    },
    // --- Reload stable : mémorise le dernier event travaillé par espace ----
    lastEventKey() {
      const sid = this.space?.id || this.$route?.params?.spaceId;
      return sid ? `analyse:event-predict-last-event:${sid}` : null;
    },
    rememberLastEvent(id) {
      const key = this.lastEventKey();
      if (!key || !id) return;
      try { localStorage.setItem(key, id); } catch (_) { /* noop */ }
    },
    readLastEventId() {
      const key = this.lastEventKey();
      if (!key) return null;
      try { return localStorage.getItem(key) || null; } catch (_) { return null; }
    },
    // Ouvre le réarmement du space avec l'event courant comme base de réarmement.
    async goToRestock() {
      const spaceId = this.space?.id || this.$route?.params?.spaceId;
      if (!spaceId) return;
      // Date prévue = celle de l'évènement sélectionné, déjà connue. Plus de modal
      // (askDate) : inutile de redemander une date que l'on possède. Sert de date
      // pour la feuille de course du réarmement.
      let date = "";
      const d = parseDDMMYYYY(this.selectedEvent?.eventDate);
      if (d instanceof Date && !isNaN(d.getTime())) {
        const pad = (n) => String(n).padStart(2, "0");
        date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      }
      // Mémorise le dernier event prédit + sa date pour pré-remplir le
      // réarmement même s'il est ouvert plus tard sans ?event= (cookie local).
      setLastPredictedEvent(spaceId, {
        eventId: this.selectedEventId || null,
        date: date || null,
      });
      // Persiste les records de prédiction pour que le réarmement les lise sans
      // recalcul / sans API (pont localStorage).
      this.persistPredictedRecordsForRestock(this.currentEditingVersionId);
      const query = {};
      if (this.selectedEventId) query.event = this.selectedEventId;
      if (date) query.date = date;
      this.$router.push({ name: "space-restock", params: { spaceId }, query });
    },
    // Ouvre l'inventaire de l'espace avec l'event courant + SA config (scope PdV).
    // La config vient de selectedEvent.configurationId (copie locale → reflète un
    // changement live) ; l'inventaire la préfère à la config du store (?configuration=).
    goToInventory() {
      const spaceId = this.space?.id || this.$route?.params?.spaceId;
      if (!spaceId) return;
      const query = {};
      if (this.selectedEventId) query.event = this.selectedEventId;
      const cfgId = this.selectedEvent?.configurationId || null;
      if (cfgId) query.configuration = cfgId;
      this.$router.push({ name: "space-inventory", params: { spaceId }, query });
    },
    /**
     * Persiste les records de prédiction calculés (+ ajustements % + menuConfig)
     * dans localStorage, pour que SpaceRestockView reproduise EXACTEMENT les
     * quantités d'EventPredict sans recalcul ni API. Écrit toujours le pointeur
     * `current` (dernière prédiction active) et, si on édite/sauve une version,
     * sous son id (scénarios). Voir [[stockPlanning]] côté restock.
     */
    /**
     * Agrège `activeTimelineData` (+ quantités manuelles) en records compacts
     * par shop+item : { shopId, shop, menuItemId, mappedMenuItemId, itemName,
     * totalQuantity, totalRevenue }. Source UNIQUE consommée par le pont
     * localStorage (`persistPredictedRecordsForRestock`) ET par la persistance
     * DB de la version (`snapshotForVersion.predictedRecords`). `activeTimelineData`
     * contient RÉELLEMENT les quantités affichées dans Stock up — PAS
     * `predictedRecords`, qui ré-appelle generatePredictionsForEvent et renvoie []
     * sans historique réel. Retourne [] tant que la timeline n'est pas calculée
     * (les appelants ne doivent jamais écraser des records existants avec []).
     */
    buildPredictedRecords() {
      const agg = new Map();
      for (const r of (this.activeTimelineData || [])) {
        const shopId = r.shopId || r.shop || r.elementId;
        const menuItemId = r.menuItemId || r.mappedMenuItemId || r.itemId;
        if (!shopId || !menuItemId) continue;
        const k = `${shopId}|${menuItemId}`;
        const cur = agg.get(k) || {
          shopId,
          shop: r.shop || r.shopName || null,
          menuItemId,
          mappedMenuItemId: r.mappedMenuItemId || null,
          itemName: r.itemName || r.mappedMenuItemName || null,
          totalQuantity: 0,
          totalRevenue: 0,
        };
        cur.totalQuantity += Number(r.totalQuantity) || 0;
        cur.totalRevenue += Number(r.totalRevenue) || 0;
        agg.set(k, cur);
      }
      // Items à quantité MANUELLE (prédiction 0) : absents d'activeTimelineData,
      // mais à transmettre au réarmement. On ne les ajoute que s'ils ne sont pas
      // déjà couverts par un record prédit (clé shop|item).
      for (const m of (this.manualQuantityRecords || [])) {
        const k = `${m.shopId}|${m.menuItemId}`;
        if (agg.has(k)) continue;
        agg.set(k, {
          shopId: m.shopId,
          shop: null,
          menuItemId: m.menuItemId,
          mappedMenuItemId: null,
          itemName: m.itemName || null,
          totalQuantity: m.totalQuantity,
          totalRevenue: m.totalRevenue,
        });
      }
      return Array.from(agg.values());
    },
    persistPredictedRecordsForRestock(versionId) {
      const spaceId = this.space?.id || this.$route?.params?.spaceId;
      if (!spaceId || !this.selectedEventId) return;
      const records = this.buildPredictedRecords();
      // Garde-fou : ne JAMAIS écraser des records déjà persistés avec un payload
      // vide (timeline prédictive pas encore calculée au moment du clic). Sinon le
      // restock lirait `current` vide → « No forecast » alors qu'un scénario a des
      // quantités. On préserve la dernière prédiction valable.
      if (records.length === 0) {
        console.warn('[EventPredict→Restock] activeTimelineData vide : persistance ignorée pour ne pas écraser des records existants.');
        return;
      }
      const base = {
        eventId: this.selectedEventId,
        ts: Date.now(),
        records,
        quantityAdjustments: this.quantityAdjustments,
        menuConfig: this.effectiveMenuConfig,
        // Config EXACTE utilisée par EventPredict : le restock la réutilise pour
        // que les shops matchent (sa propre résolution de config diffère).
        configuration: this.selectedEventConfiguration || null,
      };
      setPredictedRecords(spaceId, this.selectedEventId, 'current', { ...base, versionId: 'current' });
      if (versionId && versionId !== 'current') {
        setPredictedRecords(spaceId, this.selectedEventId, versionId, { ...base, versionId });
      }
    },
    /**
     * Garde-fou « modifications non sauvegardées ». Retourne true si on peut
     * continuer (rien à sauver, ou l'utilisateur accepte de perdre ses changes).
     */
    async confirmDiscardIfDirty() {
      if (!this.hasUnsavedChanges) return true;
      return await this.askConfirm({
        title: 'Modifications non sauvegardées',
        message:
          "Des changements (timeline, configuration, ajustements) n'ont pas été enregistrés. Quitter sans sauvegarder ?",
        confirmLabel: 'Quitter sans sauvegarder',
      });
    },
    /** Ferme l'overlay EventPredict en passant par le garde-fou. */
    async requestClose() {
      if (await this.confirmDiscardIfDirty()) this.$emit('close');
    },
    /** Handler natif beforeunload (refresh / fermeture onglet / nav externe). */
    _beforeUnloadGuard(e) {
      if (this.hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    },
    /** Réglages : pont vers le drawer Settings de DashboardView (même event
     *  custom que WorkspaceAppHeader.openSettings). */
    openHeaderSettings() {
      window.dispatchEvent(new CustomEvent('datafriday:open-settings'));
    },
    openMainNavigation() {
      window.dispatchEvent(new CustomEvent('datafriday:open-main-navigation'));
    },
    /** Accueil : retour à la liste des espaces (garde-fou dirty avant sortie). */
    async goToHome() {
      if (!(await this.confirmDiscardIfDirty())) return;
      this.$emit('close');
      this.$router.push('/spaces');
    },
    async headerSignOut() {
      try {
        await this.$store.dispatch('auth/signOut');
        this.$router.push('/login');
      } catch (_) {
        /* session nettoyée au refresh */
      }
    },
    /** Sélection dans le dropdown outils (colonne gauche) → navigation. */
    onToolboxSelect(value) {
      const tool = this.visibleToolboxItems.find((t) => t.value === value);
      this.navigateToTool(tool);
    },
    async navigateToTool(tool) {
      if (!tool || tool.value === 'event-predict') return;
      const spaceId = this.space?.id || this.$route?.params?.spaceId;
      if (!spaceId) return;
      // Garde-fou avant de quitter EventPredict pour un autre outil.
      if (!(await this.confirmDiscardIfDirty())) return;

      const query = this.selectedEventId ? { event: this.selectedEventId } : {};
      if (tool.value === 'analyse' || tool.value === 'predict') {
        // Analyse ET Predict vivent sur la route `space-analyse` ; Event Predict
        // est un overlay piloté par `selectedToolbox`. On bascule le toolbox dans
        // le store (ferme l'overlay + déclenche la régénération predict).
        store.commit('analyse/SET_TOOLBOX', tool.value);
        try {
          // Router TOUJOURS par NOM vers space-analyse. Depuis la page standalone
          // `/spaces/:id/predict` (SpacePredictView), réutiliser `this.$route.path`
          // garderait l'URL sur /predict (bug : l'URL ne change pas). On repart
          // d'une query propre : seuls `event` + éventuel `toolbox=predict` sont
          // conservés ; les params Event Predict (version, config…) sont purgés.
          const nextQuery = { ...query };
          if (tool.value === 'predict') nextQuery.toolbox = 'predict';
          this.$router.replace({ name: 'space-analyse', params: { spaceId }, query: nextQuery });
        } catch (_) { /* router not ready */ }
        this.$emit('close');
      } else if (tool.value === 'space-inventory' || tool.value === 'restock' || tool.value === 'logistic') {
        // Inventaire/Réarmement scopent sur la config de l'event. On la joint
        // EXPLICITEMENT (?configuration=) : la config courante d'EventPredict vit
        // dans this.events LOCAL (change live sans Save) et n'est PAS reflétée dans
        // store.analyse.events que l'inventaire redérive. Sans ça, une config changée
        // live serait perdue au passage. Non ajoutée aux branches analyse/predict
        // (elles lisent ?config= et ignoreraient ?configuration= → URL polluée).
        // Repli sur ?configuration= de l'URL courante : un event sans
        // configurationId (draft, event non configuré) laisserait sinon
        // l'inventaire sans contexte (« Aucun évènement sélectionné »).
        const cfgId = this.selectedEvent?.configurationId
          || this.$route?.query?.configuration || null;
        const scopedQuery = { ...query };
        if (cfgId) scopedQuery.configuration = cfgId;
        const routeName =
          tool.value === 'space-inventory'
            ? 'space-inventory'
            : tool.value === 'logistic'
              ? 'space-logistic'
              : 'space-restock';
        this.$router.push({ name: routeName, params: { spaceId }, query: scopedQuery });
      }
    },
    toggleMultiEvent(id) {
      const list = [...this.multiSelectIds];
      const idx = list.indexOf(id);
      if (idx >= 0) {
        list.splice(idx, 1);
        // si on désélectionne l'event actif, repli sur le 1er restant
        if (id === this.selectedEventId) {
          this.selectedEventId = list[0] || null;
        }
      } else {
        list.push(id);
      }
      this.multiSelectIds = list;
    },
    clearMultiSelect() {
      // garde uniquement l'event actif
      this.multiSelectIds = this.selectedEventId ? [this.selectedEventId] : [];
    },
    isFutureEventDate(d) {
      // (Conservé pour compat. ; le sidebar utilise désormais isSidebarEventDate.)
      if (!(d instanceof Date)) return false;
      const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return this.futureDateValues.some((fd) => fd.getTime() === ts);
    },
    /** Autorise dates correspondant aux events du tab actif (upcoming/past). */
    isSidebarEventDate(d) {
      if (!(d instanceof Date)) return false;
      const ts = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return this.sidebarDateValues.some((fd) => fd.getTime() === ts);
    },
    /**
     * CA réel (HT) d'un évènement passé = somme des revenus de ses records de
     * ventes réels (non prédictifs) dans shopGranularData. Affiché dans les chips
     * sous le calendrier : ce CA est la base à partir de laquelle on projette.
     */
    pastEventCA(eventId) {
      if (!eventId) return 0;
      return (this.shopGranularData || []).reduce((sum, r) => {
        if (r.eventId !== eventId || r.isPredictive) return sum;
        return sum + Number(r.revenue ?? r.totalRevenue ?? 0);
      }, 0);
    },
    onCalendarChange(date) {
      // Calendrier secondaire : sélection simple. `date` = Date unique.
      const d = Array.isArray(date) ? date[0] : date;
      if (!d) {
        this.selectEvent(null);
        return;
      }
      const ts = d instanceof Date ? d.getTime() : new Date(d).getTime();
      const ev = this.events.find((e) => {
        const ed = parseDDMMYYYY(e.eventDate);
        return ed && ed.getTime() === ts;
      });
      this.selectEvent(ev ? ev.id : null);
    },
    togglePastEvent(id) {
      const next = new Set(this.excludedPastEventIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      this.excludedPastEventIds = next;
      // Choix utilisateur explicite → l'override mémorisé de version tombe.
      this._versionPickIds = null;
      this.scheduleSelectionReload();
    },
    includeAllPastEvents() {
      this.excludedPastEventIds = new Set();
      this._versionPickIds = null;
      this.scheduleSelectionReload();
    },
    excludeAllPastEvents() {
      this.excludedPastEventIds = new Set(this.scoredPastEvents.map((se) => se.event.id));
      this._versionPickIds = null;
      this.scheduleSelectionReload();
    },
    /**
     * « Sauvegarder & Recalculer » du drawer de sélection. Décompose la
     * sélection en (exclusions du top 10) + (ajouts manuels hors top 10), puis
     * relance le RECALCUL PARTIEL : loadPredictiveTimeline(event, ids) via
     * overridePredictionIds — le scoring déjà fait sert tel quel (events non
     * scorés → poids manuel 30 % côté composable), la re-pondération = score ÷
     * Σ scores de la nouvelle sélection, et les timelines minute repassent par
     * `restTimelineCache` (aucun fetch réseau pour les events déjà chargés).
     */
    applySourcesSelection(ids) {
      const picked = new Set(ids);
      const top = new Set(this.scoredPastEvents.map((se) => se.event.id));
      const exclude = new Set();
      top.forEach((id) => { if (!picked.has(id)) exclude.add(id); });
      const manual = new Set();
      picked.forEach((id) => { if (!top.has(id)) manual.add(id); });
      this.excludedPastEventIds = exclude;
      this.manualIncludedPastEventIds = manual;
      this._versionPickIds = null;
      this.showSourcesDrawer = false;
      this.scheduleSelectionReload();
    },
    /**
     * (Dé)cocher un event passé source doit MODIFIER le CA pris en compte.
     * Le CA d'un event futur dérive de `timeline.predictedTimelineData`
     * (cf. `timelineRevenueTotals`), recalculée par le composable à partir du
     * SOUS-ENSEMBLE d'events passés. On recharge donc la timeline prédictive
     * avec les ids actuellement sélectionnés (debounce 350 ms pour absorber les
     * clics rapides + Tout inclure/exclure). Sélection vide → timeline remise à
     * zéro (le garde sur `predictedRecords` ramène alors le CA à 0).
     * Sans effet pour un event passé (qui affiche ses ventes réelles).
     */
    scheduleSelectionReload() {
      this._versionDirtyTick++;
      if (this.isPastSelectedEvent || !this.selectedEvent) return;
      if (this._predictionReloadTimer) clearTimeout(this._predictionReloadTimer);
      this._predictionReloadTimer = setTimeout(() => {
        this._predictionReloadTimer = null;
        const ids = Array.from(this.selectedPastEventIds);
        this.eventsHolder.value = this.events;
        this.granularHolder.value = this.shopGranularData;
        if (ids.length === 0) {
          this.timeline.reset();
          // État FINAL voulu (« tout exclure »), aucune relance ne suivra :
          // sans ce marquage, le squelette (`!hasCalculated`) tourne sans fin.
          this.timeline.hasCalculated = true;
        } else {
          this.timeline.loadPredictiveTimeline(this.selectedEvent, ids);
        }
        this.scheduleDraftSave();
      }, 350);
    },
    formatWeight(eventId) {
      if (!this.selectedPastEventIds.has(eventId)) return "—";
      const total = this.totalActiveScore;
      if (!total) return "0%";
      const se = this.activeScoredEvents.find((s) => s.event.id === eventId);
      if (!se) return "0%";
      return ((se.score / total) * 100).toFixed(1) + "%";
    },
    setViewMode(value) {
      this.viewMode = value;
    },
    /** Handler de mise à jour des ajustements depuis EventPredictMenusSection. */
    onAdjustmentsChange(next) {
      this.quantityAdjustments = next || {};
      this._adjustTick++;
      // Force le recalcul de `hasVersionChanges` → réactive le bouton « Update »
      // de la version éditée dès qu'on bouge un curseur (la détection de
      // changement ne se rafraîchissait pas toujours sur la seule mutation de
      // l'objet quantityAdjustments).
      this._versionDirtyTick++;
      // Autosave brouillon (debounce) pour ne rien perdre entre deux visites.
      this.scheduleDraftSave();
    },
    /** Handler de mise à jour de la sélection menu items depuis MenusSection. */
    onMenuConfigChange(next) {
      this.eventMenuConfig = next || {};
      this._versionDirtyTick++;
    },
    /** Quantités absolues manuelles (items à prédiction 0) depuis MenusSection. */
    onManualQuantitiesChange(next) {
      this.manualQuantities = next || {};
      this._adjustTick++;
      this._versionDirtyTick++;
      this.scheduleDraftSave();
    },
    /**
     * Champs de l'event qui pilotent réellement l'algo de prédiction (audit de
     * `usePredictiveTimeline`/scoring) — donc ceux dont l'édition doit changer
     * les métriques en LIVE et être conservés dans la version + le brouillon :
     *  - ticketsScanned / ticketsSold → scaling du CA (predictedAttendees) ;
     *  - eventTypeId / eventCategoryId / eventSubcategoryId → filtres durs du
     *    scoring (sélection des events passés similaires) ;
     *  - configurationId → scope shops + filtre dur ;
     *  - sessions (showTime) → décalage temporel de la courbe ;
     *  - eventDate / numberOfSessions / *Name → cohérence d'affichage.
     */
    pickEventOverride(ev) {
      if (!ev || typeof ev !== "object") return {};
      const KEYS = [
        "ticketsScanned",
        "ticketsSold",
        "eventTypeId",
        "eventCategoryId",
        "eventSubcategoryId",
        "configurationId",
        "sessions",
        "numberOfSessions",
        "eventDate",
        "eventEndDate",
        "eventEndTime",
        "eventName",
        "name",
        "homeTeamName",
        "homeTeamId",
        "visitingTeamId",
      ];
      const out = {};
      for (const k of KEYS) {
        if (ev[k] !== undefined) out[k] = ev[k];
      }
      return out;
    },
    /**
     * Applique un override d'event EN MÉMOIRE (jamais de backend : le profil
     * event est piloté par la page Profile, source de vérité). Met à jour
     * l'entrée `events` → `selectedEvent` recalcule → pill « scanned » + métriques
     * (per-capita, transformation, CA scalé) se rafraîchissent immédiatement.
     */
    applyEventOverrideLocal(updated) {
      if (!updated?.id) return;
      this.events = this.events.map((e) =>
        e.id === updated.id ? { ...e, ...this.pickEventOverride(updated) } : e,
      );
      this.eventsHolder.value = this.events;
    },
    /**
     * Aperçu LIVE (`event-live`) émis à chaque édition dans EventDetailsEditor.
     * Patche l'event en mémoire puis re-déclenche la prédiction (débouncée) :
     * scoring + scaling relisent les nouveaux champs. Aucun reload, aucun appel
     * backend. La valeur part dans la version au prochain enregistrement
     * (`snapshotForVersion` capture `eventSnapshot`).
     */
    handleEventLiveUpdate(updated) {
      if (!updated?.id) return;
      this.applyEventOverrideLocal(updated);
      this.scheduleLiveRecompute();
    },
    /** Recalcul prédiction débouncé après une édition live (350ms). */
    scheduleLiveRecompute() {
      if (this._liveRecomputeTimer) clearTimeout(this._liveRecomputeTimer);
      this._liveRecomputeTimer = setTimeout(() => {
        this._liveRecomputeTimer = null;
        // Recharge la timeline (scoring + scaling) sur l'event patché en place.
        this.loadTimeline();
        // Persiste l'override (attendance + profil) dans le brouillon : survit
        // à une navigation / un reload tant que la version n'est pas enregistrée.
        this.scheduleDraftSave();
      }, 350);
    },
    /**
     * Construit le payload `PATCH /events/:id` depuis l'event édité, en mirror
     * du chemin Settings prouvé (EventFormDrawer.submit) : `sessions` objets →
     * JSON.stringify, dates DD/MM/YYYY → ISO via toISODate, tickets via
     * Math.trunc. N'inclut que les champs définis (spread conditionnel) pour ne
     * pas écraser en base avec des `undefined`.
     */
    buildEventPatchPayload(ev) {
      if (!ev || typeof ev !== "object") return {};
      const has = (v) => v !== undefined && v !== null && v !== "";
      const sessions = Array.isArray(ev.sessions) ? ev.sessions : [];
      const name = ev.eventName || ev.name;
      const payload = {
        ...(has(name) ? { name } : {}),
        ...(has(ev.eventDate) ? { eventDate: this.toISODate(ev.eventDate) } : {}),
        ...(has(ev.eventEndDate)
          ? { eventEndDate: this.toISODate(ev.eventEndDate) }
          : {}),
        ...(has(ev.eventEndTime) ? { eventEndTime: ev.eventEndTime } : {}),
        ...(has(ev.eventTypeId) ? { eventTypeId: ev.eventTypeId } : {}),
        ...(has(ev.eventCategoryId) ? { eventCategoryId: ev.eventCategoryId } : {}),
        ...(has(ev.eventSubcategoryId)
          ? { eventSubcategoryId: ev.eventSubcategoryId }
          : {}),
        ...(has(ev.configurationId) ? { configurationId: ev.configurationId } : {}),
        ...(sessions.length
          ? {
              sessions: sessions.map((s) => JSON.stringify(s)),
              numberOfSessions: Number(ev.numberOfSessions) || sessions.length,
            }
          : {}),
        ...(has(ev.ticketsSold)
          ? { ticketsSold: Math.trunc(Number(ev.ticketsSold)) }
          : {}),
        ...(has(ev.ticketsScanned)
          ? { ticketsScanned: Math.trunc(Number(ev.ticketsScanned)) }
          : {}),
        ...(has(ev.homeTeamName) ? { homeTeamName: ev.homeTeamName } : {}),
        // homeTeamId (FK) NON envoyé tant que la colonne backend n'existe pas : le DTO
        // event a forbidNonWhitelisted → un champ inconnu 400erait TOUT le save.
        // homeTeamName persiste le nom en attendant. cf. docs/BACKEND_HOME_TEAM.md.
        ...(has(ev.visitingTeamId) ? { visitingTeamId: ev.visitingTeamId } : {}),
      };
      return payload;
    },
    /**
     * Signature des champs ÉDITABLES d'un event (whitelist `buildEventPatchPayload`).
     * Utilisée par les checks de « modifs non sauvegardées » : comparer le JSON
     * COMPLET de l'event au snapshot version donnait un faux positif systématique
     * (guard « Update » à chaque navigation sans édit) car `normalizeEvent`
     * (date→eventDate), `ensureReferentialsFromEvents` (ids dérivés), les sessions
     * re-parsées et les timestamps divergent du snapshot sans être des édits user.
     * Ce sous-ensemble normalisé (dates→ISO, sessions→JSON) ne bouge QUE sur un vrai edit.
     */
    eventEditableSig(ev) {
      return ev ? JSON.stringify(this.buildEventPatchPayload(ev)) : '';
    },
    /**
     * Bouton « Save » de l'éditeur (`event-update`). Persiste désormais l'event
     * CANONIQUE en base via PATCH /events/:id (reflété page Profile + liste
     * Settings) — cf. plan, annule la décision « Profile = seule source ».
     * Le PATCH n'a lieu QU'au Save (jamais pendant la frappe) et seulement pour
     * un event réel : démo (fromMock) et drafts de prédiction (`pred-*` / sans
     * id) gardent l'ancien comportement (override live + brouillon + version).
     */
    async handleEventUpdate(updated) {
      if (!updated?.id) return;
      // 1) Applique l'event édité EN UNE FOIS (les édits du drawer sont
      //    draft-local : aucun flush live pendant la saisie) et recalcule la
      //    prédiction immédiatement. `pickEventOverride` inclut configurationId
      //    → le scoring est rescopé sur la config choisie au Save.
      this.applyEventOverrideLocal(updated);
      // La config est un HARD FILTER → on la reflète dans l'URL au Save (lien
      // reproductible), puisque le changement de config ne sync plus en live.
      this.syncConfigQueryToUrl(updated.configurationId || null);
      if (this._liveRecomputeTimer) {
        clearTimeout(this._liveRecomputeTimer);
        this._liveRecomputeTimer = null;
      }
      this.loadTimeline();
      // 2) Persiste l'override dans le brouillon (filet hors-ligne) + réactive le
      //    bouton « Save » de la version.
      this.saveDraftNow();
      this._versionDirtyTick++;

      // 3) Démo ou draft de prédiction (pas d'event réel en base) : pas de PATCH,
      //    ancien feedback « à graver dans la version ».
      const isPredictionDraft =
        this.fromMock ||
        updated._isPrediction ||
        String(updated.id).startsWith("pred-");
      if (isPredictionDraft) {
        this.snackbarText =
          "Modifications appliquées. Enregistrez la version pour les conserver.";
        this.snackbarColor = "success";
        this.snackbar = true;
        return;
      }

      // 4) Event réel : PATCH /events/:id (event canonique) + sync store Vuex.
      try {
        const res = await updateEvent(updated.id, this.buildEventPatchPayload(updated));
        const saved = res?.data ?? res;
        if (saved && typeof saved === "object") {
          store.dispatch("events/updateEvent", saved);
          this.applyEventOverrideLocal({ ...saved, id: updated.id });
        }
        // Nudge : les champs sauvés pilotent l'algo → guider l'utilisateur vers
        // les 2 façons de matérialiser la prédiction recalculée (cf. plan suivi).
        this.snackbarText =
          "Enregistré en base. La prédiction est impactée : cliquez « Mettre à jour » pour figer la version, ou rechargez pour recalculer.";
        this.snackbarColor = "success";
        this.snackbarReloadAction = true;
        this.snackbarTimeout = 10000;
        this.snackbar = true;
      } catch (err) {
        const msg =
          err?.response?.data?.message || err?.message || "erreur inconnue";
        this.snackbarText = "Enregistrement échoué : " + msg;
        this.snackbarColor = "error";
        this.snackbar = true;
        // eslint-disable-next-line no-console
        console.error("[EVENT PREDICT] updateEvent failed:", err);
      }
    },
    /** Action du nudge post-Save : recharge la page → relit l'event persisté +
     *  relance le pipeline prédictif complet depuis la base. On retire d'abord le
     *  garde-fou beforeunload (la version est dirty après Save) pour un reload
     *  intentionnel SANS dialog natif « modifications non enregistrées ». */
    reloadAndRecompute() {
      window.removeEventListener("beforeunload", this._beforeUnloadGuard);
      window.location.reload();
    },
    /** DD/MM/YYYY ou ISO → YYYY-MM-DD (format attendu par CreateEventDto). */
    toISODate(dateStr) {
      if (!dateStr) return "";
      const m = String(dateStr).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      if (m) return `${m[3]}-${m[2]}-${m[1]}`;
      if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return String(dateStr).slice(0, 10);
      return String(dateStr);
    },
    /**
     * Ajoute l'event de prédiction créé à la liste locale (marqué
     * `_isPrediction`), puis le sélectionne. Garde les params complets côté
     * front (sessions objets, tickets…) pour alimenter le pipeline prédictif.
     */
    _appendPredictionEvent(ev) {
      const enriched = { ...ev, _isPrediction: true, spaceId: this.space.id };
      this.events = [enriched, ...this.events.filter((e) => e.id !== enriched.id)];
      this.eventsHolder.value = this.events;
      this.selectEvent(enriched.id);
    },
    /**
     * Handler `event-create` émis par EventDetailsEditor pour un draft de
     * prédiction (sans id). Crée un NOUVEL event futur via POST /events (REST,
     * `CreateEventDto`) — distinct de l'event source, qui reste intact.
     */
    async handleEventCreate(draft) {
      if (!draft) return;
      const name = String(draft.eventName || draft.name || "").trim();
      if (!name) {
        this.snackbarText = "Nom requis pour créer la prédiction.";
        this.snackbarColor = "error";
        this.snackbar = true;
        return;
      }

      // Mode démo : pas d'appel API, création locale immédiate.
      if (isDemoMode() || this.fromMock) {
        const localId = "pred-" + Date.now().toString(36);
        this._appendPredictionEvent({ ...draft, id: localId });
        this.snackbarText = "Prédiction créée (démo).";
        this.snackbarColor = "success";
        this.snackbar = true;
        return;
      }

      // Payload conforme à CreateEventDto (cf. openapi.json) : name + eventDate
      // requis ; on n'envoie que les champs reconnus par le DTO.
      const sessions = Array.isArray(draft.sessions) ? draft.sessions : [];
      const payload = {
        name,
        eventDate: this.toISODate(draft.eventDate),
        spaceId: this.space.id,
        ...(draft.configurationId ? { configurationId: draft.configurationId } : {}),
        ...(draft.eventTypeId ? { eventTypeId: draft.eventTypeId } : {}),
        ...(draft.eventCategoryId ? { eventCategoryId: draft.eventCategoryId } : {}),
        ...(draft.eventSubcategoryId
          ? { eventSubcategoryId: draft.eventSubcategoryId }
          : {}),
        ...(sessions.length ? { numberOfSessions: sessions.length } : {}),
      };

      try {
        const res = await createEvent(payload);
        const created = (res && (res.data || res)) || {};
        const newId = created.id || created.eventId;
        if (!newId) throw new Error("réponse API sans id");
        // Event local riche (params complets pour le pipeline) + id réel API.
        this._appendPredictionEvent({ ...draft, ...created, id: newId });
        this.snackbarText = "Événement de prédiction créé.";
        this.snackbarColor = "success";
        this.snackbar = true;
      } catch (err) {
        const msg =
          err?.response?.data?.message || err?.message || "erreur inconnue";
        this.snackbarText = "Création échouée : " + msg;
        this.snackbarColor = "error";
        this.snackbar = true;
        // eslint-disable-next-line no-console
        console.error("[EVENT PREDICT] createEvent failed:", err);
      }
    },
    /**
     * Équipe créée inline depuis l'éditeur (dialog « Créer une équipe »).
     * On l'ajoute au catalogue local pour que les selects home/visiting et la
     * résolution de libellés la voient immédiatement (sans re-fetch /teams).
     */
    handleTeamCreated(team) {
      if (!team || !team.id) return;
      if ((this.teams || []).some((t) => t.id === team.id)) return;
      this.teams = [...(this.teams || []), team];
    },
    /**
     * Changement live de configuration depuis EventDetailsEditor. On patche
     * `selectedEvent.configurationId` en mémoire (sans persistance API) pour
     * que les sections "Configuration settings" et "Stock up" se mettent
     * imm\u00e9diatement \u00e0 jour. La persistance se fait au Save de l'\u00e9diteur.
     */
    handleConfigurationChange(newCfgId) {
      if (!this.selectedEventId) return;
      this.events = this.events.map((e) =>
        e.id === this.selectedEventId
          ? { ...e, configurationId: newCfgId }
          : e,
      );
      this.eventsHolder.value = this.events;
      // Reflète la config choisie dans l'URL (lien reproductible).
      this.syncConfigQueryToUrl(newCfgId);
      // Recompute LIVE (plus de reload) : le scoring est rescopé sur la nouvelle
      // config (filtre dur + scope shops) et le CA se recalcule en place.
      // L'event-live de l'éditeur déclenche aussi loadTimeline ; on garde ce
      // recompute ici pour le cas où la config change sans autre champ édité.
      this.scheduleLiveRecompute();
    },
    /**
     * Charge la timeline prédictive pour l'event actif (cf. doc §9).
     * Le composable s'occupe du scoring + scaling + fetch backend ;
     * en mode mock (sans backend), seuls candidateEvents seront peuplés.
     */
    async loadTimeline() {
      if (!this.selectedEvent) return;
      // Boot : le granular REST lourd est encore en vol et la source locale est
      // vide → scorer sur 0 vente ne produit qu'un run inutile qui avorte /
      // mémoïse à vide le vrai run. On saute ; finishHeavyLoad (swap ou
      // _granSettled) relancera et garantit un état terminal.
      if (
        !this.isPastSelectedEvent &&
        (this.shopGranularData?.length || 0) === 0 &&
        this._pendingGranPromise &&
        !this._granSettled
      ) {
        return;
      }
      // Sync holders (au cas où events/granular ont changé entre temps)
      this.eventsHolder.value = this.events;
      this.granularHolder.value = this.shopGranularData;
      // SOURCE DE SÉLECTION UNIQUE : dès qu'une exclusion est active (décochage
      // manuel, version appliquée, brouillon restauré), la timeline reçoit
      // EXACTEMENT le sous-ensemble qui pilote le CA (`selectedPastEventIds`).
      // Avant, applyVersion/restoreDraft appelaient loadTimeline() nu → le
      // composable retombait sur son top-10 par défaut : courbe ≠ CA. Sans
      // exclusion, on laisse le composable dériver son top-10 (même ensemble).
      // Sélection vide (« Tout exclure ») → reset, comme scheduleSelectionReload.
      let overrideIds;
      if (!this.isPastSelectedEvent && this._versionPickIds?.size > 0) {
        // Sélection d'une version/brouillon restaurée AVANT le scoring réel :
        // excluded/manual sont provisoires (classés contre un top-10 vide) —
        // on force les ids exacts voulus. Reclassement propre au watcher
        // `timeline.scoringReady`.
        overrideIds = Array.from(this._versionPickIds);
      } else if (
        !this.isPastSelectedEvent &&
        (this.excludedPastEventIds.size > 0 || this.manualIncludedPastEventIds.size > 0)
      ) {
        const ids = Array.from(this.selectedPastEventIds);
        if (ids.length === 0) {
          this.timeline.reset();
          // reset() remet hasCalculated=false (état « pas encore calculé ») ;
          // ici c'est un état FINAL voulu (« tout exclure ») sans relance →
          // sans ce marquage, le squelette (`!hasCalculated`) tournait sans fin.
          this.timeline.hasCalculated = true;
          return;
        }
        overrideIds = ids;
      }
      await this.timeline.loadPredictiveTimeline(this.selectedEvent, overrideIds);
      // Si la prédiction temporelle ressort vide pour un event futur, on le
      // signale (toast) au lieu de laisser un graphe muet « Aucune donnée » sans
      // explication : c'est en général l'absence de données de ventes minute pour
      // les events passés similaires (cf. log diag [PREDICTIVE TIMELINE]).
      if (
        !this.isPastSelectedEvent &&
        (this.timeline.predictedTimelineData?.length || 0) === 0
      ) {
        const d = this._granDiag || {};
        const scored = this.timeline.candidateEvents?.length || 0;
        const matched = this.scoredPastEvents?.length || 0;
        this.snackbarText =
          d.overlap === 0
            ? `Prédiction vide : aucune vente n'est rattachable aux ${d.events || 0} évènement(s) de cet espace (${d.records || 0} records de ventes, 0 correspondance even↔ventes). C'est un trou de données backend (ventes sous d'autres ids/date).`
            : `Prédiction temporelle vide : ${matched} évènement(s) passé(s) similaire(s), ${scored} scoré(s), mais pas de détail minute exploitable dans les ventes.`;
        this.snackbarColor = "warning";
        this.snackbar = true;
      }
    },
    /**
     * Recharge la timeline en DEBOUNCE : plusieurs déclencheurs peuvent tomber
     * en cascade (watcher selectedEventId + changement de config + application
     * de version). Sans debounce, chaque trigger refaisait un fetch complet des
     * timelines de tous les events passés (rafale réseau + reflows). On coalesce
     * en un seul rechargement.
     */
    scheduleLoadTimeline() {
      if (this._timelineTimer) clearTimeout(this._timelineTimer);
      this._timelineTimer = setTimeout(() => {
        this._timelineTimer = null;
        this.loadTimeline();
      }, 60);
    },
    /**
     * Construit les 4 mappings utilisés par EventTimelineChart (mirror React
     * loadShopMappings :430-525) :
     *  - `elementIdToShopNameMap` : registryElementId → rawShopName
     *  - `elementIdToTypesMap`    : registryElementId → string[] (shopType)
     *  - `elementIdToAreaMap`     : registryElementId → areaName (floor name
     *    ou "Forecourt" / "External Merch")
     *  - `itemNameToMenuItemIdMap`: itemName → menuItemId
     *
     * Source : `configurations` (du store) pour les éléments + leur area,
     * `getShopElementMappings` pour faire le pont registryId ↔ config element,
     * `getMenuItemMappings` pour la correspondance item name.
     */
    /**
     * En mode démo / fallback (référentiels API vides), dérive types /
     * catégories / sous-catégories / équipes depuis les events chargés, et
     * normalise chaque event avec les `*Id` correspondants. Sans ça, les
     * dropdowns d'EventDetailsEditor restent vides et l'utilisateur ne peut
     * rien sélectionner.
     */
    ensureReferentialsFromEvents() {
      if (!Array.isArray(this.events) || !this.events.length) return;

      const slug = (s) =>
        String(s || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');

      const typeByName = new Map();
      (this.eventTypes || []).forEach((t) => {
        if (t?.name) typeByName.set(t.name, t);
      });
      const catByKey = new Map(); // `${typeId}::${name}` → cat
      (this.eventCategories || []).forEach((c) => {
        if (c?.name && c.eventTypeId) catByKey.set(`${c.eventTypeId}::${c.name}`, c);
      });
      const subByKey = new Map(); // `${categoryId}::${name}` → sub
      (this.eventSubcategories || []).forEach((s) => {
        if (s?.name && s.eventCategoryId) subByKey.set(`${s.eventCategoryId}::${s.name}`, s);
      });
      const teamByName = new Map();
      (this.teams || []).forEach((t) => {
        if (t?.name) teamByName.set(t.name, t);
      });

      const ensureType = (name) => {
        if (!name) return null;
        if (typeByName.has(name)) return typeByName.get(name);
        const id = `type-${slug(name)}`;
        const entry = { id, name };
        typeByName.set(name, entry);
        return entry;
      };
      const ensureCategory = (typeId, name) => {
        if (!typeId || !name) return null;
        const k = `${typeId}::${name}`;
        if (catByKey.has(k)) return catByKey.get(k);
        const id = `cat-${slug(name)}-${slug(typeId)}`;
        const entry = { id, name, eventTypeId: typeId };
        catByKey.set(k, entry);
        return entry;
      };
      const ensureSubcategory = (categoryId, name) => {
        if (!categoryId || !name) return null;
        const k = `${categoryId}::${name}`;
        if (subByKey.has(k)) return subByKey.get(k);
        const id = `sub-${slug(name)}-${slug(categoryId)}`;
        const entry = { id, name, eventCategoryId: categoryId };
        subByKey.set(k, entry);
        return entry;
      };
      const ensureTeam = (name) => {
        if (!name) return null;
        if (teamByName.has(name)) return teamByName.get(name);
        const id = `team-${slug(name)}`;
        const entry = { id, name };
        teamByName.set(name, entry);
        return entry;
      };

      const normalized = this.events.map((ev) => {
        const out = { ...ev };
        // Event Type : utilise `eventType` (string) ou eventTypeName si déjà
        // un ID, on ne touche pas.
        const typeName =
          ev.eventTypeName ||
          (typeof ev.eventType === 'string' && !ev.eventTypeId ? ev.eventType : null);
        if (!ev.eventTypeId && typeName) {
          const t = ensureType(typeName);
          if (t) out.eventTypeId = t.id;
        } else if (ev.eventTypeId && !typeByName.has(ev.eventTypeId)) {
          // event a déjà un ID mais pas de référentiel → reconstruit.
          ensureType(typeName || ev.eventTypeId);
        }
        // Category
        const catName =
          ev.eventCategoryName ||
          (typeof ev.category === 'string' && !ev.eventCategoryId ? ev.category : null);
        if (!ev.eventCategoryId && catName && out.eventTypeId) {
          const c = ensureCategory(out.eventTypeId, catName);
          if (c) out.eventCategoryId = c.id;
        }
        // Subcategory
        const subName =
          ev.eventSubcategoryName ||
          (typeof ev.subcategory === 'string' && !ev.eventSubcategoryId
            ? ev.subcategory
            : null);
        if (!ev.eventSubcategoryId && subName && out.eventCategoryId) {
          const s = ensureSubcategory(out.eventCategoryId, subName);
          if (s) out.eventSubcategoryId = s.id;
        }
        // Visiting team (sport uniquement, mais on remplit si présent)
        const visitName = ev.visitingTeamName || (typeof ev.visitingTeam === 'string' ? ev.visitingTeam : null);
        if (!ev.visitingTeamId && visitName) {
          const t = ensureTeam(visitName);
          if (t) out.visitingTeamId = t.id;
        }
        return out;
      });

      this.events = normalized;
      this.eventsHolder.value = this.events;

      // Reconstruit les listes finales (triées par nom pour la stabilité UI).
      const sortByName = (a, b) => String(a.name).localeCompare(String(b.name));
      this.eventTypes = Array.from(typeByName.values()).sort(sortByName);
      this.eventCategories = Array.from(catByKey.values()).sort(sortByName);
      this.eventSubcategories = Array.from(subByKey.values()).sort(sortByName);
      this.teams = Array.from(teamByName.values()).sort(sortByName);
    },
    async buildShopMappings(prefetched = null) {
      const configurations = this.configurations || [];
      if (!configurations.length) {
        this.elementIdToShopNameMap = new Map();
        this.elementIdToTypesMap = new Map();
        this.elementIdToAreaMap = new Map();
        this.itemNameToMenuItemIdMap = new Map();
        return;
      }
      // 1) Élément config par id + area par id
      const elementMap = new Map();
      const elementAreaMap = new Map();
      configurations.forEach((cfg) => {
        const data = cfg.data || cfg;
        (data.floors || []).forEach((floor) => {
          (floor.elements || []).forEach((el) => {
            elementMap.set(el.id, el);
            elementAreaMap.set(el.id, floor.name);
          });
        });
        if (data.forecourt?.elements) {
          data.forecourt.elements.forEach((el) => {
            elementMap.set(el.id, el);
            elementAreaMap.set(el.id, "Forecourt");
          });
        }
        if (data.externalMerch?.elements) {
          data.externalMerch.elements.forEach((el) => {
            elementMap.set(el.id, el);
            elementAreaMap.set(el.id, "External Merch");
          });
        }
      });
      // 2) Index par nom (pour matcher avec les mappings backend)
      const elementNameMap = new Map();
      elementMap.forEach((el) => {
        if (el?.name) elementNameMap.set(el.name, el);
      });

      // 3) Mappings backend — réutilise ceux déjà fetchés EN PARALLÈLE par
      //    loadAll (overlap avec le batch principal) si fournis, sinon fetch ici
      //    (autres appelants : changement de config sans rechargement complet).
      const [mappings, menuMappings] = prefetched || (await fetchEdgeMappingsSWR(this.space.id));

      // 4) Build maps finales
      const shopTypesMap = new Map();
      const shopAreasMap = new Map();
      const shopNamesMap = new Map();
      const menuItemMap = new Map();

      (Array.isArray(menuMappings) ? menuMappings : []).forEach((m) => {
        if (m?.fnbItem && m?.menuItemId) {
          menuItemMap.set(m.fnbItem, m.menuItemId);
        }
      });

      (Array.isArray(mappings) ? mappings : []).forEach((m) => {
        const { shopName, elementId, elementName } = m || {};
        if (!elementId) return;
        shopNamesMap.set(elementId, shopName);
        const element = elementName ? elementNameMap.get(elementName) : null;
        if (element) {
          const area = elementAreaMap.get(element.id);
          if (area) shopAreasMap.set(elementId, area);
          if (Array.isArray(element.shopType) && element.shopType.length > 0) {
            shopTypesMap.set(elementId, element.shopType);
          }
        }
      });

      // Fallback (mode démo / API down) : si l'API mapping n'a rien renvoyé,
      // dériver directement depuis les éléments de configuration. Hypothèse :
      // `record.elementId` === `element.id` (registry id), et le nom du shop
      // est celui de l'élément de configuration.
      if (shopNamesMap.size === 0) {
        elementMap.forEach((el, elId) => {
          if (el?.type !== 'shop' && el?.type !== 'hospitality' && el?.type !== 'kitchen') return;
          shopNamesMap.set(elId, el.name);
          const area = elementAreaMap.get(elId);
          if (area) shopAreasMap.set(elId, area);
          if (Array.isArray(el.shopType) && el.shopType.length > 0) {
            shopTypesMap.set(elId, el.shopType);
          }
        });
      }

      this.elementIdToShopNameMap = shopNamesMap;
      this.elementIdToTypesMap = shopTypesMap;
      this.elementIdToAreaMap = shopAreasMap;
      this.itemNameToMenuItemIdMap = menuItemMap;
    },
    /**
     * Charge la timeline minute-par-minute (revenue/min) pour un event passé
     * via l'API REST `getSpaceEventTimeline(spaceId, eventId)` — endpoint rapide
     * du backend NestJS (remplace l'Edge Function `/event-timeline/<id>`).
     */
    async loadPastTimeline(eventId) {
      if (!eventId) return;
      this.pastTimelineLoading = true;
      try {
        // En mode mock : synthétiser la timeline depuis shopGranularData
        // (le mock a `hour` au lieu de `minute`, et `revenue/quantity` au lieu
        // de `totalRevenue/totalQuantity` → on convertit).
        if (this.fromMock) {
          this.pastTimelineData = this.buildMockPastTimeline(eventId);
          return;
        }
        // Source REST pré-agrégée (rapide, même backend que le reste de l'app)
        // au lieu de l'Edge Function `/event-timeline` (lente / souvent down).
        // Renvoie minute × shop × menuItem avec `revenueHt`/`quantity` → on
        // normalise vers `totalRevenue`/`totalQuantity` lus par aggregateTimeline.
        const raw = await getSpaceEventTimeline(this.space.id, eventId);
        // Guard contre une réponse arrivant après un changement d'event.
        if (this.selectedEventId !== eventId) return;
        const data = (Array.isArray(raw) ? raw : []).map((r) => ({
          ...r,
          totalRevenue: Number(r.totalRevenue ?? r.revenueHt ?? r.revenue ?? 0),
          totalQuantity: Number(r.totalQuantity ?? r.quantity ?? 0),
          transactionCount: Number(r.transactionCount ?? r.transactions ?? 0),
          itemName: r.itemName ?? r.menuItemName ?? r.name ?? null,
        }));
        this.pastTimelineData = preprocessTimelineRecords(Array.isArray(data) ? data : [], {
          eventId,
          menuItemCostMap: this.menuItemCostMap || {},
        });
      } catch (err) {
        if (this.selectedEventId !== eventId) return;
        // eslint-disable-next-line no-console
        console.warn("[EVENT PREDICT] past timeline load failed:", err?.message);
        this.snackbarText = "Erreur de chargement de la timeline: " + err?.message;
        this.snackbarColor = "error";
        this.snackbar = true;
        // Pas de fallback silencieux : on laisse la timeline vide (empty-state)
        // et l'erreur reste visible via le snackbar.
        this.pastTimelineData = [];
      } finally {
        if (this.selectedEventId === eventId) {
          this.pastTimelineLoading = false;
        }
      }
    },
    /**
     * Construit une timeline minute-par-minute synthétique depuis les
     * `shopGranularData` du mock. Convertit `hour` → `minute` (HH:00),
     * `revenue` → `totalRevenue`, `quantity` → `totalQuantity`, et expose
     * `shopId` (alias `elementId`) pour la compat avec EventTimelineChart.
     */
    buildMockPastTimeline(eventId) {
      const records = (this.shopGranularData || []).filter(
        (r) => r.eventId === eventId,
      );
      return preprocessTimelineRecords(records.map((r) => ({
        minute: r.minute || `${String(r.hour ?? 19).padStart(2, "0")}:00`,
        shopId: r.shopId || r.elementId,
        shopName: r.shopName,
        menuItemId: r.menuItemId || r.mappedMenuItemId,
        mappedMenuItemId: r.mappedMenuItemId || r.menuItemId,
        mappedMenuItemName: r.mappedMenuItemName || r.menuItemName,
        itemName: r.itemName || r.menuItemName,
        totalRevenue: Number(r.totalRevenue ?? r.revenue ?? 0),
        totalQuantity: Number(r.totalQuantity ?? r.quantity ?? 0),
      })), {
        eventId,
        menuItemCostMap: this.menuItemCostMap || {},
      });
    },
    resetSelection() {
      // Délégué à handleReset() pour passer par le garde-fou
      // "modifications non sauvegardées" si une version est éditée.
      this.handleReset();
    },
    formatCurrency(n) {
      const v = Number(n) || 0;
      return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(v);
    },
    /**
     * Retourne la date normalisée en DD/MM/YYYY.
     * L'entrée peut être ISO (`2025-09-13T00:00:00Z`) ou déjà DD/MM/YYYY.
     * Ex: "2025-09-13" → "13/09/2025"
     */
    formatDateWithDay(dateStr) {
      if (!dateStr) return dateStr || '';
      const d = parseDDMMYYYY(dateStr);
      if (!d || isNaN(d.getTime())) return dateStr;
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${d.getFullYear()}`;
    },
    /** HH:MM depuis "HH:MM[:SS]", ISO datetime, ou ''. */
    toHHMM(v) {
      if (!v) return '';
      const m = String(v).match(/^(\d{2}):(\d{2})/);
      if (m) return `${m[1]}:${m[2]}`;
      const d = new Date(v);
      if (!Number.isNaN(d.getTime())) {
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      return '';
    },
    /**
     * Sessions des events réels = array de chaînes JSON (cf. EventFormDrawer
     * `sessions.map(JSON.stringify)`). Reparse en objets {doorsOpening, showTime}
     * pour que l'éditeur et la mini-card affichent les horaires.
     */
    parseSessions(raw) {
      let list = [];
      if (Array.isArray(raw)) list = raw;
      else if (typeof raw === 'string' && raw.trim()) {
        try {
          const p = JSON.parse(raw);
          list = Array.isArray(p) ? p : [];
        } catch (_) {
          list = [];
        }
      }
      return list
        .map((s) => {
          if (typeof s === 'string') {
            try { return JSON.parse(s); } catch (_) { return null; }
          }
          return s;
        })
        .filter((s) => s && typeof s === 'object' && !Array.isArray(s))
        .map((s) => ({
          ...s,
          doorsOpening: this.toHHMM(s.doorsOpening),
          showTime: this.toHHMM(s.showTime),
        }));
    },
    /**
     * Normalise un event de l'API REST pour la vue : mappe `name`↔`eventName`
     * (les events réels exposent `name`) et reparse `sessions` (chaînes JSON →
     * objets). Crée une COPIE — ne mute pas l'objet du store.
     */
    normalizeEvent(ev) {
      if (!ev || typeof ev !== 'object') return ev;
      const out = { ...ev };
      if (!out.eventName && out.name) out.eventName = out.name;
      if (!out.name && out.eventName) out.name = out.eventName;
      // Les events DataFriday (store analyse / API getEvents) portent `date` (ISO),
      // PAS `eventDate`. EventPredict pilote TOUT (futureEvents, eventOptions, calendrier)
      // sur `eventDate` → sans ce mapping, `ev.eventDate` est undefined, aucun event n'est
      // détecté comme futur et la liste « à venir » reste vide. On normalise en DD/MM/YYYY
      // (format attendu par l'UI ; parseDDMMYYYY gère ISO + slash de toute façon).
      if (!out.eventDate && out.date) {
        const d = parseDDMMYYYY(out.date);
        if (d && !Number.isNaN(d.getTime())) {
          const dd = String(d.getDate()).padStart(2, '0');
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          out.eventDate = `${dd}/${mm}/${d.getFullYear()}`;
        } else {
          out.eventDate = out.date;
        }
      }
      out.sessions = this.parseSessions(ev.sessions);
      return out;
    },
    /**
     * Renvoie une date FUTURE au format DD/MM/YYYY pour le draft de prédiction.
     * - date source valide : on incrémente l'année jusqu'à dépasser aujourd'hui
     *   (préserve jour/mois → même saisonnalité, ex: 02/08/2025 → 02/08/2026) ;
     * - date absente/invalide : aujourd'hui + 30 jours.
     */
    toFutureDate(dateStr) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let d = parseDDMMYYYY(dateStr);
      if (!d || isNaN(d.getTime())) {
        d = new Date(today);
        d.setDate(d.getDate() + 30);
      } else {
        d.setHours(0, 0, 0, 0);
        let guard = 0;
        while (d.getTime() <= today.getTime() && guard < 25) {
          d.setFullYear(d.getFullYear() + 1);
          guard++;
        }
      }
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${d.getFullYear()}`;
    },
    formatTimestamp(ts) {
      if (!ts) return "—";
      try {
        return new Intl.DateTimeFormat("fr-FR", {
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date(ts));
      } catch (e) {
        return ts;
      }
    },
    // ── Autosave brouillon des ajustements en ligne ────────────────────────
    // Persiste les ajustements (curseurs) non encore enregistrés dans une
    // version, par event, dans localStorage. Restauré au retour sur la page →
    // le CA révisé est conservé sans avoir cliqué « Enregistrer la version ».
    draftKey(eventId) {
      const id = eventId || this.selectedEventId;
      return id ? `analyse:event-predict-draft:${id}` : null;
    },
    scheduleDraftSave() {
      if (this._draftTimer) clearTimeout(this._draftTimer);
      this._draftTimer = setTimeout(() => {
        this._draftTimer = null;
        this.saveDraftNow();
      }, 800);
    },
    saveDraftNow() {
      const key = this.draftKey();
      if (!key) return;
      try {
        localStorage.setItem(key, JSON.stringify({
          quantityAdjustments: this.quantityAdjustments || {},
          manualQuantities: this.manualQuantities || {},
          selectedPredictionEventIds: Array.from(this.selectedPastEventIds || []),
          selectedTimeRange: this.selectedTimeRange || null,
          // Override des champs event qui pilotent l'algo (attendance, profil) :
          // non persisté en backend → on le garde ici pour qu'un reload /
          // changement d'onglet conserve la métrique éditée jusqu'à
          // l'enregistrement de la version.
          eventOverride: this.pickEventOverride(this.selectedEvent),
          ts: new Date().toISOString(),
        }));
      } catch (_) { /* quota dépassé — on ignore */ }
    },
    clearDraft(eventId) {
      const key = this.draftKey(eventId);
      if (!key) return;
      try { localStorage.removeItem(key); } catch (_) { /* noop */ }
    },
    /**
     * Restaure le brouillon après le chargement des versions (mount + changement
     * d'event). Si un brouillon existe, ses ajustements priment sur ceux de la
     * version active (ce sont les dernières éditions en cours). Sans brouillon,
     * ne touche à rien (les ajustements de la version active restent en place).
     */
    restoreDraftAfterLoad(eventId) {
      const key = this.draftKey(eventId);
      if (!key) return false;
      let draft = null;
      try { draft = JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { draft = null; }
      if (!draft) return false;
      // Réapplique l'override event (attendance + profil) avant tout : ces
      // champs pilotent le scoring/scaling → ils doivent être en place AVANT le
      // recompute. Restauré même sans ajustements de quantité.
      let overrideApplied = false;
      if (draft.eventOverride && this.selectedEventId) {
        // Sans le nom : un brouillon localStorage antérieur à un rename ne
        // doit pas ré-imposer l'ancien nom (cf. omitEventIdentity).
        const ov = this.omitEventIdentity(draft.eventOverride);
        this.events = this.events.map((e) =>
          e.id === this.selectedEventId ? { ...e, ...ov } : e,
        );
        this.eventsHolder.value = this.events;
        overrideApplied = true;
      }
      // Recalcule la timeline (CA scalé sur ticketsScanned) sur l'event restauré.
      // Sans ajustements de quantité on s'arrête ici, mais APRÈS recompute.
      if (!draft.quantityAdjustments) {
        if (overrideApplied) this.scheduleLoadTimeline();
        return false;
      }
      this.quantityAdjustments = { ...draft.quantityAdjustments };
      this.manualQuantities = { ...(draft.manualQuantities || {}) };
      if (Array.isArray(draft.selectedPredictionEventIds)) {
        const pick = new Set(draft.selectedPredictionEventIds);
        const all = new Set((this.scoredPastEvents || []).map((s) => s.event.id));
        const exclude = new Set();
        all.forEach((id) => { if (!pick.has(id)) exclude.add(id); });
        this.excludedPastEventIds = exclude;
        // Ids sélectionnés hors top 10 = ajouts manuels (drawer).
        const manual = new Set();
        pick.forEach((id) => { if (!all.has(id)) manual.add(id); });
        this.manualIncludedPastEventIds = manual;
        // Même race boot que applyVersion : classification faite contre un
        // top-10 encore vide → mémoriser les ids exacts pour l'override,
        // reclassement au watcher scoringReady.
        this._versionPickIds = all.size === 0 && pick.size > 0 ? new Set(pick) : null;
      }
      // Restaure la fenêtre horaire de la courbe (reshape la courbe + le CA).
      if (draft.selectedTimeRange) {
        this.selectedTimeRange = { ...draft.selectedTimeRange };
      }
      this._adjustTick++;
      this._versionDirtyTick++;
      // Recompute timeline composable (CA scalé sur l'attendance restaurée).
      // Coalescé : au boot ce chemin suit applyVersion + swap granular.
      if (overrideApplied) this.scheduleLoadTimeline();
      // Recalcule côté store pour propager le CA révisé.
      this.$store.dispatch('analyse/invalidateEvent', this.selectedEventId);
      this.$store.dispatch('analyse/regeneratePredictions');
      return true;
    },
    snapshotForVersion() {
      // Fige la sélection menu items effective au moment du save (équivalent
      // de la sérialisation React Map<string, Set<string>> → Object<string,
      // string[]> :1107-1110).
      const menuConfig = {};
      const eff = this.effectiveMenuConfig || {};
      Object.keys(eff).forEach((sid) => {
        menuConfig[sid] = [...(eff[sid] || [])];
      });
      return {
        eventSnapshot: this.selectedEvent ? { ...this.selectedEvent } : null,
        totalRevenue: this.totalPredictedRevenue,
        adjustedTotalRevenue: this.totalAdjustedRevenue,
        perCapita: this.perCapitaPredicted,
        adjustedPerCapita: this.perCapitaAdjusted,
        menuConfig,
        quantityAdjustments: { ...this.quantityAdjustments },
        manualQuantities: { ...this.manualQuantities },
        selectedPredictionEventIds: Array.from(this.selectedPastEventIds),
        selectedTimeRange: { ...this.selectedTimeRange },
        // Quantités prédites par item (shop+menuItemId), MÊME agrégat que le pont
        // localStorage. Persisté en DB → le réarmement les lit cross-device sans
        // dépendre du localStorage. [] si timeline pas encore calculée :
        // versionToPayload n'envoie alors PAS la clé (évite d'écraser en update).
        predictedRecords: this.buildPredictedRecords(),
      };
    },
    /**
     * Capture, une fois par event, l'état initial (event lui-même + config
     * menu courante) afin que `performReset()` puisse restaurer ce point de
     * départ. Équivalent React :
     *   originalEventState  → setOriginalEventState (:119, 685+)
     *   originalMenuConfig  → setOriginalMenuConfig (:134, ~400-420)
     */
    captureOriginalsForEvent(eventId) {
      if (!eventId) return;
      const ev = this.events.find((e) => e.id === eventId);
      if (ev && !this.originalEventStates[eventId]) {
        this.originalEventStates = {
          ...this.originalEventStates,
          [eventId]: JSON.parse(JSON.stringify(ev)),
        };
      }
      if (!this.originalMenuConfigs[eventId]) {
        // Deep-copy de la sélection menu au moment du 1er ouvert d'event,
        // pour restauration par performReset (cf. React :1714-1722).
        const menuCopy = {};
        const cur = this.eventMenuConfig || {};
        Object.keys(cur).forEach((sid) => {
          menuCopy[sid] = Array.isArray(cur[sid]) ? [...cur[sid]] : [];
        });
        this.originalMenuConfigs = {
          ...this.originalMenuConfigs,
          [eventId]: {
            menuConfig: menuCopy,
            quantityAdjustments: { ...(this.quantityAdjustments || {}) },
            manualQuantities: { ...(this.manualQuantities || {}) },
            excludedPastEventIds: Array.from(this.excludedPastEventIds || []),
            manualIncludedPastEventIds: Array.from(this.manualIncludedPastEventIds || []),
            selectedTimeRange: { ...this.selectedTimeRange },
          },
        };
      }
    },
    /**
     * Mémorise la baseline de la version qui vient d'être chargée — sert
     * uniquement à `hasVersionChanges`. Équivalent React
     * `setOriginalVersion{MenuConfig,QuantityAdjustments,PredictionEventIds}`
     * (:137-139, :1269-1295).
     */
    captureVersionBaseline(v) {
      this.originalVersionMenuConfig = { ...(v?.menuConfig || {}) };
      this.originalVersionQuantityAdjustments = { ...(v?.quantityAdjustments || {}) };
      this.originalVersionManualQuantities = { ...(v?.manualQuantities || {}) };
      this.originalVersionPredictionEventIds = Array.isArray(
        v?.selectedPredictionEventIds,
      )
        ? [...v.selectedPredictionEventIds]
        : [];
      this.originalVersionEventSnapshot = v?.eventSnapshot
        ? JSON.parse(JSON.stringify(v.eventSnapshot))
        : (this.selectedEvent ? JSON.parse(JSON.stringify(this.selectedEvent)) : null);
      this.originalVersionTimeRange = v?.selectedTimeRange
        ? { ...v.selectedTimeRange }
        : { start: null, end: null };
      this._versionDirtyTick++;
    },
    /** Réinitialise la baseline (plus aucune version éditée). */
    clearVersionBaseline() {
      this.originalVersionMenuConfig = {};
      this.originalVersionQuantityAdjustments = {};
      this.originalVersionManualQuantities = {};
      this.originalVersionPredictionEventIds = [];
      this.originalVersionEventSnapshot = null;
      this.originalVersionTimeRange = { start: null, end: null };
      this._versionDirtyTick++;
    },
    async loadVersionsForEvent(eventId) {
      // Dédup cold load : le watcher selectedEventId programme ce même appel en
      // debounce (150 ms) pendant que loadAll l'await directement. Le GET
      // versions est déjà coalescé (single-flight), mais restoreDraftAfterLoad
      // s'exécutait 2× → jusqu'à 2 loadTimeline() directs superflus. L'appel
      // direct annule le doublon programmé pour le MÊME event (le garde
      // selectedEventId protège la navigation rapide entre events).
      if (eventId === this.selectedEventId && this._versionsLoadTimer) {
        clearTimeout(this._versionsLoadTimer);
        this._versionsLoadTimer = null;
      }
      try {
        await this.versionsApi.load(eventId);
        // Auto-load default version — une seule fois par event session
        // (cf. React :1902-1927 + autoLoadedEvents).
      if (!this.autoLoadedEvents.has(eventId)) {
          const active = this.versionsApi.getActive();
          const def = this.versionsApi.getDefault();
          const versionToApply = active || def;
          if (versionToApply) {
            await this.applyVersion(versionToApply, { persistActive: !!active, silent: true });
            this.autoLoadedEvents = new Set(this.autoLoadedEvents).add(eventId);
          }
        }
        // Après le chargement des versions : ré-applique le brouillon en cours
        // (ajustements non enregistrés) s'il existe → CA révisé conservé.
        this.restoreDraftAfterLoad(eventId);
      } catch (err) {
        // silencieux — backend KV peut être indisponible en mock/dev
        // eslint-disable-next-line no-console
        console.warn("[EVENT PREDICT] versions load failed:", err?.message);
        this.snackbarText = "Erreur de chargement des versions: " + err?.message;
        this.snackbarColor = "error";
        this.snackbar = true;
      }
    },
    /**
     * Retire les champs d'IDENTITÉ (nom) d'un snapshot/override avant de le
     * ré-appliquer sur l'event live. Le snapshot fige l'event au moment du
     * save de version (et le brouillon au moment de l'édition) : un rename
     * fait ensuite dans Settings/Profile serait silencieusement écrasé par
     * l'ancien nom à chaque ouverture. Le nom canonique de l'event gagne.
     */
    omitEventIdentity(obj) {
      if (!obj || typeof obj !== "object") return obj;
      const out = { ...obj };
      delete out.name;
      delete out.eventName;
      return out;
    },
    async applyVersion(v, { persistActive = false, silent = false } = {}) {
      if (!v) return;
      // Restaure l'event snapshot si présent (cf. React :1234-1236) — sans le
      // nom : voir omitEventIdentity (bug « ancien nom qui revient »).
      if (v.eventSnapshot && this.selectedEventId) {
        const snap = this.omitEventIdentity(v.eventSnapshot);
        this.events = this.events.map((e) =>
          e.id === this.selectedEventId
            ? { ...e, ...snap, id: e.id }
            : e,
        );
        this.eventsHolder.value = this.events;
        this.$store.dispatch('analyse/applyEventPredictVersion', {
          eventId: this.selectedEventId,
          version: v,
        });
      }
      // Restaure la sélection menu items (cf. React :1239-1245).
      const restoredMenu = {};
      const srcMenu = v.menuConfig || {};
      Object.keys(srcMenu).forEach((sid) => {
        const arr = srcMenu[sid];
        restoredMenu[sid] = Array.isArray(arr) ? [...arr] : [];
      });
      this.eventMenuConfig = restoredMenu;
      this.quantityAdjustments = { ...(v.quantityAdjustments || {}) };
      this.manualQuantities = { ...(v.manualQuantities || {}) };
      // Restaure la fenêtre horaire de la courbe enregistrée dans la version.
      this.selectedTimeRange = v.selectedTimeRange
        ? { ...v.selectedTimeRange }
        : { start: null, end: null, startPct: null, endPct: null };
      const pickIds = new Set(v.selectedPredictionEventIds || []);
      const allIds = new Set(this.scoredPastEvents.map((s) => s.event.id));
      const exclude = new Set();
      allIds.forEach((id) => {
        if (!pickIds.has(id)) exclude.add(id);
      });
      this.excludedPastEventIds = exclude;
      // Ids sélectionnés hors top 10 = ajouts manuels (drawer).
      const manualIds = new Set();
      pickIds.forEach((id) => { if (!allIds.has(id)) manualIds.add(id); });
      this.manualIncludedPastEventIds = manualIds;
      // Race boot : version auto-appliquée AVANT le scoring réel (granular
      // encore en vol) → allIds vide, la classification ci-dessus est fausse
      // (tout part en « manuel »). On mémorise les ids exacts : loadTimeline
      // les force en override, le watcher scoringReady reclasse ensuite.
      this._versionPickIds = allIds.size === 0 && pickIds.size > 0 ? new Set(pickIds) : null;
      this.versionsApi.currentEditingVersionId.value = v.id;
      if (persistActive && this.selectedEventId) {
        await this.versionsApi.setActive(this.selectedEventId, v.id);
        this.$store.dispatch('analyse/setActivePredictionVersion', {
          eventId: this.selectedEventId,
          versionId: v.id,
        });
      }
      // Mémorise baseline pour détection des changements (cf. React :1269-1295)
      this.captureVersionBaseline(v);
      this._adjustTick++;
      this._versionDirtyTick++;
      // COALESCÉ (debounce 60 ms) et non `await loadTimeline()` direct : au
      // boot, applyVersion + restoreDraft + swap granular tombent en cascade ;
      // chaque run direct avortait le précédent et le spinner restait allumé.
      this.scheduleLoadTimeline();
      this.$store.dispatch('analyse/invalidateEvent', this.selectedEventId);
      this.$store.dispatch('analyse/regeneratePredictions');
      if (!silent) {
        this.snackbarText = `Version active : ${v.name}`;
        this.snackbarColor = "success";
        this.snackbar = true;
      }
    },
    /**
     * Charge une version après confirmation si une autre version est en
     * cours d'édition ET modifiée (cf. React :1211-1223 handleLoadVersion).
     */
    async handleLoadVersion(v) {
      if (!v) return;
      const cur = this.currentEditingVersionId;
      if (cur && cur !== v.id && this.hasVersionChanges) {
        const ok = await this.askConfirm({
          title: 'Modifications non sauvegardées',
          message:
            'Vous éditez actuellement une version. Toute modification non sauvegardée sera perdue si vous continuez. Voulez-vous continuer ?',
          confirmLabel: 'Continuer',
        });
        if (!ok) return;
      }
      // Chargement explicite d'une version → on repart propre (brouillon obsolète).
      this.clearDraft();
      await this.applyVersion(v, { persistActive: true });
    },
    /**
     * Reset déclenché par le bouton "Réinitialiser". Garde-fou si une version
     * est en cours d'édition avec changements (cf. React :1685-1697).
     */
    async handleReset() {
      if (!this.selectedEventId) return;
      if (this.currentEditingVersionId && this.hasVersionChanges) {
        const ok = await this.askConfirm({
          title: 'Modifications non sauvegardées',
          message:
            'Vous éditez une version avec des changements non sauvegardés. Réinitialiser va les écraser. Continuer ?',
          confirmLabel: 'Réinitialiser',
        });
        if (!ok) return;
      }
      this.performReset();
    },
    /**
     * Restaure l'event + la config menu initiale capturés à l'ouverture
     * (cf. React :1700-1733 performReset).
     */
    performReset() {
      const eid = this.selectedEventId;
      if (!eid) return;
      const origEv = this.originalEventStates[eid];
      if (origEv) {
        this.events = this.events.map((e) => (e.id === eid ? { ...origEv } : e));
      }
      const origMenu = this.originalMenuConfigs[eid];
      if (origMenu) {
        this.quantityAdjustments = { ...(origMenu.quantityAdjustments || {}) };
        this.manualQuantities = { ...(origMenu.manualQuantities || {}) };
        this.excludedPastEventIds = new Set(origMenu.excludedPastEventIds || []);
        this.manualIncludedPastEventIds = new Set(origMenu.manualIncludedPastEventIds || []);
        // Restaure la sélection menu items (vide = re-dérivation auto depuis
        // predictedRecords ; cf. React :1715-1717).
        const restored = {};
        const m = origMenu.menuConfig || {};
        Object.keys(m).forEach((sid) => {
          restored[sid] = Array.isArray(m[sid]) ? [...m[sid]] : [];
        });
        this.eventMenuConfig = restored;
      } else {
        this.quantityAdjustments = {};
        this.manualQuantities = {};
        this.excludedPastEventIds = new Set();
        this.manualIncludedPastEventIds = new Set();
        this.eventMenuConfig = {};
      }
      this.versionsApi.currentEditingVersionId.value = null;
      this._versionPickIds = null;
      this.clearVersionBaseline();
      // Réinitialisation → on supprime le brouillon et on annule un autosave en attente.
      if (this._draftTimer) { clearTimeout(this._draftTimer); this._draftTimer = null; }
      this.clearDraft(eid);
      this._adjustTick++;
    },
    // ---------- Vuetify dialog helpers (cf. React §13.5) ----------
    askPrompt({ title = '', placeholder = '', value = '', confirmLabel = 'OK', message = '' } = {}) {
      return new Promise((resolve) => {
        this.dlg = {
          open: true,
          type: 'prompt',
          title, message, placeholder, value, confirmLabel,
          _resolve: resolve,
        };
      });
    },
    askConfirm({ title = 'Confirmer ?', message = '', confirmLabel = 'OK' } = {}) {
      return new Promise((resolve) => {
        this.dlg = {
          open: true,
          type: 'confirm',
          title, message, value: '', placeholder: '', confirmLabel,
          _resolve: resolve,
        };
      });
    },
    /** Dialog de saisie de date (input natif type=date → ISO yyyy-mm-dd). */
    askDate({ title = '', placeholder = '', value = '', confirmLabel = 'OK', message = '' } = {}) {
      return new Promise((resolve) => {
        this.dlg = {
          open: true,
          type: 'date',
          title, message, placeholder, value, confirmLabel,
          _resolve: resolve,
        };
      });
    },
    /**
     * Popup d'INFORMATION simple (un seul bouton OK, pas d'annulation). Réutilise
     * le dialog Vuetify universel. Le message s'affiche avec `white-space:
     * pre-line` → les retours à la ligne `\n` sont rendus tels quels.
     */
    askInfo({ title = 'Information', message = '', confirmLabel = 'OK' } = {}) {
      return new Promise((resolve) => {
        this.dlg = {
          open: true,
          type: 'info',
          title, message, value: '', placeholder: '', confirmLabel,
          _resolve: resolve,
        };
      });
    },
    /**
     * Popup F3 — message identique pour tout item en quantité manuelle :
     * l'algorithme ne prévoit aucune vente, l'utilisateur fixe la quantité à la
     * main. Déclenché par l'icône d'info à côté du curseur « Quantité manuelle ».
     */
    showManualInfo() {
      this.askInfo({
        title: this.t('epManualQtyInfoTitle'),
        message: this.t('epManualQtyInfoMessage'),
      });
    },
    /**
     * Popup F4 — explique les étapes de l'algorithme qui sélectionne les
     * évènements passés utilisés pour prédire les ventes. Déclenché par l'icône
     * d'info à côté du compteur « Prédiction basée sur N / M évènements ».
     */
    showAlgoInfo() {
      this.askInfo({
        title: this.t('epAlgoInfoTitle'),
        message: this.t('epAlgoInfoMessage'),
      });
    },
    onDialogConfirm() {
      const r = this.dlg._resolve;
      // prompt ET date renvoient la valeur saisie ; confirm/info renvoient true.
      const isValue = this.dlg.type === 'prompt' || this.dlg.type === 'date';
      const result = isValue ? (this.dlg.value || '').trim() : true;
      this.dlg = { ...this.dlg, open: false, _resolve: null };
      if (r) r(result);
    },
    onDialogCancel() {
      const r = this.dlg._resolve;
      const isValue = this.dlg.type === 'prompt' || this.dlg.type === 'date';
      this.dlg = { ...this.dlg, open: false, _resolve: null };
      if (r) r(isValue ? null : false);
    },

    /**
     * Bouton « Save » principal : route entre création et mise à jour pour
     * NE PAS créer de doublon. Si une version existante est en cours d'édition
     * (currentEditingVersionId présent ET dans la liste), on fait un PATCH
     * (onUpdateVersion). Sinon (brouillon, aucune version chargée) on crée une
     * nouvelle version (onSaveVersion → POST). Après un premier POST, save()
     * positionne currentEditingVersionId → les Save suivants mettent à jour.
     */
    async onSaveOrUpdate() {
      const editingId = this.currentEditingVersionId;
      const isExisting = editingId && (this.versions || []).some((v) => v.id === editingId);
      if (isExisting) {
        await this.onUpdateVersion(editingId);
      } else {
        await this.onSaveVersion();
      }
    },
    /** Prochain nom « Version N » basé sur le MAX existant (pas sur length, qui
     *  retombe à « Version 1 » si la liste est momentanément vide → doublons). */
    nextVersionName() {
      const nums = (this.versions || []).map((v) => {
        const m = ((v && v.name) || "").match(/^Version\s+(\d+)$/);
        return m ? Number(m[1]) : 0;
      });
      const max = nums.length ? Math.max(...nums) : 0;
      return `Version ${Math.max(max, this.versions ? this.versions.length : 0) + 1}`;
    },
    async onSaveVersion() {
      if (!this.selectedEventId) return;
      const name = await this.askPrompt({
        title: "Nom de la version",
        placeholder: "Nom",
        value: this.nextVersionName(),
      });
      if (!name) return;
      const snap = { ...this.snapshotForVersion(), name };
      try {
        const saved = await this.versionsApi.save(this.selectedEventId, snap);
        if (saved?.id) {
          await this.versionsApi.setActive(this.selectedEventId, saved.id);
          // Fusion active/défaut : la nouvelle version devient aussi la défaut.
          try { await this.versionsApi.setDefault(this.selectedEventId, saved.id); } catch (_) { /* localStorage fallback */ }
          this.$store.dispatch('analyse/setActivePredictionVersion', {
            eventId: this.selectedEventId,
            versionId: saved.id,
          });
          this.captureVersionBaseline(saved);
          // Persiste les records sous cette version (scénario) pour le réarmement.
          this.persistPredictedRecordsForRestock(saved.id);
        }
        // L'état est maintenant capturé dans une version → brouillon obsolète.
        if (this._draftTimer) { clearTimeout(this._draftTimer); this._draftTimer = null; }
        this.clearDraft();
        // Pas de invalidate/regenerate ici : éviterait le même drift que Update
        // (recompute live après save). La barre Predict d'Analyse se resynchronise
        // au mount/navigation (version en miroir localStorage).
        this.snackbarText = "Version enregistrée avec succès";
        this.snackbarColor = "success";
        this.snackbar = true;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[EVENT PREDICT] save version failed:", err);
        this.snackbarText = "Échec de l'enregistrement (KV indisponible).";
        this.snackbarColor = "error";
        this.snackbar = true;
      }
    },
    onLoadVersion(v) {
      // Passe par handleLoadVersion qui ajoute le garde-fou
      // "modifications non sauvegardées" (cf. React :1211-1223).
      this.handleLoadVersion(v);
    },
    /**
     * Radio version : sélectionne (charge + recharge prédiction/quantités) la
     * version ET la fixe comme défaut (fusion active/défaut). Si le garde
     * "modifications non sauvegardées" annule le chargement, on ne touche à rien.
     */
    async onSelectVersion(v) {
      if (!v || this.currentEditingVersionId === v.id) return;
      await this.handleLoadVersion(v);
      // Chargement abouti (non annulé) → la version active devient la défaut.
      if (this.currentEditingVersionId === v.id && this.defaultVersionId !== v.id) {
        try { await this.versionsApi.setDefault(this.selectedEventId, v.id); } catch (_) { /* localStorage fallback */ }
      }
    },
    async onUpdateVersion(versionId) {
      if (!this.selectedEventId) return;
      const snap = this.snapshotForVersion();
      try {
        await this.versionsApi.update(this.selectedEventId, versionId, snap);
        // État capturé dans la version → brouillon obsolète.
        if (this._draftTimer) { clearTimeout(this._draftTimer); this._draftTimer = null; }
        this.clearDraft();
        // SAUVEGARDE PURE : AUCUN effet de bord sur l'état live. On NE déclenche
        // PAS invalidateEvent / regeneratePredictions — ces recomputes ré-overlay
        // la version (rescale factor) + rechargent la timeline APRÈS la baseline,
        // ce qui faisait dériver les % (280→215, non-idempotent) et rendait le
        // badge « Non sauvegardé » permanent. La sync des barres Predict d'Analyse
        // se fait au mount/navigation d'AnalyseView (la version est en miroir LS).
        const effectiveId = this.currentEditingVersionId || versionId;
        // Baseline = snapshot EXACT envoyé → hasUnsavedChanges = false immédiatement.
        const v = (this.versions || []).find((x) => x.id === effectiveId) || {};
        this.captureVersionBaseline({ ...v, ...snap });
        // Écriture SILENCIEUSE des records pour le réarmement (pas une navigation).
        this.persistPredictedRecordsForRestock(effectiveId);
        this.snackbarText = "Version enregistrée";
        this.snackbarColor = "success";
        this.snackbar = true;
      } catch (err) {
        this.snackbarText = "Échec de la mise à jour.";
        this.snackbarColor = "error";
        this.snackbar = true;
      }
    },
    async onRenameVersion(v) {
      if (!this.selectedEventId) return;
      const name = await this.askPrompt({
        title: "Renommer la version",
        placeholder: "Nouveau nom",
        value: v.name,
      });
      if (!name || name === v.name) return;
      try {
        await this.versionsApi.rename(this.selectedEventId, v.id, name);
        this.snackbarText = "Version renommée avec succès";
        this.snackbarColor = "success";
        this.snackbar = true;
      } catch (err) {
        this.snackbarText = "Échec du renommage.";
        this.snackbarColor = "error";
        this.snackbar = true;
      }
    },
    /**
     * Génère un URL unique pour une version (deep-link) et le copie dans le
     * presse-papiers. Forme :
     *   /spaces/<spaceId>/predict?event=<eventId>&version=<versionId>
     *
     * À l'ouverture de l'URL, EventPredictView lit les query params (cf.
     * `applyDeepLinkFromRoute`) et auto-sélectionne event + version + tab.
     * Permet à un autre utilisateur (ou à toi-même sur autre machine) de
     * retrouver exactement la même prédiction. Stockage version : voir
     * `useEventPredictVersions` (API KV + localStorage miroir).
     */
    async onShareVersion(v) {
      if (!v || !this.selectedEventId) return;
      const spaceId = this.space?.id || this.$route?.params?.spaceId;
      if (!spaceId) {
        this.snackbarText = "Espace introuvable — impossible de générer le lien.";
        this.snackbarColor = "error";
        this.snackbar = true;
        return;
      }
      const url = new URL(window.location.origin + `/spaces/${spaceId}/predict`);
      url.searchParams.set('event', this.selectedEventId);
      url.searchParams.set('version', v.id);
      const link = url.toString();
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(link);
        } else {
          const ta = document.createElement('textarea');
          ta.value = link;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
        }
        this.snackbarText = `Lien copié : ${link}`;
        this.snackbarColor = "success";
        this.snackbar = true;
      } catch (err) {
        this.snackbarText = `Lien : ${link}`;
        this.snackbarColor = "info";
        this.snackbar = true;
      }
    },
    /**
     * À l'arrivée sur la vue, applique ?event=<id>&version=<id> si présent
     * dans la route. Permet le partage / la vérification de versions
     * sauvegardées.
     */
    applyDeepLinkFromRoute() {
      const q = this.$route?.query || {};
      const eventId = q.event || q.eventId;
      const versionId = q.version || q.versionId;
      const configId = q.configuration || q.config;
      if (eventId && this.events.find((e) => e.id === eventId)) {
        this.selectedEventId = eventId;
        this.multiSelectIds = [eventId];
        // Applique la config du lien AVANT que le watcher selectedEventId ne
        // déclenche loadTimeline (config = hard filter → prévision reproductible).
        if (configId) {
          this.events = this.events.map((e) =>
            e.id === eventId ? { ...e, configurationId: configId } : e,
          );
          this.eventsHolder.value = this.events;
        }
      }
      if (versionId) {
        // Délai pour que loadVersionsForEvent ait peuplé `versions`.
        this.$nextTick(async () => {
          await new Promise((r) => setTimeout(r, 100));
          const v = (this.versions || []).find((x) => x.id === versionId);
          if (v) {
            this.handleLoadVersion(v);
            this.snackbarText = `Version "${v.name}" chargée depuis le lien partagé.`;
            this.snackbarColor = "success";
            this.snackbar = true;
          } else {
            this.snackbarText = `Version ${versionId} introuvable (locale ou supprimée).`;
            this.snackbarColor = "warning";
            this.snackbar = true;
          }
        });
      }
    },
    async onDuplicateVersion(versionId) {
      if (!this.selectedEventId) return;
      try {
        await this.versionsApi.duplicate(this.selectedEventId, versionId);
        this.snackbarText = "Version dupliquée avec succès";
        this.snackbarColor = "success";
        this.snackbar = true;
      } catch (err) {
        this.snackbarText = "Échec de la duplication.";
        this.snackbarColor = "error";
        this.snackbar = true;
      }
    },
    async onDeleteVersion(versionId) {
      if (!this.selectedEventId) return;
      const ok = await this.askConfirm({
        title: "Supprimer cette version ?",
        message: "Cette action est irréversible.",
        confirmLabel: "Supprimer",
      });
      if (!ok) return;
      const wasEditingDeleted = this.currentEditingVersionId === versionId;
      try {
        await this.versionsApi.remove(this.selectedEventId, versionId);
        // Si on éditait la version qu'on vient de supprimer, on retombe sur
        // l'état initial de l'event (cf. React :1622-1625).
        if (wasEditingDeleted) {
          this.performReset();
        }
        this.snackbarText = "Version supprimée avec succès";
        this.snackbarColor = "success";
        this.snackbar = true;
      } catch (err) {
        this.snackbarText = "Échec de la suppression.";
        this.snackbarColor = "error";
        this.snackbar = true;
      }
    },
    async onSetDefault(versionId) {
      if (!this.selectedEventId) return;
      try {
        if (this.defaultVersionId === versionId) {
          await this.versionsApi.clearDefault(this.selectedEventId);
          this.snackbarText = "Version par défaut retirée";
        } else {
          await this.versionsApi.setDefault(this.selectedEventId, versionId);
          this.snackbarText = "Version par défaut définie";
          // Rend cette version « éditable » : le bouton Update apparaît pour elle
          // et s'active dès qu'on modifie les ajustements (sinon il restait
          // masqué/inactif après « définir par défaut »).
          const v = (this.versions || []).find((x) => x.id === versionId);
          if (v) {
            this.versionsApi.currentEditingVersionId.value = versionId;
            this.captureVersionBaseline(v);
          }
        }
        // Invalide caches + re-génère les prédictions pour que la vue Predict
        // affiche immédiatement les valeurs de la version par défaut.
        this.$store.dispatch('analyse/invalidateEvent', this.selectedEventId);
        this.$store.dispatch('analyse/regeneratePredictions');
        this.snackbarColor = "success";
        this.snackbar = true;
      } catch (err) {
        this.snackbarText = "Échec de l'opération.";
        this.snackbarColor = "error";
        this.snackbar = true;
      }
    },
  },
};
</script>

<style scoped>
/* Lot 2 — contexte lecture seule de la popup de remapping. */
.ep-remap-context {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem 1rem;
  font-size: 0.78rem;
  color: var(--muted-foreground, #64748b);
}
/* En-têtes de section h2 (conformité React :2236, 2265). */
.ep-section-heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 24px 0 12px 0;
}
.ep-section-h2 {
  font-size: 20px;
  font-weight: 600;
  margin: 0;
  color: var(--foreground, inherit);
}
.ep-predict-section-tabs {
  margin-top: 16px;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}
.ep-predict-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--ep-border, #e2e8f0);
  flex-wrap: wrap;
}
.ep-view-mode-tabs {
  width: auto;
}
/* Sous-contrôle d'affichage (Shop / Item) clairement étiqueté, distinct des
   onglets principaux Configuration / Stock up. */
.ep-view-mode-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ep-view-mode-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted-foreground, #6b7280);
  white-space: nowrap;
}
@media (max-width: 700px) {
  .ep-view-mode-wrap {
    width: 100%;
  }
}
:deep(.ep-predict-section-tabs-list) {
  height: 42px;
  border-radius: 9999px;
  padding: 4px;
}
:deep(.ep-predict-section-trigger) {
  flex: 0 0 auto;
  min-width: 190px;
  padding-inline: 18px;
  font-size: 0.9375rem;
  font-weight: 650;
}
:deep(.ep-predict-section-trigger[data-state='active']) {
  background-color: var(--df-primary, var(--primary, #3b82f6)) !important;
  color: var(--df-primary-foreground, #fff) !important;
}
:deep(.ep-predict-section-trigger[data-state='active'] .v-icon) {
  color: var(--df-primary-foreground, #fff) !important;
}
:deep(.ep-predict-section-panel) {
  min-width: 0;
  max-height: clamp(420px, 58vh, 800px);
  overflow-y: auto;
  padding-right: 4px;
  scrollbar-gutter: auto;
}
@media (max-width: 700px) {
  :deep(.ep-predict-section-tabs-list) {
    width: 100%;
  }
  :deep(.ep-predict-section-trigger) {
    flex: 1 1 0;
    min-width: 0;
  }
  .ep-view-mode-tabs {
    width: 100%;
  }
}

/* === EventTimelineChart en contexte EventPredict ===
 * Le composant partagé impose 80vh. On cap chart-wrap pour ne pas déborder.
 * Le nombre de séries est limité à 15 + "Autres" dans le composant lui-même
 * (cf. TOP_N dans EventTimelineChart.vue), ce qui maintient la légende
 * compacte (~3 lignes max). */
.ep-timeline-chart :deep(.text-h6) {
  /* Titre « Timeline — <event> » à l'échelle Space Menus (16px/700).
     Scopé ici pour ne PAS toucher Analyse (même composant partagé).
     !important : les utilitaires typo Vuetify en portent aussi. */
  font-size: 16px !important;
  font-weight: 700 !important;
  line-height: 1.3 !important;
}
/* Champs heures Début/Fin compacts et harmonisés (pill 13px, hauteur ~36px,
   largeur bornée) — même scope EventPredict-only que le titre ci-dessus. */
.ep-timeline-chart :deep(.time-range-row .time-input) {
  flex: 0 0 auto;
  /* 118px tronquait label + valeur (icône + paddings Vuetify) : il faut
     ~150px pour « Début » + horloge + « 15:52 » à 13px. */
  max-width: 180px;
  min-width: 150px;
}
.ep-timeline-chart :deep(.time-range-row .time-input .v-field) {
  --v-field-padding-start: 10px;
  --v-field-padding-end: 10px;
}
.ep-timeline-chart :deep(.time-range-row .time-input .v-field) {
  border-radius: 9999px;
  font-size: 13px;
}
.ep-timeline-chart :deep(.time-range-row .time-input .v-field__input) {
  min-height: 36px;
  padding-top: 2px;
  padding-bottom: 2px;
  font-size: 13px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.ep-timeline-chart :deep(.time-range-row .time-input .v-field__prepend-inner .v-icon) {
  font-size: 15px;
}
.ep-timeline-chart :deep(.time-range-row .time-input .v-label) {
  font-size: 11px;
}
.ep-timeline-chart {
  display: block;
  flex-shrink: 0;
}
.ep-timeline-chart :deep(.v-card) {
  border: 1px solid #e2e8f0 !important;
  border-radius: 18px !important;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04) !important;
  background: #ffffff !important;
}
.ep-timeline-chart :deep(.chart-wrap) {
  min-height: 340px;
  height: 340px;
  max-height: 340px;
  position: relative;
}
.ep-timeline-chart :deep(canvas) {
  max-width: 100% !important;
}
.ep-timeline-chart :deep(.pill-toggle) {
  border-radius: 9999px;
  overflow: hidden;
}
@media (min-height: 900px) {
  .ep-timeline-chart :deep(.chart-wrap) {
    height: 420px;
    max-height: 420px;
  }
}
/* Toggle Shop View / Item View (Configuration settings) */
.ep-vm-btn {
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.8125rem !important;
}
/* Toggle Upcoming / Past (sidebar) */
.ep-sb-tabs {
  width: 100%;
}
.ep-sb-tab-btn {
  flex: 1 1 0;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.75rem !important;
}
.ep-section-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 14px;
}
.event-predict-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  /* Décalé par le rail Dashboard (permanent) qui POUSSE au lieu de recouvrir.
     La var --v-layout-left de Vuetify vit sur .v-main uniquement ; cet overlay
     est teleporté sur <body> (hors .v-main) donc DashboardView écrit la largeur
     réelle du drawer sur documentElement via --df-nav-left. Rail=70px,
     déployé=256px, fermé/mobile=0. Transition = suit l'animation du drawer. */
  left: var(--df-nav-left, 0px);
  background: #f6f8fb;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: left 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.event-predict-overlay :deep(*) {
  scrollbar-width: thin;
  scrollbar-color: rgba(15, 23, 42, 0.34) transparent;
}
.event-predict-overlay :deep(*)::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}
.event-predict-overlay :deep(*)::-webkit-scrollbar-track {
  background: transparent;
}
.event-predict-overlay :deep(*)::-webkit-scrollbar-thumb {
  min-height: 44px;
  border: 2px solid transparent;
  border-radius: 9999px;
  background: rgba(15, 23, 42, 0.28);
  background-clip: content-box;
}
.event-predict-overlay :deep(*)::-webkit-scrollbar-thumb:hover {
  background: rgba(15, 23, 42, 0.46);
  background-clip: content-box;
}
.event-predict-overlay :deep([data-slot="scroll-area-scrollbar"]),
.event-predict-overlay :deep([data-slot="scroll-area-corner"]) {
  display: none;
}
.ep-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 24px;
  min-height: 64px;
  border-bottom: 1px solid #e2e8f0;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(10px);
  box-shadow: 0 1px 0 rgba(15, 23, 42, 0.03);
}
.ep-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.ep-brand-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.ep-brand-text {
  font-size: 1.05rem;
  font-weight: 800;
  color: #ff3131;
  white-space: nowrap;
}
/* Parité WorkspaceAppHeader .wsh-nav-trigger (Restock / Inventory). */
.ep-nav-trigger {
  border-radius: 10px !important;
}
.ep-nav-trigger:hover {
  background: rgba(255, 49, 49, 0.08);
  color: #ff3131;
}
.ep-header-user {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 8px;
}
.ep-header-user:hover {
  background: rgba(15, 23, 42, 0.06);
}
.ep-title h1 {
  font-size: 1.15rem;
  font-weight: 750;
  margin: 0;
  color: #0f172a;
  letter-spacing: 0;
}
.ep-subtitle {
  margin: 0;
  font-size: 0.8125rem;
  color: #64748b;
}
.ep-header-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
.ep-header-chip {
  display: inline-flex;
  align-items: center;
  max-width: 220px;
  min-height: 28px;
  padding: 4px 10px;
  border: 1px solid #dbe4ee;
  border-radius: 9999px;
  background: #f8fafc;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 650;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ep-header-chip-strong {
  max-width: 320px;
  background: #eef2ff;
  border-color: #c7d2fe;
  color: #3730a3;
}
.ep-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted-foreground, #6b7280);
}
.ep-body {
  flex: 1;
  display: flex;
  flex-direction: row;
  gap: 18px;
  padding: 18px;
  overflow: hidden;
  min-height: 0;
}
.ep-side {
  width: 312px;
  flex-shrink: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
  scrollbar-gutter: auto;
  transition: opacity 0.18s ease;
}
/* Bouton de repli de la colonne gauche : chip ancré sur la gouttière.
   Absolu sur .ep-body (qui ne défile pas) → reste visible pendant le scroll
   du centre. La colonne gauche se réduit à 0 via grid-template-columns. */
.ep-side-toggle {
  position: absolute;
  top: 50%;
  left: 300px; /* ≈ largeur colonne (292) + moitié gouttière (18/2) */
  transform: translateY(-50%);
  z-index: 6;
  width: 24px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  background: #ffffff;
  color: #64748b;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.08);
  transition: background-color 0.15s, color 0.15s, border-color 0.15s, left 0.2s ease;
}
.ep-side-toggle:hover {
  background: #f1f5f9;
  color: #0f172a;
  border-color: #cbd5e1;
}
/* Repliée : track gauche à 0, le centre s'élargit ; le bouton glisse à gauche. */
.ep-body.ep-side-collapsed {
  grid-template-columns: 0 minmax(0, 1fr) 340px;
}
.ep-body.ep-side-collapsed .ep-side {
  opacity: 0;
  overflow: hidden;
  padding: 0;
  pointer-events: none;
}
.ep-body.ep-side-collapsed .ep-side-toggle {
  left: 4px;
}
.ep-event-selector-card {
  border-radius: 18px !important;
  border-color: #d9e2ec !important;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  background: #ffffff;
  overflow:auto !important;
}
.ep-event-selector-header {
  padding: 14px 18px 8px !important;
}
.ep-event-selector-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 1rem;
  font-weight: 750;
  color: #0f172a;
}
.ep-event-selector-subtitle {
  margin: 8px 0 0;
  display: inline-flex;
  width: fit-content;
  min-height: 24px;
  align-items: center;
  padding: 3px 9px;
  border: 1px solid #dbe4ee;
  border-radius: 9999px;
  background: #f8fafc;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
}
.ep-event-selector-hint {
  margin: 4px 0 0;
  font-size: 0.75rem;
  line-height: 1.4;
  color: #64748b;
}
/* ===== Sélecteur recherche + calendrier secondaire ===== */
.ep-event-search {
  width: 100%;
}
/* Search box alignée Market Price List (référence app) : fond blanc, coins
   droits (square), focus rouge. */
.ep-event-search :deep(.v-field),
.ep-empty-state-select :deep(.v-field) {
  border-radius: 0;
  background: #fff;
  transition: border-color 0.2s ease;
}
.v-theme--dataFridayDark .ep-event-search :deep(.v-field),
.v-theme--dataFridayDark .ep-empty-state-select :deep(.v-field) {
  background: #1e293b;
}
.ep-event-search :deep(.v-field:hover),
.ep-event-search :deep(.v-field--focused),
.ep-empty-state-select :deep(.v-field:hover),
.ep-empty-state-select :deep(.v-field--focused) {
  border-color: var(--ep-primary);
}
.ep-event-opt-badge {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 9999px;
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.ep-event-opt-badge.is-future {
  background: #dbeafe;
  color: #1d4ed8;
}
.ep-event-opt-badge.is-past {
  background: #f1f5f9;
  color: #64748b;
}
.ep-calendar-wrap {
  min-width: 0;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 2px 4px 4px;
  background: #ffffff;
  /* Pas de box-shadow (demande UX) — calendrier plat et compact. */
}
.ep-calendar-wrap .ep-date-picker {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin: 0;
  box-shadow: none;
  background: transparent;
}
/* Calendrier en lecture seule : on neutralise les clics sur les jours (affichage
   seul), tout en gardant la navigation mois (flèches restent cliquables). */
.ep-date-picker--readonly :deep(.v-date-picker-month__day .v-btn) {
  pointer-events: none;
}
/* Chips des évènements utilisés + leur CA (sous le calendrier). */
.ep-used-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.ep-used-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid #e2e8f0;
  border-radius: 9999px;
  background: #f8fafc;
  font-size: 0.72rem;
  line-height: 1.2;
}
.ep-used-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 130px;
  color: #475569;
}
.ep-used-chip-ca {
  font-weight: 700;
  color: var(--df-primary, #7c3aed);
  white-space: nowrap;
}
/* ===== Sidebar Event Details mini-card (cf. React :1999-2056) ===== */
.ep-side-event-card {
  flex-shrink: 0;
}
.ep-side-event-content {
  padding: 16px !important;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ep-side-event-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.ep-side-event-name {
  font-size: 0.875rem;
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
  word-break: break-word;
}
.ep-side-badge {
  display: inline-block;
  padding: 1px 8px;
  font-size: 0.6875rem;
  border-radius: 999px;
  white-space: nowrap;
}
.ep-side-badge-secondary {
  background: #e5e7eb;
  color: #111827;
}
.ep-side-badge-outline {
  border: 1px solid var(--border, #e5e7eb);
  color: var(--muted-foreground, #6b7280);
}
/* Indicateur "modifications non sauvegardées" (Save réactif). */
.ep-side-badge-dirty {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fde68a;
  font-weight: 700;
}
/* Badge "Active" sur la carte de la version actuellement sélectionnée. */
.ep-side-badge-active {
  margin-left: 6px;
  background: var(--df-primary, var(--primary, #3b82f6));
  color: var(--df-primary-foreground, #fff);
  font-weight: 700;
  padding: 1px 8px;
  font-size: 0.6875rem;
  border-radius: 999px;
  white-space: nowrap;
}
.ep-metrics-kicker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
/* Bouton Save mis en avant quand il y a des changements à enregistrer. */
.ep-save-dirty {
  box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.45);
  animation: ep-save-pulse 1.8s ease-in-out infinite;
}
@keyframes ep-save-pulse {
  0%, 100% { box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.35); }
  50% { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.6); }
}
@media (prefers-reduced-motion: reduce) {
  .ep-save-dirty { animation: none; }
}
.ep-side-event-date {
  font-size: 0.75rem;
  color: var(--muted-foreground, #6b7280);
}
.ep-side-event-stats {
  padding-top: 8px;
  border-top: 1px solid var(--border, #e5e7eb);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ep-side-event-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8125rem;
}
.ep-side-event-row-val {
  font-weight: 600;
}
.ep-muted {
  color: var(--muted-foreground, #6b7280);
}
.ep-side-event-actions {
  display: flex;
  gap: 8px;
  padding-top: 4px;
}
.ep-side-event-btn {
  flex: 1 1 0;
}
/* ===== Zone Version (sépare actions version vs infos évènement) ===== */
.ep-side-version-zone {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--border, #e5e7eb);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ep-side-version-zone-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ep-side-version-zone-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted-foreground, #6b7280);
}
.ep-side-version-zone-hint {
  margin: 0;
  font-size: 0.6875rem;
  line-height: 1.4;
  color: var(--muted-foreground, #6b7280);
}
/* ===== CTA Stock up → Réarmement ===== */
.ep-stockup-cta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  padding: 12px 14px;
  border: 1px solid #d9e6f7;
  border-radius: 12px;
  background: linear-gradient(180deg, #f0f7ff 0%, #ffffff 100%);
}
.ep-stockup-cta-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ep-stockup-cta-text strong {
  font-size: 0.875rem;
}
.ep-stockup-cta-text span {
  font-size: 0.75rem;
  color: var(--muted-foreground, #6b7280);
}
.ep-stockup-cta-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.ep-stockup-cta-btn {
  flex-shrink: 0;
}
/* Lien Configuration settings → Inventaire de l'espace (bas du panneau config). */
.ep-config-inv-link {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px dashed #e2e8f0;
}
.ep-config-inv-link a {
  display: inline-flex;
  align-items: center;
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--primary, #ff3131);
  text-decoration: none;
}
.ep-config-inv-link a:hover {
  text-decoration: underline;
}
/* ===== Sidebar Saved Versions cards (cf. React :2060-2158) ===== */
.ep-side-versions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ep-side-versions-label {
  font-size: 0.875rem;
  font-weight: 500;
}
.ep-side-version-card {
  background: var(--muted, #f9fafb);
  transition: box-shadow 120ms;
}
.ep-side-version-card.is-editing {
  box-shadow: 0 0 0 2px var(--df-primary, var(--primary, #3b82f6));
  background: color-mix(in srgb, var(--df-primary, var(--primary, #3b82f6)) 8%, var(--muted, #f9fafb));
}
.ep-side-version-header {
  padding: 12px 12px 8px !important;
}
.ep-side-version-head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ep-side-version-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1 1 auto;
  min-width: 0;
}
.ep-side-radio {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: 2px solid currentColor;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted-foreground, #6b7280);
  padding: 0;
  transition: border-color 120ms;
}
.ep-side-radio.is-checked {
  border-color: var(--primary, #3b82f6);
}
.ep-side-radio:hover {
  border-color: var(--primary, #3b82f6);
}
.ep-side-radio-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--primary, #3b82f6);
}
.ep-side-version-name {
  font-size: 0.875rem;
  font-weight: 600;
  flex: 1 1 auto;
  min-width: 0;
  text-align: left;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ep-side-version-name:hover {
  color: var(--primary, #3b82f6);
}
.ep-side-version-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.ep-side-icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  cursor: pointer;
  color: var(--muted-foreground, #6b7280);
  border-radius: 4px;
  padding: 0;
}
.ep-side-icon-btn:hover {
  background: var(--border, #e5e7eb);
  color: inherit;
}
.ep-side-icon-danger:hover {
  color: #dc2626;
  background: #fee2e2;
}
.ep-side-version-content {
  padding: 0 12px 12px !important;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ep-side-version-stats {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ep-side-version-stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
}
.ep-side-version-stat-val {
  font-weight: 500;
}
.ep-side-update-btn {
  width: 100%;
}
/* ===== Empty state placeholder (cf. React :2166-2177) ===== */
.ep-empty-state {
  background: linear-gradient(180deg, #f0f7ff 0%, #ffffff 100%);
  border: 1px solid #d9e6f7;
  border-radius: 18px !important;
}
.ep-empty-state-content {
  padding: 40px 24px !important;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 12px;
  max-width: 520px;
  margin: 0 auto;
}
.ep-empty-state-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: #dbeafe;
  color: #1d4ed8;
}
.ep-empty-state-title {
  font-size: 1.35rem;
  font-weight: 800;
  margin: 0;
  color: #0f172a;
}
.ep-empty-state-text {
  font-size: 0.875rem;
  line-height: 1.5;
  color: #64748b;
  margin: 0;
}
.ep-empty-state-select {
  width: 100%;
  max-width: 420px;
  margin-top: 6px;
  text-align: left;
}
.ep-empty-state-stats {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 4px;
}
.ep-empty-state-chip {
  padding: 4px 12px;
  border-radius: 9999px;
  border: 1px solid #dbe4ee;
  background: #f8fafc;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 700;
}
.ep-date-picker {
  width: 100%;
  align-self: center;
  flex: 0 0 auto;
  max-width: 272px;
  margin-inline: auto;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: none !important;
}
.ep-date-picker :deep(.v-picker-title),
.ep-date-picker :deep(.v-date-picker-header) {
  display: none;
}
.ep-date-picker :deep(.v-picker__body) {
  padding: 0;
}
/* Contrôles compacts. Le libellé central = sélecteur UNIQUE mois + année
   (cliquable → bascule sur le choix année/mois de Vuetify). */
.ep-date-picker :deep(.v-date-picker-controls) {
  min-height: 30px;
  padding: 0 4px;
}
.ep-date-picker :deep(.v-date-picker-controls .v-btn) {
  width: 26px;
  height: 26px;
  min-width: 26px;
}
.ep-date-picker :deep(.v-date-picker-controls__month-btn),
.ep-date-picker :deep(.v-date-picker-controls .v-btn--variant-text) {
  font-weight: 700;
  font-size: 0.8125rem;
}
.ep-date-picker :deep(.v-date-picker-month) {
  min-width: 0;
  padding: 0 4px 4px;
}
.ep-date-picker :deep(.v-date-picker-month__weekday) {
  height: 18px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #94a3b8;
}
.ep-date-picker :deep(.v-date-picker-month__day) {
  height: 26px;
  width: auto;
  min-width: 0;
}
.ep-date-picker :deep(.v-date-picker-month__day .v-btn) {
  width: 24px;
  height: 24px;
  min-width: 24px;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 7px;
  font-variant-numeric: tabular-nums;
  transition: background-color 0.15s ease, color 0.15s ease,
    box-shadow 0.15s ease;
}
/* Jours d'ÉVÈNEMENT (dates sélectionnables) : chiffre + bordure rouge logo
   officiel (#ff3131), pour repérer le jour de l'évènement dans le calendrier. */
.ep-date-picker
  :deep(.v-date-picker-month__day .v-btn:not(.v-btn--disabled):not(.v-btn--active)) {
  background: transparent;
  color: #ff3131;
  border: 1.5px solid #ff3131;
}
.ep-date-picker
  :deep(.v-date-picker-month__day .v-btn:not(.v-btn--disabled):not(.v-btn--active):hover) {
  background: rgba(255, 49, 49, 0.1);
}
/* Jour d'évènement sélectionné : fond rouge logo plein, bordure logo, texte blanc. */
.ep-date-picker :deep(.v-date-picker-month__day .v-btn.v-btn--active),
.ep-date-picker :deep(.v-date-picker-month__day--selected .v-btn) {
  background: #ff3131 !important;
  border: 1.5px solid #ff3131 !important;
  color: #fff !important;
}
/* Aujourd'hui : anneau rouge léger. */
.ep-date-picker :deep(.v-date-picker-month__day--current .v-btn) {
  box-shadow: inset 0 0 0 1.5px rgba(220, 38, 38, 0.5);
}
/* Dates désactivées (passées / sans évènement) : estompées, neutres. */
.ep-date-picker :deep(.v-date-picker-month__day .v-btn--disabled) {
  opacity: 0.3;
  color: #94a3b8;
  background: transparent;
}
.ep-date-picker :deep(.v-date-picker-month__days) {
  grid-template-columns: repeat(7, minmax(0, 1fr));
  column-gap: 0;
  row-gap: 1px;
}
/* Anti-clip de la carte calendrier. Ciblé par CLASSE et non `:first-child` :
   depuis l'ajout du dropdown outils (WorkspaceToolSelect) en tête de colonne,
   la carte n'est plus le 1er enfant de .ep-side — le sélecteur positionnel ne
   matchait plus rien et le calendrier était de nouveau coupé (flex shrink +
   overflow hidden de la carte). */
.ep-side > :deep(.v-card.ep-event-selector-card),
.ep-side > :deep([data-slot="card"].ep-event-selector-card),
.ep-side > .ep-event-selector-card {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  min-height: fit-content;
  overflow: visible;
}
.ep-side :deep(.ep-event-selector-card [data-slot="card-content"]),
.ep-side :deep(.ep-event-selector-card .v-card-text) {
  flex: 0 0 auto;
  min-height: fit-content;
  overflow: visible;
  display: flex;
  flex-direction: column;
}
.ep-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: auto;
}
/* === Right column: Event Metrics Widgets (cf. React :2356-2446) === */
.ep-metrics {
  width: 400px;
  flex-shrink: 0;
  border-left: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow-y: auto;
  padding: 18px;
  background: rgba(255, 255, 255, 0.72);
  scrollbar-gutter: auto;
}
.ep-metrics-head {
  padding: 4px 2px 14px;
  margin-bottom: 4px;
  border-bottom: 1px solid #e2e8f0;
}
.ep-metrics-kicker {
  margin: 0 0 4px;
  font-size: 0.6875rem;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.ep-metrics-title {
  margin: 0;
  font-size: 1rem;
  line-height: 1.25;
  font-weight: 750;
  color: #0f172a;
}
.ep-metrics-subtitle {
  margin: 5px 0 0;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 500;
}
.ep-metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.ep-metrics-anchors {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 6px 12px 10px;
  border-bottom: 1px solid #e2e8f0;
  margin-bottom: 10px;
}
.ep-metrics-anchors a {
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  text-decoration: none;
  padding: 2px 6px;
  border-radius: 6px;
}
.ep-metrics-anchors a:hover {
  background: #f1f5f9;
  color: #0f172a;
}
.ep-metric-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 128px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  position: relative;
  overflow: hidden;
}
.ep-metric-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: #64748b;
}
.ep-metric-card-primary::before {
  background: #4f46e5;
}
.ep-metric-card-success::before {
  background: #16a34a;
}
.ep-metric-card-neutral::before {
  background: #0284c7;
}
.ep-metric-card-warning::before {
  background: #f59e0b;
}
.ep-metric-label {
  font-size: 0.75rem;
  font-weight: 750;
  color: #64748b;
  margin: 0;
}
.ep-metric-value {
  font-size: 1.35rem;
  line-height: 1.1;
  font-weight: 800;
  color: #0f172a;
  margin: 0;
  letter-spacing: 0;
  word-break: break-word;
}
.ep-metric-adjusted {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid #e2e8f0;
}
.ep-metric-adjusted-label {
  font-size: 0.75rem;
  color: #64748b;
  margin: 0 0 2px;
}
.ep-metric-adjusted-value {
  font-size: 1.05rem;
  font-weight: 800;
  color: #4338ca;
  margin: 0;
  word-break: break-word;
}
@media (max-width: 1280px) {
  .ep-metrics {
    width: 320px;
  }
  .ep-metric-value {
    font-size: 1.25rem;
  }
}
.ep-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 32px;
  background: var(--muted, #f9fafb);
  border: 1px dashed var(--border, #e5e7eb);
  border-radius: 8px;
  color: var(--muted-foreground, #6b7280);
}
.ep-event-list {
  flex: 1;
  height: clamp(260px, 38vh, 460px);
  min-height: 0;
  max-height: 100%;
}
.ep-event-list :deep([data-slot="scroll-area-viewport"]) {
  padding-right: 2px;
}
.ep-event-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 11px 12px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  margin-bottom: 8px;
  background: #ffffff;
  cursor: pointer;
  transition: background 120ms, border-color 120ms, box-shadow 120ms, transform 120ms;
}
.ep-event-item:hover {
  background: #f8fafc;
  border-color: #cbd5e1;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}
.ep-event-item.is-selected {
  background: #111827;
  color: white;
  border-color: transparent;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.14);
}
.ep-event-item.is-multi:not(.is-selected) {
  border-color: #f59e0b;
  background: #fff7ed;
}
.ep-event-row {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: space-between;
}
.ep-event-tickets {
  font-size: 0.7rem;
  font-weight: 500;
  opacity: 0.75;
  white-space: nowrap;
  flex-shrink: 0;
  margin-left: auto;
}
.ep-event-radio {
  appearance: none;
  width: 16px;
  height: 16px;
  border: 2px solid #cbd5e1;
  border-radius: 9999px;
  background: #fff;
  cursor: pointer;
  flex-shrink: 0;
  display: inline-grid;
  place-content: center;
}
.ep-event-radio::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  transform: scale(0);
  transition: transform 120ms ease;
  background: var(--df-primary, var(--primary, #3b82f6));
}
.ep-event-radio:checked {
  border-color: var(--df-primary, var(--primary, #3b82f6));
}
.ep-event-radio:checked::before {
  transform: scale(1);
}
.ep-event-item.is-selected .ep-event-radio {
  border-color: #fff;
  background: rgba(255, 255, 255, 0.96);
}
.ep-multi-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 6px;
  margin-bottom: 8px;
}
.ep-multi-label {
  font-size: 0.75rem;
}
.ep-multi-active {
  font-weight: 600;
  color: #c2410c;
}
.ep-event-name {
  font-weight: 600;
  font-size: 0.875rem;
  line-height: 1.25;
}
.ep-event-meta {
  font-size: 0.75rem;
  opacity: 0.85;
  margin-left: 24px;
  margin-top: 2px;
}
.ep-summary-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}
.ep-stat {
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: var(--muted, #f9fafb);
  border-radius: 6px;
}
.ep-stat-label {
  font-size: 0.75rem;
  color: var(--muted-foreground, #6b7280);
}
.ep-stat-value {
  font-size: 1.125rem;
  font-weight: 600;
  margin-top: 4px;
}
.ep-stat-sub {
  font-size: 0.7rem;
  color: var(--muted-foreground, #6b7280);
  margin-top: 2px;
}
.ep-stat-accent {
  border-left: 3px solid var(--primary, #3b82f6);
}
.ep-multi-placeholder {
  border-left: 4px solid #16a34a;
  background: #f0fdf4;
}
.ep-multi-tip {
  border-left: 4px solid #3b82f6;
  background: #eff6ff;
  font-size: 0.875rem;
}
.ep-multi-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ep-multi-list-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border, #e5e7eb);
}
.ep-multi-list-row:last-child {
  border-bottom: 0;
}
.ep-multi-list-name {
  font-weight: 600;
  font-size: 0.875rem;
}
.ep-multi-list-date {
  font-size: 0.75rem;
  color: var(--muted-foreground, #6b7280);
}
.ep-multi-list-badge {
  display: inline-block;
  padding: 2px 8px;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  font-size: 0.75rem;
}
.ep-tag-current {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 0.65rem;
  background: var(--primary, #3b82f6);
  color: white;
  border-radius: 3px;
}
.ep-tag-dirty {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  font-size: 0.65rem;
  background: #f59e0b;
  color: white;
  border-radius: 3px;
}
.ep-link-btn.is-disabled,
.ep-link-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.ep-version-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ep-link-btn {
  background: none;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.75rem;
  cursor: pointer;
  color: inherit;
}
.ep-link-btn:hover {
  background: var(--muted, #f3f4f6);
}
.ep-link-btn.ep-danger {
  color: #dc2626;
  border-color: #fca5a5;
}
.ep-link-btn.ep-danger:hover {
  background: #fee2e2;
}
.ep-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}
.ep-table th,
.ep-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border, #e5e7eb);
  vertical-align: top;
}
.ep-table tfoot th {
  border-bottom: none;
  border-top: 2px solid var(--border, #e5e7eb);
  font-weight: 700;
}
.ep-table .ep-num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.ep-table tr.is-excluded {
  opacity: 0.45;
}
.ep-th-checkbox {
  width: 28px;
}
.ep-bar {
  margin-top: 4px;
  height: 4px;
  background: var(--muted, #e5e7eb);
  border-radius: 2px;
  overflow: hidden;
  width: 100%;
  max-width: 120px;
}
.ep-bar-fill {
  height: 100%;
  background: var(--primary, #3b82f6);
}
/* Header "Pr\u00e9diction bas\u00e9e sur N \u00e9v\u00e8nements" au-dessus du graphique */
.ep-prediction-base-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.ep-prediction-base-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
/* Bouton "Sources" : même gabarit que les boutons du header inventaire. */
.ep-sources-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 34px;
  height: 34px;
  width: 34px;
  padding: 0;
  border: 1.5px solid rgba(255, 49, 49, 0.35);
  border-radius: 100px;
  background: #ffffff;
  color: #ff3131;
  cursor: pointer;
  font-size: 12.5px;
  font-weight: 650;
  letter-spacing: 0;
  line-height: 1;
  white-space: nowrap;
  transition: border-color 0.2s, background-color 0.2s, color 0.2s, transform 0.15s;
}
.ep-sources-btn:hover {
  border-color: #ff3131;
  background: rgba(255, 49, 49, 0.06);
}
.ep-sources-btn:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
.ep-sources-btn:active {
  transform: translateY(1px);
}
.ep-prediction-base {
  border-radius: 18px !important;
  border-color: #d9e2ec !important;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}
.ep-prediction-base-header {
  padding: 20px 24px !important;
}
/* Typo alignée Space Menus (titre 16px/700, sous-titre 12px). Sans ça, le
   titre = <h4> nu stylé par bootstrap (~22px) et la description héritait des
   règles p larges d'index.css. */
.ep-prediction-base :deep([data-slot="card-title"]) {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.3;
}
.ep-prediction-base :deep([data-slot="card-description"]) {
  font-size: 12px;
  line-height: 1.45;
}
.ep-prediction-base :deep([data-slot="card-content"]) {
  max-height: min(46vh, 420px);
  overflow-y: auto;
  scrollbar-gutter: auto;
}
.ep-past-source-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
/* Liste de sélection des events passés : volontairement DÉ-EMPHASISÉE
   (opacité réduite + mise en forme « carte » retirée → liste plate avec un
   simple séparateur). Le détail reste lisible mais n'entre pas en concurrence
   visuelle avec la prédiction principale. */
.ep-past-source-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  padding: 8px 6px;
  border: 0;
  border-bottom: 1px solid #eef2f6;
  border-radius: 0;
  background: transparent;
  color: #0f172a;
  text-align: left;
  cursor: pointer;
  opacity: 0.72;
  transition: background 120ms, opacity 120ms;
}
.ep-past-source-card:hover {
  background: rgba(15, 23, 42, 0.03);
  box-shadow: none;
  opacity: 0.95;
}
.ep-past-source-card.is-active {
  background: transparent;
  box-shadow: none;
  opacity: 1;
}
.ep-past-source-card.is-excluded {
  opacity: 0.38;
}
.ep-past-source-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  margin-top: 2px;
  border: 2px solid #cbd5e1;
  border-radius: 9999px;
  background: #ffffff;
  color: #94a3b8;
  flex-shrink: 0;
}
.ep-past-source-card.is-active .ep-past-source-toggle {
  border-color: var(--df-primary, var(--primary, #7c3aed));
  background: var(--df-primary, var(--primary, #7c3aed));
  color: #ffffff;
}
.ep-past-source-main {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  flex: 1 1 auto;
}
.ep-past-source-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.ep-past-source-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.ep-past-source-title {
  font-size: 0.875rem;
  font-weight: 750;
  line-height: 1.25;
}
.ep-past-source-date {
  font-size: 0.75rem;
  color: #64748b;
}
.ep-past-source-metrics {
  display: flex;
  align-items: stretch;
  gap: 6px;
  flex-shrink: 0;
}
.ep-past-source-metric {
  display: inline-flex;
  min-width: 64px;
  flex-direction: column;
  gap: 2px;
  padding: 2px 4px;
  border: 0;
  background: transparent;
  font-size: 0.6875rem;
  color: #64748b;
}
.ep-past-source-metric strong {
  color: #0f172a;
  font-size: 0.8125rem;
  line-height: 1.1;
}
.ep-past-source-metric small {
  color: #64748b;
  font-size: 0.6875rem;
  font-weight: 650;
}
.ep-past-source-scorebar {
  display: block;
  width: 100%;
  height: 6px;
  border-radius: 9999px;
  background: #e5e7eb;
  overflow: hidden;
}
.ep-past-source-scorebar span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--df-primary, var(--primary, #7c3aed));
}
.ep-past-source-breakdown {
  gap: 5px;
}
@media (max-width: 760px) {
  .ep-prediction-base-actions {
    width: 100%;
    justify-content: flex-start;
  }
  .ep-past-source-head {
    flex-direction: column;
  }
  .ep-past-source-metrics {
    width: 100%;
    flex-wrap: wrap;
  }
  .ep-past-source-metric {
    flex: 1 1 86px;
  }
}
.ep-base-count {
  font-weight: 700;
  color: var(--primary, #3b82f6);
}
.ep-base-count-total {
  font-weight: 600;
  color: var(--foreground, #111827);
}
.ep-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.ep-breakdown span {
  font-size: 0.7rem;
  background: var(--muted, #f3f4f6);
  border-radius: 4px;
  padding: 2px 6px;
}
.ep-muted {
  color: var(--muted-foreground, #6b7280);
}
.ep-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
@media (max-width: 1100px) {
  .ep-body {
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .ep-side {
    width: 100%;
    flex: 0 0 auto;
    max-height: 40vh;
    overflow: hidden;
  }
  .ep-side > :deep(.v-card),
  .ep-side > :deep([data-slot="card"]) {
    max-height: 40vh;
  }
  .ep-main {
    flex: 1 1 auto;
    overflow: visible;
  }
  .ep-event-list {
    max-height: calc(40vh - 120px);
  }
  .ep-header {
    flex-wrap: wrap;
    padding: 12px 16px;
    gap: 8px;
  }
  .ep-title h1 {
    font-size: 1rem;
  }
  .ep-header-actions {
    margin-left: 0;
  }
  .ep-metrics {
    width: 100%;
    flex: 0 0 auto;
    border-left: none;
    border-top: 1px solid var(--border, #e5e7eb);
    overflow: visible;
  }
}
@media (max-width: 480px) {
  .ep-body {
    gap: 8px;
    padding: 8px;
  }
  .ep-side {
    max-height: 35vh;
  }
  .ep-summary-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  .ep-stat-value {
    font-size: 1rem;
  }
}

/* ===== Timeline prédictive (cf. doc §9) ===== */
.ep-timeline-card {
  margin-top: 16px;
}
.ep-timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.ep-timeline-warning {
  background: #fff7ed;
  color: #9a3412;
  border: 1px solid #fed7aa;
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 0.85rem;
  margin-bottom: 12px;
}
.ep-debug-toggle {
  margin-top: 8px;
  font-size: 0.78rem;
  color: var(--muted-foreground, #64748b);
}
.ep-debug-toggle label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.ep-timeline-info {
  background: #f3f4f6;
  color: #374151;
  border-radius: 6px;
  padding: 10px 12px;
  font-size: 0.85rem;
  margin-top: 12px;
}
.ep-timeline-section-title {
  font-weight: 600;
  font-size: 0.85rem;
  margin: 8px 0 6px;
  color: #374151;
}
.ep-timeline-table {
  width: 100%;
  font-size: 0.85rem;
  margin-bottom: 12px;
}
.ep-timeline-table th,
.ep-timeline-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #e5e7eb;
  text-align: left;
}
.ep-score-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.75rem;
}
.ep-score-high {
  background: #dcfce7;
  color: #166534;
}
.ep-score-mid {
  background: #fef3c7;
  color: #92400e;
}
.ep-score-low {
  background: #fee2e2;
  color: #991b1b;
}
.ep-timeline-summary {
  border-top: 1px solid #e5e7eb;
  padding-top: 12px;
  margin-top: 8px;
}
.ep-timeline-summary-row {
  display: flex;
  gap: 24px;
  margin-bottom: 8px;
}
.ep-timeline-label {
  font-size: 0.75rem;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ep-timeline-value {
  font-weight: 700;
  font-size: 1.05rem;
  color: #111827;
}
.ep-timeline-spark {
  width: 100%;
  height: 60px;
  color: #ea580c;
  margin-top: 4px;
}
.ep-timeline-spark-line {
  vector-effect: non-scaling-stroke;
}
.ep-timeline-axis {
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 4px;
}
.ep-spin {
  animation: ep-spin 1s linear infinite;
}
@keyframes ep-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Harmonisation inventaire / event predict */
.event-predict-overlay {
  --ep-bg: var(--fb-bg, #F5F5F5);
  --ep-surface: var(--fb-surface, #FFFFFF);
  --ep-subtle: var(--fb-subtle, #FAFAFA);
  --ep-border: var(--fb-border, #E5E7EB);
  --ep-text: var(--fb-text, #212121);
  --ep-muted: var(--fb-muted, #6B7280);
  --ep-faint: var(--fb-faint, #9CA3AF);
  --ep-primary: #ff3131;
  --ep-primary-soft: var(--fb-primary-soft, #FFF5F5);
  /* Legacy ported components still consume shadcn-style token names. */
  --primary: #ff3131;
  --df-primary: #ff3131;
  --background: var(--fb-surface, #FFFFFF);
  --foreground: var(--fb-text, #212121);
  --muted: var(--fb-subtle, #FAFAFA);
  --muted-foreground: var(--fb-muted, #6B7280);
  --border: var(--fb-border, #E5E7EB);

  background: var(--ep-bg);
  color: var(--ep-text);
}

.ep-header {
  min-height: 104px;
  gap: 12px;
  padding: 12px 24px;
  border-bottom-color: var(--ep-border);
  background: var(--ep-surface);
  backdrop-filter: none;
  box-shadow: none;
}

.ep-title h1 {
  font-size: 16px;
  line-height: 1.25;
  font-weight: 700;
  color: var(--ep-text);
}

.ep-subtitle {
  font-size: 12px;
  line-height: 1.35;
  color: var(--ep-muted);
}

.ep-header-chip {
  min-height: 28px;
  border-color: var(--ep-border);
  border-radius: 8px;
  background: var(--ep-subtle);
  color: var(--ep-muted);
  font-size: 12px;
  font-weight: 650;
}

.ep-header-chip-strong {
  background: var(--ep-primary-soft);
  border-color: rgba(255, 49, 49, 0.24);
  color: var(--ep-primary);
}

.ep-body {
  gap: 16px;
  padding: 18px 24px 24px;
}

.ep-heavy-loading {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 24px 0;
  color: #6B7280;
}

.ep-toolbox-nav {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  gap: 5px;
  margin: 12px 24px 8px;
}

.ep-toolnav-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  border: 1px solid var(--ep-border);
  border-radius: 8px;
  background: var(--ep-surface);
  color: var(--ep-muted);
  cursor: pointer;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 700;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}

.ep-toolnav-btn:hover {
  background: var(--ep-subtle);
}

.ep-toolnav-btn-active {
  background: var(--ep-primary-soft);
  border-color: rgba(255, 49, 49, 0.28);
  color: var(--ep-primary);
  pointer-events: none;
}

.ep-event-selector-card,
.ep-side-event-card,
.ep-side-version-card,
.ep-prediction-base,
.ep-predict-section-tabs,
.ep-metric-card,
.ep-timeline-chart :deep(.v-card) {
  border: 1px solid var(--ep-border) !important;
  /* Aligné Components Library : rounded-xl (~16px) + ombre subtile. */
  border-radius: 16px !important;
  background: var(--ep-surface) !important;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04) !important;
}

.ep-event-selector-header {
  padding: 14px 16px 8px !important;
}

.ep-event-selector-title,
.ep-metrics-title,
.ep-side-event-name,
.ep-side-version-name,
.ep-past-source-title {
  color: var(--ep-text);
}

.ep-event-selector-title {
  font-size: 14px;
  font-weight: 700;
}

.ep-event-selector-subtitle {
  border-color: var(--ep-border);
  border-radius: 8px;
  background: var(--ep-subtle);
  color: var(--ep-muted);
}

.ep-calendar-wrap {
  border-color: var(--ep-border);
  background: var(--ep-subtle);
}
.ep-calendar-label {
  color: var(--ep-muted);
}
.ep-event-opt-badge.is-past {
  background: var(--ep-subtle);
  color: var(--ep-muted);
}

.ep-sb-tabs {
  border-radius: 8px;
}

.ep-sb-tabs :deep(.v-btn) {
  border-radius: 8px !important;
  text-transform: none;
  letter-spacing: 0;
  font-size: 12px !important;
  font-weight: 650;
}

.ep-predict-section-tabs {
  margin-top: 16px;
  padding: 14px;
}

:deep(.ep-predict-section-tabs-list),
/* Pills arrondies, mêmes métriques que les onglets Open/Closed de la section
   Menus (style Space Menus : 100px, 13px/500, actif 700). */
.ep-view-mode-tabs :deep([data-slot="tabs-list"]),
.ep-view-mode-tabs :deep([role="tablist"]) {
  min-height: 38px;
  height: 38px;
  padding: 3px;
  border: 1px solid var(--ep-border);
  border-radius: 9999px;
  background: var(--ep-subtle);
}

:deep(.ep-predict-section-trigger),
.ep-view-mode-tabs :deep([data-slot="tabs-trigger"]),
.ep-view-mode-tabs :deep([role="tab"]) {
  min-width: 0;
  /* Pills EP : radius 100px, inactif gris translucide. */
  border-radius: 9999px;
  padding: 6px 10px;
  color: var(--ep-muted);
  font-size: 12px;
  font-weight: 650;
}

/* Actif = rouge charte plein + texte blanc (pill EP). */
:deep(.ep-predict-section-trigger[data-state='active']),
.ep-view-mode-tabs :deep([data-state='active']) {
  background: var(--ep-primary) !important;
  color: #fff !important;
  box-shadow: 0 1px 3px rgba(255, 49, 49, 0.35);
}

:deep(.ep-predict-section-trigger[data-state='active'] .v-icon) {
  color: #fff !important;
}

.ep-event-item {
  padding: 10px;
  border-color: var(--ep-border);
  border-radius: 8px;
  background: var(--ep-surface);
  color: var(--ep-text);
  box-shadow: none;
}

.ep-event-item:hover {
  background: var(--ep-subtle);
  border-color: rgba(255, 49, 49, 0.24);
  box-shadow: none;
}

.ep-event-item.is-selected {
  background: var(--ep-primary-soft);
  color: var(--ep-primary);
  border-color: rgba(255, 49, 49, 0.28);
  box-shadow: none;
}

.ep-event-item.is-multi:not(.is-selected) {
  border-color: rgba(255, 49, 49, 0.2);
  background: var(--ep-primary-soft);
}

.ep-event-radio,
.ep-past-source-toggle,
.ep-side-radio {
  border-color: #D1D5DB;
}

.ep-event-radio::before,
.ep-side-radio-dot,
.ep-bar-fill,
.ep-past-source-scorebar span {
  background: var(--ep-primary);
}

.ep-event-radio:checked,
.ep-side-radio.is-checked,
.ep-side-radio:hover,
.ep-past-source-card.is-active .ep-past-source-toggle {
  border-color: var(--ep-primary);
}

.ep-past-source-card.is-active .ep-past-source-toggle {
  background: var(--ep-primary);
}

.ep-metrics {
  width: 360px;
  border-left-color: var(--ep-border);
  background: var(--ep-surface);
}

.ep-metrics-head,
.ep-metrics-anchors,
.ep-metric-adjusted {
  border-color: var(--ep-border);
}

.ep-metric-card {
  min-height: 112px;
  padding: 12px;
}

.ep-metric-card::before {
  width: 3px;
}

.ep-metric-label,
.ep-metrics-subtitle,
.ep-muted,
.ep-event-meta,
.ep-past-source-date,
.ep-past-source-metric,
.ep-metric-adjusted-label {
  color: var(--ep-muted);
}

.ep-metric-value {
  font-size: 20px;
  color: var(--ep-text);
}

.ep-metric-adjusted-value,
.ep-base-count {
  color: var(--ep-primary);
}

.ep-prediction-base-header {
  padding: 14px 16px !important;
}

/* Garde la liste des events passés PLATE même sous le thème (sinon ces règles
   ré-injecteraient bordure + fond « carte »). Cf. bloc .ep-past-source-card. */
.ep-past-source-card {
  border: 0;
  border-bottom: 1px solid var(--ep-border);
  border-radius: 0;
  background: transparent;
}

.ep-past-source-card:hover {
  background: var(--ep-subtle);
  box-shadow: none;
}

.ep-past-source-card.is-active {
  background: transparent;
  box-shadow: none;
}

.ep-past-source-metric {
  border: 0;
  border-radius: 0;
  background: transparent;
}

.ep-metrics-anchors a,
.ep-multi-bar,
.ep-stat,
.ep-link-btn,
.ep-empty-state,
.ep-date-picker,
.ep-breakdown span,
.ep-timeline-warning,
.ep-timeline-info {
  border-radius: 8px;
}

.ep-loading-skeleton {
  flex: 1;
  display: grid;
  grid-template-columns: 312px minmax(0, 1fr) 360px;
  gap: 16px;
  align-items: start;
  padding: 18px 24px 24px;
  color: var(--ep-muted);
}

.ep-skeleton-side,
.ep-skeleton-main,
.ep-skeleton-metrics {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.ep-skeleton-side {
  padding: 14px;
  border: 1px solid var(--ep-border);
  border-radius: 8px;
  background: var(--ep-surface);
}

/* Skeleton INLINE d'une valeur KPI (plan de chargement séquencé) : le prédit
   apparaît dès la timeline, l'Adjusted reste en shimmer tant que le Space Menu
   n'est pas chargé. */
.ep-skel-value {
  display: inline-block;
  width: 84px;
  height: 22px;
  margin: 2px 0;
  border-radius: 6px;
  background: linear-gradient(90deg, #e2e8f0 25%, #f1f5f9 50%, #e2e8f0 75%);
  background-size: 200% 100%;
  animation: ep-shimmer 1.4s ease-in-out infinite;
}
.ep-skel-value-sm {
  width: 60px;
  height: 16px;
}
.ep-skeleton-panel {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--ep-border);
  border-radius: 8px;
  background: var(--ep-surface);
}

.ep-skeleton-event,
.ep-skeleton-row,
.ep-skeleton-metric,
.ep-skeleton-chart,
.ep-skeleton-line {
  display: block;
  border-radius: 999px;
  background: linear-gradient(90deg, #EEEEEE 0%, #F7F7F7 42%, #EEEEEE 78%);
  background-size: 220% 100%;
  animation: ep-shimmer 1.3s ease-in-out infinite;
}

.ep-skeleton-event {
  height: 54px;
  border-radius: 8px;
}

.ep-skeleton-row {
  height: 36px;
  border-radius: 8px;
}

.ep-skeleton-metric {
  height: 112px;
  border-radius: 8px;
}

.ep-skeleton-chart {
  min-height: 340px;
  border-radius: 8px;
}

.ep-skeleton-line {
  height: 10px;
}

.ep-skeleton-line-title {
  width: 52%;
  height: 13px;
}

@keyframes ep-shimmer {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}

@media (max-width: 1100px) {
  .ep-loading-skeleton {
    grid-template-columns: 1fr;
    padding: 12px 16px 16px;
  }

  .ep-body {
    padding: 12px 16px 16px;
  }

  .ep-toolbox-nav {
    margin-left: 16px;
    margin-right: 16px;
  }

  .ep-side {
    max-height: none;
    overflow: visible;
  }

  .ep-side > :deep(.v-card),
  .ep-side > :deep([data-slot="card"]) {
    max-height: none;
  }

  .ep-event-list {
    height: auto;
    max-height: 320px;
  }

  .ep-metrics {
    width: 100%;
    background: var(--ep-surface);
  }
}

@media (max-width: 640px) {
  .ep-header {
    min-height: auto;
    padding: 12px 16px;
    align-items: flex-start;
  }

  .ep-header-actions {
    width: 100%;
    justify-content: flex-start;
  }

  .ep-toolnav-btn {
    flex: 1 1 calc(50% - 6px);
    justify-content: center;
    min-height: 36px;
  }

  .ep-predict-section-header,
  .ep-prediction-base-header {
    align-items: stretch;
  }

  :deep(.ep-predict-section-tabs-list),
  .ep-view-mode-tabs,
  .ep-view-mode-tabs :deep([data-slot="tabs-list"]) {
    width: 100%;
  }

  :deep(.ep-predict-section-trigger) {
    flex: 1 1 0;
  }
}

/* Final F&B visual contract — aligned with Events / Space Menu. */
.ep-header {
  min-height: 84px;
  box-shadow: 0 1px 0 var(--ep-border);
}
.ep-header :deep(button),
.ep-header :deep(.v-btn),
.ep-prediction-base-actions :deep(.v-btn) {
  border-radius: var(--fb-radius-control, 8px) !important;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: none;
}
.ep-header :deep(button:focus-visible),
.ep-header :deep(.v-btn:focus-visible),
.ep-toolnav-btn:focus-visible,
.ep-link-btn:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
.ep-title h1,
.ep-event-selector-title,
.ep-metrics-title,
.ep-section-h2 {
  letter-spacing: -0.01em;
}
.ep-header-chip,
.ep-toolnav-btn,
.ep-event-item,
.ep-metrics-anchors a,
.ep-link-btn {
  border-radius: var(--fb-radius-control, 8px);
}
.ep-event-selector-card,
.ep-side-event-card,
.ep-side-version-card,
.ep-prediction-base,
.ep-predict-section-tabs,
.ep-metric-card,
.ep-timeline-chart :deep(.v-card) {
  border-color: var(--ep-border) !important;
  border-radius: var(--fb-radius-card, 16px) !important;
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05)) !important;
}
.ep-event-item,
.ep-past-source-card,
.ep-link-btn {
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}
.ep-event-item:hover,
.ep-link-btn:hover {
  border-color: rgba(255, 49, 49, 0.28);
  background: var(--ep-primary-soft);
}
.ep-metric-value,
.ep-metric-adjusted-value,
.ep-base-count,
.ep-stat strong,
.ep-num {
  font-variant-numeric: tabular-nums;
}
.ep-predict-section-tabs {
  border-radius: var(--fb-radius-card, 16px);
  background: var(--ep-surface);
}
:deep(.ep-predict-section-tabs-list),
.ep-view-mode-tabs :deep([data-slot="tabs-list"]),
.ep-view-mode-tabs :deep([role="tablist"]) {
  border-radius: var(--fb-radius-control, 8px);
}
:deep(.ep-predict-section-trigger[data-state='active']),
.ep-view-mode-tabs :deep([data-state='active']) {
  background: var(--ep-surface) !important;
  color: var(--ep-primary) !important;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
}
:deep(.ep-predict-section-trigger[data-state='active'] .v-icon) {
  color: var(--ep-primary) !important;
}
.ep-table,
.ep-timeline-table {
  border-collapse: separate;
  border-spacing: 0;
  color: var(--ep-text);
}
.ep-table th,
.ep-timeline-table th {
  padding: 9px 10px;
  border-bottom: 1px solid var(--ep-border);
  background: var(--ep-subtle);
  color: var(--ep-muted);
  font-size: 0.6875rem;
  font-weight: 750;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}
.ep-table td,
.ep-timeline-table td {
  padding: 9px 10px;
  border-bottom: 1px solid var(--ep-border);
  background: var(--ep-surface);
  font-size: 0.8125rem;
}
.ep-table tbody tr:hover td,
.ep-timeline-table tbody tr:hover td {
  background: var(--ep-primary-soft);
}
.ep-bar-fill {
  background: var(--ep-primary);
}
.ep-score-high {
  background: var(--fb-success-soft, #F0FDF4);
  color: var(--fb-success, #16A34A);
}
.ep-score-mid {
  background: var(--fb-warning-soft, #FFFBEB);
  color: var(--fb-warning, #D97706);
}
.ep-score-low {
  background: var(--fb-danger-soft, #FEF2F2);
  color: var(--fb-danger, #DC2626);
}

@media (max-width: 640px) {
  .ep-header {
    min-height: auto;
  }
}

/* Refonte finale — mêmes surfaces, badges et boutons que Space Menus / Events. */
.event-predict-overlay {
  background: linear-gradient(135deg, #f6f7fb 0%, #fafbfc 100%);
}

.ep-header {
  min-height: 64px;
  padding: 8px 24px;
  border-bottom: 1px solid var(--fb-border, #e5e7eb);
  background: var(--fb-surface, #fff);
}

.ep-header-inv-btn,
.ep-header :deep(.ep-header-inv-btn.v-btn) {
  min-height: 34px;
  padding-inline: 14px !important;
  border: 1.5px solid rgba(255, 49, 49, 0.32) !important;
  border-radius: var(--fb-radius-control, 8px) !important;
  background: var(--fb-primary-soft, #fff5f5) !important;
  color: #ff3131 !important;
  box-shadow: none !important;
}

.ep-header-inv-btn:hover,
.ep-header :deep(.ep-header-inv-btn.v-btn:hover) {
  border-color: #ff3131 !important;
  background: #ff3131 !important;
  color: #fff !important;
}

.ep-header-chip {
  min-height: 30px;
  padding: 5px 11px;
  border: 1.5px solid var(--fb-border, #e5e7eb);
  border-radius: 999px;
  background: var(--fb-subtle, #fafafa);
  color: var(--fb-muted, #6b7280);
  font-weight: 700;
}

.ep-body {
  position: relative;
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr) 340px;
  gap: 18px;
  padding: 18px 24px 24px;
}

.ep-side,
.ep-main,
.ep-metrics {
  width: auto;
  min-width: 0;
  min-height: 0;
}

.ep-side {
  gap: 14px;
  padding-right: 0;
}

.ep-toolbox-select {
  margin: 0 0 2px;
}

.ep-event-selector-card,
.ep-side-event-card,
.ep-side-version-card,
.ep-prediction-base,
.ep-predict-section-tabs,
.ep-metric-card,
.ep-timeline-chart :deep(.v-card) {
  border: 1px solid var(--fb-border, #e5e7eb) !important;
  border-radius: 16px !important;
  background: var(--fb-surface, #fff) !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05) !important;
}

.ep-event-selector-card {
  overflow: hidden;
}

/* Le composant Card racine est `flex flex-col gap-6` (24px) : ce gap crée une
   bande vide entre le chip « N à venir » (CardHeader) et le calendrier
   (CardContent). On resserre (spécificité 0,2,0 pour battre `.gap-6` Tailwind). */
.ep-side .ep-event-selector-card {
  gap: 8px;
}

.ep-event-selector-header {
  padding: 16px 16px 8px !important;
}

.ep-event-selector-subtitle {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 28px;
  margin: 0;
  padding: 5px 10px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 999px;
  background: var(--fb-subtle, #fafafa);
  color: var(--fb-muted, #6b7280);
  font-size: 11px;
  font-weight: 700;
}

/* Aplati : le calendrier vit déjà dans `Card.ep-event-selector-card` (surface
   blanche). Un panneau bordé + fond + ombre ici créait un effet « boîte dans une
   boîte » blanc-sur-blanc. On retire cadre/fond/ombre → intégration directe. */
.ep-calendar-wrap {
  width: 100%;
  padding: 4px 0 0;
  overflow: visible;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.ep-calendar-wrap .ep-date-picker,
.ep-date-picker {
  width: 100%;
  min-width: 0;
  max-width: none;
  overflow: visible;
  border-radius: 12px;
  background: transparent;
}

.ep-date-picker :deep(.v-date-picker-controls) {
  display: block;
  min-height: 42px;
  padding: 4px 6px;
}

.ep-calendar-controls {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) 32px;
  align-items: center;
  gap: 6px;
  width: 100%;
}

.ep-calendar-month {
  overflow: hidden;
  color: var(--ep-text, #212121);
  font-size: 0.875rem;
  font-weight: 800;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ep-calendar-nav-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: var(--ep-primary-soft, #fff5f5);
  color: var(--ep-primary, #ff3131);
  cursor: pointer;
  transition: background-color 0.18s ease, color 0.18s ease, transform 0.15s ease;
}

.ep-calendar-nav-btn:hover:not(:disabled) {
  background: var(--ep-primary, #ff3131);
  color: #fff;
}

.ep-calendar-nav-btn:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 1px;
}

.ep-calendar-nav-btn:active:not(:disabled) {
  transform: scale(0.94);
}

.ep-calendar-nav-btn:disabled {
  cursor: not-allowed;
  opacity: 0.32;
}

.ep-date-picker :deep(.v-date-picker-month) {
  width: 100%;
  padding: 2px 6px 8px;
}

.ep-date-picker :deep(.v-date-picker-month__day) {
  height: 32px;
}

.ep-date-picker :deep(.v-date-picker-month__day .v-btn) {
  width: 30px;
  height: 30px;
  min-width: 30px;
  border-radius: 8px;
  font-size: 0.8125rem;
  opacity: 1;
}

.ep-date-picker :deep(.v-date-picker-month__weekday) {
  color: var(--ep-muted, #64748b);
  font-size: 0.6875rem;
  font-weight: 700;
}

.ep-date-picker :deep(.v-date-picker-month__day .v-btn--disabled) {
  opacity: 0.5;
}

/* Identité déjà visible dans bandeau rouge : sidebar garde seulement version. */
.ep-side-event-head,
.ep-side-event-date,
.ep-side-event-stats {
  display: none;
}

.ep-side-version-zone {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.ep-side-version-zone-head {
  flex-wrap: wrap;
}

.ep-side-version-zone-head {
  justify-content: flex-start;
}

.ep-side-event-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
  width: 100%;
}

.ep-side-event-btn {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  white-space: normal;
}

.ep-side-event-actions :deep(button) {
  width: 100%;
  min-width: 0;
  padding-inline: 10px !important;
  white-space: normal;
}

.ep-side-badge,
.ep-base-count,
.ep-base-count-total {
  border-radius: 999px;
}

.ep-side-event-actions :deep(button),
.ep-side-update-btn,
.ep-prediction-base-actions :deep(button) {
  border-radius: var(--fb-radius-control, 8px) !important;
}

.ep-prediction-base-header {
  gap: 18px;
  padding: 18px 20px !important;
}

.ep-main {
  gap: 0;
}

.ep-main > :deep(.ede-summary) {
  margin-bottom: 18px;
}

.ep-main > .ep-past-timeline-card,
.ep-main > .ep-multi-placeholder {
  margin-bottom: 18px;
}

.ep-main > :deep(.att-wrap) {
  margin-top: 10px;
  margin-bottom: 0;
}

.ep-predict-section-header,
.ep-view-mode-wrap {
  min-width: 0;
}

.ep-view-mode-wrap {
  flex: 1 1 300px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.ep-view-mode-tabs {
  width: min(100%, 270px);
  min-width: 0;
}

.ep-view-mode-tabs :deep([data-slot="tabs-list"]),
.ep-view-mode-tabs :deep([role="tablist"]) {
  width: 100%;
  min-width: 0;
}

.ep-view-mode-tabs :deep([data-slot="tabs-trigger"]),
.ep-view-mode-tabs :deep([role="tab"]) {
  min-width: 0;
  padding-inline: 9px;
  line-height: 1.2;
  text-align: center;
  white-space: normal;
}

.ep-predict-section-tabs {
  margin-top: 18px;
  padding: 16px;
}

:deep(.ep-predict-section-tabs-list),
.ep-view-mode-tabs :deep([data-slot="tabs-list"]),
.ep-view-mode-tabs :deep([role="tablist"]) {
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 999px;
  background: var(--fb-subtle, #fafafa);
}

:deep(.ep-predict-section-trigger),
.ep-view-mode-tabs :deep([data-slot="tabs-trigger"]),
.ep-view-mode-tabs :deep([role="tab"]) {
  border-radius: 999px;
}

:deep(.ep-predict-section-trigger[data-state='active']),
.ep-view-mode-tabs :deep([data-state='active']) {
  background: #ff3131 !important;
  color: #fff !important;
  box-shadow: 0 2px 8px rgba(255, 49, 49, 0.22);
}

/* Icône blanche sur l'onglet actif — pour les onglets de section ET le
   toggle Par PdV / Par article (mdi-store-outline / mdi-tag-outline). */
:deep(.ep-predict-section-trigger[data-state='active'] .v-icon),
.ep-view-mode-tabs :deep([data-state='active'] .v-icon) {
  color: #fff !important;
}

/* Harmonisation Par PdV / Par article ↔ Open/Closed : mêmes métriques que les
   pills Space Menus (13px/500, actif 700, padding 6px 14px) — corrige l'écart
   de taille entre le pill actif rouge et l'inactif. */
.ep-view-mode-tabs :deep([data-slot="tabs-trigger"]),
.ep-view-mode-tabs :deep([role="tab"]) {
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.2;
}
.ep-view-mode-tabs :deep([data-state='active']) {
  font-weight: 700;
}

.ep-metrics {
  width: auto;
  padding: 16px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 16px;
  background: var(--fb-surface, #fff);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.ep-metrics-anchors {
  gap: 4px;
  padding: 3px;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 999px;
  background: var(--fb-subtle, #fafafa);
}

.ep-metrics-anchors a {
  flex: 1 1 auto;
  padding: 6px 8px;
  border-radius: 999px;
  text-align: center;
}

.ep-metrics-anchors a:first-child {
  background: #ff3131;
  color: #fff;
}

.ep-metric-card {
  min-height: 118px;
  padding: 13px;
}

@media (max-width: 1399px) {
  .ep-body {
    grid-template-columns: 280px minmax(0, 1fr);
  }

  /* Colonne gauche plus étroite ici → bouton et repli recalés. */
  .ep-side-toggle {
    left: 289px;
  }
  .ep-body.ep-side-collapsed {
    grid-template-columns: 0 minmax(0, 1fr);
  }
  .ep-body.ep-side-collapsed .ep-side-toggle {
    left: 4px;
  }

  .ep-metrics {
    grid-column: 1 / -1;
    display: block;
    overflow: visible;
  }

  .ep-metrics-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .ep-body {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  /* Empilé : le repli grid n'a plus de sens → bouton masqué, colonne rétablie. */
  .ep-side-toggle {
    display: none;
  }
  .ep-body.ep-side-collapsed .ep-side {
    opacity: 1;
    pointer-events: auto;
  }

  .ep-side,
  .ep-main,
  .ep-metrics {
    overflow: visible;
  }

  .ep-side {
    width: 100%;
  }

  .ep-metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .ep-body {
    gap: 14px;
    padding: 14px 16px 20px;
  }

  .ep-header {
    padding: 10px 16px;
  }

  .ep-brand-text,
  .ep-header-chip,
  .ep-header-inv-btn {
    display: none !important;
  }

  .ep-metrics-grid {
    grid-template-columns: 1fr;
  }
}
</style>
<!-- force 1 nouveau buiild -->