<template>
  <Card class="bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/10 dark:to-gray-900 border-purple-200 dark:border-purple-800">
    <CardHeader class="flex flex-row items-center justify-between pb-2">
      <div>
        <CardTitle class="text-purple-700 dark:text-purple-300">Average Transaction by Event</CardTitle>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Overall Average: €{{ overallAvgTransaction.toFixed(2) }} • {{ chartData.length }} events with transaction data
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
          {{ sortMode === 'chronological' ? 'By Date' : 'By Value' }}
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
        <p>No events with transaction data available</p>
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
  name: 'AvgTransactionByEventChart',
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
      sortMode: 'chronological', // 'chronological' | 'avgTransaction'
    }
  },

  computed: {
    // Filter events with transactions > 0 and calculate average transaction value
    chartData() {
      const filtered = (this.eventPerformanceData || []).filter(
        (event) => (event?.totalTransactions || 0) > 0
      )

      const withAvgTransaction = filtered.map((event) => ({
        name: event.eventName,
        eventDate: event.eventDate,
        avgTransaction:
          event.totalTransactions > 0 ? event.totalRevenue / event.totalTransactions : 0,
        revenue: event.totalRevenue,
        transactions: event.totalTransactions,
        attendees: event.ticketsScanned,
      }))

      const sorted = withAvgTransaction.sort((a, b) => {
        if (this.sortMode === 'chronological') {
          const dateA = this.parseEventDate(a.eventDate).getTime()
          const dateB = this.parseEventDate(b.eventDate).getTime()
          return dateA - dateB
        }
        return b.avgTransaction - a.avgTransaction
      })

      console.log(
        `[AVG TRANSACTION CHART] Events sorted by ${this.sortMode}:`,
        sorted.map((e) => ({ name: e.name, date: e.eventDate, avg: e.avgTransaction.toFixed(2) }))
      )

      return sorted
    },

    overallAvgTransaction() {
      if (!this.chartData || this.chartData.length === 0) return 0
      return this.chartData.reduce((sum, item) => sum + (item.avgTransaction || 0), 0) / this.chartData.length
    },

    maxAvgTransaction() {
      if (!this.chartData || this.chartData.length === 0) return 0
      return Math.max(...this.chartData.map((d) => d.avgTransaction || 0))
    },

    chartJsData() {
      const labels =
        this.sortMode === 'chronological'
          ? this.chartData.map((d) => d.eventDate)
          : this.chartData.map((d) => d.name)

      const colors = this.chartData.map((entry) =>
        this.getBarColor(entry.avgTransaction || 0, this.maxAvgTransaction || 0)
      )

      return {
        labels,
        datasets: [
          {
            label: 'Avg/Transaction',
            data: this.chartData.map((d) => d.avgTransaction || 0),
            backgroundColor: colors, // équivalent de <Cell fill=.../> (couleur par barre)
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
            enabled: false, // on remplace par tooltip HTML custom (équivalent du Tooltip content React)
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
      this.sortMode = this.sortMode === 'chronological' ? 'avgTransaction' : 'chronological'
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

    // Color scale: gradient from purple-400 to purple-600
    getBarColor(value, max) {
      if (!max || max <= 0) return '#e9d5ff'
      const ratio = value / max
      if (ratio > 0.8) return '#9333ea' // purple-600
      if (ratio > 0.6) return '#a855f7' // purple-500
      if (ratio > 0.4) return '#c084fc' // purple-400
      if (ratio > 0.2) return '#d8b4fe' // purple-300
      return '#e9d5ff' // purple-200
    },

    externalTooltipHandler(context) {
      const { chart, tooltip } = context

      // Create tooltip element
      let tooltipEl = chart.canvas.parentNode.querySelector('.avg-transaction-tooltip')
      if (!tooltipEl) {
        tooltipEl = document.createElement('div')
        tooltipEl.className = 'avg-transaction-tooltip'
        tooltipEl.style.opacity = 0
        tooltipEl.style.position = 'absolute'
        tooltipEl.style.pointerEvents = 'none'
        tooltipEl.style.transition = 'opacity 0.1s ease'
        tooltipEl.style.zIndex = 50
        chart.canvas.parentNode.style.position = 'relative'
        chart.canvas.parentNode.appendChild(tooltipEl)
      }

      // Hide if no tooltip
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

      const attendeesLine =
        (data.attendees || 0) > 0
          ? `<p class="text-gray-700 dark:text-gray-300">Attendees: ${Number(data.attendees).toLocaleString()}</p>`
          : ''

      tooltipEl.innerHTML = `
        <div class="bg-white dark:bg-gray-800 p-3 border border-purple-200 dark:border-purple-700 rounded-lg shadow-lg">
          <p class="font-semibold text-sm text-gray-900 dark:text-gray-100">${data.name ?? ''}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">${data.eventDate ?? ''}</p>
          <div class="space-y-1 text-xs">
            <p class="font-semibold text-purple-600 dark:text-purple-400">
              Avg/Transaction: €${Number(data.avgTransaction || 0).toFixed(2)}
            </p>
            <p class="text-gray-700 dark:text-gray-300">
              Total Revenue: €${Number(data.revenue || 0).toLocaleString()}
            </p>
            <p class="text-gray-700 dark:text-gray-300">
              Transactions: ${Number(data.transactions || 0).toLocaleString()}
            </p>
            ${attendeesLine}
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