<template>
  <aside class="analyse-filter-panel" :class="{ 'analyse-filter-panel--dark': isDark }">
    <WorkspaceToolSelect
      :model-value="'live'"
      :items="toolboxItems"
      :label="t('anTools')"
      :aria-label="t('anTools')"
      class="fp-toolbox"
      @update:model-value="onToolboxSelect"
    />

    <div class="pa-4 fp-card">
      <v-expansion-panels v-model="openPanels" variant="accordion" multiple class="filter-accordion filter-group">
        <!-- ========================= POINTS DE VENTE ========================= -->
        <v-expansion-panel value="shops">
          <v-expansion-panel-title class="section-title">
            {{ t('anShops') }}
            <template #actions>
              <v-chip v-if="filters.selectedShopIds.length" size="x-small" color="primary">
                {{ filters.selectedShopIds.length }}
              </v-chip>
              <v-icon size="18">mdi-chevron-down</v-icon>
            </template>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <v-text-field
              v-model="shopSearch"
              variant="outlined"
              rounded="lg"
              density="compact"
              bg-color="grey-lighten-5"
              hide-details
              prepend-inner-icon="mdi-magnify"
              :placeholder="t('anSearchShop')"
              class="mb-2"
            />
            <v-list density="compact" nav class="py-0 shops-scroll">
              <v-list-item
                v-for="shop in filteredShopNames"
                :key="shop"
                :active="filters.selectedShopIds.includes(shop)"
                @click="toggleIn('selectedShopIds', shop)"
                min-height="32"
              >
                <v-list-item-title class="text-caption">{{ shop }}</v-list-item-title>
              </v-list-item>
              <div v-if="!filteredShopNames.length" class="fp-check-empty">{{ t('anNoResults') }}</div>
            </v-list>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= TYPES DE PdV ========================= -->
        <v-expansion-panel value="shop-types">
          <v-expansion-panel-title class="section-title">{{ t('anShopTypes') }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="fp-check-list">
              <label v-for="entry in shopTypeCounts" :key="entry.key" class="fp-check-row">
                <input
                  type="checkbox"
                  class="fp-check"
                  :checked="filters.selectedShopTypes.includes(entry.key)"
                  @change="toggleIn('selectedShopTypes', entry.key)"
                />
                <span class="fp-check-name">{{ entry.label }}</span>
                <span class="fp-check-count">{{ entry.count }}</span>
              </label>
              <div v-if="!shopTypeCounts.length" class="fp-check-empty">{{ t('anNoResults') }}</div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= ZONES ========================= -->
        <v-expansion-panel value="shop-areas">
          <v-expansion-panel-title class="section-title">{{ t('anZones') }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="fp-check-list">
              <label v-for="[area, count] in shopAreaCounts" :key="area" class="fp-check-row">
                <input
                  type="checkbox"
                  class="fp-check"
                  :checked="filters.selectedShopAreas.includes(area)"
                  @change="toggleIn('selectedShopAreas', area)"
                />
                <span class="fp-check-name">{{ area }}</span>
                <span class="fp-check-count">{{ count }}</span>
              </label>
              <div v-if="!shopAreaCounts.length" class="fp-check-empty">{{ t('anNoResults') }}</div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= ARTICLES DU MENU ========================= -->
        <v-expansion-panel value="menu-items">
          <v-expansion-panel-title class="section-title">
            {{ t('anMenuItems') }}
            <template #actions>
              <v-chip v-if="filters.selectedMenuItemIds.length" size="x-small" color="primary">
                {{ filters.selectedMenuItemIds.length }}
              </v-chip>
              <v-icon size="18">mdi-chevron-down</v-icon>
            </template>
          </v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="fp-search">
              <v-icon size="15" class="fp-search__icon">mdi-magnify</v-icon>
              <input v-model="menuItemSearch" type="search" class="fp-search__input" :placeholder="t('anSearchMenuItems')" />
            </div>
            <div class="fp-check-list">
              <label v-for="[name, count] in filteredMenuItemCounts" :key="name" class="fp-check-row">
                <input
                  type="checkbox"
                  class="fp-check"
                  :checked="filters.selectedMenuItemIds.includes(name)"
                  @change="toggleIn('selectedMenuItemIds', name)"
                />
                <span class="fp-check-name">{{ name }}</span>
                <span class="fp-check-count">{{ count }}</span>
              </label>
              <div v-if="!filteredMenuItemCounts.length" class="fp-check-empty">{{ t('anNoResults') }}</div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>

        <!-- ========================= TYPE & CATÉGORIE ========================= -->
        <v-expansion-panel value="type-category">
          <v-expansion-panel-title class="section-title">{{ t('anTypeCategory') }}</v-expansion-panel-title>
          <v-expansion-panel-text>
            <div class="fp-sub-label">{{ t('anTypes') }}</div>
            <div class="fp-check-list">
              <label v-for="[type, count] in menuItemTypeCounts" :key="type" class="fp-check-row">
                <input
                  type="checkbox"
                  class="fp-check"
                  :checked="filters.selectedMenuItemTypes.includes(type)"
                  @change="toggleIn('selectedMenuItemTypes', type)"
                />
                <span class="fp-check-name">{{ type }}</span>
                <span class="fp-check-count">{{ count }}</span>
              </label>
              <div v-if="!menuItemTypeCounts.length" class="fp-check-empty">{{ t('anNoResults') }}</div>
            </div>

            <div class="fp-sub-label fp-sub-label--mt">{{ t('anCategory') }}</div>
            <div class="fp-check-list">
              <label v-for="[cat, count] in menuItemCategoryCounts" :key="cat" class="fp-check-row">
                <input
                  type="checkbox"
                  class="fp-check"
                  :checked="filters.selectedMenuItemCategories.includes(cat)"
                  @change="toggleIn('selectedMenuItemCategories', cat)"
                />
                <span class="fp-check-name">{{ cat }}</span>
                <span class="fp-check-count">{{ count }}</span>
              </label>
              <div v-if="!menuItemCategoryCounts.length" class="fp-check-empty">{{ t('anNoResults') }}</div>
            </div>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>

      <v-btn variant="tonal" color="#ff3131" size="small" rounded="lg" block class="mt-4" @click="resetFilters">
        <v-icon start size="16">mdi-refresh</v-icon>
        {{ t('anResetFilters') }}
      </v-btn>
    </div>
  </aside>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from '@/i18n/useI18n'
import WorkspaceToolSelect from '@/components/WorkspaceToolSelect.vue'
import { resolveShopType } from '@/utils/analyseDimensions'
import { SHOP_TYPE_LABEL_KEYS } from '@/constants/shopTypes'
import { UNATTACHED_SHOP_KEY } from '@/utils/analyseReconciliation'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const props = defineProps({
  records: { type: Array, default: () => [] },
  filters: {
    type: Object,
    default: () => ({
      selectedShopIds: [],
      selectedShopTypes: [],
      selectedShopAreas: [],
      selectedMenuItemIds: [],
      selectedMenuItemTypes: [],
      selectedMenuItemCategories: [],
    }),
  },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['update:filters'])

// Fermés par défaut à l'ouverture (décision utilisateur) — l'utilisateur déplie ce
// qui l'intéresse plutôt que de faire défiler 5 sections ouvertes d'entrée.
const openPanels = ref([])
const shopSearch = ref('')
const menuItemSearch = ref('')

function toggleIn(key, value) {
  const list = [...(props.filters[key] || [])]
  const idx = list.indexOf(value)
  if (idx >= 0) list.splice(idx, 1)
  else list.push(value)
  emit('update:filters', { ...props.filters, [key]: list })
}

function resetFilters() {
  emit('update:filters', {
    selectedShopIds: [],
    selectedShopTypes: [],
    selectedShopAreas: [],
    selectedMenuItemIds: [],
    selectedMenuItemTypes: [],
    selectedMenuItemCategories: [],
  })
}

// Options + compteurs — dérivés des records item-level du seul event live (déjà
// scopés, contrairement à `optionsBaseRecords` côté Analyse qui porte tout
// l'historique analysable, cf. BUG-304-02). Triés par volume décroissant (sauf
// Menu items, alphabétique — décision utilisateur, liste trop longue pour un tri
// par volume lisible).
function countBy(records, keyFn) {
  const m = new Map()
  for (const r of records) {
    const v = keyFn(r)
    if (!v) continue
    m.set(v, (m.get(v) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}
const shopCounts = computed(() => countBy(props.records, (r) => r.shopName))
// resolveShopType (PAS le champ brut `r.shopType`) : mêmes règles que
// ShopDistributionPieChart (repli sur le type de l'article vendu quand le PdV est
// générique) — sinon tout retombe dans le seau « other » (bug observé en Live).
// Libellé traduit à part (clé composite 'food, beverages' → 'Food & Beverages').
const shopTypeCounts = computed(() => {
  const raw = countBy(props.records, resolveShopType)
  return raw.map(([key, count]) => ({ key, label: shopTypeLabel(key), count }))
})
const shopAreaCounts = computed(() => countBy(props.records, (r) => r.shopArea))
const menuItemNameCounts = computed(() => {
  const m = new Map()
  for (const r of props.records) {
    const v = r.menuItemName
    if (!v) continue
    m.set(v, (m.get(v) || 0) + 1)
  }
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
})
const menuItemTypeCounts = computed(() => countBy(props.records, (r) => r.menuItemType))
const menuItemCategoryCounts = computed(() => countBy(props.records, (r) => r.menuItemCategory))

function shopTypeLabel(key) {
  if (!key) return ''
  if (key === UNATTACHED_SHOP_KEY) return t('anUnmatchedShops')
  return String(key)
    .split(', ')
    .map((token) => (SHOP_TYPE_LABEL_KEYS[token] ? t(SHOP_TYPE_LABEL_KEYS[token]) : token))
    .join(' & ')
}

const filteredShopNames = computed(() => {
  const names = shopCounts.value.map(([name]) => name)
  if (!shopSearch.value) return names
  const q = shopSearch.value.toLowerCase()
  return names.filter((s) => s.toLowerCase().includes(q))
})
const filteredMenuItemCounts = computed(() => {
  if (!menuItemSearch.value) return menuItemNameCounts.value
  const q = menuItemSearch.value.toLowerCase()
  return menuItemNameCounts.value.filter(([name]) => name.toLowerCase().includes(q))
})

// Sélecteur d'outils partagé (parité FilterPanel.vue) — navigue vers l'écran
// dédié pour chaque outil ; Analyse/Predict/Event Predict retombent tous sur
// `space-analyse` (mêmes routes que le vrai FilterPanel).
function spacePath(suffix) {
  const id = route.params?.spaceId
  return id ? `/spaces/${id}${suffix}` : '/spaces'
}
function onToolboxSelect(v) {
  if (v === 'live') return
  if (v === 'space-pre-inventory') return router.push(spacePath('/pre-inventory'))
  if (v === 'space-inventory') return router.push(spacePath('/inventory'))
  if (v === 'logistic') return router.push(spacePath('/logistic'))
  if (v === 'restock') return router.push(spacePath('/restock'))
  router.push({ path: spacePath(''), query: v === 'analyse' ? {} : { toolbox: v } })
}
const toolboxItems = computed(() => [
  { value: 'analyse', label: t('anToolAnalyse'), icon: 'mdi-chart-line' },
  { value: 'predict', label: t('anToolPredict'), icon: 'mdi-trending-up' },
  { value: 'event-predict', label: t('anToolEventPredict'), icon: 'mdi-lightning-bolt' },
  { value: 'live', label: t('anToolLive'), icon: 'mdi-record-circle-outline' },
  { value: 'space-pre-inventory', label: t('invToolPreInventory'), icon: 'mdi-clipboard-arrow-up-outline' },
  { value: 'space-inventory', label: t('anToolInventory'), icon: 'mdi-package-variant' },
  { value: 'logistic', label: t('anToolLogistic'), icon: 'mdi-forklift' },
  { value: 'restock', label: t('anToolRestock'), icon: 'mdi-truck-delivery-outline' },
])
</script>

<style scoped>
.analyse-filter-panel {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.fp-toolbox { margin: 0 0 2px; }
.fp-card {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 18px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}
.section-title {
  font-size: 0.6875rem;
  font-weight: var(--fw-bold);
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.analyse-filter-panel :deep(.v-field) {
  border-radius: 10px;
  border: 1.5px solid #e5e7eb;
  background: #f9fafb;
  box-shadow: none;
  transition: border-color .15s ease, box-shadow .15s ease, background .15s ease;
}
.analyse-filter-panel :deep(.v-field__outline) { display: none; }
.analyse-filter-panel :deep(.v-field:hover) { border-color: #d1d5db; }
.analyse-filter-panel :deep(.v-field--focused) {
  border-color: #ff3131;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .12);
}
.analyse-filter-panel :deep(.v-field__input) {
  font-size: var(--fs-base);
  min-height: 38px;
  color: #212121;
}
.analyse-filter-panel :deep(.v-field__prepend-inner),
.analyse-filter-panel :deep(.v-field__append-inner) { color: #9ca3af; }
.filter-accordion :deep(.v-expansion-panel-title) {
  padding: 8px 4px;
  min-height: 40px;
  background-color: transparent;
}
.filter-accordion :deep(.v-expansion-panel-title--active) {
  background-color: transparent;
  color: #ff3131;
}
.filter-accordion :deep(.v-expansion-panel-text__wrapper) {
  padding: 10px 12px 16px;
  background-color: #FFFFFF;
}
.filter-group { margin-bottom: 20px; border-radius: 12px; }
.filter-group:last-of-type { margin-bottom: 4px; }
.fp-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f3f4f6;
  border-radius: 10px;
  padding: 8px 12px;
  margin-bottom: 8px;
}
.fp-search__icon { color: #9ca3af; flex-shrink: 0; }
.fp-search__input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--fs-base);
  color: #0f172a;
}
.fp-search__input::placeholder { color: #9ca3af; }
.fp-check-list {
  display: flex;
  flex-direction: column;
  max-height: 300px;
  overflow-y: auto;
}
.fp-check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 6px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .12s ease;
}
.fp-check-row:hover { background: #f9fafb; }
.fp-check {
  appearance: none;
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  border: 1.5px solid #d1d5db;
  border-radius: 5px;
  background: #fff;
  cursor: pointer;
  position: relative;
  transition: border-color .15s ease, background .15s ease;
}
.fp-check:hover { border-color: #ff3131; }
.fp-check:checked { background: #ff3131; border-color: #ff3131; }
.fp-check:checked::after {
  content: '';
  position: absolute;
  left: 5px;
  top: 1.5px;
  width: 5px;
  height: 9px;
  border: solid #fff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}
.fp-check-name {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-md);
  font-weight: 600;
  color: #1e293b;
}
.fp-check-count {
  font-size: var(--fs-base);
  color: #9ca3af;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
.fp-check-empty {
  padding: 12px;
  text-align: center;
  font-size: var(--fs-base);
  color: #9ca3af;
}
.fp-sub-label {
  font-size: var(--fs-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: #9ca3af;
  margin-bottom: 4px;
}
.fp-sub-label--mt { margin-top: 14px; }
.shops-scroll {
  max-height: 300px;
  overflow-y: auto;
  border-radius: 8px;
  background: #FAFAFA;
}

.analyse-filter-panel--dark { background: #0f172a; }
.analyse-filter-panel--dark .fp-card {
  background: #1e293b;
  border-color: rgba(255, 255, 255, 0.10);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
.analyse-filter-panel--dark .section-title { color: #94a3b8; }
.analyse-filter-panel--dark .fp-sub-label { color: #94a3b8; }
.analyse-filter-panel--dark :deep(.v-field) {
  background: #0f172a;
  border-color: rgba(255, 255, 255, 0.14);
}
.analyse-filter-panel--dark :deep(.v-select__selection-text),
.analyse-filter-panel--dark :deep(.v-field input) { color: #e2e8f0 !important; }
.analyse-filter-panel--dark :deep(.v-field:hover) { border-color: rgba(255, 255, 255, 0.18); }
.analyse-filter-panel--dark :deep(.v-field--focused) {
  border-color: #ff3131;
  background: #1e293b;
}
.analyse-filter-panel--dark :deep(.v-field__input) { color: #e2e8f0; }
.analyse-filter-panel--dark :deep(.v-field__prepend-inner),
.analyse-filter-panel--dark :deep(.v-field__append-inner) { color: #94a3b8; }
.analyse-filter-panel--dark .filter-accordion :deep(.v-expansion-panel-title--active) { color: #ff3131; }
.analyse-filter-panel--dark .filter-accordion :deep(.v-expansion-panel-text__wrapper) {
  background-color: #1e293b;
}
.analyse-filter-panel--dark .fp-search { background: #0f172a; }
.analyse-filter-panel--dark .fp-search__icon { color: #94a3b8; }
.analyse-filter-panel--dark .fp-search__input { color: #e2e8f0; }
.analyse-filter-panel--dark .fp-search__input::placeholder { color: #94a3b8; }
.analyse-filter-panel--dark .fp-check-row:hover { background: rgba(255, 255, 255, 0.05); }
.analyse-filter-panel--dark .fp-check { background: #0f172a; border-color: rgba(255, 255, 255, 0.18); }
.analyse-filter-panel--dark .fp-check:hover { border-color: #ff3131; }
.analyse-filter-panel--dark .fp-check:checked { background: #ff3131; border-color: #ff3131; }
.analyse-filter-panel--dark .fp-check-name { color: #e2e8f0; }
.analyse-filter-panel--dark .fp-check-count,
.analyse-filter-panel--dark .fp-check-empty { color: #94a3b8; }
.analyse-filter-panel--dark .shops-scroll { background: #0f172a; }
</style>
