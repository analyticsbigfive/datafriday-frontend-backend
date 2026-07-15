<template>
  <Card>
    <CardHeader>
      <div class="flex items-center justify-between">
        <CardTitle>Transactions by Event</CardTitle>
        <div class="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            @click="toggleSortMode"
          >
            <ArrowUpDown class="w-4 h-4" />
            {{ sortMode === 'chronological' ? 'Sort by Transactions' : 'Sort by Date' }}
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            @click="onClose"
          >
            <X class="w-4 h-4" />
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent>
      <div class="h-80">
        <BarChart
          v-if="chartData.length > 0"
          :data="chartData"
          :options="chartOptions"
        />
        <div v-else class="flex items-center justify-center h-full text-muted-foreground">
          No transaction data available
        </div>
      </div>
    </CardContent>
  </Card>
</template>

<script>
import { Bar } from 'vue-chartjs'
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  BarElement, 
  Title, 
  Tooltip, 
  Legend 
} from 'chart.js'
import { X, ArrowUpDown } from 'lucide-vue-next'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
)

export default {
  name: 'TransactionsByEventChart',
  components: {
    Bar,
    X,
    ArrowUpDown
  },
  props: {
    eventPerformanceData: {
      type: Array,
      default: () => []
    },
    onClose: {
      type: Function,
      required: true
    }
  },
  data() {
    return {
      sortMode: 'chronological' // 'chronological' | 'transactions'
    }
  },
  computed: {
    // Helper function to parse dates in DD/MM/YYYY or YYYY-MM-DD format
    parseEventDate() {
      return (dateStr) => {
        // Check if format is DD/MM/YYYY (contains /)
        if (dateStr.includes('/')) {
          const [day, month, year] = dateStr.split('/');
          // Create date as YYYY-MM-DD to ensure correct parsing
          return new Date(`${year}-${month}-${day}`);
        }
        // Otherwise assume YYYY-MM-DD format
        return new Date(dateStr);
      }
    },
    
    // Filter events with transactions > 0 and prepare chart data
    chartData() {
      const filtered = this.eventPerformanceData
        .filter(event => event.totalTransactions > 0);
      
      const withData = filtered.map(event => ({
        name: event.eventName,
        eventDate: event.eventDate,
        transactions: event.totalTransactions,
        revenue: event.totalRevenue,
        attendees: event.ticketsScanned,
        avgTransaction: event.totalTransactions > 0 ? event.totalRevenue / event.totalTransactions : 0,
      }));
      
      // Sort based on current sort mode
      const sorted = withData.sort((a, b) => {
        if (this.sortMode === 'chronological') {
          return this.parseEventDate(a.eventDate) - this.parseEventDate(b.eventDate);
        } else {
          return b.transactions - a.transactions;
        }
      });
      
      // Transform for vue-chartjs format
      return {
        labels: sorted.map(event => event.name),
        datasets: [
          {
            label: 'Transactions',
            data: sorted.map(event => event.transactions),
            backgroundColor: sorted.map((_, index) => {
              // Generate different colors for each bar
              const colors = [
                'rgba(59, 130, 246, 0.8)',   // blue
                'rgba(16, 185, 129, 0.8)',   // green
                'rgba(245, 158, 11, 0.8)',   // yellow
                'rgba(239, 68, 68, 0.8)',    // red
                'rgba(139, 92, 246, 0.8)',   // purple
                'rgba(236, 72, 153, 0.8)',   // pink
                'rgba(14, 165, 233, 0.8)',   // sky
                'rgba(168, 85, 247, 0.8)',   // violet
              ];
              return colors[index % colors.length];
            }),
            borderColor: sorted.map((_, index) => {
              const colors = [
                'rgba(59, 130, 246, 1)',
                'rgba(16, 185, 129, 1)',
                'rgba(245, 158, 11, 1)',
                'rgba(239, 68, 68, 1)',
                'rgba(139, 92, 246, 1)',
                'rgba(236, 72, 153, 1)',
                'rgba(14, 165, 233, 1)',
                'rgba(168, 85, 247, 1)',
              ];
              return colors[index % colors.length];
            }),
            borderWidth: 1
          }
        ]
      }
    },
    
    // Chart options for vue-chartjs
    chartOptions() {
      return {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          title: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const index = context.dataIndex;
                const originalData = this.eventPerformanceData
                  .filter(event => event.totalTransactions > 0)
                  .sort((a, b) => {
                    if (this.sortMode === 'chronological') {
                      return this.parseEventDate(a.eventDate) - this.parseEventDate(b.eventDate);
                    } else {
                      return b.totalTransactions - a.totalTransactions;
                    }
                  });
                
                const event = originalData[index];
                return [
                  `Transactions: ${event.totalTransactions}`,
                  `Revenue: $${event.totalRevenue.toLocaleString()}`,
                  `Avg Transaction: $${(event.totalRevenue / event.totalTransactions).toFixed(2)}`
                ];
              }.bind(this)
            }
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Number of Transactions'
            }
          },
          x: {
            title: {
              display: true,
              text: 'Events'
            }
          }
        }
      }
    }
  },
  methods: {
    toggleSortMode() {
      this.sortMode = this.sortMode === 'chronological' ? 'transactions' : 'chronological';
    }
  }
}
</script>