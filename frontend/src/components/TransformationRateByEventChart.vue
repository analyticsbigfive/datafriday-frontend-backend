<template>
  <Card class="bg-gradient-to-br from-teal-50 to-white dark:from-teal-900/10 dark:to-gray-900 border-teal-200 dark:border-teal-800">
    <CardHeader class="flex flex-row items-center justify-between pb-2">
      <div>
        <CardTitle class="text-teal-700 dark:text-teal-300">Transformation Rate by Event</CardTitle>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Average: {{ avgTransformationRate.toFixed(1) }}% • {{ chartData.length }} events with attendance data
        </p>
      </div>

      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          class="text-xs"
          @click="toggleSortMode"
        >
          <ArrowUpDown class="h-3 w-3 mr-1" />
          {{ sortMode === 'chronological' ? 'By Date' : 'By Rate' }}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          @click="onClose"
        >
          <X class="h-4 w-4" />
        </Button>
      </div>
    </CardHeader>

    <CardContent>
      <div v-if="chartData.length === 0" class="flex items-center justify-center h-64 text-gray-500 dark:text-gray-400">
        <p>No events with attendance data available</p>
      </div>

      <div v-else class="w-full" style="height: 400px;">
        <Bar :data="chartJsData" :options="chartJsOptions" />
      </div>
    </CardContent>
  </Card>
</template>

<script>
import Card from '../ui/card.vue'
import CardContent from '../ui/cardContent.vue'
import CardHeader from '../ui/cardHeader.vue'
import CardTitle from '../ui/cardTitle.vue'
import Button from '../ui/button.vue'
import { X, ArrowUpDown } from 'lucide-vue-next'

import { Bar } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend)

export default {
  name: 'TransformationRateByEventChart',
  components: {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    Button,
    X,
    ArrowUpDown,
    Bar,
  },
  props: {
    eventPerformanceData: { type: Array, required: true },
    onClose: { type: Function, required: true },
  },

  data() {
    return {
      sortMode: 'chronological', // 'chronological' | 'transformationRate'
    }
  },

  computed: {
    // Filter events with ticketsScanned > 0 and calculate transformation rate
    chartData() {
      const filtered = (this.eventPerformanceData || []).filter(
        (event) => (event?.ticketsScanned || 0) > 0
      )

      const withTransformationRate = filtered.map((event) => {
        const attendees = Number(event.ticketsScanned || 0)
        const transactions = Number(event.totalTransactions || 0)
        const transformationRate = attendees > 0 ? (transactions / attendees) * 100 : 0

        return {
          name: event.eventName,
          eventDate: event.eventDate,
          transformationRate,
          transactions,
          attendees,
        }
      })

      const sorted = withTransformationRate.sort((a, b) => {
        if (this.sortMode === 'chronological') {
          const dateA = this.parseEventDate(a.eventDate).getTime()
          const dateB = this.parseEventDate(b.eventDate).getTime()
          return dateA - dateB
        }
        return b.transformationRate - a.transformationRate
      })

      console.log(
        `[TRANSFORMATION RATE CHART] Events sorted by ${this.sortMode}:`,
        sorted.map((e) => ({
          name: e.name,
          date: e.eventDate,
          rate: Number(e.transformationRate || 0).toFixed(1),
        }))
      )

      return sorted
    },

    avgTransformationRate() {
      if (!this.chartData || this.chartData.length === 0) return 0
      return (
        this.chartData.reduce((sum, item) => sum + (item.transformationRate || 0), 0) /
        this.chartData.length
      )
    },

    maxTransformationRate() {
      if (!this.chartData || this.chartData.length === 0) return 0
      return Math.max(...this.chartData.map((d) => d.transformationRate || 0))
    },

    chartJsData() {
      const labels =
        this.sortMode === 'chronological'
          ? this.chartData.map((d) => d.eventDate)
          : this.chartData.map((d) => d.name)

      const colors = this.chartData.map((entry) =>
        this.getBarColor(entry.transformationRate || 0, this.maxTransformationRate || 0)
      )

      return {
        labels,
        datasets: [
          {
            label: 'Transformation Rate',
            data: this.chartData.map((d) => d.transformationRate || 0),
            backgroundColor: colors,
            borderRadius: 4,
            borderSkipped: 'bottom',
          },
        ],
      }
    },

    chartJsOptions() {
      const vm = this

      return {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 20, right: 30, left: 20, bottom: 0 },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: false,
            external(context) {
              vm.externalTooltipHandler(context)
            },
          },
        },
        scales: {
          x: {
            ticks: {
              maxRotation: 45,
              minRotation: 45,
              font: { size: 10 },
            },
            grid: { display: false },
          },
          y: {
            ticks: {
              font: { size: 10 },
              callback(value) {
                const v = Number(value || 0)
                return `${v.toFixed(0)}%`
              },
            },
          },
        },
      }
    },
  },

  methods: {
    toggleSortMode() {
      this.sortMode = this.sortMode === 'chronological' ? 'transformationRate' : 'chronological'
    },

    // Helper function to parse dates in DD/MM/YYYY or YYYY-MM-DD format
    parseEventDate(dateStr) {
      if (!dateStr) return new Date(0)

      if (String(dateStr).includes('/')) {
        const [day, month, year] = String(dateStr).split('/')
        return new Date(`${year}-${month}-${day}`)
      }
      return new Date(dateStr)
    },

    // Color scale: gradient from teal-400 to teal-600
    getBarColor(value, max) {
      if (!max || max <= 0) return '#99f6e4'
      const ratio = value / max
      if (ratio > 0.8) return '#0d9488' // teal-600
      if (ratio > 0.6) return '#14b8a6' // teal-500
      if (ratio > 0.4) return '#2dd4bf' // teal-400
      if (ratio > 0.2) return '#5eead4' // teal-300
      return '#99f6e4' // teal-200
    },

    externalTooltipHandler(context) {
      const { chart, tooltip } = context

      let tooltipEl = chart.canvas.parentNode.querySelector('.transformation-rate-tooltip')
      if (!tooltipEl) {
        tooltipEl = document.createElement('div')
        tooltipEl.className = 'transformation-rate-tooltip'
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

      const index = tooltip.dataPoints?.[0]?.dataIndex
      const data = this.chartData?.[index]
      if (!data) {
        tooltipEl.style.opacity = 0
        return
      }

      tooltipEl.innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-3 border border-teal-200 dark:border-teal-700 rounded-lg shadow-lg">
          <p class="font-semibold text-sm text-gray-900 dark:text-gray-100">${data.name ?? ''}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">${data.eventDate ?? ''}</p>
          <div class="space-y-1 text-xs">
            <p class="font-semibold text-teal-600 dark:text-teal-400">
              Transformation Rate: ${Number(data.transformationRate || 0).toFixed(1)}%
            </p>
            <p class="text-gray-700 dark:text-gray-300">
              Transactions: ${Number(data.transactions || 0).toLocaleString()}
            </p>
            <p class="text-gray-700 dark:text-gray-300">
              Attendees: ${Number(data.attendees || 0).toLocaleString()}
            </p>
          </div>
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