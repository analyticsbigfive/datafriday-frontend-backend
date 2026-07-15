<template>
  <v-card 
    variant="flat" 
    rounded="xl" 
    class="mb-4 overflow-hidden elevation-2"
  >
    <!-- Header with gradient background -->
    <div 
      class="pa-5"
      :style="{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }"
    >
      <div class="d-flex align-center">
        <v-avatar size="48" rounded="lg" class="mr-4 elevation-3" color="white">
          <v-img :src="provider.logo" :alt="provider.name" />
        </v-avatar>
        <div class="flex-grow-1">
          <h3 class="text-h5 font-weight-bold text-white mb-1">{{ provider.name }}</h3>
          <p class="text-body-2 text-white" style="opacity: 0.9">
            {{ t('intgProviderActive') }}
          </p>
        </div>
        <v-btn
          variant="flat"
          color="white"
          size="small"
          class="ml-2"
          :loading="syncing"
          prepend-icon="mdi-sync"
          @click="$emit('sync')"
        >
          {{ t('intgProviderSync') }}
        </v-btn>
        <v-btn
          variant="text"
          icon="mdi-close"
          size="small"
          class="ml-1 text-white"
          density="compact"
          @click="$emit('remove')"
        />
      </div>
    </div>

    <v-card-text class="pa-0">
      <!-- Loading state -->
      <div v-if="loading || syncing" class="pa-6">
        <div v-if="syncing" class="text-center py-6">
          <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
          <p class="text-body-1 font-weight-medium">{{ t('intgProviderImporting') }}</p>
          <p class="text-body-2 text-medium-emphasis">{{ t('intgProviderImportingHint') }}</p>
        </div>
        <v-skeleton-loader v-else type="list-item-two-line@3" />
      </div>

      <!-- Location expandable section -->
      <div v-else class="px-5 py-3 border-b">
        <button
          class="d-flex align-center justify-space-between w-100"
          style="background: none; border: none; cursor: pointer; width: 100%"
          @click="expanded = !expanded"
        >
          <span class="text-body-1 text-medium-emphasis">{{ t('intgProviderLocations') }}</span>
          <div class="d-flex align-center ga-2">
            <v-chip color="primary" variant="tonal" size="small" class="font-weight-bold">
              {{ locations.length }}
            </v-chip>
            <v-icon :class="{ 'rotate-180': expanded }" size="20" style="transition: transform 0.2s">
              mdi-chevron-down
            </v-icon>
          </div>
        </button>
      </div>

      <!-- Expanded Location List -->
      <template v-if="expanded && !loading && !syncing">
        <div v-if="!locations.length" class="text-center py-10 px-6">
          <v-icon size="56" color="grey-lighten-2" class="mb-3">mdi-database-off-outline</v-icon>
          <h4 class="text-h6 font-weight-medium mb-2">{{ t('intgProviderNoLocation') }}</h4>
          <p class="text-body-2 text-medium-emphasis mb-4">
            {{ t('intgProviderNoLocationHint') }}
          </p>
          <v-btn
            color="primary"
            variant="elevated"
            :loading="syncing"
            prepend-icon="mdi-cloud-download-outline"
            @click="$emit('sync')"
          >
            {{ t('intgProviderImportData') }}
          </v-btn>
        </div>

        <v-list v-else lines="two" density="comfortable" class="py-2">
          <LocationListItem
            v-for="loc in locations"
            :key="loc.id"
            :location="loc"
            :mapping="getMappingForLocation(loc.id)"
            :progress="getProgressForLocation(loc.id)"
            @open-wizard="$emit('open-wizard', loc)"
          />
        </v-list>
      </template>
    </v-card-text>
  </v-card>
</template>

<script>
import LocationListItem from './LocationListItem.vue'
import { t as translate } from '@/i18n'

export default {
  name: 'IntegrationProviderCard',
  components: { LocationListItem },
  props: {
    provider: { type: Object, required: true },
    locations: { type: Array, default: () => [] },
    mappings: { type: Array, default: () => [] },
    progressMap: { type: Object, default: () => ({}) },
    loading: { type: Boolean, default: false },
    syncing: { type: Boolean, default: false },
  },
  emits: ['open-wizard', 'sync', 'remove'],
  data() {
    return { expanded: true, locale: localStorage.getItem('appLocale') || 'en' }
  },
  mounted() {
    window.addEventListener('locale-changed', this.handleLocaleChange)
  },
  beforeUnmount() {
    window.removeEventListener('locale-changed', this.handleLocaleChange)
  },
  methods: {
    t(key) {
      return translate(key, this.locale)
    },
    handleLocaleChange(event) {
      this.locale = event.detail.locale
    },
    getMappingForLocation(locationId) {
      return this.mappings.find(m => m.weezeventLocationId === locationId) || null
    },
    getProgressForLocation(locationId) {
      return this.progressMap[locationId] || { completedSteps: 0, totalSteps: 5 }
    },
  },
}
</script>
