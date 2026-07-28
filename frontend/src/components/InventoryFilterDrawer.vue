<template>
  <v-navigation-drawer
    :model-value="modelValue"
    location="left"
    temporary
    width="320"
    class="inventory-filter-drawer"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="pa-4">
      <div class="d-flex align-center justify-space-between mb-4">
        <h3 class="text-subtitle-1 font-weight-bold">{{ t('invFilterTitle') }}</h3>
        <v-btn size="x-small" variant="text" color="primary" @click="$emit('reset')">
          {{ t('invResetFilters') }}
        </v-btn>
      </div>

      <v-select
        :model-value="selectedEventId"
        :items="eventOptions"
        item-title="label"
        item-value="value"
        density="compact"
        variant="outlined"
        hide-details
        :label="t('invEventSource')"
        class="mb-3"
        @update:model-value="$emit('update:selectedEventId', $event)"
      />
      <v-text-field
        :model-value="search"
        density="compact"
        variant="outlined"
        hide-details
        clearable
        prepend-inner-icon="mdi-magnify"
        :placeholder="t('invSearchShopsItems')"
        class="mb-3"
        @update:model-value="$emit('update:search', $event)"
      />
      <v-select
        :model-value="countingStatusTab"
        :items="countingTabs"
        item-title="label"
        item-value="value"
        density="compact"
        variant="outlined"
        hide-details
        :label="t('invFilterStatus')"
        class="mb-3"
        @update:model-value="$emit('update:countingStatusTab', $event)"
      />

      <!-- Facettes stockages — onglet Storage -->
      <template v-if="activeTab === 'storage'">
        <v-divider class="my-3" />
        <v-select
          v-if="storageOptions.length"
          :model-value="selectedStorages"
          :items="storageOptions"
          item-title="title"
          item-value="value"
          multiple
          chips
          closable-chips
          density="compact"
          variant="outlined"
          hide-details
          :label="t('invFilterStorages')"
          class="mb-3"
          @update:model-value="$emit('update:selectedStorages', $event)"
        />
        <v-select
          v-if="storageFloorOptions.length"
          :model-value="selectedStorageFloors"
          :items="storageFloorOptions"
          item-title="title"
          item-value="value"
          multiple
          chips
          closable-chips
          density="compact"
          variant="outlined"
          hide-details
          :label="t('invFilterFloors')"
          class="mb-3"
          @update:model-value="$emit('update:selectedStorageFloors', $event)"
        />
        <v-select
          v-if="menuItemOptions.length"
          :model-value="selectedMenuItems"
          :items="menuItemOptions"
          item-title="title"
          item-value="value"
          multiple
          chips
          closable-chips
          density="compact"
          variant="outlined"
          hide-details
          :label="t('invFilterInventoryItems')"
          class="mb-3"
          @update:model-value="$emit('update:selectedMenuItems', $event)"
        />
        <v-select
          v-if="itemTypeOptions.length"
          :model-value="selectedItemTypes"
          :items="itemTypeOptions"
          item-title="title"
          item-value="value"
          multiple
          chips
          closable-chips
          density="compact"
          variant="outlined"
          hide-details
          :label="t('invFilterItemType')"
          class="mb-3"
          @update:model-value="$emit('update:selectedItemTypes', $event)"
        />
        <v-select
          v-if="itemCategoryOptions.length"
          :model-value="selectedItemCategories"
          :items="itemCategoryOptions"
          item-title="title"
          item-value="value"
          multiple
          chips
          closable-chips
          density="compact"
          variant="outlined"
          hide-details
          :label="t('invFilterCategory')"
          @update:model-value="$emit('update:selectedItemCategories', $event)"
        />
      </template>

      <!-- Filtres avancés boutique (parité React SpaceInventory) — onglet Shops -->
      <template v-if="activeTab === 'shops'">
        <v-divider class="my-3" />
        <v-select
          v-if="shopOptions.length"
          :model-value="selectedShops"
          :items="shopOptions"
          item-title="title"
          item-value="value"
          multiple
          chips
          closable-chips
          density="compact"
          variant="outlined"
          hide-details
          :label="t('invFilterShops')"
          class="mb-3"
          @update:model-value="$emit('update:selectedShops', $event)"
        />
        <v-select
          v-if="shopTypeOptions.length"
          :model-value="selectedShopTypes"
          :items="shopTypeOptions"
          item-title="title"
          item-value="value"
          multiple
          chips
          closable-chips
          density="compact"
          variant="outlined"
          hide-details
          :label="t('invFilterShopTypes')"
          class="mb-3"
          @update:model-value="$emit('update:selectedShopTypes', $event)"
        />
        <v-select
          v-if="shopAreaOptions.length"
          :model-value="selectedShopAreas"
          :items="shopAreaOptions"
          item-title="title"
          item-value="value"
          multiple
          chips
          closable-chips
          density="compact"
          variant="outlined"
          hide-details
          :label="t('invFilterZones')"
          class="mb-3"
          @update:model-value="$emit('update:selectedShopAreas', $event)"
        />
        <v-select
          v-if="menuItemOptions.length"
          :model-value="selectedMenuItems"
          :items="menuItemOptions"
          item-title="title"
          item-value="value"
          multiple
          chips
          closable-chips
          density="compact"
          variant="outlined"
          hide-details
          :label="t('invFilterMenuItems')"
          class="mb-3"
          @update:model-value="$emit('update:selectedMenuItems', $event)"
        />
        <v-select
          v-if="itemTypeOptions.length"
          :model-value="selectedItemTypes"
          :items="itemTypeOptions"
          item-title="title"
          item-value="value"
          multiple
          chips
          closable-chips
          density="compact"
          variant="outlined"
          hide-details
          :label="t('invFilterItemType')"
          class="mb-3"
          @update:model-value="$emit('update:selectedItemTypes', $event)"
        />
        <v-select
          v-if="itemCategoryOptions.length"
          :model-value="selectedItemCategories"
          :items="itemCategoryOptions"
          item-title="title"
          item-value="value"
          multiple
          chips
          closable-chips
          density="compact"
          variant="outlined"
          hide-details
          :label="t('invFilterCategory')"
          @update:model-value="$emit('update:selectedItemCategories', $event)"
        />
      </template>

      <!-- Documents de réconciliation — miroir de la colonne gauche desktop
           (section sous les filtres) : seul point d'entrée MOBILE de la liste
           (docs/modules/10 §7.4, fiche 236). -->
      <InventoryReconciliationSection
        :items="reconciliations"
        :selected-id="selectedReconciliationId"
        :loading="recoLoading"
        @select="$emit('select-reconciliation', $event)"
        @delete="$emit('delete-reconciliation', $event)"
      />
    </div>
  </v-navigation-drawer>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'
import InventoryReconciliationSection from '@/components/InventoryReconciliationSection.vue'

export default {
  name: 'InventoryFilterDrawer',
  components: { InventoryReconciliationSection },
  setup() {
    return { t: useI18n().t }
  },
  props: {
    modelValue: { type: Boolean, default: false },
    activeTab: { type: String, default: 'shops' },
    selectedEventId: { type: [String, Number, null], default: null },
    search: { type: String, default: '' },
    countingStatusTab: { type: String, default: 'to-count' },
    eventOptions: { type: Array, default: () => [] },
    countingTabs: { type: Array, default: () => [] },
    // Facettes avancées
    shopOptions: { type: Array, default: () => [] },
    shopTypeOptions: { type: Array, default: () => [] },
    shopAreaOptions: { type: Array, default: () => [] },
    menuItemOptions: { type: Array, default: () => [] },
    itemTypeOptions: { type: Array, default: () => [] },
    itemCategoryOptions: { type: Array, default: () => [] },
    storageOptions: { type: Array, default: () => [] },
    storageFloorOptions: { type: Array, default: () => [] },
    selectedShops: { type: Array, default: () => [] },
    selectedShopTypes: { type: Array, default: () => [] },
    selectedShopAreas: { type: Array, default: () => [] },
    selectedMenuItems: { type: Array, default: () => [] },
    selectedItemTypes: { type: Array, default: () => [] },
    selectedItemCategories: { type: Array, default: () => [] },
    selectedStorages: { type: Array, default: () => [] },
    selectedStorageFloors: { type: Array, default: () => [] },
    // Section Réconciliation (accès mobile — fiche 236).
    reconciliations: { type: Array, default: () => [] },
    selectedReconciliationId: { type: String, default: null },
    recoLoading: { type: Boolean, default: false },
  },
  emits: [
    'update:modelValue',
    'update:selectedEventId',
    'update:search',
    'update:countingStatusTab',
    'update:selectedShops',
    'update:selectedShopTypes',
    'update:selectedShopAreas',
    'update:selectedMenuItems',
    'update:selectedItemTypes',
    'update:selectedItemCategories',
    'update:selectedStorages',
    'update:selectedStorageFloors',
    'select-reconciliation',
    'delete-reconciliation',
    'reset',
  ],
}
</script>

<style scoped>
/* Couleurs via les `--fb-*` de l'hôte (space-inventory-view / event-predict-overlay) :
   elles basculent seules en thème sombre, cf. style.css. */
.inventory-filter-drawer {
  border-right: 1px solid var(--fb-border, #EEEEEE) !important;
}

.inventory-filter-drawer:not(.v-navigation-drawer--active) {
  display: none !important;
}

.inventory-filter-drawer :deep(.v-navigation-drawer__content) {
  background: var(--fb-surface, #FFFFFF);
}

.inventory-filter-drawer h3 {
  color: var(--fb-text, #212121);
  font-size: 13px;
  font-weight: 700;
}

.inventory-filter-drawer :deep(.v-field) {
  border-radius: 8px;
  background: var(--fb-surface, #FFFFFF);
}
</style>
