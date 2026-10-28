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
        <div class="rj1-drawer__name">{{ itemLabel }}</div>
        <div class="rj1-drawer__size">{{ sizeText }}</div>
        <div class="rj1-drawer__filters">
          <span class="rj1-drawer__eyebrow">{{ t('rj1FiltersFrozen') }}</span>
          {{ placement.filtersSummary.value || t('rj1NoFilter') }}
        </div>
      </section>

      <p class="rj1-drawer__hint">{{ t('rj1PickHint') }}</p>

      <v-progress-linear v-if="placement.loading.value" indeterminate height="2" class="mb-2" />
      <ReportJ1GridPicker
        v-if="placement.pending.value"
        :layout="placement.layout.value"
        :cells="placement.cells.value"
        :size="placement.size.value"
        :pending-label="itemLabel"
        :saving="placement.saving.value"
        @place="placement.place"
        @remove="placement.remove"
      />
    </div>
  </v-navigation-drawer>
</template>

<script setup>
// Drawer « Ajouter au rapport J+1 » : en-tete (element + resume des filtres figes) et apercu
// de la page 2. Ne porte aucune logique : tout passe par le composable de placement.
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { labelKeyOf } from '@/utils/reportJ1Page2Catalog'
import ReportJ1GridPicker from './ReportJ1GridPicker.vue'

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
.rj1-drawer__name { font-size: var(--fs-md, 0.875rem); font-weight: var(--fw-semibold, 600); overflow-wrap: anywhere; }
.rj1-drawer__size,
.rj1-drawer__filters { font-size: var(--fs-sm, 0.75rem); overflow-wrap: anywhere; }
.rj1-drawer__filters .rj1-drawer__eyebrow { display: block; }
.rj1-drawer__hint { margin: 0; font-size: var(--fs-sm, 0.75rem); color: rgba(var(--v-theme-on-surface), 0.62); }
</style>
