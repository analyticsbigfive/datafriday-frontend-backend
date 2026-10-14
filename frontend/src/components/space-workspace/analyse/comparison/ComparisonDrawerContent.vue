<template>
  <!-- Contenu du drawer Comparaison : aiguille selon la vue (form | loading | ready | error). -->
  <ComparisonForm
    v-if="comparison.view.value === 'form'"
    :form="form"
    :has-report="!!comparison.applied.value"
    @run="comparison.run($event)"
    @back="comparison.backToReport()"
  />
  <ComparisonLoading
    v-else-if="comparison.view.value === 'loading'"
    :progress="runtime.progress.value"
  />
  <ComparisonError
    v-else-if="comparison.view.value === 'error'"
    :message="runtime.error.value || ''"
    @retry="runtime.retry()"
    @edit="comparison.showForm()"
  />
  <ComparisonEmpty
    v-else-if="runtime.state.value === 'empty'"
    @edit="comparison.showForm()"
  />
  <ComparisonReport
    v-else-if="runtime.state.value === 'ready'"
    :runtime="runtime"
    :comparison="comparison"
    :exporting="exporting"
    :copying="copying"
    :sharing="sharing"
    @export-csv="emit('export-csv')"
    @copy="emit('copy')"
    @share="emit('share')"
  />
  <ComparisonLoading v-else :progress="runtime.progress.value" />
</template>

<script setup>
import ComparisonForm from './ComparisonForm.vue'
import ComparisonLoading from './ComparisonLoading.vue'
import ComparisonError from './ComparisonError.vue'
import ComparisonEmpty from './ComparisonEmpty.vue'
import ComparisonReport from './ComparisonReport.vue'

defineProps({
  // États des actions du bandeau (spinner et bouton inactif).
  exporting: { type: Boolean, default: false },
  copying: { type: Boolean, default: false },
  sharing: { type: Boolean, default: false },
  // Retour de useComparisonDrawer (vue, modèle appliqué, actions).
  comparison: { type: Object, required: true },
  // Retour de useComparisonForm (brouillon et calculs du formulaire).
  form: { type: Object, required: true },
  // Retour de useComparisonRuntime (état du rapport, écarts, moteur).
  runtime: { type: Object, required: true },
})
// Export CSV, copie et partage : relayés au parent (AnalyseView).
const emit = defineEmits(['export-csv', 'copy', 'share'])

</script>
