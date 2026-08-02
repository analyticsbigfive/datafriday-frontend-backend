<template>
  <div class="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
    <!-- Header -->
    <header er
      v-if="isMobile"
      class="bg-white dark:bg-gray-900 border-b px-6 py-4 flex items-center justify-between"
    >
      <div class="flex items-center gap-4">
        <Sheet :open="sheetOpen" :onOpenChange="val => (sheetOpen = val)">
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Menu class="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" class="w-[300px] p-0">
            <SheetHeader class="p-6 pb-4 bg-gray-50 dark:bg-gray-900">
              <SheetTitle>Menu</SheetTitle>
              <SheetDescription>Navigate through spaces</SheetDescription>
            </SheetHeader>
            <div class="flex-1 overflow-hidden bg-gray-50 dark:bg-gray-900">
              <ScrollArea class="h-[calc(100vh-120px)]">
                <div class="px-4 pb-4">
                  <!-- Home Section -->
                  <div class="mb-4">
                    <h3 class="px-4 py-2 text-xs uppercase tracking-wider text-gray-500">
                      Home
                    </h3>
                    <button
                      v-for="item in menuStructure.Home"
                      :key="item"
                      @click="
                        () => {
                          selectedMenuItem = item
                          sheetOpen = false
                        }
                      "
                      :class="[
                        'w-full text-left px-4 py-2.5 rounded-lg mb-1 transition-colors',
                        selectedMenuItem === item
                          ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800',
                      ]"
                    >
                      {{ item }}
                    </button>
                  </div>

                  <!-- Analyse Section -->
                  <div>
                    <h3 class="px-4 py-2 text-xs uppercase tracking-wider text-gray-500">
                      Analyse
                    </h3>
                    <button
                      v-for="item in menuStructure.Analyse"
                      :key="item"
                      @click="
                        () => {
                          selectedMenuItem = item
                          sheetOpen = false
                        }
                      "
                      :class="[
                        'w-full text-left px-4 py-2.5 rounded-lg mb-1 transition-colors',
                        selectedMenuItem === item
                          ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800',
                      ]"
                    >
                      {{ item }}
                    </button>
                  </div>
                </div>
              </ScrollArea>
            </div>
          </SheetContent>
        </Sheet>
        <h1 class="text-xl">Spaces</h1>
      </div>

      <div class="flex items-center gap-2">
        <!-- Notification Icon -->
        <Button
          variant="ghost"
          size="icon"
          class="relative"
          @click="showNotifications = !showNotifications"
        >
          <Bell class="w-5 h-5" />
          <!-- Notification badge -->
          <span class="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </Button>

        <!-- Settings Menu -->
        <SettingsMenu
          :onOpenMenu="onOpenMenu"
          :onOpenProfile="onOpenProfile"
          :onEditSpace="onEditSpaceFromSettings || onOpenSpace"
          :onOpenEvents="onOpenEvents"
          :onOpenHR="onOpenHR"
          :onOpenFBIntegration="onOpenFBIntegration"
          :onOpenAccount="onOpenAccount"
        />
      </div>
    </header>
    <AppHeader
      v-else
      title="Spaces"
      :onOpenNotifications="onOpenNotifications"
      :onOpenProfile="onOpenProfile"
      :onOpenMenu="onOpenMenu"
      :onEditSpace="onEditSpaceFromSettings || onOpenSpace"
      :onOpenEvents="onOpenEvents"
      :onOpenHR="onOpenHR"
      :onOpenFBIntegration="onOpenFBIntegration"
      :onOpenAccount="onOpenAccount"
    />

    <div class="flex-1 flex overflow-hidden">
      <!-- Left Sidebar - Menu (Desktop Only) -->
      <div
        v-if="!isMobile"
        class="w-64 bg-white dark:bg-gray-900 border-r flex flex-col"
      >
        <ScrollArea class="flex-1">
          <div class="p-2">
            <!-- Home Section -->
            <div class="mb-4">
              <h3 class="px-4 py-2 text-xs uppercase tracking-wider text-gray-500">
                Home
              </h3>
              <button
                v-for="item in menuStructure.Home"
                :key="item"
                @click="selectedMenuItem = item"
                :class="[
                  'w-full text-left px-4 py-2.5 rounded-lg mb-1 transition-colors',
                  selectedMenuItem === item
                    ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800',
                ]"
              >
                {{ item }}
              </button>
            </div>

            <!-- Analyse Section -->
            <div>
              <h3 class="px-4 py-2 text-xs uppercase tracking-wider text-gray-500">
                Analyse
              </h3>
              <button
                v-for="item in menuStructure.Analyse"
                :key="item"
                @click="selectedMenuItem = item"
                :class="[
                  'w-full text-left px-4 py-2.5 rounded-lg mb-1 transition-colors',
                  selectedMenuItem === item
                    ? 'bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800',
                ]"
              >
                {{ item }}
              </button>
            </div>
          </div>
        </ScrollArea>
      </div>

      <!-- Main Content - Space Cards -->
      <div class="flex-1 overflow-hidden flex flex-col">
        <!-- Sticky Revenue Widget -->
        <div
          v-if="!showNotifications && spaces.length > 0"
          class="bg-white dark:bg-gray-900 border-b px-6 py-4 sticky top-0 z-10"
        >
          <div
            class="grid gap-4"
            :class="isMobile ? 'grid-cols-2' : 'grid-cols-4'"
          >
            <Card
              class="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/40 dark:to-blue-800/40"
            >
              <CardContent class="p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs text-gray-600 dark:text-gray-300 mb-1">
                      Total Revenue
                    </p>
                    <p class="text-xl font-bold text-blue-700 dark:text-blue-300">
                      {{ formatCurrency(totalRevenue) }}
                    </p>
                  </div>
                  <TrendingUp class="w-8 h-8 text-blue-600 dark:text-blue-400 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card
              class="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/40 dark:to-green-800/40"
            >
              <CardContent class="p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs text-gray-600 dark:text-gray-300 mb-1">
                      Total F&amp;B
                    </p>
                    <p class="text-xl font-bold text-green-700 dark:text-green-300">
                      {{ formatCurrency(totalFBRevenue) }}
                    </p>
                  </div>
                  <ShoppingBag class="w-8 h-8 text-green-600 dark:text-green-400 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card
              class="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/40 dark:to-purple-800/40"
            >
              <CardContent class="p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs text-gray-600 dark:text-gray-300 mb-1">
                      Total Ticketing
                    </p>
                    <p class="text-xl font-bold text-purple-700 dark:text-purple-300">
                      {{ formatCurrency(totalTicketingRevenue) }}
                    </p>
                  </div>
                  <Ticket class="w-8 h-8 text-purple-600 dark:text-purple-400 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card
              class="bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/40 dark:to-amber-800/40"
            >
              <CardContent class="p-4">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-xs text-gray-600 dark:text-gray-300 mb-1">
                      Total Merch
                    </p>
                    <p class="text-xl font-bold text-amber-700 dark:text-amber-300">
                      {{ formatCurrency(totalMerchRevenue) }}
                    </p>
                  </div>
                  <Store class="w-8 h-8 text-amber-600 dark:text-amber-400 opacity-50" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <!-- Notification Panel or Space Cards -->
        <div v-if="showNotifications" class="flex-1 overflow-hidden bg-white border border-gray-200 rounded-xl">
          <NotificationPanel :onClose="() => (showNotifications = false)" />
        </div>
        <div
          v-else-if="isMobile"
          class="flex-1 flex flex-col overflow-hidden"
        >
          <!-- Search Box - Sticky (mobile) -->
          <div class="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b px-4 py-3">
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <Search
                  class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                />
                <Input
                  type="text"
                  placeholder="Search spaces..."
                  v-model="searchQuery"
                  class="pl-10"
                />
              </div>
              <Button variant="outline" size="icon">
                <Filter class="w-4 h-4" />
              </Button>
              <Button v-if="canEditSpace" variant="outline" size="icon" @click="onNewSpace">
                <Plus class="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div
            class="flex-1 overflow-y-auto snap-y snap-mandatory bg-gray-50 dark:bg-gray-950"
            :style="{ scrollSnapType: 'y mandatory' }"
          >
            <div
              v-if="loading"
              class="h-full flex items-center justify-center text-gray-500 dark:text-gray-400 snap-start"
            >
              Loading spaces...
            </div>
            <div
              v-else-if="filteredSpaces.length === 0"
              class="h-full flex items-center justify-center text-center px-6 text-gray-500 dark:text-gray-400 snap-start"
            >
              {{
                selectedMenuItem === 'Spaces' ||
                selectedMenuItem === 'Events' ||
                selectedMenuItem === 'Overview'
                  ? 'No saved spaces yet. Create your first space in the 3D Space Builder.'
                  : `No spaces with ${selectedMenuItem} elements found.`
              }}
            </div>
            <div v-else>
              <div
                v-for="space in filteredSpaces"
                :key="space.id"
                class="h-full flex items-center justify-center p-6 snap-start snap-always bg-gray-50 dark:bg-gray-950"
              >
                <Card
                  class="w-full max-w-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer bg-white dark:bg-gray-900 dark:border-gray-800"
                  @click="onOpenSpace && onOpenSpace(space.id)"
                >
                  <CardContent class="p-0">
                    <!-- Space Image or Preview Placeholder -->
                    <div
                      class="bg-gradient-to-br from-blue-100 to-purple-100 h-64 flex items-center justify-center relative overflow-hidden group/image"
                    >
                      <template v-if="space.image">
                        <img
                          :src="space.image"
                          :alt="space.name"
                          class="w-full h-full object-cover transition-transform group-hover/image:scale-105"
                        />
                        <div
                          class="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors"
                        />
                      </template>
                      <LayoutGrid
                        v-else
                        class="w-16 h-16 text-blue-400 transition-transform group-hover/image:scale-110"
                      />

                      <!-- Dark Gradient Overlay with Title -->
                      <div
                        class="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4"
                      >
                        <h3 class="font-semibold text-white truncate">
                          {{ space.name }}
                        </h3>
                      </div>

                      <!-- Bottom Gradient Overlay with Max Capacity -->
                      <div
                        class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4"
                      >
                        <div class="flex items-center gap-2 text-white">
                          <Users class="w-4 h-4" />
                          <span class="font-semibold">
                            {{
                              getMaxCapacity(space.id) != null
                                ? formatNumber(getMaxCapacity(space.id))
                                : 'N/A'
                            }}
                          </span>
                        </div>
                      </div>

                      <!-- Action Buttons - Top Right -->
                      <div class="absolute top-3 right-3 flex gap-2 z-20">
                        <Button
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 bg-white/90 hover:bg-white backdrop-blur-sm"
                          @click.stop="handleTogglePin(space.id)"
                        >
                          <Pin
                            class="w-4 h-4"
                            :class="
                              pinnedSpaces.has(space.id)
                                ? 'fill-current text-blue-600'
                                : 'text-gray-600'
                            "
                          />
                        </Button>
                        <Button
                          v-if="canEditSpace"
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 bg-white/90 hover:bg-white backdrop-blur-sm"
                          @click.stop="handleDuplicateClick(space.id, space.name)"
                        >
                          <Copy class="w-4 h-4 text-gray-600" />
                        </Button>
                        <Button
                          v-if="canEditSpace"
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 bg-white/90 hover:bg-white hover:text-red-600 backdrop-blur-sm"
                          @click.stop="handleDeleteClick(space.id)"
                        >
                          <Trash2 class="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <!-- Space Info -->
                    <div class="p-4 space-y-3 bg-white dark:bg-gray-900">
                      <div class="space-y-2">
                        <!-- Number of Configurations -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <Layers class="w-4 h-4" />
                            <span>Configurations</span>
                          </div>
                          <span class="font-semibold dark:text-gray-200">
                            {{ getConfigurationsCount(space.id) }}
                          </span>
                        </div>

                        <!-- F&B Revenue from Sales -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <TrendingUp class="w-4 h-4" />
                            <span>F&amp;B Revenue</span>
                          </div>
                          <span
                            class="font-semibold text-blue-600 dark:text-blue-400"
                          >
                            {{ formatCurrency(salesRevenue[space.id] || 0) }}
                          </span>
                        </div>

                        <!-- Per Capita (CA / présence réelle) -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <Coins class="w-4 h-4" />
                            <span>Per Capita</span>
                          </div>
                          <span
                            class="font-semibold text-green-600 dark:text-green-400"
                          >
                            {{ formatCurrencyDetailed(spaceMetrics[space.id]?.metrics?.perCapita || 0) }}
                          </span>
                        </div>

                        <!-- Panier moyen -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <ShoppingBasket class="w-4 h-4" />
                            <span>Panier moyen</span>
                          </div>
                          <span
                            class="font-semibold text-purple-600 dark:text-purple-400"
                          >
                            {{ formatCurrencyDetailed(spaceMetrics[space.id]?.metrics?.avgTransaction || 0) }}
                          </span>
                        </div>

                        <!-- CA moyen / évènement -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <TrendingUp class="w-4 h-4" />
                            <span>CA / évènement</span>
                          </div>
                          <span
                            class="font-semibold text-green-600 dark:text-green-400"
                          >
                            {{ formatCurrency(spaceMetrics[space.id]?.metrics?.avgEvent || 0) }}
                          </span>
                        </div>

                        <!-- Nombre d'évènements -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <Calendar class="w-4 h-4" />
                            <span>Évènements</span>
                          </div>
                          <span class="font-semibold dark:text-gray-200">
                            {{ spaceMetrics[space.id]?.eventCount || 0 }}
                          </span>
                        </div>

                        <!-- Total Revenue (capacité × menu) -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <DollarSign class="w-4 h-4" />
                            <span>Max Revenue</span>
                          </div>
                          <span
                            class="font-semibold text-green-600 dark:text-green-400"
                          >
                            {{ formatCurrency(calculateTotalRevenue(space.id)) }}
                          </span>
                        </div>

                        <!-- Top 3 shops par CA (cf. doc §4) -->
                        <div
                          v-if="(spaceMetrics[space.id]?.metrics?.topShops || []).length > 0"
                          class="pt-2 border-t border-gray-100 dark:border-gray-800"
                        >
                          <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <Store class="w-3.5 h-3.5" />
                            <span>Top shops</span>
                          </div>
                          <ol class="space-y-1">
                            <li
                              v-for="(shop, idx) in spaceMetrics[space.id].metrics.topShops"
                              :key="shop.name"
                              class="flex items-center justify-between text-xs"
                            >
                              <span class="truncate text-gray-600 dark:text-gray-300">
                                {{ idx + 1 }}. {{ shop.name }}
                              </span>
                              <span class="font-semibold text-blue-600 dark:text-blue-400 ml-2 shrink-0">
                                {{ formatCurrency(shop.revenue) }}
                              </span>
                            </li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
        <div v-else class="flex-1 overflow-hidden">
          <ScrollArea class="h-full">
            <!-- Search Box - Sticky (desktop) -->
            <div class="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b px-6 py-4">
              <div class="flex items-center gap-3">
                <div class="relative flex-1">
                  <Search
                    class="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400"
                  />
                  <Input
                    type="text"
                    placeholder="Search spaces..."
                    v-model="searchQuery"
                    class="pl-10"
                  />
                </div>
                <Button variant="outline" size="icon">
                  <Filter class="w-4 h-4" />
                </Button>
                <Button v-if="canEditSpace" variant="outline" size="icon" @click="onNewSpace">
                  <Plus class="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div class="p-6 bg-gray-50 dark:bg-gray-950">
              <div
                v-if="loading"
                class="text-center py-12 text-gray-500 dark:text-gray-400"
              >
                Loading spaces...
              </div>
              <div
                v-else-if="filteredSpaces.length === 0"
                class="text-center py-12 text-gray-500 dark:text-gray-400"
              >
                {{
                  selectedMenuItem === 'Spaces' ||
                  selectedMenuItem === 'Events' ||
                  selectedMenuItem === 'Overview'
                    ? 'No saved spaces yet. Create your first space in the 3D Space Builder.'
                    : `No spaces with ${selectedMenuItem} elements found.`
                }}
              </div>
              <div
                v-else
                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              >
                <Card
                  v-for="space in filteredSpaces"
                  :key="space.id"
                  class="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer bg-white dark:bg-gray-900 dark:border-gray-800"
                  @click="onOpenSpace && onOpenSpace(space.id)"
                >
                  <CardContent class="p-0">
                    <!-- Space Image or Preview Placeholder -->
                    <div
                      class="bg-gradient-to-br from-blue-100 to-purple-100 h-48 flex items-center justify-center relative overflow-hidden group/image"
                    >
                      <template v-if="space.image">
                        <img
                          :src="space.image"
                          :alt="space.name"
                          class="w-full h-full object-cover transition-transform group-hover/image:scale-105"
                        />
                        <div
                          class="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 transition-colors"
                        />
                      </template>
                      <LayoutGrid
                        v-else
                        class="w-16 h-16 text-blue-400 transition-transform group-hover/image:scale-110"
                      />

                      <!-- Dark Gradient Overlay with Title -->
                      <div
                        class="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 to-transparent p-4"
                      >
                        <h3 class="font-semibold text-white truncate">
                          {{ space.name }}
                        </h3>
                      </div>

                      <!-- Bottom Gradient Overlay with Max Capacity -->
                      <div
                        class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4"
                      >
                        <div class="flex items-center gap-2 text-white">
                          <Users class="w-4 h-4" />
                          <span class="font-semibold">
                            {{
                              getMaxCapacity(space.id) != null
                                ? formatNumber(getMaxCapacity(space.id))
                                : 'N/A'
                            }}
                          </span>
                        </div>
                      </div>

                      <!-- Action Buttons - Top Right -->
                      <div class="absolute top-3 right-3 flex gap-2 z-20">
                        <Button
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 bg-white/90 hover:bg-white backdrop-blur-sm"
                          @click.stop="handleTogglePin(space.id)"
                        >
                          <Pin
                            class="w-4 h-4"
                            :class="
                              pinnedSpaces.has(space.id)
                                ? 'fill-current text-blue-600'
                                : 'text-gray-600'
                            "
                          />
                        </Button>
                        <Button
                          v-if="canEditSpace"
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 bg-white/90 hover:bg-white backdrop-blur-sm"
                          @click.stop="handleDuplicateClick(space.id, space.name)"
                        >
                          <Copy class="w-4 h-4 text-gray-600" />
                        </Button>
                        <Button
                          v-if="canEditSpace"
                          variant="ghost"
                          size="icon"
                          class="h-8 w-8 bg-white/90 hover:bg-white hover:text-red-600 backdrop-blur-sm"
                          @click.stop="handleDeleteClick(space.id)"
                        >
                          <Trash2 class="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <!-- Space Info -->
                    <div class="p-4 space-y-3 bg-white dark:bg-gray-900">
                      <div class="space-y-2">
                        <!-- Number of Configurations -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <Layers class="w-4 h-4" />
                            <span>Configurations</span>
                          </div>
                          <span class="font-semibold dark:text-gray-200">
                            {{ getConfigurationsCount(space.id) }}
                          </span>
                        </div>

                        <!-- F&B Revenue from Sales -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <TrendingUp class="w-4 h-4" />
                            <span>F&amp;B Revenue</span>
                          </div>
                          <span
                            class="font-semibold text-blue-600 dark:text-blue-400"
                          >
                            {{ formatCurrency(salesRevenue[space.id] || 0) }}
                          </span>
                        </div>

                        <!-- Per Capita (CA / présence réelle) -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <Coins class="w-4 h-4" />
                            <span>Per Capita</span>
                          </div>
                          <span
                            class="font-semibold text-green-600 dark:text-green-400"
                          >
                            {{ formatCurrencyDetailed(spaceMetrics[space.id]?.metrics?.perCapita || 0) }}
                          </span>
                        </div>

                        <!-- Panier moyen -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <ShoppingBasket class="w-4 h-4" />
                            <span>Panier moyen</span>
                          </div>
                          <span
                            class="font-semibold text-purple-600 dark:text-purple-400"
                          >
                            {{ formatCurrencyDetailed(spaceMetrics[space.id]?.metrics?.avgTransaction || 0) }}
                          </span>
                        </div>

                        <!-- CA moyen / évènement -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <TrendingUp class="w-4 h-4" />
                            <span>CA / évènement</span>
                          </div>
                          <span
                            class="font-semibold text-green-600 dark:text-green-400"
                          >
                            {{ formatCurrency(spaceMetrics[space.id]?.metrics?.avgEvent || 0) }}
                          </span>
                        </div>

                        <!-- Nombre d'évènements -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <Calendar class="w-4 h-4" />
                            <span>Évènements</span>
                          </div>
                          <span class="font-semibold dark:text-gray-200">
                            {{ spaceMetrics[space.id]?.eventCount || 0 }}
                          </span>
                        </div>

                        <!-- Total Revenue (capacité × menu) -->
                        <div class="flex items-center justify-between text-sm">
                          <div
                            class="flex items-center gap-2 text-gray-600 dark:text-gray-400"
                          >
                            <DollarSign class="w-4 h-4" />
                            <span>Max Revenue</span>
                          </div>
                          <span
                            class="font-semibold text-green-600 dark:text-green-400"
                          >
                            {{ formatCurrency(calculateTotalRevenue(space.id)) }}
                          </span>
                        </div>

                        <!-- Top 3 shops par CA (cf. doc §4) -->
                        <div
                          v-if="(spaceMetrics[space.id]?.metrics?.topShops || []).length > 0"
                          class="pt-2 border-t border-gray-100 dark:border-gray-800"
                        >
                          <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-1">
                            <Store class="w-3.5 h-3.5" />
                            <span>Top shops</span>
                          </div>
                          <ol class="space-y-1">
                            <li
                              v-for="(shop, idx) in spaceMetrics[space.id].metrics.topShops"
                              :key="shop.name"
                              class="flex items-center justify-between text-xs"
                            >
                              <span class="truncate text-gray-600 dark:text-gray-300">
                                {{ idx + 1 }}. {{ shop.name }}
                              </span>
                              <span class="font-semibold text-blue-600 dark:text-blue-400 ml-2 shrink-0">
                                {{ formatCurrency(shop.revenue) }}
                              </span>
                            </li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>

    <!-- Delete Confirmation Dialog -->
    <AlertDialog
      :open="deleteDialogOpen"
      :onOpenChange="val => (deleteDialogOpen = val)"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Space</AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. All data associated with this space
            will be permanently deleted.
            <br /><br />
            To confirm deletion, please type <strong>delete</strong> in the
            field below:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div class="py-4">
          <Label for="delete-confirm" class="sr-only">
            Type delete to confirm
          </Label>
          <Input
            id="delete-confirm"
            type="text"
            placeholder="Type 'delete' to confirm"
            v-model="deleteConfirmText"
            class="w-full"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel
            @click="
              () => {
                deleteConfirmText = ''
                spaceToDelete = null
              }
            "
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            @click="handleDeleteConfirm"
            :disabled="deleteConfirmText.toLowerCase() !== 'delete'"
            class="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Delete Space
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>

    <!-- Duplicate Space Dialog -->
    <AlertDialog
      :open="duplicateDialogOpen"
      :onOpenChange="val => (duplicateDialogOpen = val)"
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Duplicate Space</AlertDialogTitle>
          <AlertDialogDescription>
            Create a complete copy of this space including all configurations,
            floors, and elements. Enter a name for the new space:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div class="py-4">
          <Label for="duplicate-name">
            New Space Name
          </Label>
          <Input
            id="duplicate-name"
            type="text"
            placeholder="Enter space name"
            v-model="duplicateSpaceName"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel
            @click="
              () => {
                duplicateDialogOpen = false
                spaceToDuplicate = null
                duplicateSpaceName = ''
              }
            "
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction @click="handleDuplicateConfirm">
            Duplicate Space
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>

<script>
import Button from '../ui/button.vue'
import Card from '../ui/card.vue'
import CardContent from '../ui/cardContent.vue'
import ScrollArea from '../ui/scrollArea.vue'
import Input from '../ui/input.vue'

import {
  Plus,
  LayoutGrid,
  Users,
  DollarSign,
  Layers,
  Bell,
  User,
  Menu,
  ShoppingBag,
  Ticket,
  Store,
  TrendingUp,
  Search,
  Filter,
  Pin,
  Trash2,
  Coins,
  Copy,
  ShoppingBasket,
  Calendar,
} from 'lucide-vue-next'

import NotificationPanel from './NotificationPanel.vue'
import SettingsMenu from './SettingsMenu.vue'
import AppHeader from './AppHeader.vue'

import * as api from '../utils/api'
import * as eventApi from '../utils/eventApi'

import Sheet from '../ui/sheet.vue'
import SheetContent from '../ui/sheetContent.vue'
import SheetHeader from '../ui/sheetHeader.vue'
import SheetTitle from '../ui/sheetTitle.vue'
import SheetTrigger from '../ui/sheetTrigger.vue'
import SheetDescription from '../ui/sheetDescription.vue'


import DropdownMenu from '../ui/dropdownMenu.vue'
import DropdownMenuContent from '../ui/dropdownMenuContent.vue'
import DropdownMenuItem from '../ui/dropdownMenuItem.vue'
import DropdownMenuTrigger from '../ui/dropdownMenuTrigger.vue'


import AlertDialog from '../ui/alertDialog.vue'
import AlertDialogAction from '../ui/alertDialogAction.vue'
import AlertDialogCancel from '../ui/alertDialogCancel.vue'
import AlertDialogContent from '../ui/alertDialogContent.vue'
import AlertDialogDescription from '../ui/alertDialogDescription.vue'
import AlertDialogFooter from '../ui/alertDialogFooter.vue'
import AlertDialogHeader from '../ui/alertDialogHeader.vue'
import AlertDialogTitle from '../ui/alertDialogTitle.vue'

import useMobile from '../ui/useMobile'


import Label from '../ui/label.vue'
//import { EventRevenueChart } from './EventRevenueChart'
import SpaceRevenueByMonthChart from './SpaceRevenueByMonthChart.vue'
import { formatCurrency, formatCurrencyDetailed, formatNumber } from '@/composables/useFormatters'

export default {
  name: 'SpacesPage',
  mixins: [useMobile],
  components: {
    Button,
    Card,
    CardContent,
    ScrollArea,
    Input,

    Plus,
    LayoutGrid,
    Users,
    DollarSign,
    Layers,
    Bell,
    User,
    Menu,
    ShoppingBag,
    Ticket,
    Store,
    TrendingUp,
    Search,
    Filter,
    Pin,
    Trash2,
    Coins,
    Copy,
    ShoppingBasket,
    Calendar,

    NotificationPanel,
    SettingsMenu,
    AppHeader,

    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
    SheetDescription,

    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,

    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,

    Label,
    //EventRevenueChart,
    SpaceRevenueByMonthChart,
  },
  props: {
    onOpenSpace: { type: Function, required: true },
    onNewSpace: { type: Function, required: true },
    onOpenNotifications: { type: Function, required: true },
    onOpenProfile: { type: Function, required: true },
    onOpenMenu: { type: Function, required: true },
    onOpenEditSpace: { type: Function, required: true },
    onEditSpaceFromSettings: { type: Function, required: false },
    onOpenDataIntegration: { type: Function, required: true },
    onOpenUsers: { type: Function, required: true },
    onOpenEvents: { type: Function, required: false },
    onOpenHR: { type: Function, required: false },
    onOpenAccount: { type: Function, required: false },
    onOpenFBIntegration: { type: Function, required: false },
  },

  data() {
    return {
      selectedMenuItem: 'Spaces',

      spaces: [],
      spaceConfigurations: {},

      loading: true,
      sheetOpen: false,
      showNotifications: false,
      searchQuery: '',

      pinnedSpaces: new Set(),

      deleteDialogOpen: false,
      spaceToDelete: null,
      deleteConfirmText: '',

      duplicateDialogOpen: false,
      spaceToDuplicate: null,
      duplicateSpaceName: '',

      salesRevenue: {},
      spaceMetrics: {},

      loadingSpaceId: null,
      allEvents: [],


      menuStructure: {
        Home: ['Spaces', 'Events', 'Overview'],
        Analyse: ['F&B', 'Hospitality', 'Merch', 'Ticketing', 'Storage'],
      },
    }
  },

  computed: {
    // RBAC : création / duplication / suppression d'espace gardées par `space.edit`.
    // Lister/ouvrir un espace ne requiert que `nav.spaces`. (épingler = perso, libre.)
    canEditSpace() {
      return this.$store.getters['auth/can']('space.edit')
    },
    menuFilteredSpaces() {
      return this.filterSpacesByMenuItem(this.spaces)
    },

    searchFilteredSpaces() {
      const q = (this.searchQuery || '').toLowerCase()
      return (this.menuFilteredSpaces || []).filter((space) =>
        (space?.name || '').toLowerCase().includes(q)
      )
    },

    filteredSpaces() {
      return [...(this.searchFilteredSpaces || [])].sort((a, b) => {
        const aIsPinned = this.pinnedSpaces.has(a.id)
        const bIsPinned = this.pinnedSpaces.has(b.id)
        if (aIsPinned && !bIsPinned) return -1
        if (!aIsPinned && bIsPinned) return 1
        return 0
      })
    },

    totalFBRevenue() {
      return (this.spaces || []).reduce(
        (sum, space) => sum + (this.salesRevenue[space.id] || 0),
        0
      )
    },

    totalMerchRevenue() {
      return (this.spaces || []).reduce(
        (sum, space) => sum + this.calculateMerchRevenue(space.id),
        0
      )
    },

    totalTicketingRevenue() {
      return (this.spaces || []).reduce(
        (sum, space) => sum + this.calculateTicketingRevenue(space.id),
        0
      )
    },

    totalRevenue() {
      return this.totalFBRevenue + this.totalMerchRevenue + this.totalTicketingRevenue
    },
  },

  watch: {
    // Debug: Log salesRevenue changes
    salesRevenue: {
      deep: true,
      handler() {
        console.log('[SALES DEBUG] salesRevenue state updated:', this.salesRevenue)
        console.log('[SALES DEBUG] spaceMetrics state updated:', this.spaceMetrics)
      },
    },
    spaceMetrics: {
      deep: true,
      handler() {
        console.log('[SALES DEBUG] salesRevenue state updated:', this.salesRevenue)
        console.log('[SALES DEBUG] spaceMetrics state updated:', this.spaceMetrics)
      },
    },

    spaces: {
      deep: true,
      handler() {
        this.loadSalesRevenue()
      },
    },

    selectedMenuItem: {
      immediate: true,
      handler() {
        this.loadSalesRevenue()
        this.loadAllEventsForMonthlyChart()
      },
    },
  },

  mounted() {

    this.loadSpaces()
    this.loadPinnedSpaces()
  },


  methods: {
    formatCurrency,
    formatCurrencyDetailed,
    formatNumber,

    async loadSpaces() {
      try {
        this.loading = true
        const loadedSpaces = await api.getAllSpaces()
        this.spaces = loadedSpaces

        // Load configurations for all spaces IN PARALLEL (much faster!)
        const configurationsMap = {}
        const configPromises = loadedSpaces.map(async (space) => {
          const configs = await api.getSpaceConfigurations(space.id)
          return { spaceId: space.id, configs }
        })

        const results = await Promise.all(configPromises)
        results.forEach(({ spaceId, configs }) => {
          configurationsMap[spaceId] = configs
        })

        this.spaceConfigurations = configurationsMap
      } catch (error) {
        console.error('Error loading spaces:', error)
      } finally {
        this.loading = false
      }
    },

    async loadPinnedSpaces() {
      try {
        const pinnedIds = await api.getPinnedSpaces()
        this.pinnedSpaces = new Set(pinnedIds)
      } catch (error) {
        console.error('Error loading pinned spaces:', error)
        this.pinnedSpaces = new Set()
      }
    },

    async savePinnedSpaces(pinnedSet) {
      try {
        await api.setPinnedSpaces(Array.from(pinnedSet))
      } catch (error) {
        console.error('Error saving pinned spaces:', error)
      }
    },

    async handleSpaceClick(spaceId) {
      this.loadingSpaceId = spaceId
      await this.onOpenSpace(spaceId)
    },

    async loadSalesRevenue() {
      // Only load sales revenue when it's actually needed for display
      const needsSalesRevenue =
        this.selectedMenuItem === 'Spaces' ||
        this.selectedMenuItem === 'F&B' ||
        this.selectedMenuItem === 'Overview'

      if (!this.spaces || this.spaces.length === 0 || !needsSalesRevenue) {
        console.log(
          `[SALES DEBUG] Skipping sales revenue load (selectedMenuItem: ${this.selectedMenuItem})`
        )
        return
      }

      try {
        console.log(
          `[SALES DEBUG] Loading revenue for ${this.spaces.length} spaces using NEW spaceId-based granular data`
        )

        const revenueMap = {}
        const metricsMap = {}

        const spacePromises = this.spaces.map(async (space) => {
          try {
            console.log(
              `[SALES DEBUG] Fetching granular data for "${space.name}" (${space.id})`
            )

            const granularRecords = await api.getAllShopDetailsBySpace(space.id)

            if (!granularRecords || granularRecords.length === 0) {
              console.log(`[SALES DEBUG] No granular data found for "${space.name}"`)
              return {
                spaceId: space.id,
                revenue: 0,
                metrics: { perCapita: 0, avgTransaction: 0, avgEvent: 0, topShops: [] },
              }
            }

            let totalRevenue = 0
            let totalTransactions = 0
            const uniqueEventIds = new Set()
            const shopRevenueMap = new Map()

            for (const record of granularRecords) {
              totalRevenue += record.revenue || 0
              totalTransactions += record.transactionCount || 0
              if (record.eventId) uniqueEventIds.add(record.eventId)
              const shopName = record.shopName || record.elementName
              if (shopName) {
                shopRevenueMap.set(
                  shopName,
                  (shopRevenueMap.get(shopName) || 0) + (record.revenue || 0)
                )
              }
            }

            // Top 3 shops par CA all-time (cf. doc §4)
            const topShops = Array.from(shopRevenueMap.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([name, revenue]) => ({ name, revenue }))

            const eventCount = uniqueEventIds.size

            const avgTransaction =
              totalTransactions > 0 ? totalRevenue / totalTransactions : 0
            const avgEvent = eventCount > 0 ? totalRevenue / eventCount : 0

            let perCapita = 0
            if (eventCount > 0) {
              try {
                const allEvents = await eventApi.getAllEvents()
                const spaceEvents = allEvents.filter((e) => e.spaceId === space.id)
                const relevantEvents = spaceEvents.filter((e) => uniqueEventIds.has(e.id))

                const totalAttendance = relevantEvents.reduce((sum, e) => {
                  const attendance = e.ticketsScanned || e.ticketsSold || 0
                  return sum + attendance
                }, 0)

                console.log(
                  `[SALES DEBUG] "${space.name}" - Events: ${relevantEvents.length}, Total Attendance: ${totalAttendance}, Revenue: €${totalRevenue}`
                )

                if (totalAttendance > 0) {
                  perCapita = totalRevenue / totalAttendance
                  console.log(
                    `[SALES DEBUG] "${space.name}" - Per Capita: €${perCapita.toFixed(2)}`
                  )
                } else {
                  console.log(`[SALES DEBUG] "${space.name}" - No attendance data available`)
                }
              } catch (error) {
                console.log(
                  `[SALES DEBUG] Could not fetch event attendance for "${space.name}":`,
                  error
                )
              }
            }

            console.log(
              `[SALES DEBUG] "${space.name}": €${totalRevenue.toLocaleString()} | ${eventCount} events | ${totalTransactions} transactions`
            )

            return {
              spaceId: space.id,
              revenue: totalRevenue,
              metrics: { perCapita, avgTransaction, avgEvent, topShops },
            }
          } catch (error) {
            console.log(
              `[SALES DEBUG] Error fetching granular data for space "${space.name}":`,
              error
            )
            return {
              spaceId: space.id,
              revenue: 0,
              metrics: { perCapita: 0, avgTransaction: 0, avgEvent: 0, topShops: [] },
            }
          }
        })

        const results = await Promise.all(spacePromises)
        results.forEach(({ spaceId, revenue, metrics }) => {
          revenueMap[spaceId] = revenue
          metricsMap[spaceId] = metrics
        })

        console.log(`[SALES DEBUG] Final revenue map:`, revenueMap)
        console.log(`[SALES DEBUG] Final metrics map:`, metricsMap)

        this.salesRevenue = revenueMap
        this.spaceMetrics = metricsMap
      } catch (error) {
        console.error('[SALES DEBUG] Error loading sales revenue:', error)
      }
    },

    // Load all events when F&B is selected (for the monthly chart)
    async loadAllEventsForMonthlyChart() {
      if (this.selectedMenuItem !== 'F&B') return

      try {
        console.log('[SPACE REVENUE CHART] Loading all events for monthly chart')
        const events = await eventApi.getAllEvents()
        console.log('[SPACE REVENUE CHART] Loaded events:', (events && events.length) || 0)
        this.allEvents = events || []
      } catch (error) {
        console.error('[SPACE REVENUE CHART] Error loading events:', error)
        this.allEvents = []
      }
    },

    // Calculate max capacity across all configurations in a space - MEMOIZED
    // PHASE 2: Now uses cachedMetrics if available, falls back to calculation
    getMaxCapacity(spaceId) {
      const space = (this.spaces || []).find((s) => s.id === spaceId)
      if (space?.cachedMetrics?.maxCapacity !== undefined) {
        return space.cachedMetrics.maxCapacity
      }

      const configs = this.spaceConfigurations[spaceId] || []
      if (configs.length === 0) return undefined

      const capacities = configs
        .map((c) => c.capacity)
        .filter((c) => c !== undefined)

      return capacities.length > 0 ? Math.max(...capacities) : undefined
    },

    // Calculate total revenue from all shops across all configurations in a space - MEMOIZED
    // PHASE 2: Now uses cachedMetrics if available, falls back to calculation
    calculateTotalRevenue(spaceId) {
      const space = (this.spaces || []).find((s) => s.id === spaceId)
      if (space?.cachedMetrics?.totalRevenue !== undefined) {
        return space.cachedMetrics.totalRevenue
      }

      const configs = this.spaceConfigurations[spaceId] || []
      let maxRevenue = 0

      configs.forEach((config) => {
        let configRevenue = 0
        const data = config.data

        if (data.floors) {
          data.floors.forEach((floor) => {
            floor.elements?.forEach((element) => {
              if (element.type === 'shop' && element.performance?.revenue) {
                configRevenue += element.performance.revenue
              }
              if (element.type === 'merchshop' && element.performance?.revenue) {
                configRevenue += element.performance.revenue
              }
            })
          })
        }

        if (data.forecourt) {
          data.forecourt.elements?.forEach((element) => {
            if (element.type === 'shop' && element.performance?.revenue) {
              configRevenue += element.performance.revenue
            }
            if (element.type === 'merchshop' && element.performance?.revenue) {
              configRevenue += element.performance.revenue
            }
          })
        }

        if (data.externalMerch) {
          data.externalMerch.elements?.forEach((element) => {
            if (element.type === 'merchshop' && element.performance?.revenue) {
              configRevenue += element.performance.revenue
            }
          })
        }

        maxRevenue = Math.max(maxRevenue, configRevenue)
      })

      return maxRevenue
    },

    // Calculate F&B revenue only - MEMOIZED
    // PHASE 2: Now uses cachedMetrics if available, falls back to calculation
    calculateFBRevenue(spaceId) {
      const space = (this.spaces || []).find((s) => s.id === spaceId)
      if (space?.cachedMetrics?.fbRevenue !== undefined) {
        return space.cachedMetrics.fbRevenue
      }

      const configs = this.spaceConfigurations[spaceId] || []
      let maxRevenue = 0

      configs.forEach((config) => {
        let configRevenue = 0
        const data = config.data

        const checkElements = (elements) => {
          elements?.forEach((element) => {
            if (element.type === 'shop' && element.performance?.revenue) {
              configRevenue += element.performance.revenue
            }
          })
        }

        if (data.floors) {
          data.floors.forEach((floor) => checkElements(floor.elements))
        }
        if (data.forecourt) {
          checkElements(data.forecourt.elements)
        }

        maxRevenue = Math.max(maxRevenue, configRevenue)
      })

      return maxRevenue
    },

    // Calculate Merch revenue only - MEMOIZED
    // PHASE 2: Now uses cachedMetrics if available, falls back to calculation
    calculateMerchRevenue(spaceId) {
      const space = (this.spaces || []).find((s) => s.id === spaceId)
      if (space?.cachedMetrics?.merchRevenue !== undefined) {
        return space.cachedMetrics.merchRevenue
      }

      const configs = this.spaceConfigurations[spaceId] || []
      let maxRevenue = 0

      configs.forEach((config) => {
        let configRevenue = 0
        const data = config.data

        const checkElements = (elements) => {
          elements?.forEach((element) => {
            if (element.type === 'merchshop' && element.performance?.revenue) {
              configRevenue += element.performance.revenue
            }
          })
        }

        if (data.floors) {
          data.floors.forEach((floor) => checkElements(floor.elements))
        }
        if (data.forecourt) {
          checkElements(data.forecourt.elements)
        }
        if (data.externalMerch) {
          checkElements(data.externalMerch.elements)
        }

        maxRevenue = Math.max(maxRevenue, configRevenue)
      })

      return maxRevenue
    },

    // Calculate Ticketing revenue (placeholder) - MEMOIZED
    // PHASE 2: Now uses cachedMetrics if available, falls back to 0
    calculateTicketingRevenue(spaceId) {
      const space = (this.spaces || []).find((s) => s.id === spaceId)
      if (space?.cachedMetrics?.ticketingRevenue !== undefined) {
        return space.cachedMetrics.ticketingRevenue
      }

      return 0
    },

    // Get number of configurations for a space - MEMOIZED
    // PHASE 2: Now uses cachedMetrics if available, falls back to calculation
    getConfigurationsCount(spaceId) {
      const space = (this.spaces || []).find((s) => s.id === spaceId)
      if (space?.cachedMetrics?.configurationCount !== undefined) {
        return space.cachedMetrics.configurationCount
      }

      return (this.spaceConfigurations[spaceId] || []).length
    },

    filterSpacesByMenuItem(spaces) {
      if (
        this.selectedMenuItem === 'Spaces' ||
        this.selectedMenuItem === 'Events' ||
        this.selectedMenuItem === 'Overview'
      ) {
        return spaces
      }

      return (spaces || []).filter((space) => {
        const configs = this.spaceConfigurations[space.id] || []

        return configs.some((config) => {
          const data = config.data
          let hasRelevantElements = false

          const checkElements = (elements) => {
            if (!elements) return false

            switch (this.selectedMenuItem) {
              case 'F&B':
                return elements.some((el) => el.type === 'shop')
              case 'Hospitality':
                return elements.some((el) => el.type === 'hospitality')
              case 'Merch':
                return elements.some((el) => el.type === 'merchshop')
              case 'Storage':
                return elements.some((el) => el.type === 'storage')
              case 'Ticketing':
                return elements.some(
                  (el) => el.type === 'access' && el.accessType?.includes('reception')
                )
              default:
                return false
            }
          }

          if (data.floors) {
            hasRelevantElements = data.floors.some((floor) => checkElements(floor.elements))
          }

          if (!hasRelevantElements && data.forecourt) {
            hasRelevantElements = checkElements(data.forecourt.elements)
          }

          if (!hasRelevantElements && data.externalMerch) {
            hasRelevantElements = checkElements(data.externalMerch.elements)
          }

          return hasRelevantElements
        })
      })
    },

    // Handler functions - MEMOIZED
    handleTogglePin(spaceId) {
      const newSet = new Set(this.pinnedSpaces)
      if (newSet.has(spaceId)) {
        newSet.delete(spaceId)
      } else {
        newSet.add(spaceId)
      }
      this.pinnedSpaces = newSet
      this.savePinnedSpaces(newSet)
    },

    handleDeleteClick(spaceId) {
      this.spaceToDelete = spaceId
      this.deleteConfirmText = ''
      this.deleteDialogOpen = true
    },

    async handleDeleteConfirm() {
      if (String(this.deleteConfirmText || '').toLowerCase() !== 'delete' || !this.spaceToDelete) {
        return
      }

      try {
        await api.deleteSpace(this.spaceToDelete)
        this.spaces = (this.spaces || []).filter((s) => s.id !== this.spaceToDelete)

        const newSet = new Set(this.pinnedSpaces)
        newSet.delete(this.spaceToDelete)
        this.pinnedSpaces = newSet

        this.deleteDialogOpen = false
        this.spaceToDelete = null
        this.deleteConfirmText = ''
      } catch (error) {
        console.error('Error deleting space:', error)
      }
    },

    handleDuplicateClick(spaceId, spaceName) {
      this.spaceToDuplicate = spaceId
      this.duplicateSpaceName = `${spaceName} (Copy)`
      this.duplicateDialogOpen = true
    },

    async handleDuplicateConfirm() {
      if (!this.spaceToDuplicate || !String(this.duplicateSpaceName || '').trim()) {
        return
      }

      try {
        const originalSpace = (this.spaces || []).find((s) => s.id === this.spaceToDuplicate)
        if (!originalSpace) {
          console.error('Original space not found')
          return
        }

        const newSpaceId = `space-${Date.now()}`
        const newSpace = {
          ...originalSpace,
          id: newSpaceId,
          name: String(this.duplicateSpaceName).trim(),
        }

        await api.saveSpace(newSpace)

        const originalConfigs = this.spaceConfigurations[this.spaceToDuplicate] || []

        const newConfigs = []
        for (const config of originalConfigs) {
          const newConfigId = `config-${Date.now()}-${Math.random()
            .toString(36)
            .substr(2, 9)}`
          const newConfig = {
            ...config,
            id: newConfigId,
            spaceId: newSpaceId,
          }
          await api.saveConfiguration(newConfig)
          newConfigs.push(newConfig)
        }

        this.spaces = [...(this.spaces || []), newSpace]
        this.spaceConfigurations = {
          ...this.spaceConfigurations,
          [newSpaceId]: newConfigs,
        }

        this.duplicateDialogOpen = false
        this.spaceToDuplicate = null
        this.duplicateSpaceName = ''
      } catch (error) {
        console.error('Error duplicating space:', error)
      }
    },
  },
}
</script>