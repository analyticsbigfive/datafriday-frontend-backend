<template>
  <div class="space-y-4">
    <div class="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Shop Distribution by {{ metric === 'revenue' ? 'Revenue' : 'Quantity' }}
          </h3>

          <p v-if="!isMobile" class="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Total {{ metric === 'revenue' ? 'Revenue' : 'Quantity' }}:
            <span class="font-medium text-gray-900 dark:text-gray-100">{{ formatValue(totalShopValue) }}</span>
          </p>
        </div>

        <div class="inline-flex rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-0.5">
          <button
            type="button"
            @click="emitMetricChange('quantity')"
            :class="[
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              metric === 'quantity'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            ]"
          >
            Quantity
          </button>

          <button
            type="button"
            @click="emitMetricChange('revenue')"
            :class="[
              'px-3 py-1 text-xs font-medium rounded-md transition-colors',
              metric === 'revenue'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            ]"
          >
            Revenue
          </button>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <!-- By Shop -->
      <Card class="bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader class="pb-2">
          <CardTitle class="text-base flex items-center gap-2">
            <Store class="w-4 h-4" />
            Shop Distribution
          </CardTitle>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ shopChartData.length }} {{ shopChartData.length === 1 ? 'shop' : 'shops' }}
          </p>
        </CardHeader>

        <CardContent>
          <div
            v-if="shopChartData.length === 0"
            class="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400 text-sm"
          >
            No shop data available
          </div>

          <template v-else>
            <div class="w-full" style="height: 200px;">
              <Doughnut :data="shopChartJsData" :options="pieOptions" />
            </div>

            <div class="mt-4 space-y-2">
              <div class="grid grid-cols-1 gap-1.5">
                <div
                  v-for="(entry, idx) in legendDisplayData(shopChartData, showAllShops, 5)"
                  :key="'shop-legend-' + idx"
                  class="flex items-center gap-2 text-xs"
                >
                  <div
                    class="w-3 h-3 rounded-sm flex-shrink-0"
                    :style="{ backgroundColor: legendColor(shopChartData, entry) }"
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
                v-if="legendHasMore(shopChartData, 5)"
                variant="ghost"
                size="sm"
                class="w-full h-7 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                @click="showAllShops = !showAllShops"
              >
                <template v-if="showAllShops">
                  <ChevronUp class="w-3 h-3 mr-1" />
                  Show Less
                </template>
                <template v-else>
                  <ChevronDown class="w-3 h-3 mr-1" />
                  Show All ({{ shopChartData.length }})
                </template>
              </Button>
            </div>
          </template>
        </CardContent>
      </Card>

      <!-- By Shop Type -->
      <Card class="bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader class="pb-2">
          <CardTitle class="text-base flex items-center gap-2">
            <Store class="w-4 h-4" />
            By Shop Type
          </CardTitle>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ shopTypeChartData.length }} {{ shopTypeChartData.length === 1 ? 'type' : 'types' }}
          </p>
        </CardHeader>

        <CardContent>
          <div
            v-if="shopTypeChartData.length === 0"
            class="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400 text-sm"
          >
            No shop type data available
          </div>

          <template v-else>
            <div class="w-full" style="height: 200px;">
              <Doughnut :data="typeChartJsData" :options="pieOptions" />
            </div>

            <div class="mt-4 space-y-2">
              <div class="grid grid-cols-1 gap-1.5">
                <div
                  v-for="(entry, idx) in legendDisplayData(shopTypeChartData, showAllTypes, 5)"
                  :key="'type-legend-' + idx"
                  class="flex items-center gap-2 text-xs"
                >
                  <div
                    class="w-3 h-3 rounded-sm flex-shrink-0"
                    :style="{ backgroundColor: legendColor(shopTypeChartData, entry) }"
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
                v-if="legendHasMore(shopTypeChartData, 5)"
                variant="ghost"
                size="sm"
                class="w-full h-7 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                @click="showAllTypes = !showAllTypes"
              >
                <template v-if="showAllTypes">
                  <ChevronUp class="w-3 h-3 mr-1" />
                  Show Less
                </template>
                <template v-else>
                  <ChevronDown class="w-3 h-3 mr-1" />
                  Show All ({{ shopTypeChartData.length }})
                </template>
              </Button>
            </div>
          </template>
        </CardContent>
      </Card>

      <!-- By Shop Area -->
      <Card class="bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
        <CardHeader class="pb-2">
          <CardTitle class="text-base flex items-center gap-2">
            <Store class="w-4 h-4" />
            By Shop Area
          </CardTitle>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            {{ shopAreaChartData.length }} {{ shopAreaChartData.length === 1 ? 'area' : 'areas' }}
          </p>
        </CardHeader>

        <CardContent>
          <div
            v-if="shopAreaChartData.length === 0"
            class="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400 text-sm"
          >
            No shop area data available
          </div>

          <template v-else>
            <div class="w-full" style="height: 200px;">
              <Doughnut :data="areaChartJsData" :options="pieOptions" />
            </div>

            <div class="mt-4 space-y-2">
              <div class="grid grid-cols-1 gap-1.5">
                <div
                  v-for="(entry, idx) in legendDisplayData(shopAreaChartData, showAllAreas, 5)"
                  :key="'area-legend-' + idx"
                  class="flex items-center gap-2 text-xs"
                >
                  <div
                    class="w-3 h-3 rounded-sm flex-shrink-0"
                    :style="{ backgroundColor: legendColor(shopAreaChartData, entry) }"
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
                v-if="legendHasMore(shopAreaChartData, 5)"
                variant="ghost"
                size="sm"
                class="w-full h-7 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                @click="showAllAreas = !showAllAreas"
              >
                <template v-if="showAllAreas">
                  <ChevronUp class="w-3 h-3 mr-1" />
                  Show Less
                </template>
                <template v-else>
                  <ChevronDown class="w-3 h-3 mr-1" />
                  Show All ({{ shopAreaChartData.length }})
                </template>
              </Button>
            </div>
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
import { ChevronDown, ChevronUp, Store } from 'lucide-vue-next'

import { Doughnut } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend)

const COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#10b981', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#a855f7', // violet
  '#f43f5e', // rose
  '#84cc16', // lime
  '#6366f1', // indigo
  '#eab308', // yellow
  '#64748b', // slate
  '#dc2626', // red-600
  '#059669', // emerald
  '#d97706', // amber-600
]

export default {
  name: 'ShopDistributionPieChart',
  components: {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    ChevronDown,
    ChevronUp,
    Store,
    Doughnut,
  },
  props: {
    shopGranularData: { type: Array, required: true },
    elementIdToNameMap: { type: Object, required: false }, // Map<string,string>
    elementIdToTypesMap: { type: Object, required: false }, // Map<string,string[]>
    elementIdToAreaMap: { type: Object, required: false }, // Map<string,string>
    previousPeriodData: { type: Object, required: false },
    hasPreviousPeriod: { type: Boolean, required: false },
    metric: { type: String, default: 'revenue' }, // 'quantity' | 'revenue'
    onMetricChange: { type: Function, required: false },
  },

  data() {
    return {
      COLORS,
      showAllShops: false,
      showAllTypes: false,
      showAllAreas: false,
      isMobile: false,
      _mobileMql: null,
      _mobileOnChange: null,
    }
  },

  computed: {
    shopChartData() {
      if (!this.shopGranularData || this.shopGranularData.length === 0) return []

      const aggregation = new Map()
      for (const record of this.shopGranularData) {
        const shopName = record?.elementName || this.getElementName(record?.elementId)
        const key = shopName

        if (!aggregation.has(key)) aggregation.set(key, { name: key, value: 0 })

        const entry = aggregation.get(key)
        if (this.metric === 'revenue') entry.value += Number(record?.revenue || 0)
        else entry.value += Number(record?.quantity || 0)
      }

      return Array.from(aggregation.values()).sort((a, b) => b.value - a.value)
    },

    shopTypeChartData() {
      if (!this.shopGranularData || this.shopGranularData.length === 0) return []

      const aggregation = new Map()
      for (const record of this.shopGranularData) {
        const key = this.getElementTypes(record?.elementId)

        if (!aggregation.has(key)) aggregation.set(key, { name: key, value: 0 })

        const entry = aggregation.get(key)
        if (this.metric === 'revenue') entry.value += Number(record?.revenue || 0)
        else entry.value += Number(record?.quantity || 0)
      }

      return Array.from(aggregation.values()).sort((a, b) => b.value - a.value)
    },

    shopAreaChartData() {
      if (!this.shopGranularData || this.shopGranularData.length === 0) return []

      const aggregation = new Map()
      for (const record of this.shopGranularData) {
        const key = this.getElementArea(record?.elementId)

        if (!aggregation.has(key)) aggregation.set(key, { name: key, value: 0 })

        const entry = aggregation.get(key)
        if (this.metric === 'revenue') entry.value += Number(record?.revenue || 0)
        else entry.value += Number(record?.quantity || 0)
      }

      return Array.from(aggregation.values()).sort((a, b) => b.value - a.value)
    },

    totalShopValue() {
      return this.shopChartData.reduce((sum, item) => sum + Number(item.value || 0), 0)
    },
    totalTypeValue() {
      return this.shopTypeChartData.reduce((sum, item) => sum + Number(item.value || 0), 0)
    },
    totalAreaValue() {
      return this.shopAreaChartData.reduce((sum, item) => sum + Number(item.value || 0), 0)
    },

    shopChartJsData() {
      return this.toDoughnutData(this.shopChartData)
    },
    typeChartJsData() {
      return this.toDoughnutData(this.shopTypeChartData)
    },
    areaChartJsData() {
      return this.toDoughnutData(this.shopAreaChartData)
    },

    pieOptions() {
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
    emitMetricChange(metric) {
      if (this.onMetricChange) this.onMetricChange(metric)
    },

    getElementName(elementId) {
      // Support Map OR plain object (au cas où)
      return (
        (this.elementIdToNameMap && this.elementIdToNameMap.get && this.elementIdToNameMap.get(elementId)) ||
        (this.elementIdToNameMap && this.elementIdToNameMap[elementId]) ||
        elementId
      )
    },

    getElementTypes(elementId) {
      const types =
        (this.elementIdToTypesMap && this.elementIdToTypesMap.get && this.elementIdToTypesMap.get(elementId)) ||
        (this.elementIdToTypesMap && this.elementIdToTypesMap[elementId]) ||
        []
      return types && types.length > 0 ? types.join(', ') : 'Unknown Type'
    },

    getElementArea(elementId) {
      return (
        (this.elementIdToAreaMap && this.elementIdToAreaMap.get && this.elementIdToAreaMap.get(elementId)) ||
        (this.elementIdToAreaMap && this.elementIdToAreaMap[elementId]) ||
        'Unknown Area'
      )
    },

    formatValue(value) {
      if (this.metric === 'revenue') {
        return `€${Number(value || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      }
      return Number(value || 0).toLocaleString()
    },

    toDoughnutData(list) {
      const items = list || []
      return {
        labels: items.map((d) => d.name),
        datasets: [
          {
            data: items.map((d) => Number(d.value || 0)),
            backgroundColor: items.map((_, i) => COLORS[i % COLORS.length]),
            borderWidth: 0,
          },
        ],
      }
    },

    legendDisplayData(data, showAll, limit) {
      return showAll ? data : (data || []).slice(0, limit)
    },

    legendHasMore(data, limit) {
      return (data || []).length > limit
    },

    legendColor(fullData, entry) {
      const idx = (fullData || []).indexOf(entry)
      return COLORS[(idx < 0 ? 0 : idx) % COLORS.length]
    },

    externalTooltipHandler(context) {
      const { chart, tooltip } = context

      let tooltipEl = chart.canvas.parentNode.querySelector('.shop-distribution-tooltip')
      if (!tooltipEl) {
        tooltipEl = document.createElement('div')
        tooltipEl.className = 'shop-distribution-tooltip'
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

      const label = dp.label
      const value = Number(dp.raw || 0)
      const total = (chart?.data?.datasets?.[0]?.data || []).reduce((s, v) => s + Number(v || 0), 0)
      const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'

      tooltipEl.innerHTML = `
        <div class="bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm p-3 border border-gray-300 dark:border-gray-600 rounded shadow-lg">
          <p class="font-semibold text-gray-900 dark:text-gray-100">${label ?? ''}</p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            ${this.metric === 'revenue' ? 'Revenue' : 'Quantity'}: ${this.formatValue(value)}
          </p>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            Share: ${percentage}%
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