<template>
  <v-card flat rounded="lg" class="pa-5 mb-4">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-2 flex-wrap">
      <div>
        <div class="section-title">{{ t('anPieDistributionTitle') }}</div>
        <div class="section-subtitle">
          <template v-if="loading">{{ t('anDonutLoading') }}</template>
          <template v-else>{{ t('anPieTotalRevenue') }} {{ formatCurrencyDetailed(totalRevenue) }}</template>
        </div>
      </div>
      <v-btn-toggle
        v-model="localMode"
        mandatory
        density="compact"
        class="pill-toggle"
      >
        <v-btn value="quantity" size="small">{{ t('anQuantity') }}</v-btn>
        <v-btn value="revenue" size="small">{{ t('anRevenue') }}</v-btn>
      </v-btn-toggle>
    </div>

    <v-row class="mt-2" dense>
      <v-col cols="12" md="4">
        <DonutChartCard
          :title="t('anPieByShopTitle')"
          :subtitle="`${byShop.labels.length} ${t('anPieByShopSubtitle')}`"
          :labels="byShop.labels"
          :values="byShop.values"
          :colors="byShop.colors"
          :mode="localMode"
          :max-legend="5"
          clickable
          :loading="loading"
          :selected-labels="selectedShopIds"
          @slice-click="(label) => emit('shop-click', label)"
        />
      </v-col>
      <v-col cols="12" md="4">
        <DonutChartCard
          :title="t('anPieByTypeTitle')"
          :subtitle="`${byType.labels.length} ${t('anPieByTypeSubtitleSuffix')}`"
          :labels="byType.labels"
          :item-keys="byType.keys"
          :values="byType.values"
          :colors="byType.colors"
          :mode="localMode"
          :max-legend="6"
          clickable
          :loading="loading"
          :selected-labels="selectedShopTypes"
          @slice-click="(label) => emit('shop-type-click', label)"
        />
      </v-col>
      <v-col cols="12" md="4">
        <DonutChartCard
          :title="t('anPieByAreaTitle')"
          :subtitle="`${byArea.labels.length} ${t('anPieByAreaSubtitleSuffix')}`"
          :labels="byArea.labels"
          :values="byArea.values"
          :colors="byArea.colors"
          :mode="localMode"
          :max-legend="6"
          clickable
          :loading="loading || areaPending"
          :selected-labels="selectedShopAreas"
          @slice-click="(label) => emit('shop-area-click', label)"
        />
      </v-col>
    </v-row>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import DonutChartCard from './DonutChartCard.vue'
import { SHOP_COLORS, SHOP_TYPE_COLORS, SHOP_AREA_COLORS } from '@/constants/analyseColors'
import { SHOP_TYPE_LABEL_KEYS } from '@/constants/shopTypes'
import { formatCurrencyDetailed } from '@/composables/useFormatters'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { resolveShopType } from '@/utils/analyseDimensions'
import { UNATTACHED_SHOP_KEY } from '@/utils/analyseReconciliation'

const { t } = useI18n()

// Couleur du donut PdV, avec gris dédié au bucket « PdV non rattachés ».
const SHOP_TYPE_COLOR_MAP = { ...SHOP_TYPE_COLORS, [UNATTACHED_SHOP_KEY]: '#B0BEC5' }

const props = defineProps({
  // Data-driven : tous les PdV vendeurs des records reçus (aucun scoping config).
  records: { type: Array, default: () => [] },
  // Phase 2 (records) encore en vol → les 3 donuts affichent leur skeleton dans la
  // carte réelle, au lieu du rectangle générique qui remplaçait toute la carte.
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['shop-click', 'shop-type-click', 'shop-area-click'])

const store = useStore()
const selectedShopIds = computed(() => store.state.analyse.filters.selectedShopIds || [])
const selectedShopTypes = computed(() => store.state.analyse.filters.selectedShopTypes || [])
const selectedShopAreas = computed(() => store.state.analyse.filters.selectedShopAreas || [])

const localMode = ref('revenue')

const totalRevenue = computed(() => props.records.reduce((a, r) => a + (r.revenue || 0), 0))

function groupBy(keyFn, valueFn, colorMap, labelFn = null) {
  const map = new Map()
  for (const r of props.records) {
    const k = keyFn(r)
    if (!k) continue
    map.set(k, (map.get(k) || 0) + valueFn(r))
  }
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
  return {
    keys: entries.map((e) => e[0]),
    labels: entries.map((e) => labelFn ? labelFn(e[0]) : e[0]),
    values: entries.map((e) => e[1]),
    colors: entries.map(([k], i) => {
      if (colorMap && colorMap[k]) return colorMap[k]
      return SHOP_COLORS[i % SHOP_COLORS.length]
    }),
  }
}

const valueFn = (r) => (localMode.value === 'quantity' ? r.quantity || 0 : r.revenue || 0)

// Clé canonique (simple ou composite 'food, beverages') → libellé localisé.
// Composite : on traduit chaque token et on joint avec ' & '.
function shopTypeLabel(key) {
  if (!key) return ''
  if (key === UNATTACHED_SHOP_KEY) return t('anUnmatchedShops')
  return String(key)
    .split(', ')
    .map((token) => (SHOP_TYPE_LABEL_KEYS[token] ? t(SHOP_TYPE_LABEL_KEYS[token]) : token))
    .join(' & ')
}

// Data-driven : le bucket sentinelle « PdV non rattachés » reste visible (part
// grise cliquable) — c'est de la vente réelle d'un PdV sans type connu.
const byShop = computed(() => groupBy((r) => r.shopName, valueFn))
const byType = computed(() => groupBy(resolveShopType, valueFn, SHOP_TYPE_COLOR_MAP, shopTypeLabel))
const byArea = computed(() => groupBy((r) => r.shopArea, valueFn, SHOP_AREA_COLORS))

// `shopArea` n'existe sur un record QU'APRÈS réconciliation avec les FloorElements
// du contexte config — contexte que AnalyseView charge en DIFFÉRÉ (union « All
// Configurations » lancée après le 1er rendu). Entre les deux, byArea est vide :
// on affiche le skeleton, pas un donut blanc. `configContextSettled` couvre la
// fenêtre AVANT le dispatch (où configContextLoading est encore false).
// Le skeleton ne remplace QU'UN donut vide : jamais de flash par-dessus des zones
// déjà affichées (changement de config = les anciennes valeurs restent visibles).
const areaPending = computed(() => {
  const st = store.state.analyse
  if (byArea.value.labels.length || !props.records.length) return false
  if (st.configContextError) return false
  return st.configContextLoading || !st.configContextSettled
})
</script>

<style scoped>
.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #212121;
}
.section-subtitle {
  font-size: 12px;
  color: #757575;
  margin-top: 2px;
}
</style>
