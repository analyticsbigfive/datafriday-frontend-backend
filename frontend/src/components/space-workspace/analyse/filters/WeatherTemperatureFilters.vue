<template>
  <!-- Filtres avancés « Météo à l'heure du show » (catégories, pictogrammes mdi) et
       « Température à l'heure du show » (plage °C). Un event sans donnée est exclu
       quand le filtre est actif : la mention sous chaque champ dit combien. -->
  <div class="wtf" :class="{ 'wtf--dark': isDark }">
    <CheckboxListFilter
      :label="t('anWeatherAtShow')"
      :items="WEATHER_CATEGORIES"
      :model-value="selectedWeather"
      :counts="weatherCounts"
      :label-fn="weatherLabel"
      :icon-fn="weatherIcon"
      @update:model-value="(v) => emit('update:selectedWeather', v)"
    />
    <div class="wtf-sub">{{ t('anWeatherAvailableD1') }}</div>
    <div v-if="missing.weather > 0" class="wtf-missing" role="status">
      {{ t('anEventsWithoutWeather').replace('{n}', String(missing.weather)) }}
    </div>

    <div class="range-label mt-3">{{ t('anTempAtShow') }}</div>
    <v-range-slider
      :model-value="temperatureRange"
      :min="TEMPERATURE_MIN"
      :max="TEMPERATURE_MAX"
      :step="1"
      strict
      hide-details
      thumb-label
      color="#ff3131"
      track-color="grey-lighten-3"
      :aria-label="t('anTempAtShow')"
      @update:model-value="(v) => emit('update:temperatureRange', v)"
    />
    <div class="range-values">
      <span>{{ temperatureRange[0] }} °C</span>
      <span>{{ temperatureRange[1] }} °C</span>
    </div>
    <div v-if="missing.temperature > 0" class="wtf-missing" role="status">
      {{ t('anEventsWithoutTemperature').replace('{n}', String(missing.temperature)) }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'
import {
  WEATHER_CATEGORIES,
  WEATHER_LABEL_KEYS,
  WEATHER_ICONS,
  TEMPERATURE_MIN,
  TEMPERATURE_MAX,
} from '@/utils/eventDayWeatherFilters'
import CheckboxListFilter from './CheckboxListFilter.vue'

defineProps({
  selectedWeather: { type: Array, default: () => [] },
  temperatureRange: { type: Array, default: () => [TEMPERATURE_MIN, TEMPERATURE_MAX] },
  // Map catégorie -> nombre d'events du périmètre.
  weatherCounts: { type: Object, default: null },
  // Events du périmètre sans donnée, exclus : { weather, temperature }.
  missing: { type: Object, default: () => ({ weather: 0, temperature: 0 }) },
})
const emit = defineEmits(['update:selectedWeather', 'update:temperatureRange'])

const { t } = useI18n()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)
const weatherLabel = (cat) => t(WEATHER_LABEL_KEYS[cat] || cat)
const weatherIcon = (cat) => WEATHER_ICONS[cat] || null
</script>

<style scoped>
.wtf-sub {
  margin: -6px 0 6px;
  font-size: var(--fs-sm);
  color: #9ca3af;
}
.wtf-missing {
  margin: 2px 0 6px;
  font-size: var(--fs-sm);
  font-style: italic;
  color: #b45309;
}
.range-label {
  font-size: var(--fs-xs);
  font-weight: 700;
  color: #ff3131;
  text-transform: uppercase;
  letter-spacing: 0.6px;
  margin-bottom: 6px;
}
.range-values {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: var(--fs-base);
  font-weight: 700;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
}
.wtf--dark .wtf-sub { color: #94a3b8; }
.wtf--dark .wtf-missing { color: #fbbf24; }
.wtf--dark .range-values { color: #e2e8f0; }
</style>
