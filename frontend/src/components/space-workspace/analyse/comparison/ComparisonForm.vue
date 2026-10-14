<template>
  <form class="cf-form" novalidate @submit.prevent="onRun">
    <p class="cf-recap">{{ recap }}</p>

    <ComparisonField
      :label="t('anCmpKindLabel')"
      :for-id="`${uid}-kind`"
      :title="predictTooltip"
    >
      <ComparisonSelect
        :id="`${uid}-kind`"
        :model-value="form.model.kind"
        :options="kindOptions"
        @update:model-value="form.setKind"
      />
    </ComparisonField>

    <!-- Champs propres au type de comparaison. En mode Predict ils sont remplacés par
         l'encart d'information : les autres champs ne sont ni modifiables ni atteignables. -->
    <ComparisonPredictNotice
      v-if="isPredict"
      :checking="form.predict.checking.value"
      :covered-count="form.predict.coveredCount.value"
      :total="form.predict.total.value"
    />
    <ComparisonPeriodFields
      v-else-if="form.model.kind === 'period'"
      :period="form.model.period"
      :from="form.model.from"
      :to="form.model.to"
      :groups="form.periodGroups.value"
      :hint="form.periodHint.value"
      @update:period="(v) => form.patch({ period: v })"
      @update:from="(v) => form.patch({ from: v })"
      @update:to="(v) => form.patch({ to: v })"
    />
    <ComparisonCategoryFields
      v-else-if="form.model.kind === 'category'"
      :type="form.taxonomy.value.selection.type"
      :category="form.taxonomy.value.selection.category"
      :subcategory="form.taxonomy.value.selection.subcategory"
      :options="form.taxonomy.value.options"
      @change="form.changeTaxonomy"
    />
    <ComparisonEventPicker
      v-else-if="form.model.kind === 'event'"
      :model-value="form.model.eventIds"
      :options="form.eventOptions.value"
      @update:model-value="(v) => form.patch({ eventIds: v })"
    />

    <details
      class="cf-opt"
      :class="{ 'cf-opt--off': isPredict }"
      :open="advOpen"
      @toggle="advOpen = $event.target.open"
    >
      <summary class="cf-opt__sum" :tabindex="isPredict ? -1 : undefined" :aria-disabled="isPredict ? 'true' : undefined">
        <v-icon size="18" aria-hidden="true">mdi-tune-variant</v-icon>
        <span>{{ t('anCmpAdvanced') }}</span>
        <span
          class="cf-opt__cnt"
          :aria-label="t('anCmpAdvancedCountAria').replace('{n}', String(form.advancedActiveCount.value))"
        >{{ form.advancedActiveCount.value }}</span>
      </summary>
      <fieldset class="cf-opt__inner" :disabled="isPredict">
        <ComparisonAdvancedFields
          :days="form.model.selectedDaysOfWeek"
          :doors="form.model.selectedDoorsOpenings"
          :show="form.model.selectedShowTimes"
          :weather="form.model.selectedWeather"
          :temperature="form.model.temperatureRange"
          :doors-options="form.doorsOptions.value"
          :show-options="form.showOptions.value"
          @update:days="(v) => form.patch({ selectedDaysOfWeek: v })"
          @update:doors="(v) => form.patch({ selectedDoorsOpenings: v })"
          @update:show="(v) => form.patch({ selectedShowTimes: v })"
          @update:weather="(v) => form.patch({ selectedWeather: v })"
          @update:temperature="(v) => form.patch({ temperatureRange: v })"
        />
      </fieldset>
    </details>

    <ComparisonFormFooter
      :main-count="form.mainCount.value"
      :comparison-count="form.comparisonCount.value"
      :alerts="form.alerts.value"
      :can-run="form.canRun.value"
      :has-report="hasReport"
      @reset="form.reset"
      @back="emit('back')"
      @run="onRun"
    />
  </form>
</template>

<script setup>
// Formulaire de comparaison (drawer Analyse). Assemble les champs ; toute la logique est dans
// useComparisonForm (reçu en prop : le formulaire ne lit jamais le store des filtres du principal).
// Émet `run` avec une copie profonde du modèle (forme attendue par useComparisonReport).
import { computed, getCurrentInstance, ref } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { KIND_LABEL_KEYS, COMPARISON_KINDS } from '@/utils/comparisonFormModel'
import ComparisonField from './ComparisonField.vue'
import ComparisonSelect from './ComparisonSelect.vue'
import ComparisonPredictNotice from './ComparisonPredictNotice.vue'
import ComparisonPeriodFields from './ComparisonPeriodFields.vue'
import ComparisonCategoryFields from './ComparisonCategoryFields.vue'
import ComparisonEventPicker from './ComparisonEventPicker.vue'
import ComparisonAdvancedFields from './ComparisonAdvancedFields.vue'
import ComparisonFormFooter from './ComparisonFormFooter.vue'

const props = defineProps({
  // Retour de useComparisonForm.
  form: { type: Object, required: true },
  // Un rapport existe : « Retour au rapport » devient visible.
  hasReport: { type: Boolean, default: false },
})
const emit = defineEmits(['run', 'back'])

const { t } = useI18n()
const uid = `cf-form-${getCurrentInstance().uid}`

const isPredict = computed(() => props.form.model.kind === 'predict')
const advOpen = ref(props.form.advancedActiveCount.value > 0)

const recap = computed(() => t('anCmpMainRecap')
  .replace('{summary}', props.form.mainSummary.value.join(' · '))
  .replace('{n}', String(props.form.mainCount.value)))

// Predict : grisé pendant la vérification (mention discrète), puis actif ou désactivé.
const kindOptions = computed(() => COMPARISON_KINDS.map((value) => {
  let label = t(KIND_LABEL_KEYS[value])
  let disabled = false
  if (value === 'predict' && !props.form.predict.available.value) {
    disabled = true
    label += props.form.predict.checking.value ? ` (${t('anCmpPredictChecking')})` : ` (${t('anCmpUnavailable')})`
  }
  return { value, label, disabled }
}))
const predictTooltip = computed(() => (
  !props.form.predict.available.value && !props.form.predict.checking.value
    ? t('anCmpPredictNoScenario')
    : undefined
))

function onRun() {
  if (!props.form.canRun.value) return
  emit('run', props.form.toRunModel())
}
</script>

<style scoped>
.cf-form {
  /* Jetons du formulaire (hérités par les champs enfants), clair puis sombre. */
  --cf-bg: rgb(var(--v-theme-background));
  --cf-surface: rgb(var(--v-theme-surface));
  --cf-surface2: rgba(var(--v-theme-on-surface), 0.05);
  --cf-line: rgba(var(--v-border-color), var(--v-border-opacity));
  --cf-fg: rgb(var(--v-theme-on-surface));
  --cf-muted: rgba(var(--v-theme-on-surface), 0.62);
  --cf-faint: rgba(var(--v-theme-on-surface), 0.42);
  --cf-cmp: #7c3aed;
  --cf-cmp-bg: #f3edff;
  --cf-cmp-line: #d8c8fb;
  --cf-cmp-on: #ffffff;
  --cf-warn: #8a5a00;
  --cf-warn-bg: #fff7e6;
  --cf-band: #ff3131;
  --cf-neutral: #64748b;
  display: flex;
  flex-direction: column;
  min-height: 100%;
  color: var(--cf-fg);
  font-size: var(--fs-md);
}
.v-theme--dataFridayDark .cf-form {
  --cf-cmp: #b79bff;
  --cf-cmp-bg: rgba(183, 155, 255, 0.14);
  --cf-cmp-line: rgba(183, 155, 255, 0.35);
  --cf-cmp-on: #1b1030;
  --cf-warn: #f2c46b;
  --cf-warn-bg: #33270f;
  --cf-band: #c62828;
  --cf-neutral: #94a3b8;
}
.cf-recap {
  margin: 0 0 14px;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--cf-muted);
}
.cf-opt {
  margin-bottom: 14px;
  border-radius: 12px;
  background: var(--cf-surface2);
}
.cf-opt--off {
  opacity: 0.42;
  pointer-events: none;
}
.cf-opt__sum {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  box-sizing: border-box;
  padding: 0 14px;
  font-size: var(--fs-base);
  font-weight: var(--fw-medium);
  list-style: none;
  cursor: pointer;
}
.cf-opt__sum::-webkit-details-marker { display: none; }
.cf-opt__sum:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 2px;
  border-radius: 12px;
}
.cf-opt__cnt {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 99px;
  font-size: var(--fs-xs);
  color: var(--cf-cmp);
  background: var(--cf-cmp-bg);
  font-variant-numeric: tabular-nums;
}
.cf-opt__inner {
  min-width: 0;
  margin: 0;
  padding: 2px 14px 4px;
  border: 0;
}
@media (max-width: 900px) {
  .cf-opt__sum { min-height: 44px; }
}
</style>
