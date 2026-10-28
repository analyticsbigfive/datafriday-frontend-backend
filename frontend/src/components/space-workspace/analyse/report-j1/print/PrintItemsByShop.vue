<template>
  <div class="pi" :style="{ width: width + 'px', height: height + 'px' }">
    <div v-for="(col, ci) in layout.columns" :key="ci" class="pi__col" :style="{ width: colW + 'px' }">
      <div class="pi__head" :style="{ height: HEAD_H + 'px' }">
        <span class="pi__h-name">{{ t('anItem') }}</span>
        <span class="pi__h-qty">{{ t('anUnits') }}</span>
        <span class="pi__h-rev">{{ t('anRevenue') }}</span>
      </div>
      <div
        v-for="(r, i) in col"
        :key="i"
        :class="['pi__row', r.type === 'shop' ? 'pi__row--shop' : '']"
        :style="{ height: ROW_H + 'px' }"
      >
        <span class="pi__name">{{ clampAtWord(r.type === 'shop' ? r.shop : r.name, nameChars - (r.type === 'shop' ? 0 : 2)) }}</span>
        <span class="pi__qty">{{ formatNumber(r.qty) }}</span>
        <span class="pi__rev">{{ formatCurrency(r.revenue) }}</span>
      </div>
      <div v-if="ci === layout.columns.length - 1 && layout.hiddenItems > 0" class="pi__more" :style="{ height: ROW_H + 'px' }">
        {{ t('rj1P2More').replace('{n}', layout.hiddenItems) }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatCurrency, formatNumber } from '@/composables/useFormatters'
import { rowCapacity, layoutItemsByShop, clampAtWord } from '@/utils/reportJ1Page2Tables'

const props = defineProps({
  data: { type: Object, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
})
const { t } = useI18n()

const ROW_H = 22
const HEAD_H = 24
const COL_GAP = 20
const QTY_W = 44
const REV_W = 74

// Deux colonnes dès que la case est large : double la capacité.
const nCols = computed(() => (props.width >= 600 ? 2 : 1))
const colW = computed(() => Math.floor((props.width - COL_GAP * (nCols.value - 1)) / nCols.value))
const nameChars = computed(() => Math.max(8, Math.floor((colW.value - QTY_W - REV_W - 16) / 6.2)))
const layout = computed(() =>
  layoutItemsByShop(props.data?.shops || [], rowCapacity(props.height, ROW_H, HEAD_H), nCols.value),
)
</script>

<style scoped>
.pi { display: flex; gap: 20px; box-sizing: border-box; align-items: flex-start; }
.pi__col { flex-shrink: 0; }
.pi__head, .pi__row, .pi__more { display: flex; align-items: center; box-sizing: border-box; }
.pi__head { border-bottom: 1px solid #cbd5e1; font-size: var(--fs-xs); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: 0.3px; color: #64748b; line-height: 1.3; }
.pi__h-name, .pi__name { flex: 1; min-width: 0; white-space: nowrap; }
.pi__h-qty, .pi__qty { width: 44px; text-align: right; flex-shrink: 0; white-space: nowrap; }
.pi__h-rev, .pi__rev { width: 74px; text-align: right; flex-shrink: 0; white-space: nowrap; }
.pi__row { border-bottom: 1px solid #f1f5f9; font-size: var(--fs-xs); color: #334155; font-variant-numeric: tabular-nums; line-height: 1.3; }
.pi__row .pi__name { padding-left: 10px; }
.pi__row--shop { background: #f1f5f9; font-weight: var(--fw-bold); color: #0f172a; border-bottom-color: #e2e8f0; }
.pi__row--shop .pi__name { padding-left: 4px; }
.pi__row--shop .pi__qty, .pi__row--shop .pi__rev { padding-right: 0; }
.pi__more { font-size: var(--fs-xs); color: #64748b; padding-left: 4px; white-space: nowrap; }
</style>
