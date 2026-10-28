<template>
  <v-tooltip v-if="visible" location="top">
    <template #activator="{ props: tipProps }">
      <v-btn
        v-bind="tipProps"
        icon
        size="x-small"
        variant="text"
        class="rj1-add"
        :aria-label="t('rj1AddTooltip')"
        @click.stop="onAdd"
      >
        <v-icon size="16">mdi-plus</v-icon>
      </v-btn>
    </template>
    {{ t('rj1AddTooltip') }}
  </v-tooltip>
</template>

<script setup>
// Petite icône « + » : ajoute l'élément au rapport J+1 (page 2). Elle émet l'intention
// {kind, variant, label, options} et la transmet au composable de placement fourni par
// AnalyseView. Masquée en comparaison, en Predict, en lecture seule, ou hors AnalyseView.
import { computed } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { injectReportJ1Placement } from '@/composables/useReportJ1Placement'

const props = defineProps({
  kind: { type: String, required: true },
  variant: { type: String, default: null },
  // Libellé affiché dans le drawer et dans le rapport (titre déjà traduit de l'élément).
  label: { type: String, default: '' },
  options: { type: Object, default: null },
  readonly: { type: Boolean, default: false },
})
const emit = defineEmits(['add'])

const { t } = useI18n()
const store = useStore()
const placement = injectReportJ1Placement()

const visible = computed(
  () =>
    !!placement &&
    !props.readonly &&
    !store.state.analyse.filters.comparisonMode &&
    store.state.analyse.selectedToolbox !== 'predict',
)

function onAdd() {
  const intent = { kind: props.kind, variant: props.variant, label: props.label, options: props.options }
  emit('add', intent)
  placement?.request(intent)
}
</script>

<style scoped>
.rj1-add {
  flex: none;
  color: rgba(var(--v-theme-on-surface), 0.55);
}
.rj1-add:hover { color: rgb(var(--v-theme-primary)); }
</style>
