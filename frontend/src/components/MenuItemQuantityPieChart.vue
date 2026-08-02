<template>
  <div v-if="!shopGranularData || shopGranularData.length === 0" class="space-y-4">
    <div class="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Menu Item Quantities Distribution
          </h3>
        </div>

        <div class="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-0.5">
          <button
            type="button"
            @click="emitMetricChange('quantity')"
            :class="toggleBtnClass('quantity')"
          >
            Quantity
          </button>
          <button
            type="button"
            @click="emitMetricChange('revenue')"
            :class="toggleBtnClass('revenue')"
          >
            Revenue
          </button>
        </div>
      </div>
    </div>

    <div
      class="flex items-center justify-center h-[400px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg"
    >
      No data available. Select events or adjust filters to view menu item distribution.
    </div>
  </div>

  <div v-else-if="typeChartData.length === 0 && categoryChartData.length === 0" class="space-y-4">
    <div class="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex items-center justify-between gap-4">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Menu Item {{ metric === 'revenue' ? 'Revenue' : 'Quantities' }} Distribution
          </h3>
        </div>

        <div class="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-0.5">
          <button
            type="button"
            @click="emitMetricChange('quantity')"
            :class="toggleBtnClass('quantity')"
          >
            Quantity
          </button>
          <button
            type="button"
            @click="emitMetricChange('revenue')"
            :class="toggleBtnClass('revenue')"
          >
            Revenue
          </button>
        </div>
      </div>
    </div>

    <div
      class="flex items-center justify-center h-[400px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg"
    >
      No menu items found. Make sure menu items are properly configured.
    </div>
  </div>

  <div v-else class="space-y-4">
    <div class="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Menu Item {{ metric === 'revenue' ? 'Revenue' : 'Quantities' }} Distribution
          </h3>
          <p v-if="!isMobile" class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Total {{ metric === 'revenue' ? 'Revenue' : 'Quantity' }}:
            <span class="font-medium text-gray-900 dark:text-gray-100">{{ formatValue(totalValue) }}</span>
          </p>
        </div>

        <div class="flex items-center gap-3">
          <Button
            v-if="selectedType || selectedCategory"
            variant="outline"
            size="sm"
            class="text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950"
            @click="clearFilters"
          >
            Clear {{ selectedCategory ? `${selectedType} > ${selectedCategory}` : selectedType }}
          </Button>

          <div class="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-0.5">
            <button
              type="button"
              @click="emitMetricChange('quantity')"
              :class="toggleBtnClass('quantity')"
            >
              Quantity
            </button>
            <button
              type="button"
              @click="emitMetricChange('revenue')"
              :class="toggleBtnClass('revenue')"
            >
              Revenue
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Stat Widgets Row - Food, Beverage, Beer -->
    <div class="grid grid-cols-3 gap-4">
      <!-- Food -->
      <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div class="flex flex-col">
          <div class="flex items-center gap-1.5">
            <UtensilsCrossed class="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span class="text-xs uppercase tracking-wide text-blue-600 dark:text-blue-400 font-medium">
              Food
            </span>
          </div>

          <span class="text-base md:text-2xl font-bold text-blue-900 dark:text-blue-100 mt-2">
            {{ formatValue(specificTotals.food) }}
          </span>

          <div class="flex items-center justify-between mt-1">
            <span v-if="!isMobile" class="text-xs text-blue-600 dark:text-blue-400">
              {{ metric === 'revenue' ? 'Total Revenue' : 'Total Quantity' }}
            </span>

            <div
              v-if="hasPreviousPeriod && previousPeriodData && previousPeriodData.foodTotal > 0 && metric === 'quantity'"
              :class="['flex items-center gap-1 text-xs font-medium', foodDeltaClass, isMobile ? 'ml-auto' : '']"
            >
              <component :is="foodDeltaIcon" class="w-3 h-3" />
              {{ Math.abs(foodDelta).toFixed(1) }}%
            </div>
          </div>
        </div>
      </div>

      <!-- Beverage -->
      <div class="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
        <div class="flex flex-col">
          <div class="flex items-center gap-1.5">
            <Wine class="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
            <span class="text-xs uppercase tracking-wide text-green-600 dark:text-green-400 font-medium">
              Beverage
            </span>
          </div>

          <span class="text-base md:text-2xl font-bold text-green-900 dark:text-green-100 mt-2">
            {{ formatValue(specificTotals.beverage) }}
          </span>

          <div class="flex items-center justify-between mt-1">
            <span v-if="!isMobile" class="text-xs text-green-600 dark:text-green-400">
              {{ metric === 'revenue' ? 'Total Revenue' : 'Total Quantity' }}
            </span>

            <div
              v-if="hasPreviousPeriod && previousPeriodData && previousPeriodData.beverageTotal > 0 && metric === 'quantity'"
              :class="['flex items-center gap-1 text-xs font-medium', beverageDeltaClass, isMobile ? 'ml-auto' : '']"
            >
              <component :is="beverageDeltaIcon" class="w-3 h-3" />
              {{ Math.abs(beverageDelta).toFixed(1) }}%
            </div>
          </div>
        </div>
      </div>

      <!-- Beer -->
      <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <div class="flex flex-col">
          <div class="flex items-center gap-1.5">
            <Beer class="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span class="text-xs uppercase tracking-wide text-amber-600 dark:text-amber-400 font-medium">
              Beer
            </span>
          </div>

          <span class="text-base md:text-2xl font-bold text-amber-900 dark:text-amber-100 mt-2">
            {{ formatValue(specificTotals.beer) }}
          </span>

          <div class="flex items-center justify-between mt-1">
            <span v-if="!isMobile" class="text-xs text-amber-600 dark:text-amber-400">
              {{ metric === 'revenue' ? 'Total Revenue' : 'Total Quantity' }}
            </span>

            <div
              v-if="hasPreviousPeriod && previousPeriodData && previousPeriodData.beerTotal > 0 && metric === 'quantity'"
              :class="['flex items-center gap-1 text-xs font-medium', beerDeltaClass, isMobile ? 'ml-auto' : '']"
            >
              <component :is="beerDeltaIcon" class="w-3 h-3" />
              {{ Math.abs(beerDelta).toFixed(1) }}%
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Three Pie Charts in a Row -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- Top Menu Items -->
      <Card class="bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader class="pb-2">
          <CardTitle class="text-base">
            Top Menu Items {{ metric === 'revenue' ? 'by Revenue' : 'Sold' }}
          </CardTitle>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Showing top 10 menu items by {{ metric }}
          </p>
        </CardHeader>

        <CardContent>
          <div v-if="menuItemChartData.length === 0" class="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400 text-sm">
            No menu item data available
          </div>

          <template v-else>
            <div class="w-full" style="height: 200px;">
              <Doughnut :data="menuItemChartJsData" :options="menuItemsOptions" />
            </div>

            <LegendList
              :data="menuItemChartData"
              :colors="COLORS"
              :show-all="showAllMenuItems"
              :metric="metric"
              @toggle="showAllMenuItems = !showAllMenuItems"
            />
          </template>
        </CardContent>
      </Card>

      <!-- By Type -->
      <Card class="bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader class="pb-2">
          <CardTitle class="text-base">By Menu Item Type</CardTitle>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ typeChartData.length }} {{ typeChartData.length === 1 ? 'type' : 'types' }}
          </p>
        </CardHeader>

        <CardContent>
          <div v-if="typeChartData.length === 0" class="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400 text-sm">
            No type data available
          </div>

          <template v-else>
            <div class="w-full" style="height: 200px;">
              <Doughnut :data="typeChartJsData" :options="typeOptions" />
            </div>

            <LegendList
              :data="typeChartData"
              :colors="COLORS"
              :show-all="showAllTypes"
              :metric="metric"
              @toggle="showAllTypes = !showAllTypes"
            />
          </template>
        </CardContent>
      </Card>

      <!-- By Category -->
      <Card class="bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader class="pb-2">
          <CardTitle class="text-base">By Menu Item Category</CardTitle>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ categoryChartData.length }} {{ categoryChartData.length === 1 ? 'category' : 'categories' }}
          </p>
        </CardHeader>

        <CardContent>
          <div v-if="categoryChartData.length === 0" class="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400 text-sm">
            No category data available
          </div>

          <template v-else>
            <div class="w-full" style="height: 200px;">
              <Doughnut :data="categoryChartJsData" :options="categoryOptions" />
            </div>

            <LegendList
              :data="categoryChartData"
              :colors="COLORS"
              :show-all="showAllCategories"
              :metric="metric"
              @toggle="showAllCategories = !showAllCategories"
            />
          </template>
        </CardContent>
      </Card>
    </div>
  </div>
</template>

<script>
import Card from '../ui/card.vue'
import CardContent from '../ui/cardContent.vue'
import CardHeader from '../ui/cardHeader.vue'
import CardTitle from '../ui/cardTitle.vue'
import Button from '../ui/button.vue'

import {
  ChevronDown,
  ChevronUp,
  UtensilsCrossed,
  Wine,
  Beer,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-vue-next'

import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'
// Montants € locale-aware (fr "1 235 €" / en "€1,235") — plus de `$` en dur.
import { formatCurrency } from '@/composables/useFormatters'
import { currentIntlLocale } from '@/composables/useNumberFormat'

ChartJS.register(ArcElement, Tooltip, Legend)

const COLORS = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#14b8a6',
  '#a855f7',
  '#f43f5e',
  '#84cc16',
  '#6366f1',
  '#eab308',
  '#64748b',
  '#dc2626',
  '#059669',
  '#d97706',
]

const LegendList = {
  name: 'LegendList',
  components: { Button, ChevronDown, ChevronUp },
  props: {
    data: { type: Array, required: true },
    colors: { type: Array, required: true },
    showAll: { type: Boolean, required: true },
    metric: { type: String, required: true }, // 'quantity' | 'revenue'
    limit: { type: Number, default: 5 },
  },
  emits: ['toggle'],
  computed: {
    displayData() {
      return this.showAll ? this.data : this.data.slice(0, this.limit)
    },
    hasMore() {
      return (this.data?.length || 0) > this.limit
    },
  },
  methods: {
    formatValue(value) {
      const roundedValue = Math.ceil(Number(value || 0))
      if (this.metric === 'revenue') return formatCurrency(roundedValue)
      return roundedValue.toLocaleString(currentIntlLocale())
    },
    colorForEntry(entry) {
      const idx = this.data.indexOf(entry)
      return this.colors[(idx < 0 ? 0 : idx) % this.colors.length]
    },
  },
  template: `
    <div class="mt-4 space-y-2">
      <div class="grid grid-cols-1 gap-1.5">
        <div
          v-for="(entry, index) in displayData"
          :key="'legend-' + index"
          class="flex items-center gap-2 text-xs"
        >
          <div
            class="w-3 h-3 rounded-sm flex-shrink-0"
            :style="{ backgroundColor: colorForEntry(entry) }"
          />
          <span class="text-gray-700 dark:text-gray-300 truncate">
            {{ entry.name }}
          </span>
          <span class="text-gray-500 dark:text-gray-400 ml-auto whitespace-nowrap">
            {{ formatValue(entry.value) }}
          </span>
        </div>
      </div>

      <Button
        v-if="hasMore"
        variant="ghost"
        size="sm"
        class="w-full h-7 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        @click="$emit('toggle')"
      >
        <template v-if="showAll">
          <ChevronUp class="w-3 h-3 mr-1" />
          Show Less
        </template>
        <template v-else>
          <ChevronDown class="w-3 h-3 mr-1" />
          Show All ({{ data.length }})
        </template>
      </Button>
    </div>
  `,
}

export default {
  name: 'MenuItemQuantityPieChart',
  components: {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    Doughnut,
    LegendList,

    ChevronDown,
    ChevronUp,
    UtensilsCrossed,
    Wine,
    Beer,
    ArrowUp,
    ArrowDown,
    Minus,
  },

  props: {
    shopGranularData: { type: Array, required: true },
    menuItems: { type: Array, required: true },

    previousPeriodData: { type: Object, required: false },
    hasPreviousPeriod: { type: Boolean, required: false },

    selectedTypeFilter: { type: Array, default: () => [] },
    selectedCategoryFilter: { type: Array, default: () => [] },

    onTypeFilterChange: { type: Function, required: false },
    onCategoryFilterChange: { type: Function, required: false },

    metric: { type: String, default: 'quantity' }, // 'quantity' | 'revenue'
    onMetricChange: { type: Function, required: false },
  },

  data() {
    return {
      COLORS,

      showAllTypes: false,
      showAllCategories: false,
      showAllMenuItems: false,

      selectedType: null,
      selectedCategory: null,

      isMobile: false,
      _mobileMql: null,
      _mobileOnChange: null,
    }
  },

  computed: {
    menuItemMap() {
      const map = new Map()
      ;(this.menuItems || []).forEach((item) => {
        map.set(item.id, item)
      })
      return map
    },

    typeChartData() {
      if (!this.shopGranularData || this.shopGranularData.length === 0) return []
      if (!this.menuItems || this.menuItems.length === 0) return []

      const aggregation = new Map()

      for (const record of this.shopGranularData) {
        const menuItem = this.menuItemMap.get(record.menuItemId)
        if (!menuItem) continue

        const key = menuItem.type || 'Unknown Type'
        if (!aggregation.has(key)) aggregation.set(key, { name: key, value: 0 })

        const entry = aggregation.get(key)
        entry.value += this.metric === 'revenue' ? Number(record.revenue || 0) : Number(record.quantity || 0)
      }

      return Array.from(aggregation.values()).sort((a, b) => b.value - a.value)
    },

    categoryChartData() {
      if (!this.shopGranularData || this.shopGranularData.length === 0) return []
      if (!this.menuItems || this.menuItems.length === 0) return []

      const aggregation = new Map()

      for (const record of this.shopGranularData) {
        const menuItem = this.menuItemMap.get(record.menuItemId)
        if (!menuItem) continue

        if (this.selectedType && menuItem.type !== this.selectedType) continue

        const key = menuItem.category || 'Unknown Category'
        if (!aggregation.has(key)) aggregation.set(key, { name: key, value: 0 })

        const entry = aggregation.get(key)
        entry.value += this.metric === 'revenue' ? Number(record.revenue || 0) : Number(record.quantity || 0)
      }

      return Array.from(aggregation.values()).sort((a, b) => b.value - a.value)
    },

    menuItemChartData() {
      if (!this.shopGranularData || this.shopGranularData.length === 0) return []
      if (!this.menuItems || this.menuItems.length === 0) return []

      const aggregation = new Map()

      for (const record of this.shopGranularData) {
        const menuItem = this.menuItemMap.get(record.menuItemId)
        if (!menuItem) continue

        if (this.selectedType && menuItem.type !== this.selectedType) continue
        if (this.selectedCategory && menuItem.category !== this.selectedCategory) continue

        const key = menuItem.name || 'Unknown Item'
        if (!aggregation.has(key)) aggregation.set(key, { name: key, value: 0 })

        const entry = aggregation.get(key)
        entry.value += this.metric === 'revenue' ? Number(record.revenue || 0) : Number(record.quantity || 0)
      }

      const sorted = Array.from(aggregation.values()).sort((a, b) => b.value - a.value)

      const topItems = sorted.slice(0, 10)
      const otherItems = sorted.slice(10)

      const result = [...topItems]
      if (otherItems.length > 0) {
        const otherValue = otherItems.reduce((sum, item) => sum + item.value, 0)
        result.push({
          name: `Other (${otherItems.length} items)`,
          value: otherValue,
        })
      }

      return result
    },

    specificTotals() {
      if (!this.shopGranularData || this.shopGranularData.length === 0) return { food: 0, beverage: 0, beer: 0 }
      if (!this.menuItems || this.menuItems.length === 0) return { food: 0, beverage: 0, beer: 0 }

      let foodTotal = 0
      let beverageTotal = 0
      let beerTotal = 0

      for (const record of this.shopGranularData) {
        const menuItem = this.menuItemMap.get(record.menuItemId)
        if (!menuItem) continue

        const value = this.metric === 'revenue' ? Number(record.revenue || 0) : Number(record.quantity || 0)

        if (menuItem.type === 'Food') foodTotal += value
        if (menuItem.type === 'Beverage') beverageTotal += value
        if (menuItem.category === 'Beer') beerTotal += value
      }

      return { food: foodTotal, beverage: beverageTotal, beer: beerTotal }
    },

    totalValue() {
      return (this.typeChartData || []).reduce((sum, item) => sum + Number(item.value || 0), 0)
    },

    // ---- delta widgets (quantity only) ----
    foodDelta() {
      if (!this.previousPeriodData || !this.previousPeriodData.foodTotal) return 0
      const prev = Number(this.previousPeriodData.foodTotal || 0)
      return prev > 0 ? ((this.specificTotals.food - prev) / prev) * 100 : 0
    },
    beverageDelta() {
      if (!this.previousPeriodData || !this.previousPeriodData.beverageTotal) return 0
      const prev = Number(this.previousPeriodData.beverageTotal || 0)
      return prev > 0 ? ((this.specificTotals.beverage - prev) / prev) * 100 : 0
    },
    beerDelta() {
      if (!this.previousPeriodData || !this.previousPeriodData.beerTotal) return 0
      const prev = Number(this.previousPeriodData.beerTotal || 0)
      return prev > 0 ? ((this.specificTotals.beer - prev) / prev) * 100 : 0
    },

    foodDeltaIcon() {
      if (this.foodDelta > 0) return 'ArrowUp'
      if (this.foodDelta < 0) return 'ArrowDown'
      return 'Minus'
    },
    beverageDeltaIcon() {
      if (this.beverageDelta > 0) return 'ArrowUp'
      if (this.beverageDelta < 0) return 'ArrowDown'
      return 'Minus'
    },
    beerDeltaIcon() {
      if (this.beerDelta > 0) return 'ArrowUp'
      if (this.beerDelta < 0) return 'ArrowDown'
      return 'Minus'
    },

    foodDeltaClass() {
      if (this.foodDelta > 0) return 'text-blue-700 dark:text-blue-300'
      if (this.foodDelta < 0) return 'text-red-700 dark:text-red-300'
      return 'text-gray-500 dark:text-gray-400'
    },
    beverageDeltaClass() {
      if (this.beverageDelta > 0) return 'text-green-700 dark:text-green-300'
      if (this.beverageDelta < 0) return 'text-red-700 dark:text-red-300'
      return 'text-gray-500 dark:text-gray-400'
    },
    beerDeltaClass() {
      if (this.beerDelta > 0) return 'text-amber-700 dark:text-amber-300'
      if (this.beerDelta < 0) return 'text-red-700 dark:text-red-300'
      return 'text-gray-500 dark:text-gray-400'
    },

    // ---- chart.js data ----
    menuItemChartJsData() {
      return this.toDoughnutData(this.menuItemChartData, { mode: 'none' })
    },

    typeChartJsData() {
      return this.toDoughnutData(this.typeChartData, {
        mode: 'type',
        selectedName: this.selectedType,
        selectedStroke: '#3b82f6',
      })
    },

    categoryChartJsData() {
      return this.toDoughnutData(this.categoryChartData, {
        mode: 'category',
        selectedName: this.selectedCategory,
        selectedStroke: '#10b981',
      })
    },

    // ---- chart.js options ----
    basePieOptions() {
      const vm = this
      return {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external(context) {
              vm.externalTooltipHandler(context)
            },
          },
        },
      }
    },

    menuItemsOptions() {
      const vm = this
      return {
        ...this.basePieOptions,
        onHover(evt, elements) {
          const el = evt?.native?.target
          if (el && el.style) el.style.cursor = elements?.length ? 'default' : 'default'
        },
      }
    },

    typeOptions() {
      const vm = this
      return {
        ...this.basePieOptions,
        onHover(evt, elements) {
          const el = evt?.native?.target
          if (el && el.style) el.style.cursor = 'pointer'
        },
        onClick(evt, elements, chart) {
          if (!elements || elements.length === 0) return
          const index = elements[0].index
          const label = chart?.data?.labels?.[index]
          vm.handleTypeClick(label)
        },
      }
    },

    categoryOptions() {
      const vm = this
      return {
        ...this.basePieOptions,
        onHover(evt, elements) {
          const el = evt?.native?.target
          if (el && el.style) el.style.cursor = 'pointer'
        },
        onClick(evt, elements, chart) {
          if (!elements || elements.length === 0) return
          const index = elements[0].index
          const label = chart?.data?.labels?.[index]
          vm.handleCategoryClick(label)
        },
      }
    },
  },

  watch: {
    selectedTypeFilter: {
      immediate: true,
      handler(next) {
        const arr = next || []
        if (arr.length === 1) this.selectedType = arr[0]
        else if (arr.length === 0) this.selectedType = null
      },
    },
    selectedCategoryFilter: {
      immediate: true,
      handler(next) {
        const arr = next || []
        if (arr.length === 1) this.selectedCategory = arr[0]
        else if (arr.length === 0) this.selectedCategory = null
      },
    },
  },

  mounted() {
    const MOBILE_BREAKPOINT = 768
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)

    const onChange = () => {
      this.isMobile = !!mql.matches
    }

    this._mobileMql = mql
    this._mobileOnChange = onChange

    mql.addEventListener('change', onChange)
    onChange()
  },

  beforeUnmount() {
    if (this._mobileMql && this._mobileOnChange) {
      this._mobileMql.removeEventListener('change', this._mobileOnChange)
    }
  },

  methods: {
    toggleBtnClass(value) {
      return [
        'px-3 py-1 text-xs font-medium rounded-md transition-colors',
        this.metric === value
          ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100',
      ]
    },

    emitMetricChange(metric) {
      if (this.onMetricChange) this.onMetricChange(metric)
    },

    formatValue(value) {
      const roundedValue = Math.ceil(Number(value || 0))
      if (this.metric === 'revenue') return formatCurrency(roundedValue)
      return roundedValue.toLocaleString(currentIntlLocale())
    },

    clearFilters() {
      this.selectedType = null
      this.selectedCategory = null
      if (this.onTypeFilterChange) this.onTypeFilterChange([])
      if (this.onCategoryFilterChange) this.onCategoryFilterChange([])
    },

    handleTypeClick(typeName) {
      if (!typeName) return

      if (this.selectedType === typeName) {
        this.selectedType = null
        this.selectedCategory = null
        if (this.onTypeFilterChange) this.onTypeFilterChange([])
        if (this.onCategoryFilterChange) this.onCategoryFilterChange([])
      } else {
        this.selectedType = typeName
        this.selectedCategory = null
        if (this.onTypeFilterChange) this.onTypeFilterChange([typeName])
        if (this.onCategoryFilterChange) this.onCategoryFilterChange([])
      }
    },

    handleCategoryClick(categoryName) {
      if (!categoryName) return

      if (this.selectedCategory === categoryName) {
        this.selectedCategory = null
        if (this.onCategoryFilterChange) this.onCategoryFilterChange([])
        return
      }

      const found = (this.menuItems || []).find((item) => item?.category === categoryName)
      const categoryType = found?.type

      if (categoryType) {
        this.selectedType = categoryType
        if (this.onTypeFilterChange) this.onTypeFilterChange([categoryType])
      }

      this.selectedCategory = categoryName
      if (this.onCategoryFilterChange) this.onCategoryFilterChange([categoryName])
    },

    hexToRgba(hex, alpha) {
      if (!hex || typeof hex !== 'string' || !hex.startsWith('#') || (hex.length !== 7)) return hex
      const r = parseInt(hex.slice(1, 3), 16)
      const g = parseInt(hex.slice(3, 5), 16)
      const b = parseInt(hex.slice(5, 7), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    },

    toDoughnutData(list, cfg) {
      const items = list || []
      const labels = items.map((d) => d.name)
      const data = items.map((d) => Number(d.value || 0))

      const mode = cfg?.mode || 'none'
      const selectedName = cfg?.selectedName || null
      const selectedStroke = cfg?.selectedStroke || '#3b82f6'

      const baseColors = items.map((_, i) => COLORS[i % COLORS.length])

      let backgroundColor = baseColors
      let borderColor = items.map(() => 'rgba(0,0,0,0)')
      let borderWidth = items.map(() => 0)

      if ((mode === 'type' || mode === 'category') && selectedName) {
        backgroundColor = items.map((item, i) => {
          const isSelected = item.name === selectedName
          const c = baseColors[i]
          return isSelected ? this.hexToRgba(c, 1) : this.hexToRgba(c, 0.3)
        })

        borderColor = items.map((item) => (item.name === selectedName ? selectedStroke : 'rgba(0,0,0,0)'))
        borderWidth = items.map((item) => (item.name === selectedName ? 3 : 0))
      }

      return {
        labels,
        datasets: [
          {
            data,
            backgroundColor,
            borderColor,
            borderWidth,
            hoverOffset: 2,
          },
        ],
      }
    },

    externalTooltipHandler(context) {
      const { chart, tooltip } = context

      let tooltipEl = chart.canvas.parentNode.querySelector('.menu-item-qty-tooltip')
      if (!tooltipEl) {
        tooltipEl = document.createElement('div')
        tooltipEl.className = 'menu-item-qty-tooltip'
        tooltipEl.style.opacity = 0
        tooltipEl.style.position = 'absolute'
        tooltipEl.style.pointerEvents = 'none'
        tooltipEl.style.transition = 'opacity 0.1s ease'
        tooltipEl.style.zIndex = 50
        chart.canvas.parentNode.style.position = 'relative'
        chart.canvas.parentNode.appendChild(tooltipEl)
      }

      if (!tooltip || tooltip.opacity === 0) {
        tooltipEl.style.opacity = 0
        return
      }

      const dp = tooltip.dataPoints?.[0]
      if (!dp) {
        tooltipEl.style.opacity = 0
        return
      }

      const name = dp.label
      const value = Number(dp.raw || 0)
      const percentage = this.totalValue > 0 ? ((value / this.totalValue) * 100).toFixed(1) : '0'

      tooltipEl.innerHTML = `
        <div class="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg p-3 shadow-lg">
          <p class="font-medium text-gray-900 dark:text-gray-100">${name ?? ''}</p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            ${this.metric === 'revenue' ? 'Revenue' : 'Quantity'}: <span class="font-medium">${this.formatValue(value)}</span>
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Percentage: <span class="font-medium">${percentage}%</span>
          </p>
        </div>
      `

      const { offsetLeft: positionX, offsetTop: positionY } = chart.canvas
      tooltipEl.style.opacity = 1
      tooltipEl.style.left = positionX + tooltip.caretX + 'px'
      tooltipEl.style.top = positionY + tooltip.caretY + 'px'
      tooltipEl.style.transform = 'translate(-50%, -110%)'
    },
  },
}
</script>