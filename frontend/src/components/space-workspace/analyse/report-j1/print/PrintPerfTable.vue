<template>
  <div class="pt" :style="{ width: width + 'px', height: height + 'px' }">
    <table class="pt__table">
      <thead>
        <tr :style="{ height: HEAD_H + 'px' }">
          <th class="pt__rank">#</th>
          <th v-for="c in columns" :key="c.key" :class="['pt__th', 'pt__' + c.align]">{{ headLabel(c) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in shown" :key="i" :style="{ height: ROW_H + 'px' }">
          <td class="pt__rank-cell">{{ i + 1 }}</td>
          <td v-for="c in columns" :key="c.key" :class="['pt__td', 'pt__' + c.align, c === columns[0] ? 'pt__first' : '']">{{ cell(r, c) }}</td>
        </tr>
        <tr v-if="hiddenCount > 0" :style="{ height: ROW_H + 'px' }">
          <td></td>
          <td :colspan="columns.length" class="pt__more">{{ t('rj1P2More').replace('{n}', hiddenCount) }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { rowCapacity, paginateWithMore, clampAtWord } from '@/utils/reportJ1Page2Tables'

const props = defineProps({
  data: { type: Object, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
})
const { t } = useI18n()

const ROW_H = 26
const HEAD_H = 28
const RANK_W = 26
const CHAR = 6.4
const PAD = 16

const columns = computed(() => props.data?.columns || [])
const rows = computed(() => props.data?.rows || [])
const page = computed(() => paginateWithMore(rows.value, rowCapacity(props.height, ROW_H, HEAD_H)))
const shown = computed(() => page.value.shown)
const hiddenCount = computed(() => page.value.hiddenCount)

// Largeur estimée des colonnes chiffrées (caractères max sur les lignes affichées), le reste va au nom.
function colChars(c) {
  const vals = shown.value.map((r) => String(r[c.key] ?? '').length)
  return Math.max(Math.min(String(c.label).length, 12), ...vals, 4)
}
const nameChars = computed(() => {
  const others = columns.value.slice(1).reduce((a, c) => a + colChars(c) * CHAR + PAD, 0)
  return Math.max(6, Math.floor((props.width - RANK_W - PAD - others) / CHAR))
})
const cell = (r, c) => (c === columns.value[0] ? clampAtWord(r[c.key], nameChars.value) : r[c.key])
const headLabel = (c) => (c === columns.value[0] ? clampAtWord(c.label, nameChars.value) : clampAtWord(c.label, 14))
</script>

<style scoped>
.pt { box-sizing: border-box; }
.pt__table { width: 100%; border-collapse: collapse; table-layout: auto; }
.pt__th { font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: 0.3px; color: #64748b; padding: 0 8px; border-bottom: 1px solid #cbd5e1; white-space: nowrap; line-height: 1.3; }
.pt__rank { width: 26px; font-size: var(--fs-xs); font-weight: var(--fw-bold); color: #94a3b8; padding: 0 4px; border-bottom: 1px solid #cbd5e1; text-align: center; }
.pt__rank-cell { font-size: var(--fs-xs); font-weight: var(--fw-bold); color: #94a3b8; text-align: center; padding: 0 4px; border-bottom: 1px solid #e2e8f0; font-variant-numeric: tabular-nums; }
.pt__td { font-size: var(--fs-sm); color: #0f172a; padding: 0 8px; border-bottom: 1px solid #e2e8f0; white-space: nowrap; font-variant-numeric: tabular-nums; line-height: 1.3; }
.pt__first { font-weight: var(--fw-semibold); color: #1e293b; }
.pt__left { text-align: left; }
.pt__right { text-align: right; }
.pt__center { text-align: center; }
.pt__more { font-size: var(--fs-sm); color: #64748b; padding: 0 8px; white-space: nowrap; }
</style>
