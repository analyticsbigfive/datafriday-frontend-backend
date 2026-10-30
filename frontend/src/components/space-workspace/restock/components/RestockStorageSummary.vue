<template>
  <div class="rss-card">
    <header class="rss-head">
      <div class="rss-head-row">
        <span class="rss-title">{{ t('srStorageSummaryTitle') }}</span>
        <strong class="rss-total">{{ formatCurrencyDetailed(summary.total) }}</strong>
      </div>
      <span class="rss-subtitle">{{ subtitle }}</span>
      <div
        class="rss-progress"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="progressPercent"
      >
        <span class="rss-progress-fill" :style="{ width: progressPercent + '%' }" />
      </div>
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
      <v-icon size="14" class="rss-toggle-icon">{{ expanded ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
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
    /** Articles cochés / total, borné à 0-100 (barre fine sous le sous-titre). */
    progressPercent() {
      const total = Number(this.summary.totalCount) || 0
      if (!total) return 0
      return Math.min(100, Math.max(0, Math.round((Number(this.summary.selectedCount) / total) * 100)))
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
  border: 1px solid var(--s1-border, var(--sr-border, #e5e7eb));
  border-radius: var(--s1-radius, 12px);
  box-shadow: var(--fb-shadow-card, 0 1px 3px rgba(15, 23, 42, 0.04));
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 16px;
}
.rss-head { display: flex; flex-direction: column; gap: 4px; padding-bottom: 12px; border-bottom: 1px solid var(--s1-border, var(--sr-border, #e5e7eb)); }
.rss-head-row { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.rss-title {
  min-width: 0;
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--sr-text, #0f172a);
}
.rss-total { font-size: var(--fs-md); font-weight: var(--fw-bold); color: var(--sr-text, #0f172a); font-variant-numeric: tabular-nums; white-space: nowrap; }
.rss-subtitle { font-size: var(--fs-sm); font-weight: var(--fw-medium); color: var(--sr-muted, #6b7280); }
.rss-progress { height: 4px; margin-top: 4px; border-radius: 999px; background: #e5e7eb; overflow: hidden; }
.rss-progress-fill { display: block; height: 100%; border-radius: 999px; background: var(--sr-muted, #6b7280); transition: width 160ms ease; }
.rss-empty { font-size: var(--fs-sm); color: var(--sr-faint, #9ca3af); text-align: center; padding: 12px 8px; margin: 0; }
.rss-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.rss-item {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  border: 1px solid var(--s1-border, var(--sr-border, #e5e7eb));
  border-radius: var(--s1-radius, 12px);
  background: var(--sr-surface, #fff);
  padding: 8px 12px;
}
.rss-thumb {
  width: 36px; height: 36px; border-radius: 8px; overflow: hidden;
  display: inline-flex; align-items: center; justify-content: center;
  background: #f3f4f6;
}
.rss-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.rss-thumb-icon { color: var(--sr-faint, #9ca3af); }
.rss-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rss-name { font-size: var(--fs-sm); font-weight: var(--fw-bold); line-height: 1.25; color: var(--sr-text, #0f172a); overflow-wrap: anywhere; }
.rss-detail { font-size: var(--fs-sm); font-weight: var(--fw-regular); line-height: 1.25; color: var(--sr-faint, #9ca3af); }
.rss-qty { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; text-align: right; max-width: 140px; }
.rss-qty-main { font-size: var(--fs-sm); font-weight: var(--fw-bold); line-height: 1.25; color: var(--sr-text, #0f172a); overflow-wrap: anywhere; }
.rss-qty-amount { font-size: var(--fs-sm); font-weight: var(--fw-regular); line-height: 1.25; color: var(--sr-faint, #9ca3af); font-variant-numeric: tabular-nums; }
.rss-toggle {
  align-self: center;
  display: inline-flex; align-items: center; gap: 4px;
  background: none; border: 0; padding: 4px 8px; cursor: pointer;
  font-size: var(--fs-sm); font-weight: var(--fw-medium); color: #3b82f6;
}
.rss-toggle:hover { text-decoration: underline; }
.rss-toggle:focus-visible { outline: 2px solid #3b82f6; outline-offset: 1px; border-radius: 4px; }
</style>
