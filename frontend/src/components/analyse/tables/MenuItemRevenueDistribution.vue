<template>
  <v-card flat rounded="lg" class="pa-5 mb-4">
    <!-- Header -->
    <div class="d-flex align-center justify-space-between mb-3 flex-wrap">
      <div>
        <div class="section-title">{{ t('anMenuItemDistTitle') }}</div>
        <div class="section-subtitle">
          {{ t('anTotalRevenue') }} : {{ formatCurrencyDetailed(totalRevenue) }}
        </div>
      </div>
      <v-btn-toggle
        v-model="localMode"
        mandatory
        density="compact"
        class="pill-toggle"
      >
        <v-btn value="quantity" size="small">{{ t('anQuantityMode') }}</v-btn>
        <v-btn value="revenue" size="small">{{ t('anRevenueMode') }}</v-btn>
      </v-btn-toggle>
    </div>

    <!-- Skeleton tant que les records item-level ne sont pas chargés -->
    <v-skeleton-loader v-if="loading" type="image" class="mird-skeleton" />

    <template v-else>
    <!-- Catégories alignées 1:1 sur "By POS type" -->
    <v-row dense class="mb-4">
      <v-col
        v-for="entry in posTypeBreakdown"
        :key="entry.key"
        cols="12"
        :md="Math.max(3, Math.floor(12 / Math.max(1, posTypeBreakdown.length)))"
      >
        <!-- Format EventPredict (.ep-metric-card) : fond blanc, rail latéral =
             couleur catégorie, pastille de la même couleur. Pied « CA total »
             retiré à la demande. -->
        <v-card
          flat
          class="category-card"
          :style="{ '--cat-rail': entry.color }"
        >
          <div class="cat-label">
            <span class="cat-dot" />
            {{ entry.label }}
          </div>
          <div class="cat-value">{{ formatCurrencyDetailed(entry.value) }}</div>
        </v-card>
      </v-col>
    </v-row>

    <!-- 3 donuts -->
    <v-row dense>
      <v-col cols="12" md="4">
        <DonutChartCard
          :title="t('anTopItemsByRevenue')"
          :subtitle="t('anSubtitleItems').replace('{n}', byItem.labels.length)"
          :labels="byItem.labels.slice(0, 10)"
          :values="byItem.values.slice(0, 10)"
          :colors="byItem.colors.slice(0, 10)"
          :mode="localMode"
          :max-legend="5"
          clickable
          :selected-labels="selectedMenuItemNames"
          @slice-click="(label) => emit('item-click', label)"
        />
      </v-col>
      <v-col cols="12" md="4">
        <DonutChartCard
          :title="t('anByItemType')"
          :subtitle="t('anSubtitleTypes').replace('{n}', byType.labels.length)"
          :labels="byType.labels"
          :item-keys="byType.keys"
          :values="byType.values"
          :colors="byType.colors"
          :mode="localMode"
          :max-legend="6"
          clickable
          :selected-labels="selectedTypeKeys"
          @slice-click="onTypeDimensionClick"
        />
      </v-col>
      <v-col cols="12" md="4">
        <DonutChartCard
          :title="t('anByItemCategory')"
          :subtitle="t('anSubtitleCategories').replace('{n}', byCategory.labels.length)"
          :labels="byCategory.labels"
          :item-keys="byCategory.keys"
          :values="byCategory.values"
          :colors="byCategory.colors"
          :mode="localMode"
          :max-legend="6"
          clickable
          :selected-labels="selectedCategoryKeys"
          @slice-click="onCategoryDimensionClick"
        />
      </v-col>
    </v-row>
    </template>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import DonutChartCard from '../charts/DonutChartCard.vue'
import { SHOP_COLORS } from '@/constants/analyseColors'
import { formatCurrencyDetailed } from '@/composables/useFormatters'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { resolveItemType, resolveItemCategory } from '@/utils/analyseDimensions'
import { UNATTACHED_ITEM_KEY } from '@/utils/analyseReconciliation'

// Couleurs des buckets article (Food / Beverage / Beer / Combo) — utilisées quand
// un nom de type catalogue coïncide ; sinon palette.
const BUCKET_COLORS = { Food: '#FF8A65', Beverage: '#5B8DEF', Beer: '#FFB74D', Combo: '#66BB6A' }

const { t } = useI18n()

// Libellé d'une clé de dimension : sentinelle « Non rattachés » localisée (résiduel),
// sinon nom de catalogue tel quel. Les sentinelles sont normalement déjà exclues.
const dimLabel = (key) => (key === UNATTACHED_ITEM_KEY ? t('anUnmatchedItems') : key)

const props = defineProps({
  records: { type: Array, default: () => [] },
  // Records item-level en cours de chargement → skeleton (évite le rendu
  // intermédiaire sur le fallback shop-level sans dimension article).
  loading: { type: Boolean, default: false },
})

const emit = defineEmits(['type-click', 'category-click', 'item-click', 'shop-type-click'])

const store = useStore()
const selectedMenuItemTypes = computed(() => store.state.analyse.filters.selectedMenuItemTypes || [])
const selectedMenuItemCategories = computed(() => store.state.analyse.filters.selectedMenuItemCategories || [])
const selectedMenuItemNames = computed(() => store.state.analyse.filters.selectedMenuItemIds || [])

const localMode = ref('revenue')
const valueFn = (r) => (localMode.value === 'quantity' ? r.quantity || 0 : r.revenue || 0)

const totalRevenue = computed(() => props.records.reduce((a, r) => a + (r.revenue || 0), 0))

function groupBy(keyFn, colorMap, labelFn = null, metricFn = valueFn) {
  const map = new Map()
  for (const r of props.records) {
    const k = keyFn(r)
    if (!k) continue
    map.set(k, (map.get(k) || 0) + metricFn(r))
  }
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
  return {
    keys: entries.map((e) => e[0]),
    labels: entries.map((e) => labelFn ? labelFn(e[0]) : e[0]),
    values: entries.map((e) => e[1]),
    colors: entries.map(([k], i) =>
      typeof colorMap === 'function'
        ? colorMap(k, i)
        : colorMap && colorMap[k] ? colorMap[k] : SHOP_COLORS[i % SHOP_COLORS.length]
    ),
  }
}

// Surlignage : donuts type/catégorie suivent leurs filtres respectifs.
const selectedTypeKeys = computed(() => selectedMenuItemTypes.value)
const selectedCategoryKeys = computed(() => selectedMenuItemCategories.value)

// Cartes du haut = par TYPE article catalogue (Beverage / Food / Combo / Glasses),
// repli dims backend puis bucket sentinelle si non mappé. Alignées sur le donut
// « By item type ». Data-driven : la sentinelle « Non rattachés » reste visible
// (part grise cliquable) — c'est de la vente réelle.
const posTypeBreakdown = computed(() => {
  const grouped = groupBy(
    resolveItemType,
    (key, index) =>
      key === UNATTACHED_ITEM_KEY
        ? '#B0BEC5'
        : BUCKET_COLORS[key] || SHOP_COLORS[index % SHOP_COLORS.length],
    dimLabel,
    (record) => record.revenue || 0,
  )
  return grouped.keys.map((key, index) => ({
    key,
    label: grouped.labels[index],
    value: grouped.values[index],
    color: grouped.colors[index],
  }))
})

// Article = nom catalogue DataFriday (records filtrés → toujours présent).
const byItem = computed(() => groupBy((r) => r.menuItemName || r.itemName || r.productName || ''))
// Taxonomie catalogue : Type (Beverage/Food/Combo/Glasses) → Catégorie (sous-élément :
// Soft Drink, Beer, Water, Mixology…). « By item type » groupe par TYPE, « By item
// category » par CATÉGORIE — deux niveaux distincts. Repli bucket si non mappé. Mêmes
// résolveurs que les filtres store.
const colorFn = (key, index) =>
  (key === UNATTACHED_ITEM_KEY ? '#B0BEC5' : null) ||
  BUCKET_COLORS[key] || SHOP_COLORS[index % SHOP_COLORS.length]
const byType = computed(() => groupBy(resolveItemType, colorFn, dimLabel))

// Catégorie → type parent (catalogue) : permet de colorer chaque catégorie avec la
// couleur de son TYPE parent (regroupement visuel : toutes les catégories d'un type
// partagent sa couleur).
const categoryParentType = computed(() => {
  const m = new Map()
  // Taxonomie depuis le store ANALYSE (le module global productCategories n'est pas
  // alimenté dans ce flow). typeName direct, sinon résolu via typeId → productTypesList.
  const typeNameById = new Map(
    (store.state.analyse.productTypesList || []).map((tp) => [String(tp?.id), tp?.name || '']),
  )
  for (const c of store.state.analyse.productCategoriesList || []) {
    const n = String(c?.name || '').trim().toLowerCase()
    const tn = c?.typeName || typeNameById.get(String(c?.typeId || '')) || ''
    if (n && tn) m.set(n, tn)
  }
  return m
})
// Couleur attribuée à chaque type dans « By item type » → réutilisée par les catégories.
const typeColorByName = computed(() => {
  const m = new Map()
  byType.value.keys.forEach((k, i) => m.set(String(k).toLowerCase(), byType.value.colors[i]))
  return m
})
const byCategory = computed(() => {
  const parents = categoryParentType.value
  const typeColors = typeColorByName.value
  return groupBy(resolveItemCategory, (key, index) => {
    if (key === UNATTACHED_ITEM_KEY) return '#B0BEC5'
    const parent = parents.get(String(key).toLowerCase())
    const parentColor = parent && typeColors.get(String(parent).toLowerCase())
    return parentColor || BUCKET_COLORS[key] || SHOP_COLORS[index % SHOP_COLORS.length]
  }, dimLabel)
})

function onTypeDimensionClick(key) {
  emit('type-click', key)
}

function onCategoryDimensionClick(key) {
  emit('category-click', key)
}
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
.category-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 14px 14px 14px 16px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  position: relative;
  overflow: hidden;
}
.category-card::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--cat-rail, #64748b);
}
.cat-label {
  font-size: 11px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.cat-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cat-rail, #64748b);
  flex: none;
}
.cat-value {
  color: #0f172a;
  font-size: 1.2rem;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.3px;
  font-variant-numeric: tabular-nums;
}
</style>
