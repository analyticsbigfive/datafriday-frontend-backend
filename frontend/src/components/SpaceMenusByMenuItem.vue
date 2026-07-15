<template>
  <div class="space-y-6">
    <!-- Aucun résultat -->
    <div
      v-if="!hasResults"
      class="flex flex-col items-center justify-center py-12 text-gray-500"
    >
      <Store class="w-12 h-12 mb-4 opacity-50" />
      <p class="text-center">
        No menu items found matching "{{ searchQuery }}"
      </p>
    </div>

    <!-- Catégories avec résultats -->
    <template v-else>
      <div
        v-for="[category, items] in sortedFilteredEntries"
        :key="category"
        class="space-y-3"
      >
        <!-- Category Header -->
        <div class="flex items-center gap-2 pb-2 border-b">
          <Package class="w-5 h-5 text-gray-600" />
          <h3 class="font-semibold text-lg">{{ category }}</h3>
          <Badge variant="secondary">
            {{ items.length }}
          </Badge>
        </div>

        <!-- Menu Item Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card
            v-for="menuItem in items"
            :key="menuItem.id"
            class="overflow-hidden"
            :class="!menuItem.isAvailable
              ? 'opacity-50 bg-gray-50 dark:bg-gray-900'
              : ''"
          >
            <Collapsible
              :open="expandedElements.has(menuItem.id)"
              @update:open="() => toggleElement(menuItem.id)"
            >
              <!-- Card Image and Header -->
              <CollapsibleTrigger>
                <div class="relative cursor-pointer group">
                  <!-- Image -->
                  <div
                    class="aspect-video bg-gray-100 dark:bg-gray-800 relative overflow-hidden"
                  >
                    <template v-if="menuItem.picture">
                      <ImageWithFallback
                        :src="menuItem.picture"
                        :alt="menuItem.name"
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

                    <!-- Overlay with name -->
                    <div
                      class="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/60 to-transparent p-3"
                    >
                      <h4
                        class="text-white font-semibold"
                        :class="!menuItem.isAvailable ? 'line-through' : ''"
                      >
                        {{ menuItem.name }}
                      </h4>
                      <p
                        v-if="menuItem.basePrice !== undefined"
                        class="text-white text-sm"
                      >
                        ${{ menuItem.basePrice.toFixed(2) }}
                      </p>
                    </div>

                    <!-- Unavailable Badge -->
                    <div
                      v-if="!menuItem.isAvailable"
                      class="absolute top-2 right-2 bg-red-500 text-white text-xs px-2 py-1 rounded"
                    >
                      Unavailable
                    </div>

                    <!-- Expand indicator -->
                    <div
                      class="absolute bottom-2 right-2 bg-white dark:bg-gray-800 rounded-full p-1 shadow-lg group-hover:bg-gray-100 dark:group-hover:bg-gray-700 transition-colors"
                    >
                      <ChevronUp
                        v-if="expandedElements.has(menuItem.id)"
                        class="w-4 h-4 dark:text-gray-300"
                      />
                      <ChevronDown
                        v-else
                        class="w-4 h-4 dark:text-gray-300"
                      />
                    </div>
                  </div>

                  <!-- Stats bar -->
                  <div
                    class="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-t dark:border-gray-700 flex items-center justify-between text-sm"
                  >
                    <span class="text-gray-600 dark:text-gray-400">
                      Shops
                    </span>
                    <div class="flex items-center gap-2">
                      <span
                        class="text-blue-600 dark:text-blue-400 font-semibold"
                      >
                        {{
                          getAssignedShopsCount(
                            menuItem,
                            compatibleShopsFor(menuItem),
                          )
                        }}
                      </span>
                      <span class="text-gray-400 dark:text-gray-600">/</span>
                      <span class="text-gray-600 dark:text-gray-400">
                        {{ compatibleShopsFor(menuItem).length }}
                      </span>
                    </div>
                  </div>
                </div>
              </CollapsibleTrigger>

              <!-- Expandable Content - List of Compatible Shops -->
              <CollapsibleContent>
                <div class="border-t dark:border-gray-700">
                  <ScrollArea class="h-[300px]">
                    <div class="p-3 space-y-2">
                      <!-- Missing ingredients warning -->
                      <div
                        v-if="
                          !menuItem.isAvailable &&
                          menuItem.missingIngredients &&
                          menuItem.missingIngredients.length > 0
                        "
                        class="mb-3 p-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded text-sm"
                      >
                        <p
                          class="font-semibold text-red-700 dark:text-red-400 mb-1"
                        >
                          Missing Ingredients:
                        </p>
                        <ul
                          class="text-red-600 dark:text-red-400 text-xs list-disc list-inside"
                        >
                          <li
                            v-for="(ing, idx) in menuItem.missingIngredients"
                            :key="idx"
                          >
                            {{ ing }}
                          </li>
                        </ul>
                      </div>

                      <!-- No compatible shops -->
                      <p
                        v-if="compatibleShopsFor(menuItem).length === 0"
                        class="text-sm text-gray-500 dark:text-gray-400 text-center py-4"
                      >
                        No compatible shops found
                      </p>

                      <!-- Compatible shops list -->
                      <template v-else>
                        <!-- Select All Shops (only for available items) -->
                        <div
                          v-if="menuItem.isAvailable"
                          class="flex items-center gap-3 p-2 rounded bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800"
                        >
                          <Checkbox
                            :id="`select-all-shops-${menuItem.id}`"
                            :checked="
                              areAllShopsSelectedForMenuItem(
                                menuItem.id,
                                compatibleShopsFor(menuItem),
                              )
                            "
                            @update:checked="
                              () =>
                                toggleAllShopsForMenuItem(
                                  menuItem.id,
                                  compatibleShopsFor(menuItem),
                                )
                            "
                            class="flex-shrink-0"
                          />
                          <Label
                            :for="`select-all-shops-${menuItem.id}`"
                            class="text-sm font-semibold text-blue-900 dark:text-blue-100 cursor-pointer flex-1"
                          >
                            Select All Shops ({{
                              compatibleShopsFor(menuItem).length
                            }})
                          </Label>
                        </div>

                        <!-- Shops list -->
                        <div
                          v-for="shop in sortedCompatibleShopsFor(menuItem)"
                          :key="shop.id"
                          class="flex items-center gap-3 p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
                          :class="
                            !menuItem.isAvailable
                              ? 'cursor-not-allowed'
                              : 'cursor-pointer'
                          "
                          @click="
                            () => {
                              if (menuItem.isAvailable) {
                                toggleMenuItem(shop.id, menuItem.id)
                              }
                            }
                          "
                        >
                          <!-- Shop Image -->
                          <div
                            class="w-12 h-12 rounded overflow-hidden flex-shrink-0 bg-gray-100 dark:bg-gray-800"
                          >
                            <template v-if="shop.image">
                              <ImageWithFallback
                                :src="shop.image"
                                :alt="shop.name"
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

                          <!-- Shop Name -->
                          <div class="flex-1 min-w-0">
                            <div class="text-sm truncate">
                              {{ shop.name }}
                            </div>
                            <div
                              class="text-xs text-gray-500 dark:text-gray-400"
                            >
                              {{
                                (shop.shopType || [])
                                  .map(
                                    type =>
                                      FB_TYPE_LABELS[type] || type,
                                  )
                                  .join(', ')
                              }}
                            </div>
                          </div>

                          <!-- Checkbox -->
                          <Checkbox
                            :id="`${shop.id}-${menuItem.id}`"
                            :checked="
                              isMenuItemSelected(shop.id, menuItem.id)
                            "
                            @update:checked="
                              () => toggleMenuItem(shop.id, menuItem.id)
                            "
                            :disabled="!menuItem.isAvailable"
                            class="flex-shrink-0"
                            @click.stop
                          />
                        </div>
                      </template>
                    </div>
                  </ScrollArea>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
import Card from '../ui/card.vue'
import Badge from '../ui/badge.vue'
import Checkbox from '../ui/checkbox.vue'
import Label from '../ui/label.vue'
import ScrollArea from '../ui/scrollArea.vue'
import Collapsible from '../ui/collapsible.vue'
import CollapsibleContent from '../ui/collapsibleContent.vue'
import CollapsibleTrigger from '../ui/collapsibleTrigger.vue'
import ImageWithFallback from '../figma/ImageWithFallBack.vue'

import {
  ChevronDown,
  ChevronUp,
  Store,
  Package,
} from 'lucide-vue-next'

export default {
  name: 'SpaceMenusByMenuItem',

  components: {
    Card,
    Badge,
    Checkbox,
    Label,
    ScrollArea,
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
    ImageWithFallback,
    ChevronDown,
    ChevronUp,
    Store,
    Package,
  },

  props: {
    menuItemsByCategory: {
      type: Object,
      required: true,
    },
    expandedElements: {
      // Set<string> dans ton code
      type: Object,
      required: true,
    },
    toggleElement: {
      type: Function,
      required: true,
    },
    getCompatibleShopsForMenuItem: {
      type: Function,
      required: true,
    },
    isMenuItemSelected: {
      type: Function,
      required: true,
    },
    toggleMenuItem: {
      type: Function,
      required: true,
    },
    toggleAllShopsForMenuItem: {
      type: Function,
      required: true,
    },
    areAllShopsSelectedForMenuItem: {
      type: Function,
      required: true,
    },
    FB_TYPE_LABELS: {
      type: Object,
      required: true,
    },
    searchQuery: {
      type: String,
      default: '',
    },
  },

  computed: {
    // Filtrage par recherche (équivalent du reduce dans TSX)
    filteredMenuItemsByCategory() {
      const result = {}

      Object.entries(this.menuItemsByCategory || {}).forEach(
        ([category, items]) => {
          if (!this.searchQuery.trim()) {
            result[category] = items
            return
          }

          const query = this.searchQuery.toLowerCase()
          const filteredItems = items.filter(item =>
            item.name.toLowerCase().includes(query),
          )

          if (filteredItems.length > 0) {
            result[category] = filteredItems
          }
        },
      )

      return result
    },

    hasResults() {
      return Object.keys(this.filteredMenuItemsByCategory).length > 0
    },

    // Pour itérer en ordre trié
    sortedFilteredEntries() {
      return Object.entries(this.filteredMenuItemsByCategory).sort(
        ([a], [b]) => a.localeCompare(b),
      )
    },
  },

  methods: {
    compatibleShopsFor(menuItem) {
      return this.getCompatibleShopsForMenuItem(menuItem) || []
    },

    sortedCompatibleShopsFor(menuItem) {
      return [...this.compatibleShopsFor(menuItem)].sort((a, b) =>
        a.name.localeCompare(b.name),
      )
    },

    getAssignedShopsCount(menuItem, compatibleShops) {
      if (!compatibleShops || !compatibleShops.length) return 0
      return compatibleShops.filter(shop =>
        this.isMenuItemSelected(shop.id, menuItem.id),
      ).length
    },
  },
}
</script>