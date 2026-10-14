<template>
  <header class="cb" :aria-label="t('anCmpReportTitle')">
    <div class="cb__top">
      <button
        type="button"
        class="cb__ico cb__ico--edge"
        :aria-label="expandLabel"
        :title="expandLabel"
        :aria-pressed="layout === 'drawer'"
        @click="emit('toggle-expand')"
      >
        <v-icon size="18">{{ layout === 'drawer' ? 'mdi-chevron-double-right' : 'mdi-chevron-double-left' }}</v-icon>
      </button>
      <h1 class="cb__title">{{ t('anCmpReportTitle') }}</h1>
      <span class="cb__spacer"></span>
      <button
        type="button"
        class="cb__ico"
        :title="exportDisabled && !exporting ? t('anCmpExportBusy') : t('anCmpExportCsv')"
        :aria-label="t('anCmpExportCsv')"
        :disabled="exportDisabled || exporting"
        :aria-busy="exporting ? 'true' : undefined"
        @click="emit('export-csv')"
      >
        <v-progress-circular v-if="exporting" indeterminate size="16" width="2" />
        <v-icon v-else size="18">mdi-download-outline</v-icon>
      </button>
      <button
        type="button"
        class="cb__ico"
        :title="t('anCmpCopy')"
        :aria-label="t('anCmpCopy')"
        :disabled="copying"
        :aria-busy="copying ? 'true' : undefined"
        @click="emit('copy')"
      >
        <v-progress-circular v-if="copying" indeterminate size="16" width="2" />
        <v-icon v-else size="18">mdi-content-copy</v-icon>
      </button>
      <button
        type="button"
        class="cb__ico"
        :title="t('anCmpShare')"
        :aria-label="t('anCmpShare')"
        :disabled="sharing"
        :aria-busy="sharing ? 'true' : undefined"
        @click="emit('share')"
      >
        <v-progress-circular v-if="sharing" indeterminate size="16" width="2" />
        <v-icon v-else size="18">mdi-share-variant-outline</v-icon>
      </button>
    </div>
    <div class="cb__sub">
      <span class="cb__label">{{ label }}<template v-if="label"> · </template>{{ eventsText }}</span>
      <span class="cb__spacer"></span>
      <button type="button" class="cb__edit" @click="emit('edit')">
        <v-icon size="16">mdi-pencil-outline</v-icon>
        {{ t('anCmpEditCriteria') }}
      </button>
    </div>
  </header>
</template>

<script setup>
// Bandeau rouge « Comparaison » du rapport (maquette .banner / .b1 / .b2).
// Il ÉMET seulement : l'export CSV, la copie et le partage sont branchés par AnalyseView.
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const props = defineProps({
  // Libellé de la comparaison (période, type/catégorie, N événements, Predict).
  label: { type: String, default: '' },
  // Nombre d'events du rapport de comparaison.
  eventCount: { type: Number, default: 0 },
  // Disposition de la grille : 'split' | 'drawer' | 'main' (icône du bouton d'extension).
  layout: { type: String, default: 'split' },
  // États des trois actions : spinner et bouton inactif pendant l'opération.
  exporting: { type: Boolean, default: false },
  copying: { type: Boolean, default: false },
  sharing: { type: Boolean, default: false },
  // true : export CSV impossible (rapport en chargement ou en mise à jour).
  exportDisabled: { type: Boolean, default: false },
})
const emit = defineEmits(['toggle-expand', 'export-csv', 'copy', 'share', 'edit'])

const { t } = useI18n()
const expandLabel = computed(() => (props.layout === 'drawer' ? t('anCmpRestoreWidths') : t('anCmpExpandDrawer')))
const eventsText = computed(() => t('anCmpEventsCount').replace('{n}', String(props.eventCount)))
</script>

<style scoped>
.cb {
  position: sticky;
  top: 0;
  z-index: 5;
  flex: none;
  border-radius: 18px;
  background: var(--cr-band);
  color: #fff;
  box-shadow: 0 8px 24px rgba(255, 49, 49, 0.26);
}
.cb__top {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding: 12px 14px 6px;
}
.cb__title {
  margin: 0 6px 0 4px;
  min-width: 0;
  overflow: hidden;
  font-size: var(--fs-lg);
  font-weight: var(--fw-medium);
  white-space: nowrap;
  text-overflow: ellipsis;
}
.cb__spacer { flex: 1; }
.cb__ico {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition: background 0.12s;
}
.cb__ico:hover:not(:disabled) { background: rgba(255, 255, 255, 0.16); }
.cb__ico:disabled { cursor: default; opacity: 0.55; }
.cb__ico[aria-pressed='true'] { background: rgba(255, 255, 255, 0.28); }
.cb__ico--edge { border: 1px solid rgba(255, 255, 255, 0.55); }
.cb__sub {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  padding: 0 16px 13px;
  font-size: var(--fs-sm);
}
.cb__label { min-width: 0; opacity: 0.92; }
.cb__edit {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.28);
  color: inherit;
  font: inherit;
  font-size: var(--fs-sm);
  cursor: pointer;
}
.cb__edit:hover { background: rgba(255, 255, 255, 0.36); }
.cb__ico:focus-visible,
.cb__edit:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .cb__ico { transition: none; } }
</style>
