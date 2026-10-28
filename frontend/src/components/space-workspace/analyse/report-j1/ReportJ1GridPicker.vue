<template>
  <div class="rj1-picker" role="group" :aria-label="t('rj1PageLabel')">
    <div class="rj1-page">
      <!-- Elements deja places : un bloc par slot, sur toute son emprise. -->
      <div
        v-for="slot in slots"
        :key="slot.id"
        class="rj1-slot"
        :style="slotStyle(slot)"
      >
        <div class="rj1-slot__label">{{ slotLabel(slot) }}</div>
        <div v-if="slotFilters(slot)" class="rj1-slot__filters">{{ slotFilters(slot) }}</div>
        <button
          type="button"
          class="rj1-slot__remove"
          :disabled="saving"
          @click="emit('remove', slot.id)"
        >
          <v-icon size="14">mdi-delete-outline</v-icon>{{ t('rj1Remove') }}
        </button>
      </div>

      <!-- Cases non occupees : libres (cliquables) ou indisponibles (grisees, infobulle). -->
      <template v-for="cell in freeCells" :key="`${cell.col},${cell.row}`">
        <button
          v-if="cell.state === 'free'"
          type="button"
          class="rj1-cell rj1-cell--free"
          :style="cellStyle(cell)"
          :disabled="saving"
          :aria-label="t('rj1PlaceHere')"
          @click="emit('place', cell.col, cell.row)"
          @mouseenter="hover = cell"
          @mouseleave="hover = null"
          @focus="hover = cell"
          @blur="hover = null"
        >
          <v-icon size="18">mdi-plus</v-icon>
        </button>
        <v-tooltip v-else location="top" max-width="260">
          <template #activator="{ props: tipProps }">
            <div
              v-bind="tipProps"
              class="rj1-cell rj1-cell--off"
              :style="cellStyle(cell)"
              role="button"
              tabindex="0"
              aria-disabled="true"
            >
              <v-icon size="16">mdi-block-helper</v-icon>
            </div>
          </template>
          {{ reasonText(cell.reason) }}
        </v-tooltip>
      </template>

      <!-- Apercu de l'emprise au survol d'une case libre. -->
      <div v-if="hover && size" class="rj1-preview" :style="previewStyle" aria-hidden="true">
        <span class="rj1-preview__label">{{ pendingLabel }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// Apercu A4 portrait de la page 2 du rapport J+1 : grille 2 x 3, clic sur une case libre =
// coin haut gauche de l'element a placer. Aucun etat metier : tout vient des props.
import { ref, computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { sizeOf, labelKeyOf } from '@/utils/reportJ1Page2Catalog'
import { describeFilters } from '@/utils/reportJ1FilterSnapshot'

const props = defineProps({
  layout: { type: Object, required: true },
  // Etat de chaque case pour l'element a placer (cellStates).
  cells: { type: Array, required: true },
  size: { type: Object, default: null },
  pendingLabel: { type: String, default: '' },
  saving: { type: Boolean, default: false },
})
const emit = defineEmits(['place', 'remove'])

const { t } = useI18n()
const hover = ref(null)

const slots = computed(() => props.layout?.slots || [])
const freeCells = computed(() => props.cells.filter((c) => c.state !== 'occupied'))

const area = (col, row, w, h) => ({ gridColumn: `${col + 1} / span ${w}`, gridRow: `${row + 1} / span ${h}` })

function slotStyle(slot) {
  const s = sizeOf(slot.kind) || { w: 1, h: 1 }
  return area(slot.col, slot.row, s.w, s.h)
}
const cellStyle = (cell) => area(cell.col, cell.row, 1, 1)
const previewStyle = computed(() => area(hover.value.col, hover.value.row, props.size.w, props.size.h))

function slotLabel(slot) {
  return slot.label || t(labelKeyOf(slot.kind, slot.variant))
}
function slotFilters(slot) {
  return describeFilters(slot.filters, t)
}
function reasonText(reason) {
  if (reason === 'overflow-cols') return t('rj1ReasonCols')
  if (reason === 'overflow-rows') return t('rj1ReasonRows')
  if (reason === 'overlap') return t('rj1ReasonOverlap')
  return t('rj1PlaceUnavailable')
}
</script>

<style scoped>
.rj1-picker { display: flex; justify-content: center; }
/* Page A4 portrait (794 x 1123). */
.rj1-page {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 8px;
  width: 100%;
  max-width: 340px;
  aspect-ratio: 794 / 1123;
  padding: 12px;
  box-sizing: border-box;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.12);
  position: relative;
}
.rj1-cell {
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
  border-radius: 6px;
  font-family: inherit;
}
.rj1-cell--free {
  border: 1px dashed rgba(var(--v-theme-on-surface), 0.35);
  background: transparent;
  color: rgba(var(--v-theme-on-surface), 0.6);
  cursor: pointer;
}
.rj1-cell--free:hover,
.rj1-cell--free:focus-visible {
  border-color: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-primary));
  outline: none;
}
.rj1-cell--off {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.3);
  cursor: not-allowed;
}
.rj1-slot {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: 0;
  padding: 8px;
  overflow-y: auto;
  border-radius: 6px;
  border: 1px solid rgba(var(--v-theme-primary), 0.45);
  background: rgba(var(--v-theme-primary), 0.08);
}
.rj1-slot__label {
  font-size: var(--fs-sm, 0.75rem);
  font-weight: var(--fw-semibold, 600);
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.rj1-slot__filters {
  font-size: var(--fs-xs, 0.6875rem);
  color: rgba(var(--v-theme-on-surface), 0.62);
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.rj1-slot__remove {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  margin-top: auto;
  padding: 2px 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: rgb(var(--v-theme-error));
  font-size: var(--fs-xs, 0.6875rem);
  font-family: inherit;
  cursor: pointer;
}
.rj1-slot__remove:hover { background: rgba(var(--v-theme-error), 0.1); }
.rj1-slot__remove:disabled { opacity: 0.5; cursor: default; }
.rj1-preview {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border-radius: 6px;
  border: 2px solid rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.14);
  pointer-events: none;
  min-width: 0;
  min-height: 0;
}
.rj1-preview__label {
  font-size: var(--fs-xs, 0.6875rem);
  font-weight: var(--fw-medium, 500);
  text-align: center;
  overflow-wrap: anywhere;
}
</style>
