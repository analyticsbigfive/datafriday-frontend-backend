<template>
  <div class="cf-adv">
    <ComparisonField :label="t('anDaysOfWeek')" :label-id="`${uid}-days`">
      <ComparisonChipGroup
        :items="dayItems"
        :model-value="days"
        :labelledby="`${uid}-days`"
        @update:model-value="(v) => emit('update:days', v)"
      />
    </ComparisonField>

    <ComparisonField :label="t('anCmpDoors')" :label-id="`${uid}-doors`">
      <ComparisonChipGroup
        :items="toItems(doorsOptions)"
        :model-value="doors"
        :labelledby="`${uid}-doors`"
        :empty-text="t('anCmpNoOption')"
        @update:model-value="(v) => emit('update:doors', v)"
      />
    </ComparisonField>

    <ComparisonField :label="t('anCmpShowTime')" :label-id="`${uid}-show`">
      <ComparisonChipGroup
        :items="toItems(showOptions)"
        :model-value="show"
        :labelledby="`${uid}-show`"
        :empty-text="t('anCmpNoOption')"
        @update:model-value="(v) => emit('update:show', v)"
      />
    </ComparisonField>

    <ComparisonField
      :label="t('anWeatherAtShow')"
      :label-id="`${uid}-weather`"
      :hint="t('anWeatherAvailableD1')"
    >
      <ComparisonChipGroup
        :items="weatherItems"
        :model-value="weather"
        :labelledby="`${uid}-weather`"
        @update:model-value="(v) => emit('update:weather', v)"
      />
    </ComparisonField>

    <div class="cf-temp">
      <div class="cf-temp__head">
        <span :id="`${uid}-temp`" class="cf-temp__lab">{{ t('anTempAtShow') }}</span>
        <b class="cf-temp__val" aria-live="polite">{{ tempText }}</b>
      </div>
      <div class="cf-temp__range" role="group" :aria-labelledby="`${uid}-temp`">
        <input
          type="range"
          :min="TEMPERATURE_MIN"
          :max="TEMPERATURE_MAX"
          step="1"
          :value="temperature[0]"
          :aria-label="t('anCmpTempMinAria')"
          @input="onMin($event.target.value)"
        />
        <input
          type="range"
          :min="TEMPERATURE_MIN"
          :max="TEMPERATURE_MAX"
          step="1"
          :value="temperature[1]"
          :aria-label="t('anCmpTempMaxAria')"
          @input="onMax($event.target.value)"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
// Filtres avancés facultatifs du formulaire de comparaison : jours, portes, show, météo,
// température. Mêmes constantes, libellés et pictogrammes que le panneau de filtres du
// principal (utils/eventDayWeatherFilters), mais présentation en puces et AUCUN accès au store.
import { computed, getCurrentInstance } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import {
  DAY_KEYS,
  DAY_LABEL_KEYS,
  WEATHER_CATEGORIES,
  WEATHER_LABEL_KEYS,
  WEATHER_ICONS,
  TEMPERATURE_MIN,
  TEMPERATURE_MAX,
  isTemperatureFilterActive,
} from '@/utils/eventDayWeatherFilters'
import ComparisonField from './ComparisonField.vue'
import ComparisonChipGroup from './ComparisonChipGroup.vue'

const props = defineProps({
  days: { type: Array, default: () => [] },
  doors: { type: Array, default: () => [] },
  show: { type: Array, default: () => [] },
  weather: { type: Array, default: () => [] },
  temperature: { type: Array, default: () => [TEMPERATURE_MIN, TEMPERATURE_MAX] },
  // Valeurs proposées (heures distinctes des events analysables).
  doorsOptions: { type: Array, default: () => [] },
  showOptions: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:days', 'update:doors', 'update:show', 'update:weather', 'update:temperature'])

const { t } = useI18n()
const uid = `cf-adv-${getCurrentInstance().uid}`

const dayItems = computed(() => DAY_KEYS.map((k) => ({ value: k, label: t(DAY_LABEL_KEYS[k]) })))
const weatherItems = computed(() => WEATHER_CATEGORIES.map((k) => ({
  value: k,
  label: t(WEATHER_LABEL_KEYS[k]),
  icon: WEATHER_ICONS[k] || null,
})))
const toItems = (list) => (list || []).map((v) => ({ value: v, label: v }))

const tempText = computed(() => (
  isTemperatureFilterActive(props.temperature)
    ? t('anCmpTempRange').replace('{min}', String(props.temperature[0])).replace('{max}', String(props.temperature[1]))
    : t('anCmpTempAll')
))

// Les deux curseurs ne se croisent jamais.
function onMin(raw) {
  const v = Math.min(Number(raw), props.temperature[1])
  emit('update:temperature', [v, props.temperature[1]])
}
function onMax(raw) {
  const v = Math.max(Number(raw), props.temperature[0])
  emit('update:temperature', [props.temperature[0], v])
}
</script>

<style scoped>
.cf-temp { margin-bottom: 10px; min-width: 0; }
.cf-temp__head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 4px;
  font-size: var(--fs-sm);
  color: var(--cf-muted);
}
.cf-temp__lab { font-weight: var(--fw-medium); }
.cf-temp__val {
  font-weight: var(--fw-semibold);
  color: var(--cf-fg);
  font-variant-numeric: tabular-nums;
}
.cf-temp__range {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  align-items: center;
}
.cf-temp__range input[type='range'] {
  width: 100%;
  margin: 0;
  accent-color: var(--cf-cmp);
}
.cf-temp__range input[type='range']:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 2px;
}
</style>
