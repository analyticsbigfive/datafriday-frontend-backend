<template>
  <!-- Panneau de filtres GAUCHE pour Space Inventory.
       Réplique visuelle du FilterPanel Analyse (accordéon repliable, titres avec
       badges de comptage + chevron, palette rouge #ff3131). L'état des filtres
       est détenu par le parent (SpaceInventoryView) et propagé via props / emits ;
       on ne dépend pas du store analyse ici. -->
  <aside class="inventory-filter-panel">
    <!-- Zone haute (ex : sélecteur d'outils / navigation inter-écrans) fournie par
         le parent, au-dessus du titre « Inventory filters ». -->
    <div v-if="$slots.top" class="ifp-top">
      <slot name="top" />
    </div>
    <div class="ifp-head">
      <h3 class="ifp-title">{{ t('invFilterTitle') }}</h3>
      <v-btn
        v-if="activeFilterCount"
        size="x-small"
        variant="text"
        color="#ff3131"
        class="ifp-reset-inline"
        @click="$emit('reset')"
      >
        <v-icon start size="14">mdi-refresh</v-icon>
        {{ t('invResetFilters') }}
      </v-btn>
    </div>

    <v-expansion-panels
      v-model="openPanels"
      variant="accordion"
      multiple
      class="filter-accordion"
    >
      <!-- ===================== ARTICLES DU MENU / MENU ITEMS ===================== -->
      <v-expansion-panel value="menu-items">
        <v-expansion-panel-title class="section-title">
          {{ mode === 'storage' ? t('invFilterInventoryItems') : t('invFilterMenuItems') }}
          <template #actions>
            <v-chip v-if="selectedMenuItems.length" size="x-small" color="#ff3131" variant="flat">
              {{ selectedMenuItems.length }}
            </v-chip>
            <v-icon size="18">mdi-chevron-down</v-icon>
          </template>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-text-field
            v-model="menuItemSearch"
            variant="outlined"
            rounded="lg"
            density="compact"
            bg-color="grey-lighten-5"
            hide-details
            prepend-inner-icon="mdi-magnify"
            :placeholder="t('invFilterSearchMenuItem')"
            class="mb-2"
          />
          <div class="d-flex ga-1 mb-2">
            <v-btn size="x-small" variant="text" @click="selectAllMenuItems">{{ t('invAll') }}</v-btn>
            <v-btn size="x-small" variant="text" @click="clearMenuItems">{{ t('invNone') }}</v-btn>
          </div>
          <div class="ifp-scroll">
            <v-list density="compact" nav class="py-0">
              <v-list-item
                v-for="opt in filteredMenuItemOptions"
                :key="opt.value"
                :active="selectedMenuItems.includes(opt.value)"
                min-height="32"
                @click="toggleValue('selectedMenuItems', opt.value)"
              >
                <v-list-item-title class="text-caption">{{ opt.title }}</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="!menuItemOptions.length" min-height="32">
                <v-list-item-title class="text-caption text-medium-emphasis">{{ t('invFilterNoOptions') }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- ===================== POINTS DE VENTE / SHOPS ===================== -->
      <v-expansion-panel v-if="mode === 'shops'" value="shops">
        <v-expansion-panel-title class="section-title">
          {{ t('invFilterShops') }}
          <template #actions>
            <v-chip v-if="selectedShops.length" size="x-small" color="#ff3131" variant="flat">
              {{ selectedShops.length }}
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
            :placeholder="t('invSearchShop')"
            class="mb-2"
          />
          <div class="d-flex ga-1 mb-2">
            <v-btn size="x-small" variant="text" @click="selectAllShops">{{ t('invAll') }}</v-btn>
            <v-btn size="x-small" variant="text" @click="clearShops">{{ t('invNone') }}</v-btn>
          </div>
          <div class="ifp-scroll">
            <v-list density="compact" nav class="py-0">
              <v-list-item
                v-for="opt in filteredShopOptions"
                :key="opt.value"
                :active="selectedShops.includes(opt.value)"
                min-height="32"
                @click="toggleValue('selectedShops', opt.value)"
              >
                <v-list-item-title class="text-caption">{{ opt.title }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- ===================== STOCKAGES / STORAGES (mode storage) ===================== -->
      <v-expansion-panel v-if="mode === 'storage'" value="storages">
        <v-expansion-panel-title class="section-title">
          {{ t('invFilterStorages') }}
          <template #actions>
            <v-chip v-if="selectedStorages.length" size="x-small" color="#ff3131" variant="flat">
              {{ selectedStorages.length }}
            </v-chip>
            <v-icon size="18">mdi-chevron-down</v-icon>
          </template>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <v-text-field
            v-model="storageSearch"
            variant="outlined"
            rounded="lg"
            density="compact"
            bg-color="grey-lighten-5"
            hide-details
            prepend-inner-icon="mdi-magnify"
            :placeholder="t('invSearchStorage')"
            class="mb-2"
          />
          <div class="d-flex ga-1 mb-2">
            <v-btn size="x-small" variant="text" @click="selectAllStorages">{{ t('invAll') }}</v-btn>
            <v-btn size="x-small" variant="text" @click="clearStorages">{{ t('invNone') }}</v-btn>
          </div>
          <div class="ifp-scroll">
            <v-list density="compact" nav class="py-0">
              <v-list-item
                v-for="opt in filteredStorageOptions"
                :key="opt.value"
                :active="selectedStorages.includes(opt.value)"
                min-height="32"
                @click="toggleValue('selectedStorages', opt.value)"
              >
                <v-list-item-title class="text-caption">{{ opt.title }}</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="!storageOptions.length" min-height="32">
                <v-list-item-title class="text-caption text-medium-emphasis">{{ t('invFilterNoOptions') }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- ===================== ÉTAGES / FLOORS (mode storage) ===================== -->
      <v-expansion-panel v-if="mode === 'storage'" value="storage-floors">
        <v-expansion-panel-title class="section-title">
          {{ t('invFilterFloors') }}
          <template #actions>
            <v-chip v-if="selectedStorageFloors.length" size="x-small" color="#ff3131" variant="flat">
              {{ selectedStorageFloors.length }}
            </v-chip>
            <v-icon size="18">mdi-chevron-down</v-icon>
          </template>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="ifp-scroll">
            <v-list density="compact" nav class="py-0">
              <v-list-item
                v-for="opt in storageFloorOptions"
                :key="opt.value"
                :active="selectedStorageFloors.includes(opt.value)"
                min-height="32"
                @click="toggleValue('selectedStorageFloors', opt.value)"
              >
                <v-list-item-title class="text-caption">{{ opt.title }}</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="!storageFloorOptions.length" min-height="32">
                <v-list-item-title class="text-caption text-medium-emphasis">{{ t('invFilterNoOptions') }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- ===================== TYPES DE PdV / SHOP TYPES ===================== -->
      <v-expansion-panel v-if="mode === 'shops'" value="shop-types">
        <v-expansion-panel-title class="section-title">
          {{ t('invFilterShopTypes') }}
          <template #actions>
            <v-chip v-if="selectedShopTypes.length" size="x-small" color="#ff3131" variant="flat">
              {{ selectedShopTypes.length }}
            </v-chip>
            <v-icon size="18">mdi-chevron-down</v-icon>
          </template>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="ifp-scroll">
            <v-list density="compact" nav class="py-0">
              <v-list-item
                v-for="opt in shopTypeOptions"
                :key="opt.value"
                :active="selectedShopTypes.includes(opt.value)"
                min-height="32"
                @click="toggleValue('selectedShopTypes', opt.value)"
              >
                <v-list-item-title class="text-caption">{{ opt.title }}</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="!shopTypeOptions.length" min-height="32">
                <v-list-item-title class="text-caption text-medium-emphasis">{{ t('invFilterNoOptions') }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- ===================== ZONES / SHOP AREAS ===================== -->
      <v-expansion-panel v-if="mode === 'shops'" value="shop-areas">
        <v-expansion-panel-title class="section-title">
          {{ t('invFilterZones') }}
          <template #actions>
            <v-chip v-if="selectedShopAreas.length" size="x-small" color="#ff3131" variant="flat">
              {{ selectedShopAreas.length }}
            </v-chip>
            <v-icon size="18">mdi-chevron-down</v-icon>
          </template>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="ifp-scroll">
            <v-list density="compact" nav class="py-0">
              <v-list-item
                v-for="opt in shopAreaOptions"
                :key="opt.value"
                :active="selectedShopAreas.includes(opt.value)"
                min-height="32"
                @click="toggleValue('selectedShopAreas', opt.value)"
              >
                <v-list-item-title class="text-caption">{{ opt.title }}</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="!shopAreaOptions.length" min-height="32">
                <v-list-item-title class="text-caption text-medium-emphasis">{{ t('invFilterNoOptions') }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>

      <!-- ===================== TYPE & CATÉGORIE ===================== -->
      <v-expansion-panel value="type-category">
        <v-expansion-panel-title class="section-title">
          {{ t('invFilterTypeCategory') }}
          <template #actions>
            <v-chip
              v-if="selectedItemTypes.length + selectedItemCategories.length"
              size="x-small"
              color="#ff3131"
              variant="flat"
            >
              {{ selectedItemTypes.length + selectedItemCategories.length }}
            </v-chip>
            <v-icon size="18">mdi-chevron-down</v-icon>
          </template>
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="filter-label mb-1">{{ t('invFilterItemType') }}</div>
          <div class="ifp-scroll ifp-scroll-sm mb-3">
            <v-list density="compact" nav class="py-0">
              <v-list-item
                v-for="opt in itemTypeOptions"
                :key="opt.value"
                :active="selectedItemTypes.includes(opt.value)"
                min-height="32"
                @click="toggleValue('selectedItemTypes', opt.value)"
              >
                <v-list-item-title class="text-caption">{{ opt.title }}</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="!itemTypeOptions.length" min-height="32">
                <v-list-item-title class="text-caption text-medium-emphasis">{{ t('invFilterNoOptions') }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </div>

          <div class="filter-label mb-1">{{ t('invFilterCategory') }}</div>
          <div class="ifp-scroll ifp-scroll-sm">
            <v-list density="compact" nav class="py-0">
              <v-list-item
                v-for="opt in itemCategoryOptions"
                :key="opt.value"
                :active="selectedItemCategories.includes(opt.value)"
                min-height="32"
                @click="toggleValue('selectedItemCategories', opt.value)"
              >
                <v-list-item-title class="text-caption">{{ opt.title }}</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="!itemCategoryOptions.length" min-height="32">
                <v-list-item-title class="text-caption text-medium-emphasis">{{ t('invFilterNoOptions') }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>

    <v-btn
      variant="tonal"
      color="#ff3131"
      size="small"
      rounded="lg"
      block
      class="mt-4"
      @click="$emit('reset')"
    >
      <v-icon start size="16">mdi-refresh</v-icon>
      {{ t('invResetFilters') }}
    </v-btn>
  </aside>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'

export default {
  name: 'InventoryFilterPanel',
  setup() {
    return { t: useI18n().t }
  },
  props: {
    // Mode : 'shops' (facettes PdV) ou 'storage' (facettes stockages/étages).
    mode: { type: String, default: 'shops' },
    // Options (dérivées dans le parent depuis realShops/realStorages + menuItems)
    shopOptions: { type: Array, default: () => [] },
    shopTypeOptions: { type: Array, default: () => [] },
    shopAreaOptions: { type: Array, default: () => [] },
    menuItemOptions: { type: Array, default: () => [] },
    itemTypeOptions: { type: Array, default: () => [] },
    itemCategoryOptions: { type: Array, default: () => [] },
    storageOptions: { type: Array, default: () => [] },
    storageFloorOptions: { type: Array, default: () => [] },
    // Sélections (détenues par le parent)
    selectedShops: { type: Array, default: () => [] },
    selectedShopTypes: { type: Array, default: () => [] },
    selectedShopAreas: { type: Array, default: () => [] },
    selectedMenuItems: { type: Array, default: () => [] },
    selectedItemTypes: { type: Array, default: () => [] },
    selectedItemCategories: { type: Array, default: () => [] },
    selectedStorages: { type: Array, default: () => [] },
    selectedStorageFloors: { type: Array, default: () => [] },
  },
  emits: [
    'update:selectedShops',
    'update:selectedShopTypes',
    'update:selectedShopAreas',
    'update:selectedMenuItems',
    'update:selectedItemTypes',
    'update:selectedItemCategories',
    'update:selectedStorages',
    'update:selectedStorageFloors',
    'reset',
  ],
  data() {
    return {
      // Les 5 groupes sont ouverts par défaut pour matcher l'allure Analyse
      // (tout est visible d'un coup), l'utilisateur peut replier au besoin.
      // Seul « Articles du menu » est déplié par défaut (placé en premier).
      openPanels: ['menu-items'],
      shopSearch: '',
      menuItemSearch: '',
      storageSearch: '',
    }
  },
  computed: {
    activeFilterCount() {
      return (
        this.selectedShops.length +
        this.selectedShopTypes.length +
        this.selectedShopAreas.length +
        this.selectedMenuItems.length +
        this.selectedItemTypes.length +
        this.selectedItemCategories.length +
        this.selectedStorages.length +
        this.selectedStorageFloors.length
      )
    },
    filteredShopOptions() {
      const q = this.shopSearch.trim().toLowerCase()
      if (!q) return this.shopOptions
      return this.shopOptions.filter((o) => String(o.title).toLowerCase().includes(q))
    },
    filteredMenuItemOptions() {
      const q = this.menuItemSearch.trim().toLowerCase()
      if (!q) return this.menuItemOptions
      return this.menuItemOptions.filter((o) => String(o.title).toLowerCase().includes(q))
    },
    filteredStorageOptions() {
      const q = this.storageSearch.trim().toLowerCase()
      if (!q) return this.storageOptions
      return this.storageOptions.filter((o) => String(o.title).toLowerCase().includes(q))
    },
  },
  methods: {
    // Toggle générique : ajoute / retire `value` de la sélection `key` puis emit.
    toggleValue(key, value) {
      const current = Array.isArray(this[key]) ? this[key] : []
      const list = [...current]
      const idx = list.indexOf(value)
      if (idx >= 0) list.splice(idx, 1)
      else list.push(value)
      this.$emit(`update:${key}`, list)
    },
    selectAllShops() {
      this.$emit('update:selectedShops', this.filteredShopOptions.map((o) => o.value))
    },
    clearShops() {
      this.$emit('update:selectedShops', [])
    },
    selectAllMenuItems() {
      this.$emit('update:selectedMenuItems', this.filteredMenuItemOptions.map((o) => o.value))
    },
    clearMenuItems() {
      this.$emit('update:selectedMenuItems', [])
    },
    selectAllStorages() {
      this.$emit('update:selectedStorages', this.filteredStorageOptions.map((o) => o.value))
    },
    clearStorages() {
      this.$emit('update:selectedStorages', [])
    },
  },
}
</script>

<style scoped>
.inventory-filter-panel {
  width: 100%;
  min-width: 0;
  /* Carte blanche = look EventPredict (radius 18, border #d9e2ec, ombre douce). */
  border: 1px solid #d9e2ec;
  border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  padding: 12px 10px;
  overflow-y: auto;
  max-height: 100%;
  scrollbar-width: thin;
}
/* Search box compactes (les 3 : articles / PdV / storage). Le v-text-field
   Vuetify density=compact reste haut (~44px, texte 16px) — ramené au gabarit
   des filtres (32px, 13px). */
.inventory-filter-panel :deep(.v-text-field .v-field) {
  font-size: 13px;
}
.inventory-filter-panel :deep(.v-text-field .v-field__input) {
  min-height: 32px;
  padding-top: 2px;
  padding-bottom: 2px;
  font-size: 13px;
}
.inventory-filter-panel :deep(.v-text-field input::placeholder) {
  font-size: 13px;
}
.inventory-filter-panel :deep(.v-text-field .v-field__prepend-inner .v-icon) {
  font-size: 16px;
}
.ifp-top {
  margin-bottom: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}
.ifp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  min-height: 28px;
}
.ifp-title {
  font-size: 13px;
  font-weight: 700;
  color: #212121;
  margin: 0;
}
.ifp-reset-inline {
  text-transform: none;
  letter-spacing: 0;
}
/* En-tête d'accordéon = kicker plat (parité panneau de droite). */
.section-title {
  font-size: 0.6875rem;
  font-weight: 800;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.filter-label {
  font-size: 10px;
  font-weight: 700;
  color: #ff3131;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}
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
.ifp-scroll {
  max-height: 300px;
  overflow-y: auto;
  border-radius: 8px;
  background: #FAFAFA;
}
.ifp-scroll-sm {
  max-height: 180px;
}
.inventory-filter-panel :deep(.v-list-item--active) {
  color: #ff3131;
}
.inventory-filter-panel :deep(.v-list-item--active .v-list-item-title) {
  font-weight: 600;
}

.inventory-filter-panel {
  border-color: var(--fb-border, #E5E7EB);
  border-radius: var(--fb-radius-panel, 12px);
  background: var(--fb-surface, #FFFFFF);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
}
.ifp-title {
  color: var(--fb-text, #212121);
}
/* .section-title garde sa couleur kicker (#64748b) — pas d'override ici. */
.filter-label,
.inventory-filter-panel :deep(.v-list-item--active) {
  color: #ff3131;
}
.ifp-scroll {
  background: var(--fb-subtle, #FAFAFA);
}
/* En-tête d'accordéon = plat (transparent) ; actif = accent rouge sur le texte. */
.filter-accordion :deep(.v-expansion-panel-title) {
  background: transparent;
}
.filter-accordion :deep(.v-expansion-panel-title--active) {
  background: transparent;
  color: #ff3131;
}
.filter-accordion :deep(.v-expansion-panel-text__wrapper) {
  background: var(--fb-surface, #FFFFFF);
}
</style>
