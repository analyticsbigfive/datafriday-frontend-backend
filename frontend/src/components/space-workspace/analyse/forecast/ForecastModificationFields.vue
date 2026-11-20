<template>
  <!-- Champs de la saisie selon le type de modification. Ne modifie rien : émet `patch`. -->
  <template v-if="type === TYPES.ITEM_PRICE">
    <ComparisonField
      :label="t('fcstItemLabel')"
      :for-id="`${uid}-target`"
      :hint="itemOptions.length ? '' : t('fcstNoOption')"
    >
      <ComparisonSelect
        :id="`${uid}-target`"
        :model-value="draft.target"
        :options="itemOptions"
        :empty-label="t('fcstItemPlaceholder')"
        :disabled-suffix="t('fcstItemNoPrice')"
        @update:model-value="(v) => emit('patch', { target: v })"
      />
    </ComparisonField>
    <ForecastPriceField
      :id="`${uid}-price`"
      :model-value="draft.value"
      :vat-rate="selectedItem ? selectedItem.vatRate : null"
      @update:model-value="(v) => emit('patch', { value: v })"
    />
  </template>
  <template v-else>
    <ComparisonField
      v-if="namedTarget"
      :label="t(namedTarget.labelKey)"
      :for-id="`${uid}-target`"
      :hint="namedTarget.options.length ? '' : t('fcstNoOption')"
    >
      <ComparisonSelect
        :id="`${uid}-target`"
        :model-value="draft.target"
        :options="namedTarget.options"
        :empty-label="t(namedTarget.placeholderKey)"
        @update:model-value="(v) => emit('patch', { target: v })"
      />
    </ComparisonField>
    <ComparisonField
      v-if="type === TYPES.PERCAP"
      :label="t('fcstPercapModeLabel')"
      :label-id="`${uid}-mode`"
    >
      <ForecastPercapMode
        :model-value="draft.mode"
        :name="`${uid}-mode`"
        :labelledby="`${uid}-mode`"
        @update:model-value="(v) => emit('patch', { mode: v })"
      />
    </ComparisonField>
    <ForecastPercentSlider
      :id="`${uid}-pct`"
      :label="t(sliderMeta.labelKey)"
      :model-value="Number(draft.value) || 0"
      :base="base"
      :unit="sliderMeta.unit"
      @update:model-value="(v) => emit('patch', { value: v })"
    />
  </template>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrencyDetailed } from '@/composables/useFormatters'
import { FORECAST_MODIFICATION_TYPES as TYPES } from '@/utils/forecastModificationModel'
import { SLIDER_META, baseValueFor } from '@/utils/forecastSliderMeta'
import ComparisonField from '../comparison/ComparisonField.vue'
import ComparisonSelect from '../comparison/ComparisonSelect.vue'
import ForecastPriceField from './ForecastPriceField.vue'
import ForecastPercapMode from './ForecastPercapMode.vue'
import ForecastPercentSlider from './ForecastPercentSlider.vue'

const props = defineProps({
  // Saisie en cours (draft du composable) : { type, target, value, mode }.
  draft: { type: Object, required: true },
  // Retour de forecastTargetOptions : { items, categories, types }.
  options: { type: Object, required: true },
  // { transformationRate, perCapita, basket } du rapport principal (nombres ou null).
  baseValues: { type: Object, default: null },
  // Préfixe des identifiants (labels liés aux champs).
  uid: { type: String, required: true },
})
const emit = defineEmits(['patch'])

const { t } = useI18n()

const type = computed(() => props.draft.type)
const sliderMeta = computed(() => SLIDER_META[type.value] || SLIDER_META[TYPES.BASKET])
const base = computed(() => baseValueFor(type.value, props.baseValues))

// Articles : prix TTC actuel dans le libellé ; sans prix catalogue, désactivé avec mention.
const itemOptions = computed(() => props.options.items.map((i) => ({
  value: i.id,
  label: i.priceable ? `${i.name} · ${formatCurrencyDetailed(i.currentTtc)}` : i.name,
  disabled: !i.priceable,
})))
const selectedItem = computed(() => props.options.items.find((i) => i.id === props.draft.target) || null)

const plain = (list) => list.map((name) => ({ value: name, label: name }))
const namedTarget = computed(() => {
  if (type.value === TYPES.CATEGORY_PCT) {
    return { labelKey: 'fcstCategoryLabel', placeholderKey: 'fcstCategoryPlaceholder', options: plain(props.options.categories) }
  }
  if (type.value === TYPES.TYPE_PCT) {
    return { labelKey: 'fcstTypeNameLabel', placeholderKey: 'fcstTypeNamePlaceholder', options: plain(props.options.types) }
  }
  return null
})
</script>
