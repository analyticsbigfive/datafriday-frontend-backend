<template>
  <Teleport to="body">
    <Transition name="ebd">
      <div v-if="modelValue" class="ebd-overlay" @click.self="close">
        <div class="ebd-panel">

          <!-- Header -->
          <div class="ebd-header">
            <div class="ebd-header__icon"><TrendingUp :size="20" color="white" /></div>
            <div class="ebd-header__text">
              <div class="ebd-header__title">{{ t('intgBreakdownTitle') }}</div>
              <div class="ebd-header__sub">
                {{ data ? data.eventName : '…' }}<template v-if="formattedDate"> · {{ formattedDate }}</template>
              </div>
            </div>
            <button class="ebd-header__close" @click="close"><X :size="16" /></button>
          </div>

          <!-- Loading -->
          <div v-if="loading" class="ebd-center">
            <v-progress-circular indeterminate size="36" color="#ff3131" />
          </div>

          <!-- Error -->
          <div v-else-if="error" class="ebd-error">
            <AlertTriangle :size="15" />
            {{ error }}
          </div>

          <template v-else-if="data">

            <!-- KPI Cards -->
            <div class="ebd-kpis">
              <div class="ebd-kpi">
                <div class="ebd-kpi__icon ebd-kpi__icon--green"><Euro :size="14" /></div>
                <div class="ebd-kpi__val">{{ formatAmount(totalRevenue) }} €</div>
                <div class="ebd-kpi__label">{{ t('intgBreakdownKpiRevenue') }}</div>
              </div>
              <div class="ebd-kpi">
                <div class="ebd-kpi__icon ebd-kpi__icon--blue"><Receipt :size="14" /></div>
                <div class="ebd-kpi__val">{{ totalTx }}</div>
                <div class="ebd-kpi__label">{{ t('intgBreakdownKpiTransactions') }}</div>
              </div>
              <div class="ebd-kpi">
                <div class="ebd-kpi__icon ebd-kpi__icon--orange"><Package :size="14" /></div>
                <div class="ebd-kpi__val">{{ totalItems }}</div>
                <div class="ebd-kpi__label">{{ t('intgBreakdownKpiItems') }}</div>
              </div>
              <div class="ebd-kpi">
                <div class="ebd-kpi__icon ebd-kpi__icon--red"><StoreIcon :size="14" /></div>
                <div class="ebd-kpi__val">{{ data.shops.length }}</div>
                <div class="ebd-kpi__label">{{ t('intgBreakdownKpiShops') }}</div>
              </div>
            </div>

            <!-- Tabs -->
            <div class="ebd-tabs">
              <button
                class="ebd-tab"
                :class="{ 'ebd-tab--active': breakdownTab === 'shops' }"
                @click="breakdownTab = 'shops'"
              >
                <StoreIcon :size="13" />
                {{ t('intgBreakdownTabByShop') }}
                <span class="ebd-tab__badge">{{ data.shops.length }}</span>
              </button>
              <button
                class="ebd-tab"
                :class="{ 'ebd-tab--active': breakdownTab === 'items' }"
                @click="breakdownTab = 'items'"
              >
                <Package :size="13" />
                {{ t('intgBreakdownTabByItem') }}
                <span class="ebd-tab__badge">{{ data.products.length }}</span>
              </button>
              <button
                class="ebd-tab"
                :class="{ 'ebd-tab--active': breakdownTab === 'chart' }"
                @click="breakdownTab = 'chart'; $emit('load-chart')"
              >
                <TrendingUp :size="13" />
                {{ t('intgBreakdownTabPerMinute') }}
              </button>
            </div>

            <!-- Tab content -->
            <div class="ebd-body">

              <!-- Par shop -->
              <div v-if="breakdownTab === 'shops'" class="ebd-table-wrap">
                <table class="ebd-table">
                  <thead>
                    <tr>
                      <th>{{ t('intgBreakdownColShop') }}</th>
                      <th class="ebd-th--right">{{ t('intgBreakdownColRevenue') }}</th>
                      <th class="ebd-th--right">{{ t('intgBreakdownColTx') }}</th>
                      <th class="ebd-th--right">{{ t('intgBreakdownColArt') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="shop in data.shops" :key="shop.spaceElementId || shop.weezeventLocationId">
                      <td class="ebd-td--name">{{ shop.shopName }}</td>
                      <td class="ebd-td--right ebd-td--amount">{{ formatAmount(shop.revenueHt) }} €</td>
                      <td class="ebd-td--right ebd-td--num">{{ shop.transactionsCount }}</td>
                      <td class="ebd-td--right ebd-td--num">{{ shop.itemsCount }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Par article -->
              <div v-else-if="breakdownTab === 'items'" class="ebd-table-wrap">
                <table class="ebd-table">
                  <thead>
                    <tr>
                      <th>{{ t('intgBreakdownColArticle') }}</th>
                      <th class="ebd-th--right">{{ t('intgBreakdownColRevenue') }}</th>
                      <th class="ebd-th--right">{{ t('intgBreakdownColQty') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="bitem in data.products" :key="bitem.weezeventProductId">
                      <td class="ebd-td--name">{{ bitem.productName }}</td>
                      <td class="ebd-td--right ebd-td--amount">{{ formatAmount(bitem.revenueHt) }} €</td>
                      <td class="ebd-td--right ebd-td--num">{{ bitem.quantity }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- CA / minute -->
              <div v-else-if="breakdownTab === 'chart'" class="ebd-chart-wrap">
                <div v-if="chartLoading" class="ebd-center ebd-center--sm">
                  <v-progress-circular indeterminate color="#ff3131" size="28" />
                </div>
                <template v-else-if="chartRows.length">
                  <Line :data="buildChartData()" :options="minuteChartOptions" style="max-height: 300px" />
                </template>
                <div v-else class="ebd-empty">{{ t('intgBreakdownNoData') }}</div>
              </div>

            </div>
          </template>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { X, TrendingUp, AlertTriangle, Euro, Receipt, Package, Store as StoreIcon } from 'lucide-vue-next'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'
import { useI18n } from '@/i18n/useI18n'
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

export default {
  name: 'EventBreakdownDrawer',
  components: { X, TrendingUp, AlertTriangle, Euro, Receipt, Package, StoreIcon, Line },
  setup() {
    const { t } = useI18n()
    return { t }
  },
  props: {
    modelValue: { type: Boolean, default: false },
    data: { type: Object, default: null },
    loading: { type: Boolean, default: false },
    error: { type: String, default: null },
    formattedDate: { type: String, default: '' },
    chartRows: { type: Array, default: () => [] },
    chartLoading: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'load-chart'],
  data() {
    return {
      breakdownTab: 'shops',
      minuteChartOptions: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label(ctx) {
                if (ctx.dataset.yAxisID === 'y') return ` ${ctx.parsed.y.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} € HT`
                return ` ${ctx.parsed.y} transactions`
              },
            },
          },
        },
        scales: {
          x: { ticks: { font: { size: 10 }, maxTicksLimit: 20 } },
          y: { type: 'linear', position: 'left', ticks: { callback: v => `${v} €`, font: { size: 10 } } },
          y2: { type: 'linear', position: 'right', grid: { drawOnChartArea: false }, ticks: { font: { size: 10 } } },
        },
      },
    }
  },
  computed: {
    totalRevenue() { return (this.data?.shops || []).reduce((a, s) => a + s.revenueHt, 0) },
    totalTx()      { return (this.data?.shops || []).reduce((a, s) => a + s.transactionsCount, 0) },
    totalItems()   { return (this.data?.shops || []).reduce((a, s) => a + s.itemsCount, 0) },
  },
  watch: {
    modelValue(val) {
      document.body.style.overflow = val ? 'hidden' : ''
      if (val) this.breakdownTab = 'shops'
    },
  },
  beforeUnmount() {
    document.body.style.overflow = ''
  },
  methods: {
    close() { this.$emit('update:modelValue', false) },
    formatAmount(v) {
      return Number(v || 0).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    },
    buildChartData() {
      const rows = this.chartRows || []
      return {
        labels: rows.map(r => r.minute),
        datasets: [
          {
            label: this.t('intgBreakdownChartRevenue'),
            data: rows.map(r => r.revenueHt),
            borderColor: '#ff3131',
            backgroundColor: 'rgba(255, 49, 49,0.08)',
            fill: true,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 5,
            yAxisID: 'y',
          },
          {
            label: this.t('intgBreakdownChartTransactions'),
            data: rows.map(r => r.transactionsCount),
            borderColor: '#636e72',
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 5,
            borderDash: [4, 4],
            yAxisID: 'y2',
          },
        ],
      }
    },
  },
}
</script>

<style scoped>
/* ── Overlay & panel ─────────────────────────────────────── */
.ebd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.38);
  z-index: 3000;
  display: flex;
  justify-content: flex-end;
}

.ebd-panel {
  width: 520px;
  max-width: 100vw;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  box-shadow: -8px 0 40px rgba(0, 0, 0, 0.14);
  overflow: hidden;
}

/* ── Header ──────────────────────────────────────────────── */
.ebd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, 0.2);
}

.ebd-header__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ebd-header__text { flex: 1; min-width: 0; }
.ebd-header__title { font-size: 15px; font-weight: 700; color: #fff; }
.ebd-header__sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ebd-header__close {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s;
}
.ebd-header__close:hover { background: rgba(255, 255, 255, 0.28); }

/* ── KPI Cards ───────────────────────────────────────────── */
.ebd-kpis {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border-bottom: 1px solid #f0f0f0;
}

.ebd-kpi {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 8px;
  border-right: 1px solid #f0f0f0;
}
.ebd-kpi:last-child { border-right: none; }

.ebd-kpi__icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 2px;
}
.ebd-kpi__icon--green  { background: #dcfce7; color: #16a34a; }
.ebd-kpi__icon--blue   { background: #dbeafe; color: #2563eb; }
.ebd-kpi__icon--orange { background: #ffedd5; color: #ea580c; }
.ebd-kpi__icon--red    { background: #fee2e2; color: #ff3131; }

.ebd-kpi__val {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
  line-height: 1.2;
}

.ebd-kpi__label {
  font-size: 10.5px;
  color: #9ca3af;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

/* ── Tabs ────────────────────────────────────────────────── */
.ebd-tabs {
  flex-shrink: 0;
  display: flex;
  gap: 0;
  border-bottom: 1px solid #f0f0f0;
  padding: 0 16px;
}

.ebd-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 500;
  color: #6b7280;
  border: none;
  background: none;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.ebd-tab:hover { color: #374151; }
.ebd-tab--active { color: #ff3131; border-bottom-color: #ff3131; font-weight: 600; }

.ebd-tab__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #f3f4f6;
  font-size: 10px;
  font-weight: 600;
  color: #6b7280;
}
.ebd-tab--active .ebd-tab__badge { background: #fee2e2; color: #ff3131; }

/* ── Body ────────────────────────────────────────────────── */
.ebd-body {
  flex: 1;
  overflow-y: auto;
  background: #f9fafb;
}

.ebd-table-wrap {
  padding: 16px;
}

.ebd-table {
  width: 100%;
  border-collapse: collapse;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
  font-size: 13px;
}

.ebd-table thead tr {
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}

.ebd-table th {
  padding: 10px 14px;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9ca3af;
  text-align: left;
  white-space: nowrap;
}

.ebd-table tbody tr {
  border-bottom: 1px solid #f3f4f6;
  transition: background 0.1s;
}
.ebd-table tbody tr:last-child { border-bottom: none; }
.ebd-table tbody tr:hover { background: #f8fafc; }

.ebd-table td { padding: 10px 14px; color: #374151; }

.ebd-th--right { text-align: right !important; }
.ebd-td--name { font-weight: 500; color: #111827; }
.ebd-td--right { text-align: right; }
.ebd-td--amount { font-weight: 600; color: #111827; font-variant-numeric: tabular-nums; }
.ebd-td--num { color: #6b7280; font-size: 12px; font-variant-numeric: tabular-nums; }

/* ── Chart ───────────────────────────────────────────────── */
.ebd-chart-wrap {
  padding: 16px;
}

/* ── States ──────────────────────────────────────────────── */
.ebd-center {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
}
.ebd-center--sm { padding: 40px 0; }

.ebd-error {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 16px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #ff3131;
  font-size: 13px;
  font-weight: 500;
}

.ebd-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: #9ca3af;
}

/* ── Transition ──────────────────────────────────────────── */
.ebd-enter-active, .ebd-leave-active { transition: opacity 0.22s ease; }
.ebd-enter-active .ebd-panel, .ebd-leave-active .ebd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.ebd-enter-from, .ebd-leave-to { opacity: 0; }
.ebd-enter-from .ebd-panel, .ebd-leave-to .ebd-panel { transform: translateX(100%); }
</style>
