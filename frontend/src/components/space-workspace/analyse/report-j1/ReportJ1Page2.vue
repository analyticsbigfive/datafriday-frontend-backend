<template>
  <!-- Page 2 du Rapport J+1 : sélection Analyse placée sur une grille 2 x 3. Capturée par la
       boucle de useReportJ1.renderPdf (classe rj1-page). Tout est dimensionné par constantes. -->
  <div class="rj1-page rj1p2">
    <div class="rj1p2-brand">
      <img :src="logo" class="rj1p2-brand__logo" alt="" />
      <span class="rj1p2-brand__name">DataFriday</span>
      <span class="rj1p2-brand__space">{{ spaceLabel }}</span>
    </div>
    <div class="rj1p2-title">
      <span class="rj1p2-title__text">{{ t('rj1Page2Title') }}</span>
      <span class="rj1p2-title__event">{{ eventName }}</span>
    </div>

    <div class="rj1p2-grid" :style="gridStyle">
      <div v-for="cell in cells" :key="cell.id" class="rj1p2-cell" :style="cell.style">
        <div class="rj1p2-cell__title">{{ cell.title }}</div>
        <div class="rj1p2-cell__filters">{{ cell.filters }}</div>
        <div class="rj1p2-cell__body" :style="cell.bodyStyle">
          <component
            :is="cell.component"
            v-if="cell.component"
            :data="cell.data"
            :status="cell.state"
            :width="cell.width"
            :height="cell.height"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { sizeOf, labelKeyOf } from '@/utils/reportJ1Page2Catalog'
import { describeFilters } from '@/utils/reportJ1FilterSnapshot'
import { clampAtWord } from '@/utils/reportJ1Page2Tables'
import {
  GRID_W, GRID_H, GRID_GAP, CELL_PAD, CELL_BORDER, slotBox,
} from '@/utils/reportJ1Page2Geometry'
import PrintKpiBar from './print/PrintKpiBar.vue'
import PrintWidgetBar from './print/PrintWidgetBar.vue'
import PrintDonut from './print/PrintDonut.vue'
import PrintPerfTable from './print/PrintPerfTable.vue'
import PrintRevenueBars from './print/PrintRevenueBars.vue'
import PrintItemsByShop from './print/PrintItemsByShop.vue'
import PrintSlotState from './print/PrintSlotState.vue'
import logo from '@/assets/datafriday.png'

const props = defineProps({
  /** Résultat de loadPage2 : [{ slot, status, data }]. */
  items: { type: Array, required: true },
  space: { type: Object, default: null },
  event: { type: Object, default: null },
})

const { t } = useI18n()

const COMPONENTS = {
  'kpi-bar': PrintKpiBar,
  'widget-bar': PrintWidgetBar,
  donut: PrintDonut,
  'perf-table': PrintPerfTable,
  'revenue-bars': PrintRevenueBars,
  'items-by-shop': PrintItemsByShop,
}

const spaceLabel = computed(() => (props.space?.name || '').toUpperCase())
const eventName = computed(() => props.event?.name || props.event?.eventName || '')

const gridStyle = computed(() => ({
  width: `${GRID_W}px`,
  height: `${GRID_H}px`,
  gap: `${GRID_GAP}px`,
}))

const cells = computed(() => (props.items || []).flatMap((item) => {
  const slot = item?.slot
  const size = sizeOf(slot?.kind)
  if (!slot || !size) return []
  const box = slotBox(size.w, size.h)
  const ok = item.status === 'ok' && item.data
  const labelKey = labelKeyOf(slot.kind, slot.variant)
  const filters = describeFilters(slot.filters, t)
  return [{
    id: slot.id,
    // Coupe au mot selon la largeur de la case (environ 8 px par caractère en titre, 6 en filtres).
    title: clampAtWord(slot.label || (labelKey ? t(labelKey) : ''), Math.floor(box.renderWidth / 8)),
    filters: clampAtWord(`${t('rj1Page2Filters')} : ${filters || t('rj1Page2NoFilter')}`, Math.floor(box.renderWidth / 6)),
    component: ok ? COMPONENTS[slot.kind] : PrintSlotState,
    data: ok ? item.data : null,
    state: ok ? 'ok' : (item.status === 'error' ? 'error' : 'empty'),
    width: box.renderWidth,
    height: box.renderHeight,
    style: {
      gridColumn: `${slot.col + 1} / span ${size.w}`,
      gridRow: `${slot.row + 1} / span ${size.h}`,
      padding: `${CELL_PAD}px`,
      borderWidth: `${CELL_BORDER}px`,
    },
    bodyStyle: { width: `${box.renderWidth}px`, height: `${box.renderHeight}px` },
  }]
}))
</script>

<style scoped>
.rj1p2 {
  width: 794px;
  height: 1123px;
  background: #ffffff;
  color: #1e293b;
  font-family: var(--font-ui);
  display: flex;
  flex-direction: column;
  padding: 22px 26px;
  box-sizing: border-box;
  line-height: 1.4;
}
.rj1p2-brand { display: flex; align-items: center; gap: 8px; height: 28px; }
.rj1p2-brand__logo { width: 24px; height: 24px; object-fit: contain; }
.rj1p2-brand__name { font-size: var(--fs-md); font-weight: var(--fw-bold); color: #0f172a; }
.rj1p2-brand__space { margin-left: auto; font-size: var(--fs-sm); font-weight: var(--fw-semibold); letter-spacing: 0.06em; color: #64748b; }
.rj1p2-title { display: flex; align-items: baseline; gap: 10px; height: 36px; padding-top: 8px; box-sizing: border-box; }
.rj1p2-title__text { font-size: var(--fs-xl); font-weight: var(--fw-bold); color: #0f172a; }
.rj1p2-title__event { font-size: var(--fs-sm); color: #64748b; }
.rj1p2-grid {
  margin-top: 12px;
  display: grid;
  /* minmax(0, 1fr) : sans ce plancher, un texte nowrap élargit la colonne au-delà de la page. */
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(3, minmax(0, 1fr));
}
.rj1p2-cell {
  box-sizing: border-box;
  border-style: solid;
  border-color: #e2e8f0;
  border-radius: 12px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
}
.rj1p2-cell__title { font-size: var(--fs-md); font-weight: var(--fw-bold); color: #0f172a; height: 22px; line-height: 22px; white-space: nowrap; }
.rj1p2-cell__filters { font-size: var(--fs-xs); color: #64748b; height: 16px; line-height: 16px; margin-bottom: 6px; white-space: nowrap; }
.rj1p2-cell__body { flex: none; }
</style>
