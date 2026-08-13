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
        <!-- Historique des plans (RestockPlan) — masqué si le module backend
             est absent (404 liste) ou en mode démo. -->
        <RestockPlansPanel
          v-if="plansAvailable"
          :plans="plans"
          :loading="plansLoading"
          :active-plan-id="loadedPlanId"
          :can-write="canWritePlans"
          :error="plansError"
          @load="loadPlan"
          @rename="renamePlan"
          @duplicate="duplicatePlanAction"
          @delete="deletePlanAction"
          @retry="refreshPlans"
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

          <!-- Lot 5 (JLH) — plusieurs évènements cochés = leurs besoins s'ADDITIONNENT
               en un seul objectif. Rien ne le disait : on l'annonce, avec le raccourci
               vers l'étape 1 où la répartition se règle (article par article, curseur %). -->
          <div
            v-if="objectiveSource === 'forecast' && selectedEventIds.length > 1"
            class="sr-multi-event-hint"
            role="status"
          >
            <v-icon size="14">mdi-information-outline</v-icon>
            <span>{{ selectedEventIds.length }} {{ t('srMultiEventHint') }}</span>
            <button v-if="currentStep !== 1" type="button" class="sr-multi-event-btn" @click="goToStep(1)">
              {{ t('srItemsToStock') }}
            </button>
          </div>

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
              <!-- Sauvegarde EXPLICITE d'un plan nommé (jamais d'auto-save). -->
              <v-btn
                v-if="plansAvailable && !loadedPlanId"
                variant="outlined"
                size="small"
                class="sr-hbtn"
                :disabled="!canWritePlans || !restockGenerated"
                :title="canWritePlans ? undefined : t('srPlanReadOnlyHint')"
                @click="openSavePlanDialog"
              >
                <v-icon size="16" class="mr-1">mdi-content-save-outline</v-icon>
                {{ t('srSavePlan') }}
              </v-btn>
              <v-btn
                v-else-if="plansAvailable && loadedPlanId"
                variant="outlined"
                size="small"
                class="sr-hbtn"
                :disabled="!canWritePlans || !planDirty"
                :title="canWritePlans ? undefined : t('srPlanReadOnlyHint')"
                @click="updateLoadedPlan"
              >
                <v-icon size="16" class="mr-1">mdi-content-save-outline</v-icon>
                {{ t('srUpdatePlan') }}
              </v-btn>
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
        <!-- Bandeau « plan chargé » : les 3 étapes affichent la PHOTO du plan,
             pas le calcul vivant (ADR-0005). -->
        <div v-if="loadedPlanId" class="sr-plan-banner" role="status">
          <v-icon size="16" class="sr-plan-banner__icon">mdi-file-lock-outline</v-icon>
          <span class="sr-plan-banner__text">
            {{ t('srPlanLoadedBanner') }}
            <strong>{{ loadedPlanMeta?.name || t('srPlanUnnamed') }}</strong>
            <span v-if="planDirty" class="sr-plan-banner__dirty"> · {{ t('srPlanDirtyHint') }}</span>
          </span>
          <v-btn size="x-small" variant="text" class="sr-plan-banner__btn" @click="detachPlan()">
            {{ t('srPlanDetachBtn') }}
          </v-btn>
        </div>
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

          <!-- fiche 314-01 — étape 1 en 2 onglets : « PDV à stocker » (existant)
               / « Espaces de stockage » (réappro des réserves depuis le stock
               tampon saisi dans le 3D Builder). Segmented control maison
               (pattern .sr-inline-btn), pas de v-tabs. -->
          <div class="sr-stock-tabs" role="tablist">
            <button
              type="button"
              class="sr-inline-btn sr-stock-tab"
              :class="{ 'sr-stock-tab-active': stockTab === 'shops' }"
              role="tab"
              :aria-selected="stockTab === 'shops' ? 'true' : 'false'"
              @click="stockTab = 'shops'"
            >{{ t('srTabShopsToStock') }}</button>
            <button
              type="button"
              class="sr-inline-btn sr-stock-tab"
              :class="{ 'sr-stock-tab-active': stockTab === 'storage' }"
              role="tab"
              :aria-selected="stockTab === 'storage' ? 'true' : 'false'"
              @click="stockTab = 'storage'"
            >
              {{ t('srTabStorageSpaces') }}
              <v-chip v-if="storageAlertCount" size="x-small" variant="tonal" color="error" class="ml-1">
                {{ storageAlertCount }}
              </v-chip>
            </button>
          </div>

          <AppSearchBar
            v-if="stockTab === 'shops'"
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

          <v-expand-transition v-if="stockTab === 'shops'">
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
              v-for="item in pagedStockSettingsRows"
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
                  <!-- fiche 314-01 — Item Supplier Name : fournisseur résolu par
                       la MÊME cascade que la feuille de course ; crayon = édition
                       du Market Price sans quitter l'écran (permission requise). -->
                  <span
                    v-if="(supplierInfoByItem[item.itemKey] || {}).supplierName"
                    class="sr-setting-supplier"
                    :title="t('srSupplierLabel')"
                  >
                    <v-icon size="12">mdi-truck-outline</v-icon>
                    {{ supplierInfoByItem[item.itemKey].supplierName }}
                    <button
                      v-if="canEditMarketPrices && supplierInfoByItem[item.itemKey].marketPriceRow"
                      type="button"
                      class="sr-supplier-edit-btn"
                      :title="t('srSupplierEdit')"
                      :aria-label="t('srSupplierEdit')"
                      @click.stop="openSupplierEdit(supplierInfoByItem[item.itemKey].marketPriceRow)"
                    ><v-icon size="13">mdi-pencil-outline</v-icon></button>
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

              <!-- Lot 4 (JLH) — les 4 valeurs sur UNE ligne, sous le nom et le
                   curseur. Le bloc « prédit → ajusté » a disparu : il convertissait
                   le besoin TOTAL en colis (« 12 pack ») juste à côté de l'achat
                   réel (« 2 pack »), deux comptages contradictoires. Toute
                   l'explication (règle du colis, vrac) vit dans l'infobulle. -->
              <div v-if="previousInventoryLoading" class="sr-values sr-values-loading">
                {{ t('srBreakdownLoading') }}
              </div>
              <div v-else-if="stockOutcomeByItem[item.itemKey]" class="sr-values">
                <span class="sr-value">
                  <span class="sr-value-label">{{ t('srBreakdownPredict') }}</span>
                  <strong class="sr-value-num">{{ formatLooseQuantity(stockOutcomeByItem[item.itemKey].predictedQuantity ?? item.totalQuantity, item.unit) }}</strong>
                </span>
                <span class="sr-value">
                  <span class="sr-value-label">{{ t('srBreakdownRemaining') }}</span>
                  <strong class="sr-value-num">{{ formatLooseQuantity(stockOutcomeByItem[item.itemKey].remainingQuantity, item.unit) }}</strong>
                </span>
                <span class="sr-value">
                  <!-- Manque RÉEL (gap), calculé par PdV puis sommé — jamais la
                       cible brute : avec 252 en inventaire pour 45 de besoin,
                       afficher 45 ici se lisait comme une contradiction. -->
                  <span class="sr-value-label">{{ t('srBreakdownRequired') }}</span>
                  <strong class="sr-value-num" :class="{ 'sr-value-ok': !(stockOutcomeByItem[item.itemKey].gap > 0) }">{{ formatLooseQuantity(stockOutcomeByItem[item.itemKey].gap, item.unit) }}</strong>
                </span>
                <span class="sr-value sr-value-buy">
                  <span class="sr-value-label">{{ t('srBreakdownToOrder') }}</span>
                  <strong class="sr-value-num" :class="{ 'sr-value-ok': (buyInfoByItem[item.itemKey] || {}).covered, 'sr-value-dash': (buyInfoByItem[item.itemKey] || {}).unknown }">{{ (buyInfoByItem[item.itemKey] || {}).main }}</strong>
                </span>
                <v-tooltip location="bottom" max-width="320">
                  <template #activator="{ props: helpProps }">
                    <v-icon
                      v-bind="helpProps"
                      size="14"
                      class="sr-values-help"
                      tabindex="0"
                      :aria-label="t('srValuesHelpTitle')"
                    >mdi-information-outline</v-icon>
                  </template>
                  <div class="sr-values-help-body">
                    <p><strong>{{ t('srBreakdownPredict') }}</strong> — {{ t('srHelpPredict') }}</p>
                    <p><strong>{{ t('srBreakdownRemaining') }}</strong> — {{ t('srHelpRemaining') }}</p>
                    <p><strong>{{ t('srBreakdownRequired') }}</strong> — {{ t('srHelpRequired') }}</p>
                    <p><strong>{{ t('srBreakdownToOrder') }}</strong> — {{ t('srHelpToOrder') }}</p>
                    <p v-if="(buyInfoByItem[item.itemKey] || {}).sub" class="sr-values-help-detail">{{ buyInfoByItem[item.itemKey].sub }}</p>
                  </div>
                </v-tooltip>
              </div>

            </div>
          </div>
          </template>
          </div>
          </v-expand-transition>

          <!-- fiche 314-01 — onglet ESPACES DE STOCKAGE : par réserve (élément
               Storage du Builder), lignes = stock tampon (section Inventaire du
               3D Builder, lecture seule ici) vs restant compté ; nécessaire =
               max(0, tampon − restant), ajustable jusqu'à 5× le tampon. -->
          <v-expand-transition v-else>
          <div v-show="!collapsed.stock">
          <div v-if="!selectedEvents.length" class="sr-empty">
            {{ t('srSelectEventsEmpty') }}
          </div>
          <div v-else-if="storageInventoryLoading" class="sr-empty">
            {{ t('srBreakdownLoading') }}
          </div>
          <div v-else-if="storageRestockGroups.length === 0" class="sr-empty">
            {{ t('srStorageEmpty') }}
          </div>
          <template v-else>
            <div
              v-for="group in storageRestockGroups"
              :key="group.elementId"
              class="sr-storage-group"
            >
              <h3 class="sr-storage-group-title">
                <v-icon size="16">mdi-warehouse</v-icon>
                {{ group.elementName }}
                <v-chip size="x-small" variant="tonal" color="grey">
                  {{ group.rows.length }} {{ group.rows.length > 1 ? t('srItemPlural') : t('srItemSingular') }}
                </v-chip>
              </h3>
              <div v-if="!group.rows.length" class="sr-empty">{{ t('srStorageNoBuffer') }}</div>
              <div
                v-for="row in group.rows"
                :key="row.key"
                class="sr-setting-row sr-storage-row"
              >
                <div class="sr-setting-info">
                  <strong>{{ row.name }}</strong>
                  <div v-if="row.nearMin || row.nearMax" class="sr-storage-alerts">
                    <!-- Priorité visuelle au stock min (rupture) sur le max (capacité). -->
                    <span v-if="row.nearMin" class="sr-storage-alert sr-storage-alert--min">
                      <v-icon size="13">mdi-alert</v-icon> {{ t('srStorageNearMin') }}
                    </span>
                    <span v-else class="sr-storage-alert sr-storage-alert--max">
                      <v-icon size="13">mdi-alert-outline</v-icon> {{ t('srStorageNearMax') }}
                    </span>
                  </div>
                </div>

                <div class="sr-slider-wrap">
                  <label class="sr-slider-label">{{ t('srStorageAdjustLabel') }}</label>
                  <div class="sr-slider-row">
                    <input
                      type="range"
                      min="0"
                      :max="row.sliderMax"
                      step="1"
                      :value="row.required"
                      class="sr-slider"
                      @input="setStorageAdjustment(row.key, $event.target.value)"
                    />
                    <span class="sr-slider-value">
                      {{ formatLooseQuantity(row.required, row.unit) }}
                      <span v-if="storagePackedEquivalent(row, row.required)" class="sr-pack-equiv">({{ storagePackedEquivalent(row, row.required) }})</span>
                    </span>
                    <button
                      v-if="row.adjusted"
                      type="button"
                      class="sr-inline-btn"
                      @click="clearStorageAdjustment(row.key)"
                    >{{ t('srReset') }}</button>
                  </div>
                </div>

                <div class="sr-values">
                  <span class="sr-value">
                    <span class="sr-value-label">{{ t('srStorageBuffer') }}</span>
                    <strong class="sr-value-num">{{ formatLooseQuantity(row.buffer, row.unit) }}</strong>
                    <span v-if="storagePackedEquivalent(row, row.buffer)" class="sr-pack-equiv">({{ storagePackedEquivalent(row, row.buffer) }})</span>
                  </span>
                  <span class="sr-value">
                    <span class="sr-value-label">{{ t('srStorageRemaining') }}</span>
                    <strong class="sr-value-num">{{ formatLooseQuantity(row.remaining, row.unit) }}</strong>
                    <span v-if="storagePackedEquivalent(row, row.remaining)" class="sr-pack-equiv">({{ storagePackedEquivalent(row, row.remaining) }})</span>
                  </span>
                  <span class="sr-value">
                    <span class="sr-value-label">{{ t('srStorageRequired') }}</span>
                    <strong class="sr-value-num" :class="{ 'sr-value-ok': !(row.required > 0) }">{{ formatLooseQuantity(row.required, row.unit) }}</strong>
                    <span v-if="storagePackedEquivalent(row, row.required)" class="sr-pack-equiv">({{ storagePackedEquivalent(row, row.required) }})</span>
                  </span>
                  <span class="sr-value sr-value-buy">
                    <span class="sr-value-label">{{ t('srStorageToOrder') }}</span>
                    <strong class="sr-value-num" :class="{ 'sr-value-ok': (storageBuyInfoByKey[row.key] || {}).covered }">{{ (storageBuyInfoByKey[row.key] || {}).main }}</strong>
                  </span>
                  <v-tooltip v-if="(storageBuyInfoByKey[row.key] || {}).sub" location="bottom" max-width="320">
                    <template #activator="{ props: helpProps }">
                      <v-icon
                        v-bind="helpProps"
                        size="14"
                        class="sr-values-help"
                        tabindex="0"
                        :aria-label="t('srValuesHelpTitle')"
                      >mdi-information-outline</v-icon>
                    </template>
                    <div class="sr-values-help-body">
                      <p>{{ storageBuyInfoByKey[row.key].sub }}</p>
                    </div>
                  </v-tooltip>
                </div>
              </div>
            </div>
          </template>
          </div>
          </v-expand-transition>

          <!-- Assistant — pied d'étape 1 : sticky à l'écran, pagination de la
               liste au centre, génération à droite. -->
          <footer class="sr-wizard-nav sr-wizard-nav-grid">
            <span class="sr-wizard-nav-side" aria-hidden="true" />
            <v-pagination
              v-if="stockTab === 'shops' && stockPageCount > 1"
              v-model="stockPage"
              :length="stockPageCount"
              :total-visible="5"
              density="compact"
              class="sr-wizard-nav-pagination"
            />
            <span v-else class="sr-wizard-nav-side" aria-hidden="true" />
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
              <!-- Bascule « Par shop / Par item » MASQUÉE (demande JLH 2026-08-04) :
                   la vue « Par shop » est buggée (split « Non rattachés au menu —
                   à remapper » qui bascule des PdV entiers en rouge, cf. la section
                   plus bas). Le réarmement ne sert donc plus que la vue « Par item ».
                   Le rendu « Par shop » est conservé mais inaccessible : réactiver =
                   restaurer ce segmented + le défaut `restockViewMode`. -->
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

          <!-- Vue « Par shop » — INACCESSIBLE depuis l'UI (bascule masquée plus haut,
               `restockViewMode` forcé à 'item'). Conservée telle quelle : le split
               « non rattachés » qu'elle porte doit être corrigé avant réactivation. -->
          <div
            v-if="restockGenerated && restockRows.length && restockViewMode === 'shop'"
            class="sr-table-groups"
          >
            <section
              v-for="group in pagedRestockGroups"
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
                      <span v-if="(row.sourceBreakdown || []).length < 2"><template v-if="row.sources && row.sources.length">{{ t('srUsedIn') }} </template>{{ sourceSummary(row) }}</span>
                      <ul v-else class="sr-source-breakdown">
                        <li class="sr-source-breakdown-head"><span>{{ t('srUsedIn') }}</span></li>
                        <li v-for="source in row.sourceBreakdown || []" :key="source.key">
                          <span>{{ source.name }}</span>
                          <span :title="t('srColTarget')">{{ formatLooseQuantity(source.quantity, row.unit) }}</span>
                        </li>
                      </ul>
                    </td>
                    <td :data-label="t('srColTarget')">{{ formatLooseQuantity(row.targetQuantity, row.unit) }}</td>
                    <td :data-label="t('srColRemaining')">{{ formatLooseQuantity(row.remainingQuantity, row.unit) }}</td>
                    <td :data-label="t('srColToDeposit')" class="sr-strong">
                      <!-- Ligne 1 : quantité et infobulle côte à côte (le
                           conditionnement détaillé passe en ligne 2). Sur un plan
                           chargé la quantité est corrigeable (décision 5) — la
                           feuille de course se rejoue sur les coefficients figés. -->
                      <span class="sr-deposit-main">
                        <span v-if="loadedPlanId" class="sr-deposit-edit">
                          <!-- Saisie en PAQUETS dès que le conditionnement se
                               résout (on ne dépose pas 1,2 sac) ; l'override reste
                               stocké en unités pour tout l'aval. -->
                          <NumberField
                            :model-value="depositFieldValue(row)"
                            :min="0"
                            :decimals="depositPackSize(row) ? 0 : 2"
                            :step="depositPackSize(row) ? 1 : null"
                            :disabled="!canWritePlans"
                            :aria-label="depositPackSize(row) ? t('srDepositPackAria') : t('srColToDeposit')"
                            class="sr-deposit-field"
                            @update:model-value="setLineOverridePacks(row, $event)"
                          />
                          <span v-if="depositPackSize(row)">{{ depositPackLabel(row) }}</span>
                          <v-icon
                            v-if="row.edited"
                            size="12"
                            class="sr-deposit-edited"
                            :title="t('srPlanLineEdited')"
                          >mdi-pencil</v-icon>
                        </span>
                        <template v-else>{{ formatRestockQuantity(row) }}</template>
                        <v-tooltip v-if="depositHelp(row)" location="bottom" max-width="300">
                          <template #activator="{ props: depositProps }">
                            <v-icon
                              v-bind="depositProps"
                              size="13"
                              class="sr-deposit-help"
                              tabindex="0"
                              :aria-label="t('srDepositHelpTitle')"
                            >mdi-information-outline</v-icon>
                          </template>
                          <div class="sr-values-help-body">{{ depositHelp(row) }}</div>
                        </v-tooltip>
                      </span>
                      <span v-if="depositPackCount(row) != null" class="sr-deposit-sub">{{ depositPackDetail(row) }}</span>
                    </td>
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
                        <span v-if="(row.sourceBreakdown || []).length < 2"><template v-if="row.sources && row.sources.length">{{ t('srUsedIn') }} </template>{{ sourceSummary(row) }}</span>
                        <ul v-else class="sr-source-breakdown">
                          <li class="sr-source-breakdown-head"><span>{{ t('srUsedIn') }}</span></li>
                          <li v-for="source in row.sourceBreakdown || []" :key="source.key">
                            <span>{{ source.name }}</span>
                            <span :title="t('srColTarget')">{{ formatLooseQuantity(source.quantity, row.unit) }}</span>
                          </li>
                        </ul>
                      </td>
                      <td :data-label="t('srColTarget')">{{ formatLooseQuantity(row.targetQuantity, row.unit) }}</td>
                      <td :data-label="t('srColRemaining')">{{ formatLooseQuantity(row.remainingQuantity, row.unit) }}</td>
                      <td :data-label="t('srColToDeposit')" class="sr-strong">
                      <!-- Ligne 1 : quantité et infobulle côte à côte (le
                           conditionnement détaillé passe en ligne 2). Sur un plan
                           chargé la quantité est corrigeable (décision 5) — la
                           feuille de course se rejoue sur les coefficients figés. -->
                      <span class="sr-deposit-main">
                        <span v-if="loadedPlanId" class="sr-deposit-edit">
                          <!-- Saisie en PAQUETS dès que le conditionnement se
                               résout (on ne dépose pas 1,2 sac) ; l'override reste
                               stocké en unités pour tout l'aval. -->
                          <NumberField
                            :model-value="depositFieldValue(row)"
                            :min="0"
                            :decimals="depositPackSize(row) ? 0 : 2"
                            :step="depositPackSize(row) ? 1 : null"
                            :disabled="!canWritePlans"
                            :aria-label="depositPackSize(row) ? t('srDepositPackAria') : t('srColToDeposit')"
                            class="sr-deposit-field"
                            @update:model-value="setLineOverridePacks(row, $event)"
                          />
                          <span v-if="depositPackSize(row)">{{ depositPackLabel(row) }}</span>
                          <v-icon
                            v-if="row.edited"
                            size="12"
                            class="sr-deposit-edited"
                            :title="t('srPlanLineEdited')"
                          >mdi-pencil</v-icon>
                        </span>
                        <template v-else>{{ formatRestockQuantity(row) }}</template>
                        <v-tooltip v-if="depositHelp(row)" location="bottom" max-width="300">
                          <template #activator="{ props: depositProps }">
                            <v-icon
                              v-bind="depositProps"
                              size="13"
                              class="sr-deposit-help"
                              tabindex="0"
                              :aria-label="t('srDepositHelpTitle')"
                            >mdi-information-outline</v-icon>
                          </template>
                          <div class="sr-values-help-body">{{ depositHelp(row) }}</div>
                        </v-tooltip>
                      </span>
                      <span v-if="depositPackCount(row) != null" class="sr-deposit-sub">{{ depositPackDetail(row) }}</span>
                    </td>
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
              v-for="group in pagedRestockGroups"
              :key="group.itemKey"
              class="sr-table-group"
            >
              <header class="sr-group-head">
                <div>
                  <h3>{{ group.itemName }}</h3>
                  <span
                    v-if="(group.sourceBreakdown || []).length < 2 && groupSourceSummary(group)"
                    style="display:block;font-size:0.72rem;color:var(--sr-muted, #64748b);font-weight:500;margin-top:2px;"
                  >{{ t('srUsedIn') }} {{ groupSourceSummary(group) }}</span>
                  <ul v-else-if="(group.sourceBreakdown || []).length >= 2" class="sr-source-breakdown">
                    <li class="sr-source-breakdown-head"><span>{{ t('srUsedIn') }}</span></li>
                    <li v-for="source in group.sourceBreakdown || []" :key="source.key">
                      <span>{{ source.name }}</span>
                      <span :title="t('srColTarget')">{{ formatLooseQuantity(source.quantity, source.unit) }}</span>
                    </li>
                  </ul>
                </div>
                <div class="sr-group-head-end">
                  <span>{{ group.rows.length }} {{ group.rows.length > 1 ? t('srShopPlural') : t('srShopSingular') }}</span>
                  <button
                    type="button"
                    class="sr-inline-btn"
                    @click="setGroupRestocked(group, !isGroupRestocked(group))"
                  >{{ isGroupRestocked(group) ? t('srUncheckAll') : t('srConfirmAll') }}</button>
                </div>
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
                    <td :data-label="t('srColTarget')">{{ formatLooseQuantity(row.targetQuantity, row.unit) }}</td>
                    <td :data-label="t('srColRemaining')">{{ formatLooseQuantity(row.remainingQuantity, row.unit) }}</td>
                    <td :data-label="t('srColToDeposit')" class="sr-strong">
                      <!-- Ligne 1 : quantité et infobulle côte à côte (le
                           conditionnement détaillé passe en ligne 2). Sur un plan
                           chargé la quantité est corrigeable (décision 5) — la
                           feuille de course se rejoue sur les coefficients figés. -->
                      <span class="sr-deposit-main">
                        <span v-if="loadedPlanId" class="sr-deposit-edit">
                          <!-- Saisie en PAQUETS dès que le conditionnement se
                               résout (on ne dépose pas 1,2 sac) ; l'override reste
                               stocké en unités pour tout l'aval. -->
                          <NumberField
                            :model-value="depositFieldValue(row)"
                            :min="0"
                            :decimals="depositPackSize(row) ? 0 : 2"
                            :step="depositPackSize(row) ? 1 : null"
                            :disabled="!canWritePlans"
                            :aria-label="depositPackSize(row) ? t('srDepositPackAria') : t('srColToDeposit')"
                            class="sr-deposit-field"
                            @update:model-value="setLineOverridePacks(row, $event)"
                          />
                          <span v-if="depositPackSize(row)">{{ depositPackLabel(row) }}</span>
                          <v-icon
                            v-if="row.edited"
                            size="12"
                            class="sr-deposit-edited"
                            :title="t('srPlanLineEdited')"
                          >mdi-pencil</v-icon>
                        </span>
                        <template v-else>{{ formatRestockQuantity(row) }}</template>
                        <v-tooltip v-if="depositHelp(row)" location="bottom" max-width="300">
                          <template #activator="{ props: depositProps }">
                            <v-icon
                              v-bind="depositProps"
                              size="13"
                              class="sr-deposit-help"
                              tabindex="0"
                              :aria-label="t('srDepositHelpTitle')"
                            >mdi-information-outline</v-icon>
                          </template>
                          <div class="sr-values-help-body">{{ depositHelp(row) }}</div>
                        </v-tooltip>
                      </span>
                      <span v-if="depositPackCount(row) != null" class="sr-deposit-sub">{{ depositPackDetail(row) }}</span>
                    </td>
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
          <!-- Assistant — pied d'étape 2 : sticky, précédent | pagination des
               groupes | générer la feuille. -->
          <footer class="sr-wizard-nav sr-wizard-nav-grid">
            <v-btn variant="text" @click="goToStep(1)">
              <v-icon size="16" class="mr-1">mdi-chevron-left</v-icon>
              {{ t('srPrevious') }}
            </v-btn>
            <v-pagination
              v-if="restockPageCount > 1"
              v-model="restockPage"
              :length="restockPageCount"
              :total-visible="5"
              density="compact"
              class="sr-wizard-nav-pagination"
            />
            <span v-else class="sr-wizard-nav-side" aria-hidden="true" />
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
            v-if="shoppingGenerated && displayedUnmatchedStorage.length"
            type="warning"
            density="compact"
            variant="tonal"
            class="sr-storage-warn"
          >
            {{ t('srStorageUnmatchedWarn') }}
            <strong>{{ displayedUnmatchedStorage.map((e) => e.name || e.itemId).join(', ') }}</strong>
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
              v-for="supplier in pagedShoppingGroups"
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
          <!-- Assistant — pied d'étape 3 : sticky, précédent | pagination des
               fournisseurs (export/impression dans l'en-tête). -->
          <footer class="sr-wizard-nav sr-wizard-nav-grid">
            <v-btn variant="text" @click="goToStep(2)">
              <v-icon size="16" class="mr-1">mdi-chevron-left</v-icon>
              {{ t('srPrevious') }}
            </v-btn>
            <v-pagination
              v-if="shoppingPageCount > 1"
              v-model="shoppingPage"
              :length="shoppingPageCount"
              :total-visible="5"
              density="compact"
              class="sr-wizard-nav-pagination"
            />
            <span v-else class="sr-wizard-nav-side" aria-hidden="true" />
            <span class="sr-wizard-nav-side" aria-hidden="true" />
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

    <!-- Nommage d'un nouveau plan (sauvegarde explicite). -->
    <v-dialog v-model="planSaveDialog.show" max-width="440">
      <v-card>
        <v-card-title class="sr-plan-dialog-title">{{ t('srSavePlan') }}</v-card-title>
        <v-card-text>
          <v-text-field
            v-model="planSaveDialog.name"
            :label="t('srPlanName')"
            :placeholder="t('srPlanNamePlaceholder')"
            density="compact"
            variant="outlined"
            hide-details
            autofocus
            @keydown.enter.prevent="confirmSavePlan"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="planSaveDialog.show = false">{{ t('srPlanRenameCancel') }}</v-btn>
          <v-btn color="primary" variant="flat" :disabled="!planSaveDialog.name.trim()" @click="confirmSavePlan">
            {{ t('srSavePlan') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Conflit : mutation invalidante avec un plan chargé — 3 issues
         (ADR-0005 : une photo n'est jamais recalculée en silence). -->
    <v-dialog v-model="planGuardDialog.show" max-width="480" persistent>
      <v-card>
        <v-card-title class="sr-plan-dialog-title">{{ t('srPlanDetachTitle') }}</v-card-title>
        <v-card-text>{{ t('srPlanDetachBody') }}</v-card-text>
        <v-card-actions class="sr-plan-guard-actions">
          <v-btn variant="text" @click="resolvePlanGuard('cancel')">{{ t('srPlanDetachCancel') }}</v-btn>
          <v-spacer />
          <v-btn variant="outlined" @click="resolvePlanGuard('discard')">{{ t('srPlanDetachContinue') }}</v-btn>
          <v-btn
            v-if="canWritePlans"
            color="primary"
            variant="flat"
            @click="resolvePlanGuard('save')"
          >
            {{ t('srPlanDetachSave') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar v-model="snackbar" :color="snackbarColor" timeout="3500">
      {{ snackbarText }}
    </v-snackbar>

    <!-- fiche 314-01 — édition du Market Price (fournisseur/prix) depuis l'étape 1,
         MÊME drawer que l'écran Market Prices (item = row = la ligne MarketPrice
         brute du store inventory). Au save : invalidation + rechargement du
         catalogue prix, le nom fournisseur affiché suit. -->
    <MarketPriceEditSupplierDrawer
      v-model="supplierEditDialog"
      :item="supplierEditRow"
      :row="supplierEditRow"
      :suppliers="bomSuppliers.length ? bomSuppliers : suppliers"
      :good-type-options="drawerGoodTypeOptions"
      :product-categories="drawerProductCategories"
      @saved="onSupplierSaved"
    />
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
  computeRestockOutcome,
  aggregateRestockOutcomesByItem,
  coveredQuantityForPackaging,
  packSizeForPackaging,
  packCountForQuantity,
  pluralizePackLabel,
  roundForUnit,
  ceilForUnit,
  deriveSelectedMenuItemsByShop,
  findStockReference,
} from '@/utils/stockPlanning'
// BOM (achats/production) : explosion des plats en ingrédients, indépendamment
// de readyForSale. Recettes lues via le BATCH POST /menu-items/recipes (un appel,
// BUG-294-01 — le fan-out /menu-items/:id déclenchait le rate limit 429) ; le
// détail /menu-items/:id ne sert plus qu'au repli borné si le batch échoue.
import { normalizeRecipe, normalizeRecipeFromBatch, buildIngredientRequirements } from '@/utils/bomPlanning'
import { hydrateSubComponents } from '@/utils/componentCatalog'
import { getMenuItemById, getMenuItemRecipes } from '@/api/endpoints/menu-item.api'
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
import { consumeFromPool, preparePool, orderQuantitiesByItemKey } from '@/utils/stockNetting'
// DB locale (localStorage) — persiste l'état réarmement sans backend.
import * as localDb from '@/data/localDb'
import {
  getRestockState,
  putRestockState,
  isRestockApiDown,
  onRestockApiError,
} from '@/api/endpoints/restock.api'
// Plans de réappro nommés (RestockPlan, ADR-0005) : photo figée des 3 étapes,
// rejouée depuis la photo — jamais depuis le catalogue vivant.
import {
  buildPlanSnapshot,
  buildRecipeCoeffs,
  applyPlanEdits,
  recomputeShoppingFromOverrides,
  estimateSnapshotBytes,
} from '@/utils/restockPlanSnapshot'
import { useRestockPlans } from '@/composables/useRestockPlans'
import { useStorageInventory } from '@/composables/useStorageInventory'
// Taxonomie builder2 (module de constantes pur) : 'Storage'/'storage_x'/code
// département → 'storage'. Le blob de config v1 porte des types déjà en
// minuscules ; les éléments v2 non — normaliser AVANT de filtrer.
import { normalizeType } from '@/components/spaces/views/builder2/constants/elementTaxonomy'
import MarketPriceEditSupplierDrawer from '@/components/menu-fb/views/market-prices/drawers/MarketPriceEditSupplierDrawer.vue'
import RestockPlansPanel from '@/components/restock/RestockPlansPanel.vue'
import NumberField from '@/components/common/NumberField.vue'
import { isDemoMode } from '@/utils/demoMode'

// Garde-fou client AVANT le POST d'un plan — marge sous la garde backend
// (restock-plans.service.ts : 1 000 000). Même métrique (JSON.stringify).
const PLAN_MAX_BYTES = 900_000

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

export default {
  name: 'SpaceRestockView',
  components: { WorkspaceToolSelect, RestockEventScenarioPicker, AppSearchBar, WorkspacePanelToggle, WorkspaceAppHeader, RestockPlansPanel, NumberField, MarketPriceEditSupplierDrawer },
  setup() {
    const store = useStore()
    const route = useRoute()
    const router = useRouter()
    const { t } = useI18n()
    // Historique des plans (REST autoritaire, sans miroir localStorage).
    // Refs exposées à plat pour l'auto-unwrap Options API ; `plansApi` porte
    // les méthodes (refresh/load/create/…).
    const plansApi = useRestockPlans()
    // fiche 314-01 — stock tampon des espaces de stockage (builder state projeté).
    const storageInvApi = useStorageInventory()
    return {
      store, route, router, t,
      plansApi,
      plans: plansApi.plans,
      plansLoading: plansApi.loading,
      plansAvailable: plansApi.available,
      plansError: plansApi.error,
      loadStorageInventory: storageInvApi.loadStorageInventory,
      storageInventoryFor: storageInvApi.storageInventoryFor,
    }
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
      // BUG-291-02 — articles IMPOSSIBLES À PRODUIRE côté serveur (recette
      // absente / ingrédient bloqué) : exclus du réarmement, eux et leurs
      // ingrédients. Index PLAT `{ ids: [], names: [] }` au niveau ESPACE
      // (correctif v2) : `available` est calculé par espace côté serveur, et la
      // jointure par nom de shop de la v1 ratait en silence sur les configs
      // synthétiques (`buildSyntheticConfig` peut poser un id brut en `name`).
      unavailableStockItems: null,
      _restockUnavailableCache: null,
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
      // sur le miroir localStorage. manualQuantities : colonne BDD prioritaire,
      // miroir local en repli (versions antérieures à la migration 20260625).
      bddVersionsByEventId: {},
      // Méta des records lus depuis localStorage (ajustements % + menuConfig)
      // par évènement, pour reproduire les quantités EventPredict.
      predictionMetaByEventId: {},
      stockSearch: '',
      // Pagination des 3 étapes (contrôles centrés dans les pieds sticky) :
      // étape 1 = articles, étape 2 = groupes (PDV ou article), étape 3 =
      // fournisseurs.
      stockPage: 1,
      stockPageSize: 20,
      restockPage: 1,
      shoppingPage: 1,
      groupPageSize: 10,
      restockSearch: '',
      shoppingSearch: '',
      mobileConfigSheet: false,
      stockAdjustments: {},
      stockPackedModes: {},
      stockExcluded: {}, // itemKeys décochés → exclus de la génération du réarmement
      // fiche 314-01 — étape 1 : onglet actif ('shops' | 'storage') et overrides
      // ABSOLUS (unités) du nécessaire par ligne storage. Clé =
      // `storage:${elementId}:${normalizeStr(name)}` ; absent = défaut
      // max(0, tampon − restant). Persisté dans RestockState (extras).
      stockTab: 'shops',
      storageAdjustments: {},
      // fiche 314-01 — drawer d'édition Market Price (Item Supplier Name).
      supplierEditDialog: false,
      supplierEditRow: null,
      _restockPutTimer: null, // debounce du PUT /restock-state (non réactif)
      predictionRecordsByEventId: {},
      previousInventoryCounts: {},
      previousInventoryEvent: null,
      restockGenerated: false,
      shoppingGenerated: false,
      // Vue « Par shop » masquée (JLH 2026-08-04) : seule 'item' est servie tant
      // que le split « non rattachés au menu » n'est pas corrigé.
      restockViewMode: 'item',
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
      // BUG-292-01 — catalogue composants AVEC leur recette (`subComponents`).
      // `store.analyse.components` vient de la LISTE /menu-components, qui ne la
      // porte pas : sans cette hydratation, la feuille de course achèterait « de
      // la sauce pickle » au lieu de son vinaigre et de son ail. Hydraté une fois,
      // à l'entrée du mode ingrédients (cf. ensureRecipesLoaded).
      hydratedComponents: [],
      componentsHydrated: false,
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
      // --- Plan chargé (RestockPlan, ADR-0005) ---
      // Distinct de l'état de session : tant que loadedPlanId est posé, les
      // 3 étapes affichent la PHOTO du plan (aiguillage stockSettingsRows /
      // restockRows / shoppingGroups), jamais le calcul vivant.
      loadedPlanId: null,
      loadedPlan: null, // photo complète (GET /restock-plans/:id)
      lineOverrides: {}, // rowKey → quantité « À déposer » corrigée
      planDirty: false, // correction non enregistrée sur le plan chargé
      // Guard : true pendant loadPlan — neutralise resetGeneratedOutputs et
      // ensureStockItemDefaults (sinon les watchers détruisent le plan posé).
      loadingPlan: false,
      // Dialogue de sauvegarde (nommage) et dialogue de conflit (3 issues).
      planSaveDialog: { show: false, name: '' },
      planGuardDialog: { show: false, resolver: null },
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
    // ── fiche 314-01 — onglet « Espaces de stockage » ────────────────────────
    /** Id d'espace pour le builder state (id résolu, repli slug d'URL). */
    storageSpaceId() {
      return String(this.currentSpace?.id || this.route.params?.spaceId || '')
    },
    /** Projection builder state (store storageInventory) : tous les éléments. */
    storageBuilderElements() {
      return this.store.getters['storageInventory/forSpace'](this.storageSpaceId)
    },
    storageInventoryLoading() {
      return this.store.getters['storageInventory/isFetching'](this.storageSpaceId)
    },
    /**
     * Groupes de l'onglet Espaces de stockage : un groupe par élément Storage
     * des configs objectif (même source que le pool de netting), lignes = stock
     * tampon saisi dans la section Inventaire du 3D Builder (lecture seule ici,
     * le PUT inventaire est full-replace côté Builder).
     *  - tampon   = row.quantity (Builder)
     *  - restant  = comptages agrégés de l'élément (aggregateCountsForElements,
     *               identité id puis nom — même cascade que le netting)
     *  - nécessaire (défaut) = max(0, tampon − restant BRUT) ; override slider
     *    absolu (storageAdjustments), plafonné à 5× le tampon (spec PDF).
     * Seuils Builder : minStock/maxStock → alertes à 10 % près (B3, front only).
     */
    /** Ids (String) des configs objectif résolues. */
    resolvedObjectiveConfigIds() {
      const ids = new Set()
      this.resolvedObjectiveConfigs.forEach(({ configuration }) => {
        if (configuration?.id != null) ids.add(String(configuration.id))
      })
      return ids
    },
    /**
     * Éléments Storage affichés : UNION de deux découvertes —
     *  1. blob de config (collectStorageElements, `type === 'storage'` strict,
     *     chemin v1 historique du pool de netting) ;
     *  2. builder state (type NORMALISÉ 'storage' + adhésion à une config
     *     objectif ; adhésions inconnues = inclus). Le blob v2 porte des types
     *     'Storage'/code département que le chemin 1 rate — cause du faux
     *     « aucun espace de stockage » constaté sur Auxerre (2 storages réels).
     * Si le filtre d'adhésion élimine TOUT (id de config v1 ≠ id builder), on
     * retombe sur tous les storages de l'espace plutôt que sur un écran vide.
     */
    storageDisplayElements() {
      const out = new Map() // elId → { id, name }
      this.resolvedObjectiveConfigs.forEach(({ configuration }) => {
        collectStorageElements(configuration).forEach((el) => {
          if (el?.id != null) out.set(String(el.id), { id: String(el.id), name: el.name || '' })
        })
      })
      const cfgIds = this.resolvedObjectiveConfigIds
      const builderStorages = this.storageBuilderElements.filter(
        (e) => normalizeType(e.type) === 'storage',
      )
      const members = builderStorages.filter(
        (e) => e.configIds == null || e.configIds.some((id) => cfgIds.has(id)),
      )
      ;(members.length ? members : builderStorages).forEach((e) => {
        if (!out.has(e.id)) out.set(e.id, { id: e.id, name: e.name })
      })
      return Array.from(out.values())
    },
    storageRestockGroups() {
      const groups = []
      const elementsById = new Map(this.storageBuilderElements.map((e) => [e.id, e]))
      const cfgIds = Array.from(this.resolvedObjectiveConfigIds)
      // Lignes d'inventaire Builder pour cet élément : configs objectif d'abord,
      // puis clé '' (non scopé), puis — tolérance id de config v1 ≠ id builder —
      // l'unique config porteuse si UNE SEULE a des lignes.
      const pickInventoryRows = (byConfig) => {
        for (const id of cfgIds) {
          if ((byConfig[id] || []).length) return byConfig[id]
        }
        if ((byConfig[''] || []).length) return byConfig['']
        const keys = Object.keys(byConfig).filter((k) => (byConfig[k] || []).length)
        return keys.length === 1 ? byConfig[keys[0]] : []
      }
      this.storageDisplayElements.forEach((el) => {
          const elId = el.id
          const builderEl = elementsById.get(elId)
          const invRows = pickInventoryRows(builderEl?.inventoryByConfig || {})
          // Comptages de CET élément, identité résolue (itemId/sourceId/nom).
          const counted = this.aggregateCountsForElements([elId])
          const rows = invRows
            .filter((r) => {
              if (!r || !r.name) return false
              const buffer = Number(r.quantity) || 0
              // Ligne utile = tampon saisi, OU seuils posés (alertes), OU stock
              // compté présent — le reste est du bruit de catalogue.
              return buffer > 0 || r.minStock != null || r.maxStock != null
            })
            .map((r) => {
              const buffer = Number(r.quantity) || 0
              const wantId = r.menuItemId != null ? String(r.menuItemId) : null
              const wantName = normalizeStr(r.name)
              const remaining = counted
                .filter(
                  (c) =>
                    (wantId && (c.itemId === wantId || c.sourceId === wantId)) ||
                    (wantName && normalizeStr(c.name) === wantName),
                )
                .reduce((sum, c) => sum + c.qty, 0)
              const defaultRequired = Math.max(0, buffer - remaining)
              const key = `storage:${elId}:${wantName}`
              const overrideRaw = this.storageAdjustments[key]
              const hasOverride = overrideRaw != null && overrideRaw !== ''
              const required = hasOverride
                ? Math.max(0, Number(overrideRaw) || 0)
                : defaultRequired
              const minStock = r.minStock != null ? Number(r.minStock) : null
              const maxStock = r.maxStock != null ? Number(r.maxStock) : null
              return {
                key,
                elementId: elId,
                name: r.name,
                unit: r.unit || '',
                menuItemId: wantId,
                buffer,
                remaining,
                defaultRequired,
                required,
                adjusted: hasOverride,
                // Plafond 5× tampon (spec) — jamais sous la valeur courante ni 1.
                sliderMax: Math.max(Math.ceil(5 * buffer), required, 1),
                nearMax: maxStock > 0 && remaining >= 0.9 * maxStock,
                nearMin: minStock != null && remaining <= 1.1 * minStock,
              }
            })
          groups.push({
            elementId: elId,
            elementName: builderEl?.name || el?.name || '',
            rows,
          })
      })
      // Tous les groupes sont rendus, même sans ligne : un storage sans tampon
      // affiche son message dédié (srStorageNoBuffer) plutôt que de disparaître.
      return groups
    },
    /** Compteur d'alertes seuils (badge de l'onglet). */
    storageAlertCount() {
      let n = 0
      this.storageRestockGroups.forEach((g) =>
        g.rows.forEach((r) => {
          if (r.nearMin || r.nearMax) n += 1
        }),
      )
      return n
    },
    /** Rang « À commander » mémoïsé par ligne storage (pattern buyInfoByItem). */
    storageBuyInfoByKey() {
      const out = {}
      this.storageRestockGroups.forEach((group) =>
        group.rows.forEach((row) => {
          out[row.key] = this.storageBuyInfo(row)
        }),
      )
      return out
    },
    /**
     * Conditionnement « Information inventaire » mémoïsé par ligne storage —
     * résolu UNE fois par ligne (la résolution balaye les catalogues), puis
     * consommé par storagePackedEquivalent pour chaque cellule affichée.
     * Quantité 1 : seule la taille du colis compte ici, pas packedCount.
     *
     * Les Market Prices sont ajoutés au balayage POUR CES LIGNES SEULEMENT :
     * une réserve saisie dans le Builder est une ligne libre (`isCustom`, pas de
     * menuItemId) dont le nom ne correspond à aucune recette — « Coca-Cola
     * Original - CAN 33CL » n'existe que côté catalogue d'achat, qui porte
     * justement le conditionnement (inventoryPackaging + packedUnits). Les
     * lignes PDV gardent la résolution recette, inchangée.
     */
    storagePackagingByKey() {
      const out = {}
      this.storageRestockGroups.forEach((group) =>
        group.rows.forEach((row) => {
          out[row.key] = computePackagingForQuantity(
            { itemId: row.menuItemId || undefined, itemName: row.name, unit: row.unit },
            1,
            this.ingredients,
            this.components,
            this.menuItems,
            this.marketPrices,
          )
        }),
      )
      return out
    },
    /**
     * Lignes de RÉAPPRO STORAGE prêtes pour la feuille de course : une par
     * ligne avec nécessaire > 0, fournisseur résolu par la même cascade que le
     * mode ingrédients (resolveIngredientSupplier). Consommé par nettedShopping.
     */
    storageRefillLines() {
      const lines = []
      this.storageRestockGroups.forEach((group) => {
        group.rows.forEach((row) => {
          if (!(row.required > 0)) return
          const ref = findStockReference(
            { itemId: row.menuItemId || undefined, itemName: row.name },
            this.ingredients,
            this.components,
            this.menuItems,
          )
          const isMenuItem = !!ref && this.menuItems.some((m) => m.id === ref.id)
          const supplier = this.resolveIngredientSupplier({
            itemType: isMenuItem ? 'MenuItem' : 'Ingredient',
            supplierId: ref?.supplierId || ref?.supplier?.id || null,
            marketPriceId: ref?.marketPriceId || ref?.marketPrice?.id || null,
            sourceId: ref?.sourceId != null ? ref.sourceId : ref?.id || null,
            key: ref?.id || null,
          })
          lines.push({
            itemKey: row.key,
            itemName: row.name,
            unit: row.unit || ref?.unit || '',
            itemId: row.menuItemId || (ref?.id != null ? String(ref.id) : null),
            sourceId: ref?.sourceId != null ? String(ref.sourceId) : null,
            storageRefill: row.required,
            fromStorage: true,
            storageName: group.elementName,
            supplier,
          })
        })
      })
      return lines
    },
    // ── fiche 314-01 — Item Supplier Name (onglet PDV à stocker) ─────────────
    /** Options Good Type/Category du drawer (mêmes stores que Market Prices —
     *  fetch déclenché à l'ouverture, cf. openSupplierEdit + le drawer). */
    drawerGoodTypeOptions() {
      return (this.store.getters['marketPriceTypes/marketPriceTypes'] || [])
        .map((t) => t?.name)
        .filter(Boolean)
    },
    drawerProductCategories() {
      return this.store.getters['productCategories/productCategories'] || []
    },
    /** Droit d'édition des Market Prices (même clé que la route dédiée). */
    canEditMarketPrices() {
      const can = this.store.getters['auth/can']
      return typeof can === 'function' ? !!can('menu.fb.marketPrices') : false
    },
    /**
     * Fournisseur affiché par ligne de la page courante (pattern buyInfoByItem,
     * mémoïsé). Même cascade que la feuille de course : findStockReference puis
     * marketPriceId → marketPrices. `marketPriceRow` = ligne brute du store
     * inventory, passée telle quelle au drawer d'édition.
     */
    supplierInfoByItem() {
      const out = {}
      for (const item of this.pagedStockSettingsRows) {
        const ref = findStockReference(item, this.ingredients, this.components, this.menuItems)
        if (!ref) continue
        let marketPriceId = ref.marketPriceId || ref.marketPrice?.id || null
        let supplierId = ref.supplierId || ref.supplier?.id || null
        const mp = marketPriceId
          ? this.marketPrices.find((m) => m.id === marketPriceId) || null
          : null
        if (!supplierId && mp) supplierId = mp.supplierId || mp.supplier?.id || mp.supplier
        const supplier =
          (this.bomSuppliers.find((s) => s.id === supplierId) ||
            this.suppliers.find((s) => s.id === supplierId)) ??
          null
        const supplierName =
          supplier?.name || mp?.supplierRel?.name || mp?.supplier?.name || null
        if (!supplierName && !mp) continue
        out[item.itemKey] = {
          supplierName: supplierName || this.t('srSupplierUndefined'),
          marketPriceRow: mp,
        }
      }
      return out
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
          unavailableItems: this.unavailableStockItems,
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
    /** Étape 1 — calcul VIVANT (catalogue + prédictions du moment). */
    liveStockSettingsRows() {
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
    /**
     * Étape 1 affichée : PHOTO du plan chargé, sinon calcul vivant. Les lignes
     * figées (stockLines) ne portent ni sources ni recipeComponents — l'étape 1
     * d'un plan est volontairement gelée (relancer une génération passe par le
     * dialogue de détachement, cf. guardPlanEdit).
     */
    stockSettingsRows() {
      if (!this.loadedPlan) return this.liveStockSettingsRows
      return (this.loadedPlan.stockLines || []).map((line) => ({
        ...line,
        itemId: null,
        sourceId: null,
        shopIds: new Set(),
        shopCount: 0,
        sources: [],
        sourceNames: [],
        recipeComponents: [],
      }))
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
    /** Pagination de la liste étape 1 (pied de carte, contrôles au centre). */
    stockPageCount() {
      return Math.max(1, Math.ceil(this.filteredStockSettingsRows.length / this.stockPageSize))
    },
    pagedStockSettingsRows() {
      const start = (this.stockPage - 1) * this.stockPageSize
      return this.filteredStockSettingsRows.slice(start, start + this.stockPageSize)
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
    /**
     * Étape 2 — calcul VIVANT (catalogue + comptages du moment), TOUTES lignes
     * (BUG-296-01 : la ventilation étape 1 a besoin des lignes à dépôt nul et
     * des articles exclus — le filtre d'affichage vit dans liveRestockRows).
     */
    liveRestockRowsAll() {
      return this.stockRowsRaw.map((row) => {
        const targetQuantity = this.adjustedQuantity(row.totalQuantity, row.unit, row.itemKey)
        // Packaging de référence (taille de colis) pour décoder le comptage
        // packed/loose — la taille ne dépend pas de la quantité passée.
        const packagingRef = this.packagingForItem(row, targetQuantity)
        const remainingQuantity = this.remainingQuantityForRow(row, packagingRef)
        const rawGap = Math.max(0, targetQuantity - remainingQuantity)
        // Le packedCount porte sur le MANQUE (ce qu'on dépose), pas sur la cible.
        const packaging = this.packagingForItem(row, rawGap)
        // Un article conditionné se réarme en colis ENTIERS : la quantité
        // suggérée est la couverture des colis (0,7 kg en paquets de 0,5 kg →
        // 2 paquets → 1 kg). Sans « Inventory Information », arrondi historique.
        // Lot 4 — sans conditionnement, arrondi au SUPÉRIEUR : `roundForUnit`
        // ramenait 0,64 kg de manque à 0,6 kg déposé, donc un manque non couvert.
        const restockQuantity = packaging
          ? coveredQuantityForPackaging(packaging)
          : ceilForUnit(rawGap, row.unit)
        return {
          ...row,
          rowKey: `${row.shopId}|||${row.itemKey}`,
          targetQuantity,
          remainingQuantity,
          restockQuantity,
          packaging,
          // BUG-296-01 : gap / surplusLoose (reste en vrac) / finalStock
          // (stock final prévu) portés par chaque ligne, formule unique.
          ...computeRestockOutcome({ targetQuantity, remainingQuantity, restockQuantity }),
          // BUG-288-01 : détail « utilisé dans » par menu item. Les parts portent
          // sur le BESOIN (targetQuantity), pas sur « À déposer » — le restant du
          // PDV n'est pas attribuable à un plat plutôt qu'à un autre.
          sourceBreakdown: this.buildSourceBreakdown(row),
        }
      })
    },
    /** Étape 2 affichable : lignes à déposer, hors articles exclus. */
    liveRestockRows() {
      return this.liveRestockRowsAll.filter(
        (row) => row.restockQuantity > 0 && !this.stockExcluded[row.itemKey],
      )
    },
    /**
     * BUG-296-01, réduit au Lot 2 — agrégat grain ARTICLE pour l'étape 1.
     * L'affichage n'en lit plus que predictedQuantity / remainingQuantity /
     * targetQuantity (les autres champs restent calculés : étape 2 et snapshot
     * de plan les consomment toujours).
     * Plan chargé : valeurs FIGÉES des stockLines (absentes sur les plans
     * sauvegardés avant le changement → bloc masqué) ; sinon agrégat vivant.
     */
    stockOutcomeByItem() {
      if (this.loadedPlan) {
        const byItem = {}
        ;(this.loadedPlan.stockLines || []).forEach((line) => {
          if (line && line.itemKey != null && line.gap !== undefined) byItem[line.itemKey] = line
        })
        return byItem
      }
      return aggregateRestockOutcomesByItem(this.liveRestockRowsAll)
    },
    /**
     * Lot 2 — « À commander » par article (étape 1) : max(0, besoin net des
     * shops − Storage), netting par IDs (BUG-299-01) sur un pool DÉDIÉ
     * (`preparePool` clone les entrées — aucune interférence avec
     * `nettedShopping`). Toujours au grain article, quel que soit
     * `shoppingMode` : en produits finis (recherche étape 3 vide), identique au
     * `buyQuantity` de la feuille de course ; en ingrédients, lecture
     * « article » du même besoin (l'étape 3, elle, nette au grain ingrédient).
     * `need` = coveredQuantity de l'agrégat (Σ restockQuantity, arrondie en
     * colis par PDV) — même grandeur que `item.quantity` à l'étape 3.
     * Tri par itemName = ordre de consommation de l'étape 3 : si deux articles
     * matchent la même entrée Storage (consumeFromPool consomme tout), le cas
     * limite tombe du même côté. Article décoché → absent de la map → « — ».
     * Plan chargé → null (la photo ne porte pas de buyQuantity par article).
     * Coût O(articles × entrées Storage), mémoïsé — le template ne fait que
     * des lookups O(1), jamais de netting dans la boucle v-for.
     */
    /**
     * Lot 3 — rang ACHAT prêt à afficher, pour la PAGE COURANTE seulement.
     * Mémoïsé : le template lit 5 champs par ligne, et `buyInfo` résout un
     * packaging (parcours des catalogues) — l'appeler depuis le template le
     * referait à chaque lecture et à chaque re-render.
     */
    buyInfoByItem() {
      const out = {}
      for (const item of this.pagedStockSettingsRows) out[item.itemKey] = this.buyInfo(item)
      return out
    },
    stockOrderByItem() {
      if (this.loadedPlan) return null
      const outcomes = this.stockOutcomeByItem
      const items = this.liveStockSettingsRows
        .filter((row) => !this.stockExcluded[row.itemKey])
        .map((row) => ({
          itemKey: row.itemKey,
          itemId: row.itemId,
          sourceId: row.sourceId,
          itemName: row.itemName,
          unit: row.unit,
          need: outcomes[row.itemKey]?.coveredQuantity ?? 0,
        }))
        .sort((a, b) => String(a.itemName).localeCompare(String(b.itemName)))
      const storagePool = preparePool(this.aggregateCountsForElements(this.storageElementIds))
      return orderQuantitiesByItemKey(items, storagePool)
    },
    /**
     * Étape 2 affichée : PHOTO du plan (avec corrections « À déposer »
     * appliquées via les valeurs figées), sinon calcul vivant. Les ~10
     * consommateurs aval (filtres, groupes, compteurs, exports, impression)
     * passent tous par ici — aucun d'eux ne distingue figé/vivant.
     */
    restockRows() {
      if (!this.loadedPlan) return this.liveRestockRows
      return applyPlanEdits(this.loadedPlan.restockLines || [], this.lineOverrides)
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
      // Détail « utilisé dans » cumulé sur tous les PDV du groupe (BUG-288-01).
      groups.forEach((group) => {
        const byName = new Map()
        group.rows.forEach((row) => {
          ;(row.sourceBreakdown || []).forEach((source) => {
            const previous = byName.get(source.key)
            if (previous) previous.quantity += source.quantity
            else byName.set(source.key, { ...source })
          })
        })
        group.sourceBreakdown = Array.from(byName.values()).sort(
          (a, b) => b.quantity - a.quantity,
        )
      })
      return Array.from(groups.values()).sort((a, b) =>
        String(a.itemName).localeCompare(String(b.itemName)),
      )
    },
    /** Pagination étape 2 : groupes de la vue active (PDV ou article). */
    activeRestockGroups() {
      return this.restockViewMode === 'shop'
        ? this.restockGroupsByShopSplit
        : this.restockGroupsByItem
    },
    restockPageCount() {
      return Math.max(1, Math.ceil(this.activeRestockGroups.length / this.groupPageSize))
    },
    pagedRestockGroups() {
      const start = (this.restockPage - 1) * this.groupPageSize
      return this.activeRestockGroups.slice(start, start + this.groupPageSize)
    },
    /** Pagination étape 3 : sections fournisseur (l'aperçu latéral, l'export
     *  CSV et l'impression restent sur la liste COMPLÈTE shoppingGroups). */
    shoppingPageCount() {
      return Math.max(1, Math.ceil(this.shoppingGroups.length / this.groupPageSize))
    },
    pagedShoppingGroups() {
      const start = (this.shoppingPage - 1) * this.groupPageSize
      return this.shoppingGroups.slice(start, start + this.groupPageSize)
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
        // « fournisseur non défini » → groupe « Produits finis ». En mode
        // ingrédients, resolveIngredientSupplier étiquette le même cas
        // « Sans fournisseur (ingrédients manquants) » (srNoSupplierGroup).
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
          unavailableItems: this.unavailableStockItems,
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
        // BUG-292-01 : sans ce catalogue hydraté, l'éclatement composant →
        // ingrédients est inerte et la feuille de course s'arrête au composant.
        components: this.hydratedComponents,
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

      // fiche 314-01 — réapprovisionnement des ESPACES DE STOCKAGE : demande
      // ADDITIVE, injectée APRÈS consumeFromPool (jamais avant : le pool
      // netterait sa propre demande de refill → double comptage). Le nécessaire
      // se calcule sur le restant BRUT (spec PDF) : le stock storage « prêté »
      // aux PDV par le netting ci-dessus n'est PAS racheté automatiquement —
      // l'alternative (refill sur le restant post-consommation du pool) est la
      // question no 54 de QUESTIONS_A_BERTRAND.
      const refills = this.storageRefillLines
      if (refills.length) {
        const bySupplier = new Map(groups.map((g) => [g.supplierId, g]))
        refills.forEach((line) => {
          const sup = line.supplier || {}
          let group = bySupplier.get(sup.supplierId)
          if (!group) {
            group = {
              supplierId: sup.supplierId,
              supplierName: sup.supplierName,
              supplierEmail: sup.supplierEmail || '',
              supplierPhone: sup.supplierPhone || '',
              items: [],
            }
            bySupplier.set(sup.supplierId, group)
            groups.push(group)
          }
          // Upsert : si l'article est déjà acheté (besoin PDV), on AJOUTE le
          // refill à sa quantité ; sinon nouvelle ligne marquée fromStorage.
          const existing = group.items.find(
            (it) =>
              (line.itemId &&
                (String(it.itemId) === String(line.itemId) ||
                  String(it.sourceId) === String(line.itemId))) ||
              normalizeStr(it.itemName) === normalizeStr(line.itemName),
          )
          if (existing) {
            existing.quantity += line.storageRefill
            existing.buyQuantity = existing.quantity
            existing.storageRefill = (existing.storageRefill || 0) + line.storageRefill
            existing.fromStorage = true
            existing.packaging = this.packagingForItem(existing, existing.quantity)
          } else {
            const item = {
              itemKey: line.itemKey,
              itemName: line.itemName,
              unit: line.unit,
              itemId: line.itemId,
              sourceId: line.sourceId,
              quantity: line.storageRefill,
              buyQuantity: line.storageRefill,
              restockNeed: line.storageRefill,
              predicted: line.storageRefill,
              shopOnHand: 0,
              storageOnHand: 0,
              storageRefill: line.storageRefill,
              fromStorage: true,
              shopNames: line.storageName ? [line.storageName] : [],
              packaging: null,
            }
            item.packaging = this.packagingForItem(item, item.quantity)
            group.items.push(item)
          }
        })
        // Groupes ajoutés en fin de liste : on re-trie comme les groupes amont.
        groups.sort((a, b) => String(a.supplierName).localeCompare(String(b.supplierName)))
      }

      return { groups, unmatchedStorage }
    },
    /** Étape 3 — feuille de course nette VIVANTE. */
    liveShoppingGroups() {
      return this.nettedShopping.groups
    },
    /**
     * Étape 3 affichée : rejeu de la PHOTO (deltas de corrections × coefficients
     * de recette figés, netting Storage et packaging rejoués sur les valeurs
     * figées — jamais le catalogue vivant), sinon calcul vivant. La recherche
     * est appliquée après coup en mode plan (le mode vivant la porte plus haut,
     * dans shoppingSupplierGroups / shoppingIngredientGroups).
     */
    shoppingGroups() {
      if (!this.loadedPlan) return this.liveShoppingGroups
      const groups = recomputeShoppingFromOverrides(this.loadedPlan, this.lineOverrides)
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
     * Storage non rattaché affiché à l'étape 3 : figé dans meta pour un plan
     * chargé (une photo n'est jamais recalculée), vivant sinon.
     */
    displayedUnmatchedStorage() {
      if (this.loadedPlan) return this.loadedPlan.meta?.unmatchedStorage || []
      return this.nettedShopping.unmatchedStorage
    },
    /** Droit d'écriture sur les plans (BUG-19 : restockBoard seul = lecture). */
    canWritePlans() {
      const can = this.store.getters['auth/can']
      return typeof can === 'function' ? !!can('front.fb.restock') : false
    },
    /** Métadonnées du plan chargé (bandeau) — nom depuis la liste si dispo. */
    loadedPlanMeta() {
      if (!this.loadedPlanId) return null
      return (
        (this.plans || []).find((p) => p.id === this.loadedPlanId) ||
        { id: this.loadedPlanId, name: this.loadedPlan?.name || '' }
      )
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
        // Envoyé dans les `extras` du PUT (restock.api.js) : un backend plus
        // ancien en whitelist stricte retombe sur le noyau sans lui.
        loadedPlanId: this.loadedPlanId,
        // fiche 314-01 — overrides absolus de l'onglet Espaces de stockage
        // (extras aussi : blob jsonb opaque, aucun changement backend).
        storageAdjustments: this.storageAdjustments,
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
    // Les 3 routes de l'espace sont keepAlive : au changement d'espace, le
    // composant survit — sans ce watcher, un plan de l'espace X resterait
    // affiché sur l'espace Y. On repart en mode vivant + liste de plans vierge.
    'route.params.spaceId'(spaceId, previous) {
      if (!spaceId || spaceId === previous) return
      this.detachPlan({ silent: true })
      this.plansApi.reset()
      if (this.plansAvailable !== false) this.plansApi.refresh(spaceId)
    },
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
      this.stockPage = 1
    },
    stockSearch() {
      this.stockPage = 1
    },
    // Les listes rétrécissent (recherche, filtres, régénération) → on reste
    // sur une page valide.
    stockPageCount(count) {
      if (this.stockPage > count) this.stockPage = count
    },
    restockPageCount(count) {
      if (this.restockPage > count) this.restockPage = count
    },
    shoppingPageCount(count) {
      if (this.shoppingPage > count) this.shoppingPage = count
    },
    restockSearch() {
      this.restockPage = 1
    },
    restockViewMode() {
      this.restockPage = 1
    },
    restockEventFilter() {
      this.restockPage = 1
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
      // BUG-296-01 — le countsEventId dépend du mode (forecast/reference) :
      // sans rechargement, la ventilation étape 1 garde l'inventaire de
      // l'ancien ancrage.
      this.loadPreviousInventory()
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
    // Historique des plans (best-effort, jamais bloquant) : un 404 = module
    // backend absent → panneau masqué (plansAvailable = false).
    const mountSpaceId = this.route.params?.spaceId
    if (mountSpaceId) this.plansApi.refresh(mountSpaceId)
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
        // fiche 314-01 — stock tampon des espaces de stockage (builder state,
        // TTL 15 min). Après loadSpace : l'id résolu prime sur le slug d'URL.
        this.loadStorageInventory(this.currentSpace?.id || spaceId)
        // fiche 314-01 — noms fournisseurs dès l'étape 1 (chips + drawer).
        this.ensureBomSuppliers()

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
      if (saved.storageAdjustments) this.storageAdjustments = { ...saved.storageAdjustments }
      // Vue « Par shop » masquée : un état persisté `'shop'` (utilisateur qui
      // l'avait sélectionnée avant) ne doit PAS la ressusciter — sans la bascule
      // dans l'UI, il n'aurait aucun moyen d'en sortir.
      if (saved.restockViewMode === 'item') this.restockViewMode = 'item'
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
        this.$nextTick(() => {
          this.restoringState = false
          // F5 avec un plan chargé : on le recharge (404 → effacé + snackbar,
          // géré dans loadPlan). Après la levée du guard, sinon la restauration
          // du plan serait elle-même re-persistée en boucle.
          if (saved.loadedPlanId) this.loadPlan(saved.loadedPlanId)
        })
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
    // ------------------------------------------------------------------
    // Plans de réappro nommés (RestockPlan, ADR-0005)
    // ------------------------------------------------------------------
    /**
     * Charge un plan : réapplique les ENTRÉES (rejouables), puis pose la PHOTO
     * après le flush des watchers. `loadingPlan` neutralise
     * resetGeneratedOutputs et ensureStockItemDefaults pendant toute la pose —
     * sans ces gardes le plan se détruit lui-même (watchers selectedEventIds
     * et stockSettingsSignature).
     */
    async loadPlan(planId) {
      if (!planId || this.loadingPlan) return
      this.loadingPlan = true
      try {
        let plan = null
        try {
          plan = await this.plansApi.load(planId)
        } catch (err) {
          this.showSnackbar(this.t('srSnackPlanLoadError'), 'error')
          return
        }
        if (!plan) {
          // Supprimé (autre onglet / autre tenant) → mode vivant, sans plan.
          this.loadedPlanId = null
          this.loadedPlan = null
          this.lineOverrides = {}
          this.planDirty = false
          this.showSnackbar(this.t('srSnackPlanGone'), 'warning')
          return
        }
        // 1) Entrées — rejouées telles quelles (elles restent utiles au
        //    détachement : l'utilisateur retrouve sa sélection).
        this.objectiveSource = plan.objectiveSource || 'forecast'
        this.referenceEventId = plan.referenceEventId ?? null
        this.selectedEventIds = Array.isArray(plan.selectedEventIds) ? [...plan.selectedEventIds] : []
        this.selectedScenarioByEventId = { ...(plan.scenarioByEventId || {}) }
        this.stockAdjustments = { ...(plan.stockAdjustments || {}) }
        this.stockPackedModes = { ...(plan.stockPackedModes || {}) }
        this.stockExcluded = { ...(plan.stockExcluded || {}) }
        this.shoppingMode = plan.shoppingMode || 'finished'
        await this.$nextTick()
        // 2) Photo — posée après le flush des watchers d'entrées.
        this.loadedPlan = plan
        this.loadedPlanId = plan.id
        this.lineOverrides = { ...(plan.lineOverrides || {}) }
        this.restockedRows = { ...(plan.restockedRows || {}) }
        this.restockGenerated = true
        this.shoppingGenerated = true
        this.planDirty = false
        this.goToStep(2)
        this.showSnackbar(this.t('srSnackPlanLoaded'), 'success')
        await this.$nextTick()
      } finally {
        // Double nextTick (pattern restoringState) : la garde doit survivre au
        // flush des watchers déclenchés par la pose de la photo.
        this.$nextTick(() => { this.loadingPlan = false })
      }
    },
    /** Détache le plan (le document stocké reste intact) → mode vivant. */
    detachPlan({ silent = false } = {}) {
      const hadPlan = !!this.loadedPlanId
      this.loadedPlanId = null
      this.loadedPlan = null
      this.lineOverrides = {}
      this.planDirty = false
      if (hadPlan && !silent) this.showSnackbar(this.t('srSnackPlanDetached'), 'info')
    },
    /**
     * Garde de mutation invalidante quand un plan est chargé (règle ADR-0005 :
     * une photo n'est jamais recalculée en silence). Au niveau des CONTRÔLES
     * (entrée des handlers, avant mutation), pas dans les watchers — un watcher
     * se déclenche après la mutation, et un rollback le re-déclencherait.
     * @returns {Promise<boolean>} true = continuer (plan détaché), false = annuler
     */
    guardPlanEdit() {
      if (!this.loadedPlanId) return Promise.resolve(true)
      return new Promise((resolve) => {
        this.planGuardDialog = { show: true, resolver: resolve }
      })
    },
    /** Issue du dialogue de conflit : 'save' | 'discard' | 'cancel'. */
    async resolvePlanGuard(choice) {
      const resolver = this.planGuardDialog.resolver
      this.planGuardDialog = { show: false, resolver: null }
      if (choice === 'cancel') {
        if (resolver) resolver(false)
        return
      }
      if (choice === 'save') {
        const saved = await this.updateLoadedPlan()
        if (!saved) {
          if (resolver) resolver(false)
          return
        }
      }
      this.detachPlan({ silent: true })
      if (resolver) resolver(true)
    },
    /** Payload complet depuis l'état VIVANT (photo au moment de la sauvegarde). */
    buildPlanPayload() {
      const components = this.hydratedComponents.length ? this.hydratedComponents : this.components
      const restockRows = this.liveRestockRows
      return buildPlanSnapshot({
        stockRows: this.liveStockSettingsRows,
        restockRows,
        shoppingGroups: this.liveShoppingGroups,
        recipeCoeffs: buildRecipeCoeffs({ restockRows, shoppingMode: this.shoppingMode, components }),
        unmatchedStorage: this.nettedShopping.unmatchedStorage,
        inputs: {
          objectiveSource: this.objectiveSource,
          referenceEventId: this.referenceEventId,
          selectedEventIds: this.selectedEventIds,
          scenarioByEventId: this.selectedScenarioByEventId,
          stockAdjustments: this.stockAdjustments,
          stockPackedModes: this.stockPackedModes,
          stockExcluded: this.stockExcluded,
          restockedRows: this.restockedRows,
          shoppingMode: this.shoppingMode,
          snapshotAt: new Date().toISOString(),
        },
        events: this.selectedEvents,
        // BUG-296-01 — ventilation étape 1 figée avec le plan.
        stockOutcomes: this.stockOutcomeByItem,
      })
    },
    /** CTA « Sauvegarder le plan » (aucun plan chargé) : ouvre le nommage. */
    openSavePlanDialog() {
      if (!this.canWritePlans) return
      const eventName = this.selectedEvents.length ? this.eventLabel(this.selectedEvents[0]) : ''
      this.planSaveDialog = { show: true, name: eventName }
    },
    /** Crée le plan nommé depuis l'état vivant (sauvegarde EXPLICITE). */
    async confirmSavePlan() {
      const name = (this.planSaveDialog.name || '').trim()
      if (!name) return
      const spaceId = this.route.params?.spaceId
      const payload = { name, ...this.buildPlanPayload() }
      if (estimateSnapshotBytes(payload) > PLAN_MAX_BYTES) {
        this.showSnackbar(this.t('srSnackPlanTooLarge'), 'error')
        return
      }
      this.planSaveDialog = { show: false, name: '' }
      try {
        const created = await this.plansApi.create(spaceId, payload)
        // Le plan fraîchement créé devient le plan chargé (photo = état actuel).
        if (created?.id) await this.loadPlan(created.id)
        this.showSnackbar(this.t('srSnackPlanSaved'), 'success')
      } catch (err) {
        this.showSnackbar(this.t('srSnackPlanSaveError'), 'error')
      }
    },
    /**
     * « Mettre à jour » un plan chargé : persiste corrections + confirmations.
     * La photo elle-même ne bouge pas (document figé) — seuls lineOverrides et
     * restockedRows sont réécrits.
     * @returns {Promise<boolean>} succès
     */
    async updateLoadedPlan() {
      if (!this.loadedPlanId) return false
      try {
        const updated = await this.plansApi.update(
          this.loadedPlanId,
          { lineOverrides: this.lineOverrides, restockedRows: this.restockedRows },
          this.route.params?.spaceId,
        )
        if (updated) this.loadedPlan = { ...this.loadedPlan, lineOverrides: { ...this.lineOverrides } }
        this.planDirty = false
        this.showSnackbar(this.t('srSnackPlanUpdated'), 'success')
        return true
      } catch (err) {
        if (err?.response?.status === 404) {
          this.detachPlan({ silent: true })
          this.showSnackbar(this.t('srSnackPlanGone'), 'warning')
        } else {
          this.showSnackbar(this.t('srSnackPlanSaveError'), 'error')
        }
        return false
      }
    },
    /** Correction « À déposer » sur une ligne du plan chargé, en UNITÉS. */
    setLineOverride(rowKey, value) {
      if (!this.loadedPlanId) return
      const next = { ...this.lineOverrides }
      const n = Number(value)
      if (value === null || value === '' || !Number.isFinite(n) || n < 0) delete next[rowKey]
      else next[rowKey] = n
      this.lineOverrides = next
      this.planDirty = true
    },
    /**
     * Valeur du champ « À déposer » d'un plan chargé : en PAQUETS quand le
     * conditionnement se résout, en unités sinon. L'override est stocké en
     * unités (tout l'aval y travaille) — la conversion vit ici seule.
     */
    depositFieldValue(row) {
      const stored = this.lineOverrides[row.rowKey] ?? row.restockQuantity
      if (!this.depositPackSize(row)) return stored
      return packCountForQuantity(stored, row.packaging)
    },
    /** Saisie en paquets → override stocké en unités (n × taille du colis). */
    setLineOverridePacks(row, value) {
      const packSize = this.depositPackSize(row)
      if (!packSize) {
        this.setLineOverride(row.rowKey, value)
        return
      }
      const packs = Number(value)
      if (value === null || value === '' || !Number.isFinite(packs) || packs < 0) {
        this.setLineOverride(row.rowKey, null)
        return
      }
      this.setLineOverride(row.rowKey, Math.round(packs) * packSize)
    },
    async renamePlan({ id, name }) {
      try {
        await this.plansApi.update(id, { name }, this.route.params?.spaceId)
        if (this.loadedPlan?.id === id) this.loadedPlan = { ...this.loadedPlan, name }
        this.showSnackbar(this.t('srSnackPlanRenamed'), 'success')
      } catch (err) {
        this.showSnackbar(this.t('srSnackPlanSaveError'), 'error')
      }
    },
    /**
     * Lot 3 — retry explicite après un échec de chargement de la liste (réseau
     * coupé / 5xx). Le composable ne retente jamais tout seul : sans ce bouton,
     * l'échec restait définitif jusqu'au prochain changement d'espace.
     */
    refreshPlans() {
      const spaceId = this.route.params?.spaceId
      if (spaceId) this.plansApi.refresh(spaceId)
    },
    async duplicatePlanAction(planId) {
      try {
        await this.plansApi.duplicate(planId, this.route.params?.spaceId)
        this.showSnackbar(this.t('srSnackPlanDuplicated'), 'success')
      } catch (err) {
        this.showSnackbar(this.t('srSnackPlanSaveError'), 'error')
      }
    },
    async deletePlanAction(planId) {
      try {
        await this.plansApi.remove(planId, this.route.params?.spaceId)
        if (this.loadedPlanId === planId) this.detachPlan({ silent: true })
        this.showSnackbar(this.t('srSnackPlanDeleted'), 'success')
      } catch (err) {
        this.showSnackbar(this.t('srSnackPlanSaveError'), 'error')
      }
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
        // manualQuantities : colonne BDD (EventPredictVersion, migration
        // 20260625000000) prioritaire — cross-device ; miroir localStorage en
        // repli pour les versions sauvées avant la migration.
        manualQuantities:
          d.manualQuantities || (localById.get(d.id) || {}).manualQuantities || {},
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
     * recompute) en records DÉJÀ AJUSTÉS par le % de la version — même
     * sémantique que `manualQuantityRecords` (EventPredictView) : une ligne
     * `isManual: true` porte sa quantité finale, et buildStockRequirements /
     * buildMenuItemDemand neutralisent le % dessus (fiche 311_02 — l'ancien
     * commentaire « aucun % pour ces items → 100% » était faux : le slider
     * fan-out shop écrit bien des % sur les couples manuels).
     */
    withManualRecords(records, version) {
      const mq = version?.manualQuantities || {}
      const cfg = version?.menuConfig || {}
      if (!Object.keys(mq).length || !Object.keys(cfg).length) return records
      const adjMap = version?.quantityAdjustments || {}
      const present = new Set(
        records.map((r) => `${r.shopId || r.shop}|${r.menuItemId || r.mappedMenuItemId}`),
      )
      const out = records.slice()
      for (const shopId of Object.keys(cfg)) {
        for (const menuItemId of (cfg[shopId] || [])) {
          const rawQty = Number(mq[`${shopId}-${menuItemId}`]) || 0
          const adjPct = Number(adjMap[`${shopId}-${menuItemId}`] ?? 100)
          const qty = Math.round((rawQty * adjPct) / 100)
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
        this.unavailableStockItems = null
        return
      }
      const cache = this._restockAssignmentCache || (this._restockAssignmentCache = {})
      const closedCache = this._restockClosedCache || (this._restockClosedCache = {})
      const unavailCache = this._restockUnavailableCache || (this._restockUnavailableCache = {})
      if (cache[cfgId]) {
        this.restockAssignmentByName = cache[cfgId]
        this.closedShopNames = closedCache[cfgId] || []
        this.unavailableStockItems = unavailCache[cfgId] || null
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
        this.unavailableStockItems = null
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
          if (!shopId) { results[idx] = { name, items: [], unavailable: [] }; return }
          // BUG-291-02 — `shopMenuItems` (GET /space-menu/shop/:id) ne porte PAS
          // `available` : la disponibilité serveur vient de l'endpoint LÉGER
          // /items, via le store `shopMenuAvailability`. Même clé de cache
          // (`shopId::configId`) et même TTL 15 min que ceux qu'EventPredict
          // remplit → sur un parcours Predict → Réarmement, servi par le cache.
          // Dans la MÊME boucle plafonnée à 3 : pas de nouveau parallélisme.
          // Try INDÉPENDANT du fetch lourd (v2) : un échec de `shopMenuItems` ne
          // doit pas emporter la disponibilité avec lui, ni l'inverse.
          let unavailable = []
          try {
            await this.store.dispatch('shopMenuAvailability/fetchForShop', { shopId, configId: cfgId })
            const availFor = this.store.getters['shopMenuAvailability/forShop']
            const rowsAvail = typeof availFor === 'function' ? availFor(shopId, cfgId) || [] : []
            // `available === false` STRICT : un backend antérieur qui n'enverrait
            // pas le champ ne doit pas vider le réarmement.
            unavailable = rowsAvail.filter((it) => it && it.available === false)
          } catch (_) {
            /* disponibilité indisponible → on n'exclut rien (comportement antérieur) */
          }
          try {
            await this.store.dispatch('shopMenuItems/fetchForShop', { shopId, configId: cfgId })
            const forShop = this.store.getters['shopMenuItems/forShop']
            const items = typeof forShop === 'function' ? forShop(shopId, cfgId) || [] : []
            results[idx] = { name, items, unavailable }
          } catch (_) {
            results[idx] = { name, items: [], unavailable }
          }
        })
        const map = new Map()
        // Union PLATE au niveau espace (v2) : `available` est par espace — chaque
        // shop renvoie le même verdict pour un article donné, et un index plat ne
        // dépend plus d'aucune jointure par nom de shop (cf. `unavailableStockItems`).
        const unavailIds = new Set()
        const unavailNames = new Set()
        for (const { name, items: rawItems, unavailable } of results) {
          const items = Array.isArray(rawItems) ? rawItems : []
          for (const it of unavailable || []) {
            unavailIds.add(String(it.id))
            if (it.name) unavailNames.add(it.name)
          }
          const enabled = items.filter((it) => it && it.enabled === true)
          if (!enabled.length) continue
          const key = normalizeStr(name)
          if (!key) continue
          map.set(key, {
            ids: new Set(enabled.map((it) => it.id)),
            items: enabled.map((it) => ({ id: it.id, name: it.name, basePrice: it.basePrice })),
          })
        }
        const unavailableStockItems = unavailIds.size
          ? { ids: [...unavailIds], names: [...unavailNames] }
          : null
        cache[cfgId] = map
        unavailCache[cfgId] = unavailableStockItems
        this.restockAssignmentByName = map
        this.unavailableStockItems = unavailableStockItems
        // eslint-disable-next-line no-console
        console.log(
          `[RESTOCK] assignation NestJS chargée : ${map.size}/${rows.length} shops avec menu ; ${unavailIds.size} article(s) non produisible(s) exclus${unavailNames.size ? ` : [${[...unavailNames].join(', ')}]` : ''}`,
        )
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[RESTOCK] chargement assignation échoué:', e?.message)
        this.restockAssignmentByName = null
        this.unavailableStockItems = null
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
    async selectEvent(id) {
      if (!(await this.guardPlanEdit())) return
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
    async selectScenario(eventId, versionId) {
      if (!(await this.guardPlanEdit())) return
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
      // Garde loadPlan : poser selectedEventIds déclenche le watcher qui
      // arrive ici et viderait restockedRows + drapeaux fraîchement restaurés
      // → le plan chargé se détruirait lui-même.
      if (this.loadingPlan) return
      this.restockGenerated = false
      this.shoppingGenerated = false
      this.restockedRows = {}
    },
    ensureStockItemDefaults() {
      // Garde loadPlan : le watcher stockSettingsSignature ÉCRIT
      // stockAdjustments/stockPackedModes et écraserait les valeurs du plan.
      if (this.loadingPlan) return
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
    async setStockSelected(itemKey, checked) {
      if (!(await this.guardPlanEdit())) return
      const next = { ...this.stockExcluded }
      if (checked) delete next[itemKey]
      else next[itemKey] = true
      this.stockExcluded = next
    },
    async toggleAllStock(select) {
      if (!(await this.guardPlanEdit())) return
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
    async setStockAdjustment(itemKey, value) {
      if (!(await this.guardPlanEdit())) return
      this.stockAdjustments = {
        ...this.stockAdjustments,
        [itemKey]: Number(value) || 0,
      }
      this.resetGeneratedOutputs()
    },
    async applyStockAdjustmentToAll(percent) {
      if (!(await this.guardPlanEdit())) return
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
    // ── fiche 314-01 — onglet Espaces de stockage ────────────────────────────
    /** Override ABSOLU (unités) du nécessaire d'une ligne storage. */
    async setStorageAdjustment(key, value) {
      if (!(await this.guardPlanEdit())) return
      this.storageAdjustments = {
        ...this.storageAdjustments,
        [key]: Math.max(0, Number(value) || 0),
      }
      this.resetGeneratedOutputs()
    },
    /** Retour au défaut max(0, tampon − restant) pour une ligne storage. */
    async clearStorageAdjustment(key) {
      if (!(await this.guardPlanEdit())) return
      const next = { ...this.storageAdjustments }
      delete next[key]
      this.storageAdjustments = next
      this.resetGeneratedOutputs()
    },
    /** « À commander » d'une ligne storage — même rendu que buyInfo (étape 1). */
    storageBuyInfo(row) {
      if (!(row.required > 0)) {
        return {
          main: this.t('srBuyNothing'),
          sub: this.t('srBuyNothingHint'),
          covered: true,
          unknown: false,
        }
      }
      // Même résolution que storagePackagingByKey (Market Prices inclus) : sans
      // ça « À commander » restait en unités brutes sur les réserves libres,
      // alors que la ligne juste au-dessus affichait déjà ses colis.
      const packaging = computePackagingForQuantity(
        { itemId: row.menuItemId || undefined, itemName: row.name, unit: row.unit },
        row.required,
        this.ingredients,
        this.components,
        this.menuItems,
        this.marketPrices,
      )
      if (!packaging) {
        return {
          main: this.formatLooseQuantity(row.required, row.unit),
          sub: this.t('srBuyNoPackaging'),
          covered: false,
          unknown: false,
        }
      }
      const covered = coveredQuantityForPackaging(packaging)
      const loose = Math.max(0, roundForUnit(covered - row.required, row.unit))
      const parts = [`= ${this.formatLooseQuantity(covered, row.unit)}`]
      if (loose > 0) {
        parts.push(`${this.formatLooseQuantity(loose, row.unit)} ${this.t('srBuyLooseAfter')}`)
      }
      return {
        main: this.formatPackedQuantity(packaging, row.unit),
        sub: parts.join(' · '),
        covered: false,
        unknown: false,
      }
    },
    /**
     * Équivalent « Information inventaire » d'une quantité storage :
     * « 250 Packs de 4 pc ». Valeur EXACTE (1 décimale si non entière) —
     * contrairement à « À commander » (storageBuyInfo) qui arrondit au colis
     * SUPÉRIEUR : tampon/restant/nécessaire décrivent un état, pas un achat.
     * Chaîne vide si le conditionnement ne se résout pas — l'appelant garde
     * alors le nombre brut seul.
     */
    storagePackedEquivalent(row, quantity) {
      const qty = Number(quantity) || 0
      if (!(qty > 0)) return ''
      const packaging = this.storagePackagingByKey[row.key]
      const packSize = packSizeForPackaging(packaging)
      if (!packSize) return ''
      const count = Math.round((qty / packSize) * 10) / 10
      const type = pluralizePackLabel(
        packaging.packagingType || this.t('srDepositPackSuffix'),
        count,
      )
      const size = this.depositPackSizeLabel({ packaging, unit: row.unit })
      const label = `${count.toLocaleString('fr-FR')} ${type}`
      return size ? `${label} ${this.t('srDepositHelpOf')} ${size}` : label
    },
    /**
     * Catalogue /suppliers complet (id → nom/contact). Extrait
     * d'ensureRecipesLoaded : l'étape 1 en a besoin AVANT la feuille de course
     * (chips fournisseur + drawer d'édition — sans lui, le select du drawer
     * affiche l'id brut du fournisseur).
     */
    async ensureBomSuppliers() {
      if (this.bomSuppliers.length) return
      try {
        const res = await getSuppliers()
        this.bomSuppliers = Array.isArray(res) ? res : res?.data || []
      } catch (e) {
        console.warn('[restock] getSuppliers échoué:', e?.message)
      }
    },
    // ── fiche 314-01 — édition Market Price depuis l'étape 1 ─────────────────
    async openSupplierEdit(marketPriceRow) {
      if (!this.canEditMarketPrices || !marketPriceRow) return
      // Le drawer mappe supplierId → nom via la liste passée en prop : la
      // garantir chargée avant l'ouverture (sinon l'id brut s'affiche).
      await this.ensureBomSuppliers()
      // Options Good Type/Category : le drawer COPIE les props à l'ouverture
      // (localGoodTypeOptions) → charger AVANT d'ouvrir, pas après. Cache TTL :
      // coût nul dès la 2e ouverture.
      await Promise.allSettled([
        this.store.dispatch('marketPriceTypes/fetchMarketPriceTypes'),
        this.store.dispatch('productCategories/fetchProductCategories'),
      ])
      this.supplierEditRow = marketPriceRow
      this.supplierEditDialog = true
    },
    async onSupplierSaved() {
      this.supplierEditDialog = false
      this.supplierEditRow = null
      // Le nom fournisseur affiché (et les groupes de l'étape 3) suivent le
      // catalogue prix : invalidation + rechargement forcé.
      this.store.dispatch('inventory/invalidateMarketPrices')
      await this.store.dispatch('inventory/loadMarketPrices')
    },
    /**
     * Affichage en colis PAR DÉFAUT dès que le conditionnement se résout — la
     * case « Empaqueté » a été retirée (le calcul arrondit toujours en colis
     * entiers depuis BUG-295-01, la case ne pilotait plus que le format).
     * `false` explicite (plans sauvegardés avec la case décochée) respecté.
     */
    isPackedMode(itemKey) {
      return this.stockPackedModes[itemKey] !== false
    },
    adjustedQuantity(quantity, unit, itemKey) {
      return roundForUnit((Number(quantity) || 0) * (this.stockAdjustment(itemKey) / 100), unit)
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
      // Régénérer = recalculer en vivant → invalide la photo du plan chargé.
      if (!(await this.guardPlanEdit())) return
      await this.loadPreviousInventory()
      this.restockGenerated = true
      this.shoppingGenerated = false
      this.showSnackbar(this.t('srSnackRestockGenerated'), 'success')
      // Avance l'assistant vers l'étape Réarmement (panneau déplié).
      this.goToStep(2)
    },
    async generateShoppingList() {
      if (!this.canGenerate) return
      if (!(await this.guardPlanEdit())) return
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
      // La photo d'un plan ne contient les groupes que pour le mode sauvegardé :
      // il n'existe AUCUNE donnée figée pour l'autre → mutation invalidante.
      if (mode !== this.shoppingMode && !(await this.guardPlanEdit())) return
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
      await this.ensureBomSuppliers()
      // BUG-292-01 — recette des COMPOSANTS. La liste /menu-components ne renvoie
      // pas `subComponents` : on complète depuis le catalogue déjà en mémoire, puis
      // par fetch détail borné pour ce qu'il reste. Échec toléré (le composant
      // reste une ligne d'achat), mais la couverture est tracée : un éclatement
      // inerte doit être lisible dans les logs, pas silencieux.
      if (!this.componentsHydrated) {
        this.componentsHydrated = true
        try {
          // Pas de `mergeSubComponentsFromCatalog` ici : il n'y a qu'UN catalogue
          // (`store.analyse.components`), et le fusionner avec lui-même serait un
          // no-op qui se lirait comme une étape utile. Ce catalogue est déjà hydraté
          // quand il vient de `useSpaceData` (vague 2b → `SET_COMPONENTS`) — dans ce
          // cas `hydrateSubComponents` ne déclenche aucun appel. Le fetch ne sert
          // qu'au chemin legacy (`utils/api.js`, liste brute sans `subComponents`).
          const { components: hydrated, hydrated: okCount, missing: koCount } =
            await hydrateSubComponents(this.components, { ingredients: this.ingredients })
          this.hydratedComponents = hydrated
          console.log(
            `[restock] 🧩 recettes composants — ${hydrated.filter((c) => c?.subComponents?.length).length}/${hydrated.length} avec subComponents ` +
              `(détail : ${okCount} hydratés, ${koCount} sans recette)`,
          )
        } catch (e) {
          console.warn('[restock] hydratation composants échouée:', e?.message)
          this.hydratedComponents = this.components
        }
      }
      const ids = Array.from(
        new Set(this.menuItemDemandRows.map((d) => d.menuItemId).filter(Boolean)),
      )
      const missing = ids.filter((id) => !this.recipeByMenuItemId[id])
      if (!missing.length) return
      this.recipesLoading = true
      try {
        // BUG-294-01 — UN appel batch au lieu de N × GET /menu-items/:id : le
        // fan-out (~40 requêtes simultanées) déclenchait le TenantThrottlerGuard
        // (429) et chaque échec était caché comme « recette vide » → faux groupe
        // « Sans fournisseur (ingrédients manquants) », jamais retenté.
        // ⚠️ ids vide = TOUT le tenant côté backend — le guard !missing.length
        // ci-dessus est indispensable.
        const res = await getMenuItemRecipes(missing)
        const payload = res?.data || res
        const items = Array.isArray(payload?.items) ? payload.items : []
        const next = { ...this.recipeByMenuItemId }
        const returned = new Set()
        items.forEach((dto) => {
          if (!dto?.id) return
          returned.add(dto.id)
          next[dto.id] = normalizeRecipeFromBatch(dto)
        })
        // Id demandé mais absent de la réponse = item supprimé / hors tenant :
        // vraie absence de recette → cache vide LÉGITIME (produit fini), pas un
        // échec réseau.
        missing.forEach((id) => {
          if (!returned.has(id)) next[id] = { numberOfPiecesRecipe: 1, lines: [] }
        })
        this.mergeBomSuppliers(payload?.suppliers)
        this.recipeByMenuItemId = next
      } catch (e) {
        // Batch KO (500, timeout…) : repli détail per-id BORNÉ. Anti-poison :
        // aucun échec réseau n'est écrit comme « recette vide ».
        console.warn('[restock] batch recettes échoué — repli per-id borné:', e?.message)
        await this.loadRecipesFallback(missing)
      } finally {
        this.recipesLoading = false
      }
    },
    /** Fusionne les fournisseurs renvoyés par le batch dans bomSuppliers (dédupe par id). */
    mergeBomSuppliers(suppliers) {
      if (!Array.isArray(suppliers) || !suppliers.length) return
      const known = new Set(this.bomSuppliers.map((s) => s?.id))
      const added = suppliers.filter((s) => s?.id && !known.has(s.id))
      if (added.length) this.bomSuppliers = [...this.bomSuppliers, ...added]
    },
    /**
     * Repli si le batch échoue : détail /menu-items/:id avec concurrence bornée
     * à 4 (sous le seuil du TenantThrottlerGuard). Un id en échec n'est PAS
     * caché : absent de recipeByMenuItemId, il sera retenté au prochain
     * « Générer » — c'est l'état « à retenter », pas une recette vide.
     */
    async loadRecipesFallback(ids) {
      const next = { ...this.recipeByMenuItemId }
      let failed = 0
      await runWithConcurrency(ids, 4, async (id) => {
        try {
          const res = await getMenuItemById(id)
          const detail = res?.data || res
          if (detail) next[id] = normalizeRecipe(detail)
          else failed += 1
        } catch (e) {
          failed += 1
          console.warn('[restock] recette détail échouée:', id, e?.message)
        }
      })
      this.recipeByMenuItemId = next
      if (failed) this.showSnackbar(this.t('srSnackRecipesPartial'), 'warning')
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
      // Plat sans recette exploitable (vrai produit fini type Coca/chips, OU
      // recette absente en base) : pas de matière à commander, pas de fournisseur
      // → groupe dédié « Sans fournisseur (ingrédients manquants) » (distinct
      // d'un ingrédient au mapping fournisseur cassé, qui reste « non défini »).
      if (line.itemType === 'MenuItem') {
        return {
          supplierId: '__finished__',
          supplierName: this.t('srNoSupplierGroup'),
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
      // Sur un plan chargé, les confirmations font partie du document
      // (persistées par « Mettre à jour », avec lineOverrides).
      if (this.loadedPlanId) this.planDirty = true
    },
    markAllVisibleRestocked(checked) {
      const next = { ...this.restockedRows }
      this.filteredRestockRows.forEach((row) => {
        next[row.rowKey] = !!checked
      })
      this.restockedRows = next
      if (this.loadedPlanId) this.planDirty = true
    },
    /** Toutes les lignes (boutiques) de la carte article sont-elles confirmées ? */
    isGroupRestocked(group) {
      return (group?.rows || []).length > 0 && group.rows.every((row) => this.isRestocked(row.rowKey))
    },
    /** Confirme / décoche d'un coup toutes les boutiques d'une carte article. */
    setGroupRestocked(group, checked) {
      const next = { ...this.restockedRows }
      ;(group?.rows || []).forEach((row) => {
        next[row.rowKey] = !!checked
      })
      this.restockedRows = next
      if (this.loadedPlanId) this.planDirty = true
    },
    formatLooseQuantity(quantity, unit) {
      const n = roundForUnit(quantity, unit)
      return `${n.toLocaleString('fr-FR')} ${unit || ''}`.trim()
    },
    /** Lot 4 — affichage arrondi au SUPÉRIEUR (à déposer, reste en vrac). */
    formatCeilQuantity(quantity, unit) {
      const n = ceilForUnit(quantity, unit)
      return `${n.toLocaleString('fr-FR')} ${unit || ''}`.trim()
    },
    /**
     * Lot 3 — rang ACHAT de l'étape 1 : ce qu'on achète RÉELLEMENT, dans
     * l'unité où le fournisseur vend, et le vrac que l'arrondi au colis laisse.
     *
     * Règle métier (JLH) : besoin de 3 pains, article vendu par sachet de 50 →
     * on commande 1 sachet, il reste 47 en vrac. Les trois mesures du rang
     * BESOIN disent « voilà ton vrai besoin », celle-ci dit « voilà ce que tu
     * vas réellement acheter ». Un colis qui paraît faux vient d'une quantité
     * par colis erronée sur la FICHE PRODUIT — jamais d'un ajustement ici.
     *
     * @returns {{main: string, sub: string, covered: boolean, unknown: boolean}}
     */
    buyInfo(item) {
      const order = this.stockOrderByItem ? this.stockOrderByItem[item.itemKey] : undefined
      // Plan chargé (photo sans quantité d'achat) ou article décoché.
      if (order == null) {
        return { main: '—', sub: '', covered: false, unknown: true }
      }
      if (!(order > 0)) {
        return {
          main: this.t('srBuyNothing'),
          sub: this.t('srBuyNothingHint'),
          covered: true,
          unknown: false,
        }
      }
      const packaging = this.packagingForItem(item, order)
      if (!packaging) {
        // Pas de conditionnement au catalogue : on commande en vrac et on le
        // DIT, pour que le trou soit corrigé dans la fiche produit.
        return {
          main: this.formatLooseQuantity(order, item.unit),
          sub: this.t('srBuyNoPackaging'),
          covered: false,
          unknown: false,
        }
      }
      const covered = coveredQuantityForPackaging(packaging)
      const loose = Math.max(0, roundForUnit(covered - order, item.unit))
      const parts = [`= ${this.formatLooseQuantity(covered, item.unit)}`]
      if (loose > 0) {
        parts.push(`${this.formatLooseQuantity(loose, item.unit)} ${this.t('srBuyLooseAfter')}`)
      }
      return {
        main: this.formatPackedQuantity(packaging, item.unit),
        sub: parts.join(' · '),
        covered: false,
        unknown: false,
      }
    },
    /**
     * Lot 5 (JLH) — explication du conditionnement, sur « À déposer » (le seul
     * endroit où le colis a un sens : la Prévision, elle, reste en unités de
     * recette). Null si la ligne n'a pas de conditionnement au catalogue.
     */
    depositHelp(row) {
      const p = row && row.packaging
      if (!p || !p.packedCount) return null
      // `gap` n'est PAS figé dans le snapshot (freezeRestockLine) : on le dérive
      // de la cible et du restant, tous deux figés — l'infobulle reste donc juste
      // sur un plan chargé comme sur un calcul vivant.
      const gap = Math.max(0, (Number(row.targetQuantity) || 0) - (Number(row.remainingQuantity) || 0))
      return this.t('srDepositHelpBody')
        // Accordé comme la cellule : « Carton de 6 bouteilles » au singulier
        // (on décrit UN colis), « 3 Cartons » accordé sur le compte.
        .replace('{pack}', `${this.depositPackLabelSingular(row)} ${this.t('srDepositHelpOf')} ${this.depositPackSizeLabel(row)}`)
        .replace('{need}', this.formatLooseQuantity(gap, row.unit))
        .replace(
          '{count}',
          `${p.packedCount.toLocaleString('fr-FR')} ${pluralizePackLabel(this.depositPackLabelSingular(row), p.packedCount)}`,
        )
        .replace('{deposited}', this.formatCeilQuantity(row.restockQuantity, row.unit))
        .replace('{loose}', this.formatCeilQuantity(row.surplusLoose, row.unit))
    },
    /**
     * Taille d'un colis en unités de recette, pour convertir paquets ⇄ unités.
     * `coveredQuantityForPackaging` porte déjà la conversion d'unité d'achat
     * (purchaseUnitConversion) : on la dérive d'un colis plutôt que de relire
     * packagingUnitNumber, sinon la conversion est perdue. Null si le
     * conditionnement ne se résout pas → l'affichage reste en unités.
     */
    depositPackSize(row) {
      if (!row || !row.packaging || !this.isPackedMode(row.itemKey)) return null
      return packSizeForPackaging(row.packaging)
    },
    /**
     * « À déposer » exprimé en NOMBRE DE PAQUETS (demande JLH) — c'est l'unité
     * de l'action physique : on ne dépose pas 1,2 sac. Le calcul, lui, reste en
     * unités de recette partout en aval (netting, feuille de course).
     */
    depositPackCount(row) {
      if (!this.depositPackSize(row)) return null
      return packCountForQuantity(row.restockQuantity, row.packaging)
    },
    /** Type de colis, accordé sur le nombre déposé (« 3 Cartons », « 1 Sac »). */
    depositPackLabel(row) {
      return pluralizePackLabel(this.depositPackLabelSingular(row), this.depositPackCount(row))
    },
    /** Type de colis au singulier — « Carton de 6 bouteilles » reste au singulier. */
    depositPackLabelSingular(row) {
      const packaging = row && row.packaging
      return (packaging && packaging.packagingType) || this.t('srDepositPackSuffix')
    },
    /**
     * Conditionnement complet sous le nombre de colis : « Carton de 6 bouteilles
     * · 1,5 kg ». Sans la taille du colis, « 3 Carton » ne dit pas ce qu'on
     * charge dans le camion — et c'est justement la valeur que la fiche produit
     * doit corriger quand le compte paraît faux.
     */
    depositPackDetail(row) {
      const units = this.formatRestockUnits(row)
      const size = this.depositPackSizeLabel(row)
      if (!size) return units
      // « Carton de 6 bouteilles » : le type reste au singulier (c'est UN colis
      // qu'on décrit), seule l'unité de la taille s'accorde.
      return `${this.depositPackLabelSingular(row)} ${this.t('srDepositHelpOf')} ${size} · ${units}`
    },
    /**
     * Taille d'un colis telle qu'elle est écrite sur la fiche produit
     * (« 6 bouteilles », « 0,5 kg »). Chaîne vide si le catalogue ne la porte
     * pas — l'appelant retombe alors sur les seules unités de recette.
     */
    depositPackSizeLabel(row) {
      const packaging = row && row.packaging
      if (!packaging || !packaging.packagingUnitNumber) return ''
      const quantity = Number(packaging.packagingUnitNumber)
      const number = quantity.toLocaleString('fr-FR')
      // Un symbole de mesure (kg, L) est invariable ; un contenant nommé
      // (bouteille, boîte) s'accorde — pluralizePackLabel arbitre.
      const unit = pluralizePackLabel(packaging.packagingUnit || row.unit || '', quantity)
      return `${number} ${unit}`.trim()
    },
    formatRestockQuantity(row) {
      // Lot 4 — au supérieur : c'est une quantité qu'on dépose physiquement.
      const packCount = this.depositPackCount(row)
      if (packCount != null) {
        return `${packCount.toLocaleString('fr-FR')} ${this.depositPackLabel(row)}`
      }
      return this.formatCeilQuantity(row.restockQuantity, row.unit)
    },
    /** Rappel en unités de recette, en secondaire sous le nombre de paquets. */
    formatRestockUnits(row) {
      return this.formatCeilQuantity(row.restockQuantity, row.unit)
    },
    /**
     * « 3 Cartons de 6 bouteilles » — même accord que « À déposer ». Ne teste
     * PAS isPackedMode : les appelants arbitrent (buyInfo affiche les colis dès
     * que le conditionnement se résout).
     */
    formatPackedQuantity(packaging, unit) {
      if (!packaging) return ''
      const count = Number(packaging.packedCount || 0)
      const type = pluralizePackLabel(packaging.packagingType || this.t('srDepositPackSuffix'), count)
      const size = this.depositPackSizeLabel({ packaging, unit })
      const label = `${count.toLocaleString('fr-FR')} ${type}`
      return size ? `${label} ${this.t('srDepositHelpOf')} ${size}` : label
    },
    formatShoppingQuantity(item) {
      if (this.isPackedMode(item.itemKey) && item.packaging) {
        return this.formatPackedQuantity(item.packaging, item.unit)
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
    /**
     * BUG-288-01 — parts par menu item d'un article de stock partagé.
     * Fusionne les `sources` par NOM de plat (un même plat peut apparaître via
     * plusieurs lignes de recette) et applique le même ajustement % que
     * `targetQuantity` : la somme des parts reconstitue la colonne BESOIN.
     */
    buildSourceBreakdown(row) {
      if (!row?.sources?.length) return []
      const byName = new Map()
      row.sources.forEach((source) => {
        const name = source.menuItemName || ''
        if (!name) return
        const quantity = this.adjustedQuantity(source.componentQuantity, row.unit, row.itemKey)
        const previous = byName.get(name)
        if (previous) previous.quantity += quantity
        else byName.set(name, { key: name, name, quantity, unit: row.unit })
      })
      return Array.from(byName.values()).sort((a, b) => b.quantity - a.quantity)
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
        // Le terrain dépose des paquets : la colonne unités reste (le calcul
        // aval y travaille), les deux colonnes colis s'ajoutent à côté.
        this.t('srCsvPackCount'),
        this.t('srCsvPackType'),
        this.t('srCsvPackSize'),
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
        this.depositPackCount(row) ?? '',
        this.depositPackCount(row) == null ? '' : this.depositPackLabel(row),
        // Taille d'un colis (« 6 bouteilles ») : sans elle, « 3 Carton » n'est
        // pas exploitable en dehors de l'écran.
        this.depositPackSizeLabel(row),
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
      // Liste paginée : bascule d'abord sur la page qui porte ce fournisseur.
      const index = this.shoppingGroups.findIndex((g) => g.supplierId === supplierId)
      if (index >= 0) this.shoppingPage = Math.floor(index / this.groupPageSize) + 1
      this.$nextTick(() => {
        const el = document.getElementById(`sr-supplier-${supplierId}`)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
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

/* Pieds d'assistant en grille 3 zones : navigation à gauche, pagination de la
   liste au CENTRE, action à droite. Le collage à l'écran vient du sticky
   global `.sr-wizard-nav` (plus bas), libéré par `overflow: clip` sur
   `.sr-panel`. Sélecteur doublé : bat le display:flex de la règle de base. */
.sr-wizard-nav.sr-wizard-nav-grid {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
}

.sr-wizard-nav-grid .sr-wizard-nav-side {
  min-width: 0;
}

.sr-wizard-nav-grid .sr-wizard-nav-pagination {
  justify-self: center;
}

.sr-wizard-nav-grid > :first-child {
  justify-self: start;
}

.sr-wizard-nav-grid .sr-wizard-nav-end {
  justify-self: end;
}

/* Boutons du pied d'assistant : les `v-btn` bruts héritent du style Vuetify
   (MAJUSCULES + letter-spacing + radius 4px) — hors charte. On les aligne sur
   les boutons de la page (`sr-inline-btn`, `sr-confirm-btn`, `sr-cta-btn`) :
   casse normale, graisse 700, radius de contrôle. */
.sr-wizard-nav :deep(.v-btn) {
  text-transform: none;
  letter-spacing: normal;
  font-weight: 700;
  border-radius: var(--fb-radius-control, 8px);
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
  /* clip (pas hidden) : même écrêtage au radius, mais SANS créer de scroll
     container — le pied sticky des 3 étapes colle au bas du viewport. */
  overflow: clip;
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

/* fiche 314-01 — onglets étape 1 (PDV à stocker / Espaces de stockage). */
.sr-stock-tabs {
  display: flex;
  gap: 6px;
  padding: 10px 16px 0;
}
.sr-stock-tab-active {
  background: var(--sr-primary);
  border-color: var(--sr-primary);
  color: #fff;
}
.sr-stock-tab-active:hover:not(:disabled) {
  background: var(--sr-primary);
  border-color: var(--sr-primary);
}

/* fiche 314-01 — groupes par espace de stockage. */
.sr-storage-group {
  padding: 8px 16px 4px;
}
.sr-storage-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  font-weight: 700;
  color: #334155;
  margin: 6px 0 4px;
}
.sr-storage-alerts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 3px;
}
.sr-storage-alert {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border-radius: 6px;
  padding: 2px 7px;
  font-size: 0.72rem;
  font-weight: 700;
}
.sr-storage-alert--min {
  background: #fef2f2;
  color: #b91c1c;
}
.sr-storage-alert--max {
  background: #fff7ed;
  color: #c2410c;
}

/* fiche 314-01 — Item Supplier Name (étape 1, onglet PDV). */
.sr-setting-supplier {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #64748b;
  font-size: 0.74rem;
}
.sr-supplier-edit-btn {
  appearance: none;
  border: none;
  background: none;
  padding: 1px;
  cursor: pointer;
  color: #64748b;
  display: inline-flex;
  align-items: center;
}
.sr-supplier-edit-btn:hover {
  color: var(--sr-primary);
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
  /* Lot 4 — 2 rangs : [case | nom+compo | curseur], puis la ligne de valeurs
     sur les colonnes 2-3 ; cf. override plus bas. */
  grid-template-columns: 26px minmax(160px, 1fr) minmax(190px, 280px);
  gap: 6px 14px;
  align-items: start;
  padding: 12px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fff;
}

/* Lignes storage : PAS de checkbox, donc pas de colonne 26px — sans cette
   règle, l'auto-placement met le nom dans la colonne de la case (26px) et il
   s'affiche un caractère par ligne. */
.sr-setting-row.sr-storage-row {
  grid-template-columns: minmax(160px, 1fr) minmax(190px, 280px);
}

.sr-setting-row.sr-storage-row .sr-values {
  grid-column: 1 / -1;
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

/* Lot 4 — les 4 valeurs sur UNE ligne, en rang 2 de la grille (sous le nom et
   le curseur). Les deux rangs BESOIN/ACHAT du Lot 3 prenaient trop de hauteur ;
   la sémantique est portée par l'infobulle. */
.sr-values {
  grid-column: 2 / -1;
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-top: 2px;
  padding: 6px 10px;
  border: 1px solid var(--sr-border, #e5e7eb);
  border-radius: 8px;
  background: var(--sr-subtle, #fafafa);
}

.sr-value {
  display: flex;
  align-items: baseline;
  gap: 5px;
  min-width: 0;
}

.sr-value-buy {
  margin-left: auto;
}

.sr-value-label {
  font-size: 0.6875rem;
  color: var(--sr-muted, #6b7280);
}

.sr-value-num {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--sr-text, #212121);
  font-variant-numeric: tabular-nums;
}

/* Équivalent « Information inventaire » (« (250 Packs de 4 pc) ») en
   secondaire à côté du nombre brut — ne doit pas concurrencer la valeur. */
.sr-pack-equiv {
  color: var(--sr-muted, #6b7280);
  font-size: 0.7rem;
  font-weight: 500;
  white-space: nowrap;
}

/* La valeur du slider storage porte aussi l'équivalent conditionnement :
   la largeur fixe (44px) prévue pour un nombre seul ne suffit plus. */
.sr-storage-row .sr-slider-value {
  width: auto;
  min-width: 44px;
}

.sr-value-ok {
  color: #16a34a;
}

.sr-value-dash {
  color: var(--sr-faint, #9ca3af);
  font-weight: 400;
}

/* Lot 5 — bandeau « plusieurs évènements cumulés » du panneau Événements. */
.sr-multi-event-hint {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0 16px 12px;
  padding: 8px 10px;
  border: 1px solid var(--sr-border, #e5e7eb);
  border-left: 3px solid var(--sr-primary, #ff3131);
  border-radius: 8px;
  background: var(--sr-subtle, #fafafa);
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--sr-muted, #6b7280);
}

.sr-multi-event-btn {
  margin-left: auto;
  padding: 3px 8px;
  border: 1px solid var(--sr-border, #e5e7eb);
  border-radius: 6px;
  background: var(--sr-surface, #fff);
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--sr-text, #212121);
  cursor: pointer;
}

.sr-multi-event-btn:hover {
  border-color: var(--sr-primary, #ff3131);
  color: var(--sr-primary, #ff3131);
}

.sr-values-loading {
  font-style: italic;
  color: var(--sr-faint, #9ca3af);
  font-size: 0.72rem;
}

.sr-values-help,
.sr-deposit-help {
  color: var(--sr-faint, #9ca3af);
  cursor: help;
}

/* L'icône suit la valeur « À déposer » sur la même ligne : l'espacement vient
   du gap de .sr-deposit-main, pas d'une marge (qui se cumulerait). */
.sr-deposit-help {
  flex: none;
}

.sr-values-help-body p {
  margin: 0 0 6px;
  font-size: 0.75rem;
  line-height: 1.4;
}

.sr-values-help-body p:last-child {
  margin-bottom: 0;
}

.sr-values-help-detail {
  color: rgba(255, 255, 255, 0.75);
}

/* Colonne étroite : « À commander » repasse dans le flux au lieu d'être poussé
   à droite, sinon il se retrouve seul sur sa ligne. */
@media (max-width: 1400px) {
  .sr-value-buy {
    margin-left: 0;
  }
}

.sr-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 4px;
  font-size: 0.72rem;
  color: #94a3b8;
}

.sr-breakdown-loading {
  font-style: italic;
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
/* Compteur boutiques + « Tout confirmer » par carte article (vue Par article). */
.sr-group-head-end { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

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

/* Détail « utilisé dans » par menu item d'un article partagé (BUG-288-01). */
.sr-source-breakdown {
  list-style: none;
  margin: 2px 0 0;
  padding: 0;
}

.sr-source-breakdown li {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  max-width: 280px;
}

/* Rendu identique dans la table (hérite de `.sr-table td span`) et dans l'en-tête
   de groupe du mode « par article » (qui, lui, n'hérite de rien). */
.sr-source-breakdown li span {
  display: block;
  margin-top: 0;
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--sr-muted, #64748b);
}

.sr-source-breakdown li span:last-child {
  flex: none;
  font-variant-numeric: tabular-nums;
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
  .sr-values {
    grid-column: 2;
  }

  /* Variante storage (sans colonne checkbox) : une seule colonne pleine largeur. */
  .sr-setting-row.sr-storage-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .sr-setting-row.sr-storage-row .sr-setting-info,
  .sr-setting-row.sr-storage-row .sr-slider-wrap,
  .sr-setting-row.sr-storage-row .sr-values {
    grid-column: 1;
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
  /* Remplit .sr-content : chaque colonne borne sa propre hauteur + overflow.
     La ligne unique est bornée à la hauteur du conteneur (minmax(0,1fr)) sinon
     max-height:100% des colonnes ne borne rien et le scroll interne ne marche pas. */
  grid-template-rows: minmax(0, 1fr);
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
/* Panneau filtres replié (cas réel du WorkspacePanelToggle) : le centre
   récupère la track de gauche au lieu de s'écraser dedans. */
.sr-body.sr-body--no-aside { grid-template-columns: minmax(0, 1fr) 340px; }

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
  overflow: clip;
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
  /* Lot 4 — 2 rangs : [case | nom+compo | curseur] puis la ligne de valeurs
     étalée sur les colonnes 2-3. La 4e piste de 78px du Lot 2 n'avait aucun
     enfant : elle mangeait 78px + un gap à droite de chaque ligne. */
  grid-template-columns: 24px minmax(260px, 1fr) minmax(220px, 260px);
  gap: 6px 12px;
  align-items: start;
  min-height: 68px;
  padding: 9px 12px;
  border-radius: 10px;
  box-shadow: none !important;
}

.sr-setting-row:hover {
  border-color: var(--fb-border-strong, #d1d5db) !important;
  box-shadow: 0 3px 12px rgba(15, 23, 42, 0.05) !important;
}

.sr-include-toggle input {
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
  .sr-values {
    grid-column: 2;
  }

  /* Variante storage (sans colonne checkbox) : une seule colonne pleine largeur. */
  .sr-setting-row.sr-storage-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .sr-setting-row.sr-storage-row .sr-setting-info,
  .sr-setting-row.sr-storage-row .sr-slider-wrap,
  .sr-setting-row.sr-storage-row .sr-values {
    grid-column: 1;
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
/* fiche 314-01 — déclinaison contrat : onglet actif + libellés storage/supplier.
   Après les règles .sr-inline-btn du contrat (même spécificité, l'ordre tranche). */
.sr-stock-tab-active,
.sr-stock-tab-active:hover {
  border-color: var(--sr-primary);
  background: var(--sr-primary);
  color: #fff;
}
.sr-storage-group-title {
  color: var(--sr-text);
}
.sr-setting-supplier,
.sr-supplier-edit-btn {
  color: var(--sr-muted);
}
.sr-supplier-edit-btn:hover {
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
    /* Colonnes empilées : pas de borne de ligne (scroll rendu à la page). */
    grid-template-rows: none;
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
/* BUG-296-01 puis Lot 3 — ventilation étape 1 : valeurs lisibles sur fond
   sombre, verts/rouges éclaircis (parité méthode BUG-197). Les libellés et
   fonds des rangs suivent les tokens --sr-* (redéfinis en dark via --fb-*) ;
   seules les couleurs codées en dur sont reprises ici. */
.v-theme--dataFridayDark .space-restock-view .sr-value-num {
  color: #cbd5e1;
}
.v-theme--dataFridayDark .space-restock-view .sr-pack-equiv {
  color: #94a3b8;
}
.v-theme--dataFridayDark .space-restock-view .sr-value-ok {
  color: #86efac;
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

/* --- Plans de réappro (RestockPlan, ADR-0005) --- */
.sr-plan-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  margin: 8px 0 0;
  border: 1px solid var(--fb-primary, #2563eb);
  border-radius: 8px;
  background: var(--fb-primary-soft, rgba(37, 99, 235, 0.08));
  color: var(--fb-text, #111827);
  font-size: 0.8125rem;
}
.sr-plan-banner__icon {
  color: var(--fb-primary, #2563eb);
  flex-shrink: 0;
}
.sr-plan-banner__text {
  flex: 1;
  min-width: 0;
}
.sr-plan-banner__dirty {
  color: var(--fb-warning, #d97706);
}
.sr-plan-banner__btn {
  flex-shrink: 0;
}
.sr-deposit-edit {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.sr-deposit-field {
  max-width: 110px;
}
/* Ligne 1 : quantité, unité de colis et infobulle alignées sur la même
   ligne de base — l'icône ne doit jamais passer sous le conditionnement. */
.sr-deposit-main {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}
/* Ligne 2 : conditionnement détaillé + rappel en unités de recette. */
.sr-deposit-sub {
  display: block;
  font-size: 11px;
  font-weight: 500;
  color: var(--sr-muted, #64748b);
}
.sr-deposit-edited {
  color: var(--fb-warning, #d97706);
}
.sr-plan-dialog-title {
  font-size: 1rem;
}
.sr-plan-guard-actions {
  flex-wrap: wrap;
  gap: 4px;
}
</style>
