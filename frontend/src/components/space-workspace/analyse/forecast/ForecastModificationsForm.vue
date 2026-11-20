<template>
  <form class="cf-form fc-form" novalidate :aria-label="t('fcstFormLabel')" @submit.prevent="onAdd">
    <p class="fc-recap">{{ t('fcstIntro') }}</p>

    <ComparisonField :label="t('fcstTypeLabel')" :for-id="`${uid}-type`">
      <ComparisonSelect
        :id="`${uid}-type`"
        :model-value="form.draft.type"
        :options="typeOptions"
        @update:model-value="form.setType"
      />
    </ComparisonField>

    <ForecastModificationFields
      :uid="uid"
      :draft="form.draft"
      :options="form.options.value"
      :base-values="baseValues"
      @patch="form.patch"
    />

    <button type="button" class="fc-add" :disabled="!form.canAdd.value" @click="onAdd">
      <v-icon size="18" aria-hidden="true">mdi-plus</v-icon>{{ t('fcstAdd') }}
    </button>

    <ForecastModificationList
      :items="form.list.value"
      :options="form.options.value"
      :replaced="form.replaced.value"
      @remove="form.remove"
    />

    <ForecastElasticityField
      v-if="form.hasPriceModification.value"
      :id="`${uid}-elasticity`"
      :model-value="form.elasticity.value"
      @update:model-value="form.setElasticity"
    />

    <ForecastFormFooter
      :can-apply="form.canApply.value"
      :can-clear="form.list.value.length > 0"
      :has-report="hasReport"
      @clear="form.clear"
      @back="emit('back')"
      @apply="onApply"
    />
  </form>
</template>

<script setup>
// Formulaire de modifications de l'outil Forecast (drawer Comparaison). Assemble les champs ;
// toute la logique est dans useForecastModificationsForm (reçu en prop : le brouillon survit à
// la fermeture du drawer). Émet `run` avec { kind: 'forecast', modifications, elasticity } (copie).
import { computed, getCurrentInstance } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { FORECAST_MODIFICATION_TYPES } from '@/utils/forecastModificationModel'
import { FORECAST_TYPE_LABEL_KEYS } from '@/utils/forecastModificationLabels'
import ComparisonField from '../comparison/ComparisonField.vue'
import ComparisonSelect from '../comparison/ComparisonSelect.vue'
import ForecastModificationFields from './ForecastModificationFields.vue'
import ForecastModificationList from './ForecastModificationList.vue'
import ForecastFormFooter from './ForecastFormFooter.vue'
import ForecastElasticityField from './ForecastElasticityField.vue'

const props = defineProps({
  // Retour de useForecastModificationsForm.
  form: { type: Object, required: true },
  // { transformationRate, perCapita, basket } du rapport principal (nombres ou null).
  baseValues: { type: Object, default: null },
  // Un rapport existe : « Retour au rapport » devient visible.
  hasReport: { type: Boolean, default: false },
})
const emit = defineEmits(['run', 'back'])

const { t } = useI18n()
const uid = `fc-form-${getCurrentInstance().uid}`

const typeOptions = computed(() => Object.values(FORECAST_MODIFICATION_TYPES).map((value) => ({
  value,
  label: t(FORECAST_TYPE_LABEL_KEYS[value]),
})))

// Entrée dans un champ ou clic sur « Ajouter » : ajoute la saisie à la liste.
function onAdd() {
  props.form.add()
}
function onApply() {
  if (!props.form.canApply.value) return
  emit('run', props.form.toRunModel())
}
</script>

<style scoped>
.fc-form {
  /* Mêmes jetons que ComparisonForm (fond, bordures, violet de la comparaison, rouge du bouton
     principal), clair puis sombre : le formulaire Forecast a le même aspect. */
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
.v-theme--dataFridayDark .fc-form {
  --cf-cmp: #b79bff;
  --cf-cmp-bg: rgba(183, 155, 255, 0.14);
  --cf-cmp-line: rgba(183, 155, 255, 0.35);
  --cf-cmp-on: #1b1030;
  --cf-warn: #f2c46b;
  --cf-warn-bg: #33270f;
  --cf-band: #c62828;
  --cf-neutral: #94a3b8;
}
.fc-recap {
  margin: 0 0 0.875rem;
  font-size: var(--fs-sm);
  line-height: 1.4;
  color: var(--cf-muted);
}
.fc-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  align-self: flex-start;
  min-height: 2.5rem;
  box-sizing: border-box;
  margin-bottom: 1.25rem;
  padding: 0 1.125rem;
  border: 1px solid var(--cf-cmp-line);
  border-radius: 10px;
  background: var(--cf-cmp-bg);
  color: var(--cf-cmp);
  font: inherit;
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
.fc-add:hover:not(:disabled) { border-color: var(--cf-cmp); }
.fc-add:disabled { opacity: 0.5; cursor: not-allowed; }
.fc-add:focus-visible {
  outline: 2px solid var(--cf-cmp);
  outline-offset: 2px;
}
@media (max-width: 900px) {
  .fc-add { align-self: stretch; min-height: 2.75rem; }
}
</style>
