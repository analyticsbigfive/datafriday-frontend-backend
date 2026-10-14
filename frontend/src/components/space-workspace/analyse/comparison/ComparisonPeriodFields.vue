<template>
  <div>
    <ComparisonField
      :label="t('anCmpPeriodLabel')"
      :for-id="`${uid}-period`"
      :hint="hint"
      :hint-id="`${uid}-period-hint`"
    >
      <ComparisonSelect
        :id="`${uid}-period`"
        :model-value="period"
        :groups="groups"
        :disabled-suffix="t('anCmpUnavailable')"
        :describedby="hint ? `${uid}-period-hint` : undefined"
        @update:model-value="(v) => emit('update:period', v)"
      />
    </ComparisonField>

    <div v-if="period === 'custom'" class="cf-row2">
      <ComparisonField :label="t('anCmpDateFrom')" :for-id="`${uid}-from`">
        <input
          :id="`${uid}-from`"
          class="cf-date"
          type="date"
          :value="from"
          :max="to || undefined"
          @input="emit('update:from', $event.target.value)"
        />
      </ComparisonField>
      <ComparisonField :label="t('anCmpDateTo')" :for-id="`${uid}-to`">
        <input
          :id="`${uid}-to`"
          class="cf-date"
          type="date"
          :value="to"
          :min="from || undefined"
          @input="emit('update:to', $event.target.value)"
        />
      </ComparisonField>
    </div>
  </div>
</template>

<script setup>
// Champ « Période de comparaison » : liste groupée (raccourcis, saisons, presets,
// personnalisée), dates résolues sous le champ et dates Du / Au en mode personnalisé.
import { getCurrentInstance } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import ComparisonField from './ComparisonField.vue'
import ComparisonSelect from './ComparisonSelect.vue'

defineProps({
  period: { type: String, default: 'custom' },
  from: { type: String, default: '' },
  to: { type: String, default: '' },
  // Options groupées (utils/comparisonFormModel.periodOptionGroups).
  groups: { type: Array, default: () => [] },
  // Dates résolues affichées sous le champ.
  hint: { type: String, default: '' },
})
const emit = defineEmits(['update:period', 'update:from', 'update:to'])

const { t } = useI18n()
const uid = `cf-per-${getCurrentInstance().uid}`
</script>

<style scoped>
.cf-row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.cf-date {
  width: 100%;
  height: 38px;
  box-sizing: border-box;
  padding: 0 12px;
  border: 1px solid var(--cf-line);
  border-radius: 10px;
  background: var(--cf-surface);
  color: var(--cf-fg);
  font: inherit;
  font-size: var(--fs-md);
  color-scheme: light;
}
.v-theme--dataFridayDark .cf-date { color-scheme: dark; }
.cf-date:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 1px;
}
@media (max-width: 900px) {
  .cf-date { height: 44px; }
}
</style>
