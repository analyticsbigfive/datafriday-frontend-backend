<!--
  EventPredictMenusSection.vue
  ===========================
  Port 1:1 de versionReact/src/app/components/EventPredictMenusSection.tsx
  (1839 lignes). Voir docs/EVENT_PREDICT_SECTIONS.md pour la spec.

  Props clés (contrôlées par le parent EventPredictView) :
    - configuration       : { id, name, data:{ floors[], forecourt, externalMerch } } | null
    - menuItems           : MenuItemData[]
    - ingredients         : IngredientItem[]
    - components          : ComponentDefinition[]
    - suppliers           : SupplierItem[]
    - spaceId             : string
    - eventId             : string
    - predictedTimelineData : record[] (already weighted)
    - selectedMenuItems   : Object<elementId, string[]>  (bridged → Map en interne)
    - quantityAdjustments : Object<"elementId-menuItemId", percent>
    - viewMode            : 'shop' | 'item'
  Emits :
    - update:selectedMenuItems(Object)
    - update:quantityAdjustments(Object)
-->

<template>
  <!-- Empty state : chargement en cours (données / scoring). On n'affiche
       JAMAIS « aucun article » tant que le contexte est 'loading'. -->
  <div
    v-if="itemsContext === 'loading'"
    class="ep-menus-empty flex flex-col items-center justify-center py-12 text-muted-foreground"
  >
    <v-progress-circular indeterminate size="28" width="3" color="primary" class="mb-3" />
    <p class="text-center">{{ t('epItemsLoading') }}</p>
  </div>

  <!-- Empty state : mapping manquant → message orientant vers config / mapping. -->
  <div
    v-else-if="itemsContext === 'no-mapping'"
    class="ep-menus-empty flex flex-col items-center justify-center py-12 text-muted-foreground"
  >
    <v-icon size="48" class="opacity-50 mb-4">mdi-alert-circle-outline</v-icon>
    <p class="text-center">{{ t('epNoItemsPrediction') }}</p>
  </div>

  <!-- Empty state : prédiction pas encore calculée. Event futur SANS historique
       comparable → propose « Démarrez une estimation » (Estimation 0, fiche
       311_01) : la grille se rendra depuis le Space Menu, prédictions à 0. -->
  <div
    v-else-if="itemsContext === 'not-calculated'"
    class="ep-menus-empty flex flex-col items-center justify-center py-12 text-muted-foreground"
  >
    <v-icon size="48" class="opacity-50 mb-4">mdi-alert-circle-outline</v-icon>
    <p class="text-center" :class="{ 'mb-4': canStartEstimation }">
      {{ canStartEstimation ? t('epStartEstimationHint') : t('epNoItemsPrediction') }}
    </p>
    <Button v-if="canStartEstimation" size="sm" @click="$emit('start-estimation')">
      <v-icon size="16" class="mr-1">mdi-pencil-ruler</v-icon>
      {{ t('epStartEstimation') }}
    </Button>
  </div>

  <!-- Empty state PRIORITAIRE config : aucun point de vente assigné. On n'invente
       PAS de shops synthétiques → message + lien vers Space Menus. -->
  <div
    v-else-if="itemsContext === 'no-config' && !configHasShops"
    class="ep-menus-empty flex flex-col items-center justify-center py-12 text-muted-foreground"
  >
    <v-icon size="48" class="opacity-50 mb-4">mdi-store-off-outline</v-icon>
    <p class="text-center mb-1 font-medium">{{ t('epmNoConfigShopsTitle') }}</p>
    <p class="text-center text-sm mb-4">{{ t('epmNoConfigShopsHint') }}</p>
    <Button size="sm" @click="goToSpaceMenus">
      <v-icon size="16" class="mr-1">mdi-storefront-plus-outline</v-icon>
      {{ t('epmAddShopsSpaceMenus') }}
    </Button>
  </div>

  <!-- Empty state : configuration absente -->
  <div
    v-else-if="itemsContext === 'no-config'"
    class="ep-menus-empty flex flex-col items-center justify-center py-12 text-muted-foreground"
  >
    <v-icon size="48" class="opacity-50 mb-4">mdi-storefront-outline</v-icon>
    <p class="text-center">{{ t('epmEmptyNoConfig') }}</p>
  </div>

  <!-- 'ready' mais aucune donnée dérivable (liste réellement vide). -->
  <div
    v-else-if="fbElements.length === 0"
    class="ep-menus-empty flex flex-col items-center justify-center py-12 text-muted-foreground"
  >
    <v-icon size="48" class="opacity-50 mb-4">mdi-tray-remove</v-icon>
    <p class="text-center">{{ t('epNoItems') }}</p>
  </div>

  <div v-else class="ep-menus space-y-4">
    <!-- Warning Lot 1 : aucun menu item assigné aux shops de la config.
         Les quantités restent affichées (fallback), mais le rattachement
         nominal n'est pas garanti tant que l'attribution n'est pas faite. -->
    <v-alert
      v-if="menuAssignmentMissing"
      type="warning"
      variant="tonal"
      density="compact"
      class="ep-menus-assign-warning"
    >
      {{ t('epmAssignmentMissing') }}
    </v-alert>
    <!-- Estimation 0 (fiche 311_01) : bandeau du mode — la grille vient du
         Space Menu, prédictions à 0, tout se saisit à la main. Fiche 311_02 :
         champ « échelle max » des sliders fan-out absolus (0 → N unités). -->
    <v-alert
      v-if="estimationActive"
      type="info"
      variant="tonal"
      density="compact"
      class="ep-menus-assign-warning"
    >
      <div class="ep-estimation-banner-row">
        <span>{{ t('epEstimationModeBanner') }}</span>
        <label class="ep-estimation-scale" @click.stop>
          <span>{{ t('epmEstimationScaleMax') }}</span>
          <input
            type="number"
            min="10"
            step="10"
            :value="estimationScaleMax"
            :aria-label="t('epmEstimationScaleMax')"
            @change="onEstimationScaleMax($event.target.value)"
          />
        </label>
      </div>
    </v-alert>
    <!-- ============================================================
         SHOP VIEW
         ============================================================ -->
    <Tabs
      v-if="viewMode === 'shop'"
      :value="shopStatusTab"
      class="w-full"
      @update:value="(v) => (shopStatusTab = v)"
    >
      <div class="ep-toolbar flex items-center gap-2 flex-wrap">
        <div class="ep-toolbar-search">
          <v-icon size="16" class="ep-toolbar-search-icon">mdi-magnify</v-icon>
          <input
            type="text"
            class="ep-toolbar-search-input"
            :placeholder="t('epmSearchShopsItems')"
            :value="searchQuery"
            @input="(e) => (searchQuery = e.target.value || '')"
          />
        </div>
        <TabsList class="ep-toolbar-tabs flex-shrink-0">
          <TabsTrigger value="open" class="flex items-center gap-2">
            <v-icon size="16">mdi-check-circle-outline</v-icon>
            {{ t('epmTabOpen') }}
            <Badge variant="secondary" class="ml-1">{{ openShopsCount }}</Badge>
          </TabsTrigger>
          <TabsTrigger value="closed" class="flex items-center gap-2">
            <v-icon size="16">mdi-close</v-icon>
            {{ t('epmTabClosed') }}
            <Badge variant="secondary" class="ml-1">{{ closedShopsCount }}</Badge>
          </TabsTrigger>
        </TabsList>
        <!-- Chips-filtres orphelins (maquettes 08/2026) : compteurs globaux,
             chip actif → ne garde que les cartes concernées + bascule leur
             bucket interne sur la catégorie filtrée. -->
        <div class="ep-chip-filters flex-shrink-0">
          <button
            type="button"
            class="ep-chip-filter ep-chip-filter--nopred"
            :class="{ 'ep-chip-filter--on': globalChipFilter === 'noSales' }"
            :aria-pressed="globalChipFilter === 'noSales' ? 'true' : 'false'"
            :title="t('epmChipNoForecastHint')"
            @click="toggleGlobalChip('noSales')"
          >
            <span class="ep-chip-filter-dot"></span>
            {{ t('epmChipNoForecast') }}
            <Badge variant="secondary" class="ml-1">{{ globalChipCounts.noSales }}</Badge>
          </button>
          <button
            type="button"
            class="ep-chip-filter ep-chip-filter--outmenu"
            :class="{ 'ep-chip-filter--on': globalChipFilter === 'unmapped' }"
            :aria-pressed="globalChipFilter === 'unmapped' ? 'true' : 'false'"
            :title="t('epmChipOutsideMenuHint')"
            @click="toggleGlobalChip('unmapped')"
          >
            <span class="ep-chip-filter-dot"></span>
            {{ t('epmChipOutsideMenu') }}
            <Badge variant="secondary" class="ml-1">{{ globalChipCounts.unmapped }}</Badge>
          </button>
        </div>
      </div>

      <TabsContent :value="shopStatusTab" class="mt-4 space-y-6 ep-shop-tab-content">
        <div
          v-if="filteredElementsFlat.length === 0"
          class="text-center py-8 text-muted-foreground"
        >
          <p>{{ t('epmNoShopsFoundPrefix') }}{{ shopStatusTab === 'open' ? t('epmTabOpen') : t('epmTabClosed') }}{{ t('epmNoShopsFoundSuffix') }}</p>
        </div>
        <!-- Groupe supérieur (type composite, ex. « GP Premium ») supprimé :
             on liste directement les PDV correspondant aux ventes. Le total
             est porté par les compteurs Open / Closed (= nombre de shops). -->
        <div class="ep-shop-flat-list space-y-3">
          <Card
            v-for="element in filteredElementsFlat"
            :key="element.id"
            class="ep-shop-card"
          >
                  <Collapsible
                    :open="isShopExpanded(element.id)"
                    @update:open="(open) => setShopExpanded(element.id, open)"
                  >
                    <CardHeader class="ep-shop-card-header transition-colors">
                      <div class="ep-shop-card-grid">
                        <div class="ep-shop-card-main">
                          <img
                            v-if="element.picture"
                            :src="element.picture"
                            :alt="element.name"
                            class="ep-shop-card-image"
                            loading="lazy"
                            decoding="async"
                            @click="toggleShopExpanded(element.id)"
                          />
                          <div class="ep-shop-card-content">
                            <div
                              class="ep-shop-card-title-row ep-shop-card-summary"
                              role="button"
                              tabindex="0"
                              :aria-expanded="isShopExpanded(element.id)"
                              @click="toggleShopExpanded(element.id)"
                              @keydown.enter.prevent="toggleShopExpanded(element.id)"
                              @keydown.space.prevent="toggleShopExpanded(element.id)"
                            >
                              <CardTitle class="ep-shop-card-title">{{ element.name }}</CardTitle>
                              <div class="ep-shop-card-revenue">
                                <span class="ep-revenue-pill">
                                  <span class="ep-revenue-label">{{ t('epmGross') }}</span>
                                  <strong>{{ formatCurrency(getPredictedRevenue(element.id)) }}</strong>
                                </span>
                                <span class="ep-revenue-pill ep-revenue-pill-adjusted">
                                  <span class="ep-revenue-label">{{ t('epmAdjusted') }}</span>
                                  <strong>{{ formatCurrency(getAdjustedRevenue(element.id)) }}</strong>
                                </span>
                              </div>
                            </div>
                            <!-- Shop adjustment slider (1:1 React :1316-1355).
                                 Mode estimation (fiche 311_02) : la base prédite
                                 est 0 partout → % inopérant. Le slider devient
                                 ABSOLU (unités, 0 → échelle max) et écrit
                                 manualQuantities pour les items cochés. -->
                            <div
                              class="ep-shop-adjustment"
                              @click.stop
                              @pointerdown.stop
                            >
                              <div class="ep-shop-adjustment-row">
                                <div class="ep-shop-slider-wrap">
                                  <div class="ep-shop-slider-head">
                                    <Label class="ep-shop-slider-label">{{ estimationActive ? t('epmShopEstimationQty') : t('epmShopAdjustment') }}</Label>
                                    <span class="ep-shop-slider-value">
                                      <template v-if="estimationActive">{{ isShopEstimationMixed(element.id) ? t('epmMixed') : `${getShopEstimationQty(element.id)} u` }}</template>
                                      <template v-else>{{ getShopAdjustmentValue(element.id) }}%</template>
                                    </span>
                                  </div>
                                  <Slider
                                    v-if="estimationActive"
                                    :value="[getShopEstimationQty(element.id)]"
                                    :min="0"
                                    :max="shopEstimationSliderMax(element.id)"
                                    :step="1"
                                    :disabled="!isShopOpen(element.id)"
                                    class-name="ep-shop-slider"
                                    @update:value="(values) => handleShopEstimationQty(element.id, values[0])"
                                  />
                                  <Slider
                                    v-else
                                    :value="[getShopAdjustmentValue(element.id)]"
                                    :min="0"
                                    :max="500"
                                    :step="5"
                                    :disabled="!isShopOpen(element.id)"
                                    class-name="ep-shop-slider"
                                    @update:value="(values) => handleShopAdjustment(element.id, values[0])"
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  class="ep-shop-reset-btn"
                                  :disabled="!isShopOpen(element.id)"
                                  :title="estimationActive ? t('epmResetTo0') : t('epmResetTo100')"
                                  @click.stop="estimationActive ? handleShopEstimationQty(element.id, 0) : resetShopAdjustment(element.id)"
                                ><v-icon size="16">mdi-restore</v-icon></Button>
                              </div>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          class="ep-shop-chevron-btn"
                          :aria-expanded="isShopExpanded(element.id)"
                          :aria-label="isShopExpanded(element.id) ? t('epmCollapseShop') : t('epmExpandShop')"
                          @click.stop="toggleShopExpanded(element.id)"
                        >
                          <v-icon size="20">
                            {{ isShopExpanded(element.id) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                          </v-icon>
                        </button>
                      </div>
                    </CardHeader>
                    <CollapsibleContent>
                      <div class="border-t">
                        <div class="ep-shop-items-list">
                          <div class="p-3 space-y-2">
                            <p
                              v-if="getGroupedMenuItems(element).length === 0"
                              class="text-sm text-muted-foreground text-center py-4"
                            >{{ t('epmNoItemsForFilter') }}</p>
                            <template v-else>
                              <!-- Select All -->
                              <div class="flex items-center gap-2 p-2 border-b border-border bg-muted/30 rounded mb-2">
                                <Checkbox
                                  :model-value="getSelectAllCheckboxValue(element.id, 'shop')"
                                  @update:model-value="(v) => handleSelectAllForShop(element.id, v === true)"
                                />
                                <Label
                                  class="text-sm font-medium cursor-pointer"
                                  @click="onSelectAllLabelClickShop(element.id)"
                                >{{ t('epmSelectAllItems') }}</Label>
                              </div>
                              <!-- Recherche par shop (remplace les chips catégorie
                                   qui rallongeaient l'en-tête de l'accordéon). -->
                              <div class="ep-shop-search">
                                <v-icon size="16" class="ep-shop-search-icon">mdi-magnify</v-icon>
                                <input
                                  type="text"
                                  class="ep-shop-search-input"
                                  :placeholder="t('epmShopSearchPlaceholder')"
                                  :value="getShopSearchQuery(element.id)"
                                  @click.stop
                                  @input="(e) => setShopSearchQuery(element.id, e.target.value)"
                                />
                              </div>
                              <!-- 3 catégories mutuellement exclusives, en onglets
                                   (remplace la liste plate + accordéon « non
                                   rattachés ») : ventes prévues / non attachés au
                                   menu / sans ventes prévues. -->
                              <Tabs
                                :value="getShopTab(element.id)"
                                @update:value="(v) => setShopTab(element.id, v)"
                              >
                                <TooltipProvider>
                                <TabsList class="ep-toolbar-tabs ep-shop-tabs" @click.stop>
                                  <TabsTrigger value="sales" class="ep-shop-tab-trigger">
                                    {{ t('epmShopTabSales') }} ({{ getShopTabCounts(element).sales }})
                                    <Tooltip>
                                      <TooltipTrigger as-child>
                                        <v-icon size="14" class="ep-shop-tab-help" role="button" tabindex="0">mdi-help-circle-outline</v-icon>
                                      </TooltipTrigger>
                                      <TooltipContent>{{ t('epmShopTabSalesHint') }}</TooltipContent>
                                    </Tooltip>
                                  </TabsTrigger>
                                  <TabsTrigger value="unmapped" class="ep-shop-tab-trigger">
                                    {{ t('epmShopTabUnmapped') }} ({{ getShopTabCounts(element).unmapped }})
                                    <Tooltip>
                                      <TooltipTrigger as-child>
                                        <v-icon size="14" class="ep-shop-tab-help" role="button" tabindex="0">mdi-help-circle-outline</v-icon>
                                      </TooltipTrigger>
                                      <TooltipContent>{{ t('epmShopTabUnmappedHint') }}</TooltipContent>
                                    </Tooltip>
                                  </TabsTrigger>
                                  <TabsTrigger value="noSales" class="ep-shop-tab-trigger">
                                    {{ t('epmShopTabNoSales') }} ({{ getShopTabCounts(element).noSales }})
                                    <Tooltip>
                                      <TooltipTrigger as-child>
                                        <v-icon size="14" class="ep-shop-tab-help" role="button" tabindex="0">mdi-help-circle-outline</v-icon>
                                      </TooltipTrigger>
                                      <TooltipContent>{{ t('epmShopTabNoSalesHint') }}</TooltipContent>
                                    </Tooltip>
                                  </TabsTrigger>
                                </TabsList>
                                </TooltipProvider>
                              </Tabs>
                              <p
                                v-if="getActiveBucketItems(element).length === 0"
                                class="text-sm text-muted-foreground text-center py-4"
                              >{{ t('epmNoItemsForFilter') }}</p>
                              <template
                                v-for="item in getActiveBucketItems(element)"
                                :key="item.id"
                              >
                              <div
                                :class="[
                                  'ep-menu-item-row flex items-start gap-3 p-2 rounded border border-border',
                                  item._bucket === 'unmapped' ? 'ep-unmapped-row' : '',
                                  item._bucket === 'unmapped' ? 'ep-row-hors-menu' : '',
                                  isMenuItemSelected(element.id, item.id)
                                    ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                                    : item.isAvailable
                                      ? 'bg-card'
                                      : 'bg-orange-50 dark:bg-orange-950/20'
                                ]"
                              >
                                <img
                                  v-if="item.picture"
                                  :src="item.picture"
                                  :alt="item.name"
                                  loading="lazy"
                                  decoding="async"
                                  :class="['w-12 h-12 rounded object-cover flex-shrink-0', !item.isAvailable && 'grayscale']"
                                />
                                <div class="flex-1 min-w-0">
                                  <div class="ep-menu-item-head flex items-start justify-between gap-2">
                                    <div class="min-w-0 flex-1">
                                      <div class="ep-menu-item-line">
                                      <p class="ep-menu-item-title font-medium text-sm">
                                        {{ item.name }} - {{ formatCurrency(htUnitPrice(item)) }} HT
                                        <span v-if="itemUnitCost(item) != null" class="text-xs text-muted-foreground">
                                          · {{ t('epmCostLabel') }} {{ formatCurrency(itemUnitCost(item)) }}
                                        </span>
                                        <span
                                          v-if="itemMargin(item) != null"
                                          class="text-xs font-medium"
                                          :class="itemMargin(item) >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'"
                                        >
                                          · {{ t('epmMarginLabel') }} {{ Math.round(itemMargin(item)) }}%
                                        </span>
                                        <span
                                          v-if="hasAberrantCost(item)"
                                          class="ep-cost-alert-badge"
                                          :title="t('epmCostAbovePriceTitle')"
                                        ><v-icon size="12">mdi-alert</v-icon> {{ t('epmCostAbovePriceBadge') }}</span>
                                        <!-- Cible d'un alias : ses prévisions
                                             viennent de l'historique de la source. -->
                                        <span
                                          v-if="aliasSourceByTarget.has(String(item.id))"
                                          class="ep-map-badge ep-map-badge--history"
                                          :title="t('epmHistoryTitle') + ' ' + aliasSourceByTarget.get(String(item.id))"
                                        >{{ t('epmHistoryBadge') }}</span>
                                      </p>
                                      <span v-if="item._bucket === 'unmapped'" class="ep-unmapped-actions">
                                        <span
                                          class="ep-map-badge ep-map-badge--unmapped"
                                          :title="rowAddKind(element, item.id, item.name) === 'reactivate'
                                            ? t('epmDisabledTitle')
                                            : t('epmOutsideMenuTitle')"
                                        >{{ rowAddKind(element, item.id, item.name) === 'reactivate' ? t('epmDisabledBadge') : t('epmOutsideMenuBadge') }}</span>
                                        <EventPredictRowActions
                                          :kind="rowAddKind(element, item.id, item.name)"
                                          allow-history
                                          @remap="$emit('remap-request', { shopName: element.name, elementId: element.id, soldItem: { id: item.id, name: item.name } })"
                                          @add="emitAddToMenu(element, item)"
                                          @open-space-menus="goToSpaceMenus"
                                          @use-history="$emit('history-alias-request', { shopName: element.name, elementId: element.id, item: { id: item.id, name: item.name } })"
                                        />
                                      </span>
                                      <template v-else-if="item._ghost">
                                        <span
                                          class="ep-map-badge ep-map-badge--unmapped"
                                          :title="t('epmGhostTitle')"
                                        >{{ t('epmGhostBadge') }}</span>
                                        <button
                                          type="button"
                                          class="ep-remap-btn"
                                          :title="t('epmRemoveFromMenuTitle')"
                                          @click.stop="removeAssignedItem(element, item)"
                                        ><v-icon size="13">mdi-link-variant-off</v-icon> {{ t('epmRemoveFromMenu') }}</button>
                                      </template>
                                      <!-- BUG-291-02 : assigné au menu du PDV mais
                                           NON DISPONIBLE côté serveur (recette
                                           absente / ingrédient bloqué) → 0 vente
                                           prévue, mais on le laisse visible avec
                                           sa raison plutôt que de le faire
                                           disparaître sans explication. -->
                                      <span
                                        v-else-if="item._serverUnavailable"
                                        class="ep-map-badge ep-map-badge--unavailable"
                                        :title="t('epmUnavailableTitle')"
                                      >{{ t('epmUnavailableBadge') }}</span>
                                      <span
                                        v-else-if="itemMapStatus(element, item.id) === 'remapped'"
                                        class="ep-map-badge ep-map-badge--remapped"
                                        :title="t('epmRemappedTitle')"
                                      >{{ t('epmRemappedBadge') }}</span>
                                      <!-- Ligne « sans ventes prévues » (prédit 0,
                                           ni fantôme ni indisponible) : kebab
                                           historique seul — reprendre l'historique
                                           d'un ancien article (maquettes 08/2026). -->
                                      <span
                                        v-else-if="item._bucket === 'noSales'"
                                        class="ep-unmapped-actions"
                                      >
                                        <EventPredictRowActions
                                          allow-history
                                          history-only
                                          @open-space-menus="goToSpaceMenus"
                                          @use-history="$emit('history-alias-request', { shopName: element.name, elementId: element.id, item: { id: item.id, name: item.name } })"
                                        />
                                      </span>
                                      </div>
                                      <p v-if="item.category" class="text-xs text-muted-foreground">{{ item.category }}</p>
                                      <!-- Qty controls — visibles pour les articles du
                                           menu OU tout article non-attaché COCHÉ (il
                                           compte alors dans le CA ajusté et se règle). -->
                                      <div
                                        v-if="item._bucket !== 'unmapped' || isMenuItemSelected(element.id, item.id)"
                                        class="ep-menu-item-controls mt-2"
                                      >
                                        <div
                                          v-if="getPredictedQuantity(element.id, item.id) === 0 && isMenuItemSelected(element.id, item.id)"
                                          class="ep-menu-item-slider-row flex items-center gap-2"
                                        >
                                          <Label class="text-xs text-muted-foreground whitespace-nowrap">{{ t('epmManualQty') }}</Label>
                                          <v-icon
                                            size="14"
                                            class="ep-manual-info-icon"
                                            role="button"
                                            tabindex="0"
                                            style="cursor: pointer; opacity: 0.6;"
                                            :title="t('epmManualQtyWhy')"
                                            @click.stop="$emit('manual-info')"
                                            @keyup.enter.stop="$emit('manual-info')"
                                          >mdi-information-outline</v-icon>
                                          <Slider
                                            :value="[getManualQuantity(element.id, item.id)]"
                                            :min="0"
                                            :max="manualSliderMax(element.id, item.id)"
                                            :step="1"
                                            :disabled="!isShopOpen(element.id)"
                                            class="flex-1"
                                            @update:value="(values) => handleManualQuantity(element.id, item.id, values[0])"
                                          />
                                          <input
                                            type="number"
                                            min="0"
                                            class="ep-manual-qty-input"
                                            :disabled="!isShopOpen(element.id)"
                                            :aria-label="t('epmManualQtyInputAria')"
                                            :value="getManualQuantity(element.id, item.id)"
                                            @change="(e) => handleManualQuantity(element.id, item.id, e.target.value)"
                                          />
                                          <span class="text-xs text-muted-foreground">{{ t('epmUnits') }}</span>
                                          <span
                                            v-if="getAdjustedQuantity(element.id, item.id) !== getManualQuantity(element.id, item.id)"
                                            class="text-xs text-primary whitespace-nowrap"
                                            :title="t('epmShopAdjustment')"
                                          >→ {{ getAdjustedQuantity(element.id, item.id) }} {{ t('epmUnitAbbr') }}</span>
                                        </div>
                                        <div v-else-if="getPredictedQuantity(element.id, item.id) > 0" class="ep-menu-item-slider-row flex items-center gap-2">
                                          <Slider
                                            :value="[getAdjustedQuantity(element.id, item.id)]"
                                            :min="0"
                                            :max="unitSliderMax(element.id, item.id)"
                                            :step="1"
                                            :disabled="!isShopOpen(element.id)"
                                            class="flex-1"
                                            @update:value="(values) => setItemUnits(element.id, item.id, values[0])"
                                          />
                                          <span class="text-xs text-muted-foreground w-16 text-right">
                                            {{ getAdjustedQuantity(element.id, item.id) }} {{ t('epmUnitAbbr') }}
                                          </span>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            class="h-6 w-6 p-0"
                                            :disabled="!isShopOpen(element.id)"
                                            :title="t('epmResetTo100')"
                                            @click.stop="handleQuantityAdjustment(element.id, item.id, 100)"
                                          ><v-icon size="12">mdi-restore</v-icon></Button>
                                        </div>
                                      </div>
                                      <p
                                        v-if="!item.isAvailable && item.missingIngredients && item.missingIngredients.length"
                                        class="text-xs text-orange-600 dark:text-orange-400 mt-1"
                                      >{{ t('epmMissing') }} {{ item.missingIngredients.join(', ') }}</p>
                                      <!-- Aucune recette du tout : `missingIngredients`
                                           est vide, la ligne « Manquant » ne dirait
                                           rien — on nomme la vraie cause. -->
                                      <p
                                        v-else-if="item._serverNoRecipe"
                                        class="text-xs text-orange-600 dark:text-orange-400 mt-1"
                                      >{{ t('epmNoRecipe') }}</p>
                                    </div>
                                    <div class="ep-menu-item-quantity flex items-center gap-3 flex-shrink-0">
                                      <p class="font-medium text-sm whitespace-nowrap">
                                        {{ getPredictedQuantity(element.id, item.id) }} -
                                        {{ t('epmAdjustedColon') }} {{ getAdjustedQuantity(element.id, item.id) }}
                                      </p>
                                      <Checkbox
                                        :model-value="itemCheckboxState(element, item.id)"
                                        @update:model-value="(v) => onItemCheckboxChange(element, item.id, v, item)"
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                              </template>
                            </template>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
          </Card>
        </div>
      </TabsContent>
    </Tabs>

    <!-- ============================================================
         ITEM VIEW
         ============================================================ -->
    <Tabs
      v-else
      :value="itemTypeTab"
      class="w-full"
      @update:value="(v) => (itemTypeTab = v)"
    >
      <div class="ep-toolbar flex items-center gap-2 flex-wrap">
        <div class="ep-toolbar-search">
          <v-icon size="16" class="ep-toolbar-search-icon">mdi-magnify</v-icon>
          <input
            type="text"
            class="ep-toolbar-search-input"
            :placeholder="t('epmSearchItemsShops')"
            :value="searchQuery"
            @input="(e) => (searchQuery = e.target.value || '')"
          />
        </div>
        <!-- Chips catégories défilables : flèches G/D + viewport scroll horizontal.
             La TabsList (composant partagé) n'est PAS modifiée ; on l'enveloppe. -->
        <div class="ep-cat-scroller flex-shrink-0">
          <button
            type="button"
            class="ep-cat-arrow ep-cat-arrow--left"
            :aria-label="t('epmScrollLeft')"
            @click="scrollCategories(-1)"
          >
            <v-icon size="18">mdi-chevron-left</v-icon>
          </button>
          <div ref="catViewport" class="ep-cat-viewport">
            <TabsList class="ep-toolbar-tabs">
              <TabsTrigger
                v-for="chip in itemViewCategoryChips()"
                :key="chip.key"
                :value="chip.key"
                class="flex items-center gap-2"
              >
                {{ chip.label }}
                <Badge variant="secondary" class="ml-1">{{ chip.count }}</Badge>
              </TabsTrigger>
            </TabsList>
          </div>
          <button
            type="button"
            class="ep-cat-arrow ep-cat-arrow--right"
            :aria-label="t('epmScrollRight')"
            @click="scrollCategories(1)"
          >
            <v-icon size="18">mdi-chevron-right</v-icon>
          </button>
        </div>
        <!-- Mêmes chips-filtres qu'en vue PDV : ici ils filtrent les entrées
             article (sans prévision / hors Space Menu). -->
        <div class="ep-chip-filters flex-shrink-0">
          <button
            type="button"
            class="ep-chip-filter ep-chip-filter--nopred"
            :class="{ 'ep-chip-filter--on': globalChipFilter === 'noSales' }"
            :aria-pressed="globalChipFilter === 'noSales' ? 'true' : 'false'"
            :title="t('epmChipNoForecastHint')"
            @click="toggleGlobalChip('noSales')"
          >
            <span class="ep-chip-filter-dot"></span>
            {{ t('epmChipNoForecast') }}
            <Badge variant="secondary" class="ml-1">{{ globalChipCounts.noSales }}</Badge>
          </button>
          <button
            type="button"
            class="ep-chip-filter ep-chip-filter--outmenu"
            :class="{ 'ep-chip-filter--on': globalChipFilter === 'unmapped' }"
            :aria-pressed="globalChipFilter === 'unmapped' ? 'true' : 'false'"
            :title="t('epmChipOutsideMenuHint')"
            @click="toggleGlobalChip('unmapped')"
          >
            <span class="ep-chip-filter-dot"></span>
            {{ t('epmChipOutsideMenu') }}
            <Badge variant="secondary" class="ml-1">{{ globalChipCounts.unmapped }}</Badge>
          </button>
        </div>
      </div>

      <TabsContent :value="itemTypeTab" class="mt-4 space-y-6 ep-item-tab-content">
        <div
          v-if="groupedItemViewEntries.length === 0"
          class="text-center py-8 text-muted-foreground"
        ><p>{{ t('epmNoMenuItems') }}</p></div>
        <div v-else class="space-y-3">
          <template
            v-for="entry in groupedItemViewEntries"
            :key="entry.menuItemId"
          >
          <div
            v-if="entry._isFirstUnmapped"
            class="ep-unmapped-header"
            role="button"
            tabindex="0"
            @click="toggleUnmappedItemView()"
            @keyup.enter="toggleUnmappedItemView()"
          >
            <v-icon size="16">{{ unmappedItemViewOpen ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
            <span>{{ t('epmUnmappedItemViewHint') }} ({{ unmappedItemViewCount() }})</span>
          </div>
          <Card
            v-if="entry._mapGroup !== 'unmapped' || unmappedItemViewOpen"
            class="overflow-hidden"
          >
            <Collapsible
              :open="expandedElements.has(entry.menuItemId)"
              @update:open="(open) => setElementExpanded(entry.menuItemId, open)"
            >
              <CardHeader class="hover:bg-muted/40 transition-colors p-4">
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-3 flex-1 min-w-0">
                    <img
                      v-if="entry.menuItem.picture"
                      :src="entry.menuItem.picture"
                      :alt="entry.menuItem.name"
                      class="w-12 h-12 rounded object-cover flex-shrink-0 cursor-pointer"
                      @click="toggleElementExpanded(entry.menuItemId)"
                    />
                    <div class="flex-1 min-w-0">
                      <div
                        class="ep-item-summary-row"
                        role="button"
                        tabindex="0"
                        :aria-expanded="expandedElements.has(entry.menuItemId)"
                        @click="toggleElementExpanded(entry.menuItemId)"
                        @keydown.enter.prevent="toggleElementExpanded(entry.menuItemId)"
                        @keydown.space.prevent="toggleElementExpanded(entry.menuItemId)"
                      >
                        <CardTitle class="ep-item-card-title truncate">
                          {{ entry.menuItem.name }}
                          <span
                            v-if="aliasSourceByTarget.has(String(entry.menuItemId))"
                            class="ep-map-badge ep-map-badge--history"
                            :title="t('epmHistoryTitle') + ' ' + aliasSourceByTarget.get(String(entry.menuItemId))"
                          >{{ t('epmHistoryBadge') }}</span>
                        </CardTitle>
                        <span
                          v-if="entry._mapGroup === 'unmapped'"
                          class="ep-map-badge ep-map-badge--unmapped"
                          :title="t('epmUnmappedTitle')"
                        >{{ t('epmUnmappedBadge') }}</span>
                        <div class="ep-item-summary-numbers">
                          <span class="ep-quantity-pill">
                            <span>{{ t('epmPred') }}</span>
                            <strong>{{ totalPredictedFor(entry) }}</strong>
                          </span>
                          <span class="ep-quantity-pill ep-quantity-pill-adjusted">
                            <span>{{ t('epmAdjusted') }}</span>
                            <strong>{{ totalAdjustedFor(entry) }}</strong>
                          </span>
                        </div>
                      </div>
                      <div class="flex items-center gap-2 mt-1">
                        <Badge
                          variant="outline"
                          :class="['text-xs', itemTypeBadgeColor(resolveItemCategoryLabel(entry.menuItem))]"
                        >{{ resolveItemCategoryLabel(entry.menuItem) }}</Badge>
                        <span class="text-xs text-muted-foreground">
                          {{ entry.shops.filter((s) => s.selected).length }} / {{ entry.shops.length }} {{ t('epmShopsSuffix') }}
                        </span>
                      </div>
                      <!-- Item adjustment slider. Mode estimation (fiche 311_02) :
                           slider ABSOLU (unités) — pose la même quantité sur tous
                           les PDV cochés de l'article. -->
                      <div
                        class="mt-3 pt-3 border-t border-border"
                        @click.stop
                        @pointerdown.stop
                      >
                        <div class="flex items-center gap-3">
                          <div class="flex-1">
                            <div class="flex items-center justify-between mb-1">
                              <Label class="text-xs text-muted-foreground">{{ estimationActive ? t('epmItemEstimationQty') : t('epmItemAdjustment') }}</Label>
                              <span class="text-xs font-medium">
                                <template v-if="estimationActive">{{ isItemEstimationMixed(entry.menuItemId) ? t('epmMixed') : `${getItemEstimationQty(entry.menuItemId)} u` }}</template>
                                <template v-else>{{ isItemAdjustmentMixed(entry.menuItemId) ? t('epmMixed') : `${getItemAdjustmentValue(entry.menuItemId)}%` }}</template>
                              </span>
                            </div>
                            <Slider
                              v-if="estimationActive"
                              :value="[getItemEstimationQty(entry.menuItemId)]"
                              :min="0"
                              :max="itemEstimationSliderMax(entry.menuItemId)"
                              :step="1"
                              :disabled="!entry.hasSelection"
                              class-name="w-full"
                              @update:value="(values) => handleItemEstimationQty(entry.menuItemId, values[0])"
                            />
                            <Slider
                              v-else
                              :value="[getItemAdjustmentValue(entry.menuItemId)]"
                              :min="0"
                              :max="500"
                              :step="5"
                              :disabled="!entry.hasSelection"
                              class-name="w-full"
                              @update:value="(values) => handleItemAdjustment(entry.menuItemId, values[0])"
                            />
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            class="flex-shrink-0 h-8 w-8 p-0"
                            :disabled="!entry.hasSelection"
                            :title="estimationActive ? t('epmResetTo0') : t('epmResetTo100')"
                            @click.stop="estimationActive ? handleItemEstimationQty(entry.menuItemId, 0) : resetItemAdjustment(entry.menuItemId)"
                          ><v-icon size="16">mdi-restore</v-icon></Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- Kebab niveau ARTICLE (demande maquette 08/2026) : ajouter
                       l'article à TOUS les PDV proposés dans Space Menus en un
                       clic. Masqué pour un item hors catalogue (le backend
                       ignorerait silencieusement l'id) ou si aucune assignation
                       Space Menus n'est active sur la config. Les kebabs par
                       PDV plus bas restent inchangés. -->
                  <EventPredictRowActions
                    v-if="assignmentFeatureActive() && spaceCatalogIdSet.has(String(entry.menuItemId))"
                    variant="item-header"
                    :assign-all-disabled="isItemAssignedEverywhere(entry.menuItemId)"
                    @assign-all="$emit('assign-item-all-shops', { menuItemId: entry.menuItemId, itemName: entry.menuItem.name })"
                    @open-space-menus="goToSpaceMenus"
                  />
                  <button
                    type="button"
                    class="ep-item-chevron-btn"
                    :aria-expanded="expandedElements.has(entry.menuItemId)"
                    :aria-label="expandedElements.has(entry.menuItemId) ? t('epmCollapseItem') : t('epmExpandItem')"
                    @click.stop="toggleElementExpanded(entry.menuItemId)"
                  >
                    <v-icon size="20">
                      {{ expandedElements.has(entry.menuItemId) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                    </v-icon>
                  </button>
                </div>
              </CardHeader>
              <CollapsibleContent>
                <CardContent class="pt-0">
                  <div class="ep-shop-items-list">
                    <div class="space-y-2">
                      <!-- Select All Shops -->
                      <div class="flex items-center gap-2 p-2 border-b border-border bg-muted/30 rounded mb-2">
                        <Checkbox
                          :model-value="getSelectAllCheckboxValue(entry.menuItemId, 'item')"
                          @update:model-value="(v) => handleSelectAllForMenuItem(entry.menuItemId, v === true)"
                        />
                        <Label
                          class="text-sm font-medium cursor-pointer"
                          @click="onSelectAllLabelClickItem(entry.menuItemId)"
                        >{{ t('epmSelectAllShops') }}</Label>
                      </div>
                      <div
                        v-for="shop in entry.shops"
                        :key="shop.element.id"
                        :class="[
                          'flex items-start gap-3 p-2 rounded border border-border',
                          (shop.assignmentLoaded && !shop.assigned) ? 'ep-row-hors-menu' : '',
                          shop.selected
                            ? 'bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800'
                            : isShopItemAvailable(shop.element, entry.menuItemId)
                              ? 'bg-card'
                              : 'bg-orange-50 dark:bg-orange-950/20'
                        ]"
                      >
                        <img
                          v-if="shop.element.picture"
                          :src="shop.element.picture"
                          :alt="shop.element.name"
                          :class="['w-12 h-12 rounded object-cover flex-shrink-0', !isShopItemAvailable(shop.element, entry.menuItemId) && 'grayscale']"
                        />
                        <div class="flex-1 min-w-0">
                          <div class="flex items-start justify-between gap-2">
                            <div class="min-w-0 flex-1">
                              <p class="font-medium text-sm truncate">
                                {{ shop.element.name }}
                                <span v-if="shop.assignmentLoaded && !shop.assigned" class="ep-unmapped-actions">
                                  <span
                                    class="ep-map-badge ep-map-badge--unmapped"
                                    :title="rowAddKind(shop.element, entry.menuItemId, entry.menuItem.name) === 'reactivate'
                                      ? t('epmDisabledTitle')
                                      : t('epmOutsideMenuTitle')"
                                  >{{ rowAddKind(shop.element, entry.menuItemId, entry.menuItem.name) === 'reactivate' ? t('epmDisabledBadge') : t('epmOutsideMenuBadge') }}</span>
                                  <EventPredictRowActions
                                    :kind="rowAddKind(shop.element, entry.menuItemId, entry.menuItem.name)"
                                    allow-history
                                    @remap="$emit('remap-request', { shopName: shop.element.name, elementId: shop.element.id, soldItem: { id: entry.menuItemId, name: entry.menuItem.name } })"
                                    @add="emitAddToMenu(shop.element, { id: entry.menuItemId, name: entry.menuItem.name })"
                                    @open-space-menus="goToSpaceMenus"
                                    @use-history="$emit('history-alias-request', { shopName: shop.element.name, elementId: shop.element.id, item: { id: entry.menuItemId, name: entry.menuItem.name } })"
                                  />
                                </span>
                                <!-- Pendant vue article du kebab « sans ventes
                                     prévues » : assigné, prédit 0 → historique seul. -->
                                <span
                                  v-else-if="shop.assignmentLoaded && shop.assigned && (shop.predictedQty || 0) === 0"
                                  class="ep-unmapped-actions"
                                >
                                  <EventPredictRowActions
                                    allow-history
                                    history-only
                                    @open-space-menus="goToSpaceMenus"
                                    @use-history="$emit('history-alias-request', { shopName: shop.element.name, elementId: shop.element.id, item: { id: entry.menuItemId, name: entry.menuItem.name } })"
                                  />
                                </span>
                              </p>
                              <!-- PDV sans historique (prédit 0, dans le menu, ouvert) :
                                   badge explicatif. La CASE pilote la simulation (Q2). -->
                              <div
                                v-if="canSimulateRow(shop)"
                                class="ep-nohist-row mt-2"
                                @click.stop
                                @pointerdown.stop
                              >
                                <span
                                  class="ep-map-badge ep-map-badge--nohist"
                                  :title="t('epmNeverSoldHint')"
                                >{{ t('epmNeverSold') }}</span>
                              </div>
                              <!-- Slider manuel révélé dès que l'article 0-vente est COCHÉ
                                   (la case remplace l'ancien toggle ; impacte le CA ajusté). -->
                              <div
                                v-if="canSimulateRow(shop) && shop.selected"
                                class="mt-2 flex items-center gap-2"
                                @click.stop
                                @pointerdown.stop
                              >
                                <Label class="text-xs text-muted-foreground whitespace-nowrap">{{ t('epmManualQty') }}</Label>
                                <Slider
                                  :value="[getManualQuantity(shop.element.id, entry.menuItemId)]"
                                  :min="0"
                                  :max="manualSliderMax(shop.element.id, entry.menuItemId)"
                                  :step="1"
                                  class="flex-1"
                                  @update:value="(values) => handleManualQuantity(shop.element.id, entry.menuItemId, values[0])"
                                />
                                <input
                                  type="number"
                                  min="0"
                                  class="ep-manual-qty-input"
                                  :aria-label="t('epmManualQtyInputAria')"
                                  :value="getManualQuantity(shop.element.id, entry.menuItemId)"
                                  @change="(e) => handleManualQuantity(shop.element.id, entry.menuItemId, e.target.value)"
                                />
                                <span class="text-xs text-muted-foreground">{{ t('epmUnits') }}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  class="h-6 w-6 p-0"
                                  :title="t('epmResetTo100')"
                                  @click.stop="handleManualQuantity(shop.element.id, entry.menuItemId, 0)"
                                ><v-icon size="12">mdi-restore</v-icon></Button>
                              </div>
                              <!-- Coché avec prédiction > 0 : slider d'ajustement en unités
                                   (inclut les non-attachés cochés → ajustables dans le CA). -->
                              <div v-if="shop.selected && shop.predictedQty > 0" class="mt-2">
                                <div class="flex items-center gap-2">
                                  <Slider
                                    :value="[getAdjustedQuantity(shop.element.id, entry.menuItemId)]"
                                    :min="0"
                                    :max="unitSliderMax(shop.element.id, entry.menuItemId)"
                                    :step="1"
                                    :disabled="!isShopOpen(shop.element.id)"
                                    class="flex-1"
                                    @update:value="(values) => setItemUnits(shop.element.id, entry.menuItemId, values[0])"
                                  />
                                  <span class="text-xs text-muted-foreground w-16 text-right">
                                    {{ getAdjustedQuantity(shop.element.id, entry.menuItemId) }} {{ t('epmUnitAbbr') }}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    class="h-6 w-6 p-0"
                                    :disabled="!isShopOpen(shop.element.id)"
                                    :title="t('epmResetTo100')"
                                    @click.stop="handleQuantityAdjustment(shop.element.id, entry.menuItemId, 100)"
                                  ><v-icon size="12">mdi-restore</v-icon></Button>
                                </div>
                              </div>
                            </div>
                            <div class="flex items-center gap-3 flex-shrink-0">
                              <p class="font-medium text-sm whitespace-nowrap">
                                {{ shop.predictedQty }} - {{ t('epmAdjustedColon') }} {{ shop.adjustedQty }}
                              </p>
                              <Checkbox
                                :model-value="itemCheckboxState(shop.element, entry.menuItemId)"
                                @update:model-value="(v) => onItemCheckboxChange(shop.element, entry.menuItemId, v, entry.menuItem)"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
          </template>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>

<script>
import { nextTick } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { normalizeStr } from '@/utils/predictiveAnalytics'
import {
  buildTimelineQuantityIndex,
  shopLookupKeys,
  itemLookupKeys,
  lookupPredictedQuantity,
} from '@/utils/predictedQuantityIndex'
import { menuItemPriceHt } from '@/utils/price'
import { uniformValue, applyFanoutQuantity, estimationSliderMax } from '@/utils/estimationMode'
import { resolveCatalogDims } from '@/utils/analyseReconciliation'
import Card from '../ui/card.vue'
import CardHeader from '../ui/cardHeader.vue'
import CardTitle from '../ui/cardTitle.vue'
import CardContent from '../ui/cardContent.vue'
import Collapsible from '../ui/collapsible.vue'
import CollapsibleTrigger from '../ui/collapsibleTrigger.vue'
import CollapsibleContent from '../ui/collapsibleContent.vue'
import Tabs from '../ui/tabs.vue'
import TabsList from '../ui/tabsList.vue'
import TabsTrigger from '../ui/tabsTrigger.vue'
import TabsContent from '../ui/tabsContent.vue'
import Slider from '../ui/slider.vue'
import Checkbox from '../ui/checkbox.vue'
import Input from '../ui/input.vue'
import Badge from '../ui/badge.vue'
import Button from '../ui/button.vue'
import Label from '../ui/label.vue'
import TooltipProvider from '../ui/tooltipProvider.vue'
import Tooltip from '../ui/tooltip.vue'
import TooltipContent from '../ui/tooltipContent.vue'
import TooltipTrigger from '../ui/tooltipTrigger.vue'
import EventPredictRowActions from './EventPredictRowActions.vue'
import { aliasSourceByTargetId } from '@/utils/historyAliases'

// Onglets UI = 'Food' | 'Beverage' | 'Combo'. Le vocabulaire RÉEL en base est
// FR+EN, casse mixte (ProductType : Nourriture/Boissons/Alcools/Food/Beverage/
// FOOD/BEVERAGE ; ProductCategory : Bières & Cidres/Vins & Champagnes/Softs/…).
// On normalise sur ce vocabulaire. Le Combo = flag `comboItem === 'Yes'` (colonne
// dédiée), PAS une catégorie. Cf. diag DB : MenuItem n'a que typeId/categoryId.
const BEV_TYPE_RE = /boisson|beverage|bevarage|alcool|drink|spiritueux/i
const FOOD_TYPE_RE = /nourriture|food|snack|plat|sandwich/i
const BEV_CAT_RE = /bi[eè]re|beer|cidre|vin|champagne|spiritueux|cocktail|shooter|soft|eau|water|jus|nectar|caf[eé]|th[eé]|boisson|soda/i

function normalizeToTypeTab({ type, category, comboItem } = {}) {
  const combo = String(comboItem || '').toLowerCase()
  if (combo === 'yes' || comboItem === true) return 'Combo'
  const t = String(type || '')
  if (BEV_TYPE_RE.test(t)) return 'Beverage'
  if (FOOD_TYPE_RE.test(t)) return 'Food'
  // Type absent/ambigu (typeId null en base pour bcp d'items) → repli catégorie.
  const c = String(category || '')
  if (BEV_CAT_RE.test(c)) return 'Beverage'
  return 'Food'
}

// Clé d'item pour les shops synthétiques (dérivés des ventes) : menuItemId mappé
// si présent, sinon le nom de l'item en minuscules. DOIT rester cohérente avec
// l'indexation de timelineDataIndex (shopId|menuItemId ET shopId|nom).
function synthItemKey(r) {
  const id = r.menuItemId || r.mappedMenuItemId
  if (id) return String(id)
  const nm = r.itemName || r.menuItemName
  return nm ? String(nm).toLowerCase() : ''
}

export default {
  name: 'EventPredictMenusSection',
  components: {
    Card, CardHeader, CardTitle, CardContent,
    Collapsible, CollapsibleTrigger, CollapsibleContent,
    Tabs, TabsList, TabsTrigger, TabsContent,
    Slider, Checkbox, Input, Badge, Button, Label,
    TooltipProvider, Tooltip, TooltipContent, TooltipTrigger,
    EventPredictRowActions,
  },
  props: {
    configuration: { type: Object, default: null },
    menuItems: { type: Array, default: () => [] },
    ingredients: { type: Array, default: () => [] },
    components: { type: Array, default: () => [] },
    suppliers: { type: Array, default: () => [] },
    spaceId: { type: String, default: '' },
    eventId: { type: String, default: '' },
    predictedTimelineData: { type: Array, default: () => [] },
    weezeventPriceMap: { type: Object, default: () => ({}) },
    /** Coûts réels Weezevent : { [productId]: MenuItem.totalCost } */
    weezeventCostMap: { type: Object, default: () => ({}) },
    /** Coûts unitaires par menuItemId (shop-details / store analyse) —
     *  fallback quand l'item n'a pas de unitCost/totalCost via mapping Weezevent. */
    menuItemCostMap: { type: Object, default: () => ({}) },
    /** Object<elementId, string[]> — sera pont\u00e9 vers Map en interne */
    selectedMenuItems: { type: Object, default: () => ({}) },
    /** Object<"elementId-menuItemId", percent> */
    quantityAdjustments: { type: Object, default: () => ({}) },
    /** Object<"elementId-menuItemId", unités absolues> — pour items prédit=0 */
    manualQuantities: { type: Object, default: () => ({}) },
    /** Object<nomShopLowercased, boolean> — open/closed par config (API /shops).
     *  Vide → fallback heuristique legacy (items sélectionnés). */
    isOpenByShop: { type: Object, default: () => ({}) },
    /** False = config de l'event sans aucun shop assigné (/shops par config = 0)
     *  → on affiche un message + lien Space Menus au lieu de shops synthétiques. */
    configHasShops: { type: Boolean, default: true },
    /** Shops RÉELS de la config (rows `/spaces/:id/shops` filtrées configId,
     *  forme élément : {id,name,type,attributes,locationName,floorLevel,isOpen}).
     *  Source AUTORITAIRE des cartes shops quand le layout `.data.floors` n'est
     *  pas renvoyé par `/configurations` (liste) et que la timeline est maigre
     *  (event futur). `id` === elementId config → l'assignation menu reste valide. */
    configShops: { type: Array, default: () => [] },
    /** Statut de réconciliation Lot 1 par shop → item :
     *  Object<elementId, Object<menuItemId, 'mapped'|'remapped'|'unmapped'>>.
     *  Alimente le badge d'état. Vide = pas d'info d'assignation. */
    mapStatusByShop: { type: Object, default: () => ({}) },
    /** True = config sans aucun menu item assigné aux shops → warning visible. */
    menuAssignmentMissing: { type: Boolean, default: false },
    /** Menu RÉEL assigné par shop : Object<elementId, menuItemId[]>. Présent →
     *  la liste du shop est contrainte à ces items (au lieu du catalogue/type). */
    shopMenuAssignment: { type: Object, default: () => ({}) },
    /** Idem mais en OBJETS (id/name/basePrice/category) — affichage du menu réel
     *  indépendant du catalogue espace. Object<elementId, MenuItem[]>. */
    shopMenuAssignmentItems: { type: Object, default: () => ({}) },
    /** Appartenance COMPLÈTE au Space Menu de chaque shop (items enabled ET
     *  disabled) : Map(normalizeStr(shopName) → { ids:Set, names:Set }). Sert au
     *  garde-fou : on n'ouvre un PDV fermé qu'avec un item présent dans son menu.
     *  null = pas encore chargé (garde-fou inactif, rétro-compat). */
    shopMenuMembership: { type: Object, default: null },
    /** Articles assignés au Space Menu du shop mais NON DISPONIBLES côté serveur
     *  (BUG-291-02) : Map(normalizeStr(shopName) → { ids:Set, names:Set }).
     *  Même forme que `shopMenuMembership`. null = pas encore chargé → garde
     *  inactive (rétro-compat stricte). */
    shopMenuUnavailable: { type: Object, default: null },
    /** Items prédits sans correspondance, par shop, pour la section
     *  « Non rattachés » : Object<elementId, MenuItem[]>. */
    unmappedItemsByShop: { type: Object, default: () => ({}) },
    viewMode: { type: String, default: 'shop' }, // 'shop' | 'item'
    /** Contexte des listes fourni par le parent : 'loading' | 'no-config' |
     *  'no-mapping' | 'not-calculated' | 'ready'. Default 'ready' → rétro-compat. */
    itemsContext: { type: String, default: 'ready' },
    /** Taxonomie catalogue (store analyse) pour résoudre typeId/categoryId → nom.
     *  Sans elle, `classifyItemType` retombe sur les champs bruts de l'item. */
    productTypes: { type: Array, default: () => [] },
    productCategories: { type: Array, default: () => [] },
    /** Estimation 0 (fiche 311_01) : mode actif — la grille se rend depuis le
     *  Space Menu, prédictions à 0, saisie via manualQuantities. Défaut false
     *  → comportement historique strictement inchangé. */
    estimationActive: { type: Boolean, default: false },
    /** True = event futur sans historique, éligible mais mode pas encore
     *  démarré → l'empty state 'not-calculated' propose le bouton. */
    canStartEstimation: { type: Boolean, default: false },
    /** Alias « historique emprunté » de l'espace (lignes MenuItemHistoryAlias)
     *  — badge sur les lignes cibles (maquettes 08/2026). */
    historyAliases: { type: Array, default: () => [] },
  },
  emits: [
    'update:selectedMenuItems',
    'update:quantityAdjustments',
    'update:manualQuantities',
    'manual-info',
    'remap-request',
    'history-alias-request',
    'assign-shop-item',
    'assign-shop-items',
    'assign-item-all-shops',
    'assign-blocked',
    'start-estimation',
  ],
  setup() {
    const { t } = useI18n()
    return { t }
  },
  data() {
    return {
      shopStatusTab: 'open', // 'open' | 'closed'
      itemTypeTab: 'All', // 'All' | 'Food' | 'Beverage' | 'Combo'
      searchQuery: '',
      expandedElements: new Set(),
      // Accordéon shop : UN SEUL ouvert à la fois (ouvrir A ferme B), donc une
      // valeur unique et pas un Set comme expandedElements (vue Item, inchangée).
      expandedShopId: null,
      // Recherche texte PAR SHOP (remplace les chips catégorie dans l'en-tête
      // de chaque shop). elementId -> string.
      shopSearchQuery: {},
      // Onglet actif des 3 catégories PAR SHOP. elementId -> 'sales' | 'unmapped' | 'noSales'.
      shopTab: {},
      // Chip-filtre global de la toolbar (maquettes 08/2026) :
      // null | 'noSales' (article sans prévision) | 'unmapped' (hors Space
      // Menu). Non persisté, réinitialisé au changement d'onglet statut/vue.
      globalChipFilter: null,
      // Déplié par défaut : des ventes sont prédites sur ces articles, on veut
      // que ce soit visible sans action (vue Item globale — le pendant par
      // shop est remplacé par l'onglet 'unmapped', cf. shopTab).
      unmappedItemViewOpen: true,
      // Plafond du slider de quantité absolue (items à prédiction 0).
      manualQtyMax: 500,
      // Échelle max des sliders fan-out ABSOLUS du mode estimation (fiche
      // 311_02) — éditable via le champ du bandeau. UI seulement, pas persisté
      // (les quantités posées le sont, elles, via le brouillon du parent).
      estimationScaleMax: 1000,
      // Tick pour invalider les computed quand on mute expandedElements/shopSearchQuery
      _uiTick: 0,
    }
  },
  computed: {
    // ----- F&B elements (cf. React :122-162) -----
    fbElements() {
      if (this.configuration) {
        const data = this.configuration.data || this.configuration
        const els = []
        const collect = (arr) => {
          if (!Array.isArray(arr)) return
          for (const el of arr) {
            if (!el) continue
            if (el.type === 'shop' || el.type === 'hospitality' || el.type === 'kitchen') {
              els.push(el)
            }
          }
        }
        if (Array.isArray(data.floors)) {
          for (const floor of data.floors) collect(floor.elements)
        }
        if (data.forecourt) collect(data.forecourt.elements)
        if (data.externalMerch) collect(data.externalMerch.elements)
        if (els.length) return els
      }
      // Source AUTORITAIRE : les shops réels de la config (`/spaces/:id/shops`).
      // `/configurations` (liste) ne renvoie PAS `.data.floors` → le layout est
      // absent ci-dessus. Les rows /shops portent le vrai elementId + isOpen, donc
      // on affiche TOUS les shops de la config (pas seulement ceux vus en timeline).
      //
      // On ATTACHE `_itemIds` (clés des prévisions timeline pour ce shop, indexées
      // par id puis nom) : sans ça `menuItemsPerElement` reste vide pour ces shops
      // réels (ni `_synthetic` ni `shopType`), et la section « à remapper » +
      // le CA par shop tombaient à 0. Les shops sans vente timeline n'ont pas de
      // `_itemIds` (repli `shopType` inchangé).
      if (Array.isArray(this.configShops) && this.configShops.length) {
        // BUG-275 : `configShops` (prop) vient de `/spaces/:id/shops`, dont le `shopTypes`
        // backend inclut délibérément `merchshop` (revenu/stock, cf. BUG-274) — mais ici on
        // assigne des MenuItem F&B à un point de vente, même contexte que BUG-274. Filtré ici
        // (pas dans `configShops` lui-même, réutilisé pour le CA par shop plus bas où
        // merchshop doit rester).
        const shops = this.configShops.filter((el) => el?.type !== 'merchshop')
        const synth = this.syntheticElementsFromTimeline
        if (!synth.length) return shops
        const byId = new Map()
        const byName = new Map()
        for (const s of synth) {
          if (s.id != null) byId.set(String(s.id), s._itemIds)
          if (s.name) byName.set(String(s.name).toLowerCase(), s._itemIds)
        }
        return shops.map((el) => {
          const ids =
            byId.get(String(el.id)) ||
            byName.get(String(el.name || '').toLowerCase())
          return ids && ids.size ? { ...el, _itemIds: ids } : el
        })
      }
      // Fallback : ni layout ni /shops (cas events Weezevent sans import shops).
      // On dérive les "shops" depuis les VENTES (timeline) → l'ajustement par
      // shop / menu item reste possible sur données réelles.
      return this.syntheticElementsFromTimeline
    },
    // PERF: index id → élément / id → menuItem (computeds cachés). getPredictedQuantity
    // et getPredictedItemRevenue étaient appelés par cellule (sort comparator,
    // shopRevenues, groupByMenuItemArray, template) et faisaient un Array.find
    // O(S) + O(I) à chaque fois → ~O(S·I·(S+I)). Lookups O(1) via ces Maps.
    fbElementsById() {
      const m = new Map()
      for (const e of this.fbElements) if (e && e.id != null) m.set(e.id, e)
      return m
    },
    // Index id→objet pour la taxonomie (typeId/categoryId → nom). Construit une
    // fois, consommé par classifyItemType (mémo cf. resolveCatalogDims).
    resolvedDimsIndex() {
      const catById = new Map((this.productCategories || []).map((c) => [String(c?.id), c]))
      const typeById = new Map((this.productTypes || []).map((t) => [String(t?.id), t]))
      return { catById, typeById }
    },
    menuItemsById() {
      const m = new Map()
      const list = Array.isArray(this.menuItems) ? this.menuItems : []
      for (const mi of list) if (mi && mi.id != null) m.set(mi.id, mi)
      return m
    },
    /**
     * Shops synthétiques reconstruits depuis la timeline de ventes
     * (predictedTimelineData) : 1 élément par shopId, avec les menuItemIds
     * réellement vendus. Utilisé quand la config n'expose pas d'éléments F&B.
     */
    syntheticElementsFromTimeline() {
      const data = this.predictedTimelineData || []
      if (!data.length) return []
      const byShop = new Map()
      for (const r of data) {
        const id = r.shopId || r.shop
        if (!id) continue
        const key = synthItemKey(r)
        if (!key) continue
        let e = byShop.get(id)
        if (!e) {
          e = {
            id,
            name: r.shopName || r.elementName || String(id),
            type: 'shop',
            shopType: ['gppremium'],
            _synthetic: true,
            _itemIds: new Set(),
          }
          byShop.set(id, e)
        }
        e._itemIds.add(key)
      }
      return [...byShop.values()]
    },
    /**
     * Catalogue d'items SYNTHÉTIQUES reconstruits depuis les ventes (timeline) :
     * 1 entrée par clé d'item, avec un prix unitaire moyen (revenu/quantité).
     * Sert de fallback quand le menuItem timeline n'existe pas au catalogue.
     */
    syntheticItemsById() {
      const map = new Map()
      const pm = this.weezeventPriceMap || {}
      const cm = this.weezeventCostMap || {}
      const data = this.predictedTimelineData || []
      for (const r of data) {
        const key = synthItemKey(r)
        if (!key) continue
        let it = map.get(key)
        if (!it) {
          const nm = r.itemName || r.menuItemName || String(key)
          it = {
            id: key,
            name: nm,
            category: r.menuItemCategory || r.category || '',
            type: r.menuItemType || r.type || '',
            basePrice: 0,
            _synthetic: true,
            _rev: 0,
            _qty: 0,
            _wpid: r.weezeventProductId || null,
            _nameLower: String(nm).toLowerCase(),
          }
          map.set(key, it)
        }
        if (!it._wpid && r.weezeventProductId) it._wpid = r.weezeventProductId
        it._rev += Number(r.totalRevenue || r.revenue || 0)
        it._qty += Number(r.totalQuantity || r.quantity || 0)
      }
      for (const it of map.values()) {
        // Prix RÉEL Weezevent (basePrice) par id produit puis par nom ; sinon
        // fallback prix moyen dérivé (CA timeline ÷ quantité).
        let real = null
        if (it._wpid != null && pm[String(it._wpid)] != null) real = pm[String(it._wpid)]
        else if (pm[it._nameLower] != null) real = pm[it._nameLower]
        it.basePrice = real != null ? Number(real) : (it._qty > 0 ? it._rev / it._qty : 0)
        // Coût unitaire réel (MenuItem.totalCost via mapping produit→menuItem).
        it.unitCost =
          it._wpid != null && cm[String(it._wpid)] != null ? Number(cm[String(it._wpid)]) : null
      }
      return map
    },
    // ----- Timeline index (cf. React :262-281) -----
    timelineDataIndex() {
      // BUG-290-01 : indexation déplacée dans `utils/predictedQuantityIndex.js`
      // et PARTAGÉE avec EventPredictStockUpSection, qui n'indexait ni par nom
      // de shop ni par nom d'item et ressortait donc 0 là où cet écran-ci
      // trouvait la bonne quantité. Comportement inchangé ici : le code déplacé
      // est celui de cet écran, qui fait référence.
      return buildTimelineQuantityIndex(this.predictedTimelineData)
    },
    // ----- Index REVENUE par shop|item (id ET nom), depuis la timeline ------
    // Source fiable pour le CA prédit/ajusté (le `basePrice` catalogue n'est
    // pas dispo pour les items synthétiques issus des ventes).
    timelineRevenueIndex() {
      const idx = new Map()
      const data = this.predictedTimelineData || []
      for (const r of data) {
        const rev = Number(r.totalRevenue || r.revenue || 0)
        if (!rev) continue
        // Mêmes clés SHOP que timelineDataIndex (id + nom normalisé) pour la
        // cohérence inter-config du CA par shop.
        const shopKeys = [
          ...new Set(
            [r.shopId || r.shop, r.shopName ? normalizeStr(r.shopName) : null].filter(Boolean),
          ),
        ]
        if (!shopKeys.length) continue
        const idKey = r.menuItemId || r.mappedMenuItemId
        const nameKey =
          r.itemName || r.menuItemName
            ? String(r.itemName || r.menuItemName).toLowerCase()
            : null
        for (const sk of shopKeys) {
          if (idKey) {
            const k = `${sk}|${idKey}`
            idx.set(k, (idx.get(k) || 0) + rev)
          }
          if (nameKey) {
            const k = `${sk}|${nameKey}`
            idx.set(k, (idx.get(k) || 0) + rev)
          }
        }
      }
      return idx
    },
    /** Ids du catalogue global (tenant). Sert à détecter les lignes d'assignation
     *  « fantômes » (id synthétique posté avant le garde-fou, absent du catalogue).
     *  Vide (catalogue pas chargé) → détection désactivée, zéro faux positif. */
    spaceCatalogIdSet() {
      return new Set((this.menuItems || []).map((m) => String(m.id)))
    },
    // ----- Menu items per element (cf. React :594-686) -----
    menuItemsPerElement() {
      const cache = new Map()
      const spaceFiltered = this.menuItems.filter((it) => this.isMenuItemAvailableInSpace(it))
      for (const element of this.fbElements) {
        let filtered
        if (element._synthetic || element._itemIds) {
          // Shop synthétique OU shop réel enrichi de `_itemIds` (fbElements) :
          // les items viennent du catalogue synthétique reconstruit depuis la
          // timeline (le menuItemId timeline n'est PAS toujours mappé au catalogue
          // réel → on n'en dépend pas). Alimente `base` → split mapped/à-remapper.
          filtered = [...(element._itemIds || [])]
            .map((k) => this.syntheticItemsById.get(k))
            .filter(Boolean)
        } else {
          const fbTypes = element.shopType || []
          // shopType VIDE (8/10 shops importés Weezevent, cf. diag DB) ou premium/
          // temporary → pas de filtrage par type : accepte tout. L'assignation
          // Space Menu réelle (couche au-dessus) fait foi. Sinon 0 item par shop.
          if (!fbTypes.length || fbTypes.includes('gppremium') || fbTypes.includes('temporary')) {
            filtered = spaceFiltered
          } else {
            filtered = spaceFiltered.filter((item) => {
              const type = this.classifyItemType(item)
              if (type === 'Food') return fbTypes.includes('food')
              if (type === 'Beverage') return fbTypes.includes('beverages') || fbTypes.includes('drinkee') || fbTypes.includes('beer')
              // Combo = food ET beverages (spec EVENT_PREDICT_SECTIONS.md §5.3,
              // BUG-009) : un shop mono-type ne sert pas un combo des deux.
              if (type === 'Combo') return fbTypes.includes('food') && fbTypes.includes('beverages')
              return false
            })
          }
        }
        const withAvailability = filtered.map((it) => this.checkMenuItemAvailability(it))
        const selectedSet = new Set(this.selectedMenuItems[element.id] || [])
        // Tri : groupe attaché/coché avant non-rattaché (selectedSet, même
        // grouping que le gate du CA ajusté — un item décoché descend dans son
        // groupe), puis dans chaque groupe par CA PRÉDIT desc, catégorie, nom.
        // Volontairement PAS de CA ajusté ici : ça lirait `quantityAdjustments`
        // (slider) → menuItemsPerElement (qui refait le walk ingrédients/
        // fournisseurs de checkMenuItemAvailability pour CHAQUE item) re-
        // calculerait à CHAQUE tick de slider, tous shops confondus. Le CA
        // prédit suffit à l'objectif (items qui vendent le plus en haut) sans
        // ce coût ; ne diverge de l'ajusté que si les %/item varient au sein
        // d'un même shop coché, cas rare.
        withAvailability.sort((a, b) => {
          const aS = selectedSet.has(a.id), bS = selectedSet.has(b.id)
          if (aS !== bS) return aS ? -1 : 1
          const aPred = this.htUnitPrice(a) * this.getPredictedQuantity(element.id, a.id)
          const bPred = this.htUnitPrice(b) * this.getPredictedQuantity(element.id, b.id)
          if (aPred !== bPred) return bPred - aPred
          const ac = a.category || '', bc = b.category || ''
          if (ac !== bc) return ac.localeCompare(bc)
          return a.name.localeCompare(b.name)
        })
        cache.set(element.id, withAvailability)
      }
      return cache
    },
    // ----- Shop revenues (cf. React :334-460) -----
    // CA = quantité × PRIX UNITAIRE RÉEL de l'item (Weezevent basePrice). Ainsi
    // le CA prédit/ajusté est cohérent avec le prix affiché (€2.08) : ajuster
    // de N% multiplie les UNITÉS, et le CA = unités × prix réel.
    shopRevenues() {
      const map = new Map()
      for (const element of this.fbElements) {
        const items = this.menuItemsPerElement.get(element.id) || []
        const selectedSet = new Set(this.selectedMenuItems[element.id] || [])
        let predicted = 0
        let adjusted = 0
        for (const it of items) {
          // CA BRUT (predicted) = TOUS les articles prédits du shop (attachés ou
          // non). CA AJUSTÉ = uniquement les articles COCHÉS (selectedSet) : la
          // case est l'unique gate — attaché coché par défaut, non-attaché
          // cochable. Un non-attaché coché compte ; un attaché décoché ne compte
          // pas. (Avant : filtre d'assignation « activé seul » ignorait la case.)
          const price = this.htUnitPrice(it) // HT (levier détaxe amont)
          const pq = this.getPredictedQuantity(element.id, it.id)
          predicted += pq * price
          if (selectedSet.has(it.id)) {
            const aq = this.getAdjustedQuantity(element.id, it.id)
            adjusted += aq * price
          }
        }
        map.set(element.id, { predicted, adjusted })
      }
      return map
    },
    // ----- Shop-level derived adjustments (cf. React :164-217) -----
    derivedShopAdjustments() {
      const map = new Map()
      for (const element of this.fbElements) {
        const selected = this.selectedMenuItems[element.id] || []
        if (!selected.length) continue
        const values = new Set()
        for (const miId of selected) {
          values.add(this.quantityAdjustments[`${element.id}-${miId}`] ?? 100)
        }
        if (values.size === 1) map.set(element.id, [...values][0])
      }
      return map
    },
    derivedItemAdjustments() {
      const map = new Map()
      const selectedItemIds = new Set()
      for (const element of this.fbElements) {
        for (const miId of this.selectedMenuItems[element.id] || []) {
          selectedItemIds.add(miId)
        }
      }
      for (const miId of selectedItemIds) {
        const values = new Set(this.getItemAdjustmentValues(miId))
        if (values.size === 1) map.set(miId, [...values][0])
      }
      return map
    },
    // ----- Group by FB type (cf. React :893-916) -----
    elementsByType() {
      const groups = {}
      for (const el of this.fbElements) {
        const types = el.shopType || []
        const key = types.length ? [...types].sort().join(',') : '__no_shop_type__'
        if (!groups[key]) groups[key] = []
        groups[key].push(el)
      }
      return groups
    },
    filteredElementsByTypeEntries() {
      const out = []
      const q = this.searchQuery.toLowerCase()
      for (const [type, elements] of Object.entries(this.elementsByType)) {
        const filtered = elements.filter((el) => {
          if (q) {
            const matchShop = el.name.toLowerCase().includes(q)
            const items = this.menuItemsPerElement.get(el.id) || []
            const matchItem = items.some((it) => it.name.toLowerCase().includes(q))
            if (!matchShop && !matchItem) return false
          }
          const open = this.isShopOpen(el.id)
          if (!(this.shopStatusTab === 'open' ? open : !open)) return false
          // Chip-filtre global : ne garder que les cartes ayant ≥1 ligne
          // restant à traiter du type.
          if (this.globalChipFilter) {
            const c = this.chipCountsByElement.get(el.id) || {}
            if (!((c[this.globalChipFilter] || 0) > 0)) return false
          }
          return true
        })
        if (filtered.length) out.push([type, filtered])
      }
      return out
    },
    /** Liste plate des PDV filtrés (groupe supérieur par type composite retiré). */
    filteredElementsFlat() {
      return this.filteredElementsByTypeEntries.flatMap(([, elements]) => elements)
    },
    /** True quand l'open/closed est sourcé depuis la config (API /shops). */
    hasOpenData() {
      return this.isOpenByShop && Object.keys(this.isOpenByShop).length > 0
    },
    /** Cible d'alias → nom de la source (badge « historique emprunté »). */
    aliasSourceByTarget() {
      return aliasSourceByTargetId(this.historyAliases)
    },
    /**
     * Compteurs des chips-filtres par PDV, mémoïsés en UNE passe (chips globaux
     * + filtrage des cartes — appeler getGroupedMenuItems à chaque fois serait
     * quadratique sur les grosses configs). DYNAMIQUES : une ligne « sans vente
     * prévue » sort du compteur dès qu'une quantité ajustée > 0 la couvre
     * (quantité manuelle posée) — le compteur mesure le RESTE À TRAITER, pas la
     * taille du bucket (qui, lui, ne bouge pas).
     */
    chipCountsByElement() {
      const map = new Map()
      for (const el of this.fbElements) {
        let noSales = 0
        let unmapped = 0
        for (const it of this.getGroupedMenuItems(el)) {
          if (it._bucket === 'unmapped') unmapped += 1
          else if (
            it._bucket === 'noSales' &&
            this.getAdjustedQuantity(el.id, it.id) === 0
          ) noSales += 1
        }
        map.set(el.id, { noSales, unmapped })
      }
      return map
    },
    /**
     * Compteurs globaux des chips-filtres. Vue PDV : somme du reste à traiter
     * des cartes de l'onglet statut courant. Vue article : entrées hors menu
     * (_mapGroup 'unmapped') / entrées sans AUCUNE quantité ajustée (prédite ou
     * manuelle) sur aucun PDV, exclusif du premier.
     */
    globalChipCounts() {
      let noSales = 0
      let unmapped = 0
      if (this.viewMode === 'item') {
        for (const entry of this.groupByMenuItemArray) {
          if (entry._mapGroup === 'unmapped') unmapped += 1
          else if (entry.shops.every((s) => (s.adjustedQty || 0) === 0)) noSales += 1
        }
        return { noSales, unmapped }
      }
      for (const el of this.fbElements) {
        const open = this.isShopOpen(el.id)
        if (this.shopStatusTab === 'open' ? !open : open) continue
        const c = this.chipCountsByElement.get(el.id) || {}
        noSales += c.noSales || 0
        unmapped += c.unmapped || 0
      }
      return { noSales, unmapped }
    },
    openShopsCount() {
      return this.fbElements.filter((el) => this.isShopOpen(el.id)).length
    },
    closedShopsCount() {
      return this.fbElements.filter((el) => !this.isShopOpen(el.id)).length
    },
    // ----- Group by menu item (cf. React :763-825) -----
    groupByMenuItemArray() {
      // Candidats = items vendus/affichés (menuItemsPerElement) ∪ items RÉELLEMENT
      // assignés (même non vendus, ex. BONBONS) pour que le menu réel apparaisse.
      const all = new Set()
      for (const items of this.menuItemsPerElement.values()) {
        for (const it of items) all.add(it.id)
      }
      const assignedObjById = new Map()
      let anyAssignment = false
      for (const element of this.fbElements) {
        const ai = this.assignedItemsForElement(element)
        if (Array.isArray(ai) && ai.length) {
          anyAssignment = true
          for (const it of ai) {
            all.add(it.id)
            if (!assignedObjById.has(it.id)) assignedObjById.set(it.id, it)
          }
        }
      }
      const result = []
      for (const miId of all) {
        const mi =
          this.menuItems.find((m) => m.id === miId) ||
          this.syntheticItemsById.get(miId) ||
          assignedObjById.get(miId)
        if (!mi) continue
        const shops = []
        let assignedSomewhere = false
        for (const element of this.fbElements) {
          const items = this.menuItemsPerElement.get(element.id) || []
          const assignedIds = this.assignedIdsForElement(element)
          const inBase = items.some((i) => i.id === miId)
          const isAssigned = !!assignedIds && assignedIds.has(miId)
          if (!inBase && !isAssigned) continue
          if (isAssigned) assignedSomewhere = true
          const sel = (this.selectedMenuItems[element.id] || []).includes(miId)
          const pq = this.getPredictedQuantity(element.id, miId)
          const aq = this.getAdjustedQuantity(element.id, miId)
          shops.push({
            element,
            selected: sel,
            predictedQty: pq,
            adjustedQty: aq,
            assigned: isAssigned,
            assignmentLoaded: !!assignedIds,
          })
        }
        if (!shops.length) continue
        shops.sort((a, b) => {
          if (a.selected && !b.selected) return -1
          if (!a.selected && b.selected) return 1
          return b.predictedQty - a.predictedQty
        })
        // « Non rattaché » = feature active (≥1 shop a un menu) ET item assigné
        // nulle part. Cohérent avec la vue Shop (open + closed).
        const mapGroup = anyAssignment && !assignedSomewhere ? 'unmapped' : 'other'
        result.push({ menuItemId: miId, menuItem: mi, shops, _mapGroup: mapGroup })
      }
      return result
    },
    /** Entrées item-view groupées : menu assigné d'abord, « non rattachés » ensuite. */
    groupedItemViewEntries() {
      const list = this.filteredMenuItemsForItemView
      const others = []
      const unmapped = []
      for (const e of list) (e._mapGroup === 'unmapped' ? unmapped : others).push(e)
      const out = others.map((e) => ({ ...e, _isFirstUnmapped: false }))
      unmapped.forEach((e, i) => out.push({ ...e, _isFirstUnmapped: i === 0 }))
      return out
    },
    filteredMenuItemsForItemView() {
      const q = this.searchQuery.toLowerCase()
      const out = []
      // Garde-fou : catégories dynamiques (contrairement aux anciens onglets
      // fixes Food/Beverage/Combo, une catégorie peut disparaître si le
      // catalogue change). Si l'onglet actif ne correspond plus à AUCUN item,
      // retombe sur 'All' plutôt qu'afficher une liste vide sur un filtre
      // fantôme (le chip 'All' reste toujours visible, mais autant éviter
      // l'état confus entre-temps).
      const cats = new Set(this.groupByMenuItemArray.map((e) => this.resolveItemCategoryLabel(e.menuItem)))
      const activeTab = this.itemTypeTab === 'All' || cats.has(this.itemTypeTab) ? this.itemTypeTab : 'All'
      for (const entry of this.groupByMenuItemArray) {
        const cat = this.resolveItemCategoryLabel(entry.menuItem)
        if (activeTab !== 'All' && cat !== activeTab) continue
        if (q) {
          const mi = entry.menuItem.name.toLowerCase().includes(q)
          const ms = entry.shops.some((s) => s.element.name.toLowerCase().includes(q))
          if (!mi && !ms) continue
        }
        // Chip-filtre global (mêmes catégories qu'en vue PDV, à l'échelle entrée).
        if (this.globalChipFilter && !this.entryMatchesChip(entry, this.globalChipFilter)) continue
        const hasSel = entry.shops.some((s) => s.selected)
        out.push({ ...entry, hasSelection: hasSel })
      }
      out.sort((a, b) => {
        if (a.hasSelection && !b.hasSelection) return -1
        if (!a.hasSelection && b.hasSelection) return 1
        return a.menuItem.name.localeCompare(b.menuItem.name)
      })
      return out
    },
  },
  watch: {
    /**
     * Auto-initialisation de `selectedMenuItems` (mirror React :1820-1870
     * "Load default space menu config"). Quand l'utilisateur arrive sur un
     * event sans version sauvegard\u00e9e, on coche par d\u00e9faut TOUS les menu
     * items disponibles dans chaque shop, sinon l'onglet "Open" est vide et
     * la section Stock up reste vide aussi.
     *
     * D\u00e9clenchement: aussit\u00f4t qu'on a des fbElements ET une menuItemsPerElement
     * non vide ET que selectedMenuItems prop est vide pour tous les elements.
     */
    fbElements: {
      immediate: true,
      handler() {
        this.$nextTick(() => this.autoSelectIfEmpty())
        // PDV repliés par défaut (Config) : plus d'expandAllByDefault.
        // L'utilisateur déplie manuellement via toggleElementExpanded.
      },
    },
    menuItems: {
      handler() {
        this.$nextTick(() => this.autoSelectIfEmpty())
      },
    },
    // Le chip-filtre global n'a de sens que dans le contexte où il a été posé
    // (onglet Ouverts/Fermés, vue PDV/article) : on le relâche au changement.
    shopStatusTab() {
      this.globalChipFilter = null
    },
    viewMode() {
      this.globalChipFilter = null
    },
  },
  methods: {
    /**
     * Auto-s\u00e9lection par d\u00e9faut : si selectedMenuItems est vide pour tous
     * les fbElements (cas event sans version sauvegard\u00e9e), pr\u00e9-cocher tous
     * les menu items disponibles dans chaque shop. Remplace le `spaceMenuConfig`
     * React (qui contient {elementId: {miId: true}} par d\u00e9faut).
     */
    autoSelectIfEmpty() {
      if (!this.fbElements.length) return
      if (!this.menuItems.length) return
      const sel = this.selectedMenuItems || {}
      const hasAny = this.fbElements.some(
        (el) => Array.isArray(sel[el.id]) && sel[el.id].length > 0,
      )
      if (hasAny) return
      // Défaut = articles ATTACHÉS (assignés + activés) au Space Menu du shop
      // quand la feature est active (mirror parent derivedMenuConfigFromRecords).
      // Shop tout-désactivé (ex. 1B) → aucun coché ; ses ventes restent en CA brut
      // seul. Repli legacy (aucune assignation dans la config) : items prédits > 0.
      const featureActive = this.assignmentFeatureActive()
      const next = {}
      for (const el of this.fbElements) {
        let ids
        if (featureActive) {
          const assigned = this.assignedIdsForElement(el)
          // BUG-291-02 : `assignedIdsForElement` dérive de la liste AFFICHÉE, qui
          // porte désormais aussi les articles indisponibles — on les retire ici,
          // sinon un article qu'on ne peut pas fabriquer serait coché d'office sur
          // un événement neuf.
          ids = assigned ? [...assigned].filter((id) => !this.isItemUnavailable(el, id)) : []
        } else {
          const items = this.menuItemsPerElement.get(el.id) || []
          ids = items
            .filter((it) => this.getPredictedQuantity(el.id, it.id) > 0)
            .map((it) => it.id)
        }
        if (ids.length) next[el.id] = ids
      }
      if (Object.keys(next).length) {
        this.$emit('update:selectedMenuItems', next)
      }
    },
    /** Coût unitaire d'un item : synthétique (unitCost via mapping) ou catalogue (totalCost). */
    itemUnitCost(item) {
      if (item == null) return null
      if (item.unitCost != null) return Number(item.unitCost)
      if (item.totalCost != null) return Number(item.totalCost)
      // Ligne SLIM (assignation Space Menu = {id,name,basePrice,…} SANS champ de
      // coût) : résolution catalogue par id puis nom — même démarche que
      // htUnitPrice. Sans ça, coût + marge disparaissaient de toutes les lignes
      // assignées, seul chemin en mode estimation (fiche 311_02).
      if (!item._synthetic) {
        const full =
          this.menuItemsById.get(item.id) ||
          (this.menuItems || []).find((m) => normalizeStr(m?.name) === normalizeStr(item?.name))
        if (full && full.totalCost != null && Number(full.totalCost) > 0) {
          return Number(full.totalCost)
        }
      }
      // Fallback : coût par menuItemId (shop-details / store analyse). On exige
      // > 0 — une entrée à 0 = coût inconnu, pas un produit gratuit (sinon marge
      // affichée à 100% à tort).
      const byId = this.menuItemCostMap?.[item.id]
      if (byId != null && Number(byId) > 0) return Number(byId)
      return null
    },
    /**
     * Prix unitaire de l'item en HT. `it.basePrice` est déjà HT (map Weezevent
     * détaxé en amont, ou dérivé rev÷qty = revenueHt). On le préfère. À défaut
     * (item catalogue jamais vendu), `displayPrice` (prix catalogue par espace)
     * est du TTC → on le détaxe via le vatRate de l'article. Ne JAMAIS re-diviser
     * un `basePrice` déjà HT. Cf. src/utils/price.js + docs/HT_TTC_PREDICT.md.
     */
    htUnitPrice(it) {
      // Item SYNTHÉTIQUE (dérivé des ventes) : `basePrice` est DÉJÀ HT
      // (revenueHt÷qty ou map Weezevent détaxée) → passthrough, JAMAIS de
      // re-détaxe (pas de vatRate porté).
      if (it && it._synthetic) return Number(it.basePrice) || 0
      // Item CATALOGUE / assigné : l'objet rendu peut être SLIM (assignation
      // NestJS = {id,name,basePrice} en TTC, sans vatRate/pricing). Le catalogue
      // complet `this.menuItems` (source de /menu-items) porte vatRate +
      // pricing.gross.ht + spacePrices → on résout dessus (par id puis nom) pour
      // obtenir le vrai HT. menuItemPriceHt lit le HT backend en priorité.
      let src = it
      const hasHt =
        it && (it.pricing?.gross?.ht != null || it.vatRate != null || it.spacePrices || it.spacePricing)
      if (it && !hasHt) {
        const full =
          this.menuItemsById.get(it.id) ||
          (this.menuItems || []).find((m) => normalizeStr(m?.name) === normalizeStr(it?.name))
        if (full) src = full
      }
      return Number(menuItemPriceHt(src, this.spaceId)) || 0
    },
    // Coût aberrant : coût unitaire > prix HT (ex. BARRE CHOCOLATEE €2.08 avec
    // coût €36.84 → marge -1671%). Données de coût suspectes → badge d'alerte.
    hasAberrantCost(item) {
      const cost = this.itemUnitCost(item)
      if (cost == null) return false
      const price = this.htUnitPrice(item)
      return price > 0 && cost > price
    },
    // Marge unitaire en % = (prix - coût) / prix. null si coût ou prix absent.
    itemMargin(item) {
      const cost = this.itemUnitCost(item)
      if (cost == null) return null
      const price = this.htUnitPrice(item) // HT (cohérent avec le coût HT)
      if (!price) return null
      return ((price - cost) / price) * 100
    },
    // ----- Helpers types -----
    // Classe un item en Food/Beverage/Combo — sert UNIQUEMENT à faire
    // correspondre le catalogue au champ `shopType` brut du PdV (vocabulaire
    // Weezevent food/beverages/beer, cf. menuItemsPerElement). PAS utilisé pour
    // les chips/onglets de filtre visibles par l'utilisateur (cf.
    // resolveItemCategoryLabel ci-dessous, vraie Menu Item Category).
    classifyItemType(mi) {
      if (!mi) return 'Food'
      const { catById, typeById } = this.resolvedDimsIndex
      const { type, category } = resolveCatalogDims(mi, catById, typeById)
      return normalizeToTypeTab({ type, category, comboItem: mi.comboItem })
    },
    /**
     * Vraie catégorie catalogue de l'item (ProductCategory.name, résolue via
     * resolveCatalogDims — même source qu'Analyse), PAS le bucket Food/
     * Beverage/Combo. Fallback `epmNoCategory` (clé déjà existante FR/EN) si
     * vide (item sans categoryId/categoryName, ex. article synthétique issu
     * des ventes).
     */
    resolveItemCategoryLabel(mi) {
      if (!mi) return this.t('epmNoCategory')
      const { catById, typeById } = this.resolvedDimsIndex
      const { category } = resolveCatalogDims(mi, catById, typeById)
      return category || this.t('epmNoCategory')
    },
    /**
     * Couleur de chip déterministe par nom de catégorie (hash simple → 1 de N
     * palettes) — stable d'un rendu à l'autre, pas besoin de mapping en dur
     * puisque les catégories réelles sont dynamiques (Softs, Bières, Vins…).
     * `key === 'All'` (sentinelle interne, pas traduite) garde le style neutre.
     */
    itemTypeBadgeColor(key, active = false) {
      if (key === 'All') {
        return active
          ? 'bg-gray-200 text-gray-900 border-gray-400 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-500 font-semibold'
          : 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600'
      }
      const palette = [
        { a: 'bg-amber-200 text-amber-900 border-amber-400 dark:bg-amber-800 dark:text-amber-100 dark:border-amber-600 font-semibold', i: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700' },
        { a: 'bg-green-200 text-green-900 border-green-400 dark:bg-green-800 dark:text-green-100 dark:border-green-600 font-semibold', i: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700' },
        { a: 'bg-blue-200 text-blue-900 border-blue-400 dark:bg-blue-800 dark:text-blue-100 dark:border-blue-600 font-semibold', i: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700' },
        { a: 'bg-purple-200 text-purple-900 border-purple-400 dark:bg-purple-800 dark:text-purple-100 dark:border-purple-600 font-semibold', i: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700' },
        { a: 'bg-pink-200 text-pink-900 border-pink-400 dark:bg-pink-800 dark:text-pink-100 dark:border-pink-600 font-semibold', i: 'bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-700' },
      ]
      let hash = 0
      const s = String(key || '')
      for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0
      const p = palette[hash % palette.length]
      return active ? p.a : p.i
    },
    /** Liste triée des vraies catégories présentes dans `items` (+ label 'All'). */
    buildCategoryChipList(items, activeKey) {
      const counts = new Map()
      for (const it of items) {
        const cat = this.resolveItemCategoryLabel(it)
        counts.set(cat, (counts.get(cat) || 0) + 1)
      }
      const categories = [...counts.keys()].sort((a, b) => a.localeCompare(b))
      const filter = activeKey || 'All'
      const list = [{
        key: 'All',
        label: this.t('epmTabAll'),
        count: items.length,
        color: this.itemTypeBadgeColor('All', filter === 'All'),
        active: filter === 'All',
      }]
      for (const cat of categories) {
        const active = filter === cat
        list.push({
          key: cat,
          label: cat,
          count: counts.get(cat) || 0,
          color: this.itemTypeBadgeColor(cat, active),
          active,
        })
      }
      return list
    },
    /** Chips catégorie de la vue globale « par article » (All + catégories triées). */
    itemViewCategoryChips() {
      const items = this.groupByMenuItemArray.map((e) => e.menuItem)
      return this.buildCategoryChipList(items, this.itemTypeTab)
    },
    /** Défilement horizontal des chips catégorie (flèches G/D). dir = -1 gauche, 1 droite. */
    scrollCategories(dir) {
      const vp = this.$refs.catViewport
      if (!vp) return
      vp.scrollBy({ left: dir * Math.max(160, vp.clientWidth * 0.7), behavior: 'smooth' })
    },
    formatCurrency(v) {
      if (v == null) return '-'
      return `€${Number(v).toFixed(2)}`
    },
    // ----- Predicted / adjusted quantities -----
    getPredictedQuantity(elementId, menuItemId) {
      // Shop FERMÉ dans cette config (0 assignation) → aucune vente prévue, même
      // si la timeline (matchée par id/nom cross-config) en porte. Gate seulement
      // quand l'open/closed vient d'une vraie config (hasOpenData) : en fallback
      // mock/no-API, isShopOpen == « a des items sélectionnés » et zéroterait des
      // prédictions légitimes.
      if (this.hasOpenData && !this.isShopOpen(elementId)) return 0
      if (this.timelineDataIndex.size === 0) return 0
      const el = this.fbElementsById.get(elementId)
      if (!el) return 0
      // BUG-291-02 : article indisponible (ingrédients manquants / pas de recette)
      // → 0 vente prévue. Porte PRINCIPALE : irrigue les buckets, `unitSliderMax`
      // et le filtre d'auto-sélection.
      if (this.isItemUnavailable(el, menuItemId)) return 0
      // Cl\u00e9s SHOP : id/registryId bruts + NOM normalis\u00e9 (cl\u00e9 stable inter-config,
      // cf. timelineDataIndex). L'index contient les M\u00caMES sommes sous la cl\u00e9 id
      // ET sous la cl\u00e9 nom \u2192 `lookupPredictedQuantity` prend le MAX (pas la
      // somme) pour \u00e9viter le double-comptage, tout en captant la cl\u00e9 la plus
      // compl\u00e8te. Helpers partag\u00e9s avec le Stock-up (BUG-290-01).
      return lookupPredictedQuantity(
        this.timelineDataIndex,
        shopLookupKeys(el),
        itemLookupKeys(menuItemId, this.menuItemsById.get(menuItemId)),
      )
    },
    getAdjustedQuantity(elementId, menuItemId) {
      // Shop fermé → 0 (y compris la quantité manuelle 0-vente, sinon elle
      // regonfle l'ajusté / le CA d'un PDV fermé). Cf. getPredictedQuantity.
      if (this.hasOpenData && !this.isShopOpen(elementId)) return 0
      // BUG-291-02 — garde INDISPENSABLE, pas défensive : la ligne `manual` plus
      // bas n'est active QUE si `base === 0`. Forcer le prédit à 0 sur un article
      // indisponible ouvrirait donc la branche quantité manuelle, et un ajusté > 0
      // franchirait le garde `adjustedQty === 0` du stock-up — le correctif
      // rouvrirait la porte qu'il ferme.
      if (this.isItemUnavailable(this.fbElementsById.get(elementId), menuItemId)) return 0
      const base = this.getPredictedQuantity(elementId, menuItemId)
      const manual = base === 0 ? this.getManualQuantity(elementId, menuItemId) : 0
      // Item DÉCOCHÉ = insensible au slider global → quantité de BASE non
      // scalée (prédit brut, ou manuelle brute pour un 0-vente). Slider + reset
      // n'agissent que sur les items cochés (cf. handleShopAdjustment).
      if (!this.isMenuItemSelected(elementId, menuItemId)) {
        return base === 0 ? manual : base
      }
      // Coché → le % du slider shop scale la base. Prédit 0 → base = manuelle
      // (150 % × 10 u = 15 u) ; sinon base = prédit.
      const adj = this.quantityAdjustments[`${elementId}-${menuItemId}`] ?? 100
      if (base === 0) return Math.round((manual * adj) / 100)
      return Math.round((base * adj) / 100)
    },
    /** CA prédit (timeline) pour un couple shop / item — id ou nom. */
    getPredictedItemRevenue(elementId, menuItemId) {
      // Shop fermé → 0 CA prévu (cohérent avec getPredictedQuantity).
      if (this.hasOpenData && !this.isShopOpen(elementId)) return 0
      if (this.timelineRevenueIndex.size === 0) return 0
      const el = this.fbElementsById.get(elementId)
      if (!el) return 0
      // BUG-291-02 : `timelineRevenueIndex` est un index DISTINCT, non routé par
      // `getPredictedQuantity` — la garde doit être répétée ici, sinon un article
      // indisponible afficherait 0 unité mais continuerait à porter du CA prévu.
      if (this.isItemUnavailable(el, menuItemId)) return 0
      const shopKeys = [
        ...new Set([el.id, el.registryId, normalizeStr(el.name)].filter(Boolean)),
      ]
      const mi = this.menuItemsById.get(menuItemId)
      const itemKeys = [
        ...new Set(
          [menuItemId, mi && mi.name ? String(mi.name).toLowerCase() : null].filter(
            Boolean,
          ),
        ),
      ]
      let r = 0
      for (const sk of shopKeys) {
        for (const ik of itemKeys) {
          const c = this.timelineRevenueIndex.get(`${sk}|${ik}`)
          if (c) {
            if (c > r) r = c
            break
          }
        }
      }
      return r
    },
    getQuantityAdjustmentValue(elementId, menuItemId) {
      return this.quantityAdjustments[`${elementId}-${menuItemId}`] ?? 100
    },
    handleQuantityAdjustment(elementId, menuItemId, percentage) {
      const next = { ...this.quantityAdjustments, [`${elementId}-${menuItemId}`]: percentage }
      this.$emit('update:quantityAdjustments', next)
    },
    /**
     * Shop ouvert pour cet event. Source autoritaire = `isOpenByShop` (API
     * /shops, filtré par config). Si absent (mock / pas d'API) → fallback legacy
     * « le shop a des items sélectionnés ».
     */
    isShopOpen(elementId) {
      if (this.hasOpenData) {
        // isOpenByShop est keyé par NOM (l'API /configurations ne renvoie pas le
        // layout → pas d'id d'élément fiable). On résout le nom via fbElementsById
        // (Map O(1) — isShopOpen est appelé par cellule via getPredictedQuantity).
        const el = this.fbElementsById.get(elementId)
        const name = el ? String(el.name || '').trim().toLowerCase() : ''
        return this.isOpenByShop[name] === true
      }
      return (this.selectedMenuItems[elementId] || []).length > 0
    },
    /** Navigue vers Space Menus (ajouter des shops à une config). */
    goToSpaceMenus() {
      // On transmet l'espace + la config de l'event en query : l'écran Space
      // Menus (name: 'space-menus', path global sans param) auto-sélectionne
      // sinon le 1er espace/1re config, ce qui donnait l'impression que le lien
      // « ne marchait pas » (mauvais espace affiché). SpaceMenuView lit ces
      // query params (mount + activated) pour atterrir sur le bon périmètre.
      const query = {}
      if (this.spaceId) query.space = this.spaceId
      const cfgId = this.configuration?.id
      if (cfgId) query.config = cfgId
      this.$router.push({ name: 'space-menus', query })
    },
    /** Quantité absolue manuelle (item à prédiction 0). */
    getManualQuantity(elementId, menuItemId) {
      return this.manualQuantities[`${elementId}-${menuItemId}`] ?? 0
    },
    /** Plafond dynamique du slider manuel : une valeur tapée dans l'input
     *  number au-delà de manualQtyMax (500) ne doit pas casser le curseur
     *  (volumes stade, Estimation 0 — fiche 311_01). */
    manualSliderMax(elementId, menuItemId) {
      return Math.max(this.manualQtyMax, this.getManualQuantity(elementId, menuItemId))
    },
    /**
     * Ligne « jamais vendu ici » simulable : prédiction 0, item DANS le menu du
     * PDV (pas hors-menu/désactivé) et PDV OUVERT pour ce match. Un PDV fermé ne
     * se simule pas (il n'ouvre pas → ne doit pas gonfler le CA).
     */
    canSimulateRow(shop) {
      return (
        shop.predictedQty === 0 &&
        !(shop.assignmentLoaded && !shop.assigned) &&
        this.isShopOpen(shop.element.id)
      )
    },
    handleManualQuantity(elementId, menuItemId, units) {
      const u = Math.max(0, Math.round(Number(units) || 0))
      const next = { ...this.manualQuantities, [`${elementId}-${menuItemId}`]: u }
      this.$emit('update:manualQuantities', next)
      // Donner une quantité manuelle >0 = vouloir cet item dans la prédiction /
      // le stock → on l'AUTO-SÉLECTIONNE. Sans ça, `shopRevenues.adjusted`
      // (selectedSet) et `manualQuantityRecords` du parent (effectiveMenuConfig)
      // l'ignorent → le CA du shop et le CA global ne bougent pas.
      if (u > 0 && !this.isMenuItemSelected(elementId, menuItemId)) {
        const sel = { ...this.selectedMenuItems }
        const arr = sel[elementId] ? [...sel[elementId]] : []
        arr.push(menuItemId)
        sel[elementId] = arr
        this.$emit('update:selectedMenuItems', sel)
      }
    },
    /**
     * Stepper d'unités : fixe la quantité ajustée à `units` (entier ≥ 0) en
     * convertissant en % (units / prédit × 100), de sorte que slider % et
     * stepper restent synchronisés. Si prédit = 0, on ne peut pas dériver de %.
     */
    setItemUnits(elementId, menuItemId, units) {
      const u = Math.max(0, parseInt(units, 10) || 0)
      const predicted = this.getPredictedQuantity(elementId, menuItemId)
      if (predicted <= 0) return
      const pct = Math.round((u / predicted) * 100)
      this.handleQuantityAdjustment(elementId, menuItemId, pct)
    },
    stepItemUnits(elementId, menuItemId, delta) {
      const cur = this.getAdjustedQuantity(elementId, menuItemId)
      this.setItemUnits(elementId, menuItemId, cur + delta)
    },
    /**
     * Borne haute du slider en UNITÉS = prédit × 5 (équivaut à l'ancien max de
     * 500 %). Min 1 pour garder un slider fonctionnel si le prédit est faible.
     */
    unitSliderMax(elementId, menuItemId) {
      return Math.max(1, this.getPredictedQuantity(elementId, menuItemId) * 5)
    },
    // ----- Shop-level slider -----
    getShopAdjustmentValue(elementId) {
      return this.derivedShopAdjustments.get(elementId) ?? 100
    },
    handleShopAdjustment(elementId, percentage) {
      // Le slider shop n'agit QUE sur les items cochés (selectedMenuItems).
      // Un item 0-vente coché est déjà dans cette liste (toggle/auto-select via
      // saisie manuelle) → il reçoit le % et scale via getAdjustedQuantity.
      // Item décoché = jamais dans la liste = insensible au slider (voulu).
      const selected = this.selectedMenuItems[elementId] || []
      const next = { ...this.quantityAdjustments }
      for (const miId of selected) next[`${elementId}-${miId}`] = percentage
      this.$emit('update:quantityAdjustments', next)
    },
    resetShopAdjustment(elementId) {
      // Reset = 100 % sur les items cochés uniquement (restaure la base :
      // prédit brut, ou manuelle brute pour un 0-vente coché). Les items
      // décochés ne sont pas touchés → « reset sans effet » (voulu).
      this.handleShopAdjustment(elementId, 100)
    },
    // ----- Item-level slider -----
    getSelectedElementsForMenuItem(menuItemId) {
      return this.fbElements.filter((element) => {
        const selected = this.selectedMenuItems[element.id] || []
        return selected.includes(menuItemId)
      })
    },
    getItemAdjustmentValues(menuItemId) {
      return this.getSelectedElementsForMenuItem(menuItemId).map((element) => {
        const value = this.quantityAdjustments[`${element.id}-${menuItemId}`] ?? 100
        return Number(value)
      })
    },
    isItemAdjustmentMixed(menuItemId) {
      const values = new Set(this.getItemAdjustmentValues(menuItemId))
      return values.size > 1
    },
    getItemAdjustmentValue(menuItemId) {
      return this.derivedItemAdjustments.get(menuItemId) ?? 100
    },
    handleItemAdjustment(menuItemId, percentage) {
      const value = Number(percentage)
      if (!Number.isFinite(value)) return
      const next = { ...this.quantityAdjustments }
      const selectedElements = this.getSelectedElementsForMenuItem(menuItemId)
      if (!selectedElements.length) return
      for (const element of selectedElements) {
        next[`${element.id}-${menuItemId}`] = value
      }
      this.$emit('update:quantityAdjustments', next)
    },
    resetItemAdjustment(menuItemId) {
      this.handleItemAdjustment(menuItemId, 100)
    },
    // ----- Sliders fan-out ABSOLUS du mode estimation (fiche 311_02) -----
    // Base prédite = 0 partout en Estimation 0 → un % ne produit rien. Les
    // sliders shop/article écrivent ici des UNITÉS dans manualQuantities, sur
    // les mêmes ensembles de couples que leurs pendants % (items cochés).
    onEstimationScaleMax(value) {
      const n = Math.round(Number(value) || 0)
      this.estimationScaleMax = n >= 10 ? n : 1000
    },
    getShopEstimationValues(elementId) {
      const selected = this.selectedMenuItems[elementId] || []
      return selected.map((miId) => Number(this.manualQuantities[`${elementId}-${miId}`]) || 0)
    },
    getShopEstimationQty(elementId) {
      return uniformValue(this.getShopEstimationValues(elementId)) ?? 0
    },
    isShopEstimationMixed(elementId) {
      return uniformValue(this.getShopEstimationValues(elementId)) === null
        && this.getShopEstimationValues(elementId).length > 1
    },
    shopEstimationSliderMax(elementId) {
      const values = this.getShopEstimationValues(elementId)
      const current = values.length ? Math.max(...values) : 0
      return estimationSliderMax(this.estimationScaleMax, current)
    },
    handleShopEstimationQty(elementId, units) {
      const selected = this.selectedMenuItems[elementId] || []
      if (!selected.length) return
      const keys = selected.map((miId) => `${elementId}-${miId}`)
      this.$emit('update:manualQuantities', applyFanoutQuantity(this.manualQuantities, keys, units))
    },
    getItemEstimationValues(menuItemId) {
      return this.getSelectedElementsForMenuItem(menuItemId).map(
        (element) => Number(this.manualQuantities[`${element.id}-${menuItemId}`]) || 0,
      )
    },
    getItemEstimationQty(menuItemId) {
      return uniformValue(this.getItemEstimationValues(menuItemId)) ?? 0
    },
    isItemEstimationMixed(menuItemId) {
      return uniformValue(this.getItemEstimationValues(menuItemId)) === null
        && this.getItemEstimationValues(menuItemId).length > 1
    },
    itemEstimationSliderMax(menuItemId) {
      const values = this.getItemEstimationValues(menuItemId)
      const current = values.length ? Math.max(...values) : 0
      return estimationSliderMax(this.estimationScaleMax, current)
    },
    handleItemEstimationQty(menuItemId, units) {
      const selectedElements = this.getSelectedElementsForMenuItem(menuItemId)
      if (!selectedElements.length) return
      const keys = selectedElements.map((element) => `${element.id}-${menuItemId}`)
      this.$emit('update:manualQuantities', applyFanoutQuantity(this.manualQuantities, keys, units))
    },
    // ----- Availability (cf. React :467-589) -----
    isMenuItemAvailableInSpace(mi) {
      if (Array.isArray(mi.spaceIds) && mi.spaceIds.length > 0) {
        return mi.spaceIds.includes(this.spaceId)
      }
      if (!mi.components || mi.components.length === 0) return false
      const ingredientIds = new Set()
      const walk = (comp) => {
        if (comp.itemType === 'Ingredient') {
          ingredientIds.add(comp.sourceId)
        } else if (comp.itemType === 'Component') {
          const cdef = this.components.find((c) => c.id === comp.sourceId)
          if (cdef && Array.isArray(cdef.ingredients)) {
            for (const sub of cdef.ingredients) walk(sub)
          }
        }
      }
      for (const c of mi.components) walk(c)
      if (ingredientIds.size === 0) return true
      const supplierIds = new Set()
      for (const ingId of ingredientIds) {
        const ing = this.ingredients.find((i) => i.id === ingId)
        if (ing && ing.supplierId) supplierIds.add(ing.supplierId)
      }
      if (supplierIds.size === 0) return true
      return [...supplierIds].every((sid) => {
        const sup = this.suppliers.find((s) => s.id === sid)
        if (!sup) return false
        const sites = sup.sites || (sup.spaces ? sup.spaces.map((s) => s.spaceId) : [])
        if (!sites.length) return true
        return sites.includes(this.spaceId)
      })
    },
    checkMenuItemAvailability(mi) {
      // Item synthétique (issu des ventes réelles) → toujours dispo (il a été
      // vendu), pas de check ingrédients/fournisseurs.
      const isAvailable = mi._synthetic ? true : this.isMenuItemAvailableInSpace(mi)
      const missingIngredients = []
      if (!isAvailable && mi.components) {
        const ingredientIds = new Set()
        const walk = (comp) => {
          if (comp.itemType === 'Ingredient') ingredientIds.add(comp.sourceId)
          else if (comp.itemType === 'Component') {
            const cdef = this.components.find((c) => c.id === comp.sourceId)
            if (cdef && Array.isArray(cdef.ingredients)) for (const sub of cdef.ingredients) walk(sub)
          }
        }
        for (const c of mi.components) walk(c)
        const supplierIds = new Set()
        for (const ingId of ingredientIds) {
          const ing = this.ingredients.find((i) => i.id === ingId)
          if (ing && ing.supplierId) supplierIds.add(ing.supplierId)
        }
        for (const sid of supplierIds) {
          const sup = this.suppliers.find((s) => s.id === sid)
          if (!sup) continue
          const sites = sup.sites || (sup.spaces ? sup.spaces.map((s) => s.spaceId) : [])
          if (sites.length && !sites.includes(this.spaceId)) {
            const ing = this.ingredients.find((i) => i.supplierId === sid)
            if (ing) missingIngredients.push(ing.name)
          }
        }
      }
      let displayPrice = mi.basePrice || 0
      if (Array.isArray(mi.spaceSpecificPrices)) {
        const sp = mi.spaceSpecificPrices.find((p) => Array.isArray(p.spaceIds) && p.spaceIds.includes(this.spaceId))
        if (sp && sp.price != null) displayPrice = sp.price
      }
      return { ...mi, isAvailable, missingIngredients, displayPrice }
    },
    // ----- Revenues -----
    getPredictedRevenue(elementId) {
      return this.shopRevenues.get(elementId)?.predicted || 0
    },
    getAdjustedRevenue(elementId) {
      return this.shopRevenues.get(elementId)?.adjusted || 0
    },
    // ----- Réconciliation (Lot 1) : statut mapped/remapped/unmapped -----
    // Keyé par NOM de shop normalisé (clé universelle, cf. EventPredictView).
    itemMapStatus(element, menuItemId) {
      const key = normalizeStr(element?.name)
      return this.mapStatusByShop?.[key]?.[menuItemId] || null
    },
    /**
     * Items d'un shop groupés pour l'affichage : d'abord ceux du menu réel /
     * prédits-rattachés, puis les « non rattachés » (prédits sans correspondance
     * dans le menu assigné = statut 'unmapped'). Chaque entrée porte `_mapGroup`
     * ('other'|'unmapped') et `_isFirstUnmapped` (pour insérer l'en-tête une fois).
     */
    assignedItemsForElement(element) {
      return (
        this.shopMenuAssignmentItems[normalizeStr(element?.name)] ||
        this.shopMenuAssignmentItems[element?.id] ||
        null
      )
    },
    assignedIdsForElement(element) {
      const arr = this.assignedItemsForElement(element)
      return Array.isArray(arr) ? new Set(arr.map((it) => it.id)) : null
    },
    unmappedItemViewCount() {
      return this.filteredMenuItemsForItemView.filter((e) => e._mapGroup === 'unmapped').length
    },
    // Kebab article : vrai si l'article est déjà proposé sur TOUS les shops F&B
    // de la config. `assignedIdsForElement` rend null tant que l'assignation du
    // shop n'est pas chargée → on ne grise PAS dans le doute (l'action bulk est
    // idempotente côté backend, delta partiel par couple shop/item).
    isItemAssignedEverywhere(menuItemId) {
      if (!this.fbElements.length) return false
      return this.fbElements.every((el) => {
        const ids = this.assignedIdsForElement(el)
        return ids !== null && (ids.has(menuItemId) || ids.has(String(menuItemId)))
      })
    },
    toggleUnmappedItemView() {
      this.unmappedItemViewOpen = !this.unmappedItemViewOpen
    },
    // True dès qu'au moins un shop de la config a un menu assigné (feature active).
    assignmentFeatureActive() {
      return Object.keys(this.shopMenuAssignmentItems || {}).length > 0
    },
    /**
     * Items d'un shop répartis en 3 catégories MUTUELLEMENT EXCLUSIVES
     * (`_bucket`), affichées en onglets (cf. template) plutôt qu'en liste
     * plate + accordéon « non rattachés » :
     *  - 'sales'    : attaché au Space Menu du shop ET vente prédite > 0.
     *  - 'noSales'   : attaché au Space Menu du shop MAIS 0 vente prédite.
     *  - 'unmapped' : vendu (qté prédite > 0) mais ABSENT du Space Menu
     *                 assigné — à rattacher.
     * `getFilteredMenuItems` (recherche texte par shop) est appliqué en
     * amont sur `base` ET sur `assignedItems` (2 sources séparées).
     */
    getGroupedMenuItems(element) {
      const base = this.getFilteredMenuItems(element)
      const assignedItems = this.assignedItemsForElement(element)
      const q = this.getShopSearchQuery(element.id).trim().toLowerCase()
      const matchesSearch = (it) => !q || it.name.toLowerCase().includes(q)
      if (Array.isArray(assignedItems) && assignedItems.length) {
        // Liste principale = menu RÉEL assigné (NestJS). Enrichi disponibilité/prix.
        // _ghost = ligne d'assignation dont l'id n'existe PAS au catalogue (posté
        // avec un id synthétique avant le garde-fou) : invisible dans le drawer
        // Space Menus (jointure catalogue) → seul EventPredict peut la retirer.
        const assignedIds = new Set(assignedItems.map((it) => it.id))
        const out = assignedItems.filter(matchesSearch).map((it) => ({
          ...this.checkMenuItemAvailability(it),
          _bucket: this.getPredictedQuantity(element.id, it.id) > 0 ? 'sales' : 'noSales',
          _ghost:
            this.spaceCatalogIdSet.size > 0 &&
            !this.spaceCatalogIdSet.has(String(it.id)),
          // BUG-291-02 — la vérité SERVEUR écrase la dérivation front de
          // `checkMenuItemAvailability`, qui applique encore la règle abandonnée
          // « fournisseur sans sites = livre tous les espaces ». Écrit APRÈS le
          // spread, sans quoi la dérivation front reprendrait la main.
          // La quantité prévue étant forcée à 0 en amont, `_bucket` vaut alors
          // 'noSales' : l'article reste visible, avec sa raison, au lieu de
          // ressortir en « Non attachés au menu » avec sa quantité intacte.
          ...(it.available === false
            ? {
                isAvailable: false,
                _serverUnavailable: true,
                _serverNoRecipe: it.hasRecipe === false,
                missingIngredients: Array.isArray(it.missingIngredients)
                  ? it.missingIngredients
                  : [],
              }
            : {}),
        }))
        // « Non rattachés » = items vendus (qté prédite > 0) absents du menu assigné.
        const unmapped = base.filter(
          (it) => !assignedIds.has(it.id) && this.getPredictedQuantity(element.id, it.id) > 0,
        )
        unmapped.forEach((it) => out.push({ ...it, _bucket: 'unmapped' }))
        return out
      }
      if (this.assignmentFeatureActive()) {
        // Shop SANS menu assigné mais feature active (ex. onglet « Closed ») →
        // menu réel vide, tout le vendu = « Non rattachés ».
        const unmapped = base.filter((it) => this.getPredictedQuantity(element.id, it.id) > 0)
        return unmapped.map((it) => ({ ...it, _bucket: 'unmapped' }))
      }
      // Anti-régression : aucune assignation dans toute la config → catalogue,
      // réparti sales/noSales selon la prédiction (pas d'« unmapped » possible
      // ici, rien n'est assigné nulle part dans la config).
      return base.map((it) => ({
        ...it,
        _bucket: this.getPredictedQuantity(element.id, it.id) > 0 ? 'sales' : 'noSales',
      }))
    },
    /** Comptes des 3 onglets pour ce shop (badges). */
    getShopTabCounts(element) {
      const counts = { sales: 0, noSales: 0, unmapped: 0 }
      for (const it of this.getGroupedMenuItems(element)) {
        counts[it._bucket] = (counts[it._bucket] || 0) + 1
      }
      return counts
    },
    /** Items du seul onglet actif (celui affiché dans la liste). */
    getActiveBucketItems(element) {
      const tab = this.getShopTab(element.id)
      return this.getGroupedMenuItems(element).filter((it) => it._bucket === tab)
    },
    // ----- Selection -----
    isMenuItemSelected(elementId, menuItemId) {
      return (this.selectedMenuItems[elementId] || []).includes(menuItemId)
    },
    /** Item réellement assigné au menu du shop (Space Menus, source de vérité). */
    isItemAssigned(element, menuItemId) {
      const ids = this.assignedIdsForElement(element)
      return !!ids && ids.has(menuItemId)
    },
    /**
     * Cet item appartient-il au Space Menu du shop ? Vrai si :
     *  - déjà assigné/activé (isItemAssigned) ; OU
     *  - présent dans l'appartenance COMPLÈTE (enabled+disabled) fournie par le
     *    parent (shopMenuMembership), par id ou par nom normalisé.
     * Un item Weezevent non mappé (ex. FRITES absent du menu de 2A) → false.
     * Garde-fou inactif (rétro-compat) tant que shopMenuMembership n'est pas chargé.
     */
    isInShopMenu(element, menuItemId, itemName) {
      if (this.isItemAssigned(element, menuItemId)) return true
      const membership = this.shopMenuMembership
      if (!membership) return true // pas d'info d'appartenance → ne pas bloquer
      const key = normalizeStr(element?.name)
      const entry =
        membership instanceof Map
          ? membership.get(key)
          : membership[key]
      if (!entry) return false
      if (entry.ids && entry.ids.has(String(menuItemId))) return true
      const nm = normalizeStr(itemName)
      return !!(nm && entry.names && entry.names.has(nm))
    },
    /**
     * Article assigné au Space Menu du shop mais NON DISPONIBLE côté serveur
     * (BUG-291-02) : recette absente, ingrédient inactif / sans fournisseur, ou
     * fournisseur ne livrant pas l'espace. Un tel article ne peut pas être servi
     * → aucune vente prévue, aucun CA, aucune ligne de stock.
     *
     * ⚠️ À ne PAS confondre avec `enabled === false` (article désactivé sur le
     * menu du PDV) : celui-là garde son flux « réactiver » inchangé.
     *
     * Appariement id PUIS nom normalisé, comme `isInShopMenu` — l'id porté par la
     * timeline peut différer de l'id catalogue. Garde inactive tant que la prop
     * n'est pas chargée.
     */
    isItemUnavailable(element, menuItemId, itemName) {
      const src = this.shopMenuUnavailable
      if (!src) return false
      const key = normalizeStr(element?.name)
      const entry = src instanceof Map ? src.get(key) : src[key]
      if (!entry) return false
      if (entry.ids && entry.ids.has(String(menuItemId))) return true
      const nm = normalizeStr(itemName ?? this.menuItemsById.get(menuItemId)?.name)
      return !!(nm && entry.names && entry.names.has(nm))
    },
    /**
     * Action proposée pour une ligne HORS menu activé :
     *  - 'reactivate' : article MEMBRE du Space Menu du PDV mais désactivé →
     *                   POST enabled:true le réactive ;
     *  - 'add'        : non-membre AVEC un id catalogue valide → ajout direct
     *                   sûr (pas de ligne fantôme) ;
     *  - 'remap'      : non-membre SANS id catalogue (item synthétique/timeline)
     *                   → passer par le remap (correspondance de nom) d'abord.
     */
    rowAddKind(element, menuItemId, itemName) {
      if (this.isInShopMenu(element, menuItemId, itemName)) return 'reactivate'
      if (this.spaceCatalogIdSet.has(String(menuItemId))) return 'add'
      return 'remap'
    },
    /** Ajoute/réactive l'article dans le Space Menu du PDV (délégué au parent). */
    emitAddToMenu(element, item) {
      this.$emit('assign-shop-item', {
        elementId: element.id,
        shopName: element.name,
        menuItemId: item.id,
        enabled: true,
      })
    },
    /**
     * État de la case d'un item :
     *  - shop OUVERT → sélection de prédiction locale (comportement historique) ;
     *  - shop FERMÉ  → état RÉEL Space Menus (items décochés : c'est justement
     *    pourquoi le shop est fermé). Avant, la sélection dérivée des ventes
     *    affichait des items « cochés » sur un PDV fermé — mensonger.
     */
    itemCheckboxState(element, menuItemId) {
      // BUG-291-02 : article indisponible → jamais présenté comme coché. Une
      // version sauvegardée antérieure peut encore le porter dans sa sélection ;
      // on la neutralise à la LECTURE, sans réécrire le choix de l'utilisateur.
      if (this.isItemUnavailable(element, menuItemId)) return false
      if (this.isShopOpen(element.id)) return this.isMenuItemSelected(element.id, menuItemId)
      return this.isItemAssigned(element, menuItemId)
    },
    /**
     * Cocher un item d'un shop FERMÉ = l'assigner dans Space Menus (write-through,
     * délégué au parent via `assign-shop-item`) → le PDV repasse « Opened ».
     * Shop ouvert → toggle local historique (sélection de prédiction).
     */
    /**
     * UI temporaire de nettoyage : retire une ligne d'assignation « fantôme »
     * (id hors catalogue) du Space Menu du shop. POST enabled:false via le
     * chemin existant — marche même shop « Open » (la case, elle, ne toggle
     * que la sélection locale sur un shop ouvert). Jamais bloqué par le
     * garde-fou (désactivation toujours permise).
     */
    removeAssignedItem(element, item) {
      this.$emit('assign-shop-item', {
        elementId: element.id,
        shopName: element.name,
        menuItemId: item.id,
        enabled: false,
      })
    },
    onItemCheckboxChange(element, menuItemId, checked, item) {
      // BUG-291-02 : un article indisponible n'est pas sélectionnable — le cocher
      // le réinjecterait dans le CA et le stock-up. La correction se fait dans
      // Space Menus (recette / fournisseur), pas ici.
      if (this.isItemUnavailable(element, menuItemId, item && item.name)) return
      if (this.isShopOpen(element.id)) {
        // Sélection locale INSTANTANÉE → pilote le CA ajusté sans latence réseau.
        this.toggleMenuItem(element.id, menuItemId)
        // Persiste l'ATTACHEMENT au Space Menu du shop : cocher = attacher,
        // décocher = détacher (write-through). Un article synthétique sans id
        // catalogue n'est pas attachable tel quel (remap requis) → compté
        // localement, persistance laissée au bouton remap dédié.
        const attachable =
          checked !== true ||
          this.rowAddKind(element, menuItemId, item && item.name) !== 'remap'
        if (attachable) {
          this.$emit('assign-shop-item', {
            elementId: element.id,
            shopName: element.name,
            menuItemId,
            enabled: checked === true,
          })
        }
        return
      }
      // Garde-fou : ouvrir un PDV fermé (activation) exige que l'item soit dans
      // son Space Menu. Item non mappé (Weezevent) → bloqué, remap requis.
      // Décocher (retrait) reste toujours permis.
      if (checked === true && !this.isInShopMenu(element, menuItemId, item && item.name)) {
        this.$emit('assign-blocked', {
          shopName: element.name,
          itemName: (item && item.name) || '',
        })
        return
      }
      this.$emit('assign-shop-item', {
        elementId: element.id,
        shopName: element.name,
        menuItemId,
        enabled: checked === true,
      })
    },
    toggleMenuItem(elementId, menuItemId) {
      const next = { ...this.selectedMenuItems }
      const arr = next[elementId] ? [...next[elementId]] : []
      const idx = arr.indexOf(menuItemId)
      if (idx >= 0) arr.splice(idx, 1)
      else arr.push(menuItemId)
      next[elementId] = arr
      this.$emit('update:selectedMenuItems', next)
    },
    // ----- Select all -----
    getSelectAllStateShop(elementId) {
      const avail = (this.menuItemsPerElement.get(elementId) || []).filter((i) => i.isAvailable)
      const sel = new Set(this.selectedMenuItems[elementId] || [])
      if (!avail.length) return { checked: false, indeterminate: false }
      const c = avail.filter((i) => sel.has(i.id)).length
      if (c === 0) return { checked: false, indeterminate: false }
      if (c === avail.length) return { checked: true, indeterminate: false }
      return { checked: false, indeterminate: true }
    },
    getSelectAllStateItem(menuItemId) {
      const entry = this.groupByMenuItemArray.find((e) => e.menuItemId === menuItemId)
      if (!entry) return { checked: false, indeterminate: false }
      const availShops = entry.shops.filter((s) => this.isShopItemAvailable(s.element, menuItemId))
      if (!availShops.length) return { checked: false, indeterminate: false }
      const c = availShops.filter((s) => s.selected).length
      if (c === 0) return { checked: false, indeterminate: false }
      if (c === availShops.length) return { checked: true, indeterminate: false }
      return { checked: false, indeterminate: true }
    },
    getSelectAllCheckboxValue(id, mode) {
      const s = mode === 'shop' ? this.getSelectAllStateShop(id) : this.getSelectAllStateItem(id)
      if (s.indeterminate) return 'indeterminate'
      return s.checked
    },
    handleSelectAllForShop(elementId, checked) {
      const avail = (this.menuItemsPerElement.get(elementId) || []).filter((i) => i.isAvailable)
      const element = this.fbElementsById.get(elementId)
      // Shop FERMÉ : même garde-fou que la case unitaire (onItemCheckboxChange)
      // — cocher n'est permis QUE pour les items déjà membres du Space Menu du
      // shop (activés ou non). Select All ne doit pas créer de ligne
      // d'assignation pour un item hors menu juste parce qu'il a un id
      // catalogue valide (règle plus stricte que sur shop ouvert). Décocher
      // reste toujours permis, shop ouvert ou fermé.
      const shopClosed = checked === true && element && !this.isShopOpen(elementId)
      const allowed = shopClosed
        ? avail.filter((i) => this.isInShopMenu(element, i.id, i.name))
        : avail
      const next = { ...this.selectedMenuItems }
      next[elementId] = checked ? allowed.map((i) => i.id) : []
      this.$emit('update:selectedMenuItems', next)
      if (shopClosed && allowed.length < avail.length) {
        this.$emit('assign-blocked', {
          shopName: element.name,
          itemName: `${avail.length - allowed.length} article(s) hors menu`,
        })
      }
      // Write-through BATCH vers Space Menu : 1 seul appel réseau pour tout le
      // shop (au lieu d'1 par item comme des clics individuels). Même règle
      // d'attachabilité que la case unitaire pour un shop ouvert : un article
      // synthétique sans id catalogue (remap requis) reste local only.
      if (!element) return
      const changes = {}
      for (const it of allowed) {
        if (checked !== true || this.rowAddKind(element, it.id, it.name) !== 'remap') {
          changes[it.id] = checked === true
        }
      }
      if (Object.keys(changes).length) {
        this.$emit('assign-shop-items', { elementId, shopName: element.name, changes })
      }
    },
    handleSelectAllForMenuItem(menuItemId, checked) {
      const entry = this.groupByMenuItemArray.find((e) => e.menuItemId === menuItemId)
      if (!entry) return
      const availShops = entry.shops.filter((s) => this.isShopItemAvailable(s.element, menuItemId))
      const next = { ...this.selectedMenuItems }
      for (const { element } of availShops) {
        const arr = next[element.id] ? [...next[element.id]] : []
        const idx = arr.indexOf(menuItemId)
        if (checked && idx < 0) arr.push(menuItemId)
        else if (!checked && idx >= 0) arr.splice(idx, 1)
        next[element.id] = arr
      }
      this.$emit('update:selectedMenuItems', next)
      // Write-through par shop : 1 seul item ici par shop, pas de gain à
      // batcher (contrairement à Select All d'un shop qui, lui, groupe N items).
      // Même garde-fou shop fermé que handleSelectAllForShop : cocher exige
      // membership Space Menu, décocher toujours permis.
      const itemName = entry.menuItem && entry.menuItem.name
      for (const { element } of availShops) {
        if (checked === true && !this.isShopOpen(element.id) && !this.isInShopMenu(element, menuItemId, itemName)) {
          continue
        }
        if (checked !== true || this.rowAddKind(element, menuItemId, itemName) !== 'remap') {
          this.$emit('assign-shop-item', {
            elementId: element.id,
            shopName: element.name,
            menuItemId,
            enabled: checked === true,
          })
        }
      }
    },
    onSelectAllLabelClickShop(elementId) {
      const s = this.getSelectAllStateShop(elementId)
      this.handleSelectAllForShop(elementId, !s.checked)
    },
    onSelectAllLabelClickItem(menuItemId) {
      const s = this.getSelectAllStateItem(menuItemId)
      this.handleSelectAllForMenuItem(menuItemId, !s.checked)
    },
    isShopItemAvailable(element, menuItemId) {
      const items = this.menuItemsPerElement.get(element.id) || []
      const it = items.find((i) => i.id === menuItemId)
      return it ? it.isAvailable : false
    },
    // ----- Expansion -----
    // PDV/groupes repliés par défaut ; dépliés à la demande via toggle.
    setElementExpanded(id, open) {
      const next = new Set(this.expandedElements)
      if (open) next.add(id)
      else next.delete(id)
      this.expandedElements = next
    },
    toggleElementExpanded(id) {
      this.setElementExpanded(id, !this.expandedElements.has(id))
    },
    // ----- Accordéon SHOP : un seul ouvert à la fois -----
    // Distinct de expandedElements/toggleElementExpanded (vue Item, multi-open,
    // inchangée) : ici une valeur unique, pas un Set — ouvrir un shop ferme
    // implicitement celui qui était ouvert.
    isShopExpanded(elementId) {
      return this.expandedShopId === elementId
    },
    toggleShopExpanded(elementId) {
      this.expandedShopId = this.expandedShopId === elementId ? null : elementId
    },
    setShopExpanded(elementId, open) {
      this.expandedShopId = open
        ? elementId
        : (this.expandedShopId === elementId ? null : this.expandedShopId)
    },
    // ----- Onglet actif (3 catégories) par shop -----
    getShopTab(elementId) {
      // Estimation 0 : sans historique, l'onglet « ventes » est vide (badge 0)
      // → défaut sur 'noSales' où vivent les lignes simulables à saisie
      // manuelle. Hors mode estimation, défaut historique inchangé.
      return this.shopTab[elementId] || (this.estimationActive ? 'noSales' : 'sales')
    },
    setShopTab(elementId, tab) {
      this.shopTab = { ...this.shopTab, [elementId]: tab }
    },
    /**
     * Toggle d'un chip-filtre global (un seul actif à la fois). À l'activation
     * en vue PDV, bascule le bucket interne des cartes retenues sur la
     * catégorie filtrée (impératif ici, jamais dans un computed) — la
     * désactivation ne restaure rien (l'utilisateur garde la main).
     */
    toggleGlobalChip(kind) {
      const next = this.globalChipFilter === kind ? null : kind
      this.globalChipFilter = next
      if (!next || this.viewMode !== 'shop') return
      for (const el of this.fbElements) {
        const c = this.chipCountsByElement.get(el.id) || {}
        if ((c[kind] || 0) > 0) this.setShopTab(el.id, kind)
      }
    },
    /** Une entrée de la vue article matche-t-elle le chip-filtre donné ?
     *  Même critère dynamique que les compteurs : « sans vente prévue » =
     *  aucune quantité AJUSTÉE (prédite ou manuelle) sur aucun PDV. */
    entryMatchesChip(entry, kind) {
      if (kind === 'unmapped') return entry._mapGroup === 'unmapped'
      return (
        entry._mapGroup !== 'unmapped' &&
        entry.shops.every((s) => (s.adjustedQty || 0) === 0)
      )
    },
    // Recherche texte par shop (remplace les chips catégorie dans l'en-tête —
    // elles rallongeaient l'en-tête de l'accordéon même replié). Filtre par
    // nom d'article uniquement (pas de notion de catégorie ici).
    getFilteredMenuItems(element) {
      const items = this.menuItemsPerElement.get(element.id) || []
      const q = this.getShopSearchQuery(element.id).trim().toLowerCase()
      if (!q) return items
      return items.filter((it) => it.name.toLowerCase().includes(q))
    },
    getShopSearchQuery(elementId) {
      return this.shopSearchQuery[elementId] || ''
    },
    setShopSearchQuery(elementId, v) {
      this.shopSearchQuery = { ...this.shopSearchQuery, [elementId]: v || '' }
    },
    // ----- Item View totals -----
    totalPredictedFor(entry) {
      return entry.shops.reduce((s, sh) => s + sh.predictedQty, 0)
    },
    totalAdjustedFor(entry) {
      return entry.shops.filter((s) => s.selected).reduce((s, sh) => s + sh.adjustedQty, 0)
    },
  },
}
</script>

<style scoped>
/* Empty state */
.ep-menus-empty {
  border: 1px dashed var(--border, #e5e7eb);
  border-radius: 8px;
}
/* Réconciliation Lot 1 : badges d'état mapped/remapped/unmapped + warning.
   Couleurs via tokens du thème (pas de palette importée). */
.ep-menus-assign-warning {
  margin-bottom: 0.75rem;
}
/* Bandeau estimation (fiche 311_02) : message + champ « échelle max » des
   sliders absolus sur une même ligne, repli propre en étroit. Le champ reprend
   le style de .ep-manual-qty-input (charte fermée : pas de nouveau font-size). */
.ep-estimation-banner-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.ep-estimation-scale {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  white-space: nowrap;
}
.ep-estimation-scale input {
  width: 72px;
  text-align: right;
  font-size: 0.75rem;
  color: inherit;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  padding: 1px 4px;
  background: transparent;
}
/* Saisie directe de la quantité manuelle (Estimation 0, fiche 311_01) —
   remplace l'ancien span lecture seule à côté du slider. Taille de police
   héritée de la ligne (charte fermée : pas de nouveau font-size). */
.ep-manual-qty-input {
  width: 64px;
  text-align: right;
  font-size: 0.75rem;
  color: inherit;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 4px;
  padding: 1px 4px;
  background: transparent;
}
/* Ligne « non rattaché » : badge + kebab d'actions sur UNE ligne, alignés,
   hauteur uniforme (remplace la rangée de boutons texte qui débordait). */
.ep-unmapped-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-left: 0.375rem;
  vertical-align: middle;
}
.ep-unmapped-actions .ep-map-badge {
  margin-left: 0;
}
/* En-tête d'article : nom/prix à gauche, tous les badges + kebab à droite,
   sur UNE seule ligne, même hauteur. */
.ep-menu-item-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.ep-menu-item-line > .ep-menu-item-title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
}
.ep-menu-item-line > .ep-unmapped-actions {
  flex-shrink: 0;
  margin-left: 0;
}
.ep-map-badge {
  display: inline-block;
  margin-left: 0.375rem;
  padding: 0 0.375rem;
  border-radius: 999px;
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 1.25rem;
  vertical-align: middle;
  white-space: nowrap;
}
.ep-map-badge--unmapped {
  color: var(--destructive, #b91c1c);
  background: color-mix(in srgb, var(--destructive, #b91c1c) 12%, transparent);
}
.ep-map-badge--remapped {
  color: var(--primary, #2563eb);
  background: color-mix(in srgb, var(--primary, #2563eb) 12%, transparent);
}
/* Article au menu du PDV mais impossible à fabriquer (BUG-291-02) : orange, comme
   le fond de ligne et la ligne « Manquant : … » qui portent déjà cette sémantique. */
.ep-map-badge--unavailable {
  color: #c2410c;
  background: color-mix(in srgb, #c2410c 12%, transparent);
}
.dark .ep-map-badge--unavailable {
  color: #fb923c;
  background: color-mix(in srgb, #fb923c 16%, transparent);
}
/* PDV sans historique de vente : badge neutre (pas d'alerte) + toggle simulation. */
.ep-map-badge--nohist {
  margin-left: 0;
  color: var(--muted-foreground, #64748b);
  background: color-mix(in srgb, var(--muted-foreground, #64748b) 12%, transparent);
}
/* Cible d'un alias « historique emprunté » (maquettes 08/2026) : vert succès —
   la ligne a récupéré des prévisions, ce n'est pas une alerte. */
.ep-map-badge--history {
  color: var(--fb-success, #0e7a5f);
  background: color-mix(in srgb, var(--fb-success, #0e7a5f) 12%, transparent);
}
.dark .ep-map-badge--history {
  color: #3dbd97;
  background: color-mix(in srgb, #3dbd97 16%, transparent);
}
.ep-nohist-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.ep-nohist-label {
  font-size: 0.75rem;
  color: var(--muted-foreground, #64748b);
}
/* Alerte donnée de coût aberrante (coût unitaire > prix HT). */
.ep-cost-alert-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.125rem;
  margin-left: 0.375rem;
  padding: 0 0.375rem;
  border-radius: 999px;
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 1.25rem;
  vertical-align: middle;
  white-space: nowrap;
  color: var(--destructive, #b91c1c);
  background: color-mix(in srgb, var(--destructive, #b91c1c) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--destructive, #b91c1c) 35%, transparent);
}
/* En-tête repliable du groupe « non rattachés » + lignes du groupe. */
.ep-unmapped-header {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  margin: 0.5rem 0 0.25rem;
  padding: 0.375rem 0.5rem;
  border-top: 1px dashed var(--border, #e5e7eb);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--destructive, #b91c1c);
  cursor: pointer;
  user-select: none;
}
.ep-unmapped-header:hover {
  background: color-mix(in srgb, var(--destructive, #b91c1c) 6%, transparent);
}
.ep-unmapped-row {
  border-left: 3px solid var(--destructive, #b91c1c) !important;
}
.ep-remap-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  margin-left: 0.375rem;
  padding: 0 0.4rem;
  height: 1.25rem;
  border: 1px solid var(--primary, #2563eb);
  border-radius: 999px;
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--primary, #2563eb);
  background: transparent;
  cursor: pointer;
  vertical-align: middle;
}
.ep-remap-btn:hover {
  background: color-mix(in srgb, var(--primary, #2563eb) 12%, transparent);
}
/* Article présent HORS menu activé du PDV : non compté par défaut dans le CA
   ajusté (case décochée), mais pleinement LISIBLE et cochable — plus d'opacité.
   Cocher = attacher au menu + compter. */
/* Bouton « Ajouter/Réactiver au menu » : variante verte du bouton pilule. */
.ep-add-btn {
  border-color: var(--success, #16a34a);
  color: var(--success, #16a34a);
}
.ep-add-btn:hover {
  background: color-mix(in srgb, var(--success, #16a34a) 12%, transparent);
}
/* Lien discret vers l'écran Space Menus. */
.ep-spacemenu-link {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  margin-left: 0.375rem;
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--muted-foreground, #6b7280);
  text-decoration: underline;
  vertical-align: middle;
}
/* Toolbar parity with MenuItemsByShopTable: pill search + pill tabs */
.ep-toolbar {
  margin-bottom: 0.25rem;
}
.ep-toolbar-search {
  display: flex;
  align-items: center;
  height: 38px;
  background-color: var(--fb-border, #f3f4f6);
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 9999px;
  padding: 0 14px;
  /* Barre resserrée (maquettes 08/2026) : 520 → 340 px, place aux chips. */
  flex: 1 1 260px;
  min-width: 220px;
  max-width: 340px;
}
.ep-toolbar-search-icon {
  color: var(--fb-faint, #9ca3af);
  margin-right: 6px;
}
.ep-toolbar-search-input {
  flex: 1;
  height: 100%;
  background: transparent;
  border: 0;
  outline: 0;
  font-size: 14px;
  color: var(--fb-text, #111827);
}
.ep-toolbar-search-input::placeholder {
  color: var(--fb-muted, #6b7280);
}
/* Chips-filtres « reste à traiter » de la toolbar (maquettes 08/2026).
   Même langage visuel que la recherche et les tabs pilule voisines : hauteur
   38px, fond --fb-subtle, bordure --fb-border, radius 9999px. Actif = accent
   produit (--fb-primary-soft / #ff3131), comme .ep-remap-btn et le badge
   remappé — le point coloré porte seul la sémantique (orange = sans vente
   prévue, rouge = non attaché). */
.ep-chip-filters {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.ep-chip-filter {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 38px;
  padding: 0 14px;
  border-radius: 9999px;
  border: 1px solid var(--fb-border, #e5e7eb);
  background: var(--fb-subtle, #fafafa);
  color: var(--fb-muted, #6b7280);
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}
.ep-chip-filter:hover {
  color: var(--fb-text, #111827);
  border-color: var(--fb-border, #d1d5db);
}
.ep-chip-filter-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.ep-chip-filter--nopred .ep-chip-filter-dot {
  background: #c2410c;
}
.ep-chip-filter--outmenu .ep-chip-filter-dot {
  background: var(--destructive, #b91c1c);
}
.ep-chip-filter--on {
  border-color: rgba(255, 49, 49, 0.35);
  background: var(--fb-primary-soft, #fff5f5);
  color: #ff3131;
}
.ep-toolbar-tabs {
  height: 38px;
  border-radius: 9999px;
  padding: 3px;
  /* Espacement entre puces (elles étaient collées). w-fit pour ne pas s'étirer. */
  gap: 6px;
  width: max-content;
}
/* ── Chips catégorie défilables : viewport scroll + flèches G/D. ── */
.ep-cat-scroller {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
}
.ep-cat-viewport {
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
  scroll-behavior: smooth;
}
.ep-cat-viewport::-webkit-scrollbar { display: none; }
.ep-cat-arrow {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 9999px;
  border: 1px solid var(--fb-border, #e5e7eb);
  background: var(--fb-surface, #fff);
  color: #374151;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease;
}
.ep-cat-arrow:hover {
  background: var(--fb-border, #f3f4f6);
  border-color: var(--fb-border-strong, #d1d5db);
}
/* Pills Open/Closed au gabarit Space Menus : 13px/500, actif 700, compteur
   rond 18px/10px (cf. .smv-status-pill / __count de SpaceMenuView). */
.ep-toolbar-tabs :deep([data-slot="tabs-trigger"]),
.ep-toolbar-tabs :deep([role="tab"]) {
  border-radius: 9999px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
}
.ep-toolbar-tabs :deep([data-state='active']) {
  font-weight: 700;
}
.ep-toolbar-tabs :deep([data-slot="badge"]) {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 700;
  line-height: 18px;
  /* Pastilles compteur en rouge charte (écrase le variant "secondary" bleu). */
  background:#ff3131 !important;
  color: #fff !important;
  border: 0 !important;
}
/* Recherche par shop (remplace les chips catégorie dans l'en-tête). */
.ep-shop-search {
  display: flex;
  align-items: center;
  height: 34px;
  background-color: var(--fb-border, #f3f4f6);
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: 9999px;
  padding: 0 12px;
  width: 100%;
  margin-bottom: 8px;
}
.ep-shop-search-icon {
  color: var(--fb-faint, #9ca3af);
  margin-right: 6px;
}
.ep-shop-search-input {
  flex: 1;
  height: 100%;
  background: transparent;
  border: 0;
  outline: 0;
  font-size: 13px;
  color: var(--fb-text, #111827);
}
.ep-shop-search-input::placeholder {
  color: var(--fb-muted, #6b7280);
}
/* 3 onglets ventes/non-attachés/sans-ventes par shop : la carte est plus
   étroite que la toolbar globale → autoriser le retour à la ligne. */
.ep-shop-tabs {
  width: 100%;
  height: auto;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.ep-shop-tab-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.ep-shop-tab-help {
  opacity: 0.55;
  cursor: help;
}
.ep-shop-tab-help:hover {
  opacity: 0.9;
}
.ep-shop-tab-content,
.ep-item-tab-content {
  overflow: visible;
}
.ep-shop-items-list {
  width: 100%;
  overflow: visible;
}
.ep-shop-card {
  border-radius: 18px !important;
  border-color: #d6dbe3;
  background: var(--fb-surface, #ffffff);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
}
.ep-shop-card :deep([data-slot="collapsible-trigger"]) {
  width: 100%;
  border: 0;
  background: transparent;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
}
.ep-shop-card-header {
  padding: 22px 24px !important;
  background: var(--fb-surface, #ffffff);
  /* Pin au scroll dans le shop déplié : reste visible jusqu'à ce que la carte
     suivante prenne le relais (comportement natif sticky, empilement séquentiel).
     Le conteneur scrollable réel est `.ep-predict-section-panel` (parent,
     EventPredictView.vue) — sticky s'y accroche automatiquement du moment
     qu'aucun ancêtre entre les deux n'a overflow:hidden (Card retiré exprès). */
  position: sticky;
  top: 0;
  z-index: 5;
}
.ep-shop-card-header:hover {
  background: var(--fb-subtle, #f8fafc);
}
.ep-shop-card-grid {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.ep-shop-card-main {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  flex: 1 1 auto;
  min-width: 0;
}
.ep-shop-card-image {
  width: 56px;
  height: 56px;
  border-radius: 10px;
  object-fit: cover;
  flex-shrink: 0;
  border: 1px solid var(--fb-border, #e5e7eb);
}
.ep-shop-card-content {
  flex: 1 1 auto;
  min-width: 0;
}
.ep-shop-card-title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}
.ep-shop-card-summary {
  width: 100%;
  border-radius: 10px;
  cursor: pointer;
  outline: none;
}
.ep-shop-card-summary:focus-visible,
.ep-shop-chevron-btn:focus-visible,
.ep-item-summary-row:focus-visible,
.ep-item-chevron-btn:focus-visible {
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.24);
}
.ep-shop-card-title {
  min-width: 0;
  /* Échelle Space Menus : titre 16px/700 (était 1.35rem ≈ 21,6px). */
  font-size: 1rem;
  line-height: 1.2;
  font-weight: 700;
  letter-spacing: 0;
  color: #020617;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ep-shop-card-revenue {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--fb-text, #0f172a);
  white-space: nowrap;
}
.ep-revenue-pill,
.ep-quantity-pill {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  min-height: 28px;
  padding: 4px 9px;
  border: 1px solid #dbe4ee;
  border-radius: 9999px;
  background: var(--fb-subtle, #f8fafc);
  color: var(--fb-muted, #334155);
  font-size: 0.75rem;
  line-height: 1;
}
.ep-revenue-pill strong,
.ep-quantity-pill strong {
  color: #020617;
  font-size: 0.875rem;
  font-weight: 800;
}
.ep-revenue-label,
.ep-quantity-pill span {
  color: var(--fb-muted, #64748b);
  font-weight: 650;
}
.ep-revenue-pill-adjusted,
.ep-quantity-pill-adjusted {
  border-color: rgba(124, 58, 237, 0.28);
  background: rgba(124, 58, 237, 0.08);
}
.ep-revenue-pill-adjusted strong,
.ep-quantity-pill-adjusted strong {
  color: var(--df-primary, var(--primary, #7c3aed));
}
.ep-item-summary-numbers {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  white-space: nowrap;
}
.ep-shop-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}
.ep-shop-type-badge {
  border-radius: 9999px !important;
  padding: 2px 10px !important;
  font-size: 0.75rem !important;
  line-height: 1.2;
  font-weight: 700;
}
.ep-shop-adjustment {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--fb-border, #e5e7eb);
}
.ep-shop-adjustment-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.ep-shop-slider-wrap {
  flex: 1 1 auto;
  min-width: 0;
}
.ep-shop-slider-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.ep-shop-slider-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--fb-muted, #475569);
}
.ep-shop-slider-value {
  min-width: 44px;
  text-align: right;
  font-size: 0.8125rem;
  font-weight: 750;
  color: #020617;
}
.ep-shop-slider {
  min-height: 22px;
}
.ep-shop-slider :deep([data-slot="slider-track"]) {
  height: 14px;
  background: #e7e7eb;
  border-radius: 9999px;
}
.ep-shop-slider :deep([data-slot="slider-range"]) {
  background: var(--df-primary, var(--primary, #3b82f6));
}
.ep-shop-slider :deep([data-slot="slider-thumb"]) {
  width: 18px;
  height: 18px;
  border-width: 2px;
  border-color: var(--df-primary, var(--primary, #3b82f6));
  background: var(--fb-surface, #ffffff);
  box-shadow: 0 1px 6px rgba(15, 23, 42, 0.2);
}
.ep-shop-reset-btn {
  width: 36px;
  min-width: 36px;
  height: 36px;
  padding: 0 !important;
  border-radius: 9999px !important;
  color: var(--fb-text, #0f172a);
}
.ep-shop-reset-btn:hover {
  background: #eef2ff !important;
  color: var(--df-primary, var(--primary, #3b82f6));
}
.ep-shop-chevron-btn {
  margin-top: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--fb-muted, #64748b);
  cursor: pointer;
  flex-shrink: 0;
}
.ep-shop-chevron-btn:hover {
  background: #eef2ff;
  color: var(--df-primary, var(--primary, #3b82f6));
}
.ep-item-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  width: 100%;
  border-radius: 8px;
  cursor: pointer;
  outline: none;
}
.ep-item-chevron-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: var(--muted-foreground, #64748b);
  cursor: pointer;
  flex-shrink: 0;
}
.ep-item-chevron-btn:hover {
  background: #eef2ff;
  color: var(--df-primary, var(--primary, #3b82f6));
}
@media (max-width: 760px) {
  .ep-shop-card-header {
    padding: 18px 16px !important;
  }
  .ep-shop-card-title-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .ep-shop-card-revenue {
    white-space: normal;
    flex-wrap: wrap;
  }
  .ep-shop-card-title {
    font-size: 1rem;
  }
  .ep-shop-chevron-btn {
    margin-top: 34px;
  }
  .ep-item-summary-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
/* Helpers (Tailwind est utilis\u00e9 inline pour le reste, cf. versionReact). */
.bg-card{
  margin-bottom:1em !important;

}

/* Shared F&B visual language. */
.ep-menus-empty {
  border-color: var(--fb-border, #E5E7EB);
  border-radius: var(--fb-radius-panel, 12px);
  color: var(--fb-muted, #6B7280);
}
.ep-map-badge--remapped,
.ep-remap-btn {
  color: #ff3131;
}
.ep-map-badge--remapped {
  background: var(--fb-primary-soft, #FFF5F5);
}
.ep-remap-btn {
  border-color: rgba(255, 49, 49, 0.35);
}
.ep-remap-btn:hover {
  background: var(--fb-primary-soft, #FFF5F5);
}
.ep-toolbar-search {
  border-color: var(--fb-border, #E5E7EB);
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-subtle, #FAFAFA);
}
.ep-toolbar-search:focus-within {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1);
}
.ep-toolbar-search-input {
  color: var(--fb-text, #212121);
}
.ep-shop-search {
  border-color: var(--fb-border, #E5E7EB);
  border-radius: var(--fb-radius-control, 8px);
  background: var(--fb-subtle, #FAFAFA);
}
.ep-shop-search:focus-within {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1);
}
.ep-shop-search-input {
  color: var(--fb-text, #212121);
}
.ep-shop-card {
  border-color: var(--fb-border, #E5E7EB) !important;
  border-radius: var(--fb-radius-card, 16px) !important;
  background: var(--fb-surface, #FFFFFF);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
}
.ep-shop-card-header {
  padding: 18px 20px !important;
  background: var(--fb-surface, #FFFFFF);
}
.ep-shop-card-header:hover {
  background: var(--fb-subtle, #FAFAFA);
}
.ep-shop-card-summary:focus-visible,
.ep-shop-chevron-btn:focus-visible,
.ep-item-summary-row:focus-visible,
.ep-item-chevron-btn:focus-visible {
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.18);
}
.ep-shop-card-title,
.ep-item-card-title {
  color: var(--fb-text, #212121);
  /* Échelle Space Menus / titre Timeline : 16px/700. Le titre item était un
     <h4> sans classe dédiée → taille héritée bootstrap (~22px). */
  font-size: 16px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.01em;
}
/* Les noms d'articles arrivent EN MAJUSCULES de l'import Weezevent (donnée,
   pas CSS). Affichage en sentence-case ("Burger + frites") sans toucher la
   donnée. Pas appliqué aux shops (codes légitimes type « 4 A B C »). */
.ep-item-card-title {
  text-transform: lowercase;
}
.ep-item-card-title::first-letter {
  text-transform: uppercase;
}
.ep-revenue-pill,
.ep-quantity-pill {
  border-color: var(--fb-border, #E5E7EB);
  background: var(--fb-subtle, #FAFAFA);
  color: var(--fb-muted, #6B7280);
  font-variant-numeric: tabular-nums;
}
.ep-revenue-pill strong,
.ep-quantity-pill strong,
.ep-shop-slider-value {
  color: var(--fb-text, #212121);
  font-variant-numeric: tabular-nums;
}
.ep-revenue-pill-adjusted,
.ep-quantity-pill-adjusted {
  border-color: rgba(255, 49, 49, 0.28);
  background: var(--fb-primary-soft, #FFF5F5);
}
.ep-revenue-pill-adjusted strong,
.ep-quantity-pill-adjusted strong {
  color: #ff3131;
}
.ep-shop-adjustment {
  border-color: var(--fb-border, #E5E7EB);
}
.ep-shop-slider :deep([data-slot="slider-range"]) {
  background: #ff3131;
}
.ep-shop-slider :deep([data-slot="slider-thumb"]) {
  border-color: #ff3131;
  background: var(--fb-surface, #FFFFFF);
}
.ep-shop-reset-btn,
.ep-shop-chevron-btn,
.ep-item-chevron-btn {
  border-radius: var(--fb-radius-control, 8px) !important;
}
.ep-shop-reset-btn:hover,
.ep-shop-chevron-btn:hover,
.ep-item-chevron-btn:hover {
  background: var(--fb-primary-soft, #FFF5F5) !important;
  color: #ff3131;
}

/* Badges et actions : reprise directe des pills Space Menus. */
.ep-shop-type-badge,
.ep-revenue-pill,
.ep-quantity-pill,
.ep-map-badge,
.ep-cost-alert-badge {
  border-radius: 999px !important;
}

.ep-shop-type-badge {
  min-height: 26px;
  padding: 5px 11px !important;
  border: 1.5px solid var(--fb-border, #E5E7EB);
  background: var(--fb-subtle, #FAFAFA) !important;
  color: var(--fb-muted, #6B7280) !important;
  transition: border-color .2s, background .2s, color .2s, transform .15s;
}

.ep-shop-type-badge:hover {
  border-color: rgba(255, 49, 49, .4);
  background: var(--fb-primary-soft, #FFF5F5) !important;
  color:  #ff3131 !important;
  transform: translateY(-1px);
}

.ep-revenue-pill,
.ep-quantity-pill {
  min-height: 28px;
  padding: 5px 11px;
  border-width: 1.5px;
}

.ep-revenue-pill-adjusted,
.ep-quantity-pill-adjusted {
  border-color: rgba(255, 49, 49, .35);
  background: var(--fb-primary-soft, #FFF5F5);
}

.ep-remap-btn {
  min-height: 26px;
  padding: 4px 10px;
  border: 1.5px solid rgba(255, 49, 49, .45);
  border-radius: 999px;
  background: transparent;
  color: #ff3131;
  transition: all .2s;
}

.ep-remap-btn:hover {
  border-color: #ff3131;
  background: #ff3131;
  color: #fff;
}

.ep-shop-reset-btn,
.ep-shop-chevron-btn,
.ep-item-chevron-btn {
  border-radius: 999px !important;
  transition: background .2s, color .2s, transform .15s;
}

.ep-shop-reset-btn:active,
.ep-shop-chevron-btn:active,
.ep-item-chevron-btn:active {
  transform: scale(.96);
}

/* Les lignes doivent rester lisibles dans colonne centrale réduite
   (rail calendrier + métriques visibles). */
.ep-menu-item-title {
  margin: 0;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.ep-menu-item-row {
  margin-bottom: 12px;
  padding: 12px !important;
  border-radius: var(--fb-radius-control, 8px) !important;
}

.ep-menu-item-row:last-child {
  margin-bottom: 0;
}

.ep-menu-item-head,
.ep-menu-item-controls,
.ep-menu-item-slider-row,
.ep-menu-item-stepper {
  min-width: 0;
}

@media (max-width: 900px) {
  .ep-toolbar-search {
    flex-basis: 100%;
    width: 100%;
    min-width: 0;
    max-width: none;
  }

  .ep-toolbar-tabs {
    max-width: 100%;
    overflow-x: auto;
  }

  .ep-menu-item-head {
    flex-wrap: wrap;
  }

  .ep-menu-item-quantity {
    width: 100%;
    justify-content: space-between;
  }

  .ep-menu-item-stepper {
    flex-wrap: wrap;
  }
}

@media (max-width: 620px) {
  .ep-menu-item-row {
    gap: 8px;
  }

  .ep-menu-item-slider-row {
    display: grid !important;
    grid-template-columns: minmax(0, 1fr) auto auto;
  }

  .ep-menu-item-slider-row > :deep(label) {
    grid-column: 1 / -1;
  }
}

/* ===================== DARK MODE — compléments =====================
   Surfaces/bordures/textes héritent des `--fb-*`/`--ep-*` de l'overlay parent
   (.event-predict-overlay) ; les accents map/remap/cost/add passent par
   `--destructive`/`--success`/`--primary` (définis + éclaircis côté overlay).
   Ne reste que la bordure bleu-gris pâle des pilules de quantité. */
.dark .ep-quantity-pill {
  border-color: var(--fb-border);
}
</style>
