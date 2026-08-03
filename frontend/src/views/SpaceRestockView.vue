<template>
  <!-- Header unifié (même barre que Analyse / Inventory / Logistic) : propre
       <v-app> + WorkspaceAppHeader, route self-headed côté DashboardView. -->
  <v-app class="sr-app">
    <WorkspaceAppHeader :space-name="spaceLabel" show-home />
    <v-main>
  <div class="space-restock-view">
    <!-- Bandeau rouge déplacé dans la colonne CENTRE (.sr-main), pattern
         EventPredict : 1er enfant de la colonne, pas full-width. -->

      <div class="sr-content">
    <div v-if="loading" class="sr-skeleton" :aria-label="t('srLoadingLabel')">
      <aside class="sr-skeleton-side">
        <span class="sr-skeleton-line sr-skeleton-line-title" />
        <span class="sr-skeleton-line" />
        <span class="sr-skeleton-calendar" />
        <span v-for="n in 4" :key="`event-${n}`" class="sr-skeleton-event" />
      </aside>
      <main class="sr-skeleton-main">
        <section v-for="panel in 3" :key="panel" class="sr-skeleton-panel">
          <div class="sr-skeleton-panel-head">
            <span class="sr-skeleton-line sr-skeleton-line-title" />
            <span class="sr-skeleton-line sr-skeleton-line-short" />
          </div>
          <span v-for="n in 4" :key="`${panel}-${n}`" class="sr-skeleton-row" />
        </section>
      </main>
    </div>

    <div v-else class="sr-body" :class="{ 'sr-body--no-aside': !showFilters }">
      <aside v-if="showFilters" class="sr-sidebar wsl-side">
        <WorkspaceToolSelect
          model-value="restock"
          :items="toolboxSelectItems"
          :label="t('srToolsLabel')"
          :aria-label="t('srToolboxNavLabel')"
          class="sr-toolbox-select wsl-toolbox"
          @update:model-value="onToolboxSelect"
        />
        <v-card variant="outlined" class="sr-panel">
          <header class="sr-panel-head">
            <div>
              <h2>{{ t('srEvents') }}</h2>
              <p>{{ predictedEvents.length }} {{ predictedEvents.length > 1 ? t('srPredictedPlural') : t('srPredictedSingular') }}</p>
            </div>
            <v-chip size="x-small" color="primary" variant="tonal">
              <template v-if="objectiveSource === 'sales'">{{ t('srReferenceEventChip') }}</template>
              <template v-else>{{ selectedEventIds.length }} {{ selectedEventIds.length > 1 ? t('srSelectedPlural') : t('srSelectedSingular') }}</template>
            </v-chip>
          </header>

          <div class="sr-objective-source">
            <!-- Switch Prévision/Ventes masqué (objectiveSource forcé 'forecast').
                 v-if="false" au lieu de suppression : mode Ventes reste fonctionnel
                 si réactivé plus tard (remettre v-if ou supprimer). -->
            <div v-if="false" class="sr-objective-toggle" role="tablist" :aria-label="t('srObjectiveSourceLabel')">
              <button
                type="button"
                :class="{ 'is-active': objectiveSource === 'forecast' }"
                @click="objectiveSource = 'forecast'"
              >
                {{ t('srForecast') }}
              </button>
              <button
                type="button"
                :class="{ 'is-active': objectiveSource === 'sales' }"
                @click="objectiveSource = 'sales'"
              >
                {{ t('srSalesRefEvent') }}
              </button>
            </div>

            <div v-if="objectiveSource === 'sales'" class="sr-reference-event">
              <v-select
                v-model="referenceEventId"
                :items="pastEventOptions"
                item-title="label"
                item-value="id"
                density="compact"
                variant="outlined"
                hide-details
                :placeholder="t('srReferenceEventPlaceholder')"
                :loading="referenceSalesLoading"
              />
              <p v-if="referenceSalesDegraded" class="sr-objective-warning">
                {{ t('srReferenceSalesDegraded') }}
              </p>
              <p v-else-if="!pastEventOptions.length" class="sr-objective-warning">
                {{ t('srNoPastEvent') }}
              </p>
              <p class="sr-objective-hint">
                {{ t('srObjectiveSalesHint') }}
              </p>
            </div>
          </div>

          <!-- Sélection de l'évènement prédit + scénario : mode Prévision
               uniquement (en mode Ventes l'objectif vient de l'event de réf.). -->
          <RestockEventScenarioPicker
            v-if="objectiveSource === 'forecast'"
            :events="predictedEvents"
            :selected-event-ids="selectedEventIds"
            :selected-scenario-by-event-id="selectedScenarioByEventId"
            @select-event="selectEvent"
            @select-scenario="selectScenario"
          />

          <!-- Action principale au plus près de la prédiction sélectionnée. -->
        </v-card>
      </aside>

      <main class="sr-main">
        <!-- Bandeau rouge : 1er enfant de la colonne centre (pattern EventPredict). -->
        <header class="sr-header sticky-header">
          <div class="sr-header__inner">
            <div class="sr-header__left">
              <!-- Flèche back retirée : retour via l'icône Accueil du header. -->
              <!-- Toggle STANDARD du panneau latéral (composant partagé). -->
              <WorkspacePanelToggle
                :open="showFilters"
                :label="t('srToggleFilters')"
                @toggle="showFilters = !showFilters"
              />
              <div class="sr-header__text">
                <h1 class="sr-header__title">{{ t('srTitle') }}</h1>
                <p class="sr-header__subtitle">
                  {{ spaceLabel }}
                  <span v-if="objectiveSource === 'sales' && referenceEvent">
                    · {{ t('srObjectiveSalesPrefix') }} {{ eventLabel(referenceEvent) }}
                  </span>
                  <span v-else-if="selectedEvents.length">
                    · {{ selectedEvents.length }} {{ selectedEvents.length > 1 ? t('srEventPlural') : t('srEventSingular') }}
                  </span>
                  <span v-if="previousInventoryLabel">
                    · {{ t('srSourceInventoryPrefix') }} {{ previousInventoryLabel }}
                  </span>
                </p>
              </div>
            </div>

            <div class="sr-header__right">
              <v-btn
                variant="outlined"
                size="small"
                class="sr-hbtn sr-mobile-config-btn"
                @click="mobileConfigSheet = true"
              >
                <v-icon size="16" class="mr-1">mdi-tune-variant</v-icon>
                {{ t('srSettings') }}
              </v-btn>
              <v-btn
                variant="flat"
                size="small"
                class="sr-cta-btn"
                :disabled="!canGenerate"
                @click="generateShoppingList"
              >
                <v-icon size="16" class="mr-1">mdi-cart-outline</v-icon>
                {{ t('srShoppingList') }}
              </v-btn>
            </div>
          </div>
          <p v-if="!canGenerate" class="sr-generate-hint">
            <v-icon size="14" class="mr-1">mdi-information-outline</v-icon>{{ cannotGenerateReason }}
          </p>
        </header>
        <!-- Assistant pas-à-pas : indicateur d'étapes (cercles + connecteurs). -->
        <nav class="sr-wizard" :aria-label="t('srStepOf') + ' ' + currentStep + '/3'">
          <template v-for="(label, idx) in [t('srStep1'), t('srStep2'), t('srStep3')]" :key="idx">
            <span
              v-if="idx > 0"
              class="sr-wizard-line"
              :class="{ 'sr-wizard-line-done': currentStep > idx }"
            />
            <button
              type="button"
              class="sr-wizard-step"
              :class="{
                'sr-wizard-step-active': currentStep === idx + 1,
                'sr-wizard-step-done': currentStep > idx + 1,
              }"
              :disabled="currentStep < idx + 1"
              :aria-current="currentStep === idx + 1 ? 'step' : undefined"
              @click="currentStep > idx + 1 && goToStep(idx + 1)"
            >
              <span class="sr-wizard-circle">{{ idx + 1 }}</span>
              <span class="sr-wizard-label">{{ label }}</span>
            </button>
          </template>
        </nav>

        <v-card v-show="currentStep === 1" variant="outlined" class="sr-panel">
          <header class="sr-panel-head sr-panel-head-actions">
            <div
              class="sr-panel-title"
              role="button"
              tabindex="0"
              :aria-expanded="!collapsed.stock"
              @click="collapsed.stock = !collapsed.stock"
              @keydown.enter.space.prevent="collapsed.stock = !collapsed.stock"
            >
              <v-icon size="20" class="sr-collapse-icon">{{ collapsed.stock ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
              <div>
                <h2>{{ t('srItemsToStock') }}</h2>
                <p>{{ t('srItemsToStockDesc') }}</p>
              </div>
              <span class="sr-badges">
                <v-chip size="x-small" variant="tonal" :color="stockSettingsRows.length ? 'primary' : 'grey'">
                  {{ stockSettingsRows.length }} {{ stockSettingsRows.length > 1 ? t('srItemPlural') : t('srItemSingular') }}
                </v-chip>
              </span>
            </div>
          </header>

          <AppSearchBar
            v-model="stockSearch"
            dense
            :placeholder="t('srFilterItems')"
            :clear-label="t('srClear') || 'Clear'"
          >
            <template #filters>
              <span class="sr-step-toolbar-label">{{ t('srTargetPresets') }}</span>
              <div class="sr-inline-actions">
                <button type="button" class="sr-inline-btn" @click="applyStockAdjustmentToAll(80)">80%</button>
                <button type="button" class="sr-inline-btn" @click="applyStockAdjustmentToAll(100)">100%</button>
                <button type="button" class="sr-inline-btn" @click="applyStockAdjustmentToAll(120)">120%</button>
                <button type="button" class="sr-inline-btn" @click="resetStockAdjustments">{{ t('srReset') }}</button>
                <button type="button" class="sr-inline-btn sr-inline-btn-select" @click="toggleAllStock(!allStockSelected)">
                  {{ allStockSelected ? t('srDeselectAll') : t('srSelectAll') }}
                </button>
              </div>
            </template>
          </AppSearchBar>

          <v-expand-transition>
          <div v-show="!collapsed.stock">
          <div v-if="!selectedEvents.length" class="sr-empty">
            {{ t('srSelectEventsEmpty') }}
          </div>

          <div v-else-if="filteredStockSettingsRows.length === 0" class="sr-empty">
            {{ t('srNoStockNeed') }}
          </div>

          <template v-else>
          <div class="sr-settings-list">
            <div
              v-for="item in filteredStockSettingsRows"
              :key="item.itemKey"
              class="sr-setting-row"
              :style="isStockSelected(item.itemKey) ? '' : 'opacity:0.5'"
            >
              <label class="sr-include-toggle" :title="t('srIncludeItem')">
                <input
                  type="checkbox"
                  :checked="isStockSelected(item.itemKey)"
                  :aria-label="t('srIncludeItem')"
                  @change="setStockSelected(item.itemKey, $event.target.checked)"
                />
              </label>
              <div class="sr-setting-info">
                <strong>{{ item.itemName }}</strong>
                <div class="sr-setting-meta">
                  <span class="sr-setting-shops">
                    {{ item.shopCount }} {{ item.shopCount > 1 ? t('srShopPlural') : t('srShopSingular') }}
                  </span>
                </div>
                <div v-if="item.recipeComponents.length" class="sr-recipe-inline">
                  <span class="sr-recipe-label">
                    <v-icon size="13">mdi-source-branch</v-icon>
                    {{ t('srCompositionLabel') }}
                  </span>
                  <span
                    v-for="component in item.recipeComponents"
                    :key="component.key"
                    class="sr-recipe-part"
                  >
                    {{ component.name }}
                    <em v-if="component.quantity">× {{ component.quantity }}{{ component.unit ? ` ${component.unit}` : '' }}</em>
                  </span>
                </div>
                <div class="sr-qty-block">
                  <span class="sr-qty-base">
                    {{ t('srPredictedLabel') }} {{ formatDisplayQuantity(item.totalQuantity, item.unit, item.itemKey) }}
                  </span>
                  <v-icon size="14" class="sr-qty-arrow">mdi-arrow-right</v-icon>
                  <span class="sr-qty-target">
                    {{ t('srTargetLabel') }} {{ formatDisplayQuantity(adjustedItemQuantity(item), item.unit, item.itemKey) }}
                  </span>
                </div>
              </div>

              <div class="sr-slider-wrap">
                <label class="sr-slider-label">{{ t('srAdjustNeedLabel') }}</label>
                <div class="sr-slider-row">
                  <input
                    type="range"
                    min="0"
                    max="200"
                    step="5"
                    :value="stockAdjustment(item.itemKey)"
                    class="sr-slider"
                    @input="setStockAdjustment(item.itemKey, $event.target.value)"
                  />
                  <span class="sr-slider-value">{{ stockAdjustment(item.itemKey) }}%</span>
                </div>
              </div>

              <label class="sr-pack-toggle">
                <input
                  type="checkbox"
                  :checked="isPackedMode(item.itemKey)"
                  :disabled="!packagingForItem(item, adjustedItemQuantity(item))"
                  @change="setPackedMode(item.itemKey, $event.target.checked)"
                />
                {{ t('srPacked') }}
              </label>
            </div>
          </div>
          </template>
          </div>
          </v-expand-transition>
          <!-- Assistant — pied d'étape 1 : générer le réarmement puis avancer. -->
          <footer class="sr-wizard-nav">
            <v-spacer />
            <div class="sr-wizard-nav-end">
              <p v-if="!canGenerate" class="sr-wizard-nav-hint">
                <v-icon size="14" class="mr-1">mdi-information-outline</v-icon>{{ cannotGenerateReason }}
              </p>
              <v-btn
                color="primary"
                variant="flat"
                :disabled="!canGenerate"
                :loading="previousInventoryLoading"
                @click="generateRestockTable"
              >
                <v-icon size="16" class="mr-1">mdi-table-plus</v-icon>
                {{ t('srGenerateRestock') }}
              </v-btn>
            </div>
          </footer>
        </v-card>

        <v-card v-show="currentStep === 2" variant="outlined" class="sr-panel">
          <header class="sr-panel-head sr-panel-head-actions">
            <div
              class="sr-panel-title"
              role="button"
              tabindex="0"
              :aria-expanded="!collapsed.restock"
              @click="collapsed.restock = !collapsed.restock"
              @keydown.enter.space.prevent="collapsed.restock = !collapsed.restock"
            >
              <v-icon size="20" class="sr-collapse-icon">{{ collapsed.restock ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
              <div>
                <h2>{{ t('srRestockTable') }}</h2>
                <p>{{ t('srRestockTableDesc') }}</p>
              </div>
              <span class="sr-badges">
                <template v-if="restockGenerated">
                  <v-chip size="x-small" variant="tonal" :color="restockRows.length ? 'deep-orange' : 'grey'">
                    {{ restockRows.length }} {{ t('srToDeposit') }}
                  </v-chip>
                  <v-chip
                    v-if="restockRows.length"
                    size="x-small"
                    variant="tonal"
                    :color="confirmedRestockCount === restockRows.length ? 'success' : 'grey'"
                  >
                    {{ confirmedRestockCount }}/{{ restockRows.length }} {{ t('srConfirmed') }}
                  </v-chip>
                </template>
                <v-chip v-else size="x-small" variant="tonal" color="grey">{{ t('srNotGenerated') }}</v-chip>
              </span>
            </div>
          </header>
          <AppSearchBar
            v-model="restockSearch"
            dense
            :placeholder="t('srFilterShopItem')"
            :clear-label="t('srClear') || 'Clear'"
          >
            <template #filters>
              <div class="sr-segmented">
                <button
                  type="button"
                  :class="{ active: restockViewMode === 'shop' }"
                  @click="restockViewMode = 'shop'"
                >
                  {{ t('srByShop') }}
                </button>
                <button
                  type="button"
                  :class="{ active: restockViewMode === 'item' }"
                  @click="restockViewMode = 'item'"
                >
                  {{ t('srByItem') }}
                </button>
              </div>
              <v-select
                v-if="restockEventOptions.length > 1"
                v-model="restockEventFilter"
                class="sr-event-filter"
                :items="restockEventOptions"
                item-title="label"
                item-value="id"
                density="compact"
                variant="outlined"
                hide-details
                clearable
                :placeholder="t('srFilterByEventPlaceholder')"
              />
            </template>
          </AppSearchBar>

          <v-expand-transition>
          <div v-show="!collapsed.restock">
          <div v-if="!restockGenerated" class="sr-empty">
            {{ t('srGenerateRestockHint') }}
          </div>

          <div v-else-if="restockRows.length === 0" class="sr-empty">
            {{ t('srNoElementToDeposit') }}
          </div>

          <div v-if="restockGenerated && restockRows.length" class="sr-progress-wrap">
            <div class="sr-progress-head">
              <strong>{{ confirmedRestockCount }}/{{ restockRows.length }} {{ t('srConfirmed') }}</strong>
              <span>{{ Math.round(restockCompletionRatio * 100) }}%</span>
            </div>
            <div class="sr-progress-track" role="progressbar" :aria-valuenow="Math.round(restockCompletionRatio * 100)" aria-valuemin="0" aria-valuemax="100">
              <span class="sr-progress-fill" :style="{ width: `${Math.round(restockCompletionRatio * 100)}%` }" />
            </div>
            <div class="sr-inline-actions">
              <button type="button" class="sr-inline-btn" @click="markAllVisibleRestocked(true)">{{ t('srConfirmAll') }}</button>
              <button type="button" class="sr-inline-btn" @click="markAllVisibleRestocked(false)">{{ t('srUncheckAll') }}</button>
              <button type="button" class="sr-inline-btn" @click="exportRestockCsv">{{ t('srExportCsv') }}</button>
            </div>
          </div>

          <div
            v-if="restockGenerated && restockRows.length && restockViewMode === 'shop'"
            class="sr-table-groups"
          >
            <section
              v-for="group in restockGroupsByShopSplit"
              :key="group.shopId"
              class="sr-table-group"
            >
              <header class="sr-group-head">
                <h3>{{ group.shopName }}</h3>
                <span>{{ group.assigned.length + group.unmapped.length }} {{ (group.assigned.length + group.unmapped.length) > 1 ? t('srItemPlural') : t('srItemSingular') }}</span>
              </header>
              <table v-if="group.assigned.length" class="sr-table sr-restock-table">
                <thead>
                  <tr>
                    <th>{{ t('srColItem') }}</th>
                    <th>{{ t('srColTarget') }}</th>
                    <th>{{ t('srColRemaining') }}</th>
                    <th>{{ t('srColToDeposit') }}</th>
                    <th>{{ t('srColConfirmed') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in group.assigned"
                    :key="row.rowKey"
                    :class="{ 'sr-row-confirmed': isRestocked(row.rowKey) }"
                  >
                    <td :data-label="t('srColItem')">
                      <strong>{{ row.itemName }}</strong>
                      <span><template v-if="row.sources && row.sources.length">{{ t('srUsedIn') }} </template>{{ sourceSummary(row) }}</span>
                    </td>
                    <td :data-label="t('srColTarget')">{{ formatDisplayQuantity(row.targetQuantity, row.unit, row.itemKey) }}</td>
                    <td :data-label="t('srColRemaining')">{{ formatLooseQuantity(row.remainingQuantity, row.unit) }}</td>
                    <td :data-label="t('srColToDeposit')" class="sr-strong">{{ formatRestockQuantity(row) }}</td>
                    <td :data-label="t('srColConfirmed')">
                      <button
                        type="button"
                        class="sr-confirm-btn"
                        :class="{ 'is-confirmed': isRestocked(row.rowKey) }"
                        :aria-pressed="isRestocked(row.rowKey)"
                        :title="isRestocked(row.rowKey) ? t('srUndoConfirmRow') : t('srConfirmRow')"
                        @click="setRestocked(row.rowKey, !isRestocked(row.rowKey))"
                      >
                        <v-icon size="14">{{ isRestocked(row.rowKey) ? 'mdi-check' : 'mdi-check-circle-outline' }}</v-icon>
                        {{ isRestocked(row.rowKey) ? t('srConfirmedRow') : t('srConfirmRow') }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
              <!-- Non rattachés au menu du PDV (vendus mais non assignés) -->
              <template v-if="group.unmapped.length">
                <div
                  class="sr-unmapped-header"
                  role="button"
                  tabindex="0"
                  @click="toggleRestockUnmapped(group.shopId)"
                  @keyup.enter="toggleRestockUnmapped(group.shopId)"
                >
                  <v-icon size="16">{{ restockUnmappedOpen[group.shopId] ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
                  <span>Non rattachés au menu — à remapper ({{ group.unmapped.length }})</span>
                </div>
                <table v-if="restockUnmappedOpen[group.shopId]" class="sr-table sr-restock-table sr-table-unmapped">
                  <thead>
                    <tr>
                      <th>{{ t('srColItem') }}</th>
                      <th>{{ t('srColTarget') }}</th>
                      <th>{{ t('srColRemaining') }}</th>
                      <th>{{ t('srColToDeposit') }}</th>
                      <th>{{ t('srColConfirmed') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in group.unmapped"
                      :key="row.rowKey"
                      class="sr-row-unmapped"
                      :class="{ 'sr-row-confirmed': isRestocked(row.rowKey) }"
                    >
                      <td :data-label="t('srColItem')">
                        <strong>{{ row.itemName }}</strong>
                        <span class="sr-unmapped-badge">non mappé</span>
                        <span><template v-if="row.sources && row.sources.length">{{ t('srUsedIn') }} </template>{{ sourceSummary(row) }}</span>
                      </td>
                      <td :data-label="t('srColTarget')">{{ formatDisplayQuantity(row.targetQuantity, row.unit, row.itemKey) }}</td>
                      <td :data-label="t('srColRemaining')">{{ formatLooseQuantity(row.remainingQuantity, row.unit) }}</td>
                      <td :data-label="t('srColToDeposit')" class="sr-strong">{{ formatRestockQuantity(row) }}</td>
                      <td :data-label="t('srColConfirmed')">
                        <button
                          type="button"
                          class="sr-confirm-btn"
                          :class="{ 'is-confirmed': isRestocked(row.rowKey) }"
                          :aria-pressed="isRestocked(row.rowKey)"
                          :title="isRestocked(row.rowKey) ? t('srUndoConfirmRow') : t('srConfirmRow')"
                          @click="setRestocked(row.rowKey, !isRestocked(row.rowKey))"
                        >
                          <v-icon size="14">{{ isRestocked(row.rowKey) ? 'mdi-check' : 'mdi-check-circle-outline' }}</v-icon>
                          {{ isRestocked(row.rowKey) ? t('srConfirmedRow') : t('srConfirmRow') }}
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </template>
            </section>
          </div>

          <div v-else-if="restockGenerated && restockRows.length" class="sr-table-groups">
            <section
              v-for="group in restockGroupsByItem"
              :key="group.itemKey"
              class="sr-table-group"
            >
              <header class="sr-group-head">
                <div>
                  <h3>{{ group.itemName }}</h3>
                  <span
                    v-if="groupSourceSummary(group)"
                    style="display:block;font-size:0.72rem;color:var(--sr-muted, #64748b);font-weight:500;margin-top:2px;"
                  >{{ t('srUsedIn') }} {{ groupSourceSummary(group) }}</span>
                </div>
                <span>{{ group.rows.length }} {{ group.rows.length > 1 ? t('srShopPlural') : t('srShopSingular') }}</span>
              </header>
              <table class="sr-table sr-restock-table">
                <thead>
                  <tr>
                    <th>{{ t('srColShop') }}</th>
                    <th>{{ t('srColTarget') }}</th>
                    <th>{{ t('srColRemaining') }}</th>
                    <th>{{ t('srColToDeposit') }}</th>
                    <th>{{ t('srColConfirmed') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in group.rows"
                    :key="row.rowKey"
                    :class="{ 'sr-row-confirmed': isRestocked(row.rowKey) }"
                  >
                    <td :data-label="t('srColShop')">
                      <strong>{{ row.shopName }}</strong>
                      <span>{{ row.eventNames.join(', ') }}</span>
                    </td>
                    <td :data-label="t('srColTarget')">{{ formatDisplayQuantity(row.targetQuantity, row.unit, row.itemKey) }}</td>
                    <td :data-label="t('srColRemaining')">{{ formatLooseQuantity(row.remainingQuantity, row.unit) }}</td>
                    <td :data-label="t('srColToDeposit')" class="sr-strong">{{ formatRestockQuantity(row) }}</td>
                    <td :data-label="t('srColConfirmed')">
                      <button
                        type="button"
                        class="sr-confirm-btn"
                        :class="{ 'is-confirmed': isRestocked(row.rowKey) }"
                        :aria-pressed="isRestocked(row.rowKey)"
                        :title="isRestocked(row.rowKey) ? t('srUndoConfirmRow') : t('srConfirmRow')"
                        @click="setRestocked(row.rowKey, !isRestocked(row.rowKey))"
                      >
                        <v-icon size="14">{{ isRestocked(row.rowKey) ? 'mdi-check' : 'mdi-check-circle-outline' }}</v-icon>
                        {{ isRestocked(row.rowKey) ? t('srConfirmedRow') : t('srConfirmRow') }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>
          </div>
          </v-expand-transition>
          <!-- Assistant — pied d'étape 2 : précédent + générer la feuille. -->
          <footer class="sr-wizard-nav">
            <v-btn variant="text" @click="goToStep(1)">
              <v-icon size="16" class="mr-1">mdi-chevron-left</v-icon>
              {{ t('srPrevious') }}
            </v-btn>
            <v-spacer />
            <div class="sr-wizard-nav-end">
              <p v-if="!canGenerate" class="sr-wizard-nav-hint">
                <v-icon size="14" class="mr-1">mdi-information-outline</v-icon>{{ cannotGenerateReason }}
              </p>
              <v-btn
                color="primary"
                variant="flat"
                :disabled="!canGenerate"
                @click="generateShoppingList"
              >
                <v-icon size="16" class="mr-1">mdi-cart-outline</v-icon>
                {{ t('srShoppingList') }}
              </v-btn>
            </div>
          </footer>
        </v-card>

        <v-card v-show="currentStep === 3" ref="shoppingPanel" variant="outlined" class="sr-panel">
          <header class="sr-panel-head sr-panel-head-actions">
            <div
              class="sr-panel-title"
              role="button"
              tabindex="0"
              :aria-expanded="!collapsed.shopping"
              @click="collapsed.shopping = !collapsed.shopping"
              @keydown.enter.space.prevent="collapsed.shopping = !collapsed.shopping"
            >
              <v-icon size="20" class="sr-collapse-icon">{{ collapsed.shopping ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
              <div>
                <h2>{{ t('srShoppingList') }}</h2>
                <p>{{ t('srShoppingListDesc') }}</p>
              </div>
              <span class="sr-badges">
                <template v-if="shoppingGenerated">
                  <v-chip size="x-small" variant="tonal" :color="shoppingGroups.length ? 'primary' : 'grey'">
                    {{ shoppingGroups.length }} {{ shoppingGroups.length > 1 ? t('srSupplierPlural') : t('srSupplierSingular') }}
                  </v-chip>
                  <v-chip v-if="shoppingItemsCount" size="x-small" variant="tonal" color="indigo">
                    {{ shoppingItemsCount }} {{ shoppingItemsCount > 1 ? t('srArticlePlural') : t('srArticleSingular') }}
                  </v-chip>
                </template>
                <v-chip v-else size="x-small" variant="tonal" color="grey">{{ t('srNotGeneratedFem') }}</v-chip>
              </span>
            </div>
          </header>
          <AppSearchBar
            v-model="shoppingSearch"
            dense
            :placeholder="t('srFilterSupplierItem')"
            :clear-label="t('srClear') || 'Clear'"
          >
            <template #filters>
              <div class="sr-segmented">
                <button
                  type="button"
                  :class="{ active: shoppingMode === 'finished' }"
                  @click="setShoppingMode('finished')"
                >
                  {{ t('srShoppingModeFinished') }}
                </button>
                <button
                  type="button"
                  :class="{ active: shoppingMode === 'ingredients' }"
                  @click="setShoppingMode('ingredients')"
                >
                  {{ t('srShoppingModeIngredients') }}
                </button>
              </div>
              <div class="sr-inline-actions">
                <button type="button" class="sr-inline-btn" :disabled="!shoppingGenerated || shoppingGroups.length === 0" @click="exportShoppingCsv">
                  {{ t('srExportCsv') }}
                </button>
                <button type="button" class="sr-inline-btn" :disabled="!shoppingGenerated || shoppingGroups.length === 0" @click="printShoppingList">
                  {{ t('srPrint') }}
                </button>
              </div>
            </template>
          </AppSearchBar>

          <v-expand-transition>
          <div v-show="!collapsed.shopping">
          <v-alert
            v-if="shoppingGenerated && nettedShopping.unmatchedStorage.length"
            type="warning"
            density="compact"
            variant="tonal"
            class="sr-storage-warn"
          >
            {{ t('srStorageUnmatchedWarn') }}
            <strong>{{ nettedShopping.unmatchedStorage.map((e) => e.name || e.itemId).join(', ') }}</strong>
          </v-alert>
          <div v-if="!shoppingGenerated" class="sr-empty">
            {{ t('srGenerateShoppingHint') }}
          </div>

          <div v-else-if="recipesLoading" class="sr-empty">
            <v-progress-circular indeterminate size="18" width="2" class="mr-2" />{{ t('srRecipesLoading') }}
          </div>

          <div v-else-if="shoppingGroups.length === 0" class="sr-empty">
            {{ shoppingMode === 'ingredients' ? t('srNoIngredientNeeded') : t('srNoPurchaseNeeded') }}
          </div>

          <div v-else class="sr-supplier-list">
            <section
              v-for="supplier in shoppingGroups"
              :id="`sr-supplier-${supplier.supplierId}`"
              :key="supplier.supplierId"
              class="sr-supplier-group"
            >
              <header class="sr-supplier-head">
                <div class="sr-supplier-title">
                  <h3>{{ supplier.supplierName }}</h3>
                  <span>{{ supplier.items.length }} {{ supplier.items.length > 1 ? t('srArticlePlural') : t('srArticleSingular') }}</span>
                </div>
                <div class="sr-supplier-actions">
                  <v-btn size="x-small" variant="tonal" color="primary" @click="emailSupplier(supplier)">
                    <v-icon size="14" class="mr-1">mdi-email-outline</v-icon>
                    {{ t('srEmail') }}
                  </v-btn>
                  <v-btn
                    size="x-small"
                    variant="tonal"
                    :disabled="!supplier.supplierPhone"
                    :title="supplier.supplierPhone || t('srSupplierPhoneMissingTitle')"
                    @click="callSupplier(supplier)"
                  >
                    <v-icon size="14" class="mr-1">mdi-phone-outline</v-icon>
                    {{ t('srCall') }}
                  </v-btn>
                </div>
              </header>
              <table class="sr-table sr-shopping-table">
                <thead>
                  <tr>
                    <th>{{ t('srColItem') }}</th>
                    <th>{{ t('srColQuantityToBuy') }}</th>
                    <th>{{ t('srColShops') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in supplier.items" :key="item.itemKey">
                    <td :data-label="t('srColItem')">
                      <strong>{{ item.itemName }}</strong>
                      <span
                        v-if="item.itemType !== 'MenuItem' && item.usedIn && item.usedIn.length"
                        style="display:block;font-size:0.72rem;color:var(--sr-muted, #64748b);font-weight:500;margin-top:2px;"
                      >{{ t('srUsedIn') }} {{ item.usedIn.slice(0, 4).join(', ') }}<template v-if="item.usedIn.length > 4"> +{{ item.usedIn.length - 4 }}</template></span>
                      <span class="sr-shop-diag">
                        {{ t('srDiagPredicted') }} {{ formatDiagQty(item.predicted, item.unit) }}
                        · {{ t('srDiagShop') }} {{ formatDiagQty(item.shopOnHand, item.unit) }}
                        · {{ t('srDiagStorage') }} {{ formatDiagQty(item.storageOnHand, item.unit) }}
                        · {{ t('srDiagRestock') }} {{ formatDiagQty(item.restockNeed, item.unit) }}
                        · {{ t('srDiagBuy') }} <strong>{{ formatDiagQty(item.buyQuantity, item.unit) }}</strong>
                      </span>
                    </td>
                    <td :data-label="t('srColToBuyShort')" class="sr-strong">{{ formatShoppingQuantity(item) }}</td>
                    <td :data-label="t('srColShops')">
                      <button
                        type="button"
                        class="sr-shops-toggle"
                        :aria-expanded="isShopsExpanded(item.itemKey)"
                        @click="toggleShops(item.itemKey)"
                      >
                        {{ item.shopNames.length }} {{ t('srPosShort') }}
                        <v-icon size="14">{{ isShopsExpanded(item.itemKey) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
                      </button>
                      <div v-if="isShopsExpanded(item.itemKey)" class="sr-shops-detail">
                        {{ item.shopNames.join(', ') }}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </section>
          </div>
          </div>
          </v-expand-transition>
          <!-- Assistant — pied d'étape 3 : précédent (export/impression dans l'en-tête). -->
          <footer class="sr-wizard-nav">
            <v-btn variant="text" @click="goToStep(2)">
              <v-icon size="16" class="mr-1">mdi-chevron-left</v-icon>
              {{ t('srPrevious') }}
            </v-btn>
            <v-spacer />
          </footer>
        </v-card>
      </main>

      <!-- Colonne DROITE : aperçu fournisseurs (réutilise shoppingGroups) —
           carte englobante + items façon « Résumé inventaire » de Space Inventory. -->
      <aside class="sr-suppliers">
        <div class="sr-sup-card">
          <header class="sr-sup-head">
            <span class="sr-sup-title">
              <v-icon size="16" class="me-1">mdi-truck-outline</v-icon>
              {{ t('srSuppliersPreviewTitle') }}
            </span>
            <span class="sr-sup-count">{{ shoppingGroups.length }}</span>
          </header>

          <p v-if="!shoppingGenerated" class="sr-sup-empty">{{ t('srSuppliersPreviewHint') }}</p>
          <p v-else-if="!shoppingGroups.length" class="sr-sup-empty">{{ t('srSuppliersPreviewEmpty') }}</p>

          <div v-else class="sr-sup-list">
            <div
              v-for="g in shoppingGroups"
              :key="g.supplierId"
              class="sr-sup-item"
              role="button"
              tabindex="0"
              @click="scrollToSupplier(g.supplierId)"
              @keyup.enter="scrollToSupplier(g.supplierId)"
            >
              <span class="sr-sup-item-copy">
                <strong>{{ g.supplierName }}</strong>
                <small>{{ g.items.length }} {{ g.items.length > 1 ? t('srArticlePlural') : t('srArticleSingular') }}</small>
              </span>
              <span class="sr-sup-item-total">
                <strong>{{ supplierUnitsTotal(g) }}</strong>
                <small>{{ t('srSuppliersUnits') }}</small>
              </span>
              <div class="sr-sup-item-bar">
                <span :style="{ width: supplierShare(g) + '%' }" />
              </div>
              <button
                type="button"
                class="sr-sup-item-email"
                @click.stop="openEmailDialog(g)"
              >
                <v-icon size="14" class="me-1">mdi-email-outline</v-icon>
                {{ t('srSuppliersEmailBtn') }}
              </button>
            </div>
          </div>
        </div>
      </aside>
    </div>

    <!-- Popup email fournisseur : contenu éditable (WYSIWYG léger) + Envoyer / Annuler. -->
    <v-dialog v-model="emailDialog.open" max-width="560">
      <v-card class="sr-email-dialog">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon color="primary">mdi-email-outline</v-icon>
          {{ t('srSuppliersEmailDialogTitle') }} — {{ emailDialog.supplierName }}
        </v-card-title>
        <v-card-text class="sr-email-dialog-content">
          <v-text-field
            v-model="emailDialog.to"
            :label="t('srSuppliersEmailTo')"
            density="compact"
            variant="outlined"
            hide-details
            class="mb-2"
          />
          <v-text-field
            v-model="emailDialog.subject"
            :label="t('srSuppliersEmailSubject')"
            density="compact"
            variant="outlined"
            hide-details
            class="mb-2"
          />
          <div class="sr-wysiwyg">
            <div class="sr-wysiwyg-toolbar">
              <button type="button" :title="t('srSuppliersEmailBold')" @click="wysiwygCmd('bold')"><v-icon size="16">mdi-format-bold</v-icon></button>
              <button type="button" :title="t('srSuppliersEmailItalic')" @click="wysiwygCmd('italic')"><v-icon size="16">mdi-format-italic</v-icon></button>
              <button type="button" :title="t('srSuppliersEmailUnderline')" @click="wysiwygCmd('underline')"><v-icon size="16">mdi-format-underline</v-icon></button>
              <span class="sr-wysiwyg-sep" />
              <button type="button" :title="t('srSuppliersEmailBullets')" @click="wysiwygCmd('insertUnorderedList')"><v-icon size="16">mdi-format-list-bulleted</v-icon></button>
            </div>
            <div
              ref="wysiwyg"
              class="sr-wysiwyg-editor"
              contenteditable="true"
              @input="onWysiwygInput"
            />
          </div>
        </v-card-text>
        <v-card-actions class="justify-end">
          <v-btn variant="text" @click="emailDialog.open = false">{{ t('srSuppliersEmailCancel') }}</v-btn>
          <v-btn color="primary" variant="flat" @click="confirmSendEmail">
            <v-icon size="16" class="me-1">mdi-send</v-icon>
            {{ t('srSuppliersEmailSend') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-bottom-sheet v-model="mobileConfigSheet" inset>
      <v-card class="sr-mobile-config-sheet">
        <v-card-title class="d-flex align-center ga-2">
          <v-icon color="primary">mdi-tune-variant</v-icon>
          {{ t('srSettingsSheetTitle') }}
        </v-card-title>
        <v-card-text class="sr-mobile-config-content">
          <div class="sr-mobile-sheet-block">
            <span class="sr-mobile-sheet-label">{{ t('srToolsLabel') }}</span>
            <WorkspaceToolSelect
              model-value="restock"
              :items="toolboxSelectItems"
              :aria-label="t('srToolboxNavLabel')"
              @update:model-value="mobileConfigSheet = false; onToolboxSelect($event)"
            />
          </div>

          <v-card variant="outlined" class="sr-panel sr-mobile-config-panel">
            <header class="sr-panel-head">
              <div>
                <h2>{{ t('srEvents') }}</h2>
                <p>{{ predictedEvents.length }} {{ predictedEvents.length > 1 ? t('srPredictedPlural') : t('srPredictedSingular') }}</p>
              </div>
              <v-chip size="x-small" color="primary" variant="tonal">
                <template v-if="objectiveSource === 'sales'">{{ t('srReferenceEventChip') }}</template>
                <template v-else>{{ selectedEventIds.length }} {{ selectedEventIds.length > 1 ? t('srSelectedPlural') : t('srSelectedSingular') }}</template>
              </v-chip>
            </header>

            <div class="sr-objective-source">
              <!-- Switch Prévision/Ventes masqué (objectiveSource forcé 'forecast').
                 v-if="false" au lieu de suppression : mode Ventes reste fonctionnel
                 si réactivé plus tard (remettre v-if ou supprimer). -->
            <div v-if="false" class="sr-objective-toggle" role="tablist" :aria-label="t('srObjectiveSourceLabel')">
                <button
                  type="button"
                  :class="{ 'is-active': objectiveSource === 'forecast' }"
                  @click="objectiveSource = 'forecast'"
                >
                  {{ t('srForecast') }}
                </button>
                <button
                  type="button"
                  :class="{ 'is-active': objectiveSource === 'sales' }"
                  @click="objectiveSource = 'sales'"
                >
                  {{ t('srSalesRefEvent') }}
                </button>
              </div>

              <div v-if="objectiveSource === 'sales'" class="sr-reference-event">
                <v-select
                  v-model="referenceEventId"
                  :items="pastEventOptions"
                  item-title="label"
                  item-value="id"
                  density="compact"
                  variant="outlined"
                  hide-details
                  :placeholder="t('srReferenceEventPlaceholder')"
                  :loading="referenceSalesLoading"
                />
                <p v-if="referenceSalesDegraded" class="sr-objective-warning">
                  {{ t('srReferenceSalesDegraded') }}
                </p>
                <p v-else-if="!pastEventOptions.length" class="sr-objective-warning">
                  {{ t('srNoPastEvent') }}
                </p>
                <p class="sr-objective-hint">
                  {{ t('srObjectiveSalesHintShort') }}
                </p>
              </div>
            </div>

            <RestockEventScenarioPicker
              v-if="objectiveSource === 'forecast'"
              :events="predictedEvents"
              :selected-event-ids="selectedEventIds"
              :selected-scenario-by-event-id="selectedScenarioByEventId"
              @select-event="selectEvent"
              @select-scenario="selectScenario"
            />
          </v-card>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="mobileConfigSheet = false">{{ t('close') }}</v-btn>
        </v-card-actions>
      </v-card>
    </v-bottom-sheet>

    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3500">
      {{ snackbarText }}
    </v-snackbar>
      </div>
  </div>
    </v-main>
  </v-app>
</template>

<script>
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import WorkspaceToolSelect from '@/components/WorkspaceToolSelect.vue'
import AppSearchBar from '@/components/common/AppSearchBar.vue'
import RestockEventScenarioPicker from '@/components/restock/RestockEventScenarioPicker.vue'
import WorkspacePanelToggle from '@/components/WorkspacePanelToggle.vue'
import WorkspaceAppHeader from '@/components/WorkspaceAppHeader.vue'
import { generatePredictionsForEvent } from '@/utils/predictiveAnalytics'
import { parseEventDate, formatDateMedium } from '@/utils/dateFr'
import {
  buildStockRequirements,
  buildMenuItemDemand,
  collectFbElements,
  collectStorageElements,
  computePackagingForQuantity,
  deriveSelectedMenuItemsByShop,
  findStockReference,
} from '@/utils/stockPlanning'
// BOM (achats/production) : explosion des plats en ingrédients, indépendamment
// de readyForSale. Recette lue via le détail /menu-items/:id (hydratation).
import { normalizeRecipe, buildIngredientRequirements } from '@/utils/bomPlanning'
import { getMenuItemById } from '@/api/endpoints/menu-item.api'
// Versions de prédiction (scénarios) — rapatriées depuis la BDD pour pré-remplir
// le réarmement même sans pont localStorage (cf. recompute depuis la version active).
import { listEventPredictVersions } from '@/api/endpoints/eventPredict.api'
// Catalogue fournisseurs (/suppliers) — le store analyse ne les porte pas tous
// (il vient de shop-details). Nécessaire pour nommer le fournisseur d'un ingrédient.
import { getSuppliers } from '@/api/endpoints/menu.api'
import {
  getInventory as apiGetInventory,
  getLatestInventory as apiGetLatestInventory,
} from '@/api/endpoints/inventory.api'
import { fetchReferenceSales } from '@/composables/useReferenceSales'
import { aggregateSalesToPredictedRecords } from '@/utils/salesAggregation'
import { getShopElementMappings } from '@/utils/api'
// Réconciliation menu (« non rattachés ») — assignation NestJS par shop + matcher
// nom (mêmes utilitaires qu'EventPredict, clé = nom de shop normalisé).
import { runWithConcurrency } from '@/utils/asyncPool'
import { normalizeStr } from '@/utils/predictiveAnalytics'
import { findBestMatch } from '@/utils/menuItemMatching'
// Formule de restant compté partagée avec useShoppingList (Règle 3) — source unique.
import { countedRemaining } from '@/utils/shoppingList'
// Netting stock ↔ feuille de course (cascade de matching + pool consommable).
import { consumeFromPool, preparePool } from '@/utils/stockNetting'
// DB locale (localStorage) — persiste l'état réarmement sans backend.
import * as localDb from '@/data/localDb'
import {
  getRestockState,
  putRestockState,
  isRestockApiDown,
  onRestockApiError,
} from '@/api/endpoints/restock.api'
import { isDemoMode } from '@/utils/demoMode'

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

// Slug d'étape de l'assistant dans l'URL (?step=) — deep-link / refresh / partage
// sur une étape précise. 1 = éléments à stocker, 2 = réarmement, 3 = feuille de course.
const STEP_SLUGS = { 1: 'stock', 2: 'restock', 3: 'shopping' }
const SLUG_STEPS = { stock: 1, restock: 2, shopping: 3 }

function dateOnlyTs(value) {
  const d = value instanceof Date ? value : parseEventDate(value) || new Date(value)
  if (!d || Number.isNaN(d.getTime())) return null
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function extractInventoryCounts(payload) {
  if (!payload) return {}
  if (payload.inventoryCounts && typeof payload.inventoryCounts === 'object') {
    return payload.inventoryCounts
  }
  if (payload.data?.inventoryCounts && typeof payload.data.inventoryCounts === 'object') {
    return payload.data.inventoryCounts
  }
  if (payload.counts && typeof payload.counts === 'object') return payload.counts

  const values = Object.values(payload)
  const looksLikeCounts =
    values.length > 0 &&
    values.every((shopCounts) => shopCounts && typeof shopCounts === 'object')
  return looksLikeCounts ? payload : {}
}

function roundForUnit(value, unit) {
  const q = Number(value) || 0
  const u = String(unit || '').toLowerCase()
  if (u === 'pcs' || u === 'pc' || u === 'piece' || u === 'pieces') {
    return Math.ceil(q)
  }
  return Math.round(q * 10) / 10
}

export default {
  name: 'SpaceRestockView',
  components: { WorkspaceToolSelect, RestockEventScenarioPicker, AppSearchBar, WorkspacePanelToggle, WorkspaceAppHeader },
  setup() {
    const store = useStore()
    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    return { store, route, router, t }
  },
  data() {
    return {
      TOOLBOX_ITEMS,
      // Teleport du header Dashboard : activé après montage (la cible
      // #space-builder-header-target est rendue par le v-app-bar parent).
      headerReady: false,
      // Affichage du panneau latéral (filtres / objectif / events) — bascule via
      // l'icône du bandeau. Ouvert par défaut.
      showFilters: true,
      loading: false,
      previousInventoryLoading: false,
      // Liste de courses : repli de la liste « Shops » par article (évite des
      // lignes très longues sur mobile). Clé = item.itemKey.
      shopsExpanded: {},
      // Réconciliation « non rattachés » : assignation menu par shop (NestJS),
      // keyée par NOM de shop normalisé. Map<normShopName, {ids:Set, items:[]}>.
      restockAssignmentByName: null,
      _restockAssignmentCache: null,
      // Noms bruts des PdV FERMÉS pour l'event (isOpen=false ET menuItemsCount=0) →
      // exclus du réarmement. Peuplé par loadRestockShopAssignment (mêmes rows).
      closedShopNames: [],
      _restockClosedCache: null,
      // Repli de la section « non rattachés » par shop (clé = shopId).
      restockUnmappedOpen: {},
      // Popup email fournisseur (colonne Aperçu) : contenu éditable + envoi/annulation.
      emailDialog: {
        open: false,
        supplierName: '',
        to: '',
        subject: '',
        body: '',
      },
      selectedEventIds: [],
      // Règle 3 : objectif de réarmement dérivé d'un event passé (ventes) ou de la prévision.
      objectiveSource: 'forecast', // 'forecast' | 'sales'
      referenceEventId: null,
      // Date prévue de l'évènement (reçue depuis EventPredict via ?date=) —
      // utilisée pour la feuille de course (nom de fichier, email, impression).
      plannedEventDate: null,
      referenceSalesRecords: [],
      referenceSalesDegraded: false,
      referenceSalesError: null,
      referenceSalesLoading: false,
      // Scénario (version EventPredict) choisi par évènement : eventId → versionId.
      selectedScenarioByEventId: {},
      // Versions rapatriées depuis la BDD (réactif) : eventId → version[]. Prime
      // sur le miroir localStorage. manualQuantities (front-only) fusionné depuis
      // le local par id (le backend ne stocke pas cette colonne).
      bddVersionsByEventId: {},
      // Méta des records lus depuis localStorage (ajustements % + menuConfig)
      // par évènement, pour reproduire les quantités EventPredict.
      predictionMetaByEventId: {},
      stockSearch: '',
      restockSearch: '',
      shoppingSearch: '',
      mobileConfigSheet: false,
      stockAdjustments: {},
      stockPackedModes: {},
      stockExcluded: {}, // itemKeys décochés → exclus de la génération du réarmement
      _restockPutTimer: null, // debounce du PUT /restock-state (non réactif)
      predictionRecordsByEventId: {},
      previousInventoryCounts: {},
      previousInventoryEvent: null,
      restockGenerated: false,
      shoppingGenerated: false,
      restockViewMode: 'shop',
      // Filtre d'affichage de la feuille de réarmement : null = tous les events.
      // N'altère pas les quantités (agrégées sur tous les events sélectionnés) —
      // masque seulement les lignes qui ne concernent pas l'event choisi.
      restockEventFilter: null,
      // Feuille de course : 'ingredients' (défaut) = explosion BOM en matière à
      // produire/acheter en cuisine centrale (ignore readyForSale) ; 'finished' =
      // produits finis transportés au PDV (réarmement). Voir bomPlanning.js.
      shoppingMode: 'ingredients',
      // Recettes détaillées hydratées depuis /menu-items/:id (la liste ne les
      // porte pas) : menuItemId -> normalizeRecipe(). Cache local non réactif côté
      // contenu mais réassigné en bloc pour déclencher la réactivité.
      recipeByMenuItemId: {},
      recipesLoading: false,
      // Catalogue fournisseurs complet (/suppliers) pour nommer le fournisseur
      // d'un ingrédient (le store analyse n'en a qu'un sous-ensemble).
      bomSuppliers: [],
      // Assistant pas-à-pas (wizard) sur les 3 panneaux de .sr-main :
      // 1 = Éléments à stocker, 2 = Réarmement, 3 = Feuille de course.
      currentStep: 1,
      // Repli des panneaux (clic sur l'en-tête). Tous repliés par défaut :
      // l'utilisateur lit le résumé via les badges, déplie au besoin.
      collapsed: { stock: true, restock: true, shopping: true },
      restockedRows: {},
      restoringState: false,
      snackbar: false,
      snackbarText: '',
      snackbarColor: 'success',
    }
  },
  computed: {
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
    currentSpace() { return this.store.state.analyse?.space || null },
    spaceLabel() { return this.currentSpace?.name || this.route.params?.spaceId || '' },
    configurations() { return this.store.state.analyse?.configurations || [] },
    events() { return this.store.state.analyse?.events || [] },
    shopGranularData() { return this.store.state.analyse?.shopGranularData || [] },
    menuItems() { return this.store.state.analyse?.menuItems || [] },
    suppliers() { return this.store.state.analyse?.suppliers || [] },
    ingredients() { return this.store.state.analyse?.ingredients || [] },
    components() { return this.store.state.analyse?.components || [] },
    marketPrices() { return this.store.state.inventory?.marketPrices || [] },
    today() {
      const d = new Date()
      d.setHours(0, 0, 0, 0)
      return d
    },
    futureEvents() {
      return this.events
        .filter((event) => {
          const ts = dateOnlyTs(event.eventDate || event.date)
          return ts != null && ts >= this.today.getTime()
        })
        .sort((a, b) => dateOnlyTs(a.eventDate || a.date) - dateOnlyTs(b.eventDate || b.date))
    },
    pastEvents() {
      return this.events
        .filter((event) => {
          const ts = dateOnlyTs(event.eventDate || event.date)
          return ts != null && ts < this.today.getTime()
        })
        .sort((a, b) => dateOnlyTs(a.eventDate || a.date) - dateOnlyTs(b.eventDate || b.date))
    },
    selectedEvents() {
      const ids = new Set(this.selectedEventIds)
      // Tous les events (pas seulement futurs) : un event AVEC prédiction peut
      // être daté dans le passé et doit rester exploitable en réarmement.
      return this.events.filter((event) => ids.has(event.id))
    },
    canGenerate() {
      return this.objectiveEvents.length > 0 && this.stockRowsRaw.length > 0
    },
    /** Explique pourquoi la génération est désactivée (le comptage n'entre PAS en
     *  jeu : seuls l'objectif + le besoin théorique conditionnent canGenerate). */
    cannotGenerateReason() {
      if (this.canGenerate) return ''
      if (this.objectiveEvents.length === 0) {
        return this.objectiveSource === 'sales'
          ? this.t('srCannotGenSalesNoRef')
          : this.t('srCannotGenForecastNoEvent')
      }
      if (this.stockRowsRaw.length === 0) {
        return this.objectiveSource === 'sales'
          ? this.t('srCannotGenSalesNoSales')
          : this.t('srCannotGenForecastNoForecast')
      }
      return this.t('srCannotGenGeneric')
    },
    /**
     * Couverture catalogue des items prédits : combien des menuItemId présents
     * dans les records EventPredict (qty>0) se résolvent dans `menuItems`
     * (par id → mappedMenuItemId → nom, MÊME logique que buildStockRequirements).
     * `resolved < needed` ⇒ catalogue incomplet → recettes/packaging/courses
     * dégradés même si les quantités s'affichent (fallback feuille).
     */
    forecastCatalogCoverage() {
      if (this.objectiveSource !== 'forecast') return { needed: 0, resolved: 0 }
      const idSet = new Set((this.menuItems || []).map((m) => String(m.id)))
      const nameSet = new Set(
        (this.menuItems || [])
          .filter((m) => m?.name)
          .map((m) => String(m.name).trim().toLowerCase()),
      )
      const seen = new Set()
      let resolved = 0
      this.selectedEventIds.forEach((eid) => {
        ;(this.predictionRecordsByEventId[eid] || []).forEach((r) => {
          const qty = Number(r.totalQuantity ?? r.adjustedQuantity ?? r.quantity ?? r.qty) || 0
          if (qty <= 0) return
          const id = String(r.menuItemId || r.mappedMenuItemId || r.itemId || '')
          if (!id || seen.has(id)) return
          seen.add(id)
          const name = String(r.itemName || r.mappedMenuItemName || '').trim().toLowerCase()
          if (
            idSet.has(id) ||
            (r.mappedMenuItemId && idSet.has(String(r.mappedMenuItemId))) ||
            (name && nameSet.has(name))
          ) {
            resolved += 1
          }
        })
      })
      return { needed: seen.size, resolved }
    },
    /** Vrai si au moins un item prédit n'a pas de correspondance catalogue. */
    forecastCatalogDegraded() {
      const { needed, resolved } = this.forecastCatalogCoverage
      return needed > 0 && resolved < needed
    },
    referenceEvent() {
      return this.pastEvents.find((event) => event.id === this.referenceEventId) || null
    },
    pastEventOptions() {
      // plus récents en premier
      return this.pastEvents
        .slice()
        .reverse()
        .map((event) => ({
          id: event.id,
          label: `${this.eventLabel(event)} · ${this.eventDateLabel(event)}`,
        }))
    },
    objectiveEvents() {
      // En mode "ventes", l'objectif vient de l'unique event de référence (passé).
      if (this.objectiveSource === 'sales') {
        return this.referenceEvent ? [this.referenceEvent] : []
      }
      return this.selectedEvents
    },
    previousInventoryLabel() {
      if (this.previousInventoryEvent) {
        return `${this.eventLabel(this.previousInventoryEvent)} (${this.eventDateLabel(this.previousInventoryEvent)})`
      }
      return Object.keys(this.previousInventoryCounts || {}).length ? this.t('srLastSnapshot') : ''
    },
    /** Règle 3 : comptage courant (inventoryStore.inventoryCounts) = source canonique du restant. */
    storeInventoryCounts() {
      return this.store.state.inventory?.inventoryCounts || {}
    },
    /**
     * Configs résolues pour chaque event objectif (même logique que stockRowsRaw
     * / menuItemDemandRows). Source unique pour retrouver les éléments Storage et
     * les shops F&B dont on lit les comptages.
     */
    resolvedObjectiveConfigs() {
      return this.objectiveEvents
        .map((event) => {
          const meta =
            this.objectiveSource === 'sales' ? null : this.predictionMetaByEventId[event.id]
          const records =
            this.objectiveSource === 'sales'
              ? this.referenceSalesRecords
              : this.predictionRecordsByEventId[event.id] || []
          const configuration = this.resolveConfigForRecords(
            event,
            records,
            meta?.configuration,
            meta?.menuConfig,
          )
          return { event, configuration }
        })
        .filter((entry) => entry.configuration)
    },
    /** Ids des éléments Storage (réserve centrale) sur les configs objectif. */
    storageElementIds() {
      const ids = new Set()
      this.resolvedObjectiveConfigs.forEach(({ configuration }) => {
        collectStorageElements(configuration).forEach((el) => {
          if (el?.id != null) ids.add(String(el.id))
        })
      })
      return Array.from(ids)
    },
    /** Ids des shops F&B sur les configs objectif (net stock ingrédients). */
    fbShopElementIds() {
      const ids = new Set()
      this.resolvedObjectiveConfigs.forEach(({ configuration }) => {
        collectFbElements(configuration).forEach((el) => {
          if (el?.id != null) ids.add(String(el.id))
        })
      })
      return Array.from(ids)
    },
    /** 1er évènement sélectionné (contexte nav ?event= / comptages) — la
     *  sélection elle-même est multiple (selectedEventIds). */
    selectedEventId() {
      return this.selectedEventIds[0] || null
    },
    /**
     * Évènements PRÉDITS = futurs ayant une prévision/version sauvegardée par
     * Event Predict (ou des records `current` persistés). Enrichis pour le
     * picker : nom, date, showTime, config, scénarios (versions).
     */
    predictedEvents() {
      return [...this.events]
        .sort((a, b) => dateOnlyTs(a.eventDate || a.date) - dateOnlyTs(b.eventDate || b.date))
        .map((event) => {
          const versions = this.versionsForEvent(event.id)
          const hasCurrent = this.hasSavedPrediction(event.id)
          if (!versions.length && !hasCurrent) return null
          return {
            id: event.id,
            name: this.eventLabel(event),
            dateLabel: this.eventDateLabel(event),
            showTime: event.sessions?.[0]?.showTime || '',
            configName: this.configurationNameForEvent(event),
            date: event.eventDate || event.date || null,
            scenarios: versions.map((v) => ({
              id: v.id,
              name: v.name,
              revenue: v.adjustedTotalRevenue ?? v.totalRevenue ?? null,
              units: this.scenarioTotalUnits(v),
            })),
          }
        })
        .filter(Boolean)
    },
    stockRowsRaw() {
      const grouped = new Map()

      this.objectiveEvents.forEach((event) => {
        // Méta EventPredict (lue depuis localStorage) : config + menuConfig + %
        // ajustés → reproduit EXACTEMENT ce qu'EventPredict a calculé.
        const meta = this.objectiveSource === 'sales' ? null : this.predictionMetaByEventId[event.id]
        const records =
          this.objectiveSource === 'sales'
            ? this.referenceSalesRecords
            : this.predictionRecordsByEventId[event.id] || []
        // Choisit une config qui CONTIENT réellement les shops des records (le
        // fallback par défaut peut renvoyer une config homonyme VIDE). En dernier
        // recours, reconstruit une config synthétique depuis les records.
        const configuration = this.resolveConfigForRecords(
          event,
          records,
          meta?.configuration,
          meta?.menuConfig,
        )
        if (!configuration) return
        const selectedMenuItems = meta?.menuConfig
          ? meta.menuConfig
          : deriveSelectedMenuItemsByShop(configuration, records)
        const rows = buildStockRequirements({
          configuration,
          menuItems: this.menuItems,
          components: this.components,
          predictedRecords: records,
          selectedMenuItems,
          quantityAdjustments: meta?.quantityAdjustments || undefined,
          closedShopNames: this.closedShopNames,
        })

        rows.forEach((row) => {
          const key = `${row.shopId}|||${row.itemKey}`
          const eventName = this.eventLabel(event)
          const existing = grouped.get(key)
          if (existing) {
            existing.totalQuantity += row.totalQuantity
            if (!existing.eventIds.includes(event.id)) existing.eventIds.push(event.id)
            if (!existing.eventNames.includes(eventName)) existing.eventNames.push(eventName)
            row.sources.forEach((source) => {
              const previous = existing.sources.find(
                (s) => s.menuItemName === source.menuItemName && s.unit === source.unit,
              )
              if (previous) {
                previous.menuItemQuantity += source.menuItemQuantity
                previous.componentQuantity += source.componentQuantity
              } else {
                existing.sources.push({ ...source })
              }
            })
          } else {
            grouped.set(key, {
              ...row,
              eventIds: [event.id],
              eventNames: [eventName],
              sources: row.sources.map((source) => ({ ...source })),
            })
          }
        })
      })

      return Array.from(grouped.values()).sort((a, b) => {
        const shopCmp = String(a.shopName).localeCompare(String(b.shopName))
        if (shopCmp) return shopCmp
        return String(a.itemName).localeCompare(String(b.itemName))
      })
    },
    stockSettingsRows() {
      const grouped = new Map()
      this.stockRowsRaw.forEach((row) => {
        const existing = grouped.get(row.itemKey)
        if (existing) {
          existing.totalQuantity += row.totalQuantity
          existing.shopIds.add(row.shopId)
          ;(row.sources || []).forEach((source) => {
            const sourceKey = source.menuItemId || source.menuItemName
            const previous = existing.sources.find(
              (candidate) => (candidate.menuItemId || candidate.menuItemName) === sourceKey,
            )
            if (previous) previous.componentQuantity += Number(source.componentQuantity) || 0
            else existing.sources.push({ ...source })
          })
        } else {
          grouped.set(row.itemKey, {
            itemKey: row.itemKey,
            itemId: row.itemId,
            sourceId: row.sourceId,
            itemName: row.itemName,
            unit: row.unit,
            totalQuantity: row.totalQuantity,
            shopIds: new Set([row.shopId]),
            sources: (row.sources || []).map((source) => ({ ...source })),
          })
        }
      })
      return Array.from(grouped.values())
        .map((row) => ({
          ...row,
          shopCount: row.shopIds.size,
          sourceNames: Array.from(new Set(row.sources.map((source) => source.menuItemName).filter(Boolean))),
          recipeComponents: this.recipeComponentsForStockItem(row),
        }))
        .sort((a, b) => String(a.itemName).localeCompare(String(b.itemName)))
    },
    filteredStockSettingsRows() {
      const q = (this.stockSearch || '').trim().toLowerCase()
      if (!q) return this.stockSettingsRows
      return this.stockSettingsRows.filter((row) => {
        const searchable = [
          row.itemName,
          ...(row.sourceNames || []),
          ...(row.recipeComponents || []).map((component) => component.name),
        ].join(' ').toLowerCase()
        return searchable.includes(q)
      })
    },
    stockCompositionGroups() {
      const groups = new Map()
      this.stockSettingsRows.forEach((row) => {
        ;(row.sources || []).forEach((source) => {
          if (!source.menuItemName) return
          const key = String(source.menuItemId || source.menuItemName)
          if (!groups.has(key)) groups.set(key, { key, name: source.menuItemName, components: new Map() })
          const group = groups.get(key)
          const previous = group.components.get(row.itemKey)
          if (previous) previous.totalQuantity += Number(source.componentQuantity) || 0
          else {
            group.components.set(row.itemKey, {
              itemKey: row.itemKey,
              itemName: row.itemName,
              unit: row.unit,
              totalQuantity: Number(source.componentQuantity) || 0,
            })
          }
        })
      })
      return Array.from(groups.values())
        .map((group) => ({
          ...group,
          components: Array.from(group.components.values())
            .sort((a, b) => String(a.itemName).localeCompare(String(b.itemName))),
        }))
        .filter((group) => group.components.length > 1)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
    },
    visibleStockCompositionGroups() {
      const q = (this.stockSearch || '').trim().toLowerCase()
      if (!q) return this.stockCompositionGroups
      return this.stockCompositionGroups.filter((group) =>
        [group.name, ...group.components.map((component) => component.itemName)]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    },
    allStockSelected() {
      const rows = this.stockSettingsRows
      return rows.length > 0 && rows.every((r) => !this.stockExcluded[r.itemKey])
    },
    stockSettingsSignature() {
      return this.stockSettingsRows.map((row) => row.itemKey).sort().join('|')
    },
    restockRows() {
      return this.stockRowsRaw.map((row) => {
        const targetQuantity = this.adjustedQuantity(row.totalQuantity, row.unit, row.itemKey)
        const packaging = this.packagingForItem(row, targetQuantity)
        const remainingQuantity = this.remainingQuantityForRow(row, packaging)
        const restockQuantity = Math.max(
          0,
          roundForUnit(targetQuantity - remainingQuantity, row.unit),
        )
        return {
          ...row,
          rowKey: `${row.shopId}|||${row.itemKey}`,
          targetQuantity,
          remainingQuantity,
          restockQuantity,
          packaging,
        }
      }).filter((row) => row.restockQuantity > 0 && !this.stockExcluded[row.itemKey])
    },
    /** Events réellement présents dans la feuille (id + label), pour le filtre. */
    restockEventOptions() {
      const idsInRows = new Set()
      this.restockRows.forEach((row) => (row.eventIds || []).forEach((id) => idsInRows.add(id)))
      return this.selectedEvents
        .filter((event) => idsInRows.has(event.id))
        .map((event) => ({ id: event.id, label: this.eventLabel(event) }))
    },
    filteredRestockRows() {
      let rows = this.restockRows
      if (this.restockEventFilter) {
        rows = rows.filter((row) => (row.eventIds || []).includes(this.restockEventFilter))
      }
      const q = (this.restockSearch || '').trim().toLowerCase()
      if (!q) return rows
      return rows.filter((row) => {
        const sourceNames = (row.sources || []).map((s) => s.menuItemName).join(' ')
        const eventNames = (row.eventNames || []).join(' ')
        const haystack = [row.shopName, row.itemName, sourceNames, eventNames]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        return haystack.includes(q)
      })
    },
    restockGroupsByShop() {
      const groups = new Map()
      this.filteredRestockRows.forEach((row) => {
        if (!groups.has(row.shopId)) {
          groups.set(row.shopId, { shopId: row.shopId, shopName: row.shopName, rows: [] })
        }
        groups.get(row.shopId).rows.push(row)
      })
      return Array.from(groups.values())
    },
    /** True dès qu'au moins un shop a un menu assigné (feature « non rattachés »). */
    restockAssignmentActive() {
      return this.restockAssignmentByName instanceof Map && this.restockAssignmentByName.size > 0
    },
    /** Groupes par shop scindés en `assigned` (au menu du PDV) vs `unmapped`. */
    restockGroupsByShopSplit() {
      const active = this.restockAssignmentActive
      const groups = new Map()
      this.filteredRestockRows.forEach((row) => {
        if (!groups.has(row.shopId)) {
          groups.set(row.shopId, {
            shopId: row.shopId,
            shopName: row.shopName,
            assigned: [],
            unmapped: [],
          })
        }
        const g = groups.get(row.shopId)
        if (active && !this.restockRowAssigned(row)) g.unmapped.push(row)
        else g.assigned.push(row)
      })
      return Array.from(groups.values())
    },
    restockGroupsByItem() {
      const groups = new Map()
      this.filteredRestockRows.forEach((row) => {
        if (!groups.has(row.itemKey)) {
          groups.set(row.itemKey, { itemKey: row.itemKey, itemName: row.itemName, rows: [] })
        }
        groups.get(row.itemKey).rows.push(row)
      })
      return Array.from(groups.values()).sort((a, b) =>
        String(a.itemName).localeCompare(String(b.itemName)),
      )
    },
    shoppingSupplierGroups() {
      const supplierMap = new Map()

      this.restockRows.forEach((row) => {
        const reference = findStockReference(
          row,
          this.ingredients,
          this.components,
          this.menuItems,
        )
        const supplierId =
          reference?.supplierId ||
          reference?.supplier?.id ||
          reference?.supplier ||
          '__unknown_supplier__'
        const supplier = this.suppliers.find((s) => s.id === supplierId)
        // Mode produits finis : un plat fini sans fournisseur n'est pas un
        // « fournisseur non défini » → groupe « Produits finis » (clé partagée
        // avec resolveIngredientSupplier).
        const supplierName = supplier?.name || this.t('srFinishedProductsGroup')

        if (!supplierMap.has(supplierId)) {
          supplierMap.set(supplierId, {
            supplierId,
            supplierName,
            supplierEmail: supplier?.email || supplier?.contactEmail || supplier?.contact?.email || '',
            supplierPhone: supplier?.phone || supplier?.telephone || supplier?.contactPhone || supplier?.contact?.phone || '',
            itemMap: new Map(),
          })
        }

        const group = supplierMap.get(supplierId)
        const item = group.itemMap.get(row.itemKey) || {
          itemKey: row.itemKey,
          itemName: row.itemName,
          unit: row.unit,
          quantity: 0,
          packaging: row.packaging,
          shopNames: [],
          // Identité pour le matching Storage (feuille de course) + diagnostic.
          itemId: row.itemId || null,
          sourceId: row.sourceId || null,
          predicted: 0,
          shopOnHand: 0,
        }
        item.quantity += row.restockQuantity
        // Diagnostic : besoin prédit (avant stock) et restant compté DANS les shops.
        // En mode produits finis, item.quantity est DÉJÀ net du stock shop
        // (Σ restockQuantity) — ces deux champs ne servent qu'à l'affichage.
        item.predicted += Number(row.targetQuantity) || 0
        item.shopOnHand += Number(row.remainingQuantity) || 0
        if (!item.shopNames.includes(row.shopName)) item.shopNames.push(row.shopName)
        item.packaging = this.packagingForItem(row, item.quantity)
        group.itemMap.set(row.itemKey, item)
      })

      const groups = Array.from(supplierMap.values())
        .map((group) => ({
          supplierId: group.supplierId,
          supplierName: group.supplierName,
          supplierEmail: group.supplierEmail,
          supplierPhone: group.supplierPhone,
          items: Array.from(group.itemMap.values()).sort((a, b) =>
            String(a.itemName).localeCompare(String(b.itemName)),
          ),
        }))
        .sort((a, b) => String(a.supplierName).localeCompare(String(b.supplierName)))

      const q = (this.shoppingSearch || '').trim().toLowerCase()
      if (!q) return groups
      return groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            const haystack = [group.supplierName, item.itemName, ...(item.shopNames || [])]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
            return haystack.includes(q)
          }),
        }))
        .filter((group) => group.items.length > 0)
    },
    /**
     * Demande au niveau MENU ITEM (avant explosion), par PDV — entrée du BOM.
     * Même boucle objectiveEvents que stockRowsRaw, mais s'arrête au plat
     * (buildMenuItemDemand) au lieu d'éclater en composants.
     */
    menuItemDemandRows() {
      const byKey = new Map()
      this.objectiveEvents.forEach((event) => {
        const meta = this.objectiveSource === 'sales' ? null : this.predictionMetaByEventId[event.id]
        const records =
          this.objectiveSource === 'sales'
            ? this.referenceSalesRecords
            : this.predictionRecordsByEventId[event.id] || []
        const configuration = this.resolveConfigForRecords(
          event,
          records,
          meta?.configuration,
          meta?.menuConfig,
        )
        if (!configuration) return
        const selectedMenuItems = meta?.menuConfig
          ? meta.menuConfig
          : deriveSelectedMenuItemsByShop(configuration, records)
        const demand = buildMenuItemDemand({
          configuration,
          menuItems: this.menuItems,
          predictedRecords: records,
          selectedMenuItems,
          quantityAdjustments: meta?.quantityAdjustments || undefined,
          closedShopNames: this.closedShopNames,
        })
        demand.forEach((d) => {
          const key = `${d.shopId}|||${d.menuItemId}`
          const prev = byKey.get(key)
          if (prev) prev.quantity += d.quantity
          else byKey.set(key, { ...d })
        })
      })
      return Array.from(byKey.values())
    },
    /** Feuille de course en mode INGRÉDIENTS : explosion BOM groupée par fournisseur. */
    shoppingIngredientGroups() {
      const groups = buildIngredientRequirements({
        demand: this.menuItemDemandRows,
        recipeByMenuItemId: this.recipeByMenuItemId,
        resolveSupplier: (line) => this.resolveIngredientSupplier(line),
      })
      const q = (this.shoppingSearch || '').trim().toLowerCase()
      if (!q) return groups
      return groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => {
            const haystack = [group.supplierName, item.itemName, ...(item.shopNames || [])]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
            return haystack.includes(q)
          }),
        }))
        .filter((group) => group.items.length > 0)
    },
    /**
     * Groupes bruts (avant soustraction du stock) selon le mode.
     * Produits finis = déjà net du stock shop (via restockRows) ; ingrédients =
     * demande théorique brute (aucune soustraction).
     */
    shoppingGroupsRaw() {
      return this.shoppingMode === 'ingredients'
        ? this.shoppingIngredientGroups
        : this.shoppingSupplierGroups
    },
    /**
     * Feuille de course NETTE = besoin − stock. Deux niveaux (Règle métier) :
     *  - stock DANS les shops → réduit le besoin (déjà fait en produits finis ;
     *    agrégé sur tous les shops et soustrait ici en ingrédients) ;
     *  - stock EN STORAGE (réserve centrale) → réduit la quantité à acheter.
     * Le Storage ne touche jamais le restock d'un shop précis. Chaque comptage
     * Storage consommé est marqué ; les non consommés (stock présent mais sans
     * item prédit) remontent dans `unmatchedStorage` (jamais jetés en silence).
     * Retour : { groups (item.quantity = quantité à acheter), unmatchedStorage }.
     */
    nettedShopping() {
      const isIngredients = this.shoppingMode === 'ingredients'
      const rawGroups = this.shoppingGroupsRaw
      const storagePool = preparePool(this.aggregateCountsForElements(this.storageElementIds))
      const shopPool = isIngredients
        ? preparePool(this.aggregateCountsForElements(this.fbShopElementIds))
        : []

      const groups = rawGroups
        .map((group) => ({
          ...group,
          items: group.items
            .map((item) => {
              const gross = Number(item.quantity) || 0
              let restockNeed
              let shopOnHand
              let predicted
              if (isIngredients) {
                // Besoin ingrédient théorique : on déduit le stock ingrédient
                // agrégé sur tous les shops, puis le Storage.
                shopOnHand = consumeFromPool(item, shopPool)
                restockNeed = Math.max(0, gross - shopOnHand)
                predicted = gross
              } else {
                // Produits finis : gross = Σ restockQuantity, DÉJÀ net du stock
                // shop → ne pas re-soustraire. predicted/shopOnHand = diagnostic.
                restockNeed = gross
                shopOnHand = Number(item.shopOnHand) || 0
                predicted = item.predicted != null ? item.predicted : gross
              }
              const storageOnHand = consumeFromPool(item, storagePool)
              const buyQuantity = Math.max(0, restockNeed - storageOnHand)
              return {
                ...item,
                predicted,
                shopOnHand,
                storageOnHand,
                restockNeed,
                buyQuantity,
                // La quantité affichée / exportée = ce qu'il reste à acheter.
                quantity: buyQuantity,
                // Packaging recalculé sur la quantité NETTE (packedCount juste) ;
                // renvoie null pour un item non emballé → comportement inchangé.
                packaging: this.packagingForItem(item, buyQuantity),
              }
            })
            // Un article entièrement couvert par le stock (buy = 0) sort de la
            // liste de courses (mais son comptage Storage reste « consommé »).
            .filter((item) => item.buyQuantity > 0),
        }))
        .filter((group) => group.items.length > 0)

      const unmatchedStorage = storagePool.filter((e) => !e.matched && e.qty > 0)
      return { groups, unmatchedStorage }
    },
    /** Groupes affichés à l'étape 3 (feuille de course nette). */
    shoppingGroups() {
      return this.nettedShopping.groups
    },
    confirmedRestockCount() {
      return this.restockRows.filter((row) => this.isRestocked(row.rowKey)).length
    },
    shoppingItemsCount() {
      return this.shoppingGroups.reduce((sum, g) => sum + (g.items?.length || 0), 0)
    },
    restockCompletionRatio() {
      if (!this.restockRows.length) return 0
      return this.confirmedRestockCount / this.restockRows.length
    },
    /** Snapshot persisté dans la DB locale (entrées + sorties durables). */
    restockPersistSnapshot() {
      return {
        objectiveSource: this.objectiveSource,
        referenceEventId: this.referenceEventId,
        selectedEventIds: this.selectedEventIds,
        stockAdjustments: this.stockAdjustments,
        stockPackedModes: this.stockPackedModes,
        restockedRows: this.restockedRows,
        restockGenerated: this.restockGenerated,
        shoppingGenerated: this.shoppingGenerated,
        restockViewMode: this.restockViewMode,
        currentStep: this.currentStep,
        stockExcluded: this.stockExcluded,
      }
    },
    overviewMetrics() {
      const shops = new Set(this.restockRows.map((row) => row.shopId)).size
      return [
        {
          label: this.t('srMetricEvents'),
          value: this.selectedEvents.length,
          icon: 'mdi-calendar-star',
          color: 'primary',
        },
        {
          label: this.t('srMetricStockItems'),
          value: this.stockSettingsRows.length,
          icon: 'mdi-package-variant-closed',
          color: 'grey',
        },
        {
          label: this.t('srMetricShopsToDeliver'),
          value: shops,
          icon: 'mdi-store',
          color: 'grey',
        },
        {
          label: this.t('srMetricConfirmed'),
          value: `${this.confirmedRestockCount}/${this.restockRows.length}`,
          icon: 'mdi-checkbox-marked-circle-outline',
          color: 'success',
        },
      ]
    },
  },
  watch: {
    selectedEventIds: {
      deep: true,
      handler() {
        this.refreshSelectedPredictions()
        this.resetGeneratedOutputs()
        this.loadPreviousInventory()
      },
    },
    stockSettingsSignature() {
      this.ensureStockItemDefaults()
    },
    restockEventOptions(options) {
      // L'event filtré a quitté la sélection (ou n'a plus de lignes) → retour à « tous ».
      if (this.restockEventFilter && !options.some((o) => o.id === this.restockEventFilter)) {
        this.restockEventFilter = null
      }
    },
    objectiveSource() {
      this.resetGeneratedOutputs()
      this.loadReferenceSales()
    },
    referenceEventId() {
      this.loadReferenceSales()
    },
    // Persistance DB locale : tout changement d'état réarmement est sauvegardé.
    restockPersistSnapshot: {
      deep: true,
      handler(snapshot) {
        this.persistRestockState(snapshot)
      },
    },
    // Avertit le compteur UNE fois que le catalogue produits est incomplet pour
    // cet espace : les quantités prévues s'affichent (fallback feuille) mais
    // recettes / packaging / liste de courses sont dégradés. immediate pour
    // couvrir le cas déjà-dégradé au montage.
    forecastCatalogDegraded: {
      immediate: true,
      handler(isDegraded) {
        if (isDegraded && !this._warnedCatalogDegraded) {
          this._warnedCatalogDegraded = true
          this.showSnackbar(this.t('srSnackCatalogDegraded'), 'warning')
        }
      },
    },
  },
  async mounted() {
    // Active le Teleport une fois la cible du v-app-bar parent présente dans le DOM.
    this.$nextTick(() => { this.headerReady = true })
    await this.loadAll()
    // Assistant : le panneau de l'étape active doit s'afficher déplié. L'URL
    // (?step=) prime sur l'étape restaurée (deep-link / refresh / partage).
    const urlStep = SLUG_STEPS[this.route.query?.step]
    this.goToStep(urlStep || this.currentStep)
    // Flux Inventaire → Sauvegarder : on arrive avec ?action=shopping pour
    // générer directement la feuille de course (par fournisseur / ingrédient).
    if (this.route.query?.action === 'shopping') {
      await this.autoGenerateShopping()
    }
  },
  beforeUnmount() {
    // Annule un PUT /restock-state en attente → pas d'appel sur composant démonté.
    clearTimeout(this._restockPutTimer)
  },
  methods: {
    async loadAll() {
      this.loading = true
      try {
        const spaceId = this.route.params?.spaceId
        // Force loadSpace si l'espace diffère OU si le catalogue menuItems est
        // vide (buildStockRequirements en a besoin pour les recettes ; sinon 0 ligne).
        if (spaceId && (
          !this.currentSpace ||
          String(this.currentSpace.id) !== String(spaceId) ||
          !this.menuItems.length
        )) {
          await this.store.dispatch('analyse/loadSpace', spaceId)
        }
        this.store.dispatch('inventory/loadMarketPrices')
        this.store.dispatch('inventory/loadPackagingTypes')

        // #7 — si on arrive depuis l'inventaire/predict avec ?event=<id> et que
        // c'est un event passé, on le prend comme référence d'objectif.
        const queryEventId = this.route?.query?.event || null
        // Date prévue de l'évènement passée depuis EventPredict (?date=ISO).
        const queryDate = this.route?.query?.date || null
        if (queryDate) this.plannedEventDate = queryDate
        // Un évènement AVEC prédiction EventPredict sauvegardée est exploitable
        // en mode Prévision QUELLE QUE SOIT sa date (passé/futur). On essaie les
        // deux clés space (URL slug vs id interne).
        const eventHasPrediction = (id) => !!id && (
          localDb.getEventPredictVersions(id).length > 0 ||
          this.hasSavedPrediction(id)
        )
        // Fallback sans ?event= : dernier event prédit mémorisé (cookie local).
        let cookieEvent = null
        if (!queryEventId) {
          const last = localDb.getLastPredictedEvent(this.route?.params?.spaceId)
          if (eventHasPrediction(last?.eventId)) cookieEvent = last
        }
        const queryHasPrediction = eventHasPrediction(queryEventId)
        const queryEventIsPast = !!queryEventId &&
          this.pastEvents.some((e) => String(e.id) === String(queryEventId))
        const queryEventIsFuture = !!queryEventId &&
          this.futureEvents.some((e) => String(e.id) === String(queryEventId))
        // Nav explicite (prédiction / futur / cookie) prime sur l'état persisté.
        const hasNavEvent = queryHasPrediction || queryEventIsFuture || !!cookieEvent

        // Référence ventes : event passé SANS prédiction uniquement.
        if (queryEventIsPast && !queryHasPrediction) {
          this.referenceEventId = queryEventId
        }
        if (!this.referenceEventId && this.pastEvents.length) {
          this.referenceEventId = this.pastEvents[this.pastEvents.length - 1].id
        }
        // Sélection Prévision : ?event avec prédiction (toute date) ou futur, sinon cookie.
        if ((queryHasPrediction || queryEventIsFuture) && !this.selectedEventIds.includes(queryEventId)) {
          this.selectedEventIds = [queryEventId]
          this.objectiveSource = 'forecast'
          this.ensureDefaultScenario(queryEventId)
        } else if (cookieEvent && !this.selectedEventIds.includes(cookieEvent.eventId)) {
          this.selectedEventIds = [cookieEvent.eventId]
          this.objectiveSource = 'forecast'
          this.ensureDefaultScenario(cookieEvent.eventId)
          if (!this.plannedEventDate && cookieEvent.date) this.plannedEventDate = cookieEvent.date
        }
        // Défaut si rien : 1er event prédit, sinon 1er event futur.
        if (!this.selectedEventIds.length) {
          if (this.predictedEvents.length) {
            this.selectedEventIds = [this.predictedEvents[0].id]
            this.objectiveSource = 'forecast'
            this.ensureDefaultScenario(this.predictedEvents[0].id)
          } else if (this.futureEvents.length) {
            this.selectedEventIds = [this.futureEvents[0].id]
          }
        }
        // Date prévue par défaut = date de l'event sélectionné si pas de ?date=.
        if (!this.plannedEventDate && this.selectedEventIds.length) {
          const ev = this.events.find((e) => String(e.id) === String(this.selectedEventIds[0]))
          if (ev) this.plannedEventDate = ev.eventDate || ev.date || null
        }
        // Le catalogue menuItems arrive en PHASE 2 (enrichissement async de
        // loadSpace), APRÈS l'await. Sans lui, buildStockRequirements ne trouve
        // aucune recette → 0 ligne. On attend qu'il soit prêt (max ~6s).
        await this.waitForMenuItems()
        // Rapatrie les versions BDD des events sélectionnés AVANT le calcul des
        // prédictions → le réarmement reproduit la version active même sans pont.
        await this.syncBddVersions(this.selectedEventIds)
        this.refreshSelectedPredictions()
        // Assignation menu par shop (NestJS) → split « non rattachés » en step 2.
        this.loadRestockShopAssignment()
        await this.loadPreviousInventory()
        this.ensureStockItemDefaults()
        // DB locale : restaure l'état réarmement persisté (sélection, ajustements,
        // lignes confirmées, tableaux générés) — survit au reload sans backend.
        // Une nav explicite (?event=) prime : on ne réécrit pas objectif/sélection.
        await this.restoreRestockState({ keepNavSelection: hasNavEvent })
      } catch (err) {
        this.showSnackbar(err?.message || this.t('srSnackLoadError'), 'error')
      } finally {
        this.loading = false
      }
    },
    /**
     * Attend que le catalogue menuItems (enrichissement phase 2 de loadSpace)
     * soit chargé. buildStockRequirements en dépend pour les recettes.
     */
    async waitForMenuItems(timeoutMs = 6000) {
      if (this.menuItems.length) return
      const start = Date.now()
      while (!this.menuItems.length && Date.now() - start < timeoutMs) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
    },
    /**
     * Restaure l'état réarmement depuis la DB locale (localStorage).
     * @param {{keepNavSelection?: boolean}} [opts] keepNavSelection : arrivée
     *   via ?event= explicite → on NE réécrit PAS objectif/sélection/référence
     *   (sinon l'état persité écrase la nav et la page devient inactionnable).
     */
    async restoreRestockState(opts = {}) {
      const spaceId = this.route.params?.spaceId
      let saved = null
      // 1) Source autoritaire : API (sauf démo / API déjà tombée cette session).
      if (spaceId && !isDemoMode() && !isRestockApiDown()) {
        try {
          saved = await getRestockState(spaceId) // null si aucun état en BDD
        } catch (err) {
          onRestockApiError(err)
        }
      }
      // 2) Fallback localStorage (API null / down / démo).
      if (!saved) saved = localDb.getRestockState(spaceId)
      if (!saved) return
      // Miroir localStorage (cas où l'état vient de l'API).
      localDb.setRestockState(spaceId, saved)
      this.restoringState = true
      // 1) Entrées (priment sur les défauts auto résolus ci-dessus), SAUF si
      //    une navigation explicite ?event= a déjà fixé objectif + sélection.
      if (!opts.keepNavSelection) {
        if (saved.objectiveSource) this.objectiveSource = saved.objectiveSource
        if (saved.referenceEventId != null) this.referenceEventId = saved.referenceEventId
        if (Array.isArray(saved.selectedEventIds)) this.selectedEventIds = saved.selectedEventIds
      }
      if (saved.stockAdjustments) this.stockAdjustments = { ...saved.stockAdjustments }
      if (saved.stockPackedModes) this.stockPackedModes = { ...saved.stockPackedModes }
      if (saved.stockExcluded) this.stockExcluded = { ...saved.stockExcluded }
      if (saved.restockViewMode) this.restockViewMode = saved.restockViewMode
      // 2) Sorties : après le flush des watchers (selectedEventIds → reset),
      // on restaure lignes confirmées + état généré, puis on lève le guard.
      this.$nextTick(() => {
        if (saved.restockedRows) this.restockedRows = { ...saved.restockedRows }
        if (typeof saved.restockGenerated === 'boolean') this.restockGenerated = saved.restockGenerated
        if (typeof saved.shoppingGenerated === 'boolean') this.shoppingGenerated = saved.shoppingGenerated
        // Assistant : l'étape sauvegardée n'est PLUS restaurée (demande user
        // 2026-07-06) — toujours démarrer à l'étape 1 (Stock). Seul un
        // deep-link explicite ?step= (géré au mounted) ouvre plus loin.
        // `saved.currentStep` reste persisté pour compat, mais ignoré ici.
        this.$nextTick(() => { this.restoringState = false })
      })
    },
    /**
     * Persiste l'état réarmement : localStorage immédiat (0 perte) + PUT API
     * débouncé 500 ms. localStorage reste le fallback offline ; l'API est la
     * source autoritaire au prochain chargement.
     */
    persistRestockState(snapshot) {
      if (this.restoringState) return
      const spaceId = this.route.params?.spaceId
      // 1) localStorage immédiat : aucun état perdu si l'onglet se ferme avant 500 ms.
      localDb.setRestockState(spaceId, snapshot)
      // 2) PUT API débouncé (sauf démo / API down).
      if (!spaceId || isDemoMode() || isRestockApiDown()) return
      clearTimeout(this._restockPutTimer)
      this._restockPutTimer = setTimeout(() => {
        putRestockState(spaceId, snapshot).catch((err) => {
          onRestockApiError(err)
          // BUG-019 : un 4xx (typiquement 403 permissions — rôles « Technicien
          // Logistic » / « PDV Superviseur », cf. fiche backend BUG-31) était
          // avalé en silence : l'état SEMBLE sauvegardé (localStorage) mais ne
          // traverse jamais vers l'API → perte de travail au changement de
          // machine. On alerte UNE fois par session (le PUT part à chaque
          // frappe débouncée — pas de spam).
          const status = err?.response?.status
          if (status === 401 || status === 403) {
            if (!this._restockPermissionAlerted) {
              this._restockPermissionAlerted = true
              this.snackbarText = this.t('srSnackSaveForbidden')
              this.snackbarColor = 'error'
              this.snackbar = true
            }
          }
        })
      }, 500)
    },
    goBack() {
      const spaceId = this.route.params?.spaceId
      if (window.history.length > 1) this.router.back()
      else if (spaceId) this.router.push({ name: 'space-analyse', params: { spaceId } })
      else this.router.push('/spaces')
    },
    onToolboxSelect(value) {
      const tool = TOOLBOX_ITEMS.find((item) => item.value === value)
      if (tool) this.navigateToTool(tool)
    },
    navigateToTool(tool) {
      if (tool.value === 'restock') return
      const spaceId = this.route.params.spaceId
      if (tool.value === 'analyse') {
        this.router.push({ name: 'space-analyse', params: { spaceId } })
      } else if (tool.value === 'space-inventory') {
        // Propage l'event courant : Space Inventory dérive TOUTE sa config (périmètre
        // PdV + clé de comptage) de ?event= via resolveEventContext. Sans lui, l'écran
        // retombe en empty-state « Ouvrir depuis Event Predict ». Miroir du sens inverse
        // (inventory → restock passe déjà ?event=).
        const ev = this.selectedEventId || null
        this.router.push({
          name: 'space-inventory',
          params: { spaceId },
          query: ev ? { event: ev } : {},
        })
      } else if (tool.value === 'space-pre-inventory') {
        const ev = this.selectedEventId || null
        this.router.push({
          name: 'space-pre-inventory',
          params: { spaceId },
          query: ev ? { event: ev } : {},
        })
      } else if (tool.value === 'logistic') {
        const ev = this.selectedEventId || null
        this.router.push({
          name: 'space-logistic',
          params: { spaceId },
          query: ev ? { event: ev } : {},
        })
      } else if (tool.value === 'live') {
        // Live = route DÉDIÉE `space-live` (pas un mode `?toolbox=`, cf.
        // router/index.js) : sans cette branche le `else` ci-dessous envoyait
        // sur Analyse avec un toolbox inconnu.
        this.router.push({ name: 'space-live', params: { spaceId } })
      } else {
        this.router.push({
          name: 'space-analyse',
          params: { spaceId },
          query: { toolbox: tool.value },
        })
      }
    },
    /**
     * Candidats spaceId pour lire les records persistés : EventPredict a pu
     * écrire la clé avec l'id URL (route param) OU l'id interne du space. On
     * essaie les deux (l'URL slug peut différer de currentSpace.id).
     */
    spaceIdCandidates() {
      return [this.route?.params?.spaceId, this.currentSpace?.id].filter(Boolean)
    },
    /** Lit les records persistés en essayant les deux spaceId. */
    readSavedRecords(eventId, versionId) {
      for (const sid of this.spaceIdCandidates()) {
        const v = localDb.getPredictedRecords(sid, eventId, versionId)
        if (v?.records?.length) return v
      }
      return null
    },
    /** Meilleurs records persistés toutes versions (fallback si `current` vide). */
    readAnySavedRecords(eventId) {
      for (const sid of this.spaceIdCandidates()) {
        const v = localDb.getAnyPredictedRecords(sid, eventId)
        if (v?.records?.length) return v
      }
      return null
    },
    /** Vrai si l'évènement a des records de prédiction persistés (toute clé space). */
    hasSavedPrediction(eventId) {
      return this.spaceIdCandidates().some(
        (sid) =>
          !!localDb.getPredictedRecords(sid, eventId, 'current') ||
          !!localDb.getAnyPredictedRecords(sid, eventId),
      )
    },
    /** Versions d'un event : BDD rapatriée (réactif) > miroir localStorage. */
    versionsForEvent(eventId) {
      const bdd = this.bddVersionsByEventId[eventId]
      if (Array.isArray(bdd) && bdd.length) return bdd
      return localDb.getEventPredictVersions(eventId)
    },
    /**
     * Nombre d'unités prédites global d'un scénario (version) = somme des
     * quantités de ses `predictedRecords` (shop×item). 0 si le backend n'a pas
     * (encore) échoé predictedRecords → le picker masque alors le compteur.
     */
    scenarioTotalUnits(version) {
      const recs = Array.isArray(version?.predictedRecords) ? version.predictedRecords : []
      let sum = 0
      recs.forEach((r) => {
        sum += Number(r.totalQuantity ?? r.adjustedQuantity ?? r.quantity ?? r.qty) || 0
      })
      return Math.round(sum)
    },
    /** Id de la version par défaut : BDD (isDefault) > localStorage. */
    defaultVersionIdForEvent(eventId) {
      const bdd = this.bddVersionsByEventId[eventId]
      if (Array.isArray(bdd) && bdd.length) {
        const def = bdd.find((v) => v.isDefault)
        if (def) return def.id
      }
      return localDb.getEventPredictDefaultVersionId(eventId)
    },
    /** Version active d'un event : scénario choisi > défaut > 1re version. */
    activeVersionForEvent(eventId) {
      const list = this.versionsForEvent(eventId)
      if (!list.length) return null
      const selId = this.selectedScenarioByEventId[eventId]
      const defId = this.defaultVersionIdForEvent(eventId)
      return list.find((v) => v.id === selId) || list.find((v) => v.id === defId) || list[0]
    },
    /** Mappe une ligne API EventPredictVersion → objet version front (light). */
    mapBddVersion(d, localById) {
      if (!d) return null
      return {
        id: d.id,
        name: d.name,
        menuConfig: d.menuConfig || {},
        quantityAdjustments: d.quantityAdjustments || {},
        // manualQuantities non stocké en BDD → préservé depuis le miroir local par id.
        manualQuantities: (localById.get(d.id) || {}).manualQuantities || {},
        selectedPredictionEventIds: d.selectedPredictionEventIds || [],
        // Quantités prédites par item (shop+menuItemId) persistées en BDD par
        // EventPredict. Source cross-device : lue par refreshSelectedPredictions
        // avant toute reconstruction. `[]` tant que le backend ne l'expose pas.
        predictedRecords: Array.isArray(d.predictedRecords) ? d.predictedRecords : [],
        totalRevenue: d.totalRevenue || 0,
        adjustedTotalRevenue: d.adjustedTotalRevenue || 0,
        isDefault: !!d.isDefault,
      }
    },
    /**
     * Rapatrie les versions depuis la BDD (best-effort) pour les events donnés et
     * met à jour `bddVersionsByEventId` (réactif) + le miroir localStorage. Ne
     * jette jamais : sur échec API on garde le localStorage existant.
     */
    async syncBddVersions(eventIds) {
      const ids = [...new Set((eventIds || []).filter(Boolean))]
      if (!ids.length) return
      const map = { ...this.bddVersionsByEventId }
      await Promise.all(ids.map(async (id) => {
        try {
          const rows = await listEventPredictVersions(id)
          if (!Array.isArray(rows) || !rows.length) return
          const localById = new Map(localDb.getEventPredictVersions(id).map((v) => [v.id, v]))
          const mapped = rows.map((r) => this.mapBddVersion(r, localById)).filter(Boolean)
          if (!mapped.length) return
          map[id] = mapped
          const def = mapped.find((v) => v.isDefault)?.id ?? localDb.getEventPredictDefaultVersionId(id)
          localDb.setEventPredictVersionsMirror(id, mapped, def)
        } catch (_) { /* API down → on garde le miroir localStorage */ }
      }))
      this.bddVersionsByEventId = map
    },
    /**
     * Injecte les quantités MANUELLES d'une version (items prédit=0, absents du
     * recompute) en records bruts. buildStockRequirements applique ensuite les %
     * (aucun pour ces items → 100% → la quantité manuelle passe telle quelle).
     */
    withManualRecords(records, version) {
      const mq = version?.manualQuantities || {}
      const cfg = version?.menuConfig || {}
      if (!Object.keys(mq).length || !Object.keys(cfg).length) return records
      const present = new Set(
        records.map((r) => `${r.shopId || r.shop}|${r.menuItemId || r.mappedMenuItemId}`),
      )
      const out = records.slice()
      for (const shopId of Object.keys(cfg)) {
        for (const menuItemId of (cfg[shopId] || [])) {
          const qty = Number(mq[`${shopId}-${menuItemId}`]) || 0
          if (qty <= 0) continue
          if (present.has(`${shopId}|${menuItemId}`)) continue
          const mi = this.menuItems.find((m) => String(m.id) === String(menuItemId))
          out.push({
            shopId,
            shop: shopId,
            menuItemId,
            itemName: mi?.name || null,
            quantity: qty,
            totalQuantity: qty,
            revenue: 0,
            totalRevenue: 0,
            isPredictive: true,
            isManual: true,
          })
        }
      }
      return out
    },
    /** Une ligne réarmement est-elle rattachée au menu assigné de son shop ? */
    restockRowAssigned(row) {
      const set =
        this.restockAssignmentByName instanceof Map
          ? this.restockAssignmentByName.get(normalizeStr(row.shopName))
          : null
      if (!set) return !this.restockAssignmentActive // shop sans menu → non rattaché si feature active
      const ids = []
      if (Array.isArray(row.sources)) {
        for (const s of row.sources) if (s && s.menuItemId) ids.push(s.menuItemId)
      }
      if (row.menuItemId) ids.push(row.menuItemId)
      if (row.id) ids.push(row.id)
      if (ids.some((id) => set.ids.has(id))) return true
      const best = findBestMatch({ name: row.itemName, basePrice: null }, set.items)
      return !!(best && (best.matchScore || 0) >= 70)
    },
    toggleRestockUnmapped(shopId) {
      this.restockUnmappedOpen = {
        ...this.restockUnmappedOpen,
        [shopId]: !this.restockUnmappedOpen[shopId],
      }
    },
    /** Charge l'assignation menu par shop (NestJS getShopMenus), keyée par nom. */
    async loadRestockShopAssignment() {
      const spaceId = this.currentSpace?.id || this.route?.params?.spaceId
      const ev = (this.objectiveEvents && this.objectiveEvents[0]) || null
      const cfg = ev
        ? this.configurationForEvent(ev)
        : this.configurations.find((c) => c.id !== 'cfg-all') || this.configurations[0] || null
      const cfgId = cfg?.id || null
      if (!spaceId || !cfgId) {
        this.restockAssignmentByName = null
        return
      }
      const cache = this._restockAssignmentCache || (this._restockAssignmentCache = {})
      const closedCache = this._restockClosedCache || (this._restockClosedCache = {})
      if (cache[cfgId]) {
        this.restockAssignmentByName = cache[cfgId]
        this.closedShopNames = closedCache[cfgId] || []
        return
      }
      const rows = ((await this.store.dispatch('spaceShops/fetchForSpace', { spaceId }).catch(() => [])) || []).filter(
        (r) => (r?.configId ?? r?._raw?.configId) === cfgId,
      )
      // Statut ouvert/fermé (même formule autoritaire qu'EventPredict isOpenByShop :
      // ouvert = isOpen===true OU menuItemsCount>0). Les fermés sont exclus du
      // réarmement (« on ne vend pas sur des points fermés »).
      const closed = rows
        .filter((r) => !(r?.isOpen === true || Number(r?.menuItemsCount) > 0))
        .map((r) => r?.name ?? r?.shopName ?? '')
        .filter(Boolean)
      closedCache[cfgId] = closed
      this.closedShopNames = closed
      // eslint-disable-next-line no-console
      console.log(`[RESTOCK] PdV fermés exclus du réarmement (${closed.length}) : [${closed.join(', ')}]`)
      if (!rows.length) {
        this.restockAssignmentByName = null
        return
      }
      try {
        // Assignation par shop via le store `shopMenuItems` (single-flight +
        // cache TTL keyé `shopId::configId`) PARTAGÉ avec EventPredict +
        // Inventory → dédup + cache : évite le burst /space-menu/shop (429).
        // Cap 3 (au lieu de Promise.all non borné) pour la concurrence backend.
        const results = new Array(rows.length)
        await runWithConcurrency(rows, 3, async (r) => {
          const idx = rows.indexOf(r)
          const shopId = String(r?.id ?? r?._id ?? r?.shopId ?? '')
          const name = r?.name ?? r?.shopName ?? ''
          if (!shopId) { results[idx] = { name, items: [] }; return }
          try {
            await this.store.dispatch('shopMenuItems/fetchForShop', { shopId, configId: cfgId })
            const forShop = this.store.getters['shopMenuItems/forShop']
            const items = typeof forShop === 'function' ? forShop(shopId, cfgId) || [] : []
            results[idx] = { name, items }
          } catch (_) {
            results[idx] = { name, items: [] }
          }
        })
        const map = new Map()
        for (const { name, items: rawItems } of results) {
          const items = Array.isArray(rawItems) ? rawItems : []
          const enabled = items.filter((it) => it && it.enabled === true)
          if (!enabled.length) continue
          const key = normalizeStr(name)
          if (!key) continue
          map.set(key, {
            ids: new Set(enabled.map((it) => it.id)),
            items: enabled.map((it) => ({ id: it.id, name: it.name, basePrice: it.basePrice })),
          })
        }
        cache[cfgId] = map
        this.restockAssignmentByName = map
        // eslint-disable-next-line no-console
        console.log(
          `[RESTOCK] assignation NestJS chargée : ${map.size}/${rows.length} shops avec menu`,
        )
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[RESTOCK] chargement assignation échoué:', e?.message)
        this.restockAssignmentByName = null
      }
    },
    refreshSelectedPredictions() {
      const next = {}
      const meta = {}
      const selectedIds = new Set(this.selectedEventIds)
      const pastIds = new Set(this.pastEvents.map((event) => event.id))
      const actualRecords = this.shopGranularData.filter(
        (record) => !record.isPredictive && pastIds.has(record.eventId),
      )

      // Vrai dès qu'un event retombe sur la reconstruction shop-level (sans
      // menuItemId) → quantités par item indisponibles : on prévient l'utilisateur.
      let degraded = false

      // Itère TOUS les events (pas seulement futurs) : un event prédit peut être
      // daté dans le passé mais avoir des records persistés.
      this.events.forEach((event) => {
        if (!selectedIds.has(event.id)) return
        const ver = this.activeVersionForEvent(event.id)
        // 1) PRIORITÉ : records pré-calculés par EventPredict (pont localStorage,
        //    par scénario/version). Marche sans API. Fallback sur 'current'.
        const versionId = this.selectedScenarioByEventId[event.id] || 'current'
        const saved =
          this.readSavedRecords(event.id, versionId) ||
          this.readSavedRecords(event.id, 'current') ||
          this.readAnySavedRecords(event.id)
        if (saved?.records?.length) {
          next[event.id] = saved.records
          meta[event.id] = {
            quantityAdjustments: saved.quantityAdjustments || {},
            menuConfig: saved.menuConfig || null,
            configuration: saved.configuration || null,
          }
          return
        }
        // 2) BDD : la version active rapatriée porte ses quantités par item
        //    (predictedRecords, même agrégat que le pont). Indépendant du
        //    localStorage → marche cross-device / autre session. Préféré à la
        //    reconstruction shop-level (qui n'a pas la granularité item).
        if (Array.isArray(ver?.predictedRecords) && ver.predictedRecords.length) {
          next[event.id] = ver.predictedRecords
          meta[event.id] = {
            quantityAdjustments: ver.quantityAdjustments || {},
            menuConfig: ver.menuConfig || null,
            configuration: null,
          }
          return
        }
        // 3) DERNIER RECOURS : reconstruire depuis la VERSION active. Reproduit le
        //    scénario (mêmes events sources, mêmes %) MAIS depuis shopGranularData
        //    qui est shop-level → souvent sans menuItemId → quantités par item
        //    absentes. D'où l'avertissement `degraded`.
        const existingPredictive = this.shopGranularData.filter(
          (record) => record.eventId === event.id && record.isPredictive,
        )
        const baseRecords = actualRecords.length
          ? actualRecords
          : this.shopGranularData.filter((r) => !r.isPredictive)
        const forced =
          ver?.selectedPredictionEventIds && ver.selectedPredictionEventIds.length
            ? ver.selectedPredictionEventIds
            : undefined
        const generated = generatePredictionsForEvent(event, this.pastEvents, baseRecords, forced)
        let recs = generated.length ? generated : existingPredictive
        // Records BRUTS (les % sont appliqués par buildStockRequirements via meta).
        recs = this.withManualRecords(recs, ver)
        next[event.id] = recs
        // Si aucun record n'a de menuItemId, buildStockRequirements (somme par
        // shop+menuItemId) ne matchera rien → quantités vides : on le signale.
        if (recs.length && !recs.some((r) => r.menuItemId || r.mappedMenuItemId || r.itemId)) {
          degraded = true
        }
        if (ver) {
          meta[event.id] = {
            quantityAdjustments: ver.quantityAdjustments || {},
            menuConfig: ver.menuConfig || null,
            configuration: null,
          }
        }
      })

      this.predictionRecordsByEventId = next
      this.predictionMetaByEventId = meta
      this.ensureStockItemDefaults()

      // Avertit UNE fois par session : on n'a pas pu obtenir les quantités par
      // item (ni pont localStorage, ni predictedRecords BDD) → rouvrir EventPredict.
      if (degraded && !this._warnedPredictionDegraded) {
        this._warnedPredictionDegraded = true
        this.showSnackbar(this.t('srSnackPredictionDegraded'), 'warning')
      }
    },
    /**
     * Scénario par défaut d'un évènement = version active/défaut, sinon la 1re
     * version (sinon le v-chip-group `mandatory` resterait sans sélection).
     */
    ensureDefaultScenario(id) {
      if (!id || this.selectedScenarioByEventId[id]) return
      const def =
        this.defaultVersionIdForEvent(id) ||
        this.versionsForEvent(id)[0]?.id ||
        null
      if (def) this.selectedScenarioByEventId = { ...this.selectedScenarioByEventId, [id]: def }
    },
    /**
     * Sélection MULTIPLE d'évènements prédits : clic = toggle. L'objectif (target)
     * devient la SOMME des besoins de tous les évènements cochés (stockRowsRaw
     * agrège déjà par shop+item sur objectiveEvents). Chaque évènement garde son
     * scénario (version) propre dans selectedScenarioByEventId.
     */
    selectEvent(id) {
      if (!id) { this.selectedEventIds = []; return }
      if (this.selectedEventIds.includes(id)) {
        this.selectedEventIds = this.selectedEventIds.filter((eid) => eid !== id)
        return
      }
      this.selectedEventIds = [...this.selectedEventIds, id]
      this.ensureDefaultScenario(id)
      // Versions BDD de l'event fraîchement coché (best-effort, seuls les events
      // sélectionnés au mount sont déjà synchronisés) → scénario par défaut et
      // prédictions réévalués une fois rapatriées.
      this.syncBddVersions([id]).then(() => {
        this.ensureDefaultScenario(id)
        this.refreshSelectedPredictions()
      })
      // Date prévue = date de l'évènement si pas déjà fournie par ?date=.
      if (!this.plannedEventDate) {
        const ev = this.events.find((e) => String(e.id) === String(id))
        if (ev) this.plannedEventDate = ev.eventDate || ev.date || null
      }
    },
    /** Changement de scénario (version) → relit les records → quantités MAJ. */
    selectScenario(eventId, versionId) {
      this.selectedScenarioByEventId = { ...this.selectedScenarioByEventId, [eventId]: versionId }
      this.resetGeneratedOutputs()
      this.refreshSelectedPredictions()
    },
    async loadReferenceSales() {
      // Règle 3 : agrège les ventes de l'event de référence par menu item + PDV.
      if (this.objectiveSource !== 'sales' || !this.referenceEvent) {
        this.referenceSalesRecords = []
        return
      }
      const spaceId = this.currentSpace?.id || this.route.params?.spaceId
      const ev = this.referenceEvent
      const fromDate = ev.eventDate || ev.date || ev.startDate
      const toDate = ev.eventEndDate || ev.endDate || fromDate
      this.referenceSalesLoading = true
      this.referenceSalesDegraded = false
      this.referenceSalesError = null
      try {
        const [salesRes, mappings] = await Promise.all([
          fetchReferenceSales(spaceId, { fromDate, toDate }),
          getShopElementMappings(spaceId).catch(() => []),
        ])
        this.referenceSalesDegraded = !!salesRes.degraded
        this.referenceSalesError = salesRes.error || null
        this.referenceSalesRecords = aggregateSalesToPredictedRecords(salesRes.rows, {
          mappings,
          menuItems: this.menuItems,
        })
        this.resetGeneratedOutputs()
        this.ensureStockItemDefaults()
        await this.loadPreviousInventory()
      } catch (err) {
        this.referenceSalesError = err?.message || 'sales-error'
        this.referenceSalesRecords = []
      } finally {
        this.referenceSalesLoading = false
      }
    },
    configurationForEvent(event) {
      if (!event) return null
      // Config embarquée sur l'event : acceptée SEULEMENT si son id existe
      // encore dans la liste fraîche (une config hard-delete côté backend reste
      // sérialisée sur l'event → ne pas la ressusciter).
      const embeddedId = event.configuration?.id
      if (embeddedId && this.configurations.some((cfg) => cfg.id === embeddedId)) {
        return event.configuration
      }
      if (event.configurationId) {
        const found = this.configurations.find((cfg) => cfg.id === event.configurationId)
        if (found) return found
      }
      return this.configurations.find((cfg) => cfg.id !== 'cfg-all') || this.configurations[0] || null
    },
    /** Vrai si la config contient au moins un shop référencé par les records. */
    configContainsRecordShops(configuration, records) {
      const elements = collectFbElements(configuration)
      if (!elements.length) return false
      const elementKeys = new Set()
      elements.forEach((el) => {
        [el.id, el.registryId, el.name, el.shopName]
          .filter(Boolean)
          .forEach((k) => elementKeys.add(String(k)))
      })
      return (records || []).some((r) =>
        [r.shopId, r.elementId, r.shop, r.shopName, r.elementName, r.registryId]
          .filter(Boolean)
          .some((k) => elementKeys.has(String(k))),
      )
    },
    /**
     * Résout la config pour buildStockRequirements en garantissant qu'elle
     * CONTIENT les shops des records. Ordre : config persistée par EventPredict →
     * config par défaut de l'event → balayage de TOUTES les configs du store pour
     * trouver celle qui contient les shops (le fallback par défaut peut renvoyer
     * une config homonyme vide).
     */
    resolveConfigForRecords(event, records, metaConfig, menuConfig) {
      // metaConfig = config embarquée dans la version EventPredict. Rejetée si
      // elle porte un id ABSENT de la liste fraîche (= config supprimée
      // sérialisée). Une config valide (id présent) ou sans id / synthétique
      // reste acceptée : elle peut porter le layout `data.elements` que l'API
      // /configurations ne renvoie pas.
      const metaId = metaConfig?.id
      const metaDeleted =
        !!metaId &&
        metaId !== 'synthetic-restock' &&
        !this.configurations.some((cfg) => cfg.id === metaId)
      if (metaConfig && !metaDeleted && this.configContainsRecordShops(metaConfig, records)) return metaConfig
      const def = this.configurationForEvent(event)
      if (def && this.configContainsRecordShops(def, records)) return def
      const match = this.configurations.find((cfg) => this.configContainsRecordShops(cfg, records))
      if (match) return match
      // Dernier recours : aucune config (store/meta) ne contient ces shops — ex.
      // configs renvoyées par l'API SANS `data.elements`. On reconstruit une
      // config synthétique depuis les records + menuConfig. Le packaging au niveau
      // shop est perdu, mais les items + recettes (menuItems) restent corrects.
      const synth = this.buildSyntheticConfig(records, menuConfig)
      // Dernier recours : synthétique si elle a des shops, sinon la config
      // par défaut VALIDÉE (jamais la metaConfig morte).
      return collectFbElements(synth).length ? synth : (def || null)
    },
    /** Config synthétique (shops = ids/noms des records + clés menuConfig). */
    buildSyntheticConfig(records, menuConfig) {
      const byShop = new Map()
      const add = (id, name) => {
        const key = String(id || '')
        if (!key || byShop.has(key)) return
        byShop.set(key, { id: key, name: name || key, type: 'shop', components: [] })
      }
      ;(records || []).forEach((r) => add(r.shopId || r.elementId || r.shop, r.shop || r.shopName || r.elementName))
      Object.keys(menuConfig || {}).forEach((sid) => add(sid, sid))
      return {
        id: 'synthetic-restock',
        name: this.t('srSyntheticConfigName'),
        data: { floors: [{ elements: Array.from(byShop.values()) }] },
      }
    },
    configurationNameForEvent(event) {
      return this.configurationForEvent(event)?.name || ''
    },
    eventLabel(event) {
      return event?.eventName || event?.name || this.t('srEventFallback')
    },
    eventDateLabel(event) {
      return formatDateMedium(event?.eventDate || event?.date)
    },
    resetGeneratedOutputs() {
      this.restockGenerated = false
      this.shoppingGenerated = false
      this.restockedRows = {}
    },
    ensureStockItemDefaults() {
      const adjustments = { ...this.stockAdjustments }
      const packedModes = { ...this.stockPackedModes }
      this.stockSettingsRows.forEach((row) => {
        if (adjustments[row.itemKey] == null) adjustments[row.itemKey] = 100
        if (packedModes[row.itemKey] == null) {
          packedModes[row.itemKey] = !!this.packagingForItem(row, row.totalQuantity)
        }
      })
      this.stockAdjustments = adjustments
      this.stockPackedModes = packedModes
    },
    recipeComponentsForStockItem(item) {
      const normalize = (value) => String(value || '').trim().toLowerCase()
      const ids = new Set([item?.itemId, item?.sourceId].filter(Boolean).map(String))
      const itemName = normalize(item?.itemName)
      const recipe = (this.menuItems || []).find((menuItem) =>
        ids.has(String(menuItem?.id)) ||
        ids.has(String(menuItem?.sourceId)) ||
        normalize(menuItem?.name) === itemName,
      )
      if (!recipe) return []

      const rawParts = [
        ...(Array.isArray(recipe.components) ? recipe.components : []),
        ...(Array.isArray(recipe.ingredients) ? recipe.ingredients : []),
        ...(Array.isArray(recipe.comboItems) ? recipe.comboItems : []),
      ]
      const seen = new Set()
      return rawParts.reduce((parts, component, index) => {
        const name =
          component?.name ||
          component?.itemName ||
          component?.menuItemName ||
          component?.componentName ||
          component?.marketPriceItemName
        if (!name || normalize(name) === itemName) return parts
        const key = String(component?.id || component?.sourceId || `${name}-${index}`)
        if (seen.has(key)) return parts
        seen.add(key)
        parts.push({
          key,
          name,
          quantity: component?.numberOfUnits ?? component?.quantity ?? component?.qty ?? null,
          unit: component?.unit || component?.measurementUnit || '',
        })
        return parts
      }, []).slice(0, 8)
    },
    isStockSelected(itemKey) {
      return !this.stockExcluded[itemKey]
    },
    setStockSelected(itemKey, checked) {
      const next = { ...this.stockExcluded }
      if (checked) delete next[itemKey]
      else next[itemKey] = true
      this.stockExcluded = next
    },
    toggleAllStock(select) {
      if (select) {
        this.stockExcluded = {}
      } else {
        const next = {}
        this.stockSettingsRows.forEach((r) => { next[r.itemKey] = true })
        this.stockExcluded = next
      }
    },
    stockAdjustment(itemKey) {
      return Number(this.stockAdjustments[itemKey] ?? 100)
    },
    setStockAdjustment(itemKey, value) {
      this.stockAdjustments = {
        ...this.stockAdjustments,
        [itemKey]: Number(value) || 0,
      }
      this.resetGeneratedOutputs()
    },
    applyStockAdjustmentToAll(percent) {
      const next = { ...this.stockAdjustments }
      this.stockSettingsRows.forEach((row) => {
        next[row.itemKey] = Number(percent) || 0
      })
      this.stockAdjustments = next
      this.resetGeneratedOutputs()
    },
    resetStockAdjustments() {
      this.applyStockAdjustmentToAll(100)
    },
    isPackedMode(itemKey) {
      return !!this.stockPackedModes[itemKey]
    },
    setPackedMode(itemKey, checked) {
      this.stockPackedModes = {
        ...this.stockPackedModes,
        [itemKey]: !!checked,
      }
      this.resetGeneratedOutputs()
    },
    adjustedQuantity(quantity, unit, itemKey) {
      return roundForUnit((Number(quantity) || 0) * (this.stockAdjustment(itemKey) / 100), unit)
    },
    adjustedItemQuantity(item) {
      return this.adjustedQuantity(item.totalQuantity, item.unit, item.itemKey)
    },
    packagingForItem(item, quantity) {
      return computePackagingForQuantity(
        item,
        quantity,
        this.ingredients,
        this.components,
        this.menuItems,
      )
    },
    remainingQuantityForRow(row, packaging) {
      // Règle 3 : restant = inventoryStore.inventoryCounts (comptage courant) ;
      // fallback snapshot event précédent si le store est vide.
      //
      // IMPORTANT : keyé UNIQUEMENT sur row.shopId (l'élément F&B). Le stock
      // Storage n'est JAMAIS lu ici — il n'est pas physiquement dans ce shop et
      // ne réduit donc jamais le besoin d'un shop précis. Le Storage est déduit
      // au niveau de la feuille de course centrale (cf. nettedShopping).
      const live = this.storeInventoryCounts?.[row.shopId] || {}
      const prev = this.previousInventoryCounts?.[row.shopId] || {}
      const count =
        live[row.itemId] ||
        (row.sourceId ? live[row.sourceId] : null) ||
        prev[row.itemId] ||
        (row.sourceId ? prev[row.sourceId] : null)
      if (!count) return 0

      const direct = count.totalUnits ?? count.quantity ?? count.totalQuantity
      if (direct != null && Number.isFinite(Number(direct))) return Number(direct)

      const reference = findStockReference(row, this.ingredients, this.components, this.menuItems)
      const packSize = Number(
        packaging?.packagingUnitNumber ||
          reference?.inventoryQuantityPackaged ||
          reference?.packagingUnitNumber ||
          1,
      ) || 1
      // Formule partagée (src/utils/shoppingList.js) : packed*qtyPackaged + loose.
      return countedRemaining(count, packSize)
    },
    /**
     * Restant compté pour un itemId brut (comptage Storage/shop agrégé, sans row
     * de stock). Même formule que remainingQuantityForRow mais l'identité se
     * limite à l'itemId (résolu via findStockReference pour le packSize).
     */
    remainingFromCount(count, itemId) {
      if (!count) return 0
      const direct = count.totalUnits ?? count.quantity ?? count.totalQuantity
      if (direct != null && Number.isFinite(Number(direct))) return Number(direct)
      const reference = findStockReference(
        { itemId },
        this.ingredients,
        this.components,
        this.menuItems,
      )
      const packSize =
        Number(
          reference?.inventoryQuantityPackaged || reference?.packagingUnitNumber || 1,
        ) || 1
      return countedRemaining(count, packSize)
    },
    /**
     * Agrège les comptages d'inventaire de plusieurs éléments (Storage ou shops)
     * en une liste d'entrées de stock identifiées, prête pour le matching :
     * `[{ itemId, sourceId, marketPriceId, name, unit, qty }]`. Résout l'identité
     * de chaque item compté via le catalogue (findStockReference).
     */
    aggregateCountsForElements(ids) {
      const map = new Map()
      ;(ids || []).forEach((elId) => {
        const bucket = this.storeInventoryCounts?.[elId] || {}
        Object.entries(bucket).forEach(([itemId, count]) => {
          if (!count) return
          const qty = this.remainingFromCount(count, itemId)
          if (!(qty > 0)) return
          const ref = findStockReference(
            { itemId },
            this.ingredients,
            this.components,
            this.menuItems,
          )
          const key = String(itemId)
          const prev = map.get(key)
          if (prev) {
            prev.qty += qty
            return
          }
          map.set(key, {
            itemId: String(itemId),
            sourceId: ref?.sourceId != null ? String(ref.sourceId) : null,
            marketPriceId: ref?.marketPriceId != null ? String(ref.marketPriceId) : null,
            name: ref?.name || ref?.itemName || '',
            unit: ref?.unit || '',
            qty,
          })
        })
      })
      return Array.from(map.values())
    },
    async loadPreviousInventory() {
      const spaceId = this.route.params?.spaceId
      // Règle 3 : alimente inventoryStore.inventoryCounts (source canonique du
      // restant). Mode Ventes → counts de l'event de référence ; mode Prévision →
      // counts de l'EVENT SÉLECTIONNÉ (celui qu'on vient de compter côté
      // Inventaire — charger l'event précédent écrasait ces comptages et
      // affichait REMAINING=0). Le snapshot event précédent reste disponible en
      // fallback via previousInventoryCounts plus bas.
      const countsEventId =
        this.objectiveSource === 'sales'
          ? this.referenceEventId
          : this.selectedEvents[0]?.id || null
      if (spaceId) {
        try {
          await this.store.dispatch('inventory/loadInventory', { spaceId, eventId: countsEventId || null })
        } catch (_) { /* le store garde son fallback localStorage */ }
      }
      if (!spaceId || (this.objectiveSource !== 'sales' && !this.selectedEvents.length)) {
        this.previousInventoryCounts = {}
        this.previousInventoryEvent = null
        return
      }

      this.previousInventoryLoading = true
      try {
        const previousEvent = this.resolvePreviousEvent()
        let counts = {}
        let sourceEvent = previousEvent
        const useLocalInventoryOnly = !!this.store.state.analyse?.fromMock

        if (previousEvent) {
          if (useLocalInventoryOnly) {
            counts = this.readLocalInventory(spaceId, previousEvent.id)
          } else {
            try {
              counts = extractInventoryCounts(await apiGetInventory(spaceId, previousEvent.id))
            } catch (_) {
              counts = this.readLocalInventory(spaceId, previousEvent.id)
            }
          }
          if (!Object.keys(counts).length) {
            counts = this.readLocalInventory(spaceId, previousEvent.id)
          }
        }

        if (!Object.keys(counts).length && !useLocalInventoryOnly) {
          try {
            const latest = await apiGetLatestInventory(spaceId)
            counts = extractInventoryCounts(latest)
            if (latest?.eventId) {
              sourceEvent = this.events.find((event) => event.id === latest.eventId) || sourceEvent
            }
          } catch (_) {
            counts = {}
          }
        }

        this.previousInventoryCounts = counts
        this.previousInventoryEvent = sourceEvent || null
      } finally {
        this.previousInventoryLoading = false
      }
    },
    readLocalInventory(spaceId, eventId) {
      try {
        const raw = localStorage.getItem(localDb.inventoryCountsKey(spaceId, eventId))
        return raw ? JSON.parse(raw) : {}
      } catch (_) {
        return {}
      }
    },
    resolvePreviousEvent() {
      const selectedDates = this.selectedEvents
        .map((event) => dateOnlyTs(event.eventDate || event.date))
        .filter((ts) => ts != null)
      if (!selectedDates.length) return null
      const earliest = Math.min(...selectedDates)
      return [...this.events]
        .filter((event) => {
          const ts = dateOnlyTs(event.eventDate || event.date)
          return ts != null && ts < earliest
        })
        .sort((a, b) => dateOnlyTs(b.eventDate || b.date) - dateOnlyTs(a.eventDate || a.date))[0] || null
    },
    /**
     * Navigation de l'assistant (wizard). Force le panneau ciblé à être déplié
     * (le pas actif ne doit jamais s'afficher replié) et fixe l'étape courante.
     */
    goToStep(step) {
      if (step < 1 || step > 3) return
      this.currentStep = step
      if (step === 1) this.collapsed.stock = false
      else if (step === 2) this.collapsed.restock = false
      else if (step === 3) this.collapsed.shopping = false
      this.syncStepToUrl(step)
    },
    /** Reflète l'étape courante dans l'URL (?step=stock|restock|shopping). */
    syncStepToUrl(step) {
      const slug = STEP_SLUGS[step]
      if (!slug || this.route.query.step === slug) return
      this.router
        .replace({ query: { ...this.route.query, step: slug } })
        .catch(() => {}) // ignore NavigationDuplicated
    },
    async generateRestockTable() {
      if (!this.canGenerate) return
      await this.loadPreviousInventory()
      this.restockGenerated = true
      this.shoppingGenerated = false
      this.showSnackbar(this.t('srSnackRestockGenerated'), 'success')
      // Avance l'assistant vers l'étape Réarmement (panneau déplié).
      this.goToStep(2)
    },
    async generateShoppingList() {
      if (!this.canGenerate) return
      if (!this.restockGenerated) await this.generateRestockTable()
      this.shoppingGenerated = true
      // Mode ingrédients : hydrate les recettes (détail /menu-items/:id) avant
      // d'afficher l'explosion BOM.
      if (this.shoppingMode === 'ingredients') await this.ensureRecipesLoaded()
      this.showSnackbar(this.t('srSnackShoppingGenerated'), 'success')
      // Avance l'assistant vers l'étape Feuille de course (panneau déplié).
      this.goToStep(3)
    },
    /** Bascule produits finis / ingrédients ; hydrate les recettes au besoin. */
    async setShoppingMode(mode) {
      this.shoppingMode = mode
      if (mode === 'ingredients' && this.shoppingGenerated) await this.ensureRecipesLoaded()
    },
    /**
     * Charge les recettes détaillées manquantes pour les menu items vendus/prédits.
     * La liste /menu-items ne porte pas ingredients/components/packagings : on lit
     * le détail /menu-items/:id (relations nichées) en parallèle, puis on cache.
     */
    async ensureRecipesLoaded() {
      // Le mapping ingrédient → fournisseur passe par : marketPrice.supplierId
      // (market prices) → /suppliers (nom). Garantit les deux chargés.
      try {
        await this.store.dispatch('inventory/loadMarketPrices')
      } catch (e) {
        console.warn('[restock] loadMarketPrices échoué:', e?.message)
      }
      if (!this.bomSuppliers.length) {
        try {
          const res = await getSuppliers()
          this.bomSuppliers = Array.isArray(res) ? res : res?.data || []
        } catch (e) {
          console.warn('[restock] getSuppliers échoué:', e?.message)
        }
      }
      const ids = Array.from(
        new Set(this.menuItemDemandRows.map((d) => d.menuItemId).filter(Boolean)),
      )
      const missing = ids.filter((id) => !this.recipeByMenuItemId[id])
      if (!missing.length) return
      this.recipesLoading = true
      try {
        const results = await Promise.all(
          missing.map((id) =>
            getMenuItemById(id)
              .then((res) => ({ id, detail: res?.data || res }))
              .catch((e) => {
                console.warn('[restock] recette détail échouée:', id, e?.message)
                return { id, detail: null }
              }),
          ),
        )
        const next = { ...this.recipeByMenuItemId }
        results.forEach(({ id, detail }) => {
          next[id] = detail ? normalizeRecipe(detail) : { numberOfPiecesRecipe: 1, lines: [] }
        })
        this.recipeByMenuItemId = next
      } finally {
        this.recipesLoading = false
      }
    },
    /**
     * Résout le fournisseur d'une ligne d'ingrédient BOM par la chaîne réelle :
     *   ingredient → marketPriceId → marketPrice.supplierId → supplier
     * Sources, par ordre : (1) supplier déjà capté à l'hydratation (marketPrice
     * niché), (2) market price du store par marketPriceId, (3) ingrédient du
     * catalogue → son marketPriceId → market price. Le nom/contact vient du
     * marketPrice niché si présent, sinon du catalogue suppliers.
     */
    resolveIngredientSupplier(line) {
      // Plat fini sans recette (Coca, chips, bouteille d'eau…) : pas de matière à
      // commander, pas de fournisseur → groupe dédié « Produits finis » (distinct
      // d'un ingrédient au mapping fournisseur cassé, qui reste « non défini »).
      if (line.itemType === 'MenuItem') {
        return {
          supplierId: '__finished__',
          supplierName: this.t('srFinishedProductsGroup'),
          supplierEmail: '',
          supplierPhone: '',
        }
      }
      let supplierId = line.supplierId
      let supplierName = line.supplierName
      let mp = null

      // marketPriceId : depuis la recette, sinon via l'ingrédient du catalogue.
      let marketPriceId = line.marketPriceId
      if (!marketPriceId) {
        const ing = this.ingredients.find((i) => i.id === line.sourceId || i.id === line.key)
        marketPriceId = ing?.marketPriceId
      }
      if (marketPriceId) {
        mp = this.marketPrices.find((m) => m.id === marketPriceId) || null
      }
      if (!supplierId && mp) supplierId = mp.supplierId || mp.supplier?.id || mp.supplier
      if (!supplierName && mp) supplierName = mp.supplierRel?.name || mp.supplier?.name || mp.supplierName

      supplierId = supplierId || '__unknown_supplier__'
      // Catalogue /suppliers d'abord (complet), puis store analyse en secours.
      const supplier =
        this.bomSuppliers.find((s) => s.id === supplierId) ||
        this.suppliers.find((s) => s.id === supplierId)
      return {
        supplierId,
        supplierName: supplierName || supplier?.name || this.t('srSupplierUndefined'),
        supplierEmail:
          supplier?.email || supplier?.contactEmail || supplier?.contact?.email || mp?.supplier?.email || '',
        supplierPhone:
          supplier?.phone || supplier?.telephone || supplier?.contactPhone || supplier?.contact?.phone || mp?.supplier?.phone || '',
      }
    },
    /**
     * Flux Inventaire → Sauvegarder (?action=shopping). Génère la feuille de
     * course dès que l'objectif + les besoins stock sont prêts (les prédictions
     * sont recalculées par le watcher selectedEventIds, parfois après loadAll),
     * puis défile vers le panneau fournisseurs (boutons Email par fournisseur).
     */
    async autoGenerateShopping() {
      const run = async () => {
        await this.generateShoppingList()
        await this.$nextTick()
        const el = this.$refs.shoppingPanel?.$el || this.$refs.shoppingPanel
        if (el?.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
      if (this.canGenerate) {
        await run()
        return
      }
      // Objectif/prédictions pas encore prêts : on attend canGenerate (max ~4s).
      await new Promise((resolve) => {
        const stop = this.$watch('canGenerate', async (ok) => {
          if (!ok) return
          stop()
          await run()
          resolve()
        })
        setTimeout(() => { stop(); resolve() }, 4000)
      })
    },
    isRestocked(rowKey) {
      return !!this.restockedRows[rowKey]
    },
    setRestocked(rowKey, checked) {
      this.restockedRows = {
        ...this.restockedRows,
        [rowKey]: !!checked,
      }
    },
    markAllVisibleRestocked(checked) {
      const next = { ...this.restockedRows }
      this.filteredRestockRows.forEach((row) => {
        next[row.rowKey] = !!checked
      })
      this.restockedRows = next
    },
    formatLooseQuantity(quantity, unit) {
      const n = roundForUnit(quantity, unit)
      return `${n.toLocaleString('fr-FR')} ${unit || ''}`.trim()
    },
    formatDisplayQuantity(quantity, unit, itemKey) {
      const pseudoItem = this.stockSettingsRows.find((row) => row.itemKey === itemKey) ||
        this.stockRowsRaw.find((row) => row.itemKey === itemKey)
      const packaging = pseudoItem ? this.packagingForItem(pseudoItem, quantity) : null
      if (this.isPackedMode(itemKey) && packaging) {
        return `${packaging.packedCount.toLocaleString('fr-FR')} ${packaging.packagingType} de ${packaging.packagingUnitNumber} ${packaging.packagingUnit}`
      }
      return this.formatLooseQuantity(quantity, unit)
    },
    formatRestockQuantity(row) {
      if (this.isPackedMode(row.itemKey) && row.packaging) {
        return `${row.packaging.packedCount.toLocaleString('fr-FR')} ${row.packaging.packagingType} (${this.formatLooseQuantity(row.restockQuantity, row.unit)})`
      }
      return this.formatLooseQuantity(row.restockQuantity, row.unit)
    },
    formatShoppingQuantity(item) {
      if (this.isPackedMode(item.itemKey) && item.packaging) {
        return `${item.packaging.packedCount.toLocaleString('fr-FR')} ${item.packaging.packagingType} de ${item.packaging.packagingUnitNumber} ${item.packaging.packagingUnit}`
      }
      return this.formatLooseQuantity(item.quantity, item.unit)
    },
    /** Quantité brute pour le diagnostic feuille de course (prévu/shop/storage/…). */
    formatDiagQty(value, unit) {
      return this.formatLooseQuantity(Number(value) || 0, unit)
    },
    // Repli de la liste des PdV par article (liste de courses).
    isShopsExpanded(key) {
      return !!this.shopsExpanded[key]
    },
    toggleShops(key) {
      this.shopsExpanded = { ...this.shopsExpanded, [key]: !this.shopsExpanded[key] }
    },
    sourceSummary(row) {
      if (!row.sources?.length) return row.eventNames.join(', ')
      const names = row.sources.map((source) => source.menuItemName)
      return Array.from(new Set(names)).slice(0, 3).join(', ')
    },
    // Plats (menu items) couverts par cet article de stock, agrégés sur toutes
    // les lignes du groupe « par article » → affiché dans l'en-tête du groupe.
    groupSourceSummary(group) {
      const names = []
      ;(group?.rows || []).forEach((row) => {
        ;(row.sources || []).forEach((s) => { if (s?.menuItemName) names.push(s.menuItemName) })
      })
      return Array.from(new Set(names)).slice(0, 3).join(', ')
    },
    exportRestockCsv() {
      if (!this.restockRows.length) return
      const headers = [
        this.t('srCsvShop'),
        this.t('srCsvItem'),
        this.t('srCsvTarget'),
        this.t('srCsvRemaining'),
        this.t('srCsvToDeposit'),
        this.t('srCsvUnit'),
        this.t('srCsvConfirmed'),
        this.t('srCsvEvents'),
      ]
      const lines = this.restockRows.map((row) => [
        row.shopName,
        row.itemName,
        row.targetQuantity,
        row.remainingQuantity,
        row.restockQuantity,
        row.unit,
        this.isRestocked(row.rowKey) ? this.t('srCsvYes') : this.t('srCsvNo'),
        (row.eventNames || []).join(' | '),
      ])
      this.downloadCsv('restock-table.csv', headers, lines)
    },
    // ── Aperçu fournisseurs (colonne droite) ──────────────────────────────
    supplierUnitsTotal(group) {
      const raw = (group.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0)
      return Math.round(raw)
    },
    supplierShare(group) {
      const max = Math.max(
        1,
        ...this.shoppingGroups.map((g) => this.supplierUnitsTotal(g)),
      )
      return Math.round((this.supplierUnitsTotal(group) / max) * 100)
    },
    scrollToSupplier(supplierId) {
      const el = document.getElementById(`sr-supplier-${supplierId}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    exportShoppingCsv() {
      if (!this.shoppingGroups.length) return
      const headers = [
        this.t('srCsvSupplier'),
        this.t('srCsvItem'),
        this.t('srCsvQuantity'),
        this.t('srCsvUnit'),
        this.t('srColShops'),
      ]
      const lines = []
      this.shoppingGroups.forEach((supplier) => {
        supplier.items.forEach((item) => {
          lines.push([
            supplier.supplierName,
            item.itemName,
            item.quantity,
            item.unit,
            (item.shopNames || []).join(' | '),
          ])
        })
      })
      const slug = this.plannedEventDate ? `-${String(this.plannedEventDate).slice(0, 10)}` : ''
      this.downloadCsv(`shopping-list${slug}.csv`, headers, lines)
    },
    // --- Liste de courses : actions fournisseur (email mailto / appel / impression) ---
    /**
     * Construit un email de commande clair et professionnel.
     * Mise en forme anti-spam : objet précis sans majuscules/points d'exclamation,
     * salutation + contexte + tableau d'articles aligné + demande explicite +
     * signature. Texte brut (limite mailto) mais structuré et lisible.
     * NB : la délivrabilité dépend surtout du compte d'envoi de l'utilisateur
     * (mailto envoie depuis SA messagerie) — ici on soigne le contenu.
     */
    buildSupplierEmail(supplier) {
      // Date prévue de l'évènement si fournie (depuis EventPredict), sinon today.
      const date = this.plannedEventDate
        ? formatDateMedium(this.plannedEventDate)
        : new Date().toLocaleDateString('fr-FR', {
          day: '2-digit', month: 'long', year: 'numeric',
        })
      const subject = `${this.t('srEmailSubjectPrefix')} ${this.spaceLabel} - ${date}`

      const items = supplier.items || []
      // Alignement des quantités en colonne pour une lecture nette.
      const labels = items.map((it) => this.formatShoppingQuantity(it))
      const pad = Math.min(40, Math.max(0, ...items.map((it) => (it.itemName || '').length)))
      const rows = items.map((it, i) => {
        const name = String(it.itemName || '').padEnd(pad, ' ')
        const shops = (it.shopNames || []).length ? `   (${it.shopNames.join(', ')})` : ''
        return `  • ${name}  ${labels[i]}${shops}`
      })

      const body = [
        `${this.t('srEmailGreeting')} ${supplier.supplierName},`,
        '',
        `${this.t('srEmailIntroPrefix')} ${this.spaceLabel}.`,
        '',
        this.t('srEmailItemsHeading'),
        ...rows,
        '',
        this.t('srEmailClosingRequest'),
        '',
        this.t('srEmailSignOff'),
        this.spaceLabel,
      ].join('\n')

      return { subject, body }
    },
    /**
     * Ouvre la messagerie de l'utilisateur (mailto) avec un email pré-rempli.
     * Garde-fou LONGUEUR : un `mailto:` > ~2000 caractères est silencieusement
     * ignoré par le shell OS (Windows/Outlook) — cas des groupes à beaucoup de
     * lignes (ex. « Produits finis »). Au-delà du seuil, on ouvre le mailto SANS
     * body (sujet + destinataire, court → s'ouvre toujours) et on copie le corps
     * complet dans le presse-papier pour un collage manuel.
     */
    async emailSupplier(supplier) {
      const { subject, body } = this.buildSupplierEmail(supplier)
      const to = supplier.supplierEmail || ''
      const base =
        `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}`
      const withBody = `${base}&body=${encodeURIComponent(body)}`

      // 1800 : marge sous la limite ~2000 des handlers mailto.
      let bodyCopied = false
      if (withBody.length > 1800) {
        try {
          await navigator.clipboard.writeText(body)
          bodyCopied = true
        } catch (_) {
          /* presse-papier indisponible (permission/insecure) : on ouvre quand même */
        }
        window.location.href = base
      } else {
        window.location.href = withBody
      }

      // Messages : destinataire manquant prioritaire, puis cas body long
      // (copié → « collez » ; copie ratée → repli Imprimer/Exporter).
      const tooLong = withBody.length > 1800
      if (!to) {
        this.showSnackbar(this.t('srSnackEmailMissing'), 'warning')
      } else if (tooLong && bodyCopied) {
        this.showSnackbar(this.t('srSnackEmailBodyCopied'), 'info')
      } else if (tooLong) {
        this.showSnackbar(this.t('srSnackEmailTooLong'), 'warning')
      }
    },
    /** Ouvre le popup email (colonne Aperçu) : contenu pré-rempli et ÉDITABLE (WYSIWYG). */
    openEmailDialog(group) {
      const { subject, body } = this.buildSupplierEmail(group)
      this.emailDialog = {
        open: true,
        supplierName: group.supplierName || '',
        to: group.supplierEmail || '',
        subject,
        body,
      }
      // Injecte le corps texte dans l'éditeur contenteditable (nl→<br>).
      this.$nextTick(() => {
        const ed = this.$refs.wysiwyg
        if (ed) ed.innerHTML = this.textToHtml(body)
      })
    },
    /** Applique une commande de mise en forme sur la sélection (execCommand). */
    wysiwygCmd(cmd) {
      const ed = this.$refs.wysiwyg
      if (ed) ed.focus()
      document.execCommand(cmd, false, null)
      this.onWysiwygInput()
    },
    /** Synchronise emailDialog.body (texte propre) depuis l'éditeur à chaque saisie. */
    onWysiwygInput() {
      const ed = this.$refs.wysiwyg
      if (ed) this.emailDialog.body = this.htmlToText(ed.innerHTML)
    },
    /** Texte brut → HTML d'affichage (échappe + nl→<br>). */
    textToHtml(text) {
      const esc = String(text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      return esc.replace(/\n/g, '<br>')
    },
    /** HTML de l'éditeur → texte propre pour le mailto (br/div/p→\n, li→« • », strip). */
    htmlToText(html) {
      let s = String(html || '')
      s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n')
      s = s.replace(/<\/(div|p)>/gi, '\n')
      s = s.replace(/<li[^>]*>/gi, '  • ')
      s = s.replace(/<\/li>/gi, '\n')
      s = s.replace(/<\/(ul|ol)>/gi, '\n')
      s = s.replace(/<[^>]+>/g, '') // strip tags restants (gras/italique perdus en texte)
      const tmp = document.createElement('textarea')
      tmp.innerHTML = s
      s = tmp.value
      // Compacte les runs de >2 sauts de ligne.
      return s.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+\n/g, '\n')
    },
    /** Envoie l'email éventuellement modifié via mailto (même garde-fou longueur). */
    async confirmSendEmail() {
      const { to, subject, body } = this.emailDialog
      const base = `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject || '')}`
      const withBody = `${base}&body=${encodeURIComponent(body || '')}`

      let bodyCopied = false
      if (withBody.length > 1800) {
        try {
          await navigator.clipboard.writeText(body || '')
          bodyCopied = true
        } catch (_) {
          /* presse-papier indisponible : on ouvre quand même */
        }
        window.location.href = base
      } else {
        window.location.href = withBody
      }

      const tooLong = withBody.length > 1800
      if (!to) {
        this.showSnackbar(this.t('srSnackEmailMissing'), 'warning')
      } else if (tooLong && bodyCopied) {
        this.showSnackbar(this.t('srSnackEmailBodyCopied'), 'info')
      } else if (tooLong) {
        this.showSnackbar(this.t('srSnackEmailTooLong'), 'warning')
      }
      this.emailDialog.open = false
    },
    callSupplier(supplier) {
      if (!supplier.supplierPhone) {
        this.snackbarText = this.t('srSnackPhoneMissing')
        this.snackbarColor = 'warning'
        this.snackbar = true
        return
      }
      window.location.href = `tel:${String(supplier.supplierPhone).replace(/\s+/g, '')}`
    },
    printShoppingList() {
      if (!this.shoppingGroups.length) return
      const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
      const groupsHtml = this.shoppingGroups.map((g) => {
        const rows = g.items.map((it) =>
          `<tr><td>${esc(it.itemName)}</td><td>${esc(this.formatShoppingQuantity(it))}</td><td>${esc((it.shopNames || []).join(', '))}</td></tr>`,
        ).join('')
        const contact = [g.supplierEmail, g.supplierPhone].filter(Boolean).join(' · ')
        return `<section><h2>${esc(g.supplierName)}${contact ? ` <small>(${esc(contact)})</small>` : ''}</h2>`
          + `<table><thead><tr><th>${esc(this.t('srPrintColArticle'))}</th><th>${esc(this.t('srPrintColQuantityToBuy'))}</th><th>${esc(this.t('srPrintColPos'))}</th></tr></thead>`
          + `<tbody>${rows}</tbody></table></section>`
      }).join('')
      const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(this.t('srPrintListTitle'))} — ${esc(this.spaceLabel)}</title>`
        + '<style>body{font-family:system-ui,Arial,sans-serif;padding:24px;color:#0f172a}h1{font-size:1.3rem;margin:0 0 4px}'
        + '.sub{color:#475569;margin:0 0 18px}section{margin-bottom:18px;page-break-inside:avoid}h2{font-size:1.05rem;margin:0 0 6px}'
        + 'small{font-weight:400;color:#64748b}table{width:100%;border-collapse:collapse;font-size:0.85rem}'
        + 'th,td{border:1px solid #cbd5e1;padding:4px 8px;text-align:left}th{background:#f1f5f9}</style></head><body>'
        + `<h1>${esc(this.t('srPrintListTitle'))}</h1><p class="sub">${esc(this.spaceLabel)}`
        + `${this.referenceEvent ? ` · ${esc(this.eventLabel(this.referenceEvent))}` : ''}`
        + `${this.plannedEventDate ? ` · ${esc(formatDateMedium(this.plannedEventDate))}` : ''}</p>`
        + `${groupsHtml}</body></html>`
      const w = window.open('', '_blank')
      if (!w) {
        this.snackbarText = this.t('srSnackPrintBlocked')
        this.snackbarColor = 'warning'
        this.snackbar = true
        return
      }
      w.document.write(doc)
      w.document.close()
      w.focus()
      w.print()
    },
    downloadCsv(filename, headers, rows) {
      const allRows = [headers, ...rows]
      const csv = allRows
        .map((cols) => cols.map((col) => `"${String(col ?? '').replace(/"/g, '""')}"`).join(';'))
        .join('\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      this.showSnackbar(`${this.t('srExportGeneratedPrefix')} ${filename} ${this.t('srExportGeneratedSuffix')}`, 'success')
    },
    showSnackbar(text, color = 'success') {
      this.snackbarText = text
      this.snackbarColor = color
      this.snackbar = true
    },
  },
}
</script>

<style scoped>
/* En-tête Dashboard téléporté (nom d'espace + switcher + home), design AnalyseView. */
.sr-dash-header {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 4px;
  min-width: 0;
}
.sr-dash-home :deep(svg) {
  color: rgba(var(--v-theme-on-surface), 0.7);
}
.sr-dash-home:hover :deep(svg) {
  color: #ff3131;
}

/* Réconciliation « non rattachés » (vendus hors menu assigné) — step 2. */
.sr-unmapped-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0.5rem 0 0.25rem;
  padding: 0.375rem 0.5rem;
  border-top: 1px dashed var(--border, #e5e7eb);
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--destructive, #ff3131);
  cursor: pointer;
  user-select: none;
}
.sr-unmapped-header:hover {
  background: color-mix(in srgb, var(--destructive, #ff3131) 6%, transparent);
}
.sr-table-unmapped {
  border-left: 3px solid var(--destructive, #ff3131);
}
.sr-unmapped-badge {
  display: inline-block;
  margin-left: 0.375rem;
  padding: 0 0.375rem;
  border-radius: 999px;
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 1.1rem;
  color: var(--destructive, #ff3131);
  background: color-mix(in srgb, var(--destructive, #ff3131) 12%, transparent);
}
.space-restock-view {
  max-width: 1520px;
  margin: 0 auto;
  padding: 24px;
  color: #0f172a;
}

.sr-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

/* Bandeau rouge épinglé au scroll (parité .ede-summary EventPredict).
   Classe posée sur <header class="sr-header sticky-header"> — était vide jusqu'ici. */
.sticky-header {
  position: sticky;
  top: 0;
  z-index: 20;
}

.sr-back {
  width: 36px;
  height: 36px;
  border-radius: 8px;
}

.sr-header-text {
  flex: 1 1 260px;
  min-width: 0;
}

.sr-title {
  margin: 0;
  font-size: 1.4rem;
  line-height: 1.2;
  font-weight: 800;
}

.sr-generate-hint {
  display: flex;
  align-items: center;
  margin: 8px 0 0;
  width: 100%;
  font-size: 0.8rem;
  color: #b45309;
}
.sr-sidebar-generate {
  margin-top: 12px;
}
.sr-sidebar-generate-hint {
  display: flex;
  align-items: flex-start;
  margin: 8px 0 0;
  font-size: 0.75rem;
  line-height: 1.35;
  color: #b45309;
}

.sr-subtitle {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 0.85rem;
}

.sr-actions,
.sr-toolbox-nav,
.sr-panel-head-actions,
.sr-segmented,
.sr-slider-wrap {
  display: flex;
  align-items: center;
}

.sr-actions {
  gap: 10px;
  flex-wrap: wrap;
}

.sr-mobile-config-btn {
  display: none;
}

.sr-toolbox-nav {
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.sr-toolnav-btn {
  appearance: none;
  border: 1px solid #e2e8f0;
  background: #fff;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 650;
  color: #475569;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
}

.sr-toolnav-btn:hover {
  background: #f8fafc;
}

.sr-toolnav-btn-active {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
  pointer-events: none;
}

.sr-overview {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 16px;
}

.sr-metric {
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 8px;
  padding: 16px 18px;
  background: #fff;
}

.sr-metric-value {
  font-size: 1.1rem;
  font-weight: 800;
  line-height: 1.1;
}

.sr-metric-label {
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 650;
}

.sr-loading,
.sr-empty {
  text-align: center;
  color: #64748b;
  padding: 32px 16px;
}

.sr-loading {
  display: grid;
  place-items: center;
  gap: 12px;
  min-height: 300px;
}

.sr-body {
  display: grid;
  grid-template-columns: 292px minmax(0, 1fr) 340px;
  gap: 18px;
  align-items: start;
}

.sr-sidebar {
  /* Colonne à scroll propre (cf. .sr-body > *) — plus de sticky. */
  min-width: 0;
}

.sr-toolbox-select {
  /* Espacement géré par le gap de .wsl-side (parité EventPredict). */
  margin-bottom: 0;
}

/* Assistant pas-à-pas (wizard) : indicateur d'étapes + pieds de navigation. */
.sr-wizard {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 4px 18px;
  margin-bottom: 4px;
}

.sr-wizard-step {
  appearance: none;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  cursor: default;
  color: var(--sr-faint, #9e9e9e);
  flex-shrink: 0;
}

.sr-wizard-step-done {
  cursor: pointer;
  color: var(--sr-text, #212121);
}

.sr-wizard-circle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2px solid var(--sr-border, #e0e0e0);
  font-weight: 700;
  font-size: 0.85rem;
  background: var(--sr-surface, #fff);
  transition: all 0.2s;
}

.sr-wizard-step-active .sr-wizard-circle,
.sr-wizard-step-done .sr-wizard-circle {
  background: var(--sr-primary, #ff3131);
  border-color: var(--sr-primary, #ff3131);
  color: #fff;
}

.sr-wizard-step-active .sr-wizard-circle {
  box-shadow: 0 2px 8px rgba(255, 49, 49, 0.35);
}

.sr-wizard-label {
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}

.sr-wizard-step-active .sr-wizard-label {
  color: var(--sr-primary, #ff3131);
}

.sr-wizard-line {
  flex: 1;
  min-width: 24px;
  height: 3px;
  border-radius: 2px;
  background: var(--sr-border, #e8e8e8);
  transition: background 0.2s;
}

.sr-wizard-line-done {
  background: var(--sr-primary, #ff3131);
}

.sr-wizard-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 18px;
  border-top: 1px solid var(--sr-border, #e2e8f0);
  background: var(--sr-subtle, #f8fafc);
}

.sr-wizard-nav-end {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sr-wizard-nav-hint {
  display: flex;
  align-items: center;
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.3;
  color: #b45309;
}

@media (max-width: 720px) {
  .sr-wizard-label {
    display: none;
  }
  .sr-wizard-nav {
    flex-wrap: wrap;
  }
  .sr-wizard-nav-end {
    flex-wrap: wrap;
  }
}

.sr-panel {
  /* Carte blanche = look EventPredict (radius 18, border #d9e2ec, ombre douce). */
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 18px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  overflow: hidden;
  margin-bottom: 16px;
}

.sr-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding: 16px 18px;
  border-bottom: 1px solid #e2e8f0;
  /* En-tête plat (parité panneau de droite) : plus de pavé gris ; titre h2 déjà kicker. */
  background: transparent;
}

/* En-tête repliable : titre + chevron cliquables. */
.sr-panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  border-radius: 6px;
  outline: none;
}
.sr-panel-title:focus-visible {
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.4);
}
.sr-collapse-icon {
  color: #64748b;
  transition: transform 0.15s ease;
  flex-shrink: 0;
}
.sr-badges {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-left: 4px;
}

/* Titre de section (panneau) = kicker EventPredict (.ep-metrics-kicker). */
.sr-panel-head h2 {
  margin: 0;
  font-size: 0.6875rem;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  line-height: 1.25;
}
/* Sous-titres de groupe / fournisseur : restent des intitulés lisibles. */
.sr-group-head h3,
.sr-supplier-head h3 {
  margin: 0;
  font-size: 0.98rem;
  line-height: 1.25;
  font-weight: 800;
}

.sr-panel-head p {
  margin: 3px 0 0;
  color: #64748b;
  font-size: 0.78rem;
}

.sr-panel-head-actions {
  justify-content: space-between;
  flex-wrap: wrap;
}

.sr-head-controls {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.sr-inline-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.sr-inline-btn {
  appearance: none;
  border: 1px solid #cbd5e1;
  background: #fff;
  color: #334155;
  border-radius: 7px;
  padding: 4px 9px;
  font-size: 0.74rem;
  font-weight: 700;
  cursor: pointer;
}

.sr-inline-btn:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
}

.sr-inline-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sr-search {
  width: 260px;
  max-width: 100%;
}
/* Search box alignée Components Library : champ arrondi, fond clair, focus rouge. */
.sr-search :deep(.v-field) {
  border-radius: 10px;
  background: #f9fafb;
  transition: border-color 0.2s ease;
}
.sr-search :deep(.v-field:hover),
.sr-search :deep(.v-field--focused) {
  border-color: var(--sr-primary);
}

.sr-date-picker {
  width: 100%;
  border-bottom: 1px solid #e2e8f0;
}

.sr-objective-source {
  padding: 10px 12px 0;
}

.sr-objective-toggle {
  display: flex;
  gap: 4px;
  background: #f1f5f9;
  border-radius: 8px;
  padding: 3px;
}

.sr-objective-toggle button {
  flex: 1;
  appearance: none;
  border: none;
  background: transparent;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
}

.sr-objective-toggle button.is-active {
  background: #fff;
  color: var(--sr-primary);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

.sr-reference-event {
  margin-top: 8px;
}

.sr-objective-warning {
  margin: 6px 2px 0;
  font-size: 11px;
  line-height: 1.3;
  color: #b45309;
}

.sr-objective-hint {
  margin: 6px 2px 0;
  font-size: 11px;
  line-height: 1.3;
  color: #64748b;
}

.sr-event-quick-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  padding: 10px 12px 0;
}

.sr-event-quick-actions button {
  appearance: none;
  border: 1px solid #e2e8f0;
  border-radius: 7px;
  background: #fff;
  color: #475569;
  padding: 5px 9px;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.sr-event-quick-actions button:hover {
  background: #fff7ed;
  border-color: #fdba74;
  color: #9a3412;
}

.sr-event-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 420px;
  overflow-y: auto;
  padding: 12px;
}

.sr-event-item {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
  color: inherit;
  cursor: pointer;
  text-align: left;
}

.sr-event-item:hover,
.sr-event-item.is-selected {
  border-color: #ff8a50;
  background: #fff7ed;
}

.sr-event-check {
  margin-top: 2px;
}

.sr-event-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sr-event-name {
  font-size: 0.84rem;
  font-weight: 750;
  color: #0f172a;
}

.sr-event-meta {
  font-size: 0.73rem;
  color: #64748b;
}

.sr-step-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--sr-border, #e5e7eb);
  background: var(--sr-surface, #fff);
}

.sr-step-toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sr-step-toolbar-label {
  color: var(--sr-muted, #6b7280);
  font-size: 11px;
  font-weight: 700;
}

.sr-inline-btn-select {
  margin-left: 4px;
  border-color: rgba(255, 49, 49, 0.25);
  color: var(--sr-primary, #ff3131);
}

.sr-compositions {
  margin: 14px 16px 2px;
  padding: 12px;
  border: 1px solid var(--sr-border, #e5e7eb);
  border-radius: 12px;
  background: var(--sr-subtle, #f7f7f8);
}

.sr-compositions-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.sr-compositions-head h3 {
  margin: 0;
  color: var(--sr-text, #212121);
  font-size: 13px;
  font-weight: 750;
}

.sr-compositions-head p {
  margin: 2px 0 0;
  color: var(--sr-muted, #6b7280);
  font-size: 11px;
  line-height: 1.35;
}

.sr-compositions-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 24px;
  height: 24px;
  border-radius: 6px;
  background: var(--sr-surface, #fff);
  color: var(--sr-muted, #6b7280);
  font-size: 11px;
  font-weight: 750;
}

.sr-compositions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 8px;
}

.sr-composition-card {
  padding: 10px;
  border: 1px solid var(--sr-border, #e5e7eb);
  border-radius: 9px;
  background: var(--sr-surface, #fff);
}

.sr-composition-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--sr-text, #212121);
}

.sr-composition-title strong {
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  font-weight: 750;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sr-composition-title span {
  margin-left: auto;
  color: var(--sr-muted, #6b7280);
  font-size: 10px;
  white-space: nowrap;
}

.sr-composition-parts {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.sr-composition-part {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 4px 6px;
  border-radius: 6px;
  background: var(--sr-subtle, #f7f7f8);
  color: var(--sr-text, #212121);
  font-size: 10px;
}

.sr-composition-part b {
  font-weight: 700;
}

.sr-composition-part em {
  color: var(--sr-muted, #6b7280);
  font-style: normal;
  font-variant-numeric: tabular-nums;
}

.sr-composition-part.is-excluded {
  opacity: 0.45;
  text-decoration: line-through;
}

.sr-settings-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.sr-setting-row {
  display: grid;
  grid-template-columns: 26px minmax(160px, 1fr) minmax(190px, 280px) auto;
  gap: 14px;
  align-items: center;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

.sr-setting-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sr-setting-info strong {
  font-size: 0.88rem;
}

.sr-setting-info .sr-setting-shops {
  color: #64748b;
  font-size: 0.74rem;
}

.sr-setting-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
}

.sr-setting-sources {
  overflow: hidden;
  color: var(--sr-muted, #6b7280);
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sr-include-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
}

.sr-qty-block {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.sr-qty-base {
  color: #94a3b8;
  font-size: 0.74rem;
}

.sr-qty-arrow {
  color: #cbd5e1;
}

.sr-qty-target {
  color: #ea580c;
  font-weight: 750;
  font-size: 0.82rem;
}

.sr-slider-label {
  font-size: 0.62rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #94a3b8;
}

.sr-slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sr-slider-wrap {
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}

.sr-slider {
  width: 100%;
  accent-color: #ff6e40;
}

.sr-slider-value {
  width: 44px;
  text-align: right;
  font-size: 0.8rem;
  font-weight: 750;
}

.sr-pack-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
}

.sr-segmented {
  align-self: flex-start;
  gap: 4px;
  padding: 4px;
  background: #e2e8f0;
  border-radius: 8px;
}

.sr-segmented button {
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #475569;
  padding: 6px 10px;
  font-size: 0.78rem;
  font-weight: 750;
  cursor: pointer;
}

.sr-segmented button.active {
  background: #fff;
  color: #0f172a;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.12);
}

.sr-event-filter {
  min-width: 180px;
  max-width: 260px;
}

.sr-table-groups,
.sr-supplier-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.sr-progress-wrap {
  border-bottom: 1px solid var(--sr-border, #e2e8f0);
  padding: 12px;
  background: var(--sr-surface, #fff);
  display: grid;
  gap: 8px;
}

.sr-progress-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.78rem;
  color: var(--sr-text, #334155);
}

.sr-progress-track {
  width: 100%;
  height: 8px;
  border-radius: 999px;
  background: var(--sr-border, #e2e8f0);
  overflow: hidden;
}

.sr-progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #22c55e, #16a34a);
}

.sr-table-group,
.sr-supplier-group {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

/* Diagnostic feuille de course (prévu · shop · storage · restock · achat). */
.sr-shop-diag {
  display: block;
  font-size: 0.7rem;
  color: var(--sr-faint, #94a3b8);
  font-weight: 500;
  margin-top: 3px;
  line-height: 1.35;
}
.sr-storage-warn {
  margin-bottom: 12px;
}

.sr-group-head,
.sr-supplier-head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  padding: 12px 14px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
  flex-wrap: wrap;
}
.sr-supplier-title { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; min-width: 0; }
.sr-supplier-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.sr-group-head span,
.sr-supplier-head span {
  color: #64748b;
  font-size: 0.74rem;
  font-weight: 700;
}

.sr-table {
  width: 100%;
  border-collapse: collapse;
}

.sr-table th,
.sr-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #edf2f7;
  text-align: left;
  vertical-align: top;
  font-size: 0.8rem;
}

.sr-table th {
  color: #64748b;
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
  background: #fff;
}

.sr-table tr:last-child td {
  border-bottom: 0;
}

.sr-row-confirmed td {
  background: #f0fdf4;
}

.sr-confirm-btn {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  min-width: 94px;
  min-height: 30px;
  padding: 5px 9px;
  border: 1px solid var(--fb-border-strong, #d1d5db);
  border-radius: 7px;
  background: var(--sr-surface, #fff);
  color: var(--sr-muted, #4b5563);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, transform 120ms ease;
}

.sr-confirm-btn:hover {
  border-color: rgba(255, 49, 49, 0.45);
  background: var(--sr-primary-soft, #fff5f5);
  color: #ff3131;
}

.sr-confirm-btn:active {
  transform: translateY(1px);
}

.sr-confirm-btn:focus-visible {
  outline: 2px solid rgba(255, 49, 49, 0.4);
  outline-offset: 2px;
}

.sr-confirm-btn.is-confirmed {
  border-color: #86efac;
  background: #dcfce7;
  color: #166534;
}

.sr-confirm-btn.is-confirmed:hover {
  border-color: #4ade80;
  background: #bbf7d0;
  color: #14532d;
}

.sr-table td strong {
  display: block;
  color: #0f172a;
  font-size: 0.82rem;
}

.sr-table td span {
  display: block;
  color: #64748b;
  font-size: 0.72rem;
  margin-top: 2px;
}

.sr-strong {
  font-weight: 800;
  color: #0f172a;
}

/* Liste de courses : « X PdV » repliable (évite les lignes Shops très longues). */
.sr-shops-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--sr-border, #e2e8f0);
  background: var(--sr-subtle, #f8fafc);
  color: var(--sr-muted, #475569);
  font-weight: 700;
  font-size: 0.8rem;
  padding: 2px 8px;
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.12s ease, border-color 0.12s ease;
}
.sr-shops-toggle:hover {
  background: #eef2f7;
  border-color: #cbd5e1;
}
.sr-shops-detail {
  margin-top: 6px;
  font-size: 0.82rem;
  color: var(--sr-muted, #475569);
  line-height: 1.45;
}

@media (max-width: 1100px) {
  .sr-body {
    grid-template-columns: 1fr;
  }

  .sr-sidebar {
    position: static;
  }
}

@media (max-width: 760px) {
  .space-restock-view {
    padding: 16px;
  }

  .sr-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sr-actions,
  .sr-actions .v-btn {
    width: 100%;
  }

  .sr-setting-row {
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: start;
  }

  .sr-setting-info,
  .sr-slider-wrap,
  .sr-pack-toggle {
    grid-column: 2;
  }

  .sr-pack-toggle {
    justify-content: flex-start;
  }

  .sr-panel-head {
    flex-direction: column;
  }

  .sr-head-controls {
    width: 100%;
  }

  .sr-table {
    min-width: 720px;
  }

  .sr-table-group,
  .sr-supplier-group {
    overflow-x: auto;
  }
}

@media (max-width: 520px) {
  .sr-overview {
    grid-template-columns: 1fr;
  }
}

/* Harmonisation inventaire / réarmement */
.space-restock-view {
  --sr-bg: var(--fb-bg, #f6f8fb); /* fond unifié EventPredict */
  --sr-surface: var(--fb-surface, #FFFFFF);
  --sr-subtle: var(--fb-subtle, #FAFAFA);
  --sr-border: var(--fb-border, #E5E7EB);
  --sr-text: var(--fb-text, #212121);
  --sr-muted: var(--fb-muted, #6B7280);
  --sr-faint: var(--fb-faint, #9CA3AF);
  --sr-primary: #ff3131;
  --sr-primary-soft: var(--fb-primary-soft, #FFF5F5);
  --primary: #ff3131;
  --background: var(--fb-surface, #FFFFFF);
  --foreground: var(--fb-text, #212121);
  --muted: var(--fb-subtle, #FAFAFA);
  --muted-foreground: var(--fb-muted, #6B7280);
  --border: var(--fb-border, #E5E7EB);

  max-width: none;
  min-height: 100dvh;
  margin: 0;
  padding: 0;
  background: var(--sr-bg);
  color: var(--sr-text);
}

.sr-header {
  min-height: 84px;
  padding: 10px 24px;
  margin-bottom: 0;
  gap: 12px;
  background: var(--sr-surface);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}

.sr-back {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border-color: transparent !important;
  background: transparent !important;
}

.sr-back:hover {
  background: rgba(0, 0, 0, 0.04) !important;
}

.sr-title {
  font-size: 16px;
  line-height: 1.25;
  font-weight: 700;
  color: var(--sr-text);
}

.sr-subtitle {
  color: var(--sr-muted);
  font-size: 12px;
  line-height: 1.35;
}

.sr-actions :deep(.v-btn),
.sr-actions :deep(.v-field) {
  border-radius: 8px;
  text-transform: none;
  font-weight: 650;
  letter-spacing: 0;
}

.sr-toolbox-nav {
  gap: 5px;
  margin: 10px 24px 8px;
}

.sr-toolnav-btn {
  border-color: var(--sr-border);
  background: var(--sr-surface);
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  color: var(--sr-muted);
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}

.sr-toolnav-btn:hover {
  background: var(--sr-subtle);
}

.sr-toolnav-btn-active {
  background: var(--sr-primary-soft);
  color: var(--sr-primary);
  border-color: rgba(255, 49, 49, 0.28);
}

.sr-overview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 24px 8px;
}

.sr-metric {
  flex: 0 1 auto;
  min-height: 38px;
  gap: 6px;
  padding: 6px 12px;
  border: 1.5px solid var(--sr-border) !important;
  border-radius: 8px;
  background: var(--sr-surface);
  box-shadow: none !important;
}

.sr-metric-value {
  font-size: 13px;
  font-weight: 800;
  color: var(--sr-text);
}

.sr-metric-label {
  color: var(--sr-muted);
  font-size: 11px;
  font-weight: 650;
  text-transform: uppercase;
  letter-spacing: 0;
}

.sr-body,
.sr-skeleton {
  display: grid;
  /* 3 colonnes : filtres | feuille | aperçu fournisseurs (pattern EventPredict). */
  grid-template-columns: 292px minmax(0, 1fr) 340px;
  gap: 18px;
  align-items: stretch;
  margin: 0 24px 24px;
  /* Remplit .sr-content : chaque colonne borne sa propre hauteur + overflow. */
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}
.sr-body > *,
.sr-skeleton > * {
  min-height: 0;
  max-height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
}
/* Colonne fournisseurs masquée quand vide : 2 colonnes. */
.sr-body.sr-body--no-suppliers { grid-template-columns: 292px minmax(0, 1fr); }
.sr-body.sr-body--no-aside.sr-body--no-suppliers { grid-template-columns: minmax(0, 1fr); }

/* ── Colonne droite : aperçu fournisseurs (design « Résumé inventaire »). ── */
.sr-suppliers { min-width: 0; }
.sr-sup-card {
  background: var(--sr-surface, #ffffff);
  border: 1px solid var(--sr-border, #d9e2ec);
  border-radius: 18px;
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.04));
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sr-sup-head { display: flex; align-items: center; justify-content: space-between; }
.sr-sup-title { display: flex; align-items: center; font-size: 0.85rem; font-weight: 700; color: var(--sr-text, #0f172a); }
.sr-sup-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px; padding: 0 7px; border-radius: 100px;
  background: rgba(255, 49, 49, 0.1); color: #ff3131; font-size: 0.75rem; font-weight: 700;
}
.sr-sup-empty { font-size: 0.8rem; color: var(--sr-faint, #9ca3af); text-align: center; padding: 16px 8px; margin: 0; }
.sr-sup-list { display: flex; flex-direction: column; gap: 8px; overflow-y: auto; }
.sr-sup-item {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas: 'copy total' 'bar bar' 'email email';
  gap: 4px 10px;
  align-items: center;
  text-align: left;
  border: 1px solid var(--sr-border, #e5e7eb);
  border-radius: 10px;
  background: var(--sr-surface, #fff);
  padding: 9px 11px;
  cursor: pointer;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.sr-sup-item:hover { border-color: rgba(255, 49, 49, 0.26); box-shadow: 0 3px 12px rgba(15, 23, 42, 0.06); }
.sr-sup-item-copy { grid-area: copy; display: flex; flex-direction: column; min-width: 0; }
.sr-sup-item-copy strong { font-size: 0.82rem; color: var(--sr-text, #0f172a); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sr-sup-item-copy small { font-size: 0.68rem; color: var(--sr-muted, #6b7280); }
.sr-sup-item-total { grid-area: total; text-align: right; display: flex; flex-direction: column; }
.sr-sup-item-total strong { font-size: 0.9rem; color: #ff3131; font-variant-numeric: tabular-nums; }
.sr-sup-item-total small { font-size: 0.62rem; color: var(--sr-faint, #9ca3af); }
.sr-sup-item-bar { grid-area: bar; height: 4px; border-radius: 100px; background: var(--sr-border, #f1f5f9); overflow: hidden; }
.sr-sup-item-bar span { display: block; height: 100%; background: #ff3131; border-radius: 100px; }
.sr-sup-item-email {
  grid-area: email;
  justify-self: end;
  display: inline-flex;
  align-items: center;
  margin-top: 4px;
  padding: 4px 10px;
  border-radius: 100px;
  border: 1px solid rgba(255, 49, 49, 0.28);
  background: rgba(255, 49, 49, 0.08);
  color: #ff3131;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 140ms ease;
}
.sr-sup-item-email:hover { background: rgba(255, 49, 49, 0.16); }

/* ── Popup email fournisseur : hauteur bornée + éditeur WYSIWYG léger. ── */
.sr-email-dialog { display: flex; flex-direction: column; max-height: 82vh; }
.sr-email-dialog-content { overflow-y: auto; padding-top: 12px; }
.sr-wysiwyg {
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  overflow: hidden;
}
.sr-wysiwyg-toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  background: #f8fafc;
  border-bottom: 1px solid #e2e8f0;
}
.sr-wysiwyg-toolbar button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 6px;
  color: #475569;
  cursor: pointer;
  transition: background-color 120ms ease;
}
.sr-wysiwyg-toolbar button:hover { background: #e2e8f0; }
.sr-wysiwyg-sep { width: 1px; height: 18px; background: #e2e8f0; margin: 0 4px; }
.sr-wysiwyg-editor {
  min-height: 160px;
  max-height: 42vh;
  overflow-y: auto;
  padding: 10px 12px;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #0f172a;
  outline: none;
  white-space: pre-wrap;
}
.sr-wysiwyg-editor:focus { background: #fff; }
.sr-wysiwyg-editor ul { margin: 4px 0; padding-left: 20px; }

.sr-panel,
.sr-table-group,
.sr-supplier-group,
.sr-setting-row,
.sr-event-item,
.sr-past-source-card {
  border-color: var(--sr-border) !important;
  /* Aligné sur Components Library : rounded-xl (~16px) + ombre subtile. */
  border-radius: 12px;
  background: var(--sr-surface);
  box-shadow: none !important;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.sr-panel:hover,
.sr-table-group:hover,
.sr-supplier-group:hover {
  box-shadow: 0 3px 14px rgba(15, 23, 42, 0.05) !important;
}

.sr-panel {
  overflow: hidden;
  margin-bottom: 16px;
}

.sr-panel-head,
.sr-group-head,
.sr-supplier-head {
  padding: 14px 16px;
  background: var(--sr-subtle);
  border-bottom-color: var(--sr-border);
}

.sr-panel-head h2,
.sr-group-head h3,
.sr-supplier-head h3 {
  font-size: 14px;
  line-height: 1.25;
  font-weight: 700;
  color: var(--sr-text);
}

.sr-panel-head p,
.sr-group-head span,
.sr-supplier-head span,
.sr-setting-info span,
.sr-event-meta,
.sr-table td span {
  color: var(--sr-muted);
  font-size: 12px;
  line-height: 1.35;
}

.sr-inline-btn,
.sr-event-quick-actions button {
  border-color: var(--sr-border);
  background: var(--sr-surface);
  color: var(--sr-muted);
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
}

.sr-inline-btn:hover:not(:disabled),
.sr-event-quick-actions button:hover {
  background: var(--sr-primary-soft);
  border-color: rgba(255, 49, 49, 0.28);
  color: var(--sr-primary);
}

.sr-objective-toggle,
.sr-segmented {
  gap: 4px;
  padding: 3px;
  background: var(--sr-subtle);
  border: 1px solid var(--sr-border);
  border-radius: 8px;
}

.sr-objective-toggle button,
.sr-segmented button {
  border-radius: 8px;
  color: var(--sr-muted);
  font-size: 12px;
  font-weight: 650;
}

.sr-objective-toggle button.is-active,
.sr-segmented button.active {
  background: var(--sr-surface);
  color: var(--sr-primary);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
}

.sr-date-picker {
  border-bottom-color: var(--sr-border);
  box-shadow: none !important;
}

.sr-date-picker :deep(.v-picker),
.sr-date-picker :deep(.v-picker__body) {
  background: var(--sr-surface);
}

.sr-event-item {
  padding: 10px;
  color: var(--sr-text);
}

.sr-event-name,
.sr-setting-info strong,
.sr-table td strong,
.sr-strong {
  color: var(--sr-text);
  font-size: 13px;
  font-weight: 700;
}

.sr-event-item:hover,
.sr-event-item.is-selected {
  border-color: rgba(255, 49, 49, 0.28) !important;
  background: var(--sr-primary-soft);
  color: var(--sr-primary);
}

.sr-slider {
  accent-color: var(--sr-primary);
}

.sr-table th {
  color: var(--sr-muted);
  font-size: 11px;
  background: var(--sr-surface);
  letter-spacing: 0;
}

.sr-table th,
.sr-table td,
.sr-progress-wrap {
  border-color: var(--sr-border);
}

.sr-empty {
  color: var(--sr-muted);
  padding: 28px 16px;
  font-size: 13px;
}

.sr-wizard {
  padding: 6px 4px 12px;
  margin-bottom: 2px;
}

.sr-wizard-circle {
  width: 26px;
  height: 26px;
  border-width: 1px;
  font-size: 0.75rem;
}

.sr-wizard-line {
  height: 2px;
}

.sr-wizard-label {
  font-size: 0.78rem;
  font-weight: 650;
}

.sr-step-toolbar {
  gap: 12px;
  padding: 9px 12px;
  background: var(--sr-surface);
}

.sr-step-toolbar .sr-search {
  width: min(100%, 560px);
}

.sr-settings-list {
  gap: 6px;
  padding: 10px 12px 12px;
}

.sr-setting-row {
  grid-template-columns: 24px minmax(260px, 1fr) minmax(220px, 260px) 78px;
  gap: 12px;
  min-height: 68px;
  padding: 9px 12px;
  border-radius: 10px;
  box-shadow: none !important;
}

.sr-setting-row:hover {
  border-color: var(--fb-border-strong, #d1d5db) !important;
  box-shadow: 0 3px 12px rgba(15, 23, 42, 0.05) !important;
}

.sr-include-toggle input,
.sr-pack-toggle input {
  accent-color: var(--sr-primary);
}

.sr-setting-info {
  gap: 3px;
}

.sr-setting-info strong {
  font-size: 12.5px;
  line-height: 1.25;
}

.sr-setting-meta {
  gap: 3px 7px;
}

.sr-setting-sources {
  max-width: 34ch;
}

.sr-recipe-inline {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 3px;
}

.sr-recipe-label,
.sr-recipe-part {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-height: 20px;
  padding: 2px 6px;
  border-radius: 5px;
  font-size: 10px;
  line-height: 1.2;
}

.sr-recipe-label {
  padding-left: 0;
  color: var(--sr-muted, #6b7280);
  font-weight: 700;
}

.sr-recipe-part {
  border: 1px solid var(--sr-border, #e5e7eb);
  background: var(--sr-subtle, #f7f7f8);
  color: var(--sr-text, #374151);
  font-weight: 600;
}

.sr-recipe-part em {
  color: var(--sr-muted, #6b7280);
  font-style: normal;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}

.sr-qty-block {
  margin-top: 2px;
}

.sr-qty-base,
.sr-qty-target {
  font-size: 11px;
}

.sr-slider-label {
  color: var(--sr-muted, #6b7280);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: none;
}

.sr-slider-row {
  gap: 8px;
}

.sr-slider-value {
  width: 38px;
  color: var(--sr-text, #111827);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.sr-pack-toggle {
  justify-content: flex-end;
  color: var(--sr-muted, #6b7280);
  font-size: 11px;
  font-weight: 600;
}

.sr-wizard-nav {
  position: sticky;
  bottom: 0;
  z-index: 4;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(8px);
}

.sr-mobile-config-sheet {
  border-radius: 16px 16px 0 0;
}
.sr-mobile-config-content {
  display: grid;
  gap: 12px;
}
.sr-mobile-sheet-block {
  display: grid;
  gap: 8px;
}
.sr-mobile-sheet-label {
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--sr-muted);
  text-transform: uppercase;
  letter-spacing: 0;
}
.sr-mobile-toolbox {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.sr-mobile-tool {
  appearance: none;
  min-height: 38px;
  border: 1px solid var(--sr-border);
  border-radius: 8px;
  background: var(--sr-surface);
  color: var(--sr-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 750;
}
.sr-mobile-tool-active {
  background: var(--sr-primary-soft);
  color: var(--sr-primary);
  border-color: rgba(255, 49, 49, 0.28);
}
.sr-mobile-config-panel {
  margin-bottom: 0;
}
/* BUG-283 : la bottom-sheet est TÉLÉPORTÉE hors de `.space-restock-view` — les
   tokens --sr-* n'y existent pas (fallbacks clairs ou déclarations invalides).
   La v-card suit le thème Vuetify ; on ne force que le panneau interne. */
.dark .sr-mobile-config-sheet .sr-panel {
  background: #1f2937;
  border-color: #374151 !important;
}
.dark .sr-mobile-config-sheet .sr-panel-head {
  background: #1a2332;
  border-bottom-color: #374151;
}
.dark .sr-mobile-config-sheet .sr-mobile-sheet-label {
  color: #94a3b8;
}
.dark .sr-mobile-config-sheet .sr-mobile-tool {
  background: #1f2937;
  border-color: #374151;
  color: #d1d5db;
}
.dark .sr-mobile-config-sheet .sr-mobile-tool-active {
  background: rgba(255, 49, 49, 0.16);
  color: #ff8a80;
  border-color: rgba(255, 49, 49, 0.4);
}

.sr-skeleton-side,
.sr-skeleton-panel {
  background: var(--sr-surface);
  border: 1px solid var(--sr-border);
  border-radius: 8px;
}

.sr-skeleton-side {
  display: grid;
  gap: 10px;
  padding: 14px;
}

.sr-skeleton-main {
  display: grid;
  gap: 16px;
}

.sr-skeleton-panel {
  overflow: hidden;
}

.sr-skeleton-panel-head {
  display: grid;
  gap: 8px;
  padding: 14px 16px;
  background: var(--sr-subtle);
  border-bottom: 1px solid var(--sr-border);
}

.sr-skeleton-line,
.sr-skeleton-calendar,
.sr-skeleton-event,
.sr-skeleton-row {
  display: block;
  border-radius: 999px;
  background: linear-gradient(90deg, #EEEEEE 0%, #F7F7F7 42%, #EEEEEE 78%);
  background-size: 220% 100%;
  animation: sr-shimmer 1.3s ease-in-out infinite;
}

.sr-skeleton-line {
  width: 100%;
  height: 10px;
}

.sr-skeleton-line-title {
  width: 46%;
  height: 13px;
}

.sr-skeleton-line-short {
  width: 30%;
}

.sr-skeleton-calendar {
  height: 210px;
  border-radius: 8px;
}

.sr-skeleton-event,
.sr-skeleton-row {
  height: 44px;
  border-radius: 8px;
}

.sr-skeleton-row {
  margin: 12px 16px;
}

@keyframes sr-shimmer {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}

@media (max-width: 1100px) {
  .sr-body,
  .sr-skeleton {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .space-restock-view {
    padding: 0;
  }

  .sr-header {
    min-height: auto;
    padding: 12px 16px;
    align-items: flex-start;
  }

  .sr-mobile-config-btn {
    display: inline-flex;
  }

  .sr-toolbox-nav,
  .sr-sidebar {
    display: none;
  }

  .sr-toolbox-nav,
  .sr-overview,
  .sr-body,
  .sr-skeleton {
    margin-left: 16px;
    margin-right: 16px;
  }

  .sr-actions {
    display: grid;
    grid-template-columns: 1fr;
    width: 100%;
  }

  .sr-actions :deep(.v-btn),
  .sr-head-controls,
  .sr-step-toolbar,
  .sr-step-toolbar-actions,
  .sr-search,
  .sr-inline-actions {
    width: 100%;
  }

  .sr-step-toolbar,
  .sr-step-toolbar-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .sr-step-toolbar-label {
    display: none;
  }

  .sr-compositions {
    margin: 12px 12px 2px;
  }

  .sr-compositions-grid {
    grid-template-columns: 1fr;
  }

  .sr-metric {
    flex: 1 1 calc(50% - 8px);
    justify-content: center;
  }

  .sr-setting-row {
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: start;
  }

  .sr-setting-info,
  .sr-slider-wrap,
  .sr-pack-toggle {
    grid-column: 2;
  }

  .sr-pack-toggle {
    justify-content: flex-start;
  }

  .sr-panel-head-actions {
    align-items: stretch;
  }

  .sr-segmented,
  .sr-inline-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .sr-inline-btn-select {
    grid-column: 1 / -1;
    margin-left: 0;
  }

  .sr-segmented button,
  .sr-inline-btn {
    min-height: 36px;
  }

  .sr-table-group,
  .sr-supplier-group {
    overflow: hidden;
  }

  .sr-table,
  .sr-table tbody,
  .sr-table tr,
  .sr-table td {
    display: block;
    width: 100%;
  }

  .sr-table {
    min-width: 0;
  }

  .sr-table thead {
    display: none;
  }

  .sr-table tr {
    padding: 10px 12px;
    border-bottom: 1px solid var(--sr-border);
  }

  .sr-table tr:last-child {
    border-bottom: 0;
  }

  .sr-table td {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    gap: 10px;
    align-items: start;
    padding: 5px 0;
    border-bottom: 0;
    font-size: 12px;
  }

  .sr-table td::before {
    content: attr(data-label);
    color: var(--sr-faint);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .sr-table td strong,
  .sr-strong {
    overflow-wrap: anywhere;
  }

  .sr-row-confirmed td {
    background: transparent;
  }

  .sr-row-confirmed {
    background: var(--fb-success-soft, #f0fdf4);
  }
}

@media (max-width: 520px) {
  .sr-metric {
    flex-basis: 100%;
  }

  .sr-mobile-toolbox,
  .sr-segmented,
  .sr-inline-actions {
    grid-template-columns: 1fr;
  }
}

/* Final F&B visual contract. */
.sr-header {
  border-bottom-color: var(--sr-border);
  box-shadow: 0 1px 0 var(--sr-border);
}
.sr-title {
  color: var(--sr-text);
  font-size: 1rem;
  font-weight: 750;
  letter-spacing: -0.01em;
}
.sr-subtitle {
  color: var(--sr-muted);
}
.sr-actions :deep(.v-btn),
.sr-back,
.sr-toolnav-btn,
.sr-inline-btn,
.sr-confirm-btn,
.sr-shops-toggle,
.sr-segmented button,
.sr-objective-toggle button {
  border-radius: var(--fb-radius-control, 8px) !important;
}
.sr-actions :deep(.v-btn) {
  min-height: 36px;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: none;
}
.sr-actions :deep(.v-btn:focus-visible),
.sr-back:focus-visible,
.sr-toolnav-btn:focus-visible,
.sr-inline-btn:focus-visible,
.sr-confirm-btn:focus-visible,
.sr-shops-toggle:focus-visible,
.sr-segmented button:focus-visible,
.sr-objective-toggle button:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
.sr-panel,
.sr-table-group,
.sr-supplier-group,
.sr-skeleton-side,
.sr-skeleton-panel {
  border-color: var(--sr-border) !important;
  border-radius: var(--fb-radius-panel, 12px) !important;
  background: var(--sr-surface) !important;
  box-shadow: var(--fb-shadow-card) !important;
}
.sr-panel:hover,
.sr-table-group:hover,
.sr-supplier-group:hover {
  box-shadow: var(--fb-shadow-hover) !important;
}
.sr-panel-head,
.sr-group-head,
.sr-supplier-head,
.sr-step-toolbar {
  border-color: var(--sr-border);
  background: var(--sr-subtle);
}
.sr-panel h2,
.sr-group-head h3,
.sr-supplier-title,
.sr-setting-info strong {
  color: var(--sr-text);
}
.sr-inline-btn {
  border-color: var(--sr-border);
  background: var(--sr-surface);
  color: var(--sr-text);
  font-weight: 650;
}
.sr-inline-btn:hover {
  border-color: rgba(255, 49, 49, 0.3);
  background: var(--sr-primary-soft);
  color: var(--sr-primary);
}
.sr-table {
  color: var(--sr-text);
  font-variant-numeric: tabular-nums;
}
.sr-table th {
  padding: 9px 10px;
  border-bottom-color: var(--sr-border);
  background: var(--sr-subtle);
  color: var(--sr-muted);
  font-size: 0.6875rem;
  font-weight: 750;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}
.sr-table td {
  padding: 9px 10px;
  border-bottom-color: var(--sr-border);
  background: var(--sr-surface);
  color: var(--sr-text);
  font-size: 0.8125rem;
}
.sr-table tbody tr:hover td {
  background: var(--sr-primary-soft);
}
.sr-row-confirmed td {
  background: var(--fb-success-soft, #F0FDF4);
}
.sr-progress-fill,
.sr-wizard-line-done {
  background: var(--fb-success, #16A34A);
}
.sr-wizard-step-active .sr-wizard-circle {
  border-color: var(--sr-primary);
  background: var(--sr-primary);
  color: #FFFFFF;
}

.v-theme--dataFridayDark .space-restock-view .sr-header,
.v-theme--dataFridayDark .space-restock-view .sr-panel,
.v-theme--dataFridayDark .space-restock-view .sr-table td {
  background: var(--sr-surface);
  color: var(--sr-text);
}

/* Bandeau de section : même contrat visuel que Event Predict / Space Menus. */
.sr-header,
.v-theme--dataFridayDark .space-restock-view .sr-header {
  min-height: 82px;
  margin: 18px 24px;
  padding: 16px 18px;
  border: 0;
  border-radius: var(--fb-radius-card, 16px);
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.3);
}

.sr-title {
  color: #fff;
  font-size: 1.25rem;
  font-weight: 800;
}

.sr-subtitle {
  color: rgba(255, 255, 255, 0.84);
}

.sr-back,
.sr-actions :deep(.v-btn) {
  border: 1.5px solid rgba(255, 255, 255, 0.62) !important;
  background: rgba(255, 255, 255, 0.1) !important;
  color: #fff !important;
}
/* Boutons harmonisés Market Price List : pilules blanches, une ligne, contenues. */
.sr-actions :deep(.v-btn) {
  border-radius: 100px !important;
  min-height: 34px;
  height: 34px;
  text-transform: none;
  white-space: nowrap;
  font-size: 12.5px;
  padding: 0 16px;
}

.sr-back:hover,
.sr-actions :deep(.v-btn:hover) {
  border-color: #fff !important;
  background: #fff !important;
  color: var(--sr-primary) !important;
}

.sr-generate-hint {
  width: auto;
  margin: 0;
  padding: 5px 10px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

@media (max-width: 760px) {
  .sr-header {
    margin: 14px 16px;
    padding: 14px 16px;
    border-radius: 14px;
  }

  .sr-title {
    font-size: 1rem;
  }
}

/* ── Header : bandeau rouge en carte arrondie, 1er enfant de la colonne
   centre (gutters fournis par .sr-body) ── */
.sr-header {
  display: block !important;
  min-height: 0 !important;
  padding: 0 !important;
  margin: 0 0 16px !important;
  background: #ff3131 !important;
  border: none !important;
  border-radius: 18px !important;
  box-shadow: 0 8px 24px rgba(255, 49, 49, .28) !important;
  flex-shrink: 0;
}
.sr-header__inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 22px;
  flex-wrap: wrap;
}
.sr-header__left { display: flex; align-items: center; gap: 12px; min-width: 0; }
.sr-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sr-header__icon :deep(.v-icon) { color: #fff; }
/* Icône-bouton : bascule le panneau latéral (filtres). */
.sr-header__toggle {
  width: 44px;
  height: 44px;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  color: #fff;
  transition: background .15s ease, transform .15s ease;
}
.sr-header__toggle:hover { background: rgba(255, 255, 255, .32); }
.sr-header__toggle:active { transform: scale(.94); }
.sr-header__toggle:focus-visible { outline: 2px solid rgba(255, 255, 255, .85); outline-offset: 2px; }
/* Sélecteur d'espace dans le bandeau : texte en blanc sur le rouge. */
.sr-header__switcher { flex-shrink: 0; }
.sr-header__switcher :deep(.wsh-space-trigger) { color: #fff; }
.sr-header__switcher :deep(.wsh-space-trigger:hover) { background-color: rgba(255, 255, 255, .16); }
.sr-header__switcher :deep(.wsh-space-name) { color: #fff; }
.sr-header__switcher :deep(.wsh-space-chevron) { color: rgba(255, 255, 255, .85); }
.sr-header__text { min-width: 0; }
.sr-header__title { margin: 0; font-size: 20px; font-weight: 800; color: #fff; line-height: 1.2; }
.sr-header__subtitle { margin: 3px 0 0; font-size: 12.5px; color: rgba(255, 255, 255, .78); }
.sr-header__right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

/* Retour (blanc sur rouge) */
.sr-back { background: transparent !important; border: none !important; }
.sr-back :deep(.v-icon) { color: #fff !important; }
.sr-back:hover { background: rgba(255, 255, 255, .15) !important; }

/* Bouton Settings (mobile) : outline blanc */
.sr-hbtn { color: #fff !important; text-transform: none; font-weight: 600; border-radius: 100px !important; }
.sr-hbtn :deep(.v-icon) { color: #fff !important; }
.sr-hbtn:hover { background: rgba(255, 255, 255, .15) !important; }

/* CTA Shopping List : pilule blanche / texte rouge */
.sr-cta-btn { background: #fff !important; color: #ff3131 !important; text-transform: none; font-weight: 700; border-radius: 100px !important; }
.sr-cta-btn :deep(.v-icon) { color: #ff3131 !important; }
.sr-cta-btn:hover { background: rgba(255, 255, 255, .9) !important; }

/* Hint (blanc translucide sur rouge) */
.sr-generate-hint {
  padding: 0 24px 10px !important;
  margin: 0 !important;
  color: rgba(255, 255, 255, .92) !important;
}
.sr-generate-hint :deep(.v-icon) { color: rgba(255, 255, 255, .92) !important; }

/* ── Layout identique à MarketPriceListView (#market-price-page) ──
   Conteneur racine = zone scrollable interne ; header sticky top:0 dedans ;
   contenu recentré (max-width). ── */
.space-restock-view {
  /* Hauteur bornée (viewport − header app-bar 64px) : plus de scroll page,
     chaque colonne de .sr-body scrolle indépendamment (modèle EventPredict). */
  height: calc(100vh - 64px) !important;
  min-height: 0 !important;
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.sr-content {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* Top 18px = parité marge header→bandeau EventPredict. */
  padding: 18px 28px;
}
@media (max-width: 700px) {
  .sr-content { padding: 16px; }
}
/* Mobile/tablette : scroll rendu à la PAGE (colonnes empilées). Placé en FIN de
   feuille pour l'emporter sur les règles bornées .space-restock-view/.sr-body. */
@media (max-width: 1100px) {
  .space-restock-view {
    height: auto !important;
    overflow: visible;
  }
  .sr-content {
    overflow: visible;
    display: block;
  }
  .sr-body,
  .sr-skeleton {
    overflow: visible;
    min-height: 0;
    flex: none;
  }
  .sr-body > *,
  .sr-skeleton > * {
    max-height: none;
    overflow: visible;
  }
}

/* ===================== DARK MODE — étape « Stock » =====================
   Surfaces, bordures et textes passent par les `--sr-*` (adossées au contrat
   `--fb-*` de style.css) et basculent seules. Ne restent ici que les valeurs
   sans variable : le voile blanc translucide de la barre de navigation du
   wizard, et les teintes ambre/orange calibrées pour du texte sur fond clair.
   Le bandeau rouge #ff3131 est identique dans les deux thèmes. */
.v-theme--dataFridayDark .space-restock-view .sr-wizard-nav {
  background: rgba(31, 41, 55, 0.96);
}
.v-theme--dataFridayDark .space-restock-view .sr-generate-hint,
.v-theme--dataFridayDark .space-restock-view .sr-sidebar-generate-hint,
.v-theme--dataFridayDark .space-restock-view .sr-wizard-nav-hint {
  color: #fcd34d;
}
.v-theme--dataFridayDark .space-restock-view .sr-qty-target {
  color: #fdba74;
}
.v-theme--dataFridayDark .space-restock-view .sr-collapse-icon {
  color: #94a3b8;
}

/* ===================== DARK MODE — étapes « Réarmement » et « Courses » ==
   Les surfaces/bordures/textes des tableaux, groupes fournisseurs et boutons
   passent déjà par les `--sr-*` ci-dessus. Ne restent ici que les valeurs sans
   variable : les hovers gris ardoise du toggle « X PdV » et les teintes vertes
   « confirmé » (vert 100/700), calibrées pour fond clair → version claire de la
   même famille (parité méthode BUG-197). */
.v-theme--dataFridayDark .space-restock-view .sr-shops-toggle:hover {
  background: var(--fb-border, #374151);
  border-color: var(--fb-border-strong, #4b5563);
}
.v-theme--dataFridayDark .space-restock-view .sr-confirm-btn.is-confirmed {
  border-color: rgba(134, 239, 172, 0.4);
  background: var(--fb-success-soft, rgba(22, 163, 74, 0.14));
  color: #86efac;
}
.v-theme--dataFridayDark .space-restock-view .sr-confirm-btn.is-confirmed:hover {
  border-color: rgba(74, 222, 128, 0.55);
  background: rgba(22, 163, 74, 0.24);
  color: #bbf7d0;
}

/* Popup email fournisseur : contenu téléporté hors de `.space-restock-view`
   (v-dialog) → les `var(--sr-*)` y retombent sur leurs littéraux clairs.
   La v-card est thémée par Vuetify ; on ne rebascule ici que l'éditeur
   WYSIWYG maison, via `html.dark` (resynchronisée à chaque changement de
   thème, cf. DashboardView). Valeurs alignées sur la palette sombre `--fb-*`. */
.dark .sr-wysiwyg {
  border-color: #374151;
}
.dark .sr-wysiwyg-toolbar {
  background: #172033;
  border-bottom-color: #374151;
}
.dark .sr-wysiwyg-toolbar button {
  color: #d1d5db;
}
.dark .sr-wysiwyg-toolbar button:hover {
  background: #374151;
}
.dark .sr-wysiwyg-sep {
  background: #374151;
}
.dark .sr-wysiwyg-editor {
  color: #f9fafb;
}
.dark .sr-wysiwyg-editor:focus {
  background: transparent;
}
</style>
