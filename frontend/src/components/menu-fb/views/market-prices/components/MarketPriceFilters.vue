<template>
  <div class="filters-container">
    <div class="d-flex align-center" style="gap: 12px; flex-wrap: wrap;">
      <!-- Search Input -->
      <div class="search-input-wrapper">
        <v-text-field
          :model-value="searchQuery"
          @update:model-value="$emit('update:searchQuery', $event)"
          placeholder="Rechercher un produit..."
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="comfortable"
          hide-details
          rounded="xl"
          clearable
          class="filter-input"
        />
      </div>

      <!-- Filter Selects -->
      <v-select
        :model-value="selectedType"
        @update:model-value="$emit('update:selectedType', $event)"
        :items="typeOptions"
        placeholder="All Types"
        variant="outlined"
        density="comfortable"
        hide-details
        rounded="xl"
        clearable
        class="filter-select"
      >
        <template #prepend-inner>
          <v-icon size="18" color="#ff3131">mdi-shape</v-icon>
        </template>
      </v-select>

      <v-select
        :model-value="selectedCategory"
        @update:model-value="$emit('update:selectedCategory', $event)"
        :items="categoryOptions"
        placeholder="All Categories"
        variant="outlined"
        density="comfortable"
        hide-details
        rounded="xl"
        clearable
        class="filter-select"
      >
        <template #prepend-inner>
          <v-icon size="18" color="#ff3131">mdi-tag-multiple</v-icon>
        </template>
      </v-select>

      <v-select
        :model-value="selectedSupplier"
        @update:model-value="$emit('update:selectedSupplier', $event)"
        :items="supplierOptions"
        placeholder="All Suppliers"
        variant="outlined"
        density="comfortable"
        hide-details
        rounded="xl"
        clearable
        class="filter-select"
      >
        <template #prepend-inner>
          <v-icon size="18" color="#ff3131">mdi-truck</v-icon>
        </template>
      </v-select>

      <v-select
        :model-value="selectedSpace"
        @update:model-value="$emit('update:selectedSpace', $event)"
        :items="spaceOptions"
        placeholder="All Spaces"
        variant="outlined"
        density="comfortable"
        hide-details
        rounded="xl"
        clearable
        class="filter-select"
      >
        <template #prepend-inner>
          <v-icon size="18" color="#ff3131">mdi-map-marker</v-icon>
        </template>
      </v-select>
    </div>

    <!-- Results Count -->
    <div class="text-caption text-medium-emphasis mt-3 d-flex align-center">
      <v-icon size="16" class="me-1" color="#ff3131">mdi-package-variant</v-icon>
      <span class="font-weight-medium">{{ filteredCount }} produit{{ filteredCount > 1 ? 's' : '' }}</span>
    </div>
  </div>
</template>

<script>
export default {
  name: 'MarketPriceFilters',
  props: {
    searchQuery: {
      type: String,
      default: '',
    },
    selectedType: {
      type: String,
      default: null,
    },
    selectedCategory: {
      type: String,
      default: null,
    },
    selectedSupplier: {
      type: String,
      default: null,
    },
    selectedSpace: {
      type: String,
      default: null,
    },
    typeOptions: {
      type: Array,
      default: () => [],
    },
    categoryOptions: {
      type: Array,
      default: () => [],
    },
    supplierOptions: {
      type: Array,
      default: () => [],
    },
    spaceOptions: {
      type: Array,
      default: () => [],
    },
    filteredCount: {
      type: Number,
      default: 0,
    },
  },
  emits: ['update:searchQuery', 'update:selectedType', 'update:selectedCategory', 'update:selectedSupplier', 'update:selectedSpace'],
};
</script>

<style scoped>
.filters-container {
  width: 100%;
}

.search-input-wrapper {
  flex: 1;
  min-width: 300px;
}

.filter-select {
  min-width: 200px;
  flex-shrink: 0;
}

/* Filter Input Styling */
.filter-input :deep(.v-field),
.filter-select :deep(.v-field) {
  background: white !important;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;
}

/* Force BLACK text in filter inputs even in dark mode */
.filter-input :deep(input),
.filter-select :deep(input),
.filter-input :deep(.v-field__input),
.filter-select :deep(.v-field__input),
.filter-select :deep(.v-select__selection-text) {
  color: #000000 !important;
  -webkit-text-fill-color: #000000 !important;
}

.filter-input :deep(.v-field:hover),
.filter-select :deep(.v-field:hover) {
  box-shadow: 0 2px 6px rgba(255, 49, 49, 0.12);
  border-color: #ff3131;
}

.filter-input :deep(.v-field--focused),
.filter-select :deep(.v-field--focused) {
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1);
  border-color: #ff3131 !important;
}

.filter-input :deep(.v-field__input),
.filter-select :deep(.v-field__input) {
  padding: 10px 16px;
  font-size: 14px;
}

.filter-input :deep(.v-field__input::placeholder),
.filter-select :deep(.v-field__input::placeholder) {
  color: rgba(var(--v-theme-on-surface), 0.4);
  opacity: 1;
}

/* Prepend Icons */
.filter-input :deep(.v-field__prepend-inner),
.filter-select :deep(.v-field__prepend-inner) {
  padding-top: 0;
  align-items: center;
}

/* Clear Button */
.filter-input :deep(.v-field__clearable),
.filter-select :deep(.v-field__clearable) {
  opacity: 0.6;
  transition: opacity 0.2s ease;
}

.filter-input :deep(.v-field__clearable:hover),
.filter-select :deep(.v-field__clearable:hover) {
  opacity: 1;
}

/* Responsive */
@media (max-width: 1200px) {
  .filter-select {
    min-width: 180px;
  }
}

@media (max-width: 960px) {
  .search-input-wrapper {
    flex: 1 1 100%;
    min-width: 100%;
  }
  
  .filter-select {
    flex: 1 1 calc(50% - 6px);
    min-width: 0;
  }
}
</style>
