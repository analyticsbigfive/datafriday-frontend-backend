<template>
  <div class="pc-bar" :style="{ width: width + 'px', height: height + 'px', gridTemplateColumns: `repeat(${grid.cols}, 1fr)`, gridAutoRows: chipH + 'px' }">
    <div v-for="it in items" :key="it.label" class="pc-chip" :style="{ borderLeftColor: it.color }">
      <div class="pc-chip__label">{{ it.label }}</div>
      <div class="pc-chip__value">{{ it.value }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { chipGrid, clampAtWord } from '@/utils/reportJ1Page2Tables'

const props = defineProps({
  data: { type: Object, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
})

const GAP = 8
const MAX_CHIP_H = 78
const grid = computed(() => chipGrid(props.data?.items?.length || 0, props.width, { gap: GAP }))
const chipW = computed(() => (props.width - GAP * (grid.value.cols - 1)) / Math.max(1, grid.value.cols))
const chipH = computed(() => Math.min(MAX_CHIP_H, Math.floor((props.height - GAP * (grid.value.rows - 1)) / Math.max(1, grid.value.rows))))
// Étiquette en capitales 11px : ~7.5 px par caractère. Coupure aux espaces seulement.
const labelChars = computed(() => Math.max(6, Math.floor((chipW.value - 24) / 7.5)))
const items = computed(() => (props.data?.items || []).map((i) => ({ ...i, label: clampAtWord(i.label, labelChars.value) })))
</script>

<style scoped>
.pc-bar { display: grid; gap: 8px; box-sizing: border-box; align-content: start; }
.pc-chip {
  box-sizing: border-box;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #64748b;
  border-radius: 10px;
  padding: 8px 10px;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.pc-chip__label { font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: 0.4px; color: #64748b; white-space: nowrap; line-height: 1.3; }
.pc-chip__value { font-size: var(--fs-lg); font-weight: var(--fw-bold); color: #0f172a; font-variant-numeric: tabular-nums; white-space: nowrap; margin-top: 3px; line-height: 1.3; }
</style>
