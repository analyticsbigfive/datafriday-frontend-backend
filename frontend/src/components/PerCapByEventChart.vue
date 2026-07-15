<template>
  <Card class="bg-gradient-to-br from-pink-50 to-white dark:from-pink-900/10 dark:to-gray-900 border-pink-200 dark:border-pink-800">
    <CardHeader class="flex flex-row items-center justify-between pb-2">
      <div>
        <CardTitle class="text-pink-700 dark:text-pink-300">
          {{ mode === 'future' ? 'Predicted Per Capita Revenue by Event' : 'Per Capita Revenue by Event' }}
        </CardTitle>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Average: €{{ avgPerCap.toFixed(2) }} • {{ chartData.length }} {{ mode === 'future' ? 'future events' : 'events' }} with attendance data
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
          {{ sortMode === 'chronological' ? 'By Date' : 'By PerCap' }}
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
  name: 'PerCapByEventChart',
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
    mode: { type: String, default: 'all' }, // 'all' | 'future'
    highlightPastEvents: { type: Boolean, default: false },
  },

  data() {
    return {
      sortMode: 'chronological', // 'chronological' | 'perCap'
    }
  },

  computed: {
    // Filter events with ticketsScanned > 0 and sort based on mode
    chartData() {
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      let filtered = (this.eventPerformanceData || []).filter(
        (event) => (event?.ticketsScanned || 0) > 0 && (event?.perCap || 0) > 0
      )

      if (this.mode === 'future') {
        filtered = filtered.filter((event) => {
          const eventDate = this.parseEventDate(event.eventDate)
          return eventDate > today
        })
      }

      const sorted = filtered.sort((a, b) => {
        if (this.sortMode === 'chronological') {
          const dateA = this.parseEventDate(a.eventDate).getTime()
          const dateB = this.parseEventDate(b.eventDate).getTime()
          return dateA - dateB
        }
        return Number(b.perCap || 0) - Number(a.perCap || 0)
      })

      console.log(
        `[PERCAP CHART] Events sorted by ${this.sortMode}:`,
        sorted.map((e) => ({ name: e.eventName, date: e.eventDate, perCap: e.perCap }))
      )

      return sorted.map((event) => {
        const eventDate = this.parseEventDate(event.eventDate)
        const isPast = eventDate < today

        return {
          name: event.eventName,
          eventDate: event.eventDate,
          perCap: Number(event.perCap || 0),
          revenue: Number(event.totalRevenue || 0),
          attendees: Number(event.ticketsScanned || 0),
          isPredictive: !!event.isPredictive,
          isPast,
        }
      })
    },

    avgPerCap() {
      if (!this.chartData || this.chartData.length === 0) return 0
      return this.chartData.reduce((sum, item) => sum + (item.perCap || 0), 0) / this.chartData.length
    },

    maxPerCap() {
      if (!this.chartData || this.chartData.length === 0) return 0
      return Math.max(...this.chartData.map((d) => d.perCap || 0))
    },

    chartJsData() {
      const labels =
        this.sortMode === 'chronological'
          ? this.chartData.map((d) => d.eventDate)
          : this.chartData.map((d) => d.name)

      const colors = this.chartData.map((entry) => {
        const isPastAndHighlighted = this.highlightPastEvents && entry.isPast
        if (isPastAndHighlighted) return '#d1d5db' // gray-300
        return this.getBarColor(entry.perCap || 0, this.maxPerCap || 0)
      })

      return {
        labels,
        datasets: [
          {
            label: 'PerCap',
            data: this.chartData.map((d) => d.perCap || 0),
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
                return `€${v.toFixed(0)}`
              },
            },
          },
        },
      }
    },
  },

  methods: {
    toggleSortMode() {
      this.sortMode = this.sortMode === 'chronological' ? 'perCap' : 'chronological'
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

    // Color scale: gradient from pink-400 to pink-600
    getBarColor(value, max) {
      if (!max || max <= 0) return '#fce7f3' // pink-100
      const ratio = value / max
      if (ratio > 0.8) return '#db2777' // pink-600
      if (ratio > 0.6) return '#ec4899' // pink-500
      if (ratio > 0.4) return '#f472b6' // pink-400
      if (ratio > 0.2) return '#f9a8d4' // pink-300
      return '#fce7f3' // pink-100
    },

    externalTooltipHandler(context) {
      const { chart, tooltip } = context

      let tooltipEl = chart.canvas.parentNode.querySelector('.percap-tooltip')
      if (!tooltipEl) {
        tooltipEl = document.createElement('div')
        tooltipEl.className = 'percap-tooltip'
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

      const pastTag =
        this.highlightPastEvents && data.isPast
          ? `<span class="text-xs bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded">Past</span>`
          : ''

      const predictedTag =
        data.isPredictive
          ? `<span class="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">Predicted</span>`
          : ''

      const tags =
        pastTag || predictedTag
          ? `<div class="flex items-center gap-1">${pastTag}${predictedTag}</div>`
          : `<div></div>`

      tooltipEl.innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-3 border border-pink-200 dark:border-pink-700 rounded-lg shadow-lg">
          <div class="flex items-center justify-between gap-2 mb-1">
            <p class="font-semibold text-sm text-gray-900 dark:text-gray-100">${data.name ?? ''}</p>
            ${tags}
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">${data.eventDate ?? ''}</p>
          <div class="space-y-1 text-xs">
            <p class="font-semibold text-pink-600 dark:text-pink-400">
              PerCap: €${Number(data.perCap || 0).toFixed(2)}
            </p>
            <p class="text-gray-700 dark:text-gray-300">
              Revenue: €${Number(data.revenue || 0).toLocaleString()}
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