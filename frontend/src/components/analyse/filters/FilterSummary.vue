<template>
  <!-- Ligne 2 du bandeau : sélecteur de période + « Comparer à » + toggle
       Précédent / N-1. (Les tags des filtres actifs sont rendus SOUS le bandeau
       rouge, sur fond neutre, par AnalyseView.) -->
  <div class="filter-summary d-flex align-center flex-wrap ga-3" :class="{ 'filter-summary--dark': isDark }">
    <v-select
      :model-value="timeRange"
      :items="dateRangeItems"
      item-title="title"
      item-value="value"
      density="compact"
      variant="outlined"
      hide-details
      rounded="pill"
      class="fs-period"
      :aria-label="t('anPeriod')"
      @update:model-value="(v) => $emit('update:timeRange', v)"
    />

    <!-- Comparaison masquée en « Tout l'historique » : pas de période de
         référence claire → toggle réservé aux presets datés. -->
    <div v-if="timeRange !== 'all'" class="d-flex align-center ga-2">
      <span class="fs-compare-label">{{ t('anCompareTo') }}</span>
      <div class="compare-toggle" role="group" :aria-label="t('anComparisonMode')">
        <!-- Toggle : re-clic sur la pill active → OFF (null). Aucune pill
             active par défaut = comparaison désactivée. -->
        <button
          type="button"
          class="compare-pill"
          :class="{ 'compare-pill--active': comparisonMode === 'previous_period' }"
          :title="t('anPrevious')"
          @click="$emit('update:comparisonMode', comparisonMode === 'previous_period' ? null : 'previous_period')"
        >
          {{ t('anPrevious') }}
        </button>
        <button
          type="button"
          class="compare-pill compare-pill--prev"
          :class="{ 'compare-pill--active': comparisonMode === 'year_over_year' }"
          :title="t('anYearOverYear')"
          @click="$emit('update:comparisonMode', comparisonMode === 'year_over_year' ? null : 'year_over_year')"
        >
          {{ t('anSummaryYearOverYearShort') }}
        </button>
      </div>
      <!-- Fenêtre de comparaison réellement utilisée (dates + nb events) en
           infobulle — transparence, surtout quand le fallback « bloc précédent »
           s'applique. Fenêtre sans aucun event → note explicite à la place. -->
      <v-tooltip v-if="comparisonWindow" location="bottom" :text="comparisonWindow">
        <template #activator="{ props: tip }">
          <v-icon v-bind="tip" size="16" class="fs-window-info">mdi-information-outline</v-icon>
        </template>
      </v-tooltip>
      <span v-else-if="comparisonEmpty" class="fs-empty-note">{{ t('anNoComparisonData') }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useTheme } from 'vuetify'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()
const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

defineProps({
  comparisonMode: { type: String, default: null },
  comparisonEmpty: { type: Boolean, default: false },
  comparisonWindow: { type: String, default: '' },
  timeRange: { type: String, default: 'all' },
  dateRangeItems: { type: Array, default: () => [] },
})
defineEmits(['update:comparisonMode', 'update:timeRange'])
</script>

<style scoped>
.fs-period {
  max-width: 200px;
  min-width: 150px;
}
.fs-compare-label {
  font-size: var(--fs-sm);
  color: rgba(255, 255, 255, 0.85);
}
/* Notes rendues DANS le bandeau rouge (av-header) → texte blanc. */
.fs-empty-note {
  font-size: var(--fs-xs);
  color: rgba(255, 255, 255, 0.85);
  font-style: italic;
}
.fs-window-info {
  color: rgba(255, 255, 255, 0.85);
  cursor: help;
}
.compare-toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background-color: #dbeafe;
  border-radius: 999px;
  padding: 3px;
}
.compare-pill {
  display: inline-flex;
  align-items: center;
  border: 0;
  background: transparent;
  color: #1e3a8a;
  font-size: var(--fs-sm);
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
  font-family: inherit;
}
.compare-pill:hover { background-color: rgba(255, 255, 255, 0.5); }
.compare-pill--active {
  background-color: #ffffff;
  color: #1e3a8a;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
}
.compare-pill--prev { font-size: var(--fs-xs); letter-spacing: 0.2px; font-weight: 600; }

/* ── Dark mode (autonome via useTheme) ──
   Ce bandeau est rendu SUR le header rouge (#ff3131, conservé en sombre) :
   texte blanc et pills bleu-clair/blanc restent lisibles dans les deux modes.
   Le v-select `.fs-period` suit le thème Vuetify global (aucune couleur claire
   custom à forcer). On assombrit seulement la piste du toggle « Comparer à »
   pour garder un contraste correct avec les pills. */
.filter-summary--dark .compare-toggle { background-color: rgba(255, 255, 255, 0.22); }
.filter-summary--dark .compare-pill { color: #f9fafb; }
.filter-summary--dark .compare-pill:hover { background-color: rgba(255, 255, 255, 0.32); }
.filter-summary--dark .compare-pill--active {
  background-color: #ffffff;
  color: #1e3a8a;
}
</style>
