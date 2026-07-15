<template>

  <div class="flex items-center gap-8">   
    
    <!-- Revenue -->
    <div class="text-center">
      <div class="text-sm text-gray-500 dark:text-gray-400">Revenue</div>
      <div class="font-semibold text-green-600 dark:text-green-400">
        €{{ Math.round(displayRevenue).toLocaleString('fr-FR') }}
      </div>
      <div v-if="getPreviousPeriodRange && previousPeriodMetrics.revenue > 0 && !isTimelineFilterActive" class="flex items-center justify-center gap-1 text-xs font-medium mt-1">
        <ArrowUp v-if="revenueChange > 0" class="w-3 h-3 text-green-700 dark:text-green-300" />
        <ArrowDown v-else-if="revenueChange < 0" class="w-3 h-3 text-red-700 dark:text-red-300" />
        <Minus v-else class="w-3 h-3 text-gray-500 dark:text-gray-400" />
        {{ Math.abs(revenueChange).toFixed(1) }}%
      </div>
    </div>
 
    <!-- Avg/Event -->
     <!--
    <div class="text-center">
      <div class="text-sm text-gray-500 dark:text-gray-400">Avg/Event</div>
      <div class="font-semibold text-orange-600 dark:text-orange-400">
        €{{ Math.round(displayAvgRevenuePerEvent).toLocaleString('fr-FR') }}
      </div>
      <div v-if="getPreviousPeriodRange && previousPeriodMetrics.validEventCount > 0 && !isTimelineFilterActive" class="flex items-center justify-center gap-1 text-xs font-medium mt-1">
        <ArrowUp v-if="avgEventChange > 0" class="w-3 h-3 text-green-700 dark:text-green-300" />
        <ArrowDown v-else-if="avgEventChange < 0" class="w-3 h-3 text-red-700 dark:text-red-300" />
        <Minus v-else class="w-3 h-3 text-gray-500 dark:text-gray-400" />
        {{ Math.abs(avgEventChange).toFixed(1) }}%
      </div>
    </div>-->
 
    <!-- Cost Button -->

    <!-- 
    <button 
      @click="handleCostChartToggle"
      :class="`text-center rounded-lg p-3 transition-all cursor-pointer border-2 ${showCostChart ? 'bg-red-100 dark:bg-red-900/40 border-red-400 dark:border-red-600 shadow-md' : 'bg-red-50/50 dark:bg-red-900/10 border-red-200 dark:border-red-800/50 hover:bg-red-100 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-700'}`"
      title="Click to view Cost by Event"
    >
      <div class="text-sm text-gray-500 dark:text-gray-400">Cost</div>
      <div class="font-semibold text-red-600 dark:text-red-400">
        €{{ Math.round(displayCost).toLocaleString('fr-FR') }}
      </div>
      <div v-if="getPreviousPeriodRange && previousPeriodMetrics.cost > 0 && !isTimelineFilterActive" class="flex items-center justify-center gap-1 text-xs font-medium mt-1">
        <ArrowUp v-if="costChange > 0" class="w-3 h-3 text-red-700 dark:text-red-300" />
        <ArrowDown v-else-if="costChange < 0" class="w-3 h-3 text-green-700 dark:text-green-300" />
        <Minus v-else class="w-3 h-3 text-gray-500 dark:text-gray-400" />
        {{ Math.abs(costChange).toFixed(1) }}%
      </div>
    </button>-->
 
    <!-- Transactions Button -->

    <!--
    <button 
      @click="handleTransactionsChartToggle"
      :class="`text-center rounded-lg p-3 transition-all cursor-pointer border-2 ${showTransactionsChart ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600 shadow-md' : 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:border-blue-300 dark:hover:border-blue-700'}`"
      title="Click to view Transactions by Event"
    >
      <div class="text-sm text-gray-500 dark:text-gray-400">Transac.</div>
      <div class="font-semibold text-blue-600 dark:text-blue-400">
        {{ displayTransactions.toLocaleString('fr-FR') }}
      </div>
      <div v-if="getPreviousPeriodRange && (previousPeriodMetrics.totalTransactions > 0 || displayTransactions > 0) && !isTimelineFilterActive" class="flex items-center justify-center gap-1 text-xs font-medium mt-1">
        <ArrowUp v-if="transactionsChange > 0" class="w-3 h-3 text-green-700 dark:text-green-300" />
        <ArrowDown v-else-if="transactionsChange < 0" class="w-3 h-3 text-red-700 dark:text-red-300" />
        <Minus v-else class="w-3 h-3 text-gray-500 dark:text-gray-400" />
        {{ previousPeriodMetrics.totalTransactions === 0 && displayTransactions > 0 ? 'New' : `${Math.abs(transactionsChange).toFixed(1)}%` }}
      </div>
    </button>-->
 
    <!-- Avg/Transaction Button -->

    <!-- 
    <button 
      @click="handleAvgTransactionChartToggle"
      :class="`text-center rounded-lg p-3 transition-all cursor-pointer border-2 ${showAvgTransactionChart ? 'bg-purple-100 dark:bg-purple-900/40 border-purple-400 dark:border-purple-600 shadow-md' : 'bg-purple-50/50 dark:bg-purple-900/10 border-purple-200 dark:border-purple-800/50 hover:bg-purple-100 dark:hover:bg-purple-900/30 hover:border-purple-300 dark:hover:border-purple-700'}`"
      title="Click to view Average Transaction by Event"
    >
      <div class="text-sm text-gray-500 dark:text-gray-400">Avg/Transac.</div>
      <div class="font-semibold text-purple-600 dark:text-purple-400">
        €{{ displayAvgPerTransaction.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
      </div>
      <div v-if="getPreviousPeriodRange && previousPeriodMetrics.totalTransactions > 0 && !isTimelineFilterActive" class="flex items-center justify-center gap-1 text-xs font-medium mt-1">
        <ArrowUp v-if="avgTransactionChange > 0" class="w-3 h-3 text-green-700 dark:text-green-300" />
        <ArrowDown v-else-if="avgTransactionChange < 0" class="w-3 h-3 text-red-700 dark:text-red-300" />
        <Minus v-else class="w-3 h-3 text-gray-500 dark:text-gray-400" />
        {{ Math.abs(avgTransactionChange).toFixed(1) }}%
      </div>
    </button>-->
 
    <!-- Attendees Button -->

    <!-- 
    <button 
      @click="handleAttendeesChartToggle"
      :class="`text-center rounded-lg p-3 transition-all cursor-pointer border-2 ${showAttendeesChart ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600 shadow-md' : 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:border-blue-300 dark:hover:border-blue-700'}`"
      title="Click to view Attendees by Event"
    >
      <div class="text-sm text-gray-500 dark:text-gray-400">Attendees</div>
      <div class="font-semibold text-blue-600 dark:text-blue-400">
        {{ totalTicketsScanned.toLocaleString('fr-FR') }}
      </div>
      <div v-if="getPreviousPeriodRange && previousPeriodMetrics.totalTicketsScanned > 0" class="flex items-center justify-center gap-1 text-xs font-medium mt-1">
        <ArrowUp v-if="attendeesChange > 0" class="w-3 h-3 text-green-700 dark:text-green-300" />
        <ArrowDown v-else-if="attendeesChange < 0" class="w-3 h-3 text-red-700 dark:text-red-300" />
        <Minus v-else class="w-3 h-3 text-gray-500 dark:text-gray-400" />
        {{ Math.abs(attendeesChange).toFixed(1) }}%
      </div>
    </button> -->
 
    <!-- Transformation Rate Button -->

    <!--
    <button 
      @click="handleTransformationRateChartToggle"
      :class="`text-center rounded-lg p-3 transition-all cursor-pointer border-2 ${showTransformationRateChart ? 'bg-teal-100 dark:bg-teal-900/40 border-teal-400 dark:border-teal-600 shadow-md' : 'bg-teal-50/50 dark:bg-teal-900/10 border-teal-200 dark:border-teal-800/50 hover:bg-teal-100 dark:hover:bg-teal-900/30 hover:border-teal-300 dark:hover:border-teal-700'}`"
      title="Click to view Transformation Rate by Event"
    >
      <div class="text-sm text-gray-500 dark:text-gray-400">Transf. Rate</div>
      <div class="font-semibold text-teal-600 dark:text-teal-400">
        {{ totalTicketsScanned > 0 ? `${((displayTransactions / totalTicketsScanned) * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '0.0%' }}
      </div>
      <div v-if="getPreviousPeriodRange && previousPeriodMetrics.totalTicketsScanned > 0 && previousPeriodMetrics.totalTransactions > 0 && !isTimelineFilterActive" class="flex items-center justify-center gap-1 text-xs font-medium mt-1">
        <ArrowUp v-if="transformationRateChange > 0" class="w-3 h-3 text-green-700 dark:text-green-300" />
        <ArrowDown v-else-if="transformationRateChange < 0" class="w-3 h-3 text-red-700 dark:text-red-300" />
        <Minus v-else class="w-3 h-3 text-gray-500 dark:text-gray-400" />
        {{ prevTransformationRate === 0 && currentTransformationRate > 0 ? 'New' : `${Math.abs(transformationRateChange).toFixed(1)}%` }}
      </div>
    </button>-->
 
    <!-- PerCap Button -->
     <!--
    <button 
      @click="handlePerCapChartToggle"
      :class="`text-center rounded-lg p-3 transition-all cursor-pointer border-2 ${showPerCapChart ? 'bg-pink-100 dark:bg-pink-900/40 border-pink-400 dark:border-pink-600 shadow-md' : 'bg-pink-50/50 dark:bg-pink-900/10 border-pink-200 dark:border-pink-800/50 hover:bg-pink-100 dark:hover:bg-pink-900/30 hover:border-pink-300 dark:hover:border-pink-700'}`"
      title="Click to view PerCap by Event"
    >
      <div class="text-sm text-gray-500 dark:text-gray-400">PerCap</div>
      <div class="font-semibold text-pink-600 dark:text-pink-400">
        €{{ displayPerCapita.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }}
      </div>
      <div v-if="getPreviousPeriodRange && previousPeriodMetrics.totalTicketsScanned > 0 && !isTimelineFilterActive" class="flex items-center justify-center gap-1 text-xs font-medium mt-1">
        <ArrowUp v-if="perCapChange > 0" class="w-3 h-3 text-green-700 dark:text-green-300" />
        <ArrowDown v-else-if="perCapChange < 0" class="w-3 h-3 text-red-700 dark:text-red-300" />
        <Minus v-else class="w-3 h-3 text-gray-500 dark:text-gray-400" />
        {{ Math.abs(perCapChange).toFixed(1) }}%
      </div>
    </button>-->
  </div>
</template>

<script>
import { ArrowUp, ArrowDown, Minus } from "lucide-vue-next";
export default {
  name: "MetricsContent",
  components: {
    ArrowUp,
    ArrowDown,
    Minus,
  },
  props: {
    displayRevenue: Number,
    displayAvgRevenuePerEvent: Number,
    displayCost: Number,
    displayTransactions: Number,
    displayAvgPerTransaction: Number,
    displayPerCapita: Number,
    totalTicketsScanned: Number,
    getPreviousPeriodRange: Object,
    previousPeriodMetrics: Object,
    isTimelineFilterActive: Boolean,
    showCostChart: Boolean,
    showTransactionsChart: Boolean,
    showAvgTransactionChart: Boolean,
    showAttendeesChart: Boolean,
    showTransformationRateChart: Boolean,
    showPerCapChart: Boolean,
  },
  emits: [
    "toggle-cost",
    "toggle-transactions",
    "toggle-avg-transaction",
    "toggle-attendees",
    "toggle-transformation-rate",
    "toggle-per-cap",
  ],

  computed: {
    revenueChange() {
      if (!this.getPreviousPeriodRange || this.previousPeriodMetrics.revenue <= 0 || this.isTimelineFilterActive) return 0;
      return ((this.displayRevenue - this.previousPeriodMetrics.revenue) / this.previousPeriodMetrics.revenue) * 100;
    },
    
    avgEventChange() {
      if (!this.getPreviousPeriodRange || this.previousPeriodMetrics.validEventCount <= 0 || this.isTimelineFilterActive) return 0;
      const prevAvg = this.previousPeriodMetrics.revenue / this.previousPeriodMetrics.validEventCount;
      return prevAvg > 0 ? ((this.displayAvgRevenuePerEvent - prevAvg) / prevAvg) * 100 : 0;
    },
    
    costChange() {
      if (!this.getPreviousPeriodRange || this.previousPeriodMetrics.cost <= 0 || this.isTimelineFilterActive) return 0;
      return ((this.displayCost - this.previousPeriodMetrics.cost) / this.previousPeriodMetrics.cost) * 100;
    },
    
    transactionsChange() {
      if (!this.getPreviousPeriodRange || this.isTimelineFilterActive) return 0;
      return this.previousPeriodMetrics.totalTransactions > 0 
        ? ((this.displayTransactions - this.previousPeriodMetrics.totalTransactions) / this.previousPeriodMetrics.totalTransactions) * 100 
        : (this.displayTransactions > 0 ? 100 : 0);
    },
    
    avgTransactionChange() {
      if (!this.getPreviousPeriodRange || this.previousPeriodMetrics.totalTransactions <= 0 || this.isTimelineFilterActive) return 0;
      const prevAvgPerTransaction = this.previousPeriodMetrics.revenue / this.previousPeriodMetrics.totalTransactions;
      return prevAvgPerTransaction > 0 ? ((this.displayAvgPerTransaction - prevAvgPerTransaction) / prevAvgPerTransaction) * 100 : 0;
    },
    
    attendeesChange() {
      if (!this.getPreviousPeriodRange || this.previousPeriodMetrics.totalTicketsScanned <= 0) return 0;
      return ((this.totalTicketsScanned - this.previousPeriodMetrics.totalTicketsScanned) / this.previousPeriodMetrics.totalTicketsScanned) * 100;
    },
    
    currentTransformationRate() {
      return this.totalTicketsScanned > 0 ? (this.displayTransactions / this.totalTicketsScanned) * 100 : 0;
    },
    
    prevTransformationRate() {
      return this.previousPeriodMetrics.totalTicketsScanned > 0 
        ? (this.previousPeriodMetrics.totalTransactions / this.previousPeriodMetrics.totalTicketsScanned) * 100 
        : 0;
    },
    
    transformationRateChange() {
      if (!this.getPreviousPeriodRange || this.isTimelineFilterActive) return 0;
      return this.prevTransformationRate > 0 
        ? ((this.currentTransformationRate - this.prevTransformationRate) / this.prevTransformationRate) * 100 
        : (this.currentTransformationRate > 0 ? 100 : 0);
    },
    
    perCapChange() {
      if (!this.getPreviousPeriodRange || this.previousPeriodMetrics.totalTicketsScanned <= 0 || this.isTimelineFilterActive) return 0;
      const prevPerCapita = this.previousPeriodMetrics.revenue / this.previousPeriodMetrics.totalTicketsScanned;
      return prevPerCapita > 0 ? ((this.displayPerCapita - prevPerCapita) / prevPerCapita) * 100 : 0;
    },
  },
  methods: {
    handleCostChartToggle() {
      this.$emit('toggle-cost-chart');
      if (!this.showCostChart) {
        this.$emit('toggle-transactions-chart', false);
        this.$emit('toggle-avg-transaction-chart', false);
        this.$emit('toggle-attendees-chart', false);
        this.$emit('toggle-transformation-rate-chart', false);
        this.$emit('toggle-per-cap-chart', false);
      }
    },
    
    handleTransactionsChartToggle() {
      this.$emit('toggle-transactions-chart');
      if (!this.showTransactionsChart) {
        this.$emit('toggle-cost-chart', false);
        this.$emit('toggle-avg-transaction-chart', false);
        this.$emit('toggle-attendees-chart', false);
        this.$emit('toggle-transformation-rate-chart', false);
        this.$emit('toggle-per-cap-chart', false);
      }
    },
    
    handleAvgTransactionChartToggle() {
      this.$emit('toggle-avg-transaction-chart');
      if (!this.showAvgTransactionChart) {
        this.$emit('toggle-transactions-chart', false);
        this.$emit('toggle-cost-chart', false);
        this.$emit('toggle-attendees-chart', false);
        this.$emit('toggle-transformation-rate-chart', false);
        this.$emit('toggle-per-cap-chart', false);
      }
    },
    
    handleAttendeesChartToggle() {
      this.$emit('toggle-attendees-chart');
      if (!this.showAttendeesChart) {
        this.$emit('toggle-transactions-chart', false);
        this.$emit('toggle-cost-chart', false);
        this.$emit('toggle-avg-transaction-chart', false);
        this.$emit('toggle-transformation-rate-chart', false);
        this.$emit('toggle-per-cap-chart', false);
      }
    },
    
    handleTransformationRateChartToggle() {
      this.$emit('toggle-transformation-rate-chart');
      if (!this.showTransformationRateChart) {
        this.$emit('toggle-transactions-chart', false);
        this.$emit('toggle-cost-chart', false);
        this.$emit('toggle-avg-transaction-chart', false);
        this.$emit('toggle-attendees-chart', false);
        this.$emit('toggle-per-cap-chart', false);
      }
    },
    
    handlePerCapChartToggle() {
      this.$emit('toggle-per-cap-chart');
      if (!this.showPerCapChart) {
        this.$emit('toggle-transactions-chart', false);
        this.$emit('toggle-cost-chart', false);
        this.$emit('toggle-avg-transaction-chart', false);
        this.$emit('toggle-attendees-chart', false);
        this.$emit('toggle-transformation-rate-chart', false);
      }
    },
  },
};
</script>
