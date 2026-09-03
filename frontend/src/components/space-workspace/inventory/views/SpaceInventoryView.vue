<template>
  <v-app class="si-app">
    <!-- Header type Analyse (propre <v-app>, pas de teleport → robuste). -->
    <WorkspaceAppHeader
      :space-name="spaceLabel"
      :kpis="overviewMetrics"
      show-home
    />
    <v-main>
      <div class="space-inventory-view">
    <!-- Header gris (titre « Space Inventory » + retour + actions mobiles +
         Print/Save) supprimé. Print/Save déplacés dans le bandeau rouge ; les
         drawers (couverture menu + filtres mobile) sont conservés ci-dessous. -->
    <InventoryMenuCoverageDrawer
        v-model="coverageDrawerOpen"
        :reports="menuCoverageReports"
      />

      <!-- Mobile uniquement : drawer de nav entre outils F&B, même pattern que
           Logistique (.si-mobile-tools-trigger dans le bandeau rouge). -->
      <WorkspaceMobileToolDrawer
        v-model="showMobileToolDrawer"
        :items="toolboxSelectItems"
        :current-value="isPreMode ? 'space-pre-inventory' : 'space-inventory'"
        :title="t('invToolsLabel')"
        @select="onToolboxSelect"
      />

      <InventoryFilterDrawer
        v-model="filterDrawerOpen"
        :active-tab="activeTab"
        :storage-options="storageOptions"
        :storage-floor-options="storageFloorOptions"
        :selected-storages="selectedStorages"
        :selected-storage-floors="selectedStorageFloors"
        :selected-event-id="selectedEventId"
        :search="search"
        :counting-status-tab="countingStatusTab"
        :event-options="eventOptions"
        :counting-tabs="COUNTING_TABS"
        :shop-options="shopOptions"
        :shop-type-options="shopTypeOptions"
        :shop-area-options="shopAreaOptions"
        :menu-item-options="menuItemOptions"
        :item-type-options="itemTypeOptions"
        :item-category-options="itemCategoryOptions"
        :selected-shops="selectedShops"
        :selected-shop-types="selectedShopTypes"
        :selected-shop-areas="selectedShopAreas"
        :selected-menu-items="selectedMenuItems"
        :selected-item-types="selectedItemTypes"
        :selected-item-categories="selectedItemCategories"
        :reconciliations="reconciliations"
        :selected-reconciliation-id="selectedReconciliationId"
        :reco-loading="recoLoading"
        @select-reconciliation="onDrawerSelectReconciliation"
        @delete-reconciliation="onDeleteReconciliation"
        @update:selected-event-id="selectedEventId = $event"
        @update:search="search = $event"
        @update:counting-status-tab="countingStatusTab = $event"
        @update:selected-shops="selectedShops = $event"
        @update:selected-shop-types="selectedShopTypes = $event"
        @update:selected-shop-areas="selectedShopAreas = $event"
        @update:selected-menu-items="selectedMenuItems = $event"
        @update:selected-item-types="selectedItemTypes = $event"
        @update:selected-item-categories="selectedItemCategories = $event"
        @update:selected-storages="selectedStorages = $event"
        @update:selected-storage-floors="selectedStorageFloors = $event"
        @reset="resetInventoryFilters"
      />




    <!-- Body: 3-col desktop (filtres gauche / cartes / résumé droite), stacked mobile -->
    <div class="si-body" :class="{ 'si-body-with-filters': showLeftFilters }">
      <!-- Colonne GAUCHE (pattern EventPredict .ep-side) : toolbox hors carte sur
           le fond gris, puis le panneau de filtres (carte blanche).
           Sur mobile → InventoryFilterDrawer. -->
      <div v-if="showLeftFilters" class="si-left-filters wsl-side">
        <!-- Navigation inter-écrans (WorkspaceToolSelect partagé). -->
        <WorkspaceToolSelect
          :model-value="isPreMode ? 'space-pre-inventory' : 'space-inventory'"
          :items="toolboxSelectItems"
          :label="t('invToolsLabel')"
          :aria-label="t('invToolboxNav')"
          class="wsl-toolbox"
          @update:model-value="onToolboxSelect"
        />

        <InventoryFilterPanel
        :mode="activeTab"
        :storage-options="storageOptions"
        :storage-floor-options="storageFloorOptions"
        :selected-storages="selectedStorages"
        :selected-storage-floors="selectedStorageFloors"
        :shop-options="shopOptions"
        :shop-type-options="shopTypeOptions"
        :shop-area-options="shopAreaOptions"
        :menu-item-options="menuItemOptions"
        :item-type-options="itemTypeOptions"
        :item-category-options="itemCategoryOptions"
        :selected-shops="selectedShops"
        :selected-shop-types="selectedShopTypes"
        :selected-shop-areas="selectedShopAreas"
        :selected-menu-items="selectedMenuItems"
        :selected-item-types="selectedItemTypes"
        :selected-item-categories="selectedItemCategories"
        @update:selected-shops="selectedShops = $event"
        @update:selected-shop-types="selectedShopTypes = $event"
        @update:selected-shop-areas="selectedShopAreas = $event"
        @update:selected-menu-items="selectedMenuItems = $event"
        @update:selected-item-types="selectedItemTypes = $event"
        @update:selected-item-categories="selectedItemCategories = $event"
        @update:selected-storages="selectedStorages = $event"
        @update:selected-storage-floors="selectedStorageFloors = $event"
        @reset="resetInventoryFilters"
        />

        <!-- Documents de réconciliation post-événement — sous les filtres. -->
        <InventoryReconciliationSection
          :items="reconciliations"
          :selected-id="selectedReconciliationId"
          :loading="recoLoading"
          @select="selectedReconciliationId = $event"
          @delete="onDeleteReconciliation"
        />
      </div>

      <div class="si-main">
         <!-- Bandeau rouge (style Space Menus) : onglets (gauche) + pills ouvert/fermé
         + sous-statuts comptage + recherche PdV (droite). -->
    <div class="si-segrow si-segrow--band">
      <!-- Toggle STANDARD du panneau de filtres gauche (composant partagé), desktop
           uniquement — cf. .si-mobile-tools-trigger ci-dessous pour le mobile
           (ouvre le drawer de nav outils au lieu du panneau de filtres). -->
      <WorkspacePanelToggle
        v-if="canToggleFilters"
        class="si-toggle--desktop"
        :open="!filtersCollapsed"
        :label="t('invToggleFilters')"
        @toggle="filtersCollapsed = !filtersCollapsed"
      />
      <!-- Mobile uniquement (< 900px) : drawer de nav entre outils F&B, même
           pattern que Logistique (WorkspaceMobileToolDrawer + toolboxSelectItems). -->
      <button
        type="button"
        class="si-mobile-tools-trigger"
        @click="showMobileToolDrawer = true"
        :aria-label="t('invToolsLabel')"
      >
        <v-icon size="20">mdi-menu</v-icon>
      </button>
      <!-- Titre du bandeau (parité Analyse / Réarmement / Logistique). -->
      <div class="si-band-title">
        <h1 class="si-band-title__main">{{ t(isPreMode ? 'preInvPageTitle' : 'invPageTitle') }}</h1>
        <!-- Vue réconciliation active → sous-titre « Réconciliation : {event} » (parité capture).
             Inchangé : le document nomme DÉJÀ son propre event, empiler un second
             nom ici recréerait la confusion qu'on corrige juste en dessous. -->
        <p v-if="activeReconciliation" class="si-band-title__sub">
          {{ t('invRecoSection') }} : {{ activeReconciliation.eventName || t('invRecoUnknownEvent') }}
        </p>
        <!-- Contexte évènement (lecture seule) : nom · date · pourquoi ce match ·
             espace. L'ancrage est automatique et silencieux (docs modules/10
             §12.4) — sans ce sous-titre, l'écran ne dit jamais quel match il
             affiche, ni pourquoi ce n'est pas celui du deep-link. -->
        <!-- BUG-352-01 : le nom court de la fiche (« PFC-Nice ») a été RETIRÉ —
             `contextAnchorLabel` nomme déjà le match par ses deux équipes
             (« Prochain Évènement : Paris FC vs OGC Nice »). Les deux côte à côte
             donnaient l'impression de DEUX événements empilés. `matchLabel`
             retombe sur le nom de la fiche quand les équipes ne sont pas
             renseignées : rien n'est perdu. La computed reste utilisée par
             l'en-tête d'impression. -->
        <p v-else-if="contextEvent" class="si-band-title__sub">
          <!-- Mobile : "{match} - {date} @ {showTime}" compact (retour utilisateur),
               le détail desktop (préfixe/espace/avertissement) ne tenait plus sur
               1 ligne. -->
          <template v-if="isMobile">{{ contextEventCompactLabel }}</template>
          <template v-else>
            <strong class="si-band-title__event">{{ contextAnchorLabel }}</strong>
            <span v-if="contextEventDateLabel"> · {{ contextEventDateLabel }}</span>
            <span v-if="spaceLabel"> · {{ spaceLabel }}</span>
            <span v-if="countsAreEventIndependent" class="si-band-title__warn">
              · {{ t('invContextCountsIndependent') }}
            </span>
          </template>
        </p>
        <p v-else-if="spaceLabel" class="si-band-title__sub">
          {{ spaceLabel }} · {{ t(isPreMode ? 'preInvNoUpcoming' : 'invContextNoPastEvent') }}
        </p>
      </div>

      <div class="si-band-right justify-content-end d-flex align-center">
        <!-- Onglets Boutiques/Stockages déplacés sous la recherche (parité
             Logistique). Sous-statuts À compter/Comptés → colonne droite. -->

        <!-- Print + Save (retirés de l'ancien header). Menu Print masqué sur
             mobile : Imprimer/Exporter CSV/Vérifier couverture existent déjà
             dans mobileActionsSheet (bouton ⋮) — évite le doublon qui forçait
             les actions du bandeau sur une 2e ligne. -->
        <div class="si-band-actions">
          <v-menu v-if="!isMobile" offset="6">
            <template #activator="{ props: menuProps }">
              <v-btn v-bind="menuProps" variant="outlined" class="si-band-btn">
                <v-icon size="16" class="mr-1">mdi-printer</v-icon>
                {{ t('invPrint') }}
                <v-icon size="16" class="ml-1">mdi-chevron-down</v-icon>
              </v-btn>
            </template>
            <v-list density="compact" min-width="220">
              <v-list-item @click="printInventory">
                <template #prepend><v-icon size="18">mdi-clipboard-list-outline</v-icon></template>
                <v-list-item-title>{{ t('invPrintInventory') }}</v-list-item-title>
              </v-list-item>
              <v-divider />
              <v-list-item @click="exportInventoryCsv">
                <template #prepend><v-icon size="18">mdi-file-delimited-outline</v-icon></template>
                <v-list-item-title>{{ t('invExportInventory') }}</v-list-item-title>
              </v-list-item>
              <v-divider />
              <!-- Couverture stock ↔ menus : entrée desktop du drawer (BUG-022). -->
              <v-list-item @click="coverageDrawerOpen = true">
                <template #prepend><v-icon size="18">mdi-clipboard-check-outline</v-icon></template>
                <v-list-item-title>{{ t('invVerifyCoverage') }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
          <!-- Options mobiles (outils/recherche/print/drawers) : le bouton qui
               ouvrait cette sheet a disparu avec l'ancien header gris (BUG-022). -->
          <v-btn
            v-if="isMobile"
            icon
            variant="text"
            class="si-band-btn"
            :aria-label="t('invOptionsTitle')"
            @click="mobileActionsSheet = true"
          >
            <v-icon size="20">mdi-dots-vertical</v-icon>
          </v-btn>
          <!-- Mobile uniquement : "Mettre à jour la Logistique" + "Générer la
               réconciliation" (Update Logistic / Save desktop ci-dessous) regroupés
               dans un menu compact déclenché par une icône, plutôt que 2 boutons
               pleine largeur — la réconciliation reste désactivée tant que le
               comptage n'est pas complet (isCountComplete). -->
          <v-menu v-if="isMobile" offset="6">
            <template #activator="{ props: menuProps }">
              <v-btn v-bind="menuProps" icon variant="text" class="si-band-btn" :aria-label="t('invSave')">
                <v-icon size="20">mdi-play-circle-outline</v-icon>
              </v-btn>
            </template>
            <v-list density="compact" min-width="240">
              <v-list-item v-if="selectedEventId" :disabled="pushingToLogistic" @click="onUpdateLogistic">
                <template #prepend><v-icon size="18">mdi-warehouse</v-icon></template>
                <v-list-item-title>{{ t('invUpdateLogistic') }}</v-list-item-title>
              </v-list-item>
              <v-list-item :disabled="!isCountComplete || saving || recoCreating" @click="onSaveAll">
                <template #prepend><v-icon size="18">mdi-content-save</v-icon></template>
                <v-list-item-title>
                  {{ t('invSave') }}
                  <span v-if="inventoryStats.totalItems" class="si-menu-item-progress">
                    {{ inventoryStats.countedItems }}/{{ inventoryStats.totalItems }}
                  </span>
                </v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
          <v-btn
            v-if="selectedEventId"
            variant="outlined"
            class="si-band-btn si-band-btn--desktop"
            :loading="pushingToLogistic"
            :disabled="pushingToLogistic"
            @click="onUpdateLogistic"
          >
            <v-icon size="16" class="mr-1">mdi-warehouse</v-icon>
            {{ t('invUpdateLogistic') }}
          </v-btn>
          <v-btn
            :loading="saving || recoCreating"
            :disabled="saving || recoCreating"
            class="si-band-btn si-band-btn--save si-band-btn--desktop"
            @click="onSaveAll"
          >
            <v-icon size="16" class="mr-1">mdi-content-save</v-icon>
            {{ t('invSave') }}
            <span
              v-if="inventoryStats.totalItems"
              class="si-save-progress"
              :class="{ 'si-save-progress-done': isCountComplete }"
            >
              {{ inventoryStats.countedItems }}/{{ inventoryStats.totalItems }}
            </span>
          </v-btn>
        </div>
      </div>
    </div>

    <!-- Contenu central NORMAL (recherche, onglets, cartes, comptage) — substitué
         par la vue réconciliation quand un document est sélectionné. -->
    <template v-if="!activeReconciliation">
    <!-- Post-event ouvert sur des saisies d'AVANT-match (BUG-237) : les valeurs
         sont une proposition, pas un comptage validé — le dire explicitement,
         sinon l'écran « 100 % compté » invite à sauvegarder sans recompter. -->
    <v-alert
      v-if="hasCarriedCounts"
      type="info"
      variant="tonal"
      density="compact"
      class="si-carried-alert"
    >
      {{ t('invPostCarriedHint') }}
    </v-alert>
    <!-- Attendus indisponibles : dire POURQUOI. Sans ce bandeau, 403, backend non
         à jour et absence de comptage de référence produisent tous les trois le
         même écran de tirets, indiagnosticable sans l'onglet Réseau.
         `no-permission` reste muet (ne pas révéler l'existence de la donnée). -->
    <v-alert
      v-if="expectedUnavailableText"
      type="info"
      variant="tonal"
      density="compact"
      class="si-carried-alert"
    >
      {{ expectedUnavailableText }}
    </v-alert>
    <!-- BUG-352-01 : la cartouche de provenance des attendus a été RETIRÉE. Elle
         s'affichait à CHAQUE chargement, pour tout profil autorisé — du bruit
         permanent au-dessus de la recherche. La phrase et l'heure de calcul
         vivent maintenant dans l'infobulle de chaque attendu (expectedDetailFor).
         Les cartouches ci-dessus restent : elles ne s'affichent qu'en ANOMALIE
         (403, serveur non à jour, comptage reporté du pre-event). -->
    <!-- Recherche PdV/articles — collée sous le bandeau rouge, même largeur. -->
    <div class="si-search-wrap">
      <AppSearchBar
        v-model="search"
        :placeholder="t('invSearchShopsItems')"
        :clear-label="t('invClear') || 'Clear'"
      />
    </div>

        <!-- Onglets Boutiques/Stockages sous la recherche (parité Logistique). -->
        <div class="si-subnav">
          <div class="si-tabs">
            <button
              v-for="tab in visibleTopTabs"
              :key="tab.value"
              type="button"
              class="si-tab"
              :class="{ 'si-tab-active': activeTab === tab.value }"
              @click="activeTab = tab.value"
            >
              <v-icon size="16" class="mr-1">{{ tab.icon }}</v-icon>
              {{ isMobile ? t(tab.labelKeyShort) : t(tab.labelKey) }}
              <span v-if="!isMobile" class="si-tab-count">({{ topTabCount(tab.value) }})</span>
            </button>
          </div>

          <!-- Tri + filtre Ouvert/Fermé (onglet Boutiques) — masqué sur mobile
               (< 900px, retour utilisateur : prenait trop de place, cf. maquette
               Post/Pre-Event Inventory mobile). -->
          <div v-if="!isMobile" class="si-sort-bar">
            <span class="si-sort-label">{{ t('invSort') }}</span>
            <button
              type="button"
              class="si-sort-chip"
              :class="{ 'si-sort-chip-active': sortMode === 'name' }"
              @click="sortMode = 'name'"
            >{{ t('invSortName') }}</button>
            <button
              type="button"
              class="si-sort-chip"
              :class="{ 'si-sort-chip-active': sortMode === 'to-count' }"
              @click="sortMode = 'to-count'"
            >{{ t('invSortToCount') }}</button>
            <button
              type="button"
              class="si-sort-chip"
              :class="{ 'si-sort-chip-active': sortMode === 'stock-asc' }"
              @click="sortMode = 'stock-asc'"
            >{{ t('invSortStockAsc') }}</button>

            <!-- Ouvert/Fermé n'est proposé que si les deux camps existent : sur cet
                 écran `isOpen` vaut « a des articles assignés » (backend :
                 menuItemsCount > 0) et les cartes n'existent que pour des PdV avec
                 articles — une chip qui ne peut que vider la liste se lit comme un
                 filtre cassé. Sémantique à trancher : QUESTIONS_A_BERTRAND #44. -->
            <template v-if="activeTab === 'shops' && showShopStatusPills">
              <span class="si-sort-sep" />
              <button
                type="button"
                class="si-sort-chip"
                :class="{ 'si-sort-chip-active': shopStatusFilter === 'open' }"
                @click="toggleShopStatus('open')"
              >{{ t('invShopOpen') }} <span class="si-sort-chip-count">{{ openShopsCount }}</span></button>
              <button
                type="button"
                class="si-sort-chip"
                :class="{ 'si-sort-chip-active': shopStatusFilter === 'closed' }"
                @click="toggleShopStatus('closed')"
              >{{ t('invShopClosed') }} <span class="si-sort-chip-count">{{ closedShopsCount }}</span></button>
            </template>
          </div>
        </div>

        <!-- Counting interface inline desktop -->
        <InventoryCountingInterface
          v-if="countingShop && !isMobile"
          :shop="countingShop"
          :shops="countingSiblings"
          :counted="countedInElement(countingShop)"
          :total="countingShop.consolidatedInventory.length"
          :progress="progressForElement(countingShop)"
          :get-count="getCount"
          :total-for-item="totalForItem"
          :is-item-counted="isItemCounted"
          :expected-total-for="canSeePredicted ? expectedTotalFor : null"
          :expected-total-label-key="expectedTotalLabelKey"
          :logistic-stock-for="canSeeExpected ? logisticStockFor : null"
          :can-transfer="!demo"
          @close="countingShop = null"
          @change-shop="startCount"
          @change-value="onCountValue"
          @mark-counted="markCounted"
          @transfer="openTransfer"
        />

        <!-- List view -->
        <template v-else>
          <template v-if="loading || contextLoading">
            <div class="si-skeleton" :aria-label="t('invLoadingAria')">
              <article v-for="n in 6" :key="n" class="si-skeleton-card">
                <div class="si-skeleton-head">
                  <span class="si-skeleton-dot" />
                  <div class="si-skeleton-copy">
                    <span class="si-skeleton-line si-skeleton-line-title" />
                    <span class="si-skeleton-line si-skeleton-line-short" />
                  </div>
                  <span class="si-skeleton-pill" />
                </div>
                <div class="si-skeleton-bars">
                  <span class="si-skeleton-line" />
                  <span class="si-skeleton-line" />
                  <span class="si-skeleton-line si-skeleton-line-mid" />
                </div>
              </article>
            </div>
          </template>

          <template v-else-if="filteredCards.length === 0">
            <div class="si-empty">
              <!-- Pas de contexte Event Predict (?event absent/invalide). -->
              <template v-if="noEventContext && isPreMode">
                <v-icon size="48" color="grey">mdi-calendar-blank-outline</v-icon>
                <h3>{{ t('preInvPageTitle') }}</h3>
                <p>{{ t('preInvNoUpcoming') }}</p>
              </template>
              <template v-else-if="noEventContext">
                <v-icon size="48" color="grey">mdi-lightning-bolt-outline</v-icon>
                <h3>{{ t('invOpenFromEventPredictTitle') }}</h3>
                <p>{{ t('invOpenFromEventPredict') }}</p>
              </template>
              <!-- Échec de chargement de l'assignation (≠ assignation vide). -->
              <template v-else-if="contextError">
                <v-icon size="48" color="warning">mdi-alert-outline</v-icon>
                <h3>{{ t('invAssignmentLoadError') }}</h3>
                <v-btn color="warning" variant="flat" size="small" :loading="loading" @click="retryAssignment">
                  <v-icon size="15" class="mr-1">mdi-refresh</v-icon>
                  {{ t('invAssignmentRetry') }}
                </v-btn>
              </template>
              <!-- Configuration sans PdV ouvert / sans article assigné. -->
              <template v-else-if="spaceHasNoInventory">
                <v-icon size="48" color="grey">mdi-package-variant</v-icon>
                <h3>{{ t('invEmptyConfigTitle') }}</h3>
                <p>{{ t('invEmptyConfigHint') }}</p>
                <v-btn color="warning" variant="flat" size="small" @click="activateDemo">
                  <v-icon size="15" class="mr-1">mdi-flask-outline</v-icon>
                  {{ t('invUseDemo') }}
                </v-btn>
              </template>
              <!-- Vide à cause d'un filtre / recherche -->
              <template v-else>
                <v-icon size="48" color="grey">mdi-package-variant</v-icon>
                <h3>{{ t('invNothingTitle') }}</h3>
                <p>{{ emptyMessage }}</p>
                <v-btn
                  v-if="hasActiveFilters"
                  variant="tonal"
                  color="primary"
                  size="small"
                  @click="resetInventoryFilters"
                >
                  <v-icon size="15" class="mr-1">mdi-filter-remove</v-icon>
                  {{ t('invResetFilters') }}
                </v-btn>
              </template>
            </div>
          </template>

          <template v-else>
            <!-- Chargement partiel de l'assignation (certains PdV en échec). -->
            <v-alert
              v-if="contextWarning"
              type="warning"
              variant="tonal"
              density="compact"
              class="mb-3"
            >
              {{ t('invAssignmentPartialWarning') }}
            </v-alert>
            <!-- PdV ouverts présents mais AUCUN article assigné : bandeau honnête. -->
            <v-alert
              v-if="activeTab === 'shops' && configHasShopsWithoutItems"
              type="info"
              variant="tonal"
              density="compact"
              class="mb-3"
            >
              {{ t('invEmptyConfigHint') }}
            </v-alert>
            <!-- Liste verticale (toutes tailles) : PdV empilés, onglet Stockages inclus.
                 Mobile = même stack que desktop (plus de carousel une-carte-à-la-fois). -->
            <div class="si-grid">
              <template v-if="activeTab === 'shops'">
                <InventoryShopCard
                  v-for="entry in filteredCards"
                  :key="entry.element.id"
                  :entry="entry"
                  :shown-items="filteredItemsForCard(entry).length"
                  :total-items="totalItemsForCard(entry)"
                  :counted-items="countedInShop(entry)"
                  :progress="progressForCard(entry)"
                  :status-label="statusLabel(entry)"
                  :status-color="statusColor(entry)"
                  @start-count="startCount"
                />
              </template>
              <template v-else>
                <InventoryStorageCard
                  v-for="entry in filteredCards"
                  :key="entry.element.id"
                  :entry="entry"
                  :counted-items="countedInElement(entry)"
                  :progress="progressForElement(entry)"
                  :status-label="storageStatusLabel(entry)"
                  @start-count="startCount"
                />
              </template>
            </div>
          </template>
        </template>
    </template>
    <!-- Vue réconciliation : remplace tout le contenu central. -->
    <InventoryReconciliationView
      v-else
      :reconciliation="activeReconciliation"
      :units-per-item-id="unitsPerItemIdMap"
      :cost-by-item-id="menuItemCostMapForReco"
      @close="selectedReconciliationId = null"
    />
      </div>

      <!-- Colonne DROITE : sous-statuts de comptage (segmented) AU-DESSUS du
           résumé inventaire, puis la carte agrégat. -->
      <div v-if="activeTab === 'shops' || activeTab === 'storage'" class="si-aggregate-col wsl-side">
        <!-- À compter / Comptés — segmented, filtrent la liste. -->
        <div class="si-substatus si-substatus--side">
          <button
            v-for="s in COUNTING_TABS"
            :key="s.value"
            type="button"
            class="si-substatus-btn"
            :class="{ 'si-substatus-btn-active': countingStatusTab === s.value }"
            @click="countingStatusTab = s.value"
          >
            {{ countingTabLabel(s.value) }}
            <span class="si-substatus-count">{{ subTabCount(s.value) }}</span>
          </button>
          <v-tooltip location="bottom" max-width="300">
            <template #activator="{ props: tipProps }">
              <v-icon v-bind="tipProps" size="16" class="si-substatus-help">
                mdi-help-circle-outline
              </v-icon>
            </template>
            <span>{{ t('invCountedTooltip') }}</span>
          </v-tooltip>
        </div>

        <aside class="si-aggregate">
        <InventoryAggregateView
          v-if="activeTab === 'shops'"
          :inventory-counts="inventoryCounts"
          :shops-with-inventory="realShops"
          :past-events="pastEvents"
          :focus-shop-id="countingShop ? countingShop.element.id : null"
          @start-count-shop="countingShop = $event"
        />
        <InventoryStorageAggregateView
          v-else
          :inventory-counts="inventoryCounts"
          :storages-with-inventory="realStorages"
          :focus-storage-id="countingShop ? countingShop.element.id : null"
          @start-count-storage="startCount"
        />
        </aside>
      </div>

      <!-- Bottom sheet d'activation du mode démo -->
      <v-bottom-sheet v-model="demoSheet" inset>
        <v-card class="si-demo-sheet">
          <v-card-title class="d-flex align-center ga-2">
            <v-icon color="warning">mdi-flask-outline</v-icon>
            {{ t('invDemoSheetTitle') }}
          </v-card-title>
          <v-card-text>
            <p class="mb-3">{{ t('invDemoSheetBody') }}</p>
            <v-chip v-if="demo" color="success" size="small" variant="tonal">
              <v-icon start size="16">mdi-check</v-icon> {{ t('invDemoActiveChip') }}
            </v-chip>
            <v-chip v-else color="grey" size="small" variant="tonal">
              <v-icon start size="16">mdi-server-network</v-icon> {{ t('invRealModeChip') }}
            </v-chip>
          </v-card-text>
          <v-card-actions class="flex-column flex-sm-row align-stretch ga-2">
            <v-spacer class="d-none d-sm-flex" />
            <v-btn variant="text" :block="$vuetify.display.xs" @click="demoSheet = false">{{ t('invClose') }}</v-btn>
            <v-btn :color="demo ? 'error' : 'warning'" variant="flat" :block="$vuetify.display.xs" @click="toggleDemo">
              {{ demo ? t('invExitDemo') : t('invEnableDemo') }}
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-bottom-sheet>

      <v-bottom-sheet v-model="mobileActionsSheet" inset>
        <v-card class="si-mobile-actions-sheet">
          <v-card-title class="d-flex align-center ga-2">
            <v-icon color="primary">mdi-cog-outline</v-icon>
            {{ t('invOptionsTitle') }}
          </v-card-title>
          <v-card-text class="si-mobile-actions-content">
            <div class="si-mobile-sheet-block">
              <span class="si-mobile-sheet-label">{{ t('invToolsLabel') }}</span>
              <WorkspaceToolSelect
                :model-value="isPreMode ? 'space-pre-inventory' : 'space-inventory'"
                :items="toolboxSelectItems"
                :aria-label="t('invToolboxNav')"
                @update:model-value="mobileActionsSheet = false; onToolboxSelect($event)"
              />
            </div>

            <v-text-field
              v-model="search"
              density="compact"
              variant="outlined"
              hide-details
              clearable
              prepend-inner-icon="mdi-magnify"
              :placeholder="t('invSearchShopsItems')"
              class="si-search-field"
            />

            <div class="si-mobile-sheet-actions">
              <!-- Déclencheurs des drawers (BUG-022) : perdus à la suppression de
                   l'ancien header gris — réintroduits ici, seul point d'entrée mobile. -->
              <v-btn variant="outlined" @click="mobileActionsSheet = false; filterDrawerOpen = true">
                <v-icon size="16" class="mr-1">mdi-filter-variant</v-icon>
                {{ t('invFiltersBtn') }}
              </v-btn>
              <v-btn variant="outlined" @click="mobileActionsSheet = false; coverageDrawerOpen = true">
                <v-icon size="16" class="mr-1">mdi-clipboard-check-outline</v-icon>
                {{ t('invVerifyCoverage') }}
              </v-btn>
              <v-btn variant="outlined" @click="mobileActionsSheet = false; printInventory()">
                <v-icon size="16" class="mr-1">mdi-clipboard-list-outline</v-icon>
                {{ t('invPrintInventory') }}
              </v-btn>
              <v-btn variant="outlined" @click="mobileActionsSheet = false; exportInventoryCsv()">
                <v-icon size="16" class="mr-1">mdi-file-delimited-outline</v-icon>
                {{ t('invExportInventory') }}
              </v-btn>
            </div>
          </v-card-text>
          <v-card-actions>
            <v-spacer />
            <v-btn variant="text" @click="mobileActionsSheet = false">{{ t('invClose') }}</v-btn>
          </v-card-actions>
        </v-card>
      </v-bottom-sheet>

      <v-dialog
        v-model="mobileCountingOpen"
        fullscreen
        class="si-mobile-count-dialog"
        :scrim="false"
        transition="dialog-bottom-transition"
      >
        <InventoryCountingInterface
          v-if="countingShop"
          :shop="countingShop"
          :shops="countingSiblings"
          mobile
          :counted="countedInElement(countingShop)"
          :total="countingShop.consolidatedInventory.length"
          :progress="progressForElement(countingShop)"
          :get-count="getCount"
          :total-for-item="totalForItem"
          :is-item-counted="isItemCounted"
          :expected-total-for="canSeePredicted ? expectedTotalFor : null"
          :expected-total-label-key="expectedTotalLabelKey"
          :logistic-stock-for="canSeeExpected ? logisticStockFor : null"
          :can-transfer="!demo"
          @close="closeMobileCounting"
          @change-shop="startCount"
          @change-value="onCountValue"
          @mark-counted="markCounted"
          @transfer="openTransfer"
        />
      </v-dialog>

      <!-- Transfert Logistic depuis le comptage — drawer réutilisé tel quel
           (présentationnel), mode remove forcé : un transfert s'émet en
           Suppression (BUG-259-02), le receveur confirme côté Logistic. -->
      <LogisticMovementDialog
        v-model="movementDialog"
        mode="remove"
        :item="movementItem"
        :units-per-pack="movementUnitsPerPack"
        :element="movementElement"
        :shops="movementShops"
        :storages="movementStorages"
        :current-stock="movementCurrentStock"
        :market-prices="movementMarketPrices"
        :market-prices-loading="movementMarketPricesLoading"
        :saving="movementSaving"
        :error="movementError"
        @submit="submitTransfer"
      />
    </div>

    <!-- Toast : tous les articles d'un PDV / stockage comptés -->
    <v-snackbar v-model="snackbar" :timeout="3000" color="success" location="bottom right">
      <v-icon class="mr-2">mdi-check-circle</v-icon>{{ snackbarText }}
    </v-snackbar>

    <!-- Section imprimable : cachée à l'écran, visible uniquement via window.print() -->
    <section class="si-print">
      <div class="si-print-head">
        <h1>{{ t('invPrintInvTitle') }}</h1>
        <div class="si-print-sub">
          <strong>{{ spaceLabel }}</strong>
          <!-- Event d'ANCRAGE et non `selectedEventOption` : eventOptions ne liste
               que les events PASSÉS → en mode pre l'en-tête d'impression était muet. -->
          <span v-if="contextEventName"> · {{ contextEventName }}</span>
          <span v-if="contextEventDateLabel"> · {{ contextEventDateLabel }}</span>
          <span v-if="printDate"> · {{ printDate }}</span>
        </div>
      </div>

      <template v-if="printMode === 'inventory'">
        <div v-for="shop in realShops" :key="shop.element.id" class="si-print-block">
          <h2>{{ shop.element.name }}</h2>
          <table class="si-print-table">
            <thead>
              <tr><th>{{ t('invColItem') }}</th><th>{{ t('invColPacked') }}</th><th>{{ t('invColLoose') }}</th><th>{{ t('invCountTotal') }}</th></tr>
            </thead>
            <tbody>
              <tr v-for="it in shop.consolidatedInventory" :key="it.id">
                <td>{{ it.name }}</td>
                <td>{{ getCount(shop.element.id, it.id).packedUnits || 0 }}</td>
                <td>{{ formatUnits(getCount(shop.element.id, it.id).looseUnits || 0) }}</td>
                <td>{{ formatUnits(totalForItem(shop.element.id, it)) }} {{ it.unit || '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

    </section>
      </div>
    </v-main>

    <!-- Erreurs de synchronisation inventaire (upsert / save). -->
    <v-snackbar v-model="errorSnackbar" color="error" :timeout="5000" location="bottom">
      {{ errorText }}
      <template #actions>
        <v-btn variant="text" @click="errorSnackbar = false">{{ t('close') || 'Fermer' }}</v-btn>
      </template>
    </v-snackbar>
    <v-snackbar v-model="successSnackbar" color="success" :timeout="4000" location="bottom">
      {{ successText }}
      <template #actions>
        <v-btn variant="text" @click="successSnackbar = false">{{ t('close') || 'Fermer' }}</v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<script>
import { ref } from 'vue'
import { useStore } from 'vuex'
import { useRouter, useRoute } from 'vue-router'
import { useI18n } from '@/i18n/useI18n'
import { COUNTING_STATUS, COUNTING_TABS as RAW_TABS, emptyInventoryCount } from '@/types/inventoryCount'
import { useInventoryData } from '@/composables/useInventoryData'
import { formatUnits } from '@/composables/useFormatters'
import { buildSpaceInventoryMock, buildInventoryCountsMock } from '@/data/spaceInventoryMock'
import * as localDb from '@/data/localDb'
import { confirmDialog } from '@/composables/useConfirmDialog'
import { isDemoMode, enableDemoMode, disableDemoMode } from '@/utils/demoMode'
import InventoryAggregateView from '@/components/space-workspace/inventory/InventoryAggregateView.vue'
import InventoryCountingInterface from '@/components/space-workspace/inventory/InventoryCountingInterface.vue'
import LogisticMovementDialog from '@/components/space-workspace/shared/LogisticMovementDialog.vue'
import InventoryShopCard from '@/components/space-workspace/inventory/InventoryShopCard.vue'
import InventoryStorageCard from '@/components/space-workspace/inventory/InventoryStorageCard.vue'
import InventoryStorageAggregateView from '@/components/space-workspace/inventory/InventoryStorageAggregateView.vue'
import InventoryFilterDrawer from '@/components/space-workspace/inventory/drawers/InventoryFilterDrawer.vue'
import InventoryFilterPanel from '@/components/InventoryFilterPanel.vue'
import WorkspaceAppHeader from '@/components/WorkspaceAppHeader.vue'
import WorkspaceToolSelect from '@/components/WorkspaceToolSelect.vue'
import InventoryMenuCoverageDrawer from '@/components/space-workspace/inventory/drawers/InventoryMenuCoverageDrawer.vue'
import AppSearchBar from '@/components/common/AppSearchBar.vue'
import WorkspacePanelToggle from '@/components/WorkspacePanelToggle.vue'
import WorkspaceMobileToolDrawer from '@/components/WorkspaceMobileToolDrawer.vue'
import { buildCoverageReports, totalCoverageIssues } from '@/utils/inventoryCoverage'
import { getAllSpaces, getSpaceEventTimelineBatch } from '@/api/endpoints/space.api'
// Réconciliation post-événement (docs/modules/10_POST_EVENT_INVENTORY.md §7)
import InventoryReconciliationSection from '@/components/space-workspace/inventory/InventoryReconciliationSection.vue'
import InventoryReconciliationView from '@/components/space-workspace/inventory/InventoryReconciliationView.vue'
import {
  createPostEventReconciliation,
  listInventoryReconciliations,
  deleteInventoryReconciliation,
  getPreEventInventory,
  getPreEventBaseline,
  getPostEventBaseline,
  createPreEventReconciliation,
  getEventSalesConsumption,
  pushInventoryCountToLogistic,
} from '@/api/endpoints/inventory.api'
import { buildPreEventExpected, expectedKey, flattenExpectedUnits } from '@/utils/preEventExpected'
import { loadPredictedNeed, lookupPredictedNeed, buildRestockNeedIndex } from '@/composables/usePredictedNeed'
import { listRestockPlans, getRestockPlan } from '@/api/endpoints/restock.api'
import { compareInventoryCards } from '@/utils/inventoryCardSort'
import {
  reconciliationKey,
  buildPostEventReconciliationLines,
  buildSoldUnitsFromConsumption,
} from '@/utils/postEventReconciliation'
import { preprocessTimelineRecords } from '@/utils/timelineBucketing'
import { normalizeStr } from '@/utils/predictiveAnalytics'
// Contexte évènement du bandeau (nom + date + règle d'ancrage).
import { describeAnchorEvent, matchLabel } from '@/utils/inventoryEventContext'
import { parseEventDate } from '@/utils/dateFr'
import { useNumberFormat } from '@/composables/useNumberFormat'

const TOP_TABS = [
  { value: 'shops',   labelKey: 'invTabShops',   labelKeyShort: 'invTabShopsShort',   icon: 'mdi-store' },
  { value: 'storage', labelKey: 'invTabStorage', labelKeyShort: 'invTabStorageShort', icon: 'mdi-warehouse' },
  { value: 'merch',   labelKey: 'invTabMerch',   labelKeyShort: 'invTabMerchShort',   icon: 'mdi-shopping' },
]

const COUNTING_TABS = RAW_TABS
const COUNTING_TAB_KEYS = {
  'to-count': 'invStatusToCount',
  counted: 'invStatusCounted',
}

const TOOLBOX_ITEMS = [
  { value: 'analyse', labelKey: 'invToolAnalyse', icon: 'mdi-chart-line', permission: 'front.fb.analyse' },
  { value: 'predict', labelKey: 'invToolPredict', icon: 'mdi-trending-up', permission: 'front.fb.predict' },
  { value: 'event-predict', labelKey: 'invToolEventPredict', icon: 'mdi-lightning-bolt', permission: 'front.fb.eventPredict' },
  { value: 'live', labelKey: 'invToolLive', icon: 'mdi-record-circle-outline', permission: 'front.fb.live' },
  { value: 'space-pre-inventory', labelKey: 'invToolPreInventory', icon: 'mdi-clipboard-arrow-up-outline', permission: 'front.fb.spaceInventory' },
  { value: 'space-inventory', labelKey: 'invToolInventory', icon: 'mdi-package-variant', permission: 'front.fb.spaceInventory' },
  { value: 'logistic',        labelKey: 'invToolLogistic',     icon: 'mdi-forklift' },
  { value: 'restock', labelKey: 'invToolRestock', icon: 'mdi-truck-delivery-outline', permission: ['front.fb.restock', 'front.fb.restockBoard'] },
]

export default {
  name: 'SpaceInventoryView',
  components: {
    InventoryAggregateView,
    InventoryCountingInterface,
    LogisticMovementDialog,
    InventoryShopCard,
    InventoryStorageCard,
    InventoryStorageAggregateView,
    InventoryFilterDrawer,
    InventoryFilterPanel,
    WorkspaceAppHeader,
    WorkspaceToolSelect,
    InventoryMenuCoverageDrawer,
    AppSearchBar,
    WorkspacePanelToggle,
    WorkspaceMobileToolDrawer,
    InventoryReconciliationSection,
    InventoryReconciliationView,
  },
  setup() {
    const store = useStore()
    const router = useRouter()
    const route = useRoute()
    const { t } = useI18n()
    // Locale de l'app pour la date du bandeau (jamais 'fr-FR' en dur, BUG-240).
    const { intlLocale } = useNumberFormat()
    // Inventaire = config de l'event ouvert dans Event Predict (?event=). Le
    // composable est PROPRIÉTAIRE UNIQUE : la vue n'appelle que loadContext/
    // resetContext et lit les refs.
    const selectedConfigId = ref(null)
    const {
      loadContext,
      resetContext,
      shopsWithInventory,
      storagesWithInventory,
      merchWithInventory,
      contextLoading,
      contextError,
      contextWarning,
    } = useInventoryData(selectedConfigId)
    return {
      t,
      intlLocale,
      store,
      router,
      route,
      selectedConfigId,
      loadContext,
      resetContext,
      shopsWithInventory,
      storagesWithInventory,
      merchWithInventory,
      contextLoading,
      contextError,
      contextWarning,
    }
  },
  data() {
    return {
      activeTab: 'shops',
      // Toast affiché quand tous les articles d'un PDV / stockage sont comptés.
      snackbar: false,
      snackbarText: '',
      // Transfert Logistic depuis le comptage — drawer LogisticMovementDialog
      // (présentationnel, mode remove forcé : un transfert s'émet en Suppression
      // depuis BUG-259-02) ; la vue réplique openMovement/submitMovement de
      // SpaceLogisticView. Le stock Logistic n'est chargé qu'au premier clic.
      movementDialog: false,
      movementElement: null,
      movementItem: null,
      movementMarketPrices: [],
      movementMarketPricesLoading: false,
      movementSaving: false,
      movementError: null,
      logisticsStockLoaded: false,
      demoSheet: false,
      countingStatusTab: 'to-count',
      // Filtre ouvert/fermé du bandeau (onglet Boutiques) : 'all' | 'open' | 'closed'.
      shopStatusFilter: 'all',
      // Tri des cartes (colonne centre) : 'name' | 'to-count' | 'stock-asc'.
      sortMode: 'name',
      // Index courant du carousel boutiques (mobile).
      selectedEventId: null,
      // Event d'ANCRAGE de l'écran, résolu par resolveEventContext. DISTINCT de
      // `selectedEventId`, qui est la clé de comptage : le drawer mobile peut la
      // mettre à null (« Indépendant d'un évènement », InventoryFilterDrawer:28)
      // sans que le match affiché par la page change. On ne garde que l'id :
      // `events` peut arriver après le montage, le computed se répare seul.
      contextEventId: null,
      search: '',
      countingShop: null,
      mobileCountingOpen: false,
      mobileActionsSheet: false,
      filterDrawerOpen: false,
      coverageDrawerOpen: false,
      selectedShops: [],
      selectedShopTypes: [],
      selectedShopAreas: [],
      // Nouveaux groupes (panneau gauche style Analyse) : articles du menu + type/catégorie.
      selectedMenuItems: [],
      selectedItemTypes: [],
      selectedItemCategories: [],
      // Facettes de l'onglet Stockages (mode storage du panneau gauche).
      selectedStorages: [],
      selectedStorageFloors: [],
      isMobile: false,
      // Drawer nav outils F&B, mobile uniquement (cf. .si-mobile-tools-trigger).
      showMobileToolDrawer: false,
      // Repli du panneau de filtres gauche via l'icône du bandeau rouge.
      filtersCollapsed: false,
      // Réconciliation post-événement : documents du space (kind='post-event'),
      // sélection courante (remplace le contenu central), états réseau.
      reconciliations: [],
      recoLoading: false,
      recoCreating: false,
      selectedReconciliationId: null,
      // Pre-event Inventory : quantités attendues sous Packed/Loose (null = pas
      // encore chargé OU permission absente) — map `expectedKey(el,item)` →
      // {packed, loose}. Source : état Logistic au chargement (décision JLH
      // 2026-08-20 — l'attendu d'inventaire = le chiffre de l'écran Logistic).
      preExpected: null,
      preExpectedLoading: false,
      // Instant de calcul des attendus (`asOf` serveur) : un mouvement Logistic
      // postérieur n'y est pas reflété — l'infobulle doit pouvoir le dire.
      expectedAsOf: null,
      // Post-event Inventory : indice de référence affiché à côté du TOTAL de
      // chaque article — map `expectedKey(el,item)` → unités. État Logistic :
      // ventes déjà déduites, clamp ≥ 0 (même chiffre que l'écran Logistic).
      postExpectedUnits: null,
      // Pre-event Inventory : besoin prédit Event Predict (version par défaut du
      // match), index {byItemId, byItemName} — affiché en regard du TOTAL.
      predictedNeed: null,
      predictedNeedMissing: false,
      // Pourquoi il n'y a pas d'attendu, quand il n'y en a pas :
      // null | 'no-permission' | 'forbidden' | 'not-deployed'.
      // Sans ça, 403 / 404 / bug produisent le MÊME écran muet de tirets — c'est
      // ce qui a rendu le défaut d'origine indiagnosticable. (« no-baseline » a
      // disparu avec la source état-Logistic : l'attendu existe toujours.)
      expectedUnavailable: null,
      loading: false,
      availableSpaces: [],
      spacesLoading: false,
      spacesLoaded: false,
      spacesSearch: '',
      printMode: null,
      printDate: '',
      errorSnackbar: false,
      errorText: '',
      successSnackbar: false,
      successText: '',
      pushingToLogistic: false,
      mock: { shopsWithInventory: [], storagesWithInventory: [], merchWithInventory: [] },
      COUNTING_TABS,
      TOP_TABS,
      TOOLBOX_ITEMS,
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
    currentSpaceId() { return this.route?.params?.spaceId || this.currentSpace?.id || null },
    // #9 — Merch/FNB : l'onglet « Merch externe » n'apparaît que si l'espace a
    // explicitement le module Merch activé (space.hasMerch). Masqué par défaut
    // pour garder l'interface FNB cloisonnée.
    showMerchModule() {
      const s = this.currentSpace
      return !!(s && (s.hasMerch || s.merchEnabled || s.modules?.merch))
    },
    visibleTopTabs() {
      return TOP_TABS.filter((tab) => tab.value !== 'merch' || this.showMerchModule)
    },
    // Compteurs ouvert/fermé du bandeau (calque Space Menus : ouvert = isOpen !== false).
    // Croisés avec l'onglet À compter/Comptés courant → le badge reflète EXACTEMENT
    // ce que la liste affichera (sinon « Fermé 10 » mais liste vide, cf. intersection).
    openShopsCount() {
      return (this.realShops || []).filter(
        (c) => c?.element?.isOpen !== false && this.statusFor(c) === this.countingStatusTab,
      ).length
    },
    closedShopsCount() {
      return (this.realShops || []).filter(
        (c) => c?.element?.isOpen === false && this.statusFor(c) === this.countingStatusTab,
      ).length
    },
    /** Les deux camps existent-ils ? Sinon la paire de pills est masquée (l'un des
     *  deux ne pourrait que vider la liste, l'autre ne rien changer). */
    showShopStatusPills() {
      return this.openShopsCount > 0 && this.closedShopsCount > 0
    },
    filteredSpaces() {
      const q = (this.spacesSearch || '').toLowerCase().trim()
      if (!q) return this.availableSpaces
      return this.availableSpaces.filter((s) =>
        String(s.name || s.spaceName || s.id).toLowerCase().includes(q),
      )
    },
    fromMock() { return !!this.store.state.analyse?.fromMock },
    /** Configurations de l'espace. */
    configurations() { return this.store.state.analyse?.configurations || [] },
    /** Nom lecture seule de la config active (dérivée de l'event ?event=). */
    activeConfigName() {
      const c = this.configurations.find((x) => String(x.id) === String(this.selectedConfigId))
      return c?.name || c?.title || (this.selectedConfigId ? String(this.selectedConfigId) : null)
    },
    /** Clé de contexte route : recharge sur changement d'espace OU d'event. */
    routeContextKey() {
      const cfg = this.route?.query?.configuration || this.route?.query?.config || ''
      return `${this.route?.params?.spaceId || ''}::${this.route?.query?.event || ''}::${cfg}`
    },
    saving() { return !!this.store.state.inventory?.saving },
    inventoryError() { return this.store.state.inventory?.error || null },
    spaceLabel() { return this.currentSpace?.name || this.route?.params?.spaceId || null },
    events() { return this.store.state.analyse?.events || [] },
    // ── Contexte évènement du bandeau ────────────────────────────────────────
    // L'écran s'ancre tout seul sur un match (règle owner « un match = un
    // eventId, aucune bascule silencieuse », docs modules/10 §12.4) sans jamais
    // dire lequel : un deep-link ?event=<futur> en mode post atterrit sur le
    // dernier match passé, en silence. Ces computeds rendent l'ancrage visible.
    /** Event d'ancrage résolu, objet complet (null tant que le store est vide). */
    contextEvent() {
      if (!this.contextEventId) return null
      return (this.events || []).find((e) => String(e.id) === String(this.contextEventId)) || null
    },
    contextEventName() {
      return describeAnchorEvent(this.contextEvent)?.name || null
    },
    contextEventDateLabel() {
      // parseEventDate tolère ISO et DD/MM/YYYY ; le formatage suit la locale de
      // l'app (formatDateMedium coderait 'fr-FR' en dur — écart fermé par BUG-240).
      const d = parseEventDate(describeAnchorEvent(this.contextEvent)?.dateISO)
      if (!d) return ''
      return d.toLocaleDateString(this.intlLocale, { day: '2-digit', month: 'short', year: 'numeric' })
    },
    /** Pourquoi CE match (retours JLH 13/08) : les deux modes nomment leur
     *  match d'ancrage, composé des équipes quand elles sont connues —
     *  pre : « Prochain Évènement : {match} » (match à venir),
     *  post : « Post Inventaire de l'évènement : {match} » (dernier terminé). */
    contextAnchorLabel() {
      const match = matchLabel(this.contextEvent)
      return this.t(this.isPreMode ? 'preInvContextAnchorNext' : 'invContextAnchorLast')
        .replace('{match}', match)
    },
    /** Sous-titre event compact, mobile uniquement : "{match} - {date} @
     *  {showTime}" (retour utilisateur) — sans le préfixe "Prochain
     *  Évènement :"/nom d'espace/avertissement du sous-titre desktop, qui ne
     *  tenaient plus sur une ligne. showTime déjà normalisé racine sur chaque
     *  event par SET_EVENTS (store/modules/analyse.js). */
    contextEventCompactLabel() {
      if (!this.contextEvent) return ''
      let label = matchLabel(this.contextEvent)
      if (this.contextEventDateLabel) label += ` - ${this.contextEventDateLabel}`
      if (this.contextEvent.showTime) label += ` @ ${this.contextEvent.showTime}`
      return label
    },
    /** Le filtre de comptage a été mis sur « Indépendant d'un évènement » : les
     *  saisies ne partent PAS sur le match affiché — à signaler explicitement. */
    countsAreEventIndependent() {
      return !!this.contextEventId && !this.selectedEventId
    },
    pastEvents() {
      const now = Date.now()
      return (this.events || [])
        .filter((e) => {
          const d = new Date(e.eventDate || e.date)
          return !Number.isNaN(d.getTime()) && d.getTime() <= now
        })
        .sort((a, b) => new Date(a.eventDate || a.date) - new Date(b.eventDate || b.date))
    },
    inventoryCounts() { return this.store.state.inventory?.inventoryCounts || {} },
    demo() { return isDemoMode() },
    /** Données réelles uniquement (API). Plus de fallback mock : si vide,
     *  l'empty-state s'affiche au lieu de données factices. */
    realShops() {
      return this.shopsWithInventory || []
    },
    realStorages() {
      return this.storagesWithInventory || []
    },
    realMerch() {
      return this.merchWithInventory || []
    },
    /** Document de réconciliation sélectionné (vue centrale substituée) — null = comptage normal. */
    activeReconciliation() {
      if (!this.selectedReconciliationId) return null
      return this.reconciliations.find((r) => r.id === this.selectedReconciliationId) || null
    },
    /** Mode de l'écran : 'pre' (Pre-event Inventory, event FUTUR) | 'post' (défaut).
     *  Porté par la meta de route — même composant, 2 routes (docs modules/10 §8). */
    inventoryMode() {
      return this.route?.meta?.inventoryMode === 'pre' ? 'pre' : 'post'
    },
    isPreMode() {
      return this.inventoryMode === 'pre'
    },
    /** Mode post ouvert sur des lignes reprises du comptage d'avant-match
     *  (drapeau serveur `carriedFromPreEvent`, BUG-237) → bandeau « à recompter ». */
    hasCarriedCounts() {
      if (this.isPreMode) return false
      for (const byItem of Object.values(this.inventoryCounts || {})) {
        for (const c of Object.values(byItem || {})) {
          if (c?.carriedFromPreEvent) return true
        }
      }
      return false
    },
    /** Quantités attendues (les DEUX écrans) : permission dédiée, gating serveur
     *  en miroir — sans elle, les endpoints baseline répondent 403 et on n'émet
     *  même pas l'appel. */
    canSeeExpected() {
      const can = this.store.getters['auth/can']
      return typeof can === 'function' ? can('front.fb.preInventoryExpected') : false
    },
    /** Chip « Besoin prédit » (pre ET post-event depuis le 2026-08-27) :
     *  permission DÉDIÉE, distincte des attendus — réunion Bertrand
     *  2026-08-19, réservé aux administrateurs et directeurs de site (le Chef
     *  exécutif garde preInventoryExpected mais pas celle-ci). Gating
     *  d'affichage : la donnée vient d'Event Predict (ou du réarmement), dont
     *  l'endpoint reste gaté par front.fb.eventPredict. */
    canSeePredicted() {
      const can = this.store.getters['auth/can']
      return typeof can === 'function' ? can('front.fb.preInventoryPredicted') : false
    },
    /** Libellé de l'indice affiché à côté du Total : « Besoin prédit », MÊME
     *  mot pre ET post depuis le 2026-08-27 (avant cette date, le post
     *  affichait « Attendu » sous ce même créneau — réunion Bertrand
     *  2026-08-19, ex-« Doit rester » — remplacé par le besoin prédit unifié
     *  avec Logistic ; l'« Attendu » stock reste visible via les hints
     *  packed/loose, cf. `expectedForField`). */
    expectedTotalLabelKey() {
      return 'invPredictedNeedHint'
    },
    /**
     * Badge « Attendu » de section, mode PRE : total en unités par article
     * depuis le blob serveur (post-event précédent + Logistique — réunion
     * Bertrand 2026-08-19, remplace le plan Stockup sauvegardé du retour JLH
     * 13/08). Repli de conversion avec la taille de paquet de l'ÉCRAN
     * (unitsPerItemIdMap) quand le serveur n'a pas résolu de conditionnement —
     * cf. flattenExpectedUnits.
     */
    preExpectedUnits() {
      return flattenExpectedUnits(this.preExpected, { unitsPerItemId: this.unitsPerItemIdMap })
    },
    /**
     * Mode POST : re-découpage packed/loose de l'indice serveur (`expectedUnits`,
     * ventes déjà déduites) dans la taille de paquet de l'écran — les hints sous
     * les champs Packed/Loose (réunion Bertrand 2026-08-19 : « Expected manquant
     * en post-event »). `trunc`, pas `floor` : l'indice n'est pas clampé
     * (négatif = incohérence de sources, décision 2026-07-30) et floor(-3/24)
     * fabriquerait « −1 pack + 21 ». Les totaux négatifs sont exclus ici : le
     * signal est déjà porté, en rouge, par le chip du total — deux hints
     * négatifs sous des champs de saisie se liraient comme un bug d'affichage.
     */
    postExpectedFields() {
      if (!this.postExpectedUnits) return null
      const round2 = (n) => Math.round(n * 100) / 100
      const out = {}
      for (const [key, units] of Object.entries(this.postExpectedUnits)) {
        if (!(units >= 0)) continue
        const itemId = key.split('|')[1] ?? ''
        const q = Number(this.unitsPerItemIdMap?.[itemId]) > 0 ? Number(this.unitsPerItemIdMap[itemId]) : 1
        const packed = Math.trunc(units / q)
        out[key] = { packed, loose: round2(units - packed * q) }
      }
      return out
    },
    /** Provenance des attendus, rendue dans l'INFOBULLE de chaque attendu depuis
     *  BUG-352-01 (avant : une cartouche permanente en haut de page). PDF v3 du
     *  2026-08-21 : l'attendu = le Total Logistic, toujours — le registre étant
     *  recalé depuis le comptage à chaque réconciliation, il porte le dernier
     *  comptage physique. `''` si aucun attendu n'est affiché. */
    expectedSourceText() {
      if (!this.canSeeExpected) return ''
      const loaded = this.isPreMode ? this.preExpected : this.postExpectedUnits
      if (!loaded) return ''
      const text = this.t('invExpectedSource')
      return this.expectedAsOfLabel ? `${text} (${this.expectedAsOfLabel})` : text
    },
    /** Heure de calcul des attendus (`asOf` serveur) — ce qui manquait pour
     *  savoir si un mouvement Logistic postérieur y est déjà reflété. */
    expectedAsOfLabel() {
      if (!this.expectedAsOf) return ''
      const d = new Date(this.expectedAsOf)
      if (Number.isNaN(d.getTime())) return ''
      return d.toLocaleTimeString(this.intlLocale, { hour: '2-digit', minute: '2-digit' })
    },
    /** Message d'indisponibilité des attendus — `no-permission` reste MUET :
     *  un utilisateur non habilité ne doit pas apprendre que la donnée existe.
     *  (Le cas « no-baseline » a disparu : l'attendu = état Logistic, il existe
     *  toujours — décision JLH 2026-08-20.) */
    expectedUnavailableText() {
      if (this.expectedUnavailable === 'no-permission') return ''
      switch (this.expectedUnavailable) {
        case 'forbidden': return this.t('invExpectedForbidden')
        case 'not-deployed': return this.t('invExpectedNotDeployed')
        default:
          // Attendus OK mais aucun scénario de référence : le besoin prédit à côté
          // du total reste vide tant qu'aucune version n'est marquée par défaut.
          return this.predictedNeedMissing ? this.t('invPredictNoDefaultVersion') : ''
      }
    },
    /** Candidats du drawer transfert, enrichis du stock Logistic de la denrée en
     *  cours — miroir de shopElements/storageElementsList de SpaceLogisticView.
     *  PDV : uniquement ceux qui suivent déjà la denrée (sinon le stock envoyé
     *  devient invisible côté receveur). Storage : pas de filtre. */
    movementShops() {
      const itemName = this.movementItem?.name
      return (this.store.getters['logistics/shopElements'] || [])
        .filter((e) => !itemName || (e.items || []).some((it) => it.name === itemName))
        .map((e) => this.movementCandidate(e, itemName))
    },
    movementStorages() {
      const itemName = this.movementItem?.name
      return (this.store.getters['logistics/storageElements'] || [])
        .map((e) => this.movementCandidate(e, itemName))
    },
    /** Stock Logistic de la denrée sur l'élément courant — plafond des suppressions. */
    movementCurrentStock() {
      if (!this.movementElement || !this.movementItem) return { packed: 0, loose: 0 }
      const exp = this.store.getters['logistics/expectedFor'](this.movementElement.id, this.movementItem.name)
      return exp ? { packed: exp.packed, loose: exp.loose } : { packed: 0, loose: 0 }
    },
    movementUnitsPerPack() {
      if (!this.movementElement || !this.movementItem) return null
      const level = this.store.getters['logistics/levelFor'](this.movementElement.id, this.movementItem.name)
      return level?.unitsPerPack || this.movementItem.unitsPerPack || null
    },
    /** itemId → inventoryQuantityPackaged (référentiel affiché) — la vue réco
     *  pre-event convertit ses lignes packed/loose en unités avec cette map. */
    unitsPerItemIdMap() {
      const out = {}
      const entries = [...(this.realShops || []), ...(this.realStorages || []), ...(this.realMerch || [])]
      for (const entry of entries) {
        const items = entry.consolidatedInventory || entry.storageInventory || entry.merchInventory || []
        for (const it of items) {
          if (it?.id != null) out[String(it.id)] = Number(it.inventoryQuantityPackaged || 1)
        }
      }
      return out
    },
    /** itemId → coût unitaire (map partagée du store analyse) → Écart €. */
    menuItemCostMapForReco() {
      return this.store.state.analyse?.menuItemCostMap || {}
    },
    /** Vérification stocks ↔ menu items, par shop (cf. utils/inventoryCoverage). */
    menuCoverageReports() {
      return buildCoverageReports(this.realShops, this.inventoryCounts)
    },
    menuCoverageIssueCount() {
      return totalCoverageIssues(this.menuCoverageReports)
    },
    /** Liste de navigation prev/next dans l'interface de comptage : siblings du
     *  même onglet, normalisés (consolidatedInventory) pour que shops ET storages
     *  passent par la même interface sans la dénaturer. */
    countingSiblings() {
      if (!this.countingShop) return []
      const list =
        this.activeTab === 'storage' ? this.realStorages
          : this.activeTab === 'merch' ? this.realMerch
            : this.realShops
      return list.map((e) => this.normalizeCountingEntry(e))
    },
    eventOptions() {
      const today = Date.now()
      const past = this.events
        .filter((e) => {
          const d = new Date(e.date || e.eventDate)
          return !Number.isNaN(d.getTime()) && d.getTime() <= today
        })
        .sort((a, b) => {
          const da = new Date(a.date || a.eventDate).getTime()
          const db = new Date(b.date || b.eventDate).getTime()
          return db - da
        })
      const opts = past.map((e) => ({
        value: e.id,
        label: `${e.name || e.eventName} — ${e.date || e.eventDate || ''}`,
      }))
      return [{ value: null, label: this.t('invEventIndependent') }, ...opts]
    },
    selectedEventOption() {
      const ev = this.eventOptions.find((o) => o.value === this.selectedEventId)
      return ev?.value ? ev : null
    },
    activeCards() {
      if (this.activeTab === 'shops') return this.realShops
      if (this.activeTab === 'storage') return this.realStorages
      return this.realMerch
    },
    /** Facettes de filtrage (parité React SpaceInventory:1033-1399) — niveau boutique. */
    shopOptions() {
      return (this.realShops || []).map((c) => ({
        value: c.element.id,
        title: c.element.name,
      }))
    },
    shopTypeOptions() {
      const set = new Set()
      ;(this.realShops || []).forEach((c) => {
        const t = c.element?.shopType
        if (Array.isArray(t)) t.forEach((x) => x && set.add(x))
        else if (t) set.add(t)
      })
      return [...set].sort().map((t) => ({ value: t, title: t }))
    },
    shopAreaOptions() {
      const set = new Set()
      ;(this.realShops || []).forEach((c) => {
        const a = c.element?.shopArea
        if (a) set.add(a)
      })
      return [...set].sort().map((a) => ({ value: a, title: a }))
    },
    /** Facettes de l'onglet Stockages (mode storage du panneau gauche). */
    storageOptions() {
      return (this.realStorages || []).map((c) => ({
        value: c.element.id,
        title: c.element.displayName || c.element.name,
      }))
    },
    storageFloorOptions() {
      const set = new Set()
      ;(this.realStorages || []).forEach((c) => {
        if (c.element?.floorName) set.add(c.element.floorName)
      })
      return [...set].sort().map((f) => ({ value: f, title: f }))
    },
    /** Cartes source des facettes articles : suit l'onglet actif (shops ↔ storages). */
    facetSourceCards() {
      return this.activeTab === 'storage' ? this.realStorages : this.realShops
    },
    /** Catalogue menuItems du store analyse, indexé par id ET par nom.
     *  Sert de pont entre les items d'inventaire (consolidatedInventory[].usedIn)
     *  et leur type / catégorie (champs absents de l'item d'inventaire lui-même). */
    menuItemMeta() {
      const list = this.store.state.analyse?.menuItems || []
      const byId = new Map()
      const byName = new Map()
      list.forEach((mi) => {
        const meta = { name: mi.name, type: mi.type || '', category: mi.category || '' }
        if (mi.id != null) byId.set(String(mi.id), meta)
        if (mi.name) byName.set(String(mi.name).toLowerCase(), meta)
      })
      return { byId, byName }
    },
    /** Résout les menu items "parents" d'un item d'inventaire via usedIn (fallback : l'item lui-même). */
    menuItemsForInventoryItem() {
      const { byId, byName } = this.menuItemMeta
      return (item) => {
        const used = Array.isArray(item?.usedIn) ? item.usedIn : []
        const metas = []
        if (used.length) {
          used.forEach((u) => {
            // Items shop : usedIn porte id/name ; items storage (buildStorageInventory) :
            // usedIn porte menuItemId/menuItemName — on probe les deux formes.
            const m =
              (u?.id != null && byId.get(String(u.id))) ||
              (u?.menuItemId != null && byId.get(String(u.menuItemId))) ||
              (u?.name && byName.get(String(u.name).toLowerCase())) ||
              (u?.menuItemName && byName.get(String(u.menuItemName).toLowerCase())) ||
              null
            metas.push(m || { name: u?.name || u?.menuItemName || '', type: '', category: '' })
          })
        } else {
          // Item vendable direct (pas de composants) : on le traite comme son propre menu item.
          const m =
            (item?.id != null && byId.get(String(item.id))) ||
            (item?.name && byName.get(String(item.name).toLowerCase())) ||
            null
          metas.push(m || { name: item?.name || '', type: '', category: '' })
        }
        return metas
      }
    },
    /** Articles présents dans l'inventaire de l'onglet actif (dédupliqués). */
    menuItemOptions() {
      const set = new Set()
      ;(this.facetSourceCards || []).forEach((c) => {
        this.elementItems(c).forEach((it) => {
          this.menuItemsForInventoryItem(it).forEach((m) => {
            if (m.name) set.add(m.name)
          })
        })
      })
      return [...set].sort().map((n) => ({ value: n, title: n }))
    },
    /** Types d'articles (Food / Beverage / …) dérivés des menu items parents. */
    itemTypeOptions() {
      const set = new Set()
      ;(this.facetSourceCards || []).forEach((c) => {
        this.elementItems(c).forEach((it) => {
          this.menuItemsForInventoryItem(it).forEach((m) => {
            if (m.type) set.add(m.type)
          })
        })
      })
      return [...set].sort().map((v) => ({ value: v, title: v }))
    },
    /** Catégories d'articles (Beer / Main / Soft Drink / …) dérivées des menu items parents. */
    itemCategoryOptions() {
      const set = new Set()
      ;(this.facetSourceCards || []).forEach((c) => {
        this.elementItems(c).forEach((it) => {
          this.menuItemsForInventoryItem(it).forEach((m) => {
            if (m.category) set.add(m.category)
          })
        })
      })
      return [...set].sort().map((v) => ({ value: v, title: v }))
    },
    /** Contexte où le panneau de filtres gauche est pertinent (desktop, onglets
     *  Boutiques/Stockages) → conditionne l'affichage de l'icône de bascule. */
    canToggleFilters() {
      return (this.activeTab === 'shops' || this.activeTab === 'storage') && !this.isMobile
    },
    /** Panneau de filtres GAUCHE : pertinent ET non replié par l'utilisateur. */
    showLeftFilters() {
      return this.canToggleFilters && !this.filtersCollapsed
    },
    /** Au moins un filtre actif (recherche, statut ≠ défaut, ou facette) → propose le reset. */
    hasActiveFilters() {
      return !!(
        this.search ||
        this.countingStatusTab !== 'to-count' ||
        this.selectedShops.length ||
        this.selectedShopTypes.length ||
        this.selectedShopAreas.length ||
        this.selectedMenuItems.length ||
        this.selectedItemTypes.length ||
        this.selectedItemCategories.length ||
        this.selectedStorages.length ||
        this.selectedStorageFloors.length
      )
    },
    /** Un item d'inventaire matche-t-il les filtres articles / type / catégorie actifs ? */
    itemMatchesMenuFilters() {
      const names = this.selectedMenuItems
      const types = this.selectedItemTypes
      const cats = this.selectedItemCategories
      if (!names.length && !types.length && !cats.length) return () => true
      return (item) => {
        const metas = this.menuItemsForInventoryItem(item)
        const nameOk = !names.length || metas.some((m) => names.includes(m.name))
        const typeOk = !types.length || metas.some((m) => m.type && types.includes(m.type))
        const catOk = !cats.length || metas.some((m) => m.category && cats.includes(m.category))
        return nameOk && typeOk && catOk
      }
    },
    filteredCards() {
      let cards = this.activeCards
      const q = (this.search || '').trim().toLowerCase()
      if (q) {
        cards = cards.filter((c) => {
          if (c.element.name.toLowerCase().includes(q)) return true
          const items = c.consolidatedInventory || c.storageInventory || c.merchInventory || []
          return items.some((it) => it.name.toLowerCase().includes(q))
        })
      }
      if (this.activeTab === 'shops') {
        // Filtres avancés boutique (boutiques / types / zones)
        if (this.selectedShops.length) {
          cards = cards.filter((c) => this.selectedShops.includes(c.element.id))
        }
        if (this.selectedShopTypes.length) {
          cards = cards.filter((c) => {
            const t = c.element?.shopType
            const arr = Array.isArray(t) ? t : t ? [t] : []
            return arr.some((x) => this.selectedShopTypes.includes(x))
          })
        }
        if (this.selectedShopAreas.length) {
          cards = cards.filter((c) => this.selectedShopAreas.includes(c.element?.shopArea))
        }
        // Articles du menu + type/catégorie : la boutique est gardée si AU MOINS un
        // de ses articles d'inventaire matche les filtres actifs.
        if (this.selectedMenuItems.length || this.selectedItemTypes.length || this.selectedItemCategories.length) {
          const matchItem = this.itemMatchesMenuFilters
          cards = cards.filter((c) => (c.consolidatedInventory || []).some(matchItem))
        }
        // Pills bandeau : ouvert / fermé (isOpen !== false = ouvert). Ignorées
        // quand elles sont masquées, sinon un filtre invisible resterait actif.
        if (!this.showShopStatusPills) {
          // rien : la paire n'est pas proposée à l'utilisateur
        } else if (this.shopStatusFilter === 'open') {
          cards = cards.filter((c) => c.element?.isOpen !== false)
        } else if (this.shopStatusFilter === 'closed') {
          cards = cards.filter((c) => c.element?.isOpen === false)
        }
        cards = cards.filter((c) => this.statusFor(c) === this.countingStatusTab)
      } else if (this.activeTab === 'storage') {
        // Facettes storage (stockages / étages / articles) puis statut.
        if (this.selectedStorages.length) {
          cards = cards.filter((c) => this.selectedStorages.includes(c.element.id))
        }
        if (this.selectedStorageFloors.length) {
          cards = cards.filter((c) => this.selectedStorageFloors.includes(c.element?.floorName))
        }
        if (this.selectedMenuItems.length || this.selectedItemTypes.length || this.selectedItemCategories.length) {
          const matchItem = this.itemMatchesMenuFilters
          cards = cards.filter((c) => this.elementItems(c).some(matchItem))
        }
        cards = cards.filter((c) => this.storageStatusFor(c) === this.countingStatusTab)
      } else {
        // Merch : filtrage par statut (parité React storagesToCount/storagesCounted)
        cards = cards.filter((c) => this.storageStatusFor(c) === this.countingStatusTab)
      }
      // Tri : cartes vides (0 item) toujours en bas ; au-dessus, l'ordre suit le
      // tri choisi (nom / à compter d'abord / stock croissant), départagé par nom.
      // « Stock croissant » se base sur l'indice de référence de l'écran (besoin
      // prédit avant match, stock restant après) et retombe sur le compté quand il
      // n'y en a pas — l'ancienne clé lisait deux champs inexistants et laissait
      // toutes les cartes à 0.
      const accessors = {
        expectedUnitsFor: (elementId, item) => this.expectedTotalFor(elementId, item),
        countedUnitsFor: (elementId, item) => this.totalForItem(elementId, item),
        isItemCounted: this.isItemCounted,
      }
      const mode = this.sortMode
      cards = [...cards].sort((a, b) => compareInventoryCards(a, b, { mode, ...accessors }))
      return cards
    },
    inventoryStats() {
      // La complétude intègre désormais le Storage (réserve centrale) et le Merch
      // en plus des shops F&B : compter le Storage fait partie du flux avant la
      // sauvegarde finale. Le Save reste soft-confirm (ne bloque jamais).
      const shops = this.realShops || []
      const storages = this.realStorages || []
      const merch = this.realMerch || []
      const totalShops = shops.length
      const totalStorages = storages.length
      const shopTotal = shops.reduce((sum, shop) => sum + (shop.consolidatedInventory || []).length, 0)
      const shopCounted = shops.reduce((sum, shop) => sum + this.countedInShop(shop), 0)
      const storageTotal = storages.reduce((sum, st) => sum + this.elementItems(st).length, 0)
      const storageCounted = storages.reduce((sum, st) => sum + this.countedInElement(st), 0)
      const merchTotal = merch.reduce((sum, m) => sum + this.elementItems(m).length, 0)
      const merchCounted = merch.reduce((sum, m) => sum + this.countedInElement(m), 0)
      return {
        totalShops,
        totalStorages,
        totalItems: shopTotal + storageTotal + merchTotal,
        countedItems: shopCounted + storageCounted + merchCounted,
      }
    },
    isCountComplete() {
      const { totalItems, countedItems } = this.inventoryStats
      return totalItems > 0 && countedItems >= totalItems
    },
    /** Articles (par nom) qui resteront inchangés dans Logistic si on pousse maintenant —
     *  "Update Logistic" ne touche jamais un PDV/article non compté (décision Bertrand,
     *  2026-08-26 : ne jamais écraser un stock non vérifié par un 0). Affiché dans la
     *  confirmation du bouton pour que l'utilisateur sache AVANT de confirmer ce qui ne
     *  bougera pas. */
    uncountedItemsSummary() {
      const entries = [...(this.realShops || []), ...(this.realStorages || []), ...(this.realMerch || [])]
      const byName = new Map()
      for (const entry of entries) {
        if (!entry?.element) continue
        for (const item of this.elementItems(entry)) {
          const stat = byName.get(item.name) || { counted: 0, total: 0 }
          stat.total += 1
          if (this.isItemCounted(entry.element.id, item.id)) stat.counted += 1
          byName.set(item.name, stat)
        }
      }
      return [...byName.entries()]
        .filter(([, s]) => s.counted < s.total)
        .map(([name, s]) => ({ name, counted: s.counted, total: s.total }))
        .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    },
    overviewMetrics() {
      return [
        {
          label: this.t('invMetricShops'),
          value: this.inventoryStats.totalShops,
          icon: 'mdi-store',
          color: 'primary',
        },
        {
          label: this.t('invMetricStorages'),
          value: this.inventoryStats.totalStorages,
          icon: 'mdi-warehouse',
          color: 'grey',
        },
        {
          label: this.t('invMetricItems'),
          value: this.inventoryStats.totalItems,
          icon: 'mdi-package-variant',
          color: 'grey',
        },
        {
          label: this.t('invMetricCounted'),
          value: `${this.inventoryStats.countedItems}/${this.inventoryStats.totalItems}`,
          icon: 'mdi-checkbox-marked-circle-outline',
          color: 'success',
        },
      ]
    },
    countingProgressPercent() {
      if (!this.countingShop) return 0
      return this.progressForCard(this.countingShop)
    },
    emptyMessage() {
      return this.search ? this.t('invNoSearchResult') : this.t('invNoItemsInFilter')
    },
    /** Aucun contexte Event Predict (?event absent/invalide) → invite dédiée. */
    noEventContext() {
      return !this.demo && !this.selectedConfigId
    },
    /** Vrai si la configuration sélectionnée n'a AUCUN PdV ouvert, hors démo. */
    spaceHasNoInventory() {
      if (this.demo) return false
      const none = (arr) => !arr || arr.length === 0
      return none(this.shopsWithInventory) && none(this.storagesWithInventory) && none(this.merchWithInventory)
    },
    /** PdV ouverts présents mais aucun article assigné nulle part → bandeau. */
    configHasShopsWithoutItems() {
      const shops = this.shopsWithInventory || []
      return shops.length > 0 && shops.every((s) => !(s.availableMenuItems || []).length)
    },
  },
  methods: {
    formatUnits,
    toggleDemo() {
      if (this.demo) disableDemoMode()
      else enableDemoMode()
    },
    /** Active la démo depuis l'état vide (espace non mappé). */
    activateDemo() {
      if (!this.demo) enableDemoMode()
    },
    /** Libellé i18n d'un sous-onglet de statut (to-count / counted). */
    countingTabLabel(value) {
      return this.t(COUNTING_TAB_KEYS[value] || '')
    },
    // Pills ouvert/fermé : re-cliquer la pill active la désactive (retour 'all').
    toggleShopStatus(status) {
      this.shopStatusFilter = this.shopStatusFilter === status ? 'all' : status
    },
    async loadSpaces() {
      if (this.spacesLoaded || this.spacesLoading) return
      this.spacesLoading = true
      try {
        const data = await getAllSpaces()
        this.availableSpaces = Array.isArray(data) ? data : (data?.spaces || [])
        this.spacesLoaded = true
      } catch (e) {
        console.warn('[SpaceInventory] loadSpaces failed:', e?.message)
        this.availableSpaces = []
      } finally {
        this.spacesLoading = false
      }
    },
    switchSpace(space) {
      const id = space?.id ?? space?.spaceId
      if (!id || String(id) === String(this.currentSpaceId)) return
      this.router.push({ name: 'space-inventory', params: { spaceId: id } })
    },
    /** Impression de l'inventaire courant (window.print → Enregistrer en PDF). */
    printInventory() {
      this.printMode = 'inventory'
      this.printDate = new Date().toLocaleDateString('fr-FR')
      this.$nextTick(() => window.print())
    },
    // #3 — export CSV de l'inventaire pour vérifier la complétude et le
    // conditionnement (PdV, article, unité, qté/paquet, comptage).
    exportInventoryCsv() {
      const headers = ['PdV', 'Article', 'Unité', 'Qté/paquet', 'Type', 'Catégorie', 'Emballées', 'Vrac', 'Total', 'Compté']
      const rows = []
      ;(this.realShops || []).forEach((shop) => {
        ;(shop.consolidatedInventory || []).forEach((it) => {
          const c = this.getCount(shop.element.id, it.id)
          rows.push([
            shop.element.name,
            it.name,
            it.unit || '',
            it.inventoryQuantityPackaged || 1,
            it.menuItemType || it.type || '',
            it.menuItemCategory || it.category || '',
            c.packedUnits || 0,
            c.looseUnits || 0,
            this.totalForItem(shop.element.id, it),
            c.isCounted ? 'oui' : 'non',
          ])
        })
      })
      const all = [headers, ...rows]
      const csv = all
        .map((cols) => cols.map((col) => `"${String(col ?? '').replace(/"/g, '""')}"`).join(';'))
        .join('\n')
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inventaire-${this.currentSpaceId || 'space'}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
    /** Résout l'event du ?event= et sa configuration. Retourne { event, configId }
     *  ou null si aucun event exploitable dans l'espace. */
    resolveEventContext() {
      // Config préférée = celle passée dans l'URL (?configuration= depuis EventPredict,
      // ?config= depuis Analyse) : elle reflète un changement live pas encore persisté
      // au store event. Repli sur ev.configurationId. L'URL ne gagne que si valide.
      const urlCfg = this.route?.query?.configuration || this.route?.query?.config || null
      const inConfigs = (id) => id && this.configurations.some((c) => String(c.id) === String(id))
      const resolveCfg = (e) =>
        (inConfigs(urlCfg) && urlCfg) || (inConfigs(e?.configurationId) && e?.configurationId) || null
      const evId = this.route?.query?.event || this.route?.query?.eventId || null
      let ev = evId
        ? (this.events || []).find((e) => String(e.id) === String(evId))
        : null
      // Event trouvé mais config non résoluble (event sans configurationId et
      // pas de ?configuration= valide) : plutôt que le cul-de-sac « Aucun
      // évènement sélectionné », retomber sur l'ancrage par défaut ci-dessous.
      if (ev && !resolveCfg(ev)) ev = null
      // ── Ancrage STRICT « un match = un eventId » (décision owner 2026-07-24,
      // décision détaillée docs modules/10 §12.4) : plus aucune bascule silencieuse de match.
      // - Mode PRE : l'écran affiche TOUJOURS le prochain événement futur — tout
      //   ?event= est ignoré (même un futur lointain), le prochain strict est
      //   recalculé ci-dessous.
      // - Mode POST : l'écran est lié au dernier événement FINI — un ?event=
      //   FUTUR (deep-link Event Predict) est ignoré → repli dernier passé ;
      //   un ?event= passé explicite reste respecté (réconcilier un vieux match
      //   est un choix délibéré, pas une bascule silencieuse).
      if (ev && this.isPreMode) ev = null
      if (ev && !this.isPreMode) {
        const t = new Date(ev.eventDate || ev.date).getTime()
        if (Number.isNaN(t) || t > Date.now()) ev = null
      }
      // Ancrage par défaut (entrée directe ou ?event= rejeté ci-dessus). L'URL
      // est synchronisée (replace, pas de watcher route ici → pas de re-run)
      // pour rester partageable.
      if (!ev) {
        const okCfg = (e) => inConfigs(urlCfg) || inConfigs(e?.configurationId)
        const now = Date.now()
        const dated = (this.events || [])
          .map((e) => ({ e, t: new Date(e.eventDate || e.date).getTime() }))
          .filter((x) => !Number.isNaN(x.t) && okCfg(x.e))
        const future = dated.filter((x) => x.t > now).sort((a, b) => a.t - b.t)
        const past = dated.filter((x) => x.t <= now).sort((a, b) => b.t - a.t)
        // PRE : prochain futur STRICT (aucun repli passé — sans event à venir,
        // état vide preInvNoUpcoming). POST : dernier passé STRICT (aucun repli
        // futur — un comptage post-event tagué sur un match à venir empoisonnait
        // la baseline du pre-event suivant, écart §11.3 clos).
        ev = this.isPreMode ? (future[0]?.e || null) : (past[0]?.e || null)
        if (ev && this.router) {
          this.router
            .replace({ query: { ...this.route.query, event: ev.id } })
            .catch(() => {})
        }
      }
      if (!ev) return null
      const cfgId = resolveCfg(ev)
      if (!cfgId) return null
      return { event: ev, configId: cfgId }
    },
    /** Race au montage : resolveEventContext peut tourner sur un store encore
     *  vide (navigation même-espace → loadSpace non ré-appelé, ou events pas
     *  encore arrivés). Quand events/configurations se peuplent, re-résout si
     *  on est resté sur l'état « aucun contexte ». */
    retryResolveIfEmptyContext() {
      if (this.loading || this.selectedConfigId) return
      if (!this.events.length || !this.configurations.length) return
      this.loadForSpace(this.route?.params?.spaceId)
    },
    /** Relance manuelle après échec réseau de l'assignation (bandeau contextError). */
    retryAssignment() {
      if (this.loading) return
      this.loadForSpace(this.route?.params?.spaceId)
    },
    /** Charge toutes les données pour un space donné (mount + changement d'espace/event). */
    async loadForSpace(spaceId) {
      this.loading = true
      // Documents de réconciliation : fire-and-forget, jamais bloquant pour le comptage.
      this.loadReconciliations(spaceId)
      try {
        if (spaceId && (!this.currentSpace || String(this.currentSpace.id) !== String(spaceId))) {
          try {
            await this.store.dispatch('analyse/loadSpace', spaceId)
          } catch (e) {
            console.warn('[SpaceInventory] loadSpace failed, fallback mock:', e?.message)
          }
        }

        // Contexte = event ouvert dans Event Predict (?event=). L'event porte la
        // config (périmètre PdV) ET sert de clé de comptage : les deux sont ancrés
        // sur le MÊME event (jamais config event A / comptages event B).
        const ctx = this.resolveEventContext()
        if (!ctx) {
          // Pas de contexte : vider l'affichage, désactiver la sauvegarde, inviter.
          this.resetContext()
          this.store.dispatch('inventory/clearContext')
          this.selectedConfigId = null
          this.selectedEventId = null
          this.contextEventId = null
          return
        }

        this.selectedConfigId = ctx.configId
        this.selectedEventId = ctx.event.id
        this.contextEventId = ctx.event.id
        this.store.dispatch('inventory/loadMarketPrices')
        this.store.dispatch('inventory/loadPackagingTypes')

        await Promise.all([
          this.loadContext(spaceId, ctx.configId),
          this.store.dispatch('inventory/loadInventory', {
            spaceId,
            eventId: this.selectedEventId,
            // Phase du comptage (BUG-237) : les deux écrans partagent l'eventId.
            // En post, le serveur renvoie les saisies d'avant-match en simple
            // proposition (valeurs gardées, « à compter ») au lieu d'un comptage
            // déjà validé — sinon un clic archivait un post-event = pre-event.
            phase: this.isPreMode ? 'pre-event' : 'post-event',
          }),
        ])

        // Attendus (les deux modes, permission requise) : APRÈS loadContext — la
        // résolution nom→item a besoin du référentiel affiché. Le besoin prédit
        // a la même dépendance (périmètre des PdV affichés).
        this.fetchPreExpected()
        this.fetchPredictedNeed()
        // Stock Logistic LIVE (demande Bertrand 2026-08-27) : la même quantité que
        // la carte Logistic elle-même affiche pour cet article/élément, pour
        // comparer d'un coup d'œil avec ce qui est en cours de comptage ici.
        this.store.dispatch('logistics/loadStock', {
          spaceId,
          configId: this.selectedConfigId,
          eventId: this.selectedEventId,
        })

        this.mock = buildSpaceInventoryMock()
        if (this.demo) {
          this.store.commit('inventory/SET_PACKAGING_TYPES', this.mock.packagingTypes || [])
          // Seed UNE seule fois : si la DB locale a déjà des comptages (modifs
          // persistées), on les garde. Sinon on amorce avec le mock + on persiste.
          const existing = this.store.state.inventory.inventoryCounts || {}
          if (!Object.keys(existing).length) {
            const seeded = buildInventoryCountsMock(this.realShops)
            this.store.commit('inventory/SET_INVENTORY_COUNTS', seeded)
            localDb.setInventoryCounts(spaceId, this.selectedEventId, seeded)
          }
        }
      } finally {
        this.loading = false
      }
    },
    resetInventoryFilters() {
      this.clearFacetSelections()
      this.search = ''
      // Réinitialise aussi les axes bandeau (pill + À compter/Comptés) pour garantir
      // une liste non vide depuis l'état « Aucun élément » (sinon reset inefficace).
      this.shopStatusFilter = 'all'
      this.countingStatusTab = 'to-count'
    },
    /** Vide les facettes seules (le switch d'onglet garde recherche + statut). */
    clearFacetSelections() {
      this.selectedShops = []
      this.selectedShopTypes = []
      this.selectedShopAreas = []
      this.selectedMenuItems = []
      this.selectedItemTypes = []
      this.selectedItemCategories = []
      this.selectedStorages = []
      this.selectedStorageFloors = []
    },
    updateViewportMode() {
      if (typeof window === 'undefined') return
      this.isMobile = window.matchMedia('(max-width: 900px)').matches
    },
    goBack() {
      // Parité React : retourne à AnalyseView par défaut. Si pas d'historique
      // (deep-link, refresh), push explicitement la route space-analyse.
      const spaceId = this.route?.params?.spaceId
      if (window.history.length > 1) {
        this.router.back()
      } else if (spaceId) {
        this.router.push({ name: 'space-analyse', params: { spaceId } })
      } else {
        this.router.push('/spaces')
      }
    },

    getCount(shopId, itemId) {
      const shopCounts = this.inventoryCounts[shopId] || {}
      // Toujours renvoyer un objet normalisé : un count partiel (ex. créé par
      // markCounted, sans packedUnits/looseUnits) laisserait les champs vides.
      // Les défauts (0) garantissent que les inputs affichent toujours une valeur.
      return {
        ...emptyInventoryCount({ itemId, eventId: this.selectedEventId }),
        ...(shopCounts[itemId] || {}),
      }
    },
    isItemCounted(shopId, itemId) { return !!this.getCount(shopId, itemId).isCounted },
    countedInShop(shop) {
      return (shop.consolidatedInventory || []).filter((it) => this.isItemCounted(shop.element.id, it.id)).length
    },
    totalForItem(shopId, item) {
      const c = this.getCount(shopId, item.id)
      const q = Number(item.inventoryQuantityPackaged || 1)
      return Number(c.packedUnits || 0) * q + Number(c.looseUnits || 0)
    },
    totalItemsForCard(entry) {
      return entry.consolidatedInventory?.length || entry.storageInventory?.length || entry.merchInventory?.length || 0
    },
    statusFor(shop) {
      // Parité React (SpaceInventory.tsx:635-652) : statut binaire. Tous les
      // articles comptés => 'counted', sinon 'to-count'. Pas d'état "jeté" ni
      // "en cours" : une boutique partiellement comptée reste dans 'to-count'.
      const total = (shop.consolidatedInventory || []).length
      const counted = this.countedInShop(shop)
      return total > 0 && counted === total ? COUNTING_STATUS.COUNTED : 'to-count'
    },
    statusLabel(entry) {
      return this.statusFor(entry) === COUNTING_STATUS.COUNTED
        ? this.t('invStatusCounted')
        : this.t('invStatusToCount')
    },
    statusClass(entry) {
      return this.statusFor(entry) === COUNTING_STATUS.COUNTED ? 'si-status-ok' : 'si-status-pending'
    },
    statusColor(entry) {
      return this.statusFor(entry) === COUNTING_STATUS.COUNTED ? 'success' : 'grey'
    },
    progressForCard(entry) {
      const total = this.totalItemsForCard(entry)
      if (!total || !entry.consolidatedInventory) return 0
      return Math.round((this.countedInShop(entry) / total) * 100)
    },
    filteredItemsForCard(entry) {
      const all = entry.consolidatedInventory || entry.storageInventory || entry.merchInventory || []
      const q = (this.search || '').trim().toLowerCase()
      if (!q) return all
      return all.filter((it) => it.name.toLowerCase().includes(q))
    },
    topTabCount(tab) {
      // Total d'éléments de la config par onglet (les sous-onglets portent le
      // détail par statut) : « F&B Shops (N) » = TOUS les PdV de la config.
      if (tab === 'shops') return this.realShops.length
      if (tab === 'storage') return this.realStorages.length
      return this.realMerch.length
    },
    // Pill Ouvert/Fermé : garde la boutique selon le filtre bandeau actif.
    matchesShopStatusPill(c) {
      if (this.shopStatusFilter === 'open') return c?.element?.isOpen !== false
      if (this.shopStatusFilter === 'closed') return c?.element?.isOpen === false
      return true
    },
    subTabCount(value) {
      // Tous les onglets ont des compteurs de statut (parité React). Croisé avec le
      // pill Ouvert/Fermé courant → badge = ce que la liste montrera (pas de faux « Comptés 1 »).
      if (this.activeTab === 'shops') {
        return this.realShops.filter(
          (c) => this.statusFor(c) === value && this.matchesShopStatusPill(c),
        ).length
      }
      const source = this.activeTab === 'storage' ? this.realStorages : this.realMerch
      return source.filter((c) => this.storageStatusFor(c) === value).length
    },
    /** Statut d'une entrée storage/merch : counted si tous les items ont isCounted (parité React). */
    storageStatusFor(entry) {
      const items = [...(entry.storageInventory || []), ...(entry.merchInventory || [])]
      if (!items.length) return 'to-count'
      const shopCounts = this.inventoryCounts[entry.element.id] || {}
      const countedCount = items.filter((it) => shopCounts[it.id]?.isCounted).length
      return countedCount === items.length ? COUNTING_STATUS.COUNTED : 'to-count'
    },
    storageStatusLabel(entry) {
      return this.storageStatusFor(entry) === COUNTING_STATUS.COUNTED
        ? this.t('invStatusCounted')
        : this.t('invStatusToCount')
    },
    /** Items d'une entrée, qu'elle soit shop (consolidatedInventory) ou storage/merch. */
    elementItems(entry) {
      if (!entry) return []
      if (Array.isArray(entry.consolidatedInventory)) return entry.consolidatedInventory
      return [...(entry.storageInventory || []), ...(entry.merchInventory || [])]
    },
    countedInElement(entry) {
      if (!entry?.element) return 0
      return this.elementItems(entry).filter((it) => this.isItemCounted(entry.element.id, it.id)).length
    },
    progressForElement(entry) {
      const total = this.elementItems(entry).length
      if (!total) return 0
      return Math.round((this.countedInElement(entry) / total) * 100)
    },
    findElementEntry(elementId) {
      return [...this.realShops, ...this.realStorages, ...this.realMerch]
        .find((e) => e?.element?.id === elementId) || null
    },
    /** Normalise une entrée storage/merch vers la forme attendue par l'interface
     *  de comptage (consolidatedInventory). Les shops sont déjà conformes. */
    normalizeCountingEntry(entry) {
      if (!entry || Array.isArray(entry.consolidatedInventory)) return entry
      return { ...entry, consolidatedInventory: this.elementItems(entry) }
    },
    /** Ouvre l'interface de comptage pour un shop OU un storage (normalisé). */
    startCount(entry) {
      this.countingShop = this.normalizeCountingEntry(entry)
    },
    /** Toast quand tous les articles d'un PDV / stockage viennent d'être comptés. */
    notifyIfElementComplete(elementId) {
      const entry = this.findElementEntry(elementId)
      if (!entry) return
      const items = this.elementItems(entry)
      if (!items.length) return
      const counted = items.filter((it) => this.isItemCounted(elementId, it.id)).length
      if (counted === items.length) {
        const name = entry.element?.name || ''
        this.snackbarText = name ? `${name} — ${this.t('invAllCountedToast')}` : this.t('invAllCountedToast')
        this.snackbar = true
      }
    },

    /**
     * Normalise une valeur de comptage avant le store. Négatif interdit
     * (backend @Min(0)) ; les COLIS sont forcés à l'entier — le backend les
     * valide @IsInt, et un « 2,5 » colis tapé au clavier partait tel quel en
     * API pour revenir en 400 silencieux. Le vrac reste décimal (Float en
     * base), arrondi à 2 décimales à l'émission par le composant de comptage.
     */
    normalizeCountValue(field, rawValue) {
      if (field === 'storageLocation') return rawValue
      const num = Math.max(0, Number(rawValue) || 0)
      return field === 'packedUnits' ? Math.round(num) : num
    },
    onCountInput(shopId, itemId, field, evt) {
      const value = this.normalizeCountValue(field, evt.target.value)
      const patch = { [field]: value }
      // Quand l'utilisateur saisit une valeur >0 sans avoir cliqué "compté",
      // on conserve l'état isCounted tel quel (parité React).
      this.store.dispatch('inventory/upsertCount', { shopId, itemId, patch })
    },
    onCountValue(shopId, itemId, field, rawValue) {
      this.store.dispatch('inventory/upsertCount', {
        shopId,
        itemId,
        patch: { [field]: this.normalizeCountValue(field, rawValue) },
      })
    },
    markCounted(shopId, itemId, counted) {
      const status = counted ? COUNTING_STATUS.COUNTED : COUNTING_STATUS.PENDING
      this.store.dispatch('inventory/upsertCount', {
        shopId,
        itemId,
        patch: { isCounted: counted, countingStatus: status },
      })
      // La mutation UPSERT_COUNT est synchrone (avant l'await API) : l'état reflète
      // déjà le nouveau isCounted ici. On notifie si le PDV/stockage est complet.
      if (counted) this.notifyIfElementComplete(shopId)
    },
    async onSaveAll() {
      // Garde douce (option 2) : si l'inventaire est incomplet, on confirme sans
      // jamais bloquer (le bouton reste toujours actif).
      if (!this.isCountComplete && this.inventoryStats.totalItems) {
        const { countedItems, totalItems } = this.inventoryStats
        const ok = await confirmDialog({
          title: this.t('invIncompleteTitle'),
          message: `${countedItems}/${totalItems} ${this.t('invIncompleteMsgPrefix')}`,
          confirmText: this.t('invSaveAnyway'),
          cancelText: this.t('invContinueCounting'),
          confirmColor: 'deep-orange',
          icon: 'mdi-alert-outline',
          iconColor: 'warning',
        })
        if (!ok) return
      }
      try {
        // kind = phase du comptage → snapshots discriminés (cycle pre↔post, docs modules/10 §8).
        await this.store.dispatch('inventory/saveInventory', {
          kind: this.isPreMode ? 'pre-event' : 'post-event',
        })
      } catch (e) {
        // Échec API → toast et on ne crée PAS de réconciliation.
        this.errorText = e?.userMessage || e?.message || this.t('invSaveError')
        this.errorSnackbar = true
        return
      }
      // Après sauvegarde : GÉNÉRATION du document de réconciliation (attendu vs
      // compté en mode pre ; restant-théorique vs compté en mode post) puis
      // ouverture de sa vue (spec 2026-07-20 — remplace l'ancienne navigation
      // automatique vers le Réarmement du 2026-07-06 ; le Réarmement reste
      // accessible par le dropdown Tools). Voir docs/modules/10_POST_EVENT_INVENTORY.md §7-8.
      if (this.isPreMode) await this.createPreReconciliationAfterSave()
      else await this.createReconciliationAfterSave()
    },
    /** Bouton "Update Logistic" : pousse manuellement le comptage courant vers le
     *  registre Logistic (écrase les StockLevel avec les quantités comptées),
     *  sans créer de document de réconciliation — même mécanisme que le recalage
     *  automatique déclenché par "Create Reconciliation" (pushCountToLogistic),
     *  mais explicite et confirmable. */
    async onUpdateLogistic() {
      if (!this.selectedEventId) return
      const uncounted = this.uncountedItemsSummary
      let message = this.t('invUpdateLogisticConfirmMsg')
      if (uncounted.length) {
        const maxShown = 15
        const lines = uncounted.slice(0, maxShown).map((u) => `• ${u.name} (${u.counted}/${u.total})`)
        if (uncounted.length > maxShown) {
          lines.push(this.t('invUpdateLogisticConfirmMore').replace('{n}', uncounted.length - maxShown))
        }
        message = `${message}\n\n${this.t('invUpdateLogisticConfirmUncountedIntro')}\n${lines.join('\n')}`
      }
      const ok = await confirmDialog({
        title: this.t('invUpdateLogisticConfirmTitle'),
        message,
        confirmText: this.t('invUpdateLogisticConfirmBtn'),
        cancelText: this.t('cancel') || 'Cancel',
        confirmColor: 'deep-orange',
        icon: 'mdi-alert-outline',
        iconColor: 'warning',
      })
      if (!ok) return
      const spaceId = this.route.params.spaceId
      this.pushingToLogistic = true
      try {
        await pushInventoryCountToLogistic(
          spaceId,
          this.selectedEventId,
          this.isPreMode ? 'pre-event' : 'post-event',
        )
        this.successText = this.t('invUpdateLogisticSuccess')
        this.successSnackbar = true
      } catch (e) {
        this.errorText = e?.userMessage || e?.response?.data?.message || this.t('invUpdateLogisticError')
        this.errorSnackbar = true
      } finally {
        this.pushingToLogistic = false
      }
    },
    /** Mode PRE : le backend construit les lignes (attendu vs compté) — le client,
     *  potentiellement sans la permission « attendus », ne les a jamais eues. */
    async createPreReconciliationAfterSave() {
      const spaceId = this.route.params.spaceId
      const ev = (this.events || []).find((e) => String(e.id) === String(this.selectedEventId))
      if (!ev) return
      this.recoCreating = true
      try {
        if (isDemoMode()) {
          // Démo : pas de backend → document local minimal non persisté.
          const doc = {
            id: `demo-pre-${Date.now()}`,
            eventId: ev.id,
            eventName: ev.name || ev.eventName || null,
            kind: 'pre-event',
            createdAt: new Date().toISOString(),
            lines: [],
          }
          this.reconciliations = [doc, ...this.reconciliations]
          this.selectedReconciliationId = doc.id
          return
        }
        // Besoin prédit du scénario de référence → 2e colonne d'écart du document.
        // Absent (pas de version par défaut) → colonnes prédit à « — », pas 0.
        const created = await createPreEventReconciliation(
          spaceId,
          ev.id,
          this.predictedUnitsBlobForReco(),
        )
        this.reconciliations = [created, ...this.reconciliations.filter((r) => r.id !== created.id)]
        this.selectedReconciliationId = created.id
      } catch (e) {
        console.warn('[SpaceInventory] création réconciliation pre-event KO:', e?.message)
        this.errorText = e?.userMessage || this.t('invRecoCreateError')
        this.errorSnackbar = true
      } finally {
        this.recoCreating = false
      }
    },
    /** Charge les attendus de l'écran courant (permission requise dans les deux
     *  modes). Pre : hints packed/loose. Post : indice total par article. */
    async fetchPreExpected() {
      this.preExpected = null
      this.postExpectedUnits = null
      this.expectedUnavailable = null
      this.expectedAsOf = null
      if (!this.canSeeExpected) {
        this.expectedUnavailable = 'no-permission'
        return
      }
      if (!this.selectedEventId || isDemoMode()) return
      const spaceId = this.route.params.spaceId
      this.preExpectedLoading = true
      try {
        const baseline = this.isPreMode
          ? await getPreEventBaseline(spaceId, this.selectedEventId)
          : await getPostEventBaseline(spaceId, this.selectedEventId)
        // Source « état Logistic » (décision JLH 2026-08-20) : le blob `expected`
        // existe toujours côté serveur à jour. Absent = backend antérieur.
        if (!baseline?.expected) {
          this.expectedUnavailable = 'not-deployed'
          return
        }
        // Instant de calcul (`asOf`) : porté par l'infobulle de chaque attendu.
        this.expectedAsOf = baseline.asOf ?? null
        if (this.isPreMode) {
          // `unitsPerItemId` (BUG-239) : le serveur peut avoir calculé l'attendu
          // avec la taille de paquet de la Logistique — on le re-découpe dans celle
          // du champ Packed affiché (total en unités inchangé).
          this.preExpected = buildPreEventExpected(baseline, {
            unitsPerItemId: this.unitsPerItemIdMap,
          })
        } else {
          // Post : le serveur a déjà keyé par elementId/itemId ET déjà déduit les
          // ventes — pas de jointure par nom ici, pas de re-découpage (l'indice
          // est un total en unités, pas une paire packed/loose).
          const flat = {}
          for (const [elementId, byItem] of Object.entries(baseline.expectedUnits || {})) {
            for (const [itemId, units] of Object.entries(byItem || {})) {
              const n = Number(units)
              if (Number.isFinite(n)) flat[expectedKey(elementId, itemId)] = n
            }
          }
          this.postExpectedUnits = flat
        }
      } catch (e) {
        // 403 permission retirée, 404 backend antérieur à la route, réseau : on
        // NOMME la cause au lieu d'afficher des tirets muets.
        const status = e?.response?.status
        this.expectedUnavailable = status === 403 ? 'forbidden' : status === 404 ? 'not-deployed' : null
        console.warn('[SpaceInventory] baseline attendus KO (pas de hints):', e?.message)
        this.preExpected = null
        this.postExpectedUnits = null
      } finally {
        this.preExpectedLoading = false
      }
    },
    /** Accessor passé à InventoryCountingInterface — null quand pas de hint.
     *  Pre : blob serveur packed/loose (BUG-232/239). Post : re-découpage de
     *  l'indice ventes déduites (postExpectedFields, réunion Bertrand
     *  2026-08-19). */
    expectedForField(shopId, itemId, field) {
      const exp = this.isPreMode
        ? this.preExpected?.[expectedKey(shopId, itemId)]
        : this.postExpectedFields?.[expectedKey(shopId, itemId)]
      if (!exp) return null
      return field === 'packed' ? exp.packed : exp.loose
    },
    /** Détail du calcul de l'attendu d'un article (infobulle title). Depuis la
     *  décision JLH 2026-08-20 (attendu = état Logistic au chargement — la
     *  provenance est portée par la cartouche de page, pas répétée ici), le
     *  détail montre la conversion packs × conditionnement + vrac = total :
     *  « 15 × 4 + 2 = 62 ». Identité pure, aucune prose — la décomposition
     *  « comptage + mouvements − vendu » n'existe plus (l'historique par
     *  mouvement vit sur l'écran Logistic). null = pas d'attendu. */
    expectedDetailFor(elementId, itemId) {
      const key = expectedKey(elementId, itemId)
      const expectedUnits = this.isPreMode ? this.preExpectedUnits : this.postExpectedUnits
      const total = expectedUnits?.[key]
      if (!Number.isFinite(total)) return null
      const fmt = formatUnits
      const pair = this.isPreMode ? this.preExpected?.[key] : this.postExpectedFields?.[key]
      const itemId2 = String(itemId)
      const q = Number(this.unitsPerItemIdMap?.[itemId2]) > 0 ? Number(this.unitsPerItemIdMap[itemId2]) : 1
      // Ligne 1 : l'identité de conversion, vérifiable de tête.
      const calc =
        pair && q > 1
          ? `${fmt(pair.packed)} × ${fmt(q)} + ${fmt(pair.loose)} = ${fmt(total)}`
          : `${this.t('invExpectedFromLogistic')} = ${fmt(total)}`
      // Ligne 2 : la provenance, qui vivait dans une cartouche permanente avant
      // BUG-352-01. Elle n'apparaît donc plus que quand on la cherche.
      const source = this.expectedSourceText
      return source ? `${calc}\n${source}` : calc
    },
    /** Quantité Logistic LIVE d'un article sur un élément — même chiffre que
     *  la carte Logistic (`logistics/expectedFor` : packed×conditionnement +
     *  (loose − vendu), casse de pack incluse). Distinct du Besoin prédit
     *  (une prévision) : ici, l'état RÉEL actuel du stock, pour comparaison
     *  directe avec le compteur en cours de saisie (demande Bertrand
     *  2026-08-27).
     *  0 (PAS null) tant que l'article est référencé dans le Logistic de cet
     *  élément mais n'a encore reçu aucun mouvement — `expectedFor` renvoie
     *  null dans ce cas précis (aucun StockLevel/consommation créé), ce qui
     *  masquait le chip à tort sur un article pourtant bien listé côté
     *  Logistic (constaté 2026-08-28 sur « Affligem », jamais mouvementé).
     *  null = seulement si l'article n'est même pas dans le référentiel de
     *  cet élément. */
    logisticStockFor(elementId, item) {
      const name = item?.name
      if (!name) return null
      const key = String(name).trim().toLowerCase()
      const el = (this.store.state.logistics?.elements || []).find((e) => e.id === elementId)
      const referenced = el && (el.items || []).some((it) => String(it?.name ?? '').trim().toLowerCase() === key)
      if (!referenced) return null
      const exp = this.store.getters['logistics/expectedFor'](elementId, name)
      if (!exp) return 0
      const upp = Number(exp.unitsPerPack) > 0 ? Number(exp.unitsPerPack) : 1
      return (Number(exp.packed) || 0) * upp + (Number(exp.loose) || 0)
    },
    /** Indice affiché à côté du TOTAL d'un article : Besoin prédit, MÊME
     *  grandeur qu'à l'écran Logistic (réarmement en priorité, sinon Event
     *  Predict) — pre ET post-event (demande Bertrand 2026-08-27). Alimenté
     *  par `this.predictedNeed`, cf. `fetchPredictedNeed`. null = rien à
     *  afficher (« — »). */
    expectedTotalFor(elementId, item) {
      return lookupPredictedNeed(this.predictedNeed, elementId, item)
    },
    /** Besoin prédit remis à plat pour le document pre-event :
     *  { elementId: { itemId: unités } }. null s'il n'y a pas de scénario de
     *  référence — le serveur laisse alors les colonnes prédit à « — ». */
    predictedUnitsBlobForReco() {
      const byItemId = this.predictedNeed?.byItemId
      if (!byItemId || !Object.keys(byItemId).length) return null
      const out = {}
      for (const [k, units] of Object.entries(byItemId)) {
        const sep = k.indexOf('|')
        if (sep <= 0) continue
        const elementId = k.slice(0, sep)
        const itemId = k.slice(sep + 1)
        if (!itemId) continue
        ;(out[elementId] ??= {})[itemId] = units
      }
      return Object.keys(out).length ? out : null
    },
    /** Besoin prédit du match, alimente le chip « Besoin prédit » du TOTAL
     *  (`expectedTotalFor`) — pre ET post-event (demande Bertrand
     *  2026-08-27). La répartition Attendu pack/vrac (`expectedForField`,
     *  `preExpected`/`postExpectedFields`) reste une source indépendante,
     *  non touchée. Même priorité que Logistic (`SpaceLogisticView.fetchPredictedNeed`) :
     *  feuille de réarmement sauvegardée (RestockPlan.restockLines, décision
     *  opérationnelle nettée du stock restant) d'abord, prévision brute Event
     *  Predict en repli. Silencieux en cas d'échec : on ne bloque jamais un
     *  comptage. Permission DÉDIÉE preInventoryPredicted (réunion Bertrand
     *  2026-08-19) : sans elle, ni fetch ni chip — l'index reste null. */
    async fetchPredictedNeed() {
      this.predictedNeed = null
      this.predictedNeedMissing = false
      if (!this.canSeePredicted || !this.selectedEventId || isDemoMode()) return

      try {
        const plans = await listRestockPlans(this.currentSpaceId)
        const match = (plans || []).find((p) => (p.selectedEventIds || []).map(String).includes(String(this.selectedEventId)))
        if (match) {
          const full = await getRestockPlan(match.id)
          const restockIndex = buildRestockNeedIndex(full?.restockLines)
          if (restockIndex) {
            this.predictedNeed = restockIndex
            return
          }
        }
      } catch (e) {
        console.warn('[inventory] lookup feuille de réarmement échoué, repli Event Predict :', e?.message)
      }

      const elements = (this.realShops || []).map((c) => ({
        id: c.element.id,
        name: c.element.name,
      }))
      const { index, reason } = await loadPredictedNeed({
        eventId: this.selectedEventId,
        elements,
        menuItems: this.store.state.analyse?.menuItems || [],
        components: this.store.state.analyse?.components || [],
      })
      this.predictedNeed = index
      this.predictedNeedMissing = reason === 'no-default-version'
    },
    /** Candidat au transfert enrichi du stock Logistic actuel de la denrée. */
    movementCandidate(el, itemName) {
      const exp = itemName ? this.store.getters['logistics/expectedFor'](el.id, itemName) : null
      return { id: el.id, name: el.name, packed: exp?.packed || 0, loose: exp?.loose || 0 }
    },
    /** Ouvre le drawer transfert sur (élément, article de comptage). Charge le
     *  stock Logistic au premier appel (candidats + plafond), puis les market
     *  prices scopés à la denrée — deux lectures, aucune écriture avant submit. */
    async openTransfer(element, item) {
      const spaceId = this.route.params.spaceId
      this.movementElement = { id: element.id, name: element.name }
      // Adapter minimal tout de suite (le drawer s'ouvre avant le fetch) ; les
      // champs Logistic (kind/packagingType/marketPriceId) sont complétés après.
      this.movementItem = {
        name: item.name,
        unit: item.unit || null,
        kind: null,
        packagingType: item.inventoryPackaging || null,
        marketPriceId: null,
        unitsPerPack: Number(item.inventoryQuantityPackaged) || null,
      }
      this.movementError = null
      this.movementMarketPrices = []
      this.movementMarketPricesLoading = true
      this.movementDialog = true
      try {
        if (!this.logisticsStockLoaded) {
          await this.store.dispatch('logistics/loadStock', { spaceId })
          this.logisticsStockLoaded = true
        }
        // L'item de comptage ne porte ni kind/packagingType/marketPriceId — on
        // les résout dans le référentiel Logistic (itemByKey, jointure par nom :
        // StockMovement.itemKey est un NOM libre, piège n°1 du domaine Stock).
        const ref = this.store.getters['logistics/itemByKey'](item.name)
        this.movementItem = {
          name: item.name,
          unit: item.unit || ref?.unit || null,
          kind: ref?.kind || null,
          packagingType: ref?.packagingType || item.inventoryPackaging || null,
          marketPriceId: ref?.marketPriceId || null,
          unitsPerPack: ref?.unitsPerPack || Number(item.inventoryQuantityPackaged) || null,
        }
        this.movementMarketPrices = await this.store.dispatch('logistics/loadMarketPricesForItem', {
          spaceId,
          itemKey: item.name,
        })
      } catch (e) {
        console.warn('[SpaceInventory] ouverture transfert KO:', e?.message)
      } finally {
        this.movementMarketPricesLoading = false
      }
    },
    async submitTransfer(payload) {
      const spaceId = this.route.params.spaceId
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
        this.snackbarText = this.t('logiMovementSaved')
        this.snackbar = true
      } catch (e) {
        this.movementError =
          e?.response?.data?.message || e?.userMessage || this.t('logiMovementError')
      } finally {
        this.movementSaving = false
      }
    },
    /**
     * Événement à réconcilier = l'event de l'ÉCRAN, strictement (« un match =
     * un eventId », décision owner 2026-07-24 — Q32 résolue). L'ancien repli
     * silencieux « dernier event passé du space » pouvait sauvegarder le
     * comptage sous MATCH-B et créer la réconciliation sous MATCH-A. Event
     * absent ou non fini → null, le caller affiche un refus explicite.
     */
    resolveReconciliationEvent() {
      const current = (this.events || []).find((e) => String(e.id) === String(this.selectedEventId))
      if (!current) return null
      const d = new Date(current.date || current.eventDate)
      return !Number.isNaN(d.getTime()) && d.getTime() <= Date.now() ? current : null
    },
    async createReconciliationAfterSave() {
      const spaceId = this.route.params.spaceId
      const recoEvent = this.resolveReconciliationEvent()
      if (!recoEvent) {
        // Refus EXPLICITE (plus de repli vers un autre match) : event de l'écran
        // non fini → message dédié ; aucun event résolu → message existant.
        // Le comptage, lui, est déjà sauvegardé.
        const current = (this.events || []).find((e) => String(e.id) === String(this.selectedEventId))
        this.errorText = current ? this.t('invRecoEventNotFinished') : this.t('invRecoNoPastEvent')
        this.errorSnackbar = true
        return
      }
      this.recoCreating = true
      try {
        const { lines, meta } = await this.buildReconciliationLines(spaceId, recoEvent)
        if (isDemoMode()) {
          // Démo : document local non persisté (parité avec l'inventaire démo,
          // qui vit déjà 100% en localStorage).
          const doc = {
            id: `demo-${Date.now()}`,
            eventId: recoEvent.id,
            eventName: recoEvent.name || recoEvent.eventName || null,
            kind: 'post-event',
            createdAt: new Date().toISOString(),
            lines,
            meta: { baseline: { source: meta.preEventSource }, salesUnjoined: meta.salesUnjoined, salesSource: meta.salesSource },
          }
          this.reconciliations = [doc, ...this.reconciliations]
          this.selectedReconciliationId = doc.id
          return
        }
        const basePayload = {
          eventId: recoEvent.id,
          eventName: recoEvent.name || recoEvent.eventName || undefined,
          lines,
        }
        let created
        try {
          created = await createPostEventReconciliation(spaceId, {
            ...basePayload,
            preEventSource: meta.preEventSource,
            ...(meta.salesUnjoined ? { salesUnjoined: meta.salesUnjoined } : {}),
            countedProgress: meta.countedProgress,
            // Q35 : grain de la source « Vendu » — un backend antérieur le rejette
            // en 400 « should not exist » → repli basePayload ci-dessous (BUG-228).
            salesSource: meta.salesSource,
          })
        } catch (e) {
          // Réflexe BUG-228 : le DTO backend est en whitelist stricte
          // (`forbidNonWhitelisted`). Sur un serveur pas encore redéployé, les
          // champs de contexte renvoient 400 « property X should not exist » —
          // le document vaut mieux sans son contexte que pas de document du tout.
          const msg = String(e?.response?.data?.message || e?.message || '')
          if (e?.response?.status !== 400 || !/should not exist/i.test(msg)) throw e
          console.warn('[SpaceInventory] backend sans contexte de réconciliation — repli sans meta:', msg)
          created = await createPostEventReconciliation(spaceId, basePayload)
        }
        // La réponse API est le document complet (lines incluses) → en tête de liste.
        this.reconciliations = [created, ...this.reconciliations.filter((r) => r.id !== created.id)]
        this.selectedReconciliationId = created.id
      } catch (e) {
        console.warn('[SpaceInventory] création réconciliation KO:', e?.message)
        // Ventes indisponibles (réseau) : message dédié — pas de document créé,
        // le comptage est déjà sauvegardé, recliquer le bouton retente.
        this.errorText = e?.salesFetchFailed
          ? this.t('invRecoSalesError')
          : (e?.userMessage || this.t('invRecoCreateError'))
        this.errorSnackbar = true
      } finally {
        this.recoCreating = false
      }
    },
    /**
     * Collecte les 4 sources et construit les lignes (util pur
     * `buildPostEventReconciliationLines`). Les sources optionnelles qui
     * échouent dégradent en null (colonnes « — »), jamais en 0 fabriqué.
     */
    async buildReconciliationLines(spaceId, recoEvent) {
      // ── Compté (post-event) + référentiel noms/conditionnement ──────────────
      const entries = [...(this.realShops || []), ...(this.realStorages || []), ...(this.realMerch || [])]
      const countedUnitsByKey = {}
      const elementNameById = {}
      const itemNameById = {}
      const packagedByItemId = {}
      const elementIdByNormName = new Map()
      for (const entry of entries) {
        const el = entry.element || {}
        if (!el.id) continue
        elementNameById[String(el.id)] = el.name || ''
        const nk = normalizeStr(el.name)
        if (nk && !elementIdByNormName.has(nk)) elementIdByNormName.set(nk, String(el.id))
        const items = entry.consolidatedInventory || entry.storageInventory || entry.merchInventory || []
        for (const it of items) {
          if (!it?.id) continue
          itemNameById[String(it.id)] = it.name || ''
          packagedByItemId[String(it.id)] = Number(it.inventoryQuantityPackaged || 1)
          countedUnitsByKey[reconciliationKey(el.id, it.id)] = this.totalForItem(el.id, it)
        }
      }
      const itemIdByNormName = new Map()
      for (const [id, name] of Object.entries(itemNameById)) {
        const nk = normalizeStr(name)
        if (nk && !itemIdByNormName.has(nk)) itemIdByNormName.set(nk, id)
      }

      // ── Pré-event : comptage d'avant-match du MÊME event, repli scopé sur le
      //    post-event du match précédent (BUG-241). `source` est archivé dans le
      //    document : un repli est une approximation, elle doit rester visible.
      let preEventUnitsByKey = null
      let preEventSource = 'none'
      try {
        const pre = isDemoMode() ? null : await getPreEventInventory(spaceId, recoEvent.id)
        if (pre?.source) preEventSource = pre.source
        const blob = pre?.inventoryCounts
        if (blob && typeof blob === 'object') {
          preEventUnitsByKey = {}
          for (const [shopId, byItem] of Object.entries(blob)) {
            for (const [itemId, c] of Object.entries(byItem || {})) {
              const q = packagedByItemId[String(itemId)] || 1
              preEventUnitsByKey[reconciliationKey(shopId, itemId)] =
                Number(c?.packedUnits || 0) * q + Number(c?.looseUnits || 0)
            }
          }
        }
      } catch (e) {
        console.warn('[SpaceInventory] pré-event inventory KO (colonnes left/miss à « — »):', e?.message)
        preEventUnitsByKey = null
      }

      // ── Mouvements Logistic de la fenêtre du match ──────────────────────────
      // Sans ce terme, un transfert entre deux PdV pendant le match se lit comme
      // un manquant d'un côté et un surplus de l'autre. Best-effort : indisponible
      // (permission, backend antérieur) → formule historique, marquée dans meta.
      //
      // ⚠️ Exigé : `preEventSource === 'pre-event'`. Sur le repli legacy
      // (`previous-post-event`), le stock de départ vient du match PRÉCÉDENT alors
      // que les mouvements sont bornés à CE match — additionner les deux
      // reviendrait à ancrer les deux termes sur des matchs différents.
      let movementUnitsByKey = null
      try {
        if (!isDemoMode() && this.canSeeExpected && preEventSource === 'pre-event') {
          const base = await getPostEventBaseline(spaceId, recoEvent.id)
          const blob = base?.movementUnits
          if (blob && typeof blob === 'object') {
            movementUnitsByKey = {}
            for (const [elementId, byItem] of Object.entries(blob)) {
              for (const [itemId, units] of Object.entries(byItem || {})) {
                const n = Number(units)
                if (Number.isFinite(n) && n !== 0) {
                  movementUnitsByKey[reconciliationKey(elementId, itemId)] = n
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('[SpaceInventory] mouvements de la fenêtre KO (réco sans ce terme):', e?.message)
        movementUnitsByKey = null
      }

      // ── Vendu pendant l'event ────────────────────────────────────────────────
      // Q35 Option 1 (décision owner 2026-07-27) : source primaire = ventes
      // EXPLOSÉES en consommation d'ingrédients par la cascade Logistic
      // (event-consumption). Une ligne comptée au grain ingrédient (fût, bidon)
      // reçoit enfin la consommation des produits préparés vendus — fini le
      // « Vendu = 0 → manquant fantôme ». Repli grain article (timeline brut) si
      // le backend n'expose pas encore la route (404) ; `salesSource` archivé
      // dans le document pour que chaque archive dise son grain.
      // Échec RÉSEAU ≠ « aucune vente » : avec un pré-event présent, des ventes à
      // 0 gonfleraient missing = (preEvent − 0) − compté et archiveraient de
      // fausses pertes. Hors démo, on ABANDONNE la création (le comptage est déjà
      // sauvegardé, recliquer retente) — philosophie « jamais de 0 fabriqué ».
      let soldUnitsByKey = {}
      // BUG-238 : une vente non joignable n'est PAS « zéro vente » — elle sort du
      // calcul et gonfle le manquant de la ligne concernée. On compte ce qui est
      // écarté pour l'archiver dans le document et l'afficher.
      const unjoinedShops = new Set()
      const unjoinedItems = new Set()
      let unjoinedUnits = 0
      let salesSource = 'consumption'
      let consumption = null
      if (isDemoMode()) {
        salesSource = 'timeline'
      } else {
        try {
          consumption = await getEventSalesConsumption(spaceId, recoEvent.id)
        } catch (e) {
          if (e?.response?.status === 404) {
            // Backend antérieur à Q35 : la route n'existe pas → repli assumé.
            salesSource = 'timeline'
            console.warn(
              '[SpaceInventory] event-consumption absent (backend antérieur) — repli ventes au grain article',
            )
          } else {
            const err = new Error(e?.message || 'event-consumption failed')
            err.salesFetchFailed = true
            throw err
          }
        }
      }

      if (consumption) {
        const joined = buildSoldUnitsFromConsumption(consumption.lines || [], {
          elementIdSet: new Set(Object.keys(elementNameById)),
          itemIdByNormName,
          normalize: normalizeStr,
        })
        soldUnitsByKey = joined.soldUnitsByKey
        joined.unjoinedItems.forEach((n) => unjoinedItems.add(n))
        joined.unjoinedShops.forEach((n) => unjoinedShops.add(n))
        unjoinedUnits += joined.unjoinedUnits
        // Écartés côté serveur (PdV non mappé Weezevent, produit sans mapping) :
        // même bandeau que les non-joints côté client.
        const su = consumption.unjoined
        if (su) {
          for (const n of su.shopNames || []) unjoinedShops.add(String(n))
          for (const n of su.productNames || []) unjoinedItems.add(String(n))
          unjoinedUnits += Number(su.units) || 0
        }
      } else {
        // ── Repli grain article : event-timeline brut (chemin pré-Q35, inchangé).
        try {
          const byEventId = await getSpaceEventTimelineBatch(spaceId, [recoEvent.id])
          const raw = (byEventId.get(recoEvent.id) || []).map((r) => ({ ...r, eventId: recoEvent.id }))
          const records = preprocessTimelineRecords(raw, {
            menuItemCostMap: this.store.state.analyse?.menuItemCostMap || {},
          })
          for (const r of records) {
            const qty = Number(r.quantity) || 0
            const shopLabel = r.shopName || r.shop || ''
            const elId = elementIdByNormName.get(normalizeStr(shopLabel))
            if (!elId) {
              // PdV de vente non présent dans la config comptée
              if (shopLabel) unjoinedShops.add(String(shopLabel))
              unjoinedUnits += qty
              continue
            }
            const itemLabel = r.itemName || r.menuItemName || r.productName || ''
            const itemId =
              (r.menuItemId != null && String(r.menuItemId)) ||
              (r.mappedMenuItemId != null && String(r.mappedMenuItemId)) ||
              itemIdByNormName.get(normalizeStr(itemLabel)) ||
              null
            if (!itemId || !(itemId in itemNameById)) {
              // Vente non rattachable à un article inventorié (id inconnu du
              // référentiel compté OU nom sans correspondance).
              if (itemLabel) unjoinedItems.add(String(itemLabel))
              unjoinedUnits += qty
              continue
            }
            const key = reconciliationKey(elId, itemId)
            soldUnitsByKey[key] = (soldUnitsByKey[key] || 0) + qty
          }
        } catch (e) {
          if (!isDemoMode()) {
            const err = new Error(e?.message || 'event-timeline failed')
            err.salesFetchFailed = true
            throw err
          }
          // Démo : pas de backend, on tolère (document local d'illustration).
          console.warn('[SpaceInventory] event-timeline KO (démo, Qty sold à 0) :', e?.message)
        }
      }
      if (unjoinedShops.size || unjoinedItems.size) {
        console.warn(
          `[SpaceInventory] réconciliation : ${Math.round(unjoinedUnits * 100) / 100} unité(s) vendue(s) non rattachée(s) — ` +
            `PdV inconnus: ${[...unjoinedShops].join(', ') || '—'} ; ` +
            `articles inconnus: ${[...unjoinedItems].join(', ') || '—'}`,
        )
      }

      // ── Prédit : scénario Event Predict (pont localStorage, comme le Réarmement)
      let predictedUnitsByKey = null
      const predicted = localDb.getAnyPredictedRecords(spaceId, recoEvent.id)
      if (predicted?.records?.length) {
        predictedUnitsByKey = {}
        for (const pr of predicted.records) {
          const elId = pr.shopId || pr.elementId
          const itemId = pr.menuItemId || pr.mappedMenuItemId
          if (!elId || !itemId) continue
          const key = reconciliationKey(elId, itemId)
          predictedUnitsByKey[key] = (predictedUnitsByKey[key] || 0) + (Number(pr.totalQuantity) || 0)
        }
      }

      // Q35 : le scénario prédit des ventes d'ARTICLES — une ligne au grain
      // ingrédient (id de ligne de recette, hors catalogue) garde predicted null.
      // Catalogue pas encore chargé → null (régime inchangé), pas un Set vide qui
      // éteindrait le prédit de toutes les lignes.
      const catalogItemIds = new Set(
        (this.store.state.analyse?.menuItems || []).map((mi) => String(mi?.id)).filter(Boolean),
      )
      const lines = buildPostEventReconciliationLines({
        countedUnitsByKey,
        preEventUnitsByKey,
        soldUnitsByKey,
        movementUnitsByKey,
        predictedUnitsByKey,
        predictableItemIds: catalogItemIds.size ? catalogItemIds : null,
        // Coûts menu items (map partagée du store analyse) → Miss € au coût.
        unitCostByItemId: this.store.state.analyse?.menuItemCostMap || {},
        elementNameById,
        itemNameById,
      })

      // Contexte de fabrication archivé avec le document (BUG-238/241/Q35) : sans
      // lui, un écart dû à une source manquante est indiscernable d'un manquant.
      const meta = {
        preEventSource,
        salesSource,
        // Les mouvements de la fenêtre sont-ils entrés dans `leftFromSales` ?
        // Un document sans ce terme n'est pas faux, il est moins précis — encore
        // faut-il pouvoir le savoir en le relisant six mois plus tard.
        movementsSource: movementUnitsByKey
          ? 'post-event-baseline'
          : preEventSource === 'pre-event'
            ? 'none'
            : 'skipped-legacy-baseline',
        salesUnjoined:
          unjoinedShops.size || unjoinedItems.size
            ? {
                shopNames: [...unjoinedShops].slice(0, 50),
                itemNames: [...unjoinedItems].slice(0, 50),
                units: Math.round(unjoinedUnits * 100) / 100,
              }
            : null,
        countedProgress: [
          Number(this.inventoryStats?.countedItems) || 0,
          Number(this.inventoryStats?.totalItems) || 0,
        ],
      }
      return { lines, meta }
    },
    /** Sélection d'un document depuis le drawer mobile : fermer le drawer puis
     *  ouvrir la vue réconciliation (fiche 236). */
    onDrawerSelectReconciliation(id) {
      this.filterDrawerOpen = false
      this.selectedReconciliationId = id
    },
    /** Suppression d'un document (« repartir de zéro » : supprimer puis recliquer
     *  « Générer la réconciliation » — le document est une photo figée, pas
     *  d'édition). Confirmation obligatoire : suppression définitive. */
    async onDeleteReconciliation(id) {
      const doc = this.reconciliations.find((r) => r.id === id)
      const ok = await confirmDialog({
        title: this.t('invRecoDeleteTitle'),
        message: `${doc?.eventName || this.t('invRecoUnknownEvent')} — ${this.t('invRecoDeleteMsg')}`,
        confirmText: this.t('invRecoDeleteConfirm'),
        cancelText: this.t('invClose'),
        confirmColor: 'error',
        icon: 'mdi-trash-can-outline',
        iconColor: 'error',
      })
      if (!ok) return
      try {
        // Démo : documents locaux (demo-*) jamais persistés → pas d'appel API.
        if (!isDemoMode() && !String(id).startsWith('demo-')) {
          await deleteInventoryReconciliation(this.route.params.spaceId, id)
        }
        this.reconciliations = this.reconciliations.filter((r) => r.id !== id)
        if (this.selectedReconciliationId === id) this.selectedReconciliationId = null
      } catch (e) {
        console.warn('[SpaceInventory] suppression réconciliation KO:', e?.message)
        this.errorText = e?.userMessage || this.t('invRecoDeleteError')
        this.errorSnackbar = true
      }
    },
    async loadReconciliations(spaceId) {
      if (!spaceId || isDemoMode()) return
      this.recoLoading = true
      try {
        const rows = await listInventoryReconciliations(spaceId)
        this.reconciliations = Array.isArray(rows) ? rows : []
      } catch (e) {
        // Non bloquant : la section affiche « aucune » ; le comptage reste utilisable.
        console.warn('[SpaceInventory] chargement réconciliations KO:', e?.message)
      } finally {
        this.recoLoading = false
      }
    },
    closeMobileCounting() {
      this.mobileCountingOpen = false
      this.countingShop = null
    },
    resetFilters() {
      this.search = ''
      this.countingStatusTab = 'to-count'
    },
    /** Navigation vers un autre outil — miroir de handleToolboxChange React. */
    onToolboxSelect(value) {
      const tool = TOOLBOX_ITEMS.find((item) => item.value === value)
      if (tool) this.navigateToTool(tool)
    },
    navigateToTool(tool) {
      // Garde d'auto-navigation : chaque mode ignore SA propre entrée mais peut
      // basculer vers l'autre inventaire.
      const selfValue = this.isPreMode ? 'space-pre-inventory' : 'space-inventory'
      if (tool.value === selfValue) return
      const spaceId = this.route.params.spaceId
      // #7 — on propage l'event courant pour garder le contexte sur Réarmement
      // (source d'objectif) et Event Predict (event présélectionné).
      const ev = this.selectedEventId || null
      if (tool.value === 'space-inventory' || tool.value === 'space-pre-inventory') {
        // Bascule pre↔post. Pas de ?event= : chaque mode résout SON ancre
        // (post = contexte courant/passé récent, pre = prochain futur) — propager
        // un event futur vers post (ou passé vers pre) serait rejeté de toute façon.
        this.router.push({ name: tool.value, params: { spaceId } })
      } else if (tool.value === 'analyse') {
        this.router.push({ name: 'space-analyse', params: { spaceId } })
      } else if (tool.value === 'live') {
        // Live = route DÉDIÉE `space-live` (pas un mode `?toolbox=`, cf.
        // router/index.js) : sans cette branche le `else` ci-dessous envoyait
        // sur Analyse avec un toolbox inconnu.
        this.router.push({ name: 'space-live', params: { spaceId } })
      } else if (tool.value === 'logistic') {
        this.router.push({ name: 'space-logistic', params: { spaceId }, query: ev ? { event: ev } : {} })
      } else if (tool.value === 'restock') {
        this.router.push({ name: 'space-restock', params: { spaceId }, query: ev ? { event: ev } : {} })
      } else {
        // predict, event-predict → AnalyseView consomme ?toolbox=<value>
        const query = { toolbox: tool.value }
        if (ev) query.event = ev
        this.router.push({ name: 'space-analyse', params: { spaceId }, query })
      }
    },
  },
  watch: {
    // Échec de sync inventaire (upsert/save) remonté par le store → toast, puis reset.
    inventoryError(msg) {
      if (!msg) return
      this.errorText = msg
      this.errorSnackbar = true
      this.store.commit('inventory/SET_ERROR', null)
    },
    countingShop(newValue) {
      if (!this.isMobile) return
      this.mobileCountingOpen = !!newValue
    },
    isMobile(newValue) {
      if (!newValue) {
        this.mobileCountingOpen = false
      } else if (this.countingShop) {
        this.mobileCountingOpen = true
      }
    },
    // Changement d'onglet : les facettes articles sont partagées shops/storage →
    // on les vide pour éviter un filtrage croisé invisible (recherche + statut gardés).
    activeTab() {
      this.shopStatusFilter = 'all'
      this.clearFacetSelections()
    },
    // #9 — si l'onglet Merch est masqué (module désactivé), ne pas y rester.
    visibleTopTabs(tabs) {
      if (!tabs.some((tab) => tab.value === this.activeTab)) this.activeTab = 'shops'
    },
    // Arrivée tardive des données store (events/configurations) alors qu'on est
    // resté sur « aucun contexte » : re-tente la résolution (guardé dans la
    // méthode contre les boucles — no-op si loading ou contexte déjà résolu).
    events() { this.retryResolveIfEmptyContext() },
    configurations() { this.retryResolveIfEmptyContext() },
    // Un SEUL watcher route : recharge sur changement d'espace OU d'event (même
    // route nommée → mounted ne re-tourne pas). `immediate` couvre le montage,
    // donc mounted n'appelle plus loadForSpace (pas de double-load).
    routeContextKey: {
      immediate: true,
      async handler() {
        this.countingShop = null
        this.search = ''
        await this.loadForSpace(this.route?.params?.spaceId)
      },
    },
  },
  mounted() {
    this.updateViewportMode()
    window.addEventListener('resize', this.updateViewportMode)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.updateViewportMode)
  },
}
</script>

<style scoped>
.space-inventory-view {
  --si-bg: var(--fb-bg, #f6f8fb); /* fond unifié EventPredict */
  --si-surface: var(--fb-surface, #FFFFFF);
  --si-subtle: var(--fb-subtle, #FAFAFA);
  --si-border: var(--fb-border, #E5E7EB);
  --si-text: var(--fb-text, #212121);
  --si-muted: var(--fb-muted, #6B7280);
  --si-faint: var(--fb-faint, #9CA3AF);
  --si-primary: #ff3131;
  --si-primary-soft: var(--fb-primary-soft, #FFF5F5);
  --primary: #ff3131;
  --background: var(--fb-surface, #FFFFFF);
  --foreground: var(--fb-text, #212121);
  --muted: var(--fb-subtle, #FAFAFA);
  --muted-foreground: var(--fb-muted, #6B7280);
  --border: var(--fb-border, #E5E7EB);

  /* Sous la barre WorkspaceAppHeader (64px) dans <v-main>. */
  min-height: calc(100vh - 64px);
  background: var(--si-bg);
  color: var(--si-text);
}

.si-header {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 84px;
  padding: 10px 24px;
  background: var(--si-surface);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
  position: sticky;
  top: 0;
  z-index: 30;
  flex-wrap: wrap;
  transition: box-shadow 160ms ease, border-color 160ms ease;
}
.si-back {
  width: 40px; height: 40px;
  border-radius: 8px;
  border-color: transparent !important;
  background: transparent !important;
  display: inline-flex; align-items: center; justify-content: center;
  cursor: pointer;
}
.si-back:hover { background: rgba(0, 0, 0, 0.04) !important; }
.si-header-text { flex: 1; min-width: 200px; }
.si-title { margin: 0; font-size: 16px; font-weight: 700; color: var(--si-text); }
.si-title-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.si-title-sep { color: var(--si-border); font-size: 1.1rem; }
.si-space-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 0;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 700;
  color: var(--si-text);
  transition: background-color 120ms ease;
}
.si-space-trigger:hover { background: rgba(0, 0, 0, 0.04); }
.si-space-name { white-space: nowrap; }
.si-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-left: auto; }
.si-mobile-filter-btn,
.si-mobile-options-btn { display: none; }
.si-event-select { min-width: 170px; max-width: 220px; }
.si-search-field { min-width: 160px; max-width: 220px; }
.si-config-chip { flex: 0 0 auto; font-weight: 600; }
.si-actions :deep(.v-btn) {
  border-radius: 8px;
  text-transform: none;
  font-weight: 600;
}
.si-search-field :deep(.v-field) {
  border-radius: 10px;
  background: #f9fafb;
  transition: border-color 0.2s ease;
}
.si-search-field :deep(.v-field:hover),
.si-search-field :deep(.v-field--focused) {
  border-color: var(--si-primary);
}
.si-save-btn { text-transform: none; font-weight: 700; }
.si-save-progress {
  margin-left: 8px;
  padding: 0 7px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.25);
  font-size: 0.72rem;
  font-weight: 800;
  line-height: 1.5;
}
.si-save-progress-done { background: rgba(22, 163, 74, 0.9); color: #fff; }

.si-mobile-actions-sheet {
  border-radius: 16px 16px 0 0;
}
.si-mobile-actions-content {
  display: grid;
  gap: 12px;
}
.si-mobile-sheet-block {
  display: grid;
  gap: 8px;
}
.si-mobile-sheet-label {
  font-size: 0.74rem;
  font-weight: 800;
  color: var(--si-muted);
  text-transform: uppercase;
  letter-spacing: 0;
}
.si-mobile-toolbox {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.si-mobile-tool {
  appearance: none;
  min-height: 38px;
  border: 1px solid var(--si-border);
  border-radius: 8px;
  background: var(--si-surface);
  color: var(--si-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 8px;
  font-size: 12px;
  font-weight: 750;
}
.si-mobile-tool-active {
  background: var(--si-primary-soft);
  color: var(--si-primary);
  border-color: rgba(255, 49, 49, 0.28);
}
.si-mobile-sheet-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.si-mobile-sheet-actions :deep(.v-btn) {
  min-width: 0;
  border-radius: 8px;
  text-transform: none;
  font-weight: 700;
}

/* Stat strip inline (remplace les 4 cartes métriques — gain vertical) */
.si-statstrip {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 0;
  background: transparent;
  border: 0;
  border-radius: 0;
  margin: 8px 24px 10px;
}
.si-stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  padding: 4px 9px;
  border: 1px solid var(--si-border);
  border-radius: 8px;
  background: var(--si-surface);
  font-size: 11px;
  color: var(--si-muted);
}
.si-stat-value {
  color: var(--si-text);
  font-size: 12px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  /* Toolbox navigation bar (parité React sidebar toolbox selector) */

}
.si-stat-label {
  font-style: normal;
  font-weight: 600;
  letter-spacing: 0;
}

/* Toolbox navigation bar (parité React sidebar toolbox selector) */
.si-toolbox-nav {
  display: flex; gap: 5px; flex-wrap: wrap;
  margin: 12px 24px 8px;
}

.si-toolbox-select-row {
  width: min(320px, calc(100% - 48px));
  margin: 18px 24px 4px;
}

@media (max-width: 700px) {
  .si-toolbox-select-row {
    width: auto;
    margin: 14px 16px 4px;
  }
}
.si-toolnav-btn {
  appearance: none; border: 1px solid var(--si-border);
  background: var(--si-surface); padding: 6px 10px;
  border-radius: 8px; font-size: 11px; font-weight: 700;
  color: var(--si-muted); cursor: pointer;
  display: inline-flex; align-items: center;
  transition: background 0.1s, color 0.1s;
}
.si-toolnav-btn:hover { background: var(--si-subtle); }
.si-toolnav-btn-active {
  background: var(--si-primary-soft); color: var(--si-primary); border-color: rgba(255, 49, 49, 0.28);
  pointer-events: none;
}

.si-segrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--si-border);
  margin: 0 24px 8px;
}
.si-tabs {
  display: flex;
  gap: 4px;
  border-bottom: none;
  margin-bottom: 0;
}
.si-tab {
  display: inline-flex; align-items: center;
  min-height: 40px;
  padding: 8px 10px;
  border: none; background: transparent;
  font-size: 13px; font-weight: 600;
  color: var(--si-muted); cursor: pointer;
  border-bottom: 2px solid transparent;
}
.si-tab-active { color: var(--si-primary); border-bottom-color: var(--si-primary); }
.si-tab-count { color: var(--si-faint); font-weight: 500; margin-left: 4px; }

.si-substatus {
  display: inline-flex; gap: 6px;
  background: var(--si-subtle); padding: 3px;
  border: 1px solid var(--si-border);
  border-radius: 8px; margin-bottom: 0;
}
.si-substatus-btn {
  appearance: none; border: none; background: transparent;
  padding: 4px 10px;
  font-size: 12px; font-weight: 600;
  color: var(--si-muted);
  border-radius: 8px; cursor: pointer;
  display: inline-flex; align-items: center; gap: 6px;
}
.si-substatus-btn-active {
  background: var(--si-surface); color: var(--si-primary);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
}
.si-substatus-count {
  background: rgba(15, 23, 42, 0.08);
  border-radius: 999px;
  padding: 0 6px;
  font-size: 0.7rem;
}
.si-substatus-help {
  color: #94a3b8;
  cursor: help;
  margin-left: 2px;
  align-self: center;
}
.si-substatus-help:hover { color: #475569; }
/* Variante colonne gauche : segmented pleine largeur (déplacé du bandeau). */
.si-substatus--side {
  display: flex;
  width: 100%;
}
.si-substatus--side .si-substatus-btn { flex: 1 1 0; justify-content: center; }

/* ============ Bandeau rouge « Space Menus » (onglets + pills + recherche) ======
   Calque visuel de SpaceMenuView (.smv-*) : fond rouge charte, contrôles blancs
   translucides. Rouge dans les deux thèmes (parité Space Menus). */

.si-segrow--band {
    border-bottom: none;
    /* Bas carré : le search bar vient s'y coller juste en dessous. */
    border-radius: 12px 12px 0 0;
    padding: 15px;
    margin: 0;
    background: #ff3131;
    flex-wrap: wrap;
    gap: 12px;
    border: none !important;
    /* Épinglé au scroll sous le header blanc (miroir .ede-summary EventPredict). */
    position: sticky;
    top: 0;
    z-index: 20;
}
/* Sous-navigation (onglets + tri) sous la recherche, hors bandeau rouge —
   parité Logistique (.lg-tabs / .lg-sort-bar). */
.si-subnav { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.si-subnav .si-tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--si-border); }
.si-subnav .si-tab {
  display: inline-flex; align-items: center;
  padding: 8px 14px; border: 0; background: transparent;
  border-radius: 0 !important;
  color: var(--si-muted); font-weight: 600; font-size: 0.85rem; cursor: pointer;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
}
.si-subnav .si-tab-active { color: var(--si-primary); border-bottom-color: var(--si-primary); }
.si-subnav .si-tab-count { color: var(--si-faint); font-weight: 500; margin-left: 4px; }
.si-sort-bar { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.si-sort-label {
  font-size: 0.72rem; font-weight: 700; color: var(--si-muted);
  text-transform: uppercase; letter-spacing: 0.03em; margin-right: 2px;
}
.si-sort-chip {
  display: inline-flex; align-items: center; gap: 5px;
  padding: 5px 12px; border: 1px solid var(--si-border); border-radius: 100px;
  background: var(--si-surface); color: var(--si-muted);
  font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: all 0.15s ease;
}
.si-sort-chip:hover { border-color: var(--si-primary); color: var(--si-primary); }
.si-sort-chip-active { background: var(--si-primary); border-color: var(--si-primary); color: #fff; }
.si-sort-chip-count {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px; border-radius: 100px;
  background: rgba(15, 23, 42, 0.08); font-size: 0.7rem;
}
.si-sort-chip-active .si-sort-chip-count { background: rgba(255, 255, 255, 0.25); }
.si-sort-sep { width: 1px; height: 20px; background: var(--si-border); margin: 0 4px; }

/* Titre du bandeau (blanc, parité .av-header__title). */
.si-band-title { min-width: 0; margin-right: auto; }
.si-band-title__main { margin: 0; font-size: 20px; font-weight: 800; color: #fff; line-height: 1.2; }
.si-band-title__sub { margin: 2px 0 0; font-size: 12.5px; color: rgba(255, 255, 255, 0.78); }
.si-band-title__event { font-weight: 700; color: #fff; }
.si-band-title__anchor { opacity: 0.82; }
.si-band-title__warn { opacity: 0.95; font-weight: 600; }
/* Search bar collé sous le bandeau, même largeur (colonne centre). */
.si-carried-alert { margin: 10px 0 0; font-size: 13px; }
.si-search-wrap {
  margin: 0 0 16px;
}
.si-search-wrap :deep(.appsb) {
  border-bottom: 0;
  border-radius: 0 0 12px 12px;
  overflow: hidden;
}
.si-segrow--band .si-tabs { flex: 0 0 auto; }
/* Onglets → segmented toggle blanc translucide */
.--band .si-tabs {
  gap: 2px;
  padding: 3px;
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.15);
}
.si-segrow--band .si-tab {
  /* Taille/radius/padding = chips .si-status-pill (uniformité bandeau). */
  min-height: 0;
  padding: 5px 12px;
  border-bottom: none;
  border-radius: 100px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 600;
}
.si-segrow--band .si-tab:hover { color: #fff; }
.si-segrow--band .si-tab-active {
  border-bottom: none;
  background: #fff;
  color: #ff3131;
  font-weight: 700;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.si-segrow--band .si-tab-count { color: inherit; opacity: 0.7; }
/* Élément actif : texte rouge charte, franc (count non fadé). */
.si-segrow--band .si-tab-active,
.si-segrow--band .si-tab-active .si-tab-count {
  color: #ff3131;
  opacity: 1;
}

.si-band-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: nowrap;
  /* Occupe la largeur restante à droite des onglets, la recherche s'étire. */
  flex: 1 1 auto;
  min-width: 0;
  justify-content: space-between;
}
.si-band-right .si-status-pills,
.si-band-right .si-substatus { flex: 0 0 auto; }

/* Toggle du panneau de filtres (icône drawer, à gauche du bandeau rouge). */
.si-band-toggle {
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  margin-right: 10px;
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}
.si-band-toggle:hover { background: rgba(255, 255, 255, 0.34); }
.si-band-toggle:active { transform: scale(0.94); }
.si-band-toggle:focus-visible { outline: 2px solid rgba(255, 255, 255, 0.85); outline-offset: 2px; }

/* Print + Save déplacés dans le bandeau : pilules blanches sur rouge. */
.si-band-right .si-band-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
.si-band-btn {
  /* Même skin/taille que les chips .si-status-pill (padding 5px 12px, 12.5px). */
  border: 1.5px solid rgba(255, 255, 255, 0.3) !important;
  background: rgba(255, 255, 255, 0.12) !important;
  color: #fff !important;
  border-radius: 100px !important;
  min-height: 0 !important;
  height: auto !important;
  padding: 5px 12px !important;
  font-size: 12.5px !important;
  text-transform: none;
  font-weight: 600;
  white-space: nowrap;
}
.si-band-btn :deep(.v-icon) { color: #fff !important; }
.si-band-btn:hover { background: #fff !important; color: #ff3131 !important; }
.si-band-btn:hover :deep(.v-icon) { color: #ff3131 !important; }
.si-band-btn--save { background: #fff !important; color: #ff3131 !important; }
.si-band-btn--save :deep(.v-icon) { color: #ff3131 !important; }
.si-band-btn--save:hover { background: rgba(255, 255, 255, 0.9) !important; color: #ff3131 !important; }

/* Équivalent mobile (< 900px, cf. isMobile JS) du toggle filtres / des boutons
   Update Logistic + Save — masqués par défaut, activés dans le bloc @media
   plus bas. Desktop garde les pilules complètes avec libellé. */
.si-mobile-tools-trigger {
  display: none;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  cursor: pointer;
  color: #fff;
}
.si-mobile-tools-trigger:active { transform: scale(.94); }
.si-menu-item-progress { margin-left: 6px; opacity: .65; font-variant-numeric: tabular-nums; }

@media (max-width: 900px) {
  .si-toggle--desktop { display: none; }
  .si-mobile-tools-trigger { display: flex; }
  .si-band-btn--desktop { display: none; }

  /* Tout le bandeau (hamburger + titre + actions) sur une seule ligne au lieu
     de 2 (titre/sous-titre puis, en dessous, Print/⋮/▶) — retour utilisateur.
     Le titre/sous-titre s'ellipsent plutôt que de forcer un retour à la ligne. */
  .si-segrow--band {
    flex-wrap: nowrap;
    align-items: center;
    padding: 12px;
    gap: 8px;
  }
  /* Titre + sous-titre event ré-empilés (comme la maquette) : ce qui manquait
     de place, c'était le BANDEAU entier qui prenait 3 rangées (hamburger seul,
     titre seul, icônes seules) à cause du flex-wrap:wrap plus bas dans ce
     fichier (cf. .si-segrow--band ci-dessus, maintenant nowrap) — pas le fait
     que titre/event soient sur 2 lignes l'un sous l'autre. */
  .si-band-title {
    min-width: 0;
    overflow: hidden;
  }
  .si-band-title__main {
    font-size: 15px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .si-band-title__sub {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .si-band-right { flex: 0 0 auto; }
  .si-band-actions { flex-wrap: nowrap; gap: 6px; }
}

/* Pills ouvert / fermé */
.si-status-pills { display: flex; gap: 6px; }
.si-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border: 1.5px solid rgba(255, 255, 255, 0.3);
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 12.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  transition: all 0.2s;
}
.si-status-pill:hover { background: rgba(255, 255, 255, 0.22); color: #fff; }
.si-status-pill.active {
  background: #fff;
  border-color: #fff;
  color: #ff3131;
  font-weight: 700;
}
.si-status-pill--closed.active { background: rgba(255, 255, 255, 0.92); color: #374151; }
.si-status-pill-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 100px;
  background: rgba(255, 255, 255, 0.25);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
}
.si-status-pill.active .si-status-pill-count { background: rgba(255, 49, 49, 0.15); color: #ff3131; }
.si-status-pill--closed.active .si-status-pill-count { background: rgba(55, 65, 81, 0.15); color: #374151; }

/* Sous-statuts comptage sur le bandeau */
.si-segrow--band .si-substatus {
  background: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.25);
}
.si-segrow--band .si-substatus-btn { color: rgba(255, 255, 255, 0.85); }
.si-segrow--band .si-substatus-btn:hover { color: #fff; }
.si-segrow--band .si-substatus-btn-active { background: #fff; color: #ff3131; }
.si-segrow--band .si-substatus-count { background: rgba(255, 255, 255, 0.25); color: #fff; }
.si-segrow--band .si-substatus-btn-active .si-substatus-count { background: rgba(255, 49, 49, 0.15); color: #ff3131; }
.si-segrow--band .si-substatus-help { color: rgba(255, 255, 255, 0.7); }
.si-segrow--band .si-substatus-help:hover { color: #fff; }

/* Recherche PdV/articles — géométrie alignée sur la ref Menu Items/Market Price
   (rounded-md 8px, 36px, pleine largeur, icône à gauche) ; reste translucide/charte. */
.si-band-search {
  position: relative; display: flex; align-items: center;
  /* S'étire pour remplir l'espace restant sur la ligne unique. */
  flex: 1 1 220px; min-width: 150px;
}
.si-band-search-icon {
  position: absolute;
  left: 11px;
  color: rgba(255, 255, 255, 0.85);
  pointer-events: none;
}
.si-band-search-input {
  width: 100%;
  height: 36px;
  padding: 0 34px 0 34px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 13px;
  outline: none;
  transition: all 0.18s;
}
.si-band-search-input::placeholder { color: rgba(255, 255, 255, 0.7); }
.si-band-search-input:focus {
  border-color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.24);
}
.si-band-search-clear {
  position: absolute;
  right: 8px;
  display: inline-flex;
  align-items: center;
  padding: 2px;
  border: none;
  background: none;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
}
.si-band-search-clear:hover { color: #fff; }

.si-body {
  display: grid;
  grid-template-columns: 1fr;
  gap: 18px;
  /* Marge top = les 3 colonnes démarrent à la même hauteur (parité EP 18px). */
  margin: 18px 24px 24px;
}
@media (min-width: 1100px) {
  /* Desktop : page hauteur fixe, en-tête + onglets fixes, chaque colonne
     scroll indépendamment (point capital de la demande).
     La page vit maintenant dans <v-main> sous la barre (WorkspaceAppHeader,
     64px) → on retranche cette hauteur pour ne pas déborder. */
  .space-inventory-view {
    height: calc(100vh - 64px);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 0;
  }
  .si-header,
  .si-toolbox-nav,
  .si-segrow { flex: 0 0 auto; }
  .si-body {
    grid-template-columns: minmax(0, 1fr) 340px;
    flex: 1 1 auto;
    min-height: 0;
  }
  /* 3 colonnes quand le panneau de filtres gauche est monté (onglet Boutiques).
     Dimensions alignées sur la grille de référence EventPredict (292/1fr/340). */
  .si-body.si-body-with-filters {
    grid-template-columns: 292px minmax(0, 1fr) 340px;
  }
  .si-left-filters {
    max-height: 100%;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
  }
  .si-main {
    overflow-y: auto;
    max-height: 100%;
    padding-right: 4px;
    scrollbar-width: thin;
    scrollbar-color: #D1D5DB transparent;
  }
}
/* Le panneau gauche n'apparaît qu'en desktop (showLeftFilters gère le v-if,
   mais on cache aussi en CSS pour les cas intermédiaires de breakpoint). */
@media (max-width: 1099px) {
  .si-left-filters { display: none; }
}
.si-main { min-width: 0; }
.si-aggregate {
  /* Carte résumé droite = look EventPredict. */
  background: var(--si-surface);
  border: 1px solid var(--si-border);
  border-radius: 18px;
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.04));
  overflow: hidden;
}
/* Colonne droite : le segmented reste en tête, la carte agrégat prend le reste
   et scrolle. */
.si-aggregate-col { min-height: 0; }
.si-aggregate-col .si-aggregate { flex: 1 1 auto; min-height: 0; }
@media (min-width: 1100px) {
  .si-aggregate-col { max-height: 100%; }
  .si-aggregate {
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: #D1D5DB transparent;
  }
}
.si-main::-webkit-scrollbar { width: 8px; }
.si-main::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px; }
.si-main::-webkit-scrollbar-track { background: transparent; }
.si-aggregate::-webkit-scrollbar { width: 8px; }
.si-aggregate::-webkit-scrollbar-thumb {
  background: #D1D5DB; border-radius: 4px;
}
.si-aggregate::-webkit-scrollbar-track { background: transparent; }

.si-empty {
  text-align: center; padding: 40px 20px; color: var(--si-muted);
  background: var(--si-surface);
  border: 1px solid var(--si-border);
  border-radius: 8px;
}
.si-skeleton {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.si-skeleton-card {
  min-height: 126px;
  padding: 14px;
  background: var(--si-surface);
  border: 1px solid var(--si-border);
  border-radius: 8px;
}
.si-skeleton-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.si-skeleton-copy {
  flex: 1;
  display: grid;
  gap: 8px;
  min-width: 0;
}
.si-skeleton-dot,
.si-skeleton-pill,
.si-skeleton-line {
  display: block;
  border-radius: 999px;
  background: linear-gradient(90deg, #EEEEEE 0%, #F7F7F7 42%, #EEEEEE 78%);
  background-size: 220% 100%;
  animation: si-shimmer 1.3s ease-in-out infinite;
}
.si-skeleton-dot {
  width: 42px;
  height: 42px;
  border-radius: 8px;
}
.si-skeleton-pill {
  width: 72px;
  height: 22px;
}
.si-skeleton-line {
  width: 100%;
  height: 9px;
}
.si-skeleton-line-title {
  width: 48%;
  height: 12px;
}
.si-skeleton-line-short { width: 30%; }
.si-skeleton-line-mid { width: 64%; }
.si-skeleton-bars {
  display: grid;
  gap: 9px;
  margin-top: 16px;
}
@keyframes si-shimmer {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}
.si-empty h3 { margin: 12px 0 4px; color: var(--si-text); }
.si-empty p { margin-bottom: 14px; }

.si-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ── Carousel boutiques (mobile) : une carte à la fois + points de progression ── */
.si-shop-carousel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.si-shop-carousel-window {
  /* Hauteur stable pour éviter un saut entre cartes de tailles différentes. */
  min-height: 150px;
}
/* Laisse respirer la bordure de la carte dans la fenêtre qui rogne (overflow). */
.si-shop-carousel-window :deep(.v-window-item) {
  padding: 2px;
}
.si-shop-carousel-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
}
.si-shop-carousel-count {
  min-width: 92px;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--si-muted);
}
.si-shop-carousel-count strong {
  color: #ff3131;
  font-weight: 800;
}
.si-card {
  background: var(--si-surface);
  border: 1px solid var(--si-border);
  /* Aligné Components Library : rounded-xl (~16px) + ombre subtile. */
  border-radius: 16px;
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.04));
  transition: box-shadow 0.3s ease;
  padding: 14px;
  display: flex; flex-direction: column; gap: 10px;
  min-height: 164px;
}
.si-card:hover {
  box-shadow: var(--fb-shadow-hover, 0 4px 20px rgba(0, 0, 0, 0.08));
}
.si-card-head {
  display: flex; justify-content: space-between; align-items: flex-start;
  gap: 10px;
}
.si-card-name { margin: 0; font-size: 1rem; font-weight: 700; color: var(--si-text); }
.si-card-meta { margin: 2px 0 0; font-size: 0.75rem; color: var(--si-faint); }
.si-card-status {
  font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
  flex-shrink: 0;
}
.si-status-ok        { background: #dcfce7; color: #166534; }
.si-status-progress  { background: #fef3c7; color: #92400e; }
.si-status-pending   { background: #EEEEEE; color: var(--si-muted); }
.si-card-meta-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: 0.8rem; color: var(--si-muted);
}
.si-btn {
  appearance: none; border: 1px solid var(--si-border);
  background: var(--si-surface); padding: 6px 12px;
  border-radius: 8px; font-size: 0.85rem; font-weight: 600;
  cursor: pointer;
}
.si-btn:hover { background: var(--si-subtle); }
.si-btn-primary {
  background: var(--si-primary); color: #fff; border-color: var(--si-primary);
}
.si-btn-primary:hover { background: #b92829; }
.si-btn-primary:disabled {
  background: #D1D5DB; border-color: #D1D5DB; cursor: not-allowed;
}
.si-btn-ghost {
  background: transparent; color: var(--si-muted); border: none;
}
.si-card-items {
  margin: 0; padding-left: 18px;
  font-size: 0.8rem; color: var(--si-muted);
  display: flex; flex-direction: column; gap: 2px;
}
.si-card-storagetype { color: var(--si-faint); font-size: 0.7rem; }
.si-card-more { color: var(--si-faint); }

/* Counting interface styles vivent dans InventoryCountingInterface.vue
   (scoped là-bas pour pouvoir s'appliquer aux éléments du composant). */

@media (max-width: 900px) {
  .space-inventory-view { padding: 0; }
  .si-header {
    min-height: auto;
    padding: 12px 16px;
    align-items: flex-start;
  }
  .si-toolbox-nav,
  .si-statstrip,
  .si-segrow,
  .si-body {
    margin-left: 16px;
    margin-right: 16px;
  }
  .si-statstrip { margin-top: 10px; }
  /* Pas d'espace entre le header app et le bandeau rouge (retour utilisateur) :
     .si-body garde 18px de margin-top en desktop (base rule), annulé ici. */
  .si-body { margin-top: 0; margin-bottom: 16px; }
  .si-mobile-filter-btn,
  .si-mobile-options-btn { display: inline-flex; }
  .si-actions { width: 100%; margin-left: 0; }
  .si-event-select, .si-search-field { width: 100%; max-width: none; min-width: 0; }
  .si-tabs { overflow-x: auto; }
  .si-substatus { max-width: 100%; overflow-x: auto; }
  /* Bandeau rouge : reste sur 1 seule ligne (hamburger + titre/event + icônes),
     PAS de retour à la ligne — retour utilisateur. Remplace le flex-wrap:wrap
     posé ci-dessus. Marge NÉGATIVE (pas juste 0) : .si-body (son ancêtre,
     règle juste au-dessus) garde ses 16px de marge gauche/droite sur mobile —
     annuler seulement la marge PROPRE du bandeau ne suffit pas à le sortir de
     cet retrait hérité. -16px compense exactement pour un bandeau plein-bord,
     collé aux 2 bords de l'écran, sans toucher au reste (recherche/tabs/cartes
     qui gardent leur retrait normal). */
  .si-segrow--band {
    flex-wrap: nowrap;
    margin-left: -16px;
    margin-right: -16px;
    border-radius: 0;
  }
  .si-band-right { flex-wrap: nowrap; }
  .si-band-search { flex-basis: 100%; }
}

@media (max-width: 640px) {
  .si-title,
  .si-space-trigger {
    font-size: 14px;
  }
  .si-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .si-demo-btn,
  .si-print-btn,
  .si-toolbox-nav {
    display: none;
  }
  .si-mobile-filter-btn,
  .si-mobile-options-btn,
  .si-save-btn,
  .si-print-btn {
    width: 100%;
  }
  .si-save-btn {
    grid-column: 1 / -1;
  }
  .si-event-select,
  .si-search-field {
    display: none;
  }
  .si-stat {
    flex: 1 1 calc(50% - 8px);
    justify-content: center;
  }
  .si-segrow {
    gap: 8px;
    border-bottom: 0;
  }
  .si-tabs,
  .si-substatus {
    width: 100%;
    overflow-x: auto;
  }
  .si-tab {
    min-height: 36px;
    border: 1px solid var(--si-border);
    border-radius: 8px;
    background: var(--si-surface);
    padding: 7px 10px;
  }
  .si-tab-active {
    background: var(--si-primary-soft);
  }
  .si-tab {
    white-space: nowrap;
  }
  .si-save-progress {
    margin-left: 5px;
    padding: 0 6px;
  }
  .si-mobile-sheet-actions {
    grid-template-columns: 1fr;
  }
}

/* ── Impression PDF (window.print) ─────────────────────────────── */
.si-print { display: none; }
.si-print-head h1 { font-size: 1.4rem; margin: 0 0 4px; }
.si-print-sub { font-size: 0.9rem; color: #6B7280; margin-bottom: 16px; }
.si-print-block { margin-bottom: 18px; }
.si-print-block h2 { font-size: 1.05rem; margin: 0 0 6px; }
.si-print-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-bottom: 8px; }
.si-print-table th, .si-print-table td { border: 1px solid #EEEEEE; padding: 4px 8px; text-align: left; }
.si-print-table th { background: #FAFAFA; }
.si-print-empty { color: #6B7280; }

@media print {
  body * { visibility: hidden; }
  .si-print, .si-print * { visibility: visible; }
  .si-print {
    display: block !important;
    position: absolute;
    left: 0;
    top: 0;
    width: 100%;
    padding: 0;
  }
  .si-print-block { page-break-inside: avoid; }
}

/* Final F&B visual contract. */
.si-header {
  border-bottom-color: var(--si-border);
  box-shadow: 0 1px 0 var(--si-border);
}
.si-title {
  color: var(--si-text);
  font-size: 1rem;
  font-weight: 750;
  letter-spacing: -0.01em;
}
.si-actions :deep(.v-btn),
.si-actions :deep(.v-field),
.si-back,
.si-toolnav-btn,
.si-tab,
.si-substatus-btn,
.si-btn {
  border-radius: var(--fb-radius-control, 8px) !important;
}
.si-actions :deep(.v-btn) {
  min-height: 36px;
  font-weight: 650;
  letter-spacing: 0;
  text-transform: none;
}
.si-actions :deep(.v-field) {
  border-color: var(--si-border);
  background: var(--si-surface);
}
.si-actions :deep(.v-btn:focus-visible),
.si-back:focus-visible,
.si-toolnav-btn:focus-visible,
.si-tab:focus-visible,
.si-substatus-btn:focus-visible,
.si-btn:focus-visible {
  outline: 3px solid rgba(255, 49, 49, 0.18);
  outline-offset: 2px;
}
.si-save-btn {
  background: var(--si-primary) !important;
  color: #FFFFFF !important;
  box-shadow: 0 2px 8px rgba(255, 49, 49, 0.22);
}
.si-save-btn:hover {
  background: var(--fb-primary-hover, #ff3131) !important;
}
.si-toolnav-btn,
.si-tab,
.si-substatus-btn {
  transition: background-color 0.18s ease, border-color 0.18s ease, color 0.18s ease;
}
.si-card,
.si-skeleton-card {
  border-color: var(--si-border);
  border-radius: var(--fb-radius-card, 16px);
  background: var(--si-surface);
  box-shadow: var(--fb-shadow-card);
}
.si-card:hover {
  box-shadow: var(--fb-shadow-hover);
}
.si-card-name,
.si-stat strong,
.si-card-meta-row strong,
.si-tab-count,
.si-substatus-count {
  font-variant-numeric: tabular-nums;
}
.si-status-ok {
  background: var(--fb-success-soft, #F0FDF4);
  color: var(--fb-success, #16A34A);
}
.si-status-progress {
  background: var(--fb-warning-soft, #FFFBEB);
  color: var(--fb-warning, #D97706);
}
.si-status-pending {
  background: var(--si-subtle);
  color: var(--si-muted);
}

.v-theme--dataFridayDark .space-inventory-view .si-header,
.v-theme--dataFridayDark .space-inventory-view .si-card {
  background: var(--si-surface);
  color: var(--si-text);
}

/* Bandeau de section : même contrat visuel que Event Predict / Space Menus. */
.si-header,
.v-theme--dataFridayDark .space-inventory-view .si-header {
  position: relative;
  top: auto;
  z-index: 20;
  min-height: 82px;
  margin: 0;
  padding: 10px;
  border: 0;
  border-radius:0px;
  background:  #ff3131;
  color: #fff;
}

.si-title {
  color: #fff;
  font-size: 1.25rem;
  font-weight: 800;
}

.si-back,
.si-actions :deep(.v-btn:not(.si-save-btn)) {
  border: 1.5px solid rgba(255, 255, 255, 0.62) !important;
  border-radius: 100px !important;
  background: rgba(255, 255, 255, 0.1) !important;
  color: #fff !important;
}

.si-back:hover,
.si-actions :deep(.v-btn:not(.si-save-btn):hover) {
  border-color: #fff !important;
  background: #fff !important;
  color: var(--si-primary) !important;
}

.si-config-chip {
  border: 1.5px solid rgba(255, 255, 255, 0.32) !important;
  background: rgba(255, 255, 255, 0.14) !important;
  color: #fff !important;
}

.si-search-field :deep(.v-field) {
  border-radius: var(--fb-radius-control, 8px) !important;
  background: #fff !important;
  color: var(--si-text);
}

.si-save-btn {
  border: 1.5px solid #fff !important;
  border-radius: 100px !important;
  background: #fff !important;
  color: var(--si-primary) !important;
  box-shadow: none;
}

/* Boutons harmonisés sur Market Price List : pilules blanches sur bandeau rouge,
   une seule ligne, taille contenue. */
.si-actions :deep(.v-btn) {
  min-height: 34px;
  height: 34px;
  border-radius: 100px !important;
  white-space: nowrap;
  font-size: 12.5px;
  padding: 0 16px;
}

.si-save-btn:hover {
  background: var(--si-primary-soft) !important;
}

@media (max-width: 900px) {
  .si-header {
    margin: 14px 16px 0;
    padding: 14px 16px;
  }
}

@media (max-width: 640px) {
  .si-header {
    border-radius: 14px;
  }

  .si-title {
    font-size: 1rem;
  }
}

/* ===================== DARK MODE — compléments =====================
   Le gros de la vue suit déjà les `--fb-*` (dark déclaré dans style.css sous
   .space-inventory-view). Restent ici les valeurs qui n'ont pas de variable :
   translucides noirs, ascenseurs, shimmer du skeleton, état désactivé.
   Le bandeau rouge (#ff3131 + contrôles blancs) est volontairement identique
   dans les deux thèmes — parité Space Menus, cf. commentaire plus haut. */
.v-theme--dataFridayDark .space-inventory-view .si-substatus-count,
.v-theme--dataFridayDark .space-inventory-view .si-sort-chip-count {
  background: rgba(255, 255, 255, 0.12);
}
/* Le chip de tri actif reste rouge : son compteur garde son blanc translucide. */
.v-theme--dataFridayDark .space-inventory-view .si-sort-chip-active .si-sort-chip-count {
  background: rgba(255, 255, 255, 0.25);
}
.v-theme--dataFridayDark .space-inventory-view .si-substatus-help:hover {
  color: #e2e8f0;
}
.v-theme--dataFridayDark .space-inventory-view .si-substatus-btn-active {
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
}
/* Ascenseurs : le gris clair #D1D5DB tranchait sur le fond sombre. */
.v-theme--dataFridayDark .space-inventory-view .si-main,
.v-theme--dataFridayDark .space-inventory-view .si-aggregate {
  scrollbar-color: #4b5563 transparent;
}
.v-theme--dataFridayDark .space-inventory-view .si-main::-webkit-scrollbar-thumb,
.v-theme--dataFridayDark .space-inventory-view .si-aggregate::-webkit-scrollbar-thumb {
  background: #4b5563;
}
/* Skeleton : dégradé clair → gris sombres (même amplitude de contraste). */
.v-theme--dataFridayDark .space-inventory-view .si-skeleton-dot,
.v-theme--dataFridayDark .space-inventory-view .si-skeleton-pill,
.v-theme--dataFridayDark .space-inventory-view .si-skeleton-line {
  background: linear-gradient(90deg, #1f2937 0%, #374151 42%, #1f2937 78%);
  background-size: 220% 100%;
}
.v-theme--dataFridayDark .space-inventory-view .si-btn-primary:disabled {
  background: #4b5563;
  border-color: #4b5563;
  color: #9ca3af;
}
</style>
