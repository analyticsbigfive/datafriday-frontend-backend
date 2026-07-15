<template>
  <div class="h-full flex flex-col">
    <Card class="h-full overflow-auto">
      <!-- Header -->
      <CardHeader
        class="sticky top-0 z-20 bg-white dark:bg-gray-900 border-b dark:border-gray-700 shadow-sm"
      >
        <!-- Titre + toggle header -->
        <div
          class="flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 -mx-6 px-6 py-2 -mt-2 rounded-md transition-colors"
          @click="headerExpanded = !headerExpanded"
        >
          <CardTitle>Space Menus</CardTitle>
          <div class="h-8 w-8 flex items-center justify-center">
            <ChevronUp
              v-if="headerExpanded"
              class="h-4 w-4"
            />
            <ChevronDown
              v-else
              class="h-4 w-4"
            />
          </div>
        </div>

        <Collapsible :open="headerExpanded">
          <CollapsibleContent>
            <!-- Space and Configuration Selectors -->
            <div class="grid grid-cols-2 gap-4 pt-4">
              <!-- Space -->
              <div class="space-y-2">
                <Label>Space</Label>
                <Select
                  :value="selectedSpaceId"
                  :onValueChange="value => {
                    selectedSpaceId = value
                    selectedConfigId = ''
                    expandedElements = new Set()
                    selectedMenuItems = new Map()
                  }"
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a space" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="space in spaces"
                      :key="space.id"
                      :value="space.id"
                    >
                      {{ space.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <!-- Configuration -->
              <div class="space-y-2">
                <Label>Configuration</Label>
                <Select
                  :value="selectedConfigId"
                  :onValueChange="value => {
                    selectedConfigId = value
                    expandedElements = new Set()
                    selectedMenuItems = new Map()
                  }"
                  :disabled="!selectedSpaceId || loadingConfigs"
                >
                  <SelectTrigger>
                    <SelectValue
                      :placeholder="loadingConfigs ? 'Loading...' : 'Select a configuration'"
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="config in configurations"
                      :key="config.id"
                      :value="config.id"
                    >
                      {{ config.name }}{{ config.capacity ? ` (${config.capacity})` : '' }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <!-- View Mode Toggle + Search -->
            <div
              v-if="selectedSpaceId && selectedConfigId && fbElements.length > 0"
              class="pt-4 space-y-3"
            >
              <Tabs
                :value="viewMode"
                :onValueChange="value => (viewMode = value)"
              >
                <TabsList class="grid w-full grid-cols-2">
                  <TabsTrigger value="by-shop">By Shop</TabsTrigger>
                  <TabsTrigger value="by-menu-item">By Menu Item</TabsTrigger>
                </TabsList>
              </Tabs>

              <!-- Search Field -->
              <div class="relative">
                <Search
                  class="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400"
                />
                <Input
                  type="text"
                  :placeholder="
                    viewMode === 'by-shop'
                      ? 'Search shops...'
                      : 'Search menu items...'
                  "
                  :value="searchQuery"
                  @input="e => (searchQuery = e.target.value)"
                  class="pl-10"
                />
              </div>
            </div>

            <!-- Save Button -->
            <div
              v-if="selectedSpaceId && selectedConfigId && fbElements.length > 0"
              class="pt-4"
            >
              <Button
                @click="handleSave"
                class="w-full bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
              >
                Save Menu Configuration
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardHeader>

      <!-- Content -->
      <CardContent class="p-6">
        <!-- Loading -->
        <div
          v-if="loadingData"
          class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400"
        >
          <p class="text-center mb-4">Loading data</p>
          <Loader2 class="w-8 h-8 animate-spin" />
        </div>

        <!-- No space selected: show space cards -->
        <div v-else-if="!selectedSpaceId">
          <div class="mb-6">
            <h3 class="text-lg mb-2">Select a Space</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              Choose a space to configure its menu
            </p>
          </div>

          <div
            v-if="spaces.length === 0"
            class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400"
          >
            <Store class="w-12 h-12 mb-4 opacity-50" />
            <p class="text-center">No spaces available</p>
            <p class="text-sm text-center mt-2">
              Create a space in the Spaces page
            </p>
          </div>
          <div
            v-else
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <Card
              v-for="space in spaces"
              :key="space.id"
              class="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer bg-white dark:bg-gray-900 dark:border-gray-800"
              @click="handleSelectSpaceCard(space.id)"
            >
              <CardContent class="p-0">
                <!-- Space Image / Preview -->
                <div
                  class="bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 h-48 flex items-center justify-center relative overflow-hidden group/image"
                >
                  <template v-if="space.image">
                    <ImageWithFallback
                      :src="space.image"
                      :alt="space.name"
                      class="w-full h-full object-cover transition-transform group-hover/image:scale-105"
                    />
                    <div
                      class="absolute inset-0 bg-black/0 group-hover/image:bg-black/10 dark:group-hover/image:bg-black/20 transition-colors"
                    />
                  </template>
                  <template v-else>
                    <LayoutGrid
                      class="w-16 h-16 text-blue-400 dark:text-blue-500 transition-transform group-hover/image:scale-110"
                    />
                  </template>

                  <!-- Top gradient + title -->
                  <div
                    class="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/70 dark:from-black/80 to-transparent p-4"
                  >
                    <h3 class="font-semibold text-white truncate">
                      {{ space.name }}
                    </h3>
                  </div>

                  <!-- Bottom gradient + max capacity -->
                  <div
                    class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 dark:from-black/80 to-transparent p-4"
                  >
                    <div class="flex items-center gap-2 text-white">
                      <Users class="w-4 h-4" />
                      <span class="font-semibold">
                        {{
                          getMaxCapacity(space.id)?.toLocaleString() || 'N/A'
                        }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Space info -->
                <div class="p-4 space-y-3 bg-white dark:bg-gray-900">
                  <div class="space-y-2">
                    <div
                      class="flex items-center justify-between text-sm"
                    >
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
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <!-- Space selected but no config -->
        <div
          v-else-if="!selectedConfigId"
          class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400"
        >
          <Store class="w-12 h-12 mb-4 opacity-50" />
          <p class="text-center">
            Select a configuration to view F&amp;B elements
          </p>
        </div>

        <!-- No F&B elements -->
        <div
          v-else-if="fbElements.length === 0"
          class="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400"
        >
          <AlertCircle class="w-12 h-12 mb-4 opacity-50" />
          <p class="text-center">
            No F&amp;B elements found in this configuration
          </p>
          <p class="text-sm text-center mt-2">
            Add shop elements in the 3D Edit View
          </p>
        </div>

        <!-- By-shop view -->
        <div v-else-if="viewMode === 'by-shop'" class="space-y-6">
          <div
            v-if="Object.keys(filteredElementsByType).length === 0"
            class="flex flex-col items-center justify-center py-12 text-gray-500"
          >
            <Search class="w-12 h-12 mb-4 opacity-50" />
            <p class="text-center">
              No shops found matching "{{ searchQuery }}"
            </p>
          </div>
          <div v-else>
            <div
              v-for="(elements, compositeKey) in filteredElementsByType"
              :key="compositeKey"
              class="space-y-3"
            >
              <!-- F&B Type Header -->
              <div class="flex items-center gap-2 pb-2 border-b">
                <component
                  :is="getCompositeIcon(compositeKey)"
                  class="w-5 h-5 text-gray-600"
                />
                <h3 class="font-semibold text-lg">
                  {{ getCompositeLabel(compositeKey) }}
                </h3>
                <Badge variant="secondary">
                  {{ elements.length }}
                </Badge>
              </div>

              <!-- F&B Element Cards -->
              <div
                class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                <div
                  v-for="element in elements"
                  :key="element.id"
                >
                  <Card
                    class="overflow-hidden h-full transition-all duration-300"
                    :class="{
                      'ring-2 ring-blue-500 shadow-lg':
                        editingElementId === element.id,
                    }"
                  >
                    <!-- Top: image + header + (optionnel) panneau droit si édition -->
                    <div :class="editingElementId === element.id ? 'grid grid-cols-2' : ''">
                      <!-- Left column -->
                      <div class="relative">
                        <!-- Image -->
                        <div
                          class="aspect-video bg-gray-100 dark:bg-gray-800 relative overflow-hidden cursor-pointer group"
                          @click="() => {
                            if (editingElementId !== element.id) {
                              toggleElement(element.id)
                            }
                          }"
                        >
                          <template v-if="element.image">
                            <ImageWithFallback
                              :src="element.image"
                              :alt="element.name"
                              class="w-full h-full object-cover"
                            />
                          </template>
                          <template v-else>
                            <div
                              class="w-full h-full flex items-center justify-center"
                            >
                              <Store
                                class="w-12 h-12 text-gray-400 dark:text-gray-500"
                              />
                            </div>
                          </template>

                          <!-- Overlay name + stats -->
                          <div
                            class="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-3"
                          >
                            <div
                              class="flex items-start justify-between gap-2"
                            >
                              <div
                                class="flex items-center gap-2 flex-1 min-w-0"
                              >
                                <!-- Quick Edit Button -->
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  class="h-6 w-6 rounded-full flex-shrink-0 transition-colors"
                                  :class="
                                    editingElementId === element.id
                                      ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                      : 'bg-white/90 hover:bg-white text-gray-700'
                                  "
                                  @click.stop="
                                    () => {
                                      if (editingElementId === element.id) {
                                        handleCancelEdit()
                                      } else {
                                        handleStartEdit(element)
                                      }
                                    }
                                  "
                                >
                                  <X
                                    v-if="editingElementId === element.id"
                                    class="w-3 h-3"
                                  />
                                  <Edit2
                                    v-else
                                    class="w-3 h-3"
                                  />
                                </Button>

                                <h4
                                  class="text-white font-semibold flex-1 min-w-0 truncate"
                                >
                                  {{ element.name }}
                                </h4>

                                <!-- Règle 1 : badge d'écart vs mapping (non bloquant) -->
                                <span
                                  v-if="divergenceByElement[element.id] && (divergenceByElement[element.id].itemsHorsMapping.length || divergenceByElement[element.id].produitsNonListes.length)"
                                  class="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-amber-400/90 text-amber-950 text-[10px] font-medium px-2 py-0.5"
                                  :title="`Écart vs mapping Weezevent — ${divergenceByElement[element.id].itemsHorsMapping.length} hors mapping, ${divergenceByElement[element.id].produitsNonListes.length} vendus non listés`"
                                >
                                  ⚠
                                  <span v-if="divergenceByElement[element.id].itemsHorsMapping.length">{{ divergenceByElement[element.id].itemsHorsMapping.length }} hors mapping</span>
                                  <span v-if="divergenceByElement[element.id].produitsNonListes.length">{{ divergenceByElement[element.id].produitsNonListes.length }} non listés</span>
                                </span>
                              </div>
                              <div
                                class="text-white text-xs font-medium whitespace-nowrap"
                              >
                                Items for sale:
                                {{
                                  (selectedMenuItems.get(element.id) ||
                                    new Set()).size
                                }}/{{ getMenuItemsForElement(element).length }}
                              </div>
                            </div>
                          </div>
                        </div>

                        <!-- Stats bar -->
                        <div
                          class="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 flex items-center justify-between text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          @click="() => {
                            if (editingElementId !== element.id) {
                              toggleElement(element.id)
                            }
                          }"
                        >
                          <span
                            class="text-gray-600 dark:text-gray-300"
                          >
                            Menu Items
                          </span>
                          <div class="flex items-center gap-2">
                            <span
                              class="text-green-600 dark:text-green-400 font-semibold"
                            >
                              {{
                                getMenuItemsForElement(element).filter(
                                  item => item.isAvailable,
                                ).length
                              }}
                            </span>
                            <span
                              class="text-gray-400 dark:text-gray-500"
                              >/</span
                            >
                            <span
                              class="text-gray-600 dark:text-gray-300"
                            >
                              {{
                                getMenuItemsForElement(element).length
                              }}
                            </span>
                            <div class="ml-2">
                              <ChevronUp
                                v-if="expandedElements.has(element.id)"
                                class="w-4 h-4 text-gray-600 dark:text-gray-400"
                              />
                              <ChevronDown
                                v-else
                                class="w-4 h-4 text-gray-600 dark:text-gray-400"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <!-- Right column: Quick Edit Panel -->
                      <div
                        v-if="editingElementId === element.id"
                        class="border-l-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-gray-50 dark:from-blue-950 dark:to-gray-900 flex flex-col justify-between"
                      >
                        <div
                          class="p-4 space-y-4 flex-1 flex flex-col justify-center"
                        >
                          <!-- Edit Panel Header -->
                          <div
                            class="pb-2 border-b border-blue-200 dark:border-blue-800"
                          >
                            <h3
                              class="font-semibold text-blue-900 dark:text-blue-100"
                            >
                              Quick Edit
                            </h3>
                          </div>

                          <!-- Shop Name -->
                          <div class="space-y-1">
                            <Label class="text-sm font-semibold">Shop Name</Label>
                            <Input
                              v-model="editName"
                              placeholder="Nom du shop"
                              class="text-sm"
                            />
                          </div>

                          <!-- Image Upload/Edit -->
                          <div class="space-y-2">
                            <Label class="text-sm font-semibold"
                              >Shop Image</Label
                            >
                            <div class="space-y-2">
                              <!-- Preview -->
                              <div
                                class="relative aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden border-2 border-dashed border-gray-300 dark:border-gray-600"
                              >
                                <template v-if="imagePreview">
                                  <ImageWithFallback
                                    :src="imagePreview"
                                    alt="Shop preview"
                                    class="w-full h-full object-cover"
                                  />
                                  <button
                                    class="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow-lg"
                                    type="button"
                                    @click="handleRemoveImage"
                                  >
                                    <Trash2 class="w-3.5 h-3.5" />
                                  </button>
                                </template>
                                <template v-else>
                                  <div
                                    class="w-full h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500"
                                  >
                                    <ImageIcon class="w-8 h-8 mb-2" />
                                    <span class="text-xs">No image</span>
                                  </div>
                                </template>
                              </div>

                              <!-- Upload Button -->
                              <div>
                                <input
                                  id="image-upload"
                                  type="file"
                                  accept="image/*"
                                  class="hidden"
                                  @change="handleImageUpload"
                                />
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  class="w-full"
                                  @click="() => document.getElementById('image-upload')?.click()"
                                >
                                  <Upload class="w-4 h-4 mr-2" />
                                  {{
                                    imagePreview
                                      ? 'Change Image'
                                      : 'Upload Image'
                                  }}
                                </Button>
                              </div>
                            </div>
                          </div>

                          <!-- Shop Types -->
                          <div class="space-y-2">
                            <Label class="text-sm font-semibold"
                              >Shop Types</Label
                            >
                            <div class="flex flex-wrap gap-2">
                              <div
                                v-for="type in ['food', 'beverages', 'beer', 'gppremium', 'temporary', 'drinkee']"
                                :key="type"
                              >
                                <Button
                                  :variant="
                                    editShopTypes.includes(type)
                                      ? 'default'
                                      : 'outline'
                                  "
                                  size="sm"
                                  class="capitalize gap-1.5"
                                  @click="() => toggleShopType(type)"
                                >
                                  <component
                                    :is="FB_TYPE_ICONS[type] || Store"
                                    class="w-3.5 h-3.5"
                                  />
                                  {{ FB_TYPE_LABELS[type] || type }}
                                </Button>
                              </div>
                            </div>
                          </div>

                          <!-- Configurations text -->
                          <div class="space-y-2">
                            <Label class="text-sm font-semibold"
                              >Available in Configurations</Label
                            >
                            <div
                              class="text-sm text-gray-600 dark:text-gray-300"
                            >
                              {{
                                editConfigIds
                                  .map(configId => {
                                    const config = configurations.find(
                                      c => c.id === configId,
                                    )
                                    return config?.name
                                  })
                                  .filter(Boolean)
                                  .join(', ') || 'Current configuration'
                              }}
                            </div>
                          </div>

                          <!-- Save / Cancel -->
                          <div class="flex gap-2 pt-2">
                            <div class="flex-1">
                              <Button
                                size="sm"
                                class="w-full"
                                :disabled="savingElement"
                                @click="() => handleSaveEdit(element)"
                              >
                                <Loader2 v-if="savingElement" class="w-4 h-4 mr-2 animate-spin" />
                                <Save v-else class="w-4 h-4 mr-2" />
                                {{ savingElement ? 'Saving...' : 'Save Changes' }}
                              </Button>
                            </div>
                            <div>
                              <Button
                                size="sm"
                                variant="outline"
                                @click="handleCancelEdit"
                              >
                                <X class="w-4 h-4 mr-2" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- Bottom: collapsible menu items -->
                    <Collapsible
                      :open="expandedElements.has(element.id)"
                      @update:open="() => {
                        if (editingElementId !== element.id) {
                          toggleElement(element.id)
                        }
                      }"
                    >
                      <CollapsibleContent>
                        <div class="border-t overflow-hidden min-w-0">
                          <Tabs
                            :value="activeTab"
                            :onValueChange="val => (activeTab = val)"
                            class="w-full min-w-0"
                          >
                            <div
                              class="border-b px-3 pt-3 overflow-hidden min-w-0"
                            >
                              <TabsList class="w-full grid grid-cols-2">
                                <TabsTrigger
                                  value="available"
                                  class="gap-2"
                                >
                                  Available
                                  <Badge
                                    variant="secondary"
                                    class="ml-1"
                                  >
                                    {{
                                      getMenuItemsForElement(element).filter(
                                        item => item.isAvailable,
                                      ).length
                                    }}
                                  </Badge>
                                </TabsTrigger>
                                <TabsTrigger
                                  value="not-available"
                                  class="gap-2"
                                >
                                  Not Available
                                  <Badge
                                    variant="secondary"
                                    class="ml-1"
                                  >
                                    {{
                                      getMenuItemsForElement(element).filter(
                                        item => !item.isAvailable,
                                      ).length
                                    }}
                                  </Badge>
                                </TabsTrigger>
                              </TabsList>
                            </div>

                            <!-- Available tab -->
                            <TabsContent
                              value="available"
                              class="mt-0 overflow-hidden min-w-0"
                            >
                              <ScrollArea class="h-[400px] w-full">
                                <div class="p-3 space-y-2 min-w-0">
                                  <template
                                    v-if="
                                      getMenuItemsForElement(element).filter(
                                        item => item.isAvailable,
                                      ).length === 0
                                    "
                                  >
                                    <p
                                      class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
                                    >
                                      No available menu items for this
                                      F&amp;B type
                                    </p>
                                  </template>
                                  <template v-else>
                                    <!-- Select All -->
                                    <div
                                      class="flex items-center gap-2 p-2 rounded bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 min-w-0"
                                    >
                                      <Checkbox
                                        :id="`select-all-${element.id}`"
                                        :checked="
                                          areAllMenuItemsSelected(
                                            element.id,
                                            getMenuItemsForElement(element),
                                          )
                                        "
                                        @update:checked="
                                          () =>
                                            toggleAllMenuItemsForElement(
                                              element.id,
                                              getMenuItemsForElement(element),
                                            )
                                        "
                                        class="flex-shrink-0"
                                      />
                                      <Label
                                        :for="`select-all-${element.id}`"
                                        class="text-sm font-semibold text-blue-900 dark:text-blue-100 cursor-pointer flex-1 min-w-0 truncate"
                                      >
                                        Select All Available Items ({{
                                          getMenuItemsForElement(element).filter(
                                            item => item.isAvailable,
                                          ).length
                                        }})
                                      </Label>
                                    </div>

                                    <!-- Menu items list -->
                                    <div
                                      v-for="item in getMenuItemsForElement(element)
                                        .filter(it => it.isAvailable)
                                        .sort((a, b) =>
                                          a.name.localeCompare(b.name),
                                        )"
                                      :key="item.id"
                                      class="flex items-center gap-2 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors min-w-0"
                                    >
                                      <!-- Picture -->
                                      <div
                                        class="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-800"
                                      >
                                        <template v-if="item.picture">
                                          <ImageWithFallback
                                            :src="item.picture"
                                            :alt="item.name"
                                            class="w-full h-full object-cover"
                                          />
                                        </template>
                                        <template v-else>
                                          <div
                                            class="w-full h-full flex items-center justify-center"
                                          >
                                            <Store
                                              class="w-5 h-5 text-gray-400 dark:text-gray-500"
                                            />
                                          </div>
                                        </template>
                                      </div>

                                      <!-- Title + category -->
                                      <div
                                        class="flex-1 min-w-0 overflow-hidden"
                                      >
                                        <div
                                          class="text-sm max-w-[50%] break-words"
                                        >
                                          {{ item.name }}
                                        </div>
                                        <div
                                          v-if="item.category"
                                          class="text-xs text-gray-500 dark:text-gray-400 truncate"
                                        >
                                          {{ item.category }}
                                        </div>
                                      </div>

                                      <!-- Price -->
                                      <div
                                        v-if="item.displayPrice !== undefined"
                                        class="text-sm text-gray-600 dark:text-gray-300 flex-shrink-0 whitespace-nowrap"
                                      >
                                        ${{ item.displayPrice.toFixed(2) }}
                                      </div>

                                      <!-- Checkbox -->
                                      <Checkbox
                                        :id="`${element.id}-${item.id}`"
                                        :checked="
                                          isMenuItemSelected(
                                            element.id,
                                            item.id,
                                          )
                                        "
                                        @update:checked="
                                          () =>
                                            toggleMenuItem(
                                              element.id,
                                              item.id,
                                            )
                                        "
                                        class="flex-shrink-0"
                                      />
                                    </div>
                                  </template>
                                </div>
                              </ScrollArea>
                            </TabsContent>

                            <!-- Not-available tab -->
                            <TabsContent
                              value="not-available"
                              class="mt-0 overflow-hidden min-w-0"
                            >
                              <ScrollArea class="h-[400px] w-full">
                                <div class="p-3 space-y-2 min-w-0">
                                  <template
                                    v-if="
                                      getMenuItemsForElement(element).filter(
                                        item => !item.isAvailable,
                                      ).length === 0
                                    "
                                  >
                                    <p
                                      class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
                                    >
                                      All menu items are available!
                                    </p>
                                  </template>
                                  <template v-else>
                                    <TooltipProvider>
                                      <Tooltip
                                        v-for="item in getMenuItemsForElement(
                                          element,
                                        )
                                          .filter(it => !it.isAvailable)
                                          .sort((a, b) =>
                                            a.name.localeCompare(b.name),
                                          )"
                                        :key="item.id"
                                      >
                                        <TooltipTrigger as-child>
                                          <div
                                            class="flex items-center gap-3 p-2 rounded bg-gray-50 dark:bg-gray-800 opacity-60 cursor-help"
                                          >
                                            <!-- Picture -->
                                            <div
                                              class="w-12 h-12 rounded overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-700"
                                            >
                                              <template v-if="item.picture">
                                                <ImageWithFallback
                                                  :src="item.picture"
                                                  :alt="item.name"
                                                  class="w-full h-full object-cover"
                                                />
                                              </template>
                                              <template v-else>
                                                <div
                                                  class="w-full h-full flex items-center justify-center"
                                                >
                                                  <Store
                                                    class="w-6 h-6 text-gray-400 dark:text-gray-500"
                                                  />
                                                </div>
                                              </template>
                                            </div>

                                            <!-- Title + category -->
                                            <div class="flex-1 min-w-0">
                                              <div
                                                class="text-sm truncate line-through"
                                              >
                                                {{ item.name }}
                                              </div>
                                              <div
                                                v-if="item.category"
                                                class="text-xs text-gray-500 dark:text-gray-400 truncate"
                                              >
                                                {{ item.category }}
                                              </div>
                                            </div>

                                            <!-- Price -->
                                            <div
                                              v-if="
                                                item.displayPrice !== undefined
                                              "
                                              class="text-sm text-gray-600 dark:text-gray-300 flex-shrink-0"
                                            >
                                              ${{ item.displayPrice.toFixed(2) }}
                                            </div>

                                            <!-- Alert icon -->
                                            <AlertCircle
                                              class="w-4 h-4 text-red-500 flex-shrink-0"
                                            />
                                          </div>
                                        </TooltipTrigger>
                                        <TooltipContent
                                          side="left"
                                          class="max-w-xs"
                                        >
                                          <p class="font-semibold mb-1">
                                            Missing Ingredients:
                                          </p>
                                          <ul
                                            class="text-sm list-disc list-inside"
                                          >
                                            <li
                                              v-for="(ing, idx) in (item.missingIngredients && item.missingIngredients.length > 0
                                                ? item.missingIngredients
                                                : ['Unknown ingredients'])"
                                              :key="idx"
                                            >
                                              {{ ing }}
                                            </li>
                                          </ul>
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </template>
                                </div>
                              </ScrollArea>
                            </TabsContent>
                          </Tabs>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </Card>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- By-menu-item view -->
        <SpaceMenusByMenuItem
          v-else
          :menuItemsByCategory="filteredMenuItemsByCategory"
          :expandedElements="expandedElements"
          :toggleElement="toggleElement"
          :getCompatibleShopsForMenuItem="getCompatibleShopsForMenuItem"
          :isMenuItemSelected="isMenuItemSelected"
          :toggleMenuItem="toggleMenuItem"
          :toggleAllShopsForMenuItem="toggleAllShopsForMenuItem"
          :areAllShopsSelectedForMenuItem="areAllShopsSelectedForMenuItem"
          :FB_TYPE_LABELS="FB_TYPE_LABELS"
          :searchQuery="searchQuery"
        />
      </CardContent>
    </Card>
  </div>
</template>

<script>
import Card from '../ui/card.vue'
import CardContent from '../ui/cardContent.vue'
import CardHeader from '../ui/cardHeader.vue'
import CardTitle from '../ui/cardTitle.vue'
import Button from '../ui/button.vue'
import Label from '../ui/label.vue'
import Input from '../ui/input.vue'
import Select from '../ui/select.vue'
import SelectContent from '../ui/selectContent.vue'
import SelectItem from '../ui/selectItem.vue'
import SelectTrigger from '../ui/selectTrigger.vue'
import SelectValue from '../ui/selectValue.vue'
import Checkbox from '../ui/checkbox.vue'
import Badge from '../ui/badge.vue'
import Collapsible from '../ui/collapsible.vue'
import CollapsibleContent from '../ui/collapsibleContent.vue'
import Tabs from '../ui/tabs.vue'
import TabsContent from '../ui/tabsContent.vue'
import TabsList from '../ui/tabsList.vue'
import TabsTrigger from '../ui/tabsTrigger.vue'
import TooltipProvider from '../ui/tooltipProvider.vue'
import Tooltip from '../ui/tooltip.vue'
import TooltipContent from '../ui/tooltipContent.vue'
import TooltipTrigger from '../ui/tooltipTrigger.vue'
import ScrollArea from '../ui/scrollArea.vue'
import SpaceMenusByMenuItem from './SpaceMenusByMenuItem.vue'
import ImageWithFallback from '../figma/ImageWithFallBack.vue'

import {
  ChevronDown,
  ChevronUp,
  Store,
  Coffee,
  Beer,
  Package,
  AlertCircle,
  Edit2,
  Save,
  X,
  Upload,
  Trash2,
  Image as ImageIcon,
  Search,
  LayoutGrid,
  Users,
  Layers,
  Loader2,
} from 'lucide-vue-next'

import * as api from '../utils/api'
import {
  computeDivergence,
  seedBlankElements,
  buildSuggestionsByElement,
} from '@/composables/useSpaceMenuReconciliation'
//import { toast } from 'sonner@2.0.3'

const FB_TYPE_LABELS = {
  food: 'Food',
  beverages: 'Beverages',
  beer: 'Beer',
  gppremium: 'GP Premium',
  temporary: 'Temporary',
  drinkee: 'Drinkee',
}

const FB_TYPE_ICONS = {
  food: Store,
  beverages: Coffee,
  beer: Beer,
  gppremium: Package,
  temporary: Store,
  drinkee: Coffee,
}

// Helpers React => portés tels quels
const getCompositeLabel = compositeKey => {
  if (compositeKey === '__no_shop_type__') {
    return 'No Shop Type'
  }
  const types = compositeKey.split(',')
  if (types.length === 1) {
    return FB_TYPE_LABELS[types[0]] || types[0]
  }
  return types.map(t => FB_TYPE_LABELS[t] || t).join(' and ')
}

const getCompositeIcon = compositeKey => {
  if (compositeKey === '__no_shop_type__') {
    return AlertCircle
  }
  const types = compositeKey.split(',')
  return FB_TYPE_ICONS[types[0]] || Store
}

export default {
  name: 'SpaceMenusPanel',

  components: {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    Label,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Checkbox,
    Badge,
    Collapsible,
    CollapsibleContent,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    TooltipProvider,
    Tooltip,
    TooltipContent,
    TooltipTrigger,
    ScrollArea,
    SpaceMenusByMenuItem,
    ImageWithFallback,
    // icons
    ChevronDown,
    ChevronUp,
    Store,
    Coffee,
    Beer,
    Package,
    AlertCircle,
    Edit2,
    Save,
    X,
    Upload,
    Trash2,
    ImageIcon,
    Search,
    LayoutGrid,
    Users,
    Layers,
    Loader2,
  },

  props: {
    spaces: {
      type: Array,
      default: () => [],
    },
    suppliers: {
      type: Array,
      default: () => [],
    },
    menuItems: {
      type: Array,
      default: () => [],
    },
    onUpdate: {
      type: Function,
      default: null,
    },
  },

  data() {
    return {
      selectedSpaceId: '',
      selectedConfigId: '',
      expandedElements: new Set(), // Set<string>
      selectedMenuItems: new Map(), // Map<string, Set<string>>
      // Règle 1 — réconciliation souple
      mappingSuggestions: new Map(), // Map<elementId, Set<menuItemId>> suggérés par le mapping
      savedElementIds: new Set(),    // elementIds présents dans la config sauvegardée
      configurations: [],
      loadingConfigs: false,
      ingredients: [],
      componentsData: [],
      marketPrices: [],
      loadingData: false,
      activeTab: 'available',
      viewMode: 'by-shop', // 'by-shop' | 'by-menu-item'
      headerExpanded: true,
      searchQuery: '',
      spaceConfigurations: {},

      // Quick Edit
      editingElementId: null,
      editName: '',
      editShopTypes: [],
      editConfigIds: [],
      editImage: '',
      imagePreview: '',
      savingElement: false,
    }
  },

  computed: {
    // Espace/config sélectionnés
    selectedSpace() {
      return this.spaces.find(s => s.id === this.selectedSpaceId) || null
    },

    selectedConfig() {
      return this.configurations.find(c => c.id === this.selectedConfigId) || null
    },

    // fbElements: shops extraits de la config
    fbElements() {
      if (!this.selectedConfig || !this.selectedConfig.data) return []

      const elements = []
      const floors = this.selectedConfig.data.floors || []
      const forecourt = this.selectedConfig.data.forecourt
      const externalMerch = this.selectedConfig.data.externalMerch

      const areasToCheck = [...floors]
      if (forecourt) areasToCheck.push(forecourt)
      if (externalMerch) areasToCheck.push(externalMerch)

      areasToCheck.forEach(area => {
        if (area.elements) {
          area.elements.forEach(element => {
            if (element.type === 'shop') {
              elements.push(element)
            }
          })
        }
      })

      return elements
    },

    // Règle 1 — écart sélection vs suggestion mapping, par element (non bloquant)
    divergenceByElement() {
      const out = {}
      this.fbElements.forEach(element => {
        out[element.id] = computeDivergence(
          this.selectedMenuItems.get(element.id) || new Set(),
          this.mappingSuggestions.get(element.id) || new Set(),
        )
      })
      return out
    },

    // Group elements by composite F&B shop type
    elementsByType() {
      const groups = {}
      this.fbElements.forEach(element => {
        const shopTypes = element.shopType || []

        if (shopTypes.length === 0) {
          const noKey = '__no_shop_type__'
          if (!groups[noKey]) groups[noKey] = []
          groups[noKey].push(element)
          return
        }

        const sortedTypes = [...shopTypes].sort((a, b) => {
          if (a === 'food' && b !== 'food') return -1
          if (b === 'food' && a !== 'food') return 1
          return a.localeCompare(b)
        })

        const compositeKey = sortedTypes.join(',')
        if (!groups[compositeKey]) groups[compositeKey] = []
        groups[compositeKey].push(element)
      })

      return groups
    },

    // Filtre par recherche (by-shop view)
    filteredElementsByType() {
      if (!this.searchQuery.trim()) {
        return this.elementsByType
      }

      const query = this.searchQuery.toLowerCase()
      const filtered = {}

      Object.entries(this.elementsByType).forEach(([typeKey, elements]) => {
        const matching = elements.filter(el =>
          el.name.toLowerCase().includes(query),
        )
        if (matching.length > 0) {
          filtered[typeKey] = matching
        }
      })

      return filtered
    },

    // menuItemsByCategory (avec availability + shops compatibles)
    menuItemsByCategory() {
      if (!this.selectedSpace) return {}

      const groups = {}

      this.menuItems.forEach(item => {
        const category = item.category || 'Uncategorized'
        const withAvailability = this.checkMenuItemAvailability(item)
        const compatibleShops = this.getCompatibleShopsForMenuItem(
          withAvailability,
        )

        if (compatibleShops.length > 0) {
          if (!groups[category]) groups[category] = []
          groups[category].push(withAvailability)
        }
      })

      Object.keys(groups).forEach(cat => {
        groups[cat].sort((a, b) => a.name.localeCompare(b.name))
      })

      return groups
    },

    // Filtre pour la vue by-menu-item : garder seulement les items sélectionnés
    filteredMenuItemsByCategory() {
      if (this.viewMode !== 'by-menu-item') {
        return this.menuItemsByCategory
      }

      const filtered = {}

      Object.entries(this.menuItemsByCategory).forEach(([category, items]) => {
        const selectedItems = items.filter(item =>
          Array.from(this.selectedMenuItems.values()).some(set =>
            set.has(item.id),
          ),
        )
        if (selectedItems.length > 0) {
          filtered[category] = selectedItems
        }
      })

      return filtered
    },
  },

  watch: {
    // charger toutes les configs de tous les espaces quand spaces change
    spaces: {
      immediate: true,
      handler(newSpaces) {
        if (!newSpaces || newSpaces.length === 0) return
        this.loadAllSpaceConfigurations()
      },
    },

    // recharger ingrédients/components/mkt prices quand suppliers/spaces changent
    suppliers: {
      immediate: true,
      handler() {
        this.loadData()
      },
    },
    // on relance aussi quand spaces change
    spacesForData: {
      // petit computed interne: we fake watch arrays; on va juste rajouter un watcher sur spaces via above
      handler() {},
    },

    // charger les configurations d’un espace quand selectedSpaceId change
    selectedSpaceId(newVal) {
      if (!newVal) {
        this.configurations = []
        this.selectedConfigId = ''
      } else {
        this.loadConfigurationsForSpace(newVal)
      }
    },

    // charger la config de menu quand space + config sont sélectionnés
    selectedConfigId(newVal) {
      if (this.selectedSpaceId && newVal) {
        this.loadMenuConfiguration()
      }
    },

    // auto-cleanup (logique équivalente au useEffect de cleanup)
    loadingData: 'maybeAutoCleanup',
    ingredients: 'maybeAutoCleanup',
    componentsData: 'maybeAutoCleanup',
    marketPrices: 'maybeAutoCleanup',
    selectedSpace: 'maybeAutoCleanup',
    fbElements: 'maybeAutoCleanup',
    selectedMenuItems: 'maybeAutoCleanup',
  },

  methods: {
    // === Loaders / API ===

    async loadAllSpaceConfigurations() {
      try {
        const configsMap = {}
        await Promise.all(
          this.spaces.map(async space => {
            const configs = await api.getSpaceConfigurations(space.id)
            configsMap[space.id] = configs || []
          }),
        )
        this.spaceConfigurations = configsMap
      } catch (error) {
        console.error('Error loading space configurations:', error)
      }
    },

    async loadData() {
      this.loadingData = true
      try {
        const [
          ingredientsData,
          componentsData,
          marketPricesData,
          packagingData,
        ] = await Promise.all([
          api.getAllIngredients(),
          api.getAllMenuComponents(),
          api.getAllMarketPrices(),
          api.getAllPackaging(),
        ])

        const allIngredients = [
          ...(ingredientsData || []),
          ...(packagingData || []),
        ]

        this.ingredients = allIngredients
        this.componentsData = componentsData || []
        this.marketPrices = marketPricesData || []
      } catch (error) {
        console.error(
          'Error loading ingredients/components/market prices:',
          error,
        )
        toast.error('Failed to load ingredient data')
      } finally {
        this.loadingData = false
      }
    },

    async loadConfigurationsForSpace(spaceId) {
      if (!spaceId) return
      this.loadingConfigs = true
      try {
        const configs = await api.getSpaceConfigurations(spaceId)
        this.configurations = configs || []

        if (configs && configs.length > 0) {
          const sorted = [...configs].sort((a, b) => {
            if (a.capacity != null && b.capacity != null) {
              if (a.capacity !== b.capacity) return b.capacity - a.capacity
              return a.name.localeCompare(b.name)
            }
            if (a.capacity != null) return -1
            if (b.capacity != null) return 1
            return a.name.localeCompare(b.name)
          })
          this.selectedConfigId = sorted[0].id
        }
      } catch (error) {
        console.error('Error loading configurations:', error)
        toast.error('Failed to load configurations')
        this.configurations = []
        this.selectedConfigId = ''
      } finally {
        this.loadingConfigs = false
      }
    },

    async loadMenuConfiguration() {
      if (!this.selectedSpaceId || !this.selectedConfigId) return

      // Charge d'abord les suggestions mapping (pour pré-remplir les PDV vierges)
      await this.loadMappingSuggestions()

      try {
        const menuConfig = await api.getSpaceMenuConfiguration(
          this.selectedSpaceId,
          this.selectedConfigId,
        )

        const savedIds = new Set()
        const newSelected = new Map()
        if (menuConfig && menuConfig.menuItems) {
          Object.entries(menuConfig.menuItems).forEach(
            ([elementId, menuItemsObj]) => {
              // clé présente = PDV configuré -> les choix utilisateur gagnent toujours
              savedIds.add(elementId)
              const setIds = new Set()
              Object.entries(menuItemsObj).forEach(([menuItemId, isChecked]) => {
                if (isChecked) setIds.add(menuItemId)
              })
              newSelected.set(elementId, setIds)
            },
          )
        }
        this.savedElementIds = savedIds
        // Règle 1 : pré-remplit UNIQUEMENT les PDV sans sélection sauvegardée
        this.selectedMenuItems = seedBlankElements(
          newSelected,
          savedIds,
          this.mappingSuggestions,
        )
      } catch (error) {
        console.error('Error loading menu configuration:', error)
        this.savedElementIds = new Set()
        this.selectedMenuItems = seedBlankElements(
          new Map(),
          new Set(),
          this.mappingSuggestions,
        )
      }
    },

    // Règle 1 — charge les menu items suggérés par PDV depuis le shop-element-mapping.
    async loadMappingSuggestions() {
      const spaceId = this.selectedSpaceId
      if (!spaceId) {
        this.mappingSuggestions = new Map()
        return
      }
      try {
        const mappings = await api.getShopElementMappings(spaceId)
        const list = Array.isArray(mappings) ? mappings : []
        // Précharge les menu items de chaque shop mappé (cache TTL côté store)
        const shopIds = [
          ...new Set(
            list
              .map(m => m.shopId || m.shop?.id || m.shopElementId || m.shop)
              .filter(Boolean),
          ),
        ]
        await Promise.all(
          shopIds.map(shopId =>
            this.$store
              .dispatch('shopMenuItems/fetchForShop', { shopId })
              .catch(() => {}),
          ),
        )
        this.mappingSuggestions = buildSuggestionsByElement(list, shopId =>
          this.$store.getters['shopMenuItems/forShop'](shopId),
        )
      } catch (error) {
        console.warn('[SpaceMenusPanel] loadMappingSuggestions failed:', error?.message)
        this.mappingSuggestions = new Map()
      }
    },

    // === Helpers issus du TSX ===

    getMaxCapacity(spaceId) {
      const configs = this.spaceConfigurations[spaceId] || []
      if (configs.length === 0) return null
      const maxCapacity = Math.max(...configs.map(c => c.capacity || 0))
      return maxCapacity > 0 ? maxCapacity : null
    },

    getConfigurationsCount(spaceId) {
      return (this.spaceConfigurations[spaceId] || []).length
    },

    handleSelectSpaceCard(spaceId) {
      this.selectedSpaceId = spaceId
      this.selectedConfigId = ''
      this.expandedElements = new Set()
      this.selectedMenuItems = new Map()
    },

    async handleSave() {
      if (!this.selectedSpaceId || !this.selectedConfigId) {
        toast.error('Please select a space and configuration')
        return
      }

      try {
        const menuItemsData = {}
        this.fbElements.forEach(element => {
          const selectedItems = this.selectedMenuItems.get(element.id) || new Set()
          const menuItemsForElement = this.getMenuItemsForElement(element)

          const elementMenuItems = {}
          menuItemsForElement.forEach(item => {
            if (item.isAvailable) {
              elementMenuItems[item.id] = selectedItems.has(item.id)
            }
          })
          menuItemsData[element.id] = elementMenuItems
        })

        await api.saveSpaceMenuConfiguration(
          this.selectedSpaceId,
          this.selectedConfigId,
          menuItemsData,
        )
        toast.success('Menu configuration saved successfully')

        if (this.onUpdate) {
          this.onUpdate()
        }
      } catch (error) {
        console.error('Error saving menu configuration:', error)
        toast.error('Failed to save menu configuration')
      }
    },

    // Availability helpers (copiés depuis TSX)

    normalizeIngredientId(id) {
      const match = id.match(/^(.+?)-0\.\d+$/)
      if (match) {
        return match[1]
      }
      return id
    },

    supplierServesSpace(supplierId, spaceId) {
      const supplier = this.suppliers.find(s => s.id === supplierId)
      if (!supplier) return false

      const supplierSites = supplier.sites || supplier.spaces || []
      if (!supplierSites || supplierSites.length === 0) {
        // empty => all spaces
        return true
      }

      return supplierSites.some(s => {
        if (typeof s === 'string') return s === spaceId
        if (s && s.spaceId) return s.spaceId === spaceId
        return false
      })
    },

    getIngredientSupplierId(ingredientId, ingredientName) {
      const normalizedId = this.normalizeIngredientId(ingredientId)
      let ingredient = this.ingredients.find(i => i.id === normalizedId)

      if (!ingredient && ingredientName) {
        ingredient = this.ingredients.find(i => i.name === ingredientName)
      }

      if (!ingredient) {
        return null
      }

      if (ingredient.marketPriceId) {
        const marketPrice = this.marketPrices.find(
          mp => mp.id === ingredient.marketPriceId,
        )
        if (marketPrice && marketPrice.supplier_id) {
          return marketPrice.supplier_id
        }
      }
      return null
    },

    checkComponentAvailability(componentId, missingSet) {
      const component = this.componentsData.find(c => c.id === componentId)
      if (!component) return

      if (component.subComponents && Array.isArray(component.subComponents)) {
        for (const subComp of component.subComponents) {
          if (subComp.itemType === 'Ingredient') {
            const normalizedId = this.normalizeIngredientId(subComp.id)
            const supplierId = this.getIngredientSupplierId(normalizedId, subComp.name)
            if (!supplierId) {
              let ing = this.ingredients.find(i => i.id === normalizedId)
              if (!ing && subComp.name) ing = this.ingredients.find(i => i.name === subComp.name)
              missingSet.add(ing ? ing.name : subComp.name)
            }
          } else if (subComp.itemType === 'Component') {
            this.checkComponentAvailability(subComp.id, missingSet)
          }
        }
      }
    },

    checkMenuItemAvailability(menuItem) {
      const missingIngredientsSet = new Set()

      if (menuItem.components && Array.isArray(menuItem.components)) {
        for (const menuItemComp of menuItem.components) {
          const itemId = menuItemComp.sourceId || menuItemComp.id

          if (menuItemComp.itemType === 'Ingredient') {
            const normalizedId = this.normalizeIngredientId(itemId)
            const supplierId = this.getIngredientSupplierId(normalizedId, menuItemComp.name)
            if (!supplierId) {
              missingIngredientsSet.add(menuItemComp.name)
            }
          } else if (menuItemComp.itemType === 'Component') {
            const referencedMenuItem = this.menuItems.find(mi => mi.id === itemId)
            if (referencedMenuItem) {
              const comboAvail = this.checkMenuItemAvailability(referencedMenuItem)
              if (!comboAvail.isAvailable) {
                ;(comboAvail.missingIngredients || []).forEach(ing => missingIngredientsSet.add(ing))
              }
            } else {
              this.checkComponentAvailability(itemId, missingIngredientsSet)
            }
          }
        }
      }

      const missingIngredients = Array.from(missingIngredientsSet)
      const isAvailable = missingIngredients.length === 0

      // displayPrice
      let displayPrice = menuItem.basePrice || 0
      if (
        menuItem.spaceSpecificPrices &&
        Array.isArray(menuItem.spaceSpecificPrices) &&
        this.selectedSpace
      ) {
        const spacePrice = menuItem.spaceSpecificPrices.find(priceRule =>
          priceRule.spaceIds?.includes(this.selectedSpace.id),
        )
        if (spacePrice && spacePrice.price !== undefined) {
          displayPrice = spacePrice.price
        }
      }

      return {
        id: menuItem.id,
        name: menuItem.name,
        type: menuItem.type,
        category: menuItem.category,
        basePrice: menuItem.basePrice,
        picture: menuItem.picture,
        components: menuItem.components,
        isAvailable,
        missingIngredients,
        spaceSpecificPrices: menuItem.spaceSpecificPrices,
        displayPrice,
      }
    },

    // Retourne les shops compatibles pour un menuItemWithAvailability
    getCompatibleShopsForMenuItem(menuItem) {
      // Dans le TSX réel, cette fonction est plus loin.
      // Ici tu peux recopier la version exacte de ton TSX si besoin.
      // Pour l’instant, je mets une version simple pour rester cohérent :
      if (!this.fbElements || this.fbElements.length === 0) return []
      // On suppose que tous les shops avec ce F&B type sont compatibles
      // (à affiner si tu veux exactement la même logique que dans TSX)
      return this.fbElements.map(el => el.id)
    },

    // Menu items pour un élément donné (filtré par F&B type + disponibilité espaces)
    getMenuItemsForElement(element) {
      const fbTypes = element.shopType || []

      return this.menuItems
        .map(item => this.checkMenuItemAvailability(item))
        .filter(itemWithAvail => {
          // ici, dans le TSX, tu as plus de logique sur FB type & spaces;
          // tu peux la coller ici depuis ton fichier React.
          return true
        })
    },

    // Auto-cleanup des sélections quand données chargées
    async maybeAutoCleanup() {
      if (
        this.loadingData ||
        !this.ingredients.length ||
        !this.selectedSpace ||
        !this.fbElements.length
      ) {
        return
      }

      const cleanedSelections = new Map()
      let hasChanges = false

      this.fbElements.forEach(element => {
        const currentSelection = this.selectedMenuItems.get(element.id) || new Set()
        const menuItemsForElement = this.getMenuItemsForElement(element)
        const cleaned = new Set()

        currentSelection.forEach(menuItemId => {
          const itemAvail = menuItemsForElement.find(
            it => it.id === menuItemId,
          )
          if (itemAvail && itemAvail.isAvailable) {
            cleaned.add(menuItemId)
          } else if (itemAvail && !itemAvail.isAvailable) {
            hasChanges = true
          }
        })

        cleanedSelections.set(element.id, cleaned)
      })

      if (hasChanges) {
        this.selectedMenuItems = cleanedSelections

        try {
          const menuItemsData = {}

          this.fbElements.forEach(element => {
            const selectedItems =
              cleanedSelections.get(element.id) || new Set()
            const menuItemsForElement = this.getMenuItemsForElement(element)

            const elementMenuItems = {}
            menuItemsForElement.forEach(item => {
              if (item.isAvailable) {
                elementMenuItems[item.id] = selectedItems.has(item.id)
              }
            })

            menuItemsData[element.id] = elementMenuItems
          })

          await api.saveSpaceMenuConfiguration(
            this.selectedSpaceId,
            this.selectedConfigId,
            menuItemsData,
          )
          toast.success(
            'Unavailable menu items were automatically removed and configuration saved',
            { duration: 5000 },
          )

          if (this.onUpdate) {
            this.onUpdate()
          }
        } catch (error) {
          console.error(
            '[Auto-cleanup] Failed to auto-save cleaned configuration:',
            error,
          )
          toast.warning(
            'Some unavailable menu items were deselected. Please save manually to apply changes.',
            { duration: 6000 },
          )
        }
      }
    },

    // === UI helpers / toggles ===

    toggleElement(elementId) {
      const next = new Set(this.expandedElements)
      if (next.has(elementId)) next.delete(elementId)
      else next.add(elementId)
      this.expandedElements = next
    },

    areAllMenuItemsSelected(elementId, menuItemsForElement) {
      const selected = this.selectedMenuItems.get(elementId) || new Set()
      const available = menuItemsForElement.filter(item => item.isAvailable)
      if (!available.length) return false
      return available.every(item => selected.has(item.id))
    },

    toggleAllMenuItemsForElement(elementId, menuItemsForElement) {
      const selected = new Map(this.selectedMenuItems)
      const current = selected.get(elementId) || new Set()
      const available = menuItemsForElement.filter(item => item.isAvailable)

      const allSelected = available.every(item => current.has(item.id))
      const nextSet = new Set(current)

      if (allSelected) {
        available.forEach(item => nextSet.delete(item.id))
      } else {
        available.forEach(item => nextSet.add(item.id))
      }

      selected.set(elementId, nextSet)
      this.selectedMenuItems = selected
    },

    isMenuItemSelected(elementId, menuItemId) {
      const selected = this.selectedMenuItems.get(elementId) || new Set()
      return selected.has(menuItemId)
    },

    toggleMenuItem(elementId, menuItemId) {
      const selected = new Map(this.selectedMenuItems)
      const setForElement = selected.get(elementId) || new Set()
      if (setForElement.has(menuItemId)) setForElement.delete(menuItemId)
      else setForElement.add(menuItemId)
      selected.set(elementId, setForElement)
      this.selectedMenuItems = selected
    },

    handleStartEdit(element) {
      this.editingElementId = element.id
      this.editName = element.name || ''
      this.editShopTypes = element.shopType || []
      this.editConfigIds = [this.selectedConfigId]
      this.editImage = element.image || ''
      this.imagePreview = element.image || ''
    },

    handleCancelEdit() {
      this.editingElementId = null
      this.editName = ''
      this.editShopTypes = []
      this.editConfigIds = []
      this.editImage = ''
      this.imagePreview = ''
      this.savingElement = false
    },

    async handleSaveEdit(element) {
      try {
        this.savingElement = true
        const updates = {}
        if (this.editName !== element.name) updates.name = this.editName
        if (this.editImage !== (element.image || '')) updates.image = this.editImage || null
        if (JSON.stringify(this.editShopTypes) !== JSON.stringify(element.shopType || []))
          updates.shopTypes = this.editShopTypes

        if (Object.keys(updates).length > 0) {
          const updated = await api.updateSpaceElement(element.id, updates)
          // Mettre à jour l'élément localement dans la liste
          const spaceId = this.selectedSpaceId
          const configId = this.selectedConfigId
          if (this.spaceConfigurations[spaceId]?.[configId]) {
            const configs = this.spaceConfigurations[spaceId][configId]
            for (const config of configs) {
              if (config.floors) {
                for (const floor of config.floors) {
                  const idx = floor.elements?.findIndex(e => e.id === element.id)
                  if (idx !== undefined && idx >= 0) {
                    floor.elements[idx] = { ...floor.elements[idx], ...updated }
                  }
                }
              }
            }
            this.spaceConfigurations = { ...this.spaceConfigurations }
          }
        }
        this.handleCancelEdit()
      } catch (err) {
        console.error('[handleSaveEdit] Error saving element:', err)
        this.savingElement = false
      }
    },

    handleImageUpload(e) {
      const file = e.target.files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onloadend = () => {
          this.imagePreview = reader.result
          this.editImage = reader.result
        }
        reader.readAsDataURL(file)
      }
    },

    handleRemoveImage() {
      this.imagePreview = ''
      this.editImage = ''
    },

    toggleShopType(type) {
      if (this.editShopTypes.includes(type)) {
        this.editShopTypes = this.editShopTypes.filter(t => t !== type)
      } else {
        this.editShopTypes = [...this.editShopTypes, type]
      }
    },

    // Pour SpaceMenusByMenuItem
    toggleAllShopsForMenuItem(/* menuItemId */) {
      // À implémenter selon ta logique React d’origine (non visible dans l’extrait)
    },

    areAllShopsSelectedForMenuItem(/* menuItemId */) {
      // Idem, à recopier depuis le TSX si nécessaire
      return false
    },

    getCompositeLabel,
    getCompositeIcon,
  },
}
</script>