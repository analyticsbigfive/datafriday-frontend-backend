<template>
  <div class="rco-card">
    <header class="rco-head">
      <div class="rco-head-row">
        <span class="rco-title">{{ t('srComponentOrdersTitle') }}</span>
        <strong v-if="panel.lines.length" class="rco-total">{{ formatCurrencyDetailed(panel.total) }}</strong>
      </div>
      <p v-if="panel.hasUnknownCost" class="rco-note">{{ t('srComponentOrdersCostUnknown') }}</p>
    </header>

    <p v-if="!panel.lines.length" class="rco-empty">{{ t('srComponentOrdersEmpty') }}</p>

    <ul v-else class="rco-list">
      <li v-for="line in visibleLines" :key="line.itemKey" class="rco-item">
        <span class="rco-copy">
          <strong class="rco-name" :title="line.name">{{ line.name }}</strong>
          <small v-if="line.kitchenLabel" class="rco-detail">{{ line.kitchenLabel }}</small>
        </span>
        <span class="rco-qty">
          <strong class="rco-qty-main">{{ line.quantityLabel }}</strong>
          <small class="rco-qty-amount">{{ amountLabel(line) }}</small>
        </span>
      </li>
    </ul>

    <button v-if="hiddenCount > 0 || expanded" type="button" class="rco-toggle" @click="expanded = !expanded">
      <v-icon size="14" class="rco-toggle-icon">{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      {{ expanded ? t('srStorageSummarySeeLess') : seeAllLabel }}
    </button>
  </div>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'
import { formatCurrencyDetailed } from '@/composables/useFormatters'

const VISIBLE_COUNT = 5

export default {
  name: 'RestockComponentOrdersPanel',
  props: {
    /** Sortie de buildComponentOrdersPanel : { lines, total, hasUnknownCost }. */
    panel: { type: Object, required: true },
  },
  setup() {
    const { t } = useI18n()
    return { t, formatCurrencyDetailed }
  },
  data() {
    return { expanded: false }
  },
  computed: {
    visibleLines() {
      return this.expanded ? this.panel.lines : this.panel.lines.slice(0, VISIBLE_COUNT)
    },
    hiddenCount() {
      return Math.max(0, this.panel.lines.length - VISIBLE_COUNT)
    },
    seeAllLabel() {
      return this.t('srStorageSummarySeeAll').replace('{n}', this.panel.lines.length)
    },
  },
  methods: {
    /** Coût inconnu : un tiret, jamais un 0 inventé. */
    amountLabel(line) {
      return line.amount == null ? '-' : formatCurrencyDetailed(line.amount)
    },
  },
}
</script>

<style scoped>
.rco-card {
  background: var(--sr-surface, #ffffff);
  border: 1px solid var(--s1-border, var(--sr-border, #e5e7eb));
  border-radius: var(--s1-radius, 12px);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.04));
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.rco-head { display: flex; flex-direction: column; gap: 4px; }
.rco-head-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.rco-title {
  min-width: 0;
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--sr-text, #0f172a);
}
.rco-total { font-size: var(--fs-md); font-weight: var(--fw-bold); color: var(--sr-text, #0f172a); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rco-note { margin: 0; font-size: var(--fs-sm); font-weight: var(--fw-regular); color: var(--sr-faint, #9ca3af); }
.rco-empty { margin: 0; font-size: var(--fs-sm); font-weight: var(--fw-regular); color: var(--sr-faint, #9ca3af); }
.rco-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rco-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border: 1px solid var(--s1-border, var(--sr-border, #e5e7eb));
  border-radius: var(--s1-radius, 12px);
  background: var(--sr-surface, #fff);
  padding: 8px 12px;
}
.rco-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rco-name { font-size: var(--fs-sm); font-weight: var(--fw-bold); line-height: 1.25; color: var(--sr-text, #0f172a); overflow-wrap: anywhere; }
.rco-detail { font-size: var(--fs-sm); font-weight: var(--fw-regular); line-height: 1.25; color: var(--sr-faint, #9ca3af); overflow-wrap: anywhere; }
.rco-qty { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; text-align: right; max-width: 140px; }
.rco-qty-main { font-size: var(--fs-sm); font-weight: var(--fw-bold); line-height: 1.25; color: var(--sr-text, #0f172a); overflow-wrap: anywhere; }
.rco-qty-amount { font-size: var(--fs-sm); font-weight: var(--fw-regular); line-height: 1.25; color: var(--sr-faint, #9ca3af); font-variant-numeric: tabular-nums; }
.rco-toggle {
  align-self: center;
  display: inline-flex; align-items: center; gap: 4px;
  background: none; border: 0; padding: 4px 8px; cursor: pointer;
  font-size: var(--fs-sm); font-weight: var(--fw-medium); color: #64748b;
}
.rco-toggle:hover { text-decoration: underline; }
.rco-toggle:focus-visible { outline: 2px solid #64748b; outline-offset: 1px; border-radius: 4px; }
</style>
