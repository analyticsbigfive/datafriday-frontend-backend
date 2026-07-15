<template>
  <div
    class="location-list-item rounded-lg mb-2 pa-3"
    :class="stateClass"
    @click="$emit('open-wizard')"
  >
    <div class="d-flex align-center">
      <!-- State icon -->
      <v-icon :color="stateColor" size="22" class="mr-3 flex-shrink-0">{{ stateIcon }}</v-icon>

      <!-- Main info -->
      <div class="flex-grow-1 min-width-0">
        <div class="d-flex align-center mb-1">
          <span class="text-body-2 font-weight-bold text-truncate">
            {{ location.name || location.label || `${t('intgLocationFallback')} ${location.id}` }}
          </span>
          <v-chip size="x-small" :color="stateColor" variant="tonal" class="ml-2 flex-shrink-0">
            {{ completedSteps }}/5
          </v-chip>
        </div>

        <!-- Space name or hint -->
        <div class="text-caption text-medium-emphasis mb-2">
          <template v-if="mapping">
            <v-icon size="11" color="success" class="mr-1">mdi-link-variant</v-icon>
            <span class="font-weight-medium">{{ t('intgLocationSpace') }}</span> {{ mapping.spaceName || mapping.spaceId }}
          </template>
          <template v-else>
            <v-icon size="11" color="grey" class="mr-1">mdi-alert-circle-outline</v-icon>
            {{ t('intgLocationNoSpace') }}
          </template>
        </div>

        <!-- Progress bar -->
        <v-progress-linear
          :model-value="progressPercent"
          :color="stateColor"
          bg-color="grey-lighten-3"
          height="4"
          rounded
        />
      </div>

      <!-- CTA button -->
      <v-btn
        :color="buttonConfig.color"
        :variant="buttonConfig.variant"
        size="small"
        :append-icon="buttonConfig.icon"
        rounded="lg"
        class="ml-3 flex-shrink-0"
        @click.stop="$emit('open-wizard')"
      >
        {{ buttonConfig.label }}
      </v-btn>
    </div>
  </div>
</template>

<script>
import { t as translate } from '@/i18n'

export default {
  name: 'LocationListItem',
  props: {
    location: { type: Object, required: true },
    mapping: { type: Object, default: null },
    progress: { type: Object, default: () => ({ completedSteps: 0, totalSteps: 5 }) },
  },
  emits: ['open-wizard'],
  data() {
    return { locale: localStorage.getItem('appLocale') || 'en' }
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
  },
  computed: {
    completedSteps() {
      return this.progress?.completedSteps || 0
    },
    progressPercent() {
      return (this.completedSteps / 5) * 100
    },
    // 3 visual states: complete / in-progress / not-started
    stateColor() {
      if (this.completedSteps === 5) return 'success'
      if (this.completedSteps > 0) return 'warning'
      return 'grey'
    },
    stateIcon() {
      if (this.completedSteps === 5) return 'mdi-check-circle'
      if (this.completedSteps > 0) return 'mdi-progress-clock'
      return 'mdi-circle-outline'
    },
    stateClass() {
      if (this.completedSteps === 5) return 'location-list-item--complete'
      if (this.completedSteps > 0) return 'location-list-item--partial'
      return 'location-list-item--empty'
    },
    buttonConfig() {
      const steps = this.completedSteps
      if (steps === 0) {
        return { label: this.t('intgLocationBtnConfigure'), color: 'primary', variant: 'flat', icon: 'mdi-arrow-right' }
      }
      if (steps < 5) {
        return { label: this.t('intgLocationBtnContinue'), color: 'warning', variant: 'tonal', icon: 'mdi-arrow-right' }
      }
      return { label: this.t('intgLocationBtnDetails'), color: 'success', variant: 'tonal', icon: 'mdi-chevron-right' }
    },
  },
}
</script>

<style scoped>
.location-list-item {
  cursor: pointer;
  border: 1px solid transparent;
  transition: all 0.18s ease;
}

.location-list-item:hover {
  transform: translateX(3px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.location-list-item--complete {
  background-color: rgba(76, 175, 80, 0.07);
  border-color: rgba(76, 175, 80, 0.2);
}

.location-list-item--partial {
  background-color: rgba(255, 152, 0, 0.07);
  border-color: rgba(255, 152, 0, 0.2);
}

.location-list-item--empty {
  background-color: rgba(0, 0, 0, 0.03);
  border-color: rgba(0, 0, 0, 0.08);
}

.min-width-0 {
  min-width: 0;
}
</style>
