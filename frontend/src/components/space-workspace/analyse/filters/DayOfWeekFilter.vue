<template>
  <!-- Filtre avancé « Jour de la semaine » (Lun..Dim, lundi en premier) : liste à
       cases partagée, libellés courts traduits, compteurs = events par jour. -->
  <CheckboxListFilter
    :label="t('anDaysOfWeek')"
    :items="DAY_KEYS"
    :model-value="modelValue"
    :counts="counts"
    :label-fn="dayLabel"
    @update:model-value="(v) => emit('update:modelValue', v)"
  />
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import { DAY_KEYS, DAY_LABEL_KEYS } from '@/utils/eventDayWeatherFilters'
import CheckboxListFilter from './CheckboxListFilter.vue'

defineProps({
  modelValue: { type: Array, default: () => [] },
  // Map clé de jour -> nombre d'events du périmètre.
  counts: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue'])

const { t } = useI18n()
const dayLabel = (key) => t(DAY_LABEL_KEYS[key] || key)
</script>
