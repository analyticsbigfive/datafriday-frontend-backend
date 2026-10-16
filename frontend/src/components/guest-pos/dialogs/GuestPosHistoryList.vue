<template>
  <div class="pos-hlist">
    <div class="pos-hlist__filters">
      <label class="pos-hlist__search">
        <Search :size="16" aria-hidden="true" />
        <input type="text" :value="search" :placeholder="t('guestPosHistorySearch')" :aria-label="t('guestPosHistorySearchLabel')" @input="$emit('update:search', $event.target.value)" />
      </label>
      <div class="pos-hlist__chips">
        <button
          v-for="chip in chips"
          :key="chip.id"
          type="button"
          class="pos-hlist__chip"
          :class="{ 'pos-hlist__chip--on': filter === chip.id }"
          @click="$emit('update:filter', chip.id)"
        >{{ chip.label }} <span class="pos-hlist__chip-count">{{ chip.count }}</span></button>
      </div>
    </div>
    <div class="pos-hlist__rows">
      <button
        v-for="row in rows"
        :key="row.key"
        type="button"
        class="pos-hlist__row"
        :class="{ 'pos-hlist__row--on': row.key === selectedKey }"
        @click="$emit('select', row.key)"
      >
        <span class="pos-hlist__dot" :class="`pos-hlist__dot--${row.state}`" aria-hidden="true" />
        <span class="pos-hlist__row-text">
          <span class="pos-hlist__row-title">{{ t('guestPosHistoryTicket').replace('{number}', row.ticketNumber) }}</span>
          <span class="pos-hlist__row-sub">{{ row.time }} · {{ row.paymentLabel }}</span>
        </span>
        <span class="pos-hlist__row-total" :class="{ 'pos-hlist__row-total--cancelled': row.cancelled }">{{ row.totalLabel }}</span>
      </button>
      <div v-if="rows.length === 0" class="pos-hlist__empty">{{ loading ? t('guestPosLoading') : t('guestPosHistoryNone') }}</div>
      <button v-if="hasMore" type="button" class="pos-hlist__more" :disabled="loading" @click="$emit('load-more')">{{ t('guestPosHistoryMore') }}</button>
    </div>
  </div>
</template>

<script setup>
import { Search } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'

defineProps({
  chips: { type: Array, default: () => [] }, // [{ id, label, count }]
  rows: { type: Array, default: () => [] }, // [{ key, state, ticketNumber, time, paymentLabel, totalLabel, cancelled }]
  filter: { type: String, default: 'all' },
  search: { type: String, default: '' },
  selectedKey: { type: String, default: null },
  loading: { type: Boolean, default: false },
  hasMore: { type: Boolean, default: false },
})
defineEmits(['update:filter', 'update:search', 'select', 'load-more'])

const { t } = useI18n()
</script>

<style scoped>
.pos-hlist { width: 360px; flex-shrink: 0; box-sizing: border-box; border-right: 1px solid var(--pos-border); display: flex; flex-direction: column; min-height: 0; }
.pos-hlist__filters { padding: 14px 16px 10px; display: flex; flex-direction: column; gap: 10px; }
.pos-hlist__search { display: flex; align-items: center; gap: 8px; min-height: 44px; box-sizing: border-box; padding: 0 12px; border: 1px solid var(--pos-border-strong); border-radius: 8px; color: #9CA3AF; }
.pos-hlist__search input { flex: 1; min-width: 0; border: 0; outline: none; font-family: inherit; font-size: var(--fs-md); color: var(--pos-text); background: transparent; }
.pos-hlist__chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pos-hlist__chip { min-height: 44px; padding: 0 12px; border-radius: 999px; font-size: var(--fs-base); font-weight: var(--fw-bold); border: 1px solid var(--pos-border-strong); background: var(--pos-surface); color: #374151; cursor: pointer; }
.pos-hlist__chip--on { border-color: var(--pos-accent); background: var(--pos-accent); color: #fff; }
.pos-hlist__chip-count { opacity: 0.7; }
.pos-hlist__rows { flex: 1; min-height: 0; overflow-y: auto; }
.pos-hlist__row { width: 100%; box-sizing: border-box; min-height: 64px; padding: 10px 16px; display: flex; align-items: center; gap: 12px; border: 0; border-bottom: 1px solid #F0F1F3; background: var(--pos-surface); color: var(--pos-text); box-shadow: inset 3px 0 0 transparent; cursor: pointer; }
.pos-hlist__row--on { background: var(--pos-accent-soft); box-shadow: inset 3px 0 0 var(--pos-accent); }
.pos-hlist__dot { width: 9px; height: 9px; flex-shrink: 0; border-radius: 5px; background: var(--pos-ok); }
.pos-hlist__dot--pending { background: #D97706; }
.pos-hlist__dot--cancelled, .pos-hlist__dot--rejected { background: var(--pos-danger); }
.pos-hlist__row-text { flex: 1; min-width: 0; text-align: left; }
.pos-hlist__row-title { display: block; font-size: var(--fs-md); font-weight: var(--fw-bold); }
.pos-hlist__row-sub { display: block; font-size: var(--fs-sm); color: var(--pos-muted); margin-top: 2px; }
.pos-hlist__row-total { font-size: var(--fs-md); font-weight: var(--fw-bold); font-variant-numeric: tabular-nums; }
.pos-hlist__row-total--cancelled { text-decoration: line-through; color: #9CA3AF; }
.pos-hlist__empty { padding: 32px 16px; text-align: center; font-size: var(--fs-md); color: var(--pos-muted); }
.pos-hlist__more { width: 100%; min-height: 48px; border: 0; background: transparent; color: var(--pos-accent); font-size: var(--fs-md); font-weight: var(--fw-bold); cursor: pointer; }
</style>
