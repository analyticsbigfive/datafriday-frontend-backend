<template>
  <div class="rcko-list">
    <section v-for="group in groups" :key="group.key" class="rcko-group" data-test="kitchen-group">
      <header class="rcko-head">
        <h3>{{ group.name }}</h3>
        <span>{{ group.rows.length }} {{ group.rows.length > 1 ? t('srComponentPlural') : t('srComponentSingular') }}</span>
      </header>
      <ul class="rcko-rows">
        <li v-for="row in group.rows" :key="row.itemKey" class="rcko-row" data-test="component-row">
          <div class="rcko-name">
            <strong>{{ row.itemName }}</strong>
            <span v-if="row.shopNames && row.shopNames.length" class="rcko-shops">
              {{ t('srColShops') }} : {{ row.shopNames.join(', ') }}
            </span>
          </div>
          <div class="rcko-qty">
            <span class="rcko-qty-label">{{ t('srColQuantityToBuy') }}</span>
            <strong>{{ row.orderMain }}</strong>
            <span v-if="row.orderSub" class="rcko-qty-sub">{{ row.orderSub }}</span>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'

// Affichage seul : les groupes (cuisine, lignes avec orderMain / orderSub /
// shopNames déjà formatés) viennent de utils/componentKitchenOrders.js.
export default {
  name: 'RestockComponentKitchenOrders',
  props: {
    groups: { type: Array, default: () => [] },
  },
  setup() {
    const { t } = useI18n()
    return { t }
  },
}
</script>

<style scoped>
.rcko-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}
.rcko-group {
  border: 1px solid var(--sr-border, #e2e8f0);
  border-radius: var(--fb-radius-panel, 12px);
  background: var(--sr-surface, #fff);
  box-shadow: var(--fb-shadow-card);
  overflow: hidden;
}
.rcko-head {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
  padding: 14px 16px;
  background: var(--sr-subtle, #f8fafc);
  border-bottom: 1px solid var(--sr-border, #e2e8f0);
}
.rcko-head h3 {
  margin: 0;
  font-size: 14px;
  line-height: 1.25;
  font-weight: 700;
  color: var(--sr-text, #0f172a);
}
.rcko-head span {
  font-size: 12px;
  line-height: 1.35;
  color: var(--sr-muted, #64748b);
}
.rcko-rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.rcko-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--sr-border, #e2e8f0);
  font-variant-numeric: tabular-nums;
}
.rcko-row:last-child {
  border-bottom: 0;
}
.rcko-row:hover {
  background: var(--sr-primary-soft, #fff1f1);
}
.rcko-name,
.rcko-qty {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.rcko-name strong,
.rcko-qty strong {
  font-size: 13px;
  font-weight: 700;
  color: var(--sr-text, #0f172a);
  overflow-wrap: anywhere;
}
.rcko-qty {
  align-items: flex-end;
  text-align: right;
  flex-shrink: 0;
}
.rcko-qty-label {
  font-size: 11px;
  font-weight: 750;
  text-transform: uppercase;
  color: var(--sr-muted, #64748b);
}
.rcko-qty-sub,
.rcko-shops {
  font-size: 12px;
  line-height: 1.35;
  color: var(--sr-muted, #64748b);
  overflow-wrap: anywhere;
}
@media (max-width: 640px) {
  .rcko-row {
    flex-direction: column;
    gap: 6px;
  }
  .rcko-qty {
    align-items: flex-start;
    text-align: left;
  }
}
</style>
