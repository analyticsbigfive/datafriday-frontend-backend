<template>
  <div v-if="tile.out" class="pos-tile pos-tile--out" role="group" :aria-label="`${tile.name}, ${t('guestPosOutOfStock')}`">
    <div class="pos-tile__name pos-tile__name--out">{{ tile.name }}</div>
    <div class="pos-tile__out">{{ t('guestPosOutOfStock') }}</div>
  </div>
  <button v-else type="button" class="pos-tile" :class="{ 'pos-tile--selected': tile.quantity > 0 }" @click="$emit('add', tile.menuItemId)">
    <div class="pos-tile__top">
      <div class="pos-tile__name">{{ tile.name }}</div>
      <div v-if="tile.quantity > 0" class="pos-tile__qty">{{ tile.quantity }}</div>
    </div>
    <div class="pos-tile__bottom">
      <div class="pos-tile__chips">
        <span v-if="tile.low" class="pos-chip pos-chip--low">{{ t('guestPosLowStock') }}</span>
        <span v-if="tile.label" class="pos-chip" :class="tile.isPromotion ? 'pos-chip--promo' : 'pos-chip--note'">{{ tile.label }}</span>
      </div>
      <div class="pos-tile__prices">
        <span v-if="tile.originalPriceCents != null && tile.originalPriceCents !== tile.priceCents" class="pos-tile__was">{{ formatCents(tile.originalPriceCents) }}</span>
        <span class="pos-tile__price" :class="{ 'pos-tile__price--negative': tile.priceCents < 0 }">{{ formatCents(tile.priceCents) }}</span>
      </div>
    </div>
  </button>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import { formatCents } from '@/utils/posMoney'

defineProps({
  // { menuItemId, name, priceCents, originalPriceCents, label, isPromotion, out, low, quantity }
  tile: { type: Object, required: true },
})
defineEmits(['add'])

const { t } = useI18n()
</script>

<style scoped>
.pos-tile {
  width: 100%; height: 112px; box-sizing: border-box; padding: 12px 14px; border-radius: 14px; display: flex; flex-direction: column;
  justify-content: space-between; color: var(--pos-text); box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05); border: 2px solid var(--pos-border);
  background: var(--pos-surface); cursor: pointer; text-align: left;
}
.pos-tile--selected { border-color: var(--pos-accent); background: var(--pos-accent-soft); }
.pos-tile--out { cursor: default; box-shadow: none; border: 1px dashed var(--pos-border-strong); background: #FAFAFA; }
.pos-tile__top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; width: 100%; }
.pos-tile__name { font-size: var(--fs-lg); font-weight: var(--fw-bold); line-height: 1.2; text-align: left; overflow-wrap: anywhere; }
.pos-tile__name--out { color: #9CA3AF; }
.pos-tile__out { font-size: var(--fs-base); font-weight: var(--fw-bold); color: var(--pos-danger); }
.pos-tile__qty {
  min-width: 28px; height: 28px; box-sizing: border-box; padding: 0 8px; border-radius: 14px; background: var(--pos-accent); color: #fff;
  font-size: var(--fs-md); font-weight: var(--fw-bold); display: flex; align-items: center; justify-content: center;
}
.pos-tile__bottom { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; gap: 6px; }
.pos-tile__chips { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.pos-chip { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: var(--fs-sm); font-weight: var(--fw-bold); }
.pos-chip--low { background: var(--pos-warn-bg); color: var(--pos-warn); }
.pos-chip--promo, .pos-chip--note { background: #EFF6FF; color: #2563EB; }
.pos-tile__prices { display: flex; align-items: baseline; gap: 6px; flex-shrink: 0; }
.pos-tile__was { font-size: var(--fs-sm); color: #9CA3AF; text-decoration: line-through; font-variant-numeric: tabular-nums; }
.pos-tile__price { font-size: var(--fs-lg); font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; }
.pos-tile__price--negative { color: var(--pos-ok); }
</style>
