<template>
  <div class="rss-card">
    <header class="rss-head">
      <div class="rss-head-copy">
        <span class="rss-title">{{ t('srStorageSummaryTitle') }}</span>
        <span class="rss-subtitle">{{ subtitle }}</span>
      </div>
      <strong class="rss-total">{{ formatCurrencyDetailed(summary.total) }}</strong>
    </header>

    <p v-if="!summary.lines.length" class="rss-empty">{{ t('srStorageSummaryEmpty') }}</p>

    <ul v-else class="rss-list">
      <li v-for="line in visibleLines" :key="line.itemKey" class="rss-item">
        <span class="rss-thumb">
          <img v-if="line.image" :src="line.image" alt="" loading="lazy" />
          <v-icon v-else size="20" class="rss-thumb-icon">mdi-package-variant-closed</v-icon>
        </span>
        <span class="rss-copy">
          <strong class="rss-name" :title="line.name">{{ line.name }}</strong>
          <small v-if="detail(line)" class="rss-detail">{{ detail(line) }}</small>
        </span>
        <span class="rss-qty">
          <strong class="rss-qty-main">{{ line.quantityLabel }}</strong>
          <small class="rss-qty-amount">{{ formatCurrencyDetailed(line.amount) }}</small>
        </span>
      </li>
    </ul>

    <button v-if="hiddenCount > 0 || expanded" type="button" class="rss-toggle" @click="expanded = !expanded">
      <v-icon size="14" class="me-1">{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
      {{ expanded ? t('srStorageSummarySeeLess') : seeAllLabel }}
    </button>
  </div>
</template>

<script>
import { useI18n } from '@/i18n/useI18n'
import { formatCurrencyDetailed } from '@/composables/useFormatters'

const VISIBLE_COUNT = 5

export default {
  name: 'RestockStorageSummary',
  props: {
    /** Sortie de buildStorageSummary : { total, selectedCount, totalCount, lines }. */
    summary: { type: Object, required: true },
  },
  setup() {
    const { t } = useI18n()
    return { t, formatCurrencyDetailed }
  },
  data() {
    return { expanded: false }
  },
  computed: {
    subtitle() {
      return this.t('srStorageSummarySubtitle')
        .replace('{n}', this.summary.selectedCount)
        .replace('{total}', this.summary.totalCount)
    },
    visibleLines() {
      return this.expanded ? this.summary.lines : this.summary.lines.slice(0, VISIBLE_COUNT)
    },
    hiddenCount() {
      return Math.max(0, this.summary.lines.length - VISIBLE_COUNT)
    },
    seeAllLabel() {
      return this.t('srStorageSummarySeeAll').replace('{n}', this.summary.lines.length)
    },
  },
  methods: {
    /** « a/b PDV » puis « et c/d Stock » : uniquement ce que les données donnent. */
    detail(line) {
      const parts = []
      if (line.pdv) {
        parts.push(
          (line.pdv.b != null ? this.t('srStorageSummaryPdvOf') : this.t('srStorageSummaryPdv'))
            .replace('{a}', line.pdv.a)
            .replace('{b}', line.pdv.b),
        )
      }
      if (line.stock) {
        const stock = this.t('srStorageSummaryStock').replace('{c}', line.stock.c).replace('{d}', line.stock.d)
        parts.push(parts.length ? `${this.t('srStorageSummaryAnd')} ${stock}` : stock)
      }
      return parts.join(' ')
    },
  },
}
</script>

<style scoped>
.rss-card {
  background: var(--sr-surface, #ffffff);
  border: 1px solid var(--sr-border, #d9e2ec);
  border-radius: 18px;
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.04));
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}
.rss-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
.rss-head-copy { display: flex; flex-direction: column; min-width: 0; }
.rss-title { font-size: var(--fs-md); font-weight: var(--fw-bold); color: var(--sr-text, #0f172a); }
.rss-subtitle { font-size: var(--fs-base); font-weight: var(--fw-medium); color: var(--sr-faint, #9ca3af); }
.rss-total { font-size: var(--fs-lg); font-weight: var(--fw-bold); color: var(--sr-text, #0f172a); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rss-empty { font-size: var(--fs-base); color: var(--sr-faint, #9ca3af); text-align: center; padding: 12px 8px; margin: 0; }
.rss-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rss-item {
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 1px solid var(--sr-border, #e5e7eb);
  border-radius: 12px;
  background: var(--sr-surface, #fff);
  padding: 8px 10px;
}
.rss-thumb {
  width: 40px; height: 40px; border-radius: 10px; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--sr-border, #f1f5f9);
}
.rss-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rss-thumb-icon { color: var(--sr-faint, #9ca3af); }
.rss-copy { display: flex; flex-direction: column; min-width: 0; }
.rss-name { font-size: var(--fs-base); font-weight: var(--fw-semibold); color: var(--sr-text, #0f172a); overflow-wrap: anywhere; }
.rss-detail { font-size: var(--fs-base); font-weight: var(--fw-medium); color: var(--sr-faint, #9ca3af); }
.rss-qty { display: flex; flex-direction: column; align-items: flex-end; text-align: right; max-width: 150px; }
.rss-qty-main { font-size: var(--fs-base); font-weight: var(--fw-semibold); color: var(--sr-text, #0f172a); overflow-wrap: anywhere; }
.rss-qty-amount { font-size: var(--fs-base); font-weight: var(--fw-medium); color: var(--sr-faint, #9ca3af); font-variant-numeric: tabular-nums; }
.rss-toggle {
  align-self: center;
  display: inline-flex; align-items: center;
  background: none; border: 0; cursor: pointer;
  font-size: var(--fs-base); font-weight: var(--fw-medium); color: #3b82f6;
}
</style>
