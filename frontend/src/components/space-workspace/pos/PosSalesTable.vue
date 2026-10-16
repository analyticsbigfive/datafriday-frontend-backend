<template>
  <div class="pos-st">
    <div class="pos-st__scroll">
      <div class="pos-st__grid pos-st__head" role="row">
        <div>{{ t('posColNumber') }}</div>
        <div>{{ t('posColTime') }}</div>
        <div>{{ t('posColPdv') }}</div>
        <div>{{ t('posColVendor') }}</div>
        <div>{{ t('posColPayment') }}</div>
        <div class="pos-st__right">{{ t('posColTip') }}</div>
        <div class="pos-st__right">{{ t('posColTotal') }}</div>
        <div>{{ t('posColStatus') }}</div>
      </div>

      <div v-for="sale in rows" :key="sale.id" class="pos-st__grid pos-st__row" role="row">
        <div class="pos-st__strong">{{ sale.ticketNumber }}</div>
        <div class="pos-st__muted">{{ time(sale.createdAt) }}</div>
        <div class="pos-st__pdv">{{ sale.pdvName }}</div>
        <div>{{ sale.vendorName }}</div>
        <div>{{ paymentsLabel(sale) }}</div>
        <div class="pos-st__right pos-st__muted">{{ sale.tipTotal ? money(sale.tipTotal) : '' }}</div>
        <div class="pos-st__right pos-st__total" :class="{ 'pos-st__total--cancelled': sale.cancelled }">
          {{ money(sale.totalTtc) }}
        </div>
        <div>
          <span class="pos-st__status" :class="{ 'pos-st__status--cancelled': sale.cancelled }">
            {{ sale.cancelled ? t('posSaleCancelled') : t('posSaleSynced') }}
          </span>
        </div>
      </div>

      <div v-if="!rows.length" class="pos-st__empty">{{ emptyText }}</div>
    </div>
  </div>
</template>

<script setup>
import { usePosFormat } from '@/composables/usePosFormat'
import { paymentsLabel } from '@/composables/usePosSalesHistory'

// Tableau de l'historique : N°, heure, PdV, vendeur, paiement(s), pourboire, total, statut.
defineProps({
  rows: { type: Array, default: () => [] }, // PosSaleRow[]
  emptyText: { type: String, default: '' },
})

const { t, money, time } = usePosFormat()
</script>

<style scoped>
.pos-st {
  overflow: hidden;
  border: 1px solid var(--fb-border, #e5e7eb);
  border-radius: var(--fb-radius-card, 16px);
  background: var(--fb-surface, #ffffff);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.05));
}
.pos-st__scroll {
  overflow-x: auto;
}
.pos-st__grid {
  display: grid;
  grid-template-columns: 64px 64px minmax(140px, 1fr) 110px 130px 84px 96px 108px;
  gap: 12px;
  align-items: center;
  min-width: 840px;
  padding: 0 16px;
}
.pos-st__head {
  padding-top: 12px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--fb-border, #e5e7eb);
  background: var(--fb-subtle, #fafafa);
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-xs);
  font-weight: var(--fw-bold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.pos-st__row {
  min-height: 52px;
  border-bottom: 1px solid var(--fb-border, #e5e7eb);
  font-size: var(--fs-base);
}
.pos-st__right {
  text-align: right;
}
.pos-st__strong {
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
}
.pos-st__muted {
  color: var(--fb-muted, #6b7280);
  font-variant-numeric: tabular-nums;
}
.pos-st__pdv {
  min-width: 0;
  font-weight: var(--fw-semibold);
}
.pos-st__total {
  font-weight: var(--fw-bold);
  font-variant-numeric: tabular-nums;
}
.pos-st__total--cancelled {
  color: var(--fb-faint, #9ca3af);
  text-decoration: line-through;
}
.pos-st__status {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--fb-success-soft, #f0fdf4);
  color: var(--fb-success, #16a34a);
  font-size: var(--fs-sm);
  font-weight: var(--fw-bold);
}
.pos-st__status--cancelled {
  background: var(--fb-danger-soft, #fef2f2);
  color: var(--fb-danger, #dc2626);
}
.pos-st__empty {
  padding: 32px 16px;
  color: var(--fb-muted, #6b7280);
  font-size: var(--fs-md);
  line-height: 1.5;
  text-align: center;
}
</style>
