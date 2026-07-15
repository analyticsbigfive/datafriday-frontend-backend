<template>
  <Card class="p-4 h-full overflow-auto">
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Button
            v-if="showMobileDrawButton && onMobileDrawClick"
            variant="ghost"
            size="sm"
            class="h-8 w-8 p-0 rounded-full"
            @click="onMobileDrawClick"
          >
            <Plus class="w-4 h-4" />
          </Button>
          <h3 class="text-lg">{{ getElementTypeName(elementType) }}</h3>
        </div>
        <span
          v-if="elementType === 'shop'"
          class="text-sm font-semibold text-green-600"
        >
          €{{ totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
        </span>
        <span
          v-else
          class="text-sm text-gray-500"
        >
          {{ totalCount }} item{{ totalCount !== 1 ? 's' : '' }}
        </span>
      </div>

      <!-- Search field with count -->
      <div class="relative">
        <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Search..."
          :value="searchQuery"
          @change="handleSearchChange"
          class="pl-9 pr-16"
        />
        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
          {{ filteredCount }} item{{ filteredCount !== 1 ? 's' : '' }}
        </span>
      </div>

      <Separator />

      <!-- Sort toggle -->
      <div class="flex gap-2">
        <Button
          size="sm"
          :variant="sortBy === 'floor' ? 'default' : 'outline'"
          @click="sortBy = 'floor'"
        >
          Sort by Floor
        </Button>
        <Button
          size="sm"
          :variant="sortBy === 'type' ? 'default' : 'outline'"
          @click="sortBy = 'type'"
        >
          Sort by Type
        </Button>
      </div>

      <Separator />

      <!-- Display grouped elements -->
      <div
        v-if="totalCount === 0"
        class="text-center py-8 text-gray-500 dark:text-gray-400"
      >
        No {{ getElementTypeName(elementType) }} elements found.
        <p
          v-if="selectedShopTypes.length > 0 || selectedStorageTypes.length > 0 || selectedHospitalityTypes.length > 0 || selectedMerchTypes.length > 0 || selectedAccessTypes.length > 0 || selectedEntertainmentTypes.length > 0 || selectedEntranceTypes.length > 0"
          class="text-sm mt-2"
        >
          Try adjusting the type filters.
        </p>
      </div>
      <div
        v-else
        class="space-y-4"
      >
        <div
          v-for="[groupName, items] in Array.from(filteredGroups.entries())"
          :key="groupName"
          class="space-y-2"
        >
          <h4 class="font-medium text-sm text-gray-700 dark:text-gray-300">{{ groupName }}</h4>
          <div class="space-y-1">
            <div
              v-for="(item, index) in items"
              :key="`${item.element.id}-${index}`"
              class="bg-gray-50 dark:bg-gray-800 rounded px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors"
              @click="onSelectElement(item.element.id, item.floorId, item.isForecourt, item.isExternalMerch)"
            >
              <div class="flex items-center justify-between">
                <div class="flex-1">
                  <p class="text-sm font-medium dark:text-gray-100">{{ item.element.name }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    {{ sortBy === 'floor' ? getTypeLabel(item.element) : item.floorName }}
                  </p>
                  <p
                    v-if="item.element.type === 'shop' || item.element.type === 'hospitality' || item.element.type === 'merchshop' || item.element.type === 'entrance'"
                    class="text-xs text-gray-600 dark:text-gray-400 mt-1"
                  >
                    Revenue : {{
                      item.element.type === 'shop' && shopRevenueData[item.element.name.toLowerCase()]
                        ? `€${shopRevenueData[item.element.name.toLowerCase()].toFixed(2)}`
                        : item.element.performance?.revenue
                          ? `€${item.element.performance.revenue.toLocaleString()}`
                          : '-'
                    }}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Card>
</template>

<script>
import Card from '../ui/card.vue'
import Button from '../ui/button.vue'
import Separator  from '../ui/separator.vue'
import Input from '../ui/input.vue'
import {Plus, Search } from 'lucide-vue-next'
import * as api from '../utils/api'

export default {
  name: 'ElementSummaryPanel',
  components: {
    Card,
    Button,
    Separator,
    Input,
    Plus,
    Search
  },
  props: {
    elementType: {
      type: String,
      required: true,
      validator: (value) => ['shop', 'storage', 'entrance', 'hospitality', 'merchshop', 'access', 'entertainment', 'kitchen'].includes(value)
    },
    floors: Array,
    forecourt: Object,
    externalMerch: Object,
    selectedStorageTypes: Array,
    selectedShopTypes: Array,
    selectedHospitalityTypes: Array,
    selectedMerchTypes: Array,
    selectedAccessTypes: Array,
    selectedEntertainmentTypes: Array,
    selectedEntranceTypes: Array,
    selectedKitchenTypes: Array,
    onSelectElement: Function,
    showMobileDrawButton: Boolean,
    onMobileDrawClick: Function,
    spaceId: String
  },
  data() {
    return {
      sortBy: 'floor',
      shopRevenueData: {},
      revenueLoading: false,
      searchQuery: ''
    }
  },
  computed: {
    getElementTypeName() {
      return (type) => {
        const names = {
          shop: 'F&B',
          storage: 'Storage',
          entrance: 'Ticketing',
          hospitality: 'Hospitality',
          merchshop: 'Merch',
          access: 'Access',
          entertainment: 'Entertainment'
        }
        return names[type] || type
      }
    },
    getTypeLabel() {
      return (element) => {
        if (element.type === 'shop' && element.shopType && element.shopType.length > 0) {
          return element.shopType.map(t => {
            if (t === 'gppremium') return 'GP Premium'
            return t.charAt(0).toUpperCase() + t.slice(1)
          }).join(', ')
        }
        if (element.type === 'storage' && element.storageType && element.storageType.length > 0) {
          return element.storageType.map(t => {
            if (t === 'dry') return 'Dry'
            if (t === 'cold') return 'Cold'
            if (t === 'belowzero') return 'Below Zero'
            if (t === 'material') return 'Material'
            if (t === 'merch') return 'Merch'
            return t
          }).join(', ')
        }
        if (element.type === 'hospitality' && element.hospitalityType && element.hospitalityType.length > 0) {
          return element.hospitalityType.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')
        }
        if (element.type === 'merchshop' && element.merchType && element.merchType.length > 0) {
          return element.merchType.map(t => {
            if (t === 'onsite') return 'On site'
            if (t === 'offsite') return 'Off site'
            return t.charAt(0).toUpperCase() + t.slice(1)
          }).join(', ')
        }
        if (element.type === 'access' && element.accessType && element.accessType.length > 0) {
          return element.accessType.map(t => {
            if (t === 'servicelift') return 'Service Lift'
            if (t === 'venueentrance') return 'Venue Entrance'
            return t.charAt(0).toUpperCase() + t.slice(1)
          }).join(', ')
        }
        if (element.type === 'entertainment' && element.entertainmentType && element.entertainmentType.length > 0) {
          return element.entertainmentType.map(t => {
            if (t === 'sportground') return 'Sport Ground'
            return t.charAt(0).toUpperCase() + t.slice(1)
          }).join(', ')
        }
        if (element.type === 'entrance' && element.entranceType && element.entranceType.length > 0) {
          return element.entranceType.map(t => t.toUpperCase()).join(', ')
        }
        if (element.type === 'kitchen' && element.kitchenType && element.kitchenType.length > 0) {
          return element.kitchenType.map(t => {
            if (t === 'fb') return 'F&B'
            return t.charAt(0).toUpperCase() + t.slice(1)
          }).join(', ')
        }
        return 'General'
      }
    },
    filterElements() {
      return (elements) => {
        let filtered = elements.filter(e => e.type === this.elementType)

        if (this.elementType === 'shop' && this.selectedShopTypes.length > 0) {
          filtered = filtered.filter(e => e.shopType?.some(type => this.selectedShopTypes.includes(type)))
        }

        if (this.elementType === 'storage' && this.selectedStorageTypes.length > 0) {
          filtered = filtered.filter(e => e.storageType?.some(type => this.selectedStorageTypes.includes(type)))
        }

        if (this.elementType === 'hospitality' && this.selectedHospitalityTypes.length > 0) {
          filtered = filtered.filter(e => e.hospitalityType?.some(type => this.selectedHospitalityTypes.includes(type)))
        }

        if (this.elementType === 'merchshop' && this.selectedMerchTypes.length > 0) {
          filtered = filtered.filter(e => e.merchType?.some(type => this.selectedMerchTypes.includes(type)))
        }

        if (this.elementType === 'access' && this.selectedAccessTypes.length > 0) {
          filtered = filtered.filter(e => e.accessType?.some(type => this.selectedAccessTypes.includes(type)))
        }

        if (this.elementType === 'entertainment' && this.selectedEntertainmentTypes.length > 0) {
          filtered = filtered.filter(e => e.entertainmentType?.some(type => this.selectedEntertainmentTypes.includes(type)))
        }

        if (this.elementType === 'entrance' && this.selectedEntranceTypes.length > 0) {
          filtered = filtered.filter(e => e.entranceType?.some(type => this.selectedEntranceTypes.includes(type)))
        }

        if (this.elementType === 'kitchen' && this.selectedKitchenTypes.length > 0) {
          filtered = filtered.filter(e => e.kitchenType?.some(type => this.selectedKitchenTypes.includes(type)))
        }

        return filtered
      }
    },
    getAllElements() {
      const allElements = []
      this.floors.forEach(floor => {
        const filtered = this.filterElements(floor.elements)
        filtered.forEach(element => {
          allElements.push({
            element,
            floorId: floor.id,
            floorName: floor.name,
            floorLevel: floor.level,
            isForecourt: false,
            isExternalMerch: false
          })
        })
      })
      if (this.forecourt) {
        const filtered = this.filterElements(this.forecourt.elements)
        filtered.forEach(element => {
          allElements.push({
            element,
            floorId: this.forecourt.id,
            floorName: this.forecourt.name,
            floorLevel: -999,
            isForecourt: true,
            isExternalMerch: false
          })
        })
      }
      if (this.externalMerch) {
        const filtered = this.filterElements(this.externalMerch.elements)
        filtered.forEach(element => {
          allElements.push({
            element,
            floorId: this.externalMerch.id,
            floorName: this.externalMerch.name,
            floorLevel: -1000,
            isForecourt: false,
            isExternalMerch: true
          })
        })
      }
      return allElements
    },
    sortedElements() {
      const elements = this.getAllElements
      if (this.sortBy === 'floor') {
        return elements.sort((a, b) => {
          if (a.floorLevel !== b.floorLevel) {
            return b.floorLevel - a.floorLevel
          }
          return this.getTypeLabel(a.element).localeCompare(this.getTypeLabel(b.element))
        })
      } else {
        return elements.sort((a, b) => {
          const typeCompare = this.getTypeLabel(a.element).localeCompare(this.getTypeLabel(b.element))
          if (typeCompare !== 0) {
            return typeCompare
          }
          return b.floorLevel - a.floorLevel
        })
      }
    },
    groupedElements() {
      const elements = this.sortedElements
      const groups = new Map()
      if (this.sortBy === 'floor') {
        elements.forEach(item => {
          const key = item.floorName
          if (!groups.has(key)) {
            groups.set(key, [])
          }
          groups.get(key).push(item)
        })
      } else {
        elements.forEach(item => {
          const key = this.getTypeLabel(item.element)
          if (!groups.has(key)) {
            groups.set(key, [])
          }
          groups.get(key).push(item)
        })
      }
      return groups
    },
    totalCount() {
      return this.getAllElements.length
    },
    totalRevenue() {
      if (this.elementType !== 'shop') return 0
      return this.getAllElements.reduce((sum, item) => {
        const revenue = this.shopRevenueData[item.element.name.toLowerCase()] || item.element.performance?.revenue || 0
        return sum + revenue
      }, 0)
    },
    filteredElements() {
      if (!this.searchQuery.trim()) return this.getAllElements
      const query = this.searchQuery.toLowerCase()
      return this.getAllElements.filter(item => {
        return item.element.name.toLowerCase().includes(query) ||
               this.getTypeLabel(item.element).toLowerCase().includes(query) ||
               item.floorName.toLowerCase().includes(query)
      })
    },
    filteredGroups() {
      const groups = new Map()
      if (this.sortBy === 'floor') {
        this.filteredElements.forEach(item => {
          const key = item.floorName
          if (!groups.has(key)) {
            groups.set(key, [])
          }
          groups.get(key).push(item)
        })
      } else {
        this.filteredElements.forEach(item => {
          const key = this.getTypeLabel(item.element)
          if (!groups.has(key)) {
            groups.set(key, [])
          }
          groups.get(key).push(item)
        })
      }
      return groups
    },
    filteredCount() {
      return this.filteredElements.length
    }
  },
  mounted() {
    this.fetchShopRevenue()
  },
  watch: {
    spaceId() {
      this.fetchShopRevenue()
    },
    elementType() {
      this.fetchShopRevenue()
    }
  },
  methods: {
    async fetchShopRevenue() {
      if (!this.spaceId || this.elementType !== 'shop') return

      this.revenueLoading = true
      try {
        const { projectId, publicAnonKey } = await import('../utils/supabase/info.js')
        const mappingResponse = await fetch(
          `https://${projectId}.supabase.co/functions/v1/make-server-eb31619c/kv/space-sales-locations:${this.spaceId}`,
          {
            headers: {
              'Authorization': `Bearer ${publicAnonKey}`,
            },
          }
        )

        if (!mappingResponse.ok) {
          console.log('[ELEMENT SUMMARY] No location mapping found for space:', this.spaceId)
          return
        }

        const mappingData = await mappingResponse.json()
        const locations = mappingData.data?.locations || []

        if (locations.length === 0) {
          console.log('[ELEMENT SUMMARY] No locations mapped to space:', this.spaceId)
          return
        }

        const revenueMap = {}

        for (const location of locations) {
          try {
            const totals = await api.getShopRevenueTotals(location)
            console.log(`[ELEMENT SUMMARY] Loaded ${totals.length} shop revenue totals for location:`, location)

            totals.forEach((shopTotal) => {
              const shopName = shopTotal.shop
              if (shopName && shopTotal.totalRevenue) {
                revenueMap[shopName.toLowerCase()] = (revenueMap[shopName.toLowerCase()] || 0) + shopTotal.totalRevenue
              }
            })
          } catch (error) {
            console.error(`[ELEMENT SUMMARY] Error fetching revenue for location ${location}:`, error)
          }
        }

        console.log('[ELEMENT SUMMARY] Shop revenue map:', revenueMap)
        this.shopRevenueData = revenueMap
      } catch (error) {
        console.error('[ELEMENT SUMMARY] Error fetching shop revenue:', error)
      } finally {
        this.revenueLoading = false
      }
    },
    handleSearchChange(e) {
      this.searchQuery = e.target.value
    }
  }
}
</script>