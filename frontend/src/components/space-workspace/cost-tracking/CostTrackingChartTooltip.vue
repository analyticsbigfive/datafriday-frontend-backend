<template>
  <div
    class="ct-tip"
    :class="{ 'ct-tip--left': flip }"
    :style="{ left: `${left}px`, top: `${top}px` }"
    role="status"
  >
    <h4 class="ct-tip__title">{{ event ? event.name : fmt.dayYear(when) }}</h4>
    <div v-if="event" class="ct-tip__sub">{{ fmt.dayLong(event.t) }}</div>
    <template v-for="row in rows" :key="row.key">
      <div class="ct-tip__row">
        <i class="ct-tip__dot" :style="{ background: `var(--ct-s${(row.colorIndex % 10) + 1})` }" />
        <span class="ct-tip__name">{{ row.name }}</span>
        <b class="ct-tip__cost">{{ fmt.cost(row.cost) }}</b>
      </div>
      <div v-if="event" class="ct-tip__since">
        {{ t('ctTipVersionOf').replace('{date}', fmt.dayYear(row.since)) }}
      </div>
    </template>
    <div v-if="event" class="ct-tip__note">{{ t('ctTipEventNote') }}</div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { useCostTrackingFormat } from '@/composables/useCostTrackingFormat'

// Infobulle du graphique : date (ou nom de l'event), coût en vigueur de chaque courbe visible.
// Se place à droite du curseur, ou à gauche dans la moitié droite du graphique.
const props = defineProps({
  rows: { type: Array, default: () => [] },
  event: { type: Object, default: null },
  when: { type: Number, required: true },
  x: { type: Number, default: 0 },
  top: { type: Number, default: 0 },
  containerWidth: { type: Number, default: 800 },
})

const { t } = useI18n()
const fmt = useCostTrackingFormat()

const flip = computed(() => props.x > props.containerWidth / 2)
const left = computed(() => (flip.value ? props.x - 14 : props.x + 14))
</script>

<style scoped>
.ct-tip {
  position: absolute;
  z-index: 5;
  min-width: 190px;
  max-width: 260px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--ct-surface);
  border: 1px solid var(--ct-border-strong);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
  font-size: var(--fs-sm);
  pointer-events: none;
}
.ct-tip--left {
  transform: translateX(-100%);
}
.ct-tip__title {
  margin: 0 0 6px;
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
}
.ct-tip__sub {
  margin: -2px 0 6px;
  font-size: var(--fs-xs);
  color: var(--ct-faint);
}
.ct-tip__row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
}
.ct-tip__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.ct-tip__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ct-tip__cost {
  font-variant-numeric: tabular-nums;
  font-weight: var(--fw-bold);
}
.ct-tip__since {
  padding-left: 14px;
  font-size: var(--fs-xs);
  color: var(--ct-faint);
}
.ct-tip__note {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--ct-border);
  color: var(--ct-muted);
}
</style>
