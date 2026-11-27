<template>
  <!-- Barres KPI en cours de sélection : valider (au moins une pastille) ou annuler. -->
  <span v-if="visible && selecting" class="rj1-add-pair">
    <v-badge
      :content="chips.picked.value.length"
      :model-value="chips.picked.value.length > 0"
      color="primary"
      floating
      class="rj1-add-badge"
    >
      <v-btn
        icon
        size="x-small"
        variant="tonal"
        color="primary"
        class="rj1-add"
        :disabled="!chips.canConfirm.value"
        :aria-label="t('rj1SelectConfirm')"
        :title="t('rj1SelectConfirm')"
        @click.stop="chips.confirm(props.label)"
      >
        <v-icon size="16">mdi-check</v-icon>
      </v-btn>
    </v-badge>
    <v-btn
      icon
      size="x-small"
      variant="text"
      class="rj1-add"
      :aria-label="t('rj1SelectCancel')"
      :title="t('rj1SelectCancel')"
      @click.stop="chips.cancel()"
    >
      <v-icon size="16">mdi-close</v-icon>
    </v-btn>
  </span>
  <v-tooltip v-else-if="visible" location="top">
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
// AnalyseView (pour les barres KPI : après choix des pastilles). Masquée en comparaison, en Predict, en lecture seule, ou hors AnalyseView.
import { computed } from 'vue'
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'
import { injectReportJ1Placement } from '@/composables/useReportJ1Placement'
import { injectReportJ1ChipSelection } from '@/composables/useReportJ1ChipSelection'
import { isChipKind } from '@/utils/reportJ1Chips'

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
const chips = injectReportJ1ChipSelection()

const visible = computed(
  () =>
    !!placement &&
    !props.readonly &&
    !store.state.analyse.filters.comparisonMode &&
    store.state.analyse.selectedToolbox !== 'predict',
)

// Barres KPI : le « + » lance le choix des pastilles avant d'ouvrir le drawer.
const selecting = computed(() => !!chips && isChipKind(props.kind) && chips.isActive(props.kind))

function onAdd() {
  if (chips && isChipKind(props.kind)) {
    chips.start(props.kind)
    return
  }
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
.rj1-add-pair { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.rj1-add-badge :deep(.v-badge__badge) { font-size: var(--fs-xs); font-weight: var(--fw-semibold); }
.rj1-add:hover { color: rgb(var(--v-theme-primary)); }
</style>
