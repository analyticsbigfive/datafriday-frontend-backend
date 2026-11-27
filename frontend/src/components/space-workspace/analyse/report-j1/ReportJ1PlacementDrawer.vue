<template>
  <v-navigation-drawer
    :model-value="placement.open.value"
    temporary
    location="right"
    width="420"
    class="rj1-drawer"
    :aria-label="t('rj1DrawerTitle')"
    @update:model-value="(v) => !v && placement.close()"
    @keydown.esc="placement.close()"
  >
    <div class="rj1-drawer__inner">
      <header class="rj1-drawer__head">
        <h2 class="rj1-drawer__title">{{ t('rj1DrawerTitle') }}</h2>
        <v-btn icon size="small" variant="text" :aria-label="t('anCmpClose')" @click="placement.close()">
          <v-icon size="18">mdi-close</v-icon>
        </v-btn>
      </header>

      <section v-if="placement.pending.value" class="rj1-drawer__item">
        <div class="rj1-drawer__eyebrow">{{ t('rj1ItemToAdd') }}</div>
        <ReportJ1SlotTitle
          class="rj1-drawer__name"
          :title="itemLabel"
          :value="placement.pending.value.label || ''"
          :saving="placement.saving.value"
          @rename="placement.setPendingLabel"
        />
        <div v-if="placement.chipsSummary.value" class="rj1-drawer__chips">
          <span class="rj1-drawer__eyebrow">{{ t('rj1SelectedItems') }}</span>
          {{ placement.chipsSummary.value }}
        </div>
        <div class="rj1-drawer__size">{{ sizeText }}</div>
        <div class="rj1-drawer__filters">
          <span class="rj1-drawer__eyebrow">{{ t('rj1FiltersFrozen') }}</span>
          {{ placement.filtersSummary.value || t('rj1NoFilter') }}
        </div>
      </section>

      <ReportJ1PageBar
        :total="placement.pageTotal.value"
        :current="placement.pageIndex.value"
        :can-add="placement.pageTotal.value < MAX_PAGES"
        :current-count="placement.page.value.slots.length"
        :saving="placement.saving.value"
        @select="placement.selectPage"
        @add="placement.createPage"
        @remove="placement.deletePage"
      />

      <p class="rj1-drawer__hint">{{ t('rj1PickHint').replace('{n}', String(pageNumber(placement.pageIndex.value))) }}</p>

      <v-progress-linear v-if="placement.loading.value" indeterminate height="2" class="mb-2" />
      <ReportJ1GridPicker
        v-if="placement.pending.value"
        :layout="placement.page.value"
        :cells="placement.cells.value"
        :size="placement.size.value"
        :pending-label="itemLabel"
        :saving="placement.saving.value"
        @place="placement.place"
        @remove="placement.remove"
        @rename="placement.rename"
      />
    </div>
  </v-navigation-drawer>
</template>

<script setup>
// Drawer « Ajouter au rapport J+1 » : en-tete (element + resume des filtres figes) et apercu
// de la page de selection choisie dans la barre des pages. Ne porte aucune logique : tout passe par le composable de placement.
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { labelKeyOf } from '@/utils/reportJ1Page2Catalog'
import { MAX_PAGES, pageNumber } from '@/utils/reportJ1Pages'
import ReportJ1GridPicker from './ReportJ1GridPicker.vue'
import ReportJ1PageBar from './ReportJ1PageBar.vue'
import ReportJ1SlotTitle from './ReportJ1SlotTitle.vue'

const props = defineProps({
  placement: { type: Object, required: true },
})

const { t } = useI18n()

const itemLabel = computed(() => {
  const p = props.placement.pending.value
  if (!p) return ''
  return p.label || t(labelKeyOf(p.kind, p.variant))
})
const sizeText = computed(() => {
  const s = props.placement.size.value
  return s ? t('rj1SizeText').replace('{w}', String(s.w)).replace('{h}', String(s.h)) : ''
})
</script>

<style scoped>
.rj1-drawer__inner { display: flex; flex-direction: column; gap: 12px; padding: 16px; }
.rj1-drawer__head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.rj1-drawer__title { margin: 0; font-size: var(--fs-lg, 1rem); font-weight: var(--fw-semibold, 600); }
.rj1-drawer__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.05);
  min-width: 0;
}
.rj1-drawer__eyebrow {
  font-size: var(--fs-xs, 0.6875rem);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: rgba(var(--v-theme-on-surface), 0.6);
}
.rj1-drawer__name :deep(.rj1-title__text) { font-size: var(--fs-md, 0.875rem); }
.rj1-drawer__size,
.rj1-drawer__chips,
.rj1-drawer__filters { font-size: var(--fs-sm, 0.75rem); overflow-wrap: anywhere; }
.rj1-drawer__filters .rj1-drawer__eyebrow,
.rj1-drawer__chips .rj1-drawer__eyebrow { display: block; }
.rj1-drawer__hint { margin: 0; font-size: var(--fs-sm, 0.75rem); color: rgba(var(--v-theme-on-surface), 0.62); }
</style>
