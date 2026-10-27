<template>
  <div id="storage-list-page" :class="{ 'stg--dark': isDark }">
    <div class="stg-header">
      <div class="stg-header__inner">
        <div class="stg-header__icon"><Warehouse :size="22" color="white" /></div>
        <div>
          <h1 class="stg-header__title">{{ t('storageTitle') }}</h1>
          <p class="stg-header__subtitle">{{ t('storageSubtitle') }}</p>
        </div>
      </div>
    </div>

    <div class="stg-searchbar">
      <div class="stg-searchbar__inner">
        <Search :size="17" class="stg-searchbar__icon" />
        <input v-model="search" class="stg-searchbar__input" type="search" :placeholder="t('storageSearchPlaceholder')" />
        <div class="stg-pills">
          <MarketPriceSearchSelect v-model="type" :items="typeOptions" variant="pill" :is-dark="isDark" />
          <MarketPriceSearchSelect v-model="category" :items="categoryOptions" variant="pill" :is-dark="isDark" />
          <MarketPriceSearchSelect
            :model-value="spaceName || t('storageAllSpaces')"
            :items="spaceOptions"
            variant="pill"
            :is-dark="isDark"
            @update:model-value="spaceName = $event"
          />
        </div>
        <span class="stg-searchbar__count">{{ filtered.length }} {{ t('storageItemsCount') }}</span>
        <button v-if="hasFilters" type="button" class="stg-searchbar__clear" @click="clearFilters"><X :size="15" /></button>
      </div>
    </div>

    <div class="stg-content">
      <v-progress-linear v-if="loading" indeterminate color="#ff3131" height="3" rounded class="stg-loader" />
      <div v-if="error" class="stg-alert">
        <AlertCircle :size="15" class="me-2" style="flex-shrink:0" />
        {{ error === 'usage-error' ? t('storageUsageError') : error === 'load-error' ? t('storageLoadError') : error }}
      </div>

      <div v-if="selection.count.value > 0" class="stg-selbar" :class="{ 'stg-selbar--dark': isDark }">
        <span class="stg-selbar__count">{{ t('storageSelectedCount').replace('{n}', selection.count.value) }}</span>
        <button type="button" class="stg-selbar__clear" @click="selection.clear()">{{ t('storageClearSelection') }}</button>
      </div>

      <div v-if="!loading && usageLoaded && filtered.length === 0" class="stg-empty">
        <PackageX :size="44" style="color:#d1d5db" />
        <h3 class="stg-empty__title">{{ t('storageNoneFound') }}</h3>
        <p class="stg-empty__sub">{{ t('storageNoneMessage') }}</p>
      </div>

      <div v-else-if="usageLoaded" class="row g-4">
        <div v-for="card in filtered" :key="card.key" class="col-12 col-sm-6 col-lg-4 col-xl-3">
          <StorageProductCard
            :card="card"
            :spaces="selection.spaceIdsFor(card).map((id) => ({ id, name: spaceNameOf(id) })).filter((s) => s.name)"
            :edit-label="t('storageEditItem')"
            :no-space-label="t('storageNoSpace')"
            :selected="selection.isSelected(card)"
            :select-label="t('storageSelectCard')"
            :is-dark="isDark"
            @edit="onEdit"
            @open-space="onOpenSpace"
            @toggle-select="selection.toggle"
          />
        </div>
      </div>
    </div>

    <MarketPriceEditSupplierDrawer
      v-model="editOpen"
      :item="editItem"
      :row="editRow"
      :suppliers="suppliers"
      :good-type-options="goodTypeOptions"
      :product-categories="productCategories"
      :is-dark="isDark"
      @saved="load({ force: true })"
    />

    <StorageSpotsDrawer
      v-model="spotsOpen"
      :product-name="spotsNames.length === 1 ? spotsNames[0] : ''"
      :product-names="spotsNames.length > 1 ? spotsNames : []"
      :reference="spotsNames.length === 1 ? spotsReference : ''"
      :space-id="spotsSpace.id"
      :space-name="spotsSpace.name"
      :read-only="!canEditSpots"
      :is-dark="isDark"
    />
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useStore } from 'vuex'
import { AlertCircle, PackageX, Search, Warehouse, X } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import { useStoragePage } from '@/composables/useStoragePage'
import { useStorageSelection } from '@/composables/useStorageSelection'
import MarketPriceSearchSelect from '../../market-prices/components/MarketPriceSearchSelect.vue'
import MarketPriceEditSupplierDrawer from '../../market-prices/drawers/MarketPriceEditSupplierDrawer.vue'
import StorageProductCard from '../components/StorageProductCard.vue'
import StorageSpotsDrawer from '../drawers/StorageSpotsDrawer.vue'

const { t } = useI18n()
const store = useStore()

const theme = ref(localStorage.getItem('datafriday:theme') || localStorage.getItem('appTheme') || 'light')
const isDark = computed(() => theme.value === 'dark' || theme.value === 'dataFridayDark')
const onTheme = (e) => { theme.value = e.detail?.theme || 'light' }

const {
  loading, error, usageLoaded, suppliers, search, type, category, spaceName,
  cards, filtered, typeOptions, categoryOptions, spaceOptions, hasFilters,
  spaceNameOf, clearFilters, load,
} = useStoragePage({ allSpacesLabel: () => t('storageAllSpaces') })

// Sélection multiple (par clé de carte, survit aux filtres).
const selection = useStorageSelection({ cards })

// Drawer d'édition d'une ligne Market Price (le même que la Market Price List).
const productTypes = computed(() => store.getters['marketPriceTypes/marketPriceTypes'] || [])
const productCategories = computed(() => store.getters['marketPriceCategories/marketPriceCategories'] || [])
const sortedNames = (list) => Array.from(new Set(list.map((x) => x?.name).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)))
const goodTypeOptions = computed(() => sortedNames(productTypes.value))

const editOpen = ref(false)
const editItem = ref(null)
const editRow = ref(null)
// Ligne fournisseur retenue pour la carte (celle dont la référence est affichée).
const onEdit = (card) => {
  editItem.value = card.item
  editRow.value = (card.item?.supplierRows || []).find((r) => String(r.id) === String(card.marketPriceId)) || null
  editOpen.value = true
}

// Écriture d'une ligne d'inventaire (PUT builder-v2) exige space.edit côté backend.
const canEditSpots = computed(() => !!store.getters['auth/can']('space.edit'))

const spotsOpen = ref(false)
const spotsNames = ref([])
const spotsReference = ref('')
const spotsSpace = ref({ id: '', name: '' })
const onOpenSpace = ({ card, spaceId, spaceName: name }) => {
  spotsNames.value = selection.productNamesFor(card)
  spotsReference.value = card.reference
  spotsSpace.value = { id: String(spaceId), name }
  spotsOpen.value = true
}

onMounted(() => {
  store.dispatch('marketPriceTypes/fetchMarketPriceTypes')
  store.dispatch('marketPriceCategories/fetchMarketPriceCategories')
  load()
  window.addEventListener('theme-changed', onTheme)
})
onBeforeUnmount(() => window.removeEventListener('theme-changed', onTheme))
</script>

<style scoped>
#storage-list-page { background: #f4f5f7; height: 100%; overflow-y: auto; display: flex; flex-direction: column; }
#storage-list-page.stg--dark { background: #0f172a; }

.stg-header { background: #ff3131; box-shadow: 0 4px 20px rgba(255,49,49,.25); position: sticky; top: 0; z-index: 100; flex-shrink: 0; }
.stg-header__inner { display: flex; align-items: center; gap: 14px; padding: 18px 28px; }
.stg-header__icon { width: 44px; height: 44px; border-radius: 12px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.stg-header__title { font-size: var(--fs-xl); font-weight: 800; color: #fff; margin: 0; line-height: 1.2; }
.stg-header__subtitle { font-size: var(--fs-base); color: rgba(255,255,255,.72); margin: 3px 0 0; }

.stg-searchbar { background: #fff; border-bottom: 1px solid #e5e7eb; position: sticky; top: 81px; z-index: 99; flex-shrink: 0; }
.stg--dark .stg-searchbar { background: #1e293b; border-bottom-color: rgba(255,255,255,.08); }
.stg-searchbar__inner { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 12px 28px; }
.stg-searchbar__icon { color: #9ca3af; flex-shrink: 0; }
.stg-searchbar__input { flex: 1; min-width: 160px; border: none; outline: none; background: transparent; font-size: var(--fs-md); color: #111827; }
.stg--dark .stg-searchbar__input { color: #e5e7eb; }
.stg-searchbar__input::placeholder { color: #9ca3af; }
.stg-pills { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.stg-searchbar__count { font-size: var(--fs-sm); color: #9ca3af; white-space: nowrap; }
.stg-searchbar__clear { background: none; border: none; padding: 2px; cursor: pointer; color: #9ca3af; display: flex; align-items: center; border-radius: 4px; }
.stg-searchbar__clear:hover { color: #ff3131; }

.stg-content { padding: 24px 28px; }
.stg-loader { margin-bottom: 16px; }
.stg-alert { display: flex; align-items: center; padding: 10px 14px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; font-size: var(--fs-base); color: #ff3131; margin-bottom: 16px; }
.stg-selbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; padding: 10px 14px; margin-bottom: 16px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; }
.stg-selbar--dark { background: rgba(255,49,49,.1); border-color: rgba(255,49,49,.3); }
.stg-selbar__count { font-size: var(--fs-md); font-weight: 700; color: #ff3131; }
.stg-selbar__clear { border: 1px solid #ff3131; background: transparent; color: #ff3131; border-radius: 999px; padding: 6px 16px; font-size: var(--fs-base); font-weight: 600; cursor: pointer; }
.stg-selbar__clear:hover { background: #ff3131; color: #fff; }
.stg-empty { text-align: center; padding: 72px 24px; background: #fff; border-radius: 20px; border: 2px dashed #e5e7eb; }
.stg--dark .stg-empty { background: #1e293b; border-color: rgba(255,255,255,.1); }
.stg-empty__title { font-size: var(--fs-lg); font-weight: 700; color: #374151; margin: 16px 0 8px; }
.stg--dark .stg-empty__title { color: #e5e7eb; }
.stg-empty__sub { font-size: var(--fs-md); color: #9ca3af; margin: 0; }
</style>
