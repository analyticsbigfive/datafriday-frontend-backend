<template>
  <div class="ss-strip" :class="{ 'ss-strip--dark': isDark }">
    <div
      v-for="(card, i) in statCards"
      :key="card.key"
      class="ss-stat"
      :class="{ 'ss-stat--divider': i > 0 }"
    >
      <!-- Label + icon -->
      <div class="ss-stat__head">
        <span class="ss-stat__icon" :style="{ background: card.iconBg }">
          <component :is="card.icon" :size="13" :color="card.color" />
        </span>
        <span class="ss-stat__label">{{ card.label }}</span>
      </div>

      <!-- Value -->
      <div class="ss-stat__val" :style="{ color: card.color }">
        {{ card.isCount ? formatNumber(card.value) : formatCurrency(card.value) }}
      </div>

      <!-- Progress bar -->
      <div v-if="!card.isCount" class="ss-stat__bar-track">
        <div
          class="ss-stat__bar-fill"
          :style="{ width: card.percent + '%', background: card.color }"
        />
      </div>

      <!-- Percent / footer -->
      <div class="ss-stat__pct">
        {{ card.isCount ? 'billets scannés' : (card.percent === 100 ? 'Revenu global' : card.percent + '% du total') }}
      </div>
    </div>
  </div>
</template>

<script>
import { House, ShoppingBag, Ticket, TrendingUp } from 'lucide-vue-next'
import { useTheme } from 'vuetify'

export default {
  name: 'SpaceStats',
  components: { TrendingUp, Ticket, ShoppingBag, House },
  setup() {
    const { global } = useTheme()
    return { theme: global }
  },
  props: {
    totalRevenue:      { type: Number, default: 0 },
    totalFBRevenue:    { type: Number, default: 0 },
    totalTicketingCount:{ type: Number, default: 0 },
    totalMerchRevenue: { type: Number, default: 0 },
  },
  computed: {
    isDark() { return this.theme.current.value.dark },
    safe()   { return this.totalRevenue || 1 },
    statCards() {
      return [
        {
          key: 'total',
          label: 'Total Revenue',
          value: this.totalRevenue,
          color: '#ff3131',
          iconBg: 'rgba(255, 49, 49,.10)',
          icon: 'TrendingUp',
          percent: 100,
        },
        {
          key: 'fb',
          label: 'F&B Revenue',
          value: this.totalFBRevenue,
          color: '#059669',
          iconBg: 'rgba(5,150,105,.10)',
          icon: 'ShoppingBag',
          percent: Math.round((this.totalFBRevenue / this.safe) * 100),
        },
        {
          key: 'ticketing',
          label: 'Ticketing',
          value: this.totalTicketingCount,
          color: '#2563eb',
          iconBg: 'rgba(37,99,235,.10)',
          icon: 'Ticket',
          isCount: true,
        },
        {
          key: 'merch',
          label: 'Merch',
          value: this.totalMerchRevenue,
          color: '#ea580c',
          iconBg: 'rgba(234,88,12,.10)',
          icon: 'House',
          percent: Math.round((this.totalMerchRevenue / this.safe) * 100),
        },
      ]
    },
  },
  methods: {
    formatCurrency(v) {
      return (Number(v) || 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
    },
    formatNumber(v) {
      return (Number(v) || 0).toLocaleString('fr-FR')
    },
  },
}
</script>

<style scoped>
/* ── Strip container ── */
.ss-strip {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: #fff;
  border: 1px solid rgba(0, 0, 0, .06);
  border-radius: 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, .06);
  margin-bottom: 16px;
  overflow: hidden;
}
.ss-strip--dark {
  background: #1f2937;
  border-color: #374151;
}

@media (max-width: 960px) { .ss-strip { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px) { .ss-strip { grid-template-columns: 1fr; } }

/* ── Each stat section ── */
.ss-stat {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  transition: background .15s;
}
.ss-stat:hover { background: #fafafa; }
.ss-strip--dark .ss-stat:hover { background: rgba(255,255,255,.04); }

.ss-stat--divider {
  border-left: 1px solid #f0f0f0;
}
.ss-strip--dark .ss-stat--divider { border-left-color: #374151; }

@media (max-width: 960px) {
  .ss-stat:nth-child(3) { border-top: 1px solid #f0f0f0; }
  .ss-stat:nth-child(4) { border-top: 1px solid #f0f0f0; }
  .ss-stat:nth-child(3) { border-left: none; }
  .ss-strip--dark .ss-stat:nth-child(3),
  .ss-strip--dark .ss-stat:nth-child(4) { border-top-color: #374151; }
}
@media (max-width: 480px) {
  .ss-stat--divider { border-left: none; border-top: 1px solid #f0f0f0; }
  .ss-strip--dark .ss-stat--divider { border-top-color: #374151; }
}

/* ── Head: icon + label ── */
.ss-stat__head {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ss-stat__icon {
  width: 24px;
  height: 24px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ss-stat__label {
  font-size: var(--fs-xs);
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: #9ca3af;
  white-space: nowrap;
}
.ss-strip--dark .ss-stat__label { color: #6b7280; }

/* ── Value ── */
.ss-stat__val {
  font-size: var(--fs-lg);
  font-weight: 700;
  line-height: 1.1;
  letter-spacing: -.02em;
}

/* ── Bar ── */
.ss-stat__bar-track {
  height: 3px;
  background: #f3f4f6;
  border-radius: 2px;
  overflow: hidden;
}
.ss-strip--dark .ss-stat__bar-track { background: #374151; }
.ss-stat__bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width .8s cubic-bezier(.4, 0, .2, 1);
}

/* ── Percent ── */
.ss-stat__pct {
  font-size: var(--fs-xs);
  color: #9ca3af;
  font-weight: 400;
}
.ss-strip--dark .ss-stat__pct { color: #6b7280; }
</style>
