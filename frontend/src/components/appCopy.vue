<template>

    <!-- Backend Warning Banner -->
    <div
      v-if="backendAvailable === false && showBackendWarning"
      class="bg-yellow-50 dark:bg-yellow-900/20 border-b border-yellow-200 dark:border-yellow-800 px-4 py-3 flex items-center justify-between"
    >
      <div class="flex items-center gap-3">
        <AlertTriangle class="w-5 h-5 text-yellow-600 dark:text-yellow-500 flex-shrink-0" />
        <div class="flex-1">
          <p class="text-sm text-yellow-800 dark:text-yellow-200">
            <span class="font-semibold">
              Backend server not available.
            </span>
            Please deploy the Supabase Edge Functions to enable full functionality.
            <a
              href="https://supabase.com/docs/guides/functions/deploy"
              target="_blank"
              rel="noopener noreferrer"
              class="underline ml-1 hover:text-yellow-900 dark:hover:text-yellow-100"
            >
              Learn more
            </a>
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          class="text-yellow-800 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
          @click="handleBackendRetry"
        >
          <RefreshCw class="w-4 h-4 mr-2" />
          Retry
        </Button>

        <Button
          variant="ghost"
          size="sm"
          class="text-yellow-800 dark:text-yellow-200 hover:bg-yellow-100 dark:hover:bg-yellow-900/30"
          @click="showBackendWarning = false"
        >
          <X class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- Bloc principal builder (caché si une vue overlay est ouverte) -->
    <div
      v-if="
        !showSpacesPage &&
        !showAnalyseView &&
        !showMenuBuilder &&
        !showEventsView &&
        !showHRView &&
        !showAccountView &&
        !showFBIntegrationView
      "
    >
      <!-- Header -->
      <header class="bg-white dark:bg-gray-900 border-b px-4 md:px-6 py-4 flex items-center justify-between">
        <div class="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
          <!-- Burger Menu -->
          <Sheet :open="burgerMenuOpen" @update:open="onBurgerMenuOpenChange">
            <SheetTrigger as-child>
              <Button variant="ghost" size="icon">
                <Menu class="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="left"
              :class="`p-0 transition-all duration-200 ${
                showSpacesSubmenu
                  ? (isMobile ? 'w-[90vw]' : 'w-[80rem]')
                  : 'w-64'
              }`"
              aria-describedby="main-menu-description"
            >
              <SheetHeader class="p-4 border-b">
                <SheetTitle>Menu</SheetTitle>
                <SheetDescription id="main-menu-description" class="sr-only">
                  Navigation menu for accessing different sections
                </SheetDescription>
              </SheetHeader>

              <div class="flex h-[calc(100vh-5rem)]">
                <!-- Main Menu Column -->
                <div
                  :class="`${showSpacesSubmenu ? (isMobile ? 'w-24' : 'w-40') : 'w-64'} border-r transition-all duration-200`"
                >
                  <ScrollArea class="h-full">
                    <div class="p-2">
                      <!-- Tools Section -->
                      <div class="mb-4">
                        <h3
                          :class="`${showSpacesSubmenu ? 'px-2' : 'px-4'} py-2 text-xs uppercase tracking-wider text-gray-500`"
                        >
                          Tools
                        </h3>

                        <button
                          :class="`w-full text-left ${showSpacesSubmenu ? 'px-2' : 'px-4'} py-2.5 rounded-lg mb-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 truncate text-sm`"
                          @click="handleOpenAnalyseFromMenu"
                        >
                          {{ showSpacesSubmenu && isMobile ? 'Ana' : 'Analyse' }}
                        </button>

                        <button
                          :class="`w-full text-left ${showSpacesSubmenu ? 'px-2' : 'px-4'} py-2.5 rounded-lg mb-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 truncate text-sm`"
                          @click="closeBurgerAndSubmenu"
                        >
                          {{ showSpacesSubmenu && isMobile ? 'Pre' : 'Predict' }}
                        </button>

                        <button
                          :class="`w-full text-left ${showSpacesSubmenu ? 'px-2' : 'px-4'} py-2.5 rounded-lg mb-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 truncate text-sm`"
                          @click="closeBurgerAndSubmenu"
                        >
                          {{ showSpacesSubmenu && isMobile ? 'Inv' : 'Inventory' }}
                        </button>

                        <button
                          :class="`w-full text-left ${showSpacesSubmenu ? 'px-2' : 'px-4'} py-2.5 rounded-lg mb-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 truncate text-sm`"
                          @click="closeBurgerAndSubmenu"
                        >
                          {{ showSpacesSubmenu && isMobile ? 'Sto' : 'Stockup' }}
                        </button>

                        <button
                          :class="`w-full text-left ${showSpacesSubmenu ? 'px-2' : 'px-4'} py-2.5 rounded-lg mb-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 truncate text-sm`"
                          @click="closeBurgerAndSubmenu"
                        >
                          {{ showSpacesSubmenu && isMobile ? 'Liv' : 'Live' }}
                        </button>

                        <button
                          :class="`w-full text-left ${showSpacesSubmenu ? 'px-2' : 'px-4'} py-2.5 rounded-lg mb-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 truncate text-sm`"
                          @click="closeBurgerAndSubmenu"
                        >
                          {{ showSpacesSubmenu && isMobile ? 'Men' : 'Menu' }}
                        </button>
                      </div>

                      <!-- Home Section -->
                      <div>
                        <h3
                          :class="`${showSpacesSubmenu ? 'px-2' : 'px-4'} py-2 text-xs uppercase tracking-wider text-gray-500`"
                        >
                          Home
                        </h3>

                        <div>
                          <button
                            :class="`w-full text-left ${showSpacesSubmenu ? 'px-2' : 'px-4'} py-2.5 rounded-lg mb-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center justify-between ${showSpacesSubmenu ? 'bg-gray-100 dark:bg-gray-800' : ''} truncate text-sm`"
                            @click="showSpacesSubmenu = !showSpacesSubmenu"
                          >
                            <span>{{ showSpacesSubmenu && isMobile ? 'Spa' : 'Spaces' }}</span>
                            <ChevronRight
                              v-if="!(showSpacesSubmenu && isMobile)"
                              class="w-4 h-4 transition-transform"
                              :class="showSpacesSubmenu ? 'rotate-90' : ''"
                            />
                          </button>
                        </div>

                        <button
                          :class="`w-full text-left ${showSpacesSubmenu ? 'px-2' : 'px-4'} py-2.5 rounded-lg mb-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800 truncate text-sm`"
                          @click="handleOpenEventsFromMenu"
                        >
                          {{ showSpacesSubmenu && isMobile ? 'Eve' : 'Events' }}
                        </button>
                      </div>
                    </div>
                  </ScrollArea>
                </div>

                <!-- Spaces Submenu Column - Only visible when showSpacesSubmenu is true -->
                <div
                  v-if="showSpacesSubmenu"
                  class="flex-1 bg-gray-50 dark:bg-gray-900 relative"
                >
                  <!-- Mobile Close Button -->
                  <Button
                    v-if="isMobile"
                    variant="ghost"
                    size="icon"
                    class="absolute top-2 right-2 z-10 h-8 w-8"
                    @click="showSpacesSubmenu = false"
                  >
                    <X class="w-4 h-4" />
                  </Button>

                  <div class="p-4">
                    <h3 class="text-sm font-semibold mb-3">Spaces</h3>

                    <!-- Search Field -->
                    <div class="relative mb-3">
                      <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="Search spaces..."
                        v-model="spacesSearchQuery"
                        class="pl-9 h-9"
                      />
                    </div>

                    <!-- All Option -->
                    <button
                      class="w-full text-left px-3 py-2 rounded-md mb-2 transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                      @click="handleOpenAllSpacesFromMenu"
                    >
                      All
                    </button>

                    <!-- Separator -->
                    <div class="h-px bg-gray-300 my-2" />

                    <!-- List of Spaces -->
                    <ScrollArea class="h-[calc(100vh-16rem)]">
                      <div class="space-y-0.5">
                        <button
                          v-for="space in filteredSpaces"
                          :key="space.id"
                          class="w-full text-left px-3 py-2 rounded-md transition-colors hover:bg-white dark:hover:bg-gray-800 text-sm"
                          @click="handleOpenSpaceFromBuilderVue(space.id)"
                        >
                          {{ space.name }}
                        </button>

                        <div
                          v-if="filteredSpaces.length === 0 && spacesSearchQuery !== ''"
                          class="px-3 py-2 text-sm text-gray-500"
                        >
                          No spaces found
                        </div>
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <!-- Editable Space Title -->
          <div class="flex items-center gap-2 group min-w-0">
            <h1
              :class="`truncate ${isMobile ? 'cursor-pointer' : 'max-w-[200px] md:max-w-md'}`"
              :title="currentSpace?.name || 'Untitled Space'"
              @click="isMobile ? handleEditSpaceName() : null"
            >
              {{
                isMobile
                  ? (currentSpace?.name && currentSpace.name.length > 12
                      ? currentSpace.name.substring(0, 12) + '...'
                      : currentSpace?.name || 'Untitled Space')
                  : (currentSpace?.name || 'Untitled Space')
              }}
            </h1>

            <Button
              v-if="!isMobile"
              variant="ghost"
              size="icon"
              class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              @click="handleEditSpaceName"
            >
              <Pencil class="w-3 h-3" />
            </Button>

            <Avatar
              v-if="currentSpace?.image"
              class="h-8 w-8 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all flex-shrink-0"
              @click="showImageUpload = true"
            >
              <AvatarImage
                :src="currentSpace.image"
                :alt="currentSpace.name"
                class="object-cover"
              />
              <AvatarFallback class="bg-blue-100">
                <Building2 class="w-4 h-4 text-blue-600" />
              </AvatarFallback>
            </Avatar>

            <Button
              v-else
              variant="outline"
              size="sm"
              class="h-8 text-xs flex-shrink-0"
              :class="isMobile ? 'w-8 p-0' : 'px-3'"
              @click="showImageUpload = true"
            >
              <Upload :class="`w-3 h-3 ${isMobile ? '' : 'mr-1.5'}`" />
              <span v-if="!isMobile">Add Image</span>
            </Button>
          </div>
        </div>

        <!-- Header Right (preview + notifications + settings) -->
        <div class="flex items-center gap-2 flex-shrink-0">
          <Button
            v-if="isMobile && (mobileViewMode !== 'areas' || mobilePreviewMode)"
            variant="outline"
            size="icon"
            @click="
              mobilePreviewMode = false;
              mobileViewMode = 'areas';
            "
          >
            <X class="w-4 h-4" />
          </Button>

          <template v-else>
            <!-- Preview Button - Mobile Only -->
            <Button
              v-if="isMobile"
              variant="ghost"
              size="icon"
              class="w-10 h-10"
              @click="
                mobilePreviewMode = true;
                showNotifications = false;
                showSearchResults = false;
              "
            >
              <span class="font-bold text-base">3D</span>
            </Button>

            <!-- Notification Icon -->
            <Button
              variant="ghost"
              size="icon"
              class="relative"
              @click="
                showNotifications = !showNotifications;
                showSearchResults = false;
                mobilePreviewMode = false;
                isMobile && (mobileViewMode = 'properties');
              "
            >
              <Bell class="w-5 h-5" />
              <span class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </Button>

            <!-- Settings Menu -->
            <SettingsMenu
              :onOpenMenu="handleOpenMenuFromHeader"
              :onOpenProfile="handleOpenProfile"
              :onEditSpace="handleEditSpace"
              :onNavigateToSpaces="() => (showSpacesPage = true)"
              :onOpenEvents="handleOpenEventsFromHeader"
              :onOpenHR="handleOpenHRFromHeader"
              :onOpenAccount="handleOpenAccountFromHeader"
              :onOpenFBIntegration="handleOpenFBIntegrationFromHeader"
              :onOpenInventory="handleOpenInventoryFromHeader"
            />
          </template>
        </div>
      </header>

      <div class="flex-1 flex overflow-hidden">
    <!-- Left Sidebar - Floor List & Element Palette OR Element List on Mobile -->
    <aside
      v-if="!(isMobile && (mobileViewMode === 'drawing'
        || mobileViewMode === 'properties'
        || mobileViewMode === 'search'
        || mobilePreviewMode))"
      :class="[
        'bg-white dark:bg-gray-900 border-r overflow-y-auto transition-all duration-300',
        isMobile ? 'w-full' : 'w-64'
      ]"
    >
      <ElementSummaryPanel
        v-if="isMobile && mobileViewMode === 'elementList' && selectedTool"
        :elementType="selectedTool"
        :floors="filteredFloors"
        :forecourt="filteredForecourt"
        :externalMerch="filteredExternalMerch"
        :selectedStorageTypes="selectedStorageTypes"
        :selectedShopTypes="selectedShopTypes"
        :selectedHospitalityTypes="selectedHospitalityTypes"
        :selectedMerchTypes="selectedMerchTypes"
        :selectedAccessTypes="selectedAccessTypes"
        :selectedEntertainmentTypes="selectedEntertainmentTypes"
        :selectedEntranceTypes="selectedEntranceTypes"
        :spaceId="currentSpace?.id"
        :onSelectElement="(elementId, floorId, isForecourt, isExternalMerch) => {
          setSelectedElementId(elementId);
          if (isForecourt) {
            setViewMode('forecourt');
          } else if (isExternalMerch) {
            setViewMode('externalmerch');
          } else {
            setSelectedFloorId(floorId);
            setViewMode('floor');
          }
          // Switch to properties view on mobile
          setMobileViewMode('properties');
        }"
        :showMobileDrawButton="true"
        :onMobileDrawClick="() => setMobileViewMode('drawing')"
      />
      <template v-else>
        <!-- Configuration Controls - Mobile Only -->
        <div
          v-if="isMobile"
          class="p-4 border-b bg-white dark:bg-gray-900"
        >
          <ConfigurationControl
            :configurations="configurations"
            :currentConfigId="currentConfigId"
            :hasUnsavedChanges="hasUnsavedChanges"
            :onSave="handleSaveConfiguration"
            :onLoad="handleLoadConfiguration"
            :onNew="handleNewConfiguration"
            :onDuplicate="handleDuplicateCurrentConfiguration"
            :onRename="handleRenameCurrentConfiguration"
            :onDelete="handleDeleteCurrentConfiguration"
          />
        </div>
        <FloorList
          :floors="filteredFloors"
          :forecourt="filteredForecourt"
          :externalMerch="filteredExternalMerch"
          :selectedFloorId="selectedFloorId"
          :viewMode="viewMode"
          :onSelectFloor="(id) => {
            setSelectedFloorId(id);
            setViewMode('floor');
          }"
          :onSelectForecourt="() => setViewMode('forecourt')"
          :onSelectExternalMerch="() => setViewMode('externalmerch')"
          :onUpdateFloor="updateFloor"
          :onUpdateForecourt="updateForecourt"
          :onUpdateExternalMerch="updateExternalMerch"
          :onDeleteFloor="deleteFloor"
          :onDeleteForecourt="deleteForecourt"
          :onDeleteExternalMerch="deleteExternalMerch"
          :onDuplicateFloor="duplicateFloor"
          :onAddFloor="addFloor"
          :onAddForecourt="addForecourt"
          :onAddExternalMerch="addExternalMerch"
          :onReorderFloors="reorderFloors"
        />
        <ElementPalette
          :selectedTool="selectedTool"
          :onSelectTool="(tool) => {
            setSelectedTool(tool);
            setSelectedElementId(null); // Clear selected element when selecting a tool
            setShowSearchResults(false); // Close search results when selecting a tool
            if (isMobile && tool) {
              setMobileViewMode('elementList');
            }
          }"
          :selectedStorageTypes="selectedStorageTypes"
          :onSelectStorageTypes="setSelectedStorageTypes"
          :selectedShopTypes="selectedShopTypes"
          :onSelectShopTypes="setSelectedShopTypes"
          :selectedHospitalityTypes="selectedHospitalityTypes"
          :onSelectHospitalityTypes="setSelectedHospitalityTypes"
          :selectedMerchTypes="selectedMerchTypes"
          :onSelectMerchTypes="setSelectedMerchTypes"
          :selectedAccessTypes="selectedAccessTypes"
          :onSelectAccessTypes="setSelectedAccessTypes"
          :selectedEntertainmentTypes="selectedEntertainmentTypes"
          :onSelectEntertainmentTypes="setSelectedEntertainmentTypes"
          :selectedEntranceTypes="selectedEntranceTypes"
          :onSelectEntranceTypes="setSelectedEntranceTypes"
          :selectedKitchenTypes="selectedKitchenTypes"
          :onSelectKitchenTypes="setSelectedKitchenTypes"
          :onClearSelectedElement="() => setSelectedElementId(null)"
        />
      </template>
    </aside>
    <!-- Main Content -->
    <main
      :class="[
        'flex-1 flex flex-col overflow-hidden transition-all duration-300',
        isMobile && ((mobileViewMode !== 'drawing' && !mobilePreviewMode)
          || (mobilePreviewMode && mobileViewMode === 'properties'))
          ? 'hidden'
          : 'flex'
      ]"
    >
      <!-- 3D Elevation View -->
      <div
        v-if="!isPlanFullscreen"
        class="h-1/2 bg-gray-100 dark:bg-gray-900 border-b dark:border-gray-700 p-4"
      >
        <ElevationView
          :floors="filteredFloors"
          :forecourt="filteredForecourt"
          :externalMerch="filteredExternalMerch"
          :selectedFloorId="selectedFloorId"
          :selectedElementId="selectedElementId"
          :viewMode="viewMode"
          :selectedTool="selectedTool"
          :selectedStorageTypes="selectedStorageTypes"
          :selectedShopTypes="selectedShopTypes"
          :selectedHospitalityTypes="selectedHospitalityTypes"
          :selectedMerchTypes="selectedMerchTypes"
          :selectedAccessTypes="selectedAccessTypes"
          :selectedEntertainmentTypes="selectedEntertainmentTypes"
          :selectedEntranceTypes="selectedEntranceTypes"
          :selectedKitchenTypes="selectedKitchenTypes"
          :allShopMenuItems="getAllShopMenuItems()"
          :allMerchShopItems="getAllMerchShopItems()"
          :onSelectFloor="(id) => {
            setSelectedFloorId(id);
            setViewMode('floor');
          }"
          :onSelectForecourt="() => {
            setViewMode('forecourt');
            setSelectedElementId(null);
          }"
          :onSelectExternalMerch="() => {
            setViewMode('externalmerch');
            setSelectedElementId(null);
          }"
          :onHighlightElements="(elementIds) => {
            setHighlightedElementIds(elementIds);
            if (elementIds.length > 0) {
              setShowSearchResults(true);
            }
          }"
          :onSearchQueryChange="(query) => {
            setSearchQuery(query);
            if (query && highlightedElementIds.length > 0) {
              setShowSearchResults(true);
            } else if (!query) {
              setShowSearchResults(false);
            }
          }"
          :onShowSearchResults="() => {
            if (isMobile && highlightedElementIds.length > 0) {
              setMobileViewMode('search');
            }
            setShowSearchResults(true);
          }"
          :onUpdateFloor="updateFloor"
          :onUpdateForecourt="updateForecourt"
          :onUpdateExternalMerch="updateExternalMerch"
          :configurations="configurations"
          :currentConfigId="currentConfigId"
          :hasUnsavedChanges="hasUnsavedChanges"
          :onSaveConfiguration="handleSaveConfiguration"
          :onLoadConfiguration="handleLoadConfiguration"
          :onNewConfiguration="handleNewConfiguration"
          :onDuplicateConfiguration="handleDuplicateCurrentConfiguration"
          :onRenameConfiguration="handleRenameCurrentConfiguration"
          :onDeleteConfiguration="handleDeleteCurrentConfiguration"
          :getAvailableMenuItemsForElement="getAvailableMenuItemsForElement"
        />
      </div>
      <!-- Floor Plan View -->
      <div class="flex-1 bg-white dark:bg-gray-900 p-4 overflow-auto">
        <FloorPlanView
          v-if="viewMode === 'floor' && selectedFloor"
          :floor="selectedFloor"
          :selectedElementId="selectedElementId"
          :selectedTool="selectedTool"
          :selectedStorageTypes="selectedStorageTypes"
          :selectedShopTypes="selectedShopTypes"
          :selectedHospitalityTypes="selectedHospitalityTypes"
          :selectedMerchTypes="selectedMerchTypes"
          :selectedAccessTypes="selectedAccessTypes"
          :selectedEntertainmentTypes="selectedEntertainmentTypes"
          :selectedEntranceTypes="selectedEntranceTypes"
          :selectedKitchenTypes="selectedKitchenTypes"
          :highlightedElementIds="highlightedElementIds"
          :onSelectElement="(elementId) => {
            setSelectedElementId(elementId);
            setShowSearchResults(false);
          }"
          :onAddElement="addElement"
          :onUpdateElement="updateElement"
          :onUpdateFloor="(updates) => updateFloor(rawSelectedFloor.id, updates)"
          :onShowElementProperties="isMobile ? () => setMobileViewMode('properties') : undefined"
          :isFullscreen="isPlanFullscreen"
          :onToggleFullscreen="() => setIsPlanFullscreen(!isPlanFullscreen)"
        />
        <FloorPlanView
          v-else-if="viewMode === 'forecourt' && filteredForecourt"
          :floor="filteredForecourt"
          :selectedElementId="selectedElementId"
          :selectedTool="selectedTool"
          :selectedStorageTypes="selectedStorageTypes"
          :selectedShopTypes="selectedShopTypes"
          :selectedHospitalityTypes="selectedHospitalityTypes"
          :selectedMerchTypes="selectedMerchTypes"
          :selectedAccessTypes="selectedAccessTypes"
          :selectedEntertainmentTypes="selectedEntertainmentTypes"
          :selectedEntranceTypes="selectedEntranceTypes"
          :selectedKitchenTypes="selectedKitchenTypes"
          :highlightedElementIds="highlightedElementIds"
          :onSelectElement="(elementId) => {
            setSelectedElementId(elementId);
            setShowSearchResults(false);
          }"
          :onAddElement="addElement"
          :onUpdateElement="updateElement"
          :onUpdateFloor="updateForecourt"
          :onShowElementProperties="isMobile ? () => setMobileViewMode('properties') : undefined"
          :isFullscreen="isPlanFullscreen"
          :onToggleFullscreen="() => setIsPlanFullscreen(!isPlanFullscreen)"
        />
        <FloorPlanView
          v-else-if="viewMode === 'externalmerch' && filteredExternalMerch"
          :floor="filteredExternalMerch"
          :selectedElementId="selectedElementId"
          :selectedTool="selectedTool"
          :selectedStorageTypes="selectedStorageTypes"
          :selectedShopTypes="selectedShopTypes"
          :selectedHospitalityTypes="selectedHospitalityTypes"
          :selectedMerchTypes="selectedMerchTypes"
          :selectedAccessTypes="selectedAccessTypes"
          :selectedEntertainmentTypes="selectedEntertainmentTypes"
          :selectedEntranceTypes="selectedEntranceTypes"
          :selectedKitchenTypes="selectedKitchenTypes"
          :highlightedElementIds="highlightedElementIds"
          :onSelectElement="(elementId) => {
            setSelectedElementId(elementId);
            setShowSearchResults(false);
          }"
          :onAddElement="addElement"
          :onUpdateElement="updateElement"
          :onUpdateFloor="updateExternalMerch"
          :onShowElementProperties="isMobile ? () => setMobileViewMode('properties') : undefined"
          :isFullscreen="isPlanFullscreen"
          :onToggleFullscreen="() => setIsPlanFullscreen(!isPlanFullscreen)"
        />
        <div
          v-else
          class="h-full flex items-center justify-center text-gray-400"
        >
          Select a floor, forecourt, or external area to edit
        </div>
      </div>
    </main>
    <!-- Right Sidebar - Properties -->
    <aside
      v-if="!(isMobile && mobilePreviewMode && mobileViewMode !== 'properties')"
      :class="[
        'bg-white dark:bg-gray-900 border-l overflow-y-auto transition-all duration-300',
        isMobile
          ? (mobileViewMode === 'properties' || mobileViewMode === 'search' ? 'w-full' : 'hidden')
          : 'w-96'
      ]"
    >
      <NotificationPanel
        v-if="showNotifications"
        :onClose="() => {
          setShowNotifications(false);
          if (isMobile) {
            setMobileViewMode('areas');
          }
        }"
      />
      <SearchResultsPanel
        v-else-if="(isMobile ? mobileViewMode === 'search' : showSearchResults)
          && searchQuery
          && highlightedElementIds.length > 0"
        :searchQuery="searchQuery"
        :matchedElements="getMatchedElements()"
        :allShopMenuItems="getAllShopMenuItems()"
        :allMerchShopItems="getAllMerchShopItems()"
        :onSelectElement="(elementId, floorId, isForecourt, isExternalMerch) => {
          setSelectedElementId(elementId);
          setShowSearchResults(false);
          if (isForecourt) {
            setViewMode('forecourt');
          } else if (isExternalMerch) {
            setViewMode('externalmerch');
          } else {
            setSelectedFloorId(floorId);
            setViewMode('floor');
          }
          // Switch to properties view on mobile
          if (isMobile) {
            setMobileViewMode('properties');
          }
        }"
        :onClose="() => {
          setShowSearchResults(false);
          if (isMobile) {
            setMobileViewMode('areas');
          }
        }"
      />
      <PropertiesPanel
        v-else-if="selectedElement"
        :element="selectedElement"
        :configurations="configurations"
        :currentConfigId="currentConfigId"
        :fbElementsRegistry="fbElementsRegistry"
        :onAddToConfiguration="(configId) => handleAddToConfiguration(selectedElement.id, configId)"
        :onRemoveFromConfiguration="(configId) => handleRemoveFromConfiguration(selectedElement.id, configId)"
        :allShopMenuItems="getAllShopMenuItems()"
        :allMerchShopItems="getAllMerchShopItems()"
        :availableMenuItems="getAvailableMenuItemsForElement(selectedElement.id)"
        :allFBElements="getAllFBElements()"
        :allMerchElements="getAllMerchElements()"
        :currentSpace="currentSpace"
        :onUpdate="(updates) => updateElement(selectedElement.id, updates)"
        :onDelete="(keepHistoricalData) => {
          deleteElement(selectedElement.id, keepHistoricalData);
          if (isMobile) {
            setMobileViewMode('areas');
          }
        }"
        :onDuplicate="() => duplicateElement(selectedElement.id)"
        :onClose="() => {
          setSelectedElementId(null);
          if (isMobile) {
            // If in preview mode, stay in drawing mode to see the 3D view
            // If we have a selected tool, go back to drawing mode, otherwise go to areas
            if (mobilePreviewMode) {
              setMobileViewMode('drawing');
            } else {
              setMobileViewMode(selectedTool ? 'drawing' : 'areas');
            }
          }
        }"
      />
      <ElementSummaryPanel
        v-else-if="selectedTool"
        :elementType="selectedTool"
        :floors="filteredFloors"
        :forecourt="filteredForecourt"
        :externalMerch="filteredExternalMerch"
        :selectedStorageTypes="selectedStorageTypes"
        :selectedShopTypes="selectedShopTypes"
        :selectedHospitalityTypes="selectedHospitalityTypes"
        :selectedMerchTypes="selectedMerchTypes"
        :selectedAccessTypes="selectedAccessTypes"
        :selectedEntertainmentTypes="selectedEntertainmentTypes"
        :selectedEntranceTypes="selectedEntranceTypes"
        :spaceId="currentSpace?.id"
        :onSelectElement="(elementId, floorId, isForecourt, isExternalMerch) => {
          setSelectedElementId(elementId);
          setShowSearchResults(false);
          if (isForecourt) {
            setViewMode('forecourt');
          } else if (isExternalMerch) {
            setViewMode('externalmerch');
          } else {
            setSelectedFloorId(floorId);
            setViewMode('floor');
          }
          if (isMobile) {
            setMobileViewMode('properties');
          }
        }"
      />
    </aside>
  </div>

  </div>
  <div
      v-if="showMenuBuilder"
      class="fixed inset-0 z-50 bg-white dark:bg-gray-950"
    >
      <MenuBuilder
        :initial-view="menuBuilderView"
        :onClose="handleCloseMenuBuilder"
        :onOpenSpace="handleOpenSpace"
        :onSpaceMenuSaved="handleSpaceMenuSaved"
        :onOpenEvents="handleOpenEvents"
        :onOpenHR="handleOpenHR"
        :onOpenFBIntegration="handleOpenFBIntegration"
        :suppliers="suppliers"
        :onSaveSupplier="handleSaveSupplier"
        :onDeleteSupplier="handleDeleteSupplier"
      />
    </div>

    <div v-if="showEventsView" class="fixed inset-0 z-50 bg-white dark:bg-gray-950">
      <ConsolidatedEventsView 
        :initialView="eventView"
        :onClose="handleEventsClose"
        :onOpenNotifications="handleOpenNotifications"
        :onOpenMenu="handleOpenMenu"
        :onOpenSpace="handleEditSpace"
        :onOpenEvents="handleOpenEvents"
        :onOpenHR="handleOpenHR"
        :onOpenAccount="handleOpenAccount"
        :onOpenFBIntegration="handleOpenFBIntegration"
      />
    </div>

    <!-- HR View Overlay -->
    <div v-if="showHRView" class="fixed inset-0 z-50 bg-white dark:bg-gray-950">
      <ConsolidatedHRView
        :initialView="hrView"
        :onClose="handleHRClose"
        :onOpenNotifications="handleOpenNotifications"
        :onOpenMenu="handleOpenMenuFromHR"
        :onOpenSpace="handleEditSpace"
        :onOpenEvents="handleOpenEventsFromHR"
        :onOpenHR="handleOpenHRFromHR"
        :onOpenFBIntegration="handleOpenFBIntegrationFromHR"
      />
    </div>

    <div v-if="showAccountView" class="fixed inset-0 z-50 bg-white dark:bg-gray-950">
      <ConsolidatedAccountView
        :initialView="accountView"
        :onClose="() => {
          showAccountView = false;
          if (previousViewBeforeAccount === 'spaces') {
            showSpacesPage = true;
          }
        }"
        :onOpenNotifications="() => {
          showNotifications = true;
        }"
        :onOpenMenu="(view) => {
          previousViewBeforeMenuBuilder = previousViewBeforeAccount;
          showAccountView = false;
          if (view) {
            menuBuilderView = view;
            setTimeout(() => { showMenuBuilder = true; }, 0);
          } else {
            showMenuBuilder = true;
          }
        }"
        :onOpenSpace="handleEditSpace"
        :onOpenEvents="(view) => {
          previousViewBeforeEvents = previousViewBeforeAccount;
          showAccountView = false;
          if (view) {
            eventView = view;
            setTimeout(() => { showEventsView = true; }, 0);
          } else {
            showEventsView = true;
          }
        }"
        :onOpenHR="(view = 'suppliers') => {
          previousViewBeforeHR = previousViewBeforeAccount;
          showAccountView = false;
          hrView = view;
          setTimeout(() => { showHRView = true; }, 0);
        }"
        :onOpenAccount="(view = 'preferences') => {
          showAccountView = true;
          accountView = view; 
          
        }"
        :onOpenFBIntegration="() => {
          previousViewBeforeIntegration = previousViewBeforeAccount;
          showAccountView = false;
          showFBIntegrationView = true;
        }"
      />
    </div>

    <!-- F&B Integration View Overlay -->
    <div v-if="showFBIntegrationView" class="fixed inset-0 z-50 bg-white">
      <FBIntegrationView
        :onClose="handleFBIntegrationClose"
        :onOpenNotifications="handleFBIntegrationOpenNotifications"
        :onOpenMenu="handleFBIntegrationOpenMenu"
        :onEditSpace="handleEditSpace"
        :onOpenEvents="handleFBIntegrationOpenEvents"
        :onOpenHR="handleFBIntegrationOpenHR"
        :onOpenProfile="handleOpenProfile"
        :onOpenFBIntegration="handleFBIntegrationSelfOpen"
      />
    </div>

</template>

<script>
import { AlertTriangle, RefreshCw, X } from 'lucide-vue-next' // ou équivalent
import { Button } from '@/components/ui/button'               // adapte les imports
import { api } from '@/utils/api'
import { toast } from 'vue-sonner'
export default {
  name: 'App',
  components: { AlertTriangle, RefreshCw, X, Button },
  data() {
    return {
      isMobile: false,
      mobileViewMode: 'areas', // 'areas' | 'drawing' | 'properties' | 'search' | 'elementList'
      mobilePreviewMode: false,
      isPlanFullscreen: false,
      // --- Sélection & vue ---
      viewMode: 'floor', // 'floor' | 'forecourt' | 'externalmerch'
      selectedTool: null,
      selectedFloorId: null,
      selectedElementId: null,
      highlightedElementIds: [],
      // --- Données principales ---
      floors: [],
      forecourt: null,
      externalMerch: null,
      // --- Données filtrées ---
      filteredFloors: [],
      filteredForecourt: null,
      filteredExternalMerch: null,
      // --- Filtres de types d’éléments ---
      selectedStorageTypes: [],
      selectedShopTypes: [],
      selectedHospitalityTypes: [],
      selectedMerchTypes: [],
      selectedAccessTypes: [],
      selectedEntertainmentTypes: [],
      selectedEntranceTypes: [],
      selectedKitchenTypes: [],
      // --- Configuration / scénarios ---
      configurations: [],
      currentConfigId: null,
      hasUnsavedChanges: false,
      // --- Recherche & notifications ---
      searchQuery: '',
      showSearchResults: false,
      showNotifications: false,
      // --- Contexte espace / FB / merch ---
      currentSpace: null,
      fbElementsRegistry: {},
      selectedElement: null,
      // À adapter selon ton état réel
      backendAvailable: null,
      showBackendWarning: true,
      burgerMenuOpen: false,
      showSpacesSubmenu: false,
      isMobile: false,
      showSpacesPage: false,
      showAnalyseView: false,
      showMenuBuilder: false,
      showEventsView: false,
      showHRView: false,
      showAccountView: false,
      showFBIntegrationView: false,
      spacesSearchQuery: '',
      allSpaces: [],
      currentSpace: null,
      showImageUpload: false,
      mobileViewMode: 'areas',
      mobilePreviewMode: false,
      showNotifications: false,
      showSearchResults: false,
      // pour SettingsMenu et layout
      previousViewBeforeMenuBuilder: 'builder',
      previousViewBeforeEvents: 'builder',
      previousViewBeforeHR: 'builder',
      previousViewBeforeAccount: 'builder',
      previousViewBeforeIntegration: 'builder',
      previousViewBeforeInventory: 'builder',
    }
  },
  methods: {
    async handleBackendRetry() {
      const isHealthy = await api.healthCheck()
      this.backendAvailable = isHealthy
      if (isHealthy) {
        toast.success('Backend server is now available!')
      } else {
        toast.error('Backend server is still unavailable.')
      }
    },

    // =========================
    // Burger menu / header gauche
    // =========================
    onBurgerMenuOpenChange(val) {
      this.burgerMenuOpen = val
    },
    handleOpenAnalyseFromMenu() {
      // if (this.currentSpace) { ... }
      // this.showAnalyseView = true;
      // this.burgerMenuOpen = false; this.showSpacesSubmenu = false;
    },
    closeBurgerAndSubmenu() {
      this.burgerMenuOpen = false
      this.showSpacesSubmenu = false
    },
    handleOpenEventsFromMenu() {
      // this.previousViewBeforeEvents = this.showSpacesPage ? 'spaces' : 'builder';
      // this.showEventsView = true;
      // this.showAnalyseView = false;
      // this.burgerMenuOpen = false; this.showSpacesSubmenu = false;
    },
    handleOpenAllSpacesFromMenu() {
      // this.showSpacesPage = true;
      // this.showAnalyseView = false;
      // this.burgerMenuOpen = false;
      // this.showSpacesSubmenu = false;
      // this.spacesSearchQuery = '';
    },
    handleOpenSpaceFromBuilderVue(spaceId) {
      // handleOpenSpaceFromBuilder(spaceId);
      // this.burgerMenuOpen = false;
      // this.showSpacesSubmenu = false;
      // this.spacesSearchQuery = '';
    },
    handleEditSpaceName() {
      // ouvrir le dialog d’édition (équivalent React)
    },
    // =========================
    // Header droit
    // =========================
    handleOpenMenuFromHeader(view) {
      // this.previousViewBeforeMenuBuilder = this.showSpacesPage ? 'spaces' : 'builder';
      // this.menuBuilderView = view || this.menuBuilderView;
      // this.showMenuBuilder = true;
    },
    handleOpenProfile() {
      // logique profil
    },
    handleEditSpace() {
      // logique édition d’espace
    },
    handleOpenEventsFromHeader(view = 'events') {
      // this.previousViewBeforeEvents = this.showSpacesPage ? 'spaces' : 'builder';
      // this.eventView = view;
      // this.showEventsView = true;
    },
    handleOpenHRFromHeader(view = 'suppliers') {
      // this.previousViewBeforeHR = this.showSpacesPage ? 'spaces' : 'builder';
      // this.hrView = view;
      // this.showHRView = true;
    },
    handleOpenAccountFromHeader(view = 'preferences') {
      // this.previousViewBeforeAccount = this.showSpacesPage ? 'spaces' : 'builder';
      // this.accountView = view;
      // this.showAccountView = true;
    },
    handleOpenFBIntegrationFromHeader() {
      // this.previousViewBeforeIntegration = this.showSpacesPage ? 'spaces' : (this.showAnalyseView ? 'analyse' : 'builder');
      // this.showFBIntegrationView = true;
    },
    handleOpenInventoryFromHeader() {
      // this.previousViewBeforeInventory = this.showSpacesPage ? 'spaces' : (this.showAnalyseView ? 'analyse' : 'builder');
      // this.showInventoryView = true;
    },
    // =========================
    // Left summary / palette
    // =========================
    onSelectElementFromLeftSummary(elementId, floorId, isForecourt, isExternalMerch) {
      // this.selectedElementId = elementId;
      // changer this.viewMode selon isForecourt / isExternalMerch / floorId
      // si mobile: this.mobileViewMode = 'properties';
    },
    onSelectToolFromPalette(tool) {
      // this.selectedTool = tool;
      // this.selectedElementId = null;
      // this.showSearchResults = false;
      // if (this.isMobile && tool) this.mobileViewMode = 'elementList';
    },
    // =========================
    // ElevationView
    // =========================
    onSelectForecourtFromElevation() {
      // this.viewMode = 'forecourt';
      // this.selectedElementId = null;
    },
    onSelectExternalMerchFromElevation() {
      // this.viewMode = 'externalmerch';
      // this.selectedElementId = null;
    },
    onHighlightElementsFromElevation(elementIds) {
      // this.highlightedElementIds = elementIds;
      // if (elementIds.length > 0) this.showSearchResults = true;
    },
    onSearchQueryChangeFromElevation(query) {
      // this.searchQuery = query;
      // if (query && this.highlightedElementIds.length > 0) this.showSearchResults = true;
      // else if (!query) this.showSearchResults = false;
    },
    onShowSearchResultsFromElevation() {
      // if (this.isMobile && this.highlightedElementIds.length > 0) this.mobileViewMode = 'search';
      // this.showSearchResults = true;
    },
    // =========================
    // FloorPlanView
    // =========================
    onSelectElementFromPlan(elementId) {
      // this.selectedElementId = elementId;
      // this.showSearchResults = false;
    },
    // =========================
    // Panneau de droite
    // =========================
    onCloseNotifications() {
      this.showNotifications = false
      if (this.isMobile) this.mobileViewMode = 'areas'
    },
    onSelectElementFromSearch(elementId, floorId, isForecourt, isExternalMerch) {
      // this.selectedElementId = elementId;
      // this.showSearchResults = false;
      // adapter this.viewMode + this.selectedFloorId selon isForecourt/isExternalMerch/floorId
      // si mobile: this.mobileViewMode = 'properties';
    },
    onCloseSearchResults() {
      this.showSearchResults = false
      if (this.isMobile) this.mobileViewMode = 'areas'
    },
    onDeleteElementFromProperties(keepHistoricalData) {
      // deleteElement(selectedElementId, keepHistoricalData) + mobile viewMode
    },
    onClosePropertiesPanel() {
      // this.selectedElementId = null;
      // si mobile: gestion mobilePreviewMode + selectedTool pour remettre 'drawing' ou 'areas'
    },
    onSelectElementFromRightSummary(elementId, floorId, isForecourt, isExternalMerch) {
      // similaire à onSelectElementFromLeftSummary côté panneau droit
    },

    // ---------- Helpers de sélection / setters ----------
    setViewMode(mode) {
      this.viewMode = mode;
    },
    setSelectedFloorId(id) {
      this.selectedFloorId = id;
    },
    setSelectedElementId(id) {
      this.selectedElementId = id;
      this.selectedElement = id ? this.findElementById(id) : null;
    },
    setMobileViewMode(mode) {
      this.mobileViewMode = mode;
    },
    setShowSearchResults(value) {
      this.showSearchResults = value;
    },
    setHighlightedElementIds(ids) {
      this.highlightedElementIds = ids;
    },
    setSearchQuery(query) {
      this.searchQuery = query;
    },
    setShowNotifications(value) {
      this.showNotifications = value;
    },
    setSelectedTool(tool) {
      this.selectedTool = tool;
    },
    setIsPlanFullscreen(value) {
      this.isPlanFullscreen = value;
    },
    // ---------- Fonctions métier (stubs à remplir avec ta vraie logique) ----------
    updateFloor(id, updates) {
      // TODO: mettre à jour un floor dans floors + filteredFloors
    },
    updateForecourt(updates) {
      // TODO
    },
    updateExternalMerch(updates) {
      // TODO
    },
    deleteFloor(id, keepHistoricalData) {
      // TODO
    },
    deleteForecourt(keepHistoricalData) {
      // TODO
    },
    deleteExternalMerch(keepHistoricalData) {
      // TODO
    },
    duplicateFloor(id) {
      // TODO
    },
    addFloor() {
      // TODO
    },
    addForecourt() {
      // TODO
    },
    addExternalMerch() {
      // TODO
    },
    reorderFloors(newOrder) {
      // TODO
    },
    addElement(payload) {
      // TODO
    },
    updateElement(id, updates) {
      // TODO
    },
    deleteElement(id, keepHistoricalData) {
      // TODO
    },
    duplicateElement(id) {
      // TODO
    },
    // ---------- Configurations ----------
    handleSaveConfiguration() {
      // TODO
    },
    handleLoadConfiguration(id) {
      // TODO
    },
    handleNewConfiguration() {
      // TODO
    },
    handleDuplicateCurrentConfiguration() {
      // TODO
    },
    handleRenameCurrentConfiguration(newName) {
      // TODO
    },
    handleDeleteCurrentConfiguration() {
      // TODO
    },
    handleAddToConfiguration(elementId, configId) {
      // TODO
    },
    handleRemoveFromConfiguration(elementId, configId) {
      // TODO
    },
    // ---------- Helpers pour les panels ----------
    getAllShopMenuItems() {
      // TODO
      return [];
    },
    getAllMerchShopItems() {
      // TODO
      return [];
    },
    getAllFBElements() {
      // TODO
      return [];
    },
    getAllMerchElements() {
      // TODO
      return [];
    },
    getMatchedElements() {
      // TODO: utiliser this.searchQuery + this.highlightedElementIds
      return [];
    },
    getAvailableMenuItemsForElement(elementId) {
      // TODO
      return [];
    },
    findElementById(id) {
      // TODO: chercher dans floors / forecourt / externalMerch
      return null;
    },
  },

  computed: {
    // Liste filtrée des spaces pour le menu
    filteredSpaces() {
      return this.allSpaces.filter(space =>
        this.spacesSearchQuery === '' ||
        space.name.toLowerCase().includes(this.spacesSearchQuery.toLowerCase())
      )
    },

    // Équivalent de selectedFloor dans ton JSX
    selectedFloor() {
      if (!this.selectedFloorId) return null;
      return (
        this.filteredFloors.find(f => f.id === this.selectedFloorId) || null
      );
    },
    // Équivalent possible de rawSelectedFloor
    rawSelectedFloor() {
      if (!this.selectedFloorId) return null;
      re
  },
}
</script>