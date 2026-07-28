<template>
  <v-card flat rounded="lg" class="pa-5 mb-4 shop-perf-card">
    <!-- Header -->
    <div class="d-flex align-center mb-3 flex-wrap ga-2">
      <v-icon color="#7C4DFF">mdi-pulse</v-icon>
      <div>
        <div class="section-title">{{ t('anShopPerfTitle') }}</div>
        <div class="section-subtitle">{{ t('anShopPerfSubtitle') }}</div>
      </div>
      <v-spacer />
      <v-btn
        icon="mdi-download"
        size="small"
        variant="text"
        :disabled="!visibleShops.length"
        :title="t('anShopPerfExportTooltip')"
        @click="exportExcel"
      />
      <v-btn
        icon="mdi-close"
        size="small"
        variant="text"
        @click="$emit('close')"
      />
    </div>

    <!-- Loading -->
    <div v-if="loading" class="d-flex flex-column align-center py-8">
      <v-progress-circular indeterminate color="primary" size="40" class="mb-3" />
      <div class="text-body-2 text-medium-emphasis">
        {{ t('anShopPerfCalculating') }}
      </div>
    </div>

    <!-- Empty -->
    <div
      v-else-if="!visibleShops.length"
      class="text-center py-6 text-medium-emphasis text-body-2"
    >
      {{ t('anShopPerfNoData') }}
    </div>

    <!-- Cards grid (3 colonnes à partir de md, paginé à 20) -->
    <v-row v-else class="shop-perf-grid">
      <v-col
        v-for="shop in pagedShops"
        :key="shop.elementId"
        cols="12"
        sm="6"
        md="4"
      >
        <v-card
          variant="outlined"
          rounded="lg"
          class="shop-card pa-0"
          :class="{ 'shop-card--selected': isSelected(shop) }"
          @click="$emit('shop-click', shop.elementId)"
        >
          <!-- Banner with revenues -->
          <div class="shop-banner">
            <v-icon size="44" class="banner-icon" color="#7C4DFF">mdi-storefront-outline</v-icon>
            <div class="banner-overlay">
              <div>
              <div class="overlay-label">{{ t('anShopPerfTotalRevenue') }}</div>
              <div class="overlay-value">€{{ formatNumber(shop.totalRevenue) }}</div>
            </div>
            <div class="text-right">
              <div class="overlay-label">{{ t('anShopPerfAvgEvent') }}</div>
                <div class="overlay-value">€{{ formatNumber(avgRev(shop)) }}</div>
              </div>
            </div>
          </div>

          <!-- Body -->
          <div class="pa-3">
            <div class="font-weight-bold text-body-2 text-truncate mb-2">
              {{ shop.elementName || shop.shopName }}
            </div>

            <div class="d-flex align-center justify-space-between mb-2">
              <div class="d-flex align-center ga-2">
                <v-icon color="#7C4DFF" size="16">mdi-pulse</v-icon>
                <span class="text-body-2">
                  <span class="font-weight-bold" style="color: #4527A0">
                    {{ (shop.transactionRate || 0).toFixed(2) }}
                  </span>
                  <span class="text-medium-emphasis ml-1">{{ t('anShopPerfTxnPerMin') }}</span>
                </span>
              </div>
              <div
                v-if="shop.first60MinTransactionRate > 0"
                class="d-flex align-center ga-1"
              >
                <v-icon color="#1976D2" size="14">mdi-clock-outline</v-icon>
                <span class="text-caption">
                  <span class="font-weight-bold" style="color: #0D47A1">
                    {{ shop.first60MinTransactionRate.toFixed(2) }}
                  </span>
                  <span class="text-medium-emphasis ml-1">{{ t('anShopPerfFirstHour') }}</span>
                </span>
              </div>
            </div>

            <div class="space-y-1 text-caption text-medium-emphasis">
              <div class="d-flex justify-space-between">
                <span>{{ t('anShopPerfTotalTransactions') }}</span>
                <span class="text-high-emphasis font-weight-medium">
                  {{ formatInt(shop.totalTransactions) }}
                </span>
              </div>
              <div class="d-flex justify-space-between">
                <span>{{ t('anShopPerfEventsLabel') }}</span>
                <span class="text-high-emphasis font-weight-medium">
                  {{ shop.eventCount }}
                </span>
              </div>
              <div class="d-flex justify-space-between">
                <span>{{ t('anShopPerfOperatingMinutes') }}</span>
                <span class="text-high-emphasis font-weight-medium">
                  {{ Math.round(shop.operatingMinutes || 0) }}
                </span>
              </div>
              <div
                v-if="shop.peakTransactionRate > 0"
                class="d-flex justify-space-between"
                :title="t('anShopPerfPeak') + ' (15 min)'"
              >
                <span>{{ t('anShopPerfPeak') }}</span>
                <span class="text-high-emphasis font-weight-bold" style="color: #C2185B">
                  {{ shop.peakTransactionRate.toFixed(2) }} txn/min
                </span>
              </div>
            </div>
          </div>
        </v-card>
      </v-col>
    </v-row>

    <!-- Pagination (20 par page) -->
    <div
      v-if="!loading && pageCount > 1"
      class="d-flex justify-center align-center mt-4 ga-3"
    >
      <v-pagination
        v-model="page"
        :length="pageCount"
        :total-visible="7"
        density="comfortable"
        rounded="circle"
      />
      <span class="text-caption text-medium-emphasis">
        {{ visibleShops.length }} {{ t('anChartViewShops').toLowerCase() }} &middot; {{ PAGE_SIZE }} / {{ t('anShopPerfPage') }}
      </span>
    </div>
  </v-card>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

const PAGE_SIZE = 20

const props = defineProps({
  shops: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  selectedShopIds: { type: Array, default: () => [] },
})

defineEmits(['close', 'shop-click'])

const page = ref(1)

const visibleShops = computed(() =>
  [...props.shops]
    .filter((s) => (s.transactionRate || 0) > 0 || (s.totalRevenue || 0) > 0)
    .sort((a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0)),
)

const pageCount = computed(() =>
  Math.max(1, Math.ceil(visibleShops.value.length / PAGE_SIZE)),
)

const pagedShops = computed(() => {
  const start = (page.value - 1) * PAGE_SIZE
  return visibleShops.value.slice(start, start + PAGE_SIZE)
})

// Reset à la page 1 si la liste change radicalement
watch(
  () => visibleShops.value.length,
  () => {
    if ((page.value - 1) * PAGE_SIZE >= visibleShops.value.length) page.value = 1
  },
)

function avgRev(shop) {
  return shop.eventCount > 0 ? shop.totalRevenue / shop.eventCount : 0
}
function formatNumber(v) {
  return Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(v || 0)
}
function formatInt(v) {
  return Intl.NumberFormat('fr-FR').format(Math.round(v || 0))
}
function isSelected(shop) {
  return (props.selectedShopIds || []).includes(shop.elementId)
}

async function exportExcel() {
  try {
    const XLSX = await import('xlsx')
    const rows = visibleShops.value.map((s) => ({
      [t('anShopPerfShopName')]: s.elementName || s.shopName,
      [`${t('anShopPerfTotalRevenue')} (\u20ac)`]: Number((s.totalRevenue || 0).toFixed(2)),
      [t('anMetricTransactions')]: Math.round(s.totalTransactions || 0),
      'Txn/Min': Number((s.transactionRate || 0).toFixed(2)),
      [`${t('anShopPerfFirstHour')} Txn/Min`]: s.first60MinTransactionRate
        ? Number(s.first60MinTransactionRate.toFixed(2))
        : null,
      'Peak 15min Txn/Min': s.peakTransactionRate
        ? Number(s.peakTransactionRate.toFixed(2))
        : null,
      [t('anEvents')]: s.eventCount,
      [t('anShopPerfOperatingMinutes').replace(':', '').trim()]: Math.round(s.operatingMinutes || 0),
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Shop Performance')
    const ts = new Date().toISOString().split('T')[0]
    XLSX.writeFile(wb, `shop-performance-transaction-rate-${ts}.xlsx`)
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[ShopPerf] export failed', err)
  }
}
</script>

<style scoped>
.section-title {
  font-size: var(--fs-lg);
  font-weight: 600;
  color: #212121;
}
.section-subtitle {
  font-size: var(--fs-sm);
  color: #757575;
  margin-top: 2px;
}
.shop-perf-card {
  /* Lot 5.x — outline outer card retiré : les cartes shop ont déjà leur
     propre bordure (variant="outlined"), une seconde autour du panneau
     faisait double cadre (cf. screenshot utilisateur). */
  border: 0 !important;
}
.shop-perf-grid {
  /* Espace plus visible entre les colonnes (par défaut v-row dense colle les
     cartes). */
  margin-left: -8px;
  margin-right: -8px;
}
.shop-perf-grid > .v-col {
  padding: 8px;
}
.shop-card {
  cursor: pointer;
  overflow: hidden;
  border: 0 !important;
  transition: box-shadow 120ms ease, border-color 120ms ease;
}
.shop-card:hover {
  box-shadow: 0 4px 12px rgba(124, 77, 255, 0.15);
}
.shop-card--selected {
  box-shadow: 0 0 0 2px rgba(124, 77, 255, 0.45);
}
.shop-banner {
  position: relative;
  height: 96px;
  background: linear-gradient(135deg, #EDE7F6 0%, #F3E5F5 100%);
  display: flex;
  align-items: center;
  justify-content: center;
}
.banner-icon {
  opacity: 0.4;
}
.banner-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  padding: 8px 12px;
  color: #fff;
  background: linear-gradient(to bottom, rgba(0, 0, 0, 0.55), transparent);
}
.overlay-label {
  font-size: var(--fs-xs);
  opacity: 0.9;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}
.overlay-value {
  font-size: var(--fs-md);
  font-weight: 700;
}
.space-y-1 > * + * {
  margin-top: 2px;
}
</style>
