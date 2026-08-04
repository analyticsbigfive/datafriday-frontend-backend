<template>
  <v-navigation-drawer
    :model-value="modelValue"
    location="right"
    temporary
    width="440"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="lgh-head">
      <div class="lgh-head__icon"><v-icon size="20" color="white">mdi-history</v-icon></div>
      <div class="lgh-head__text">
        <div class="lgh-title">{{ t('logiHistoryTitle') }}</div>
        <div class="lgh-subtitle">{{ element?.name }}</div>
      </div>
      <button type="button" class="lgh-close" :aria-label="t('logiClose')" @click="$emit('update:modelValue', false)">
        <v-icon size="18">mdi-close</v-icon>
      </button>
    </div>

    <div class="lgh-body">
      <div v-if="loading" class="lgh-center">
        <v-progress-circular indeterminate color="primary" size="28" />
      </div>

      <template v-else>
        <v-alert v-if="error" type="error" density="compact" variant="tonal" class="ma-3">
          {{ error }}
          <template #append>
            <v-btn size="x-small" variant="text" @click="load(true)">{{ t('logiRetry') }}</v-btn>
          </template>
        </v-alert>

        <div v-else-if="!rows.length" class="lgh-center lgh-empty">
          {{ t('logiHistoryEmpty') }}
        </div>

        <template v-else>
          <template v-for="(group, idx) in groups" :key="group.dateKey">
            <button
              type="button"
              class="lgh-date-header"
              :class="{ 'lgh-date-header--open': isDateExpanded(group.dateKey, idx) }"
              :aria-expanded="isDateExpanded(group.dateKey, idx)"
              @click="toggleDate(group.dateKey, idx)"
            >
              <span class="lgh-date-header-left">
                <v-icon size="14" class="lgh-date-ico">mdi-calendar-blank-outline</v-icon>
                <span class="lgh-date-label">{{ group.dateLabel }}</span>
              </span>
              <span class="lgh-date-header-right">
                <span class="lgh-date-count">{{ group.items.length }}</span>
                <v-icon size="16" class="lgh-date-chevron">{{ isDateExpanded(group.dateKey, idx) ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
              </span>
            </button>
            <v-list v-show="isDateExpanded(group.dateKey, idx)" density="compact" class="py-0">
              <v-list-item v-for="row in group.items" :key="row.key" class="lgh-row">
                <template #prepend>
                  <v-avatar size="30" :color="row.color" variant="tonal">
                    <v-icon size="16">{{ row.icon }}</v-icon>
                  </v-avatar>
                </template>
                <v-list-item-title class="lgh-row-title">{{ row.title }}</v-list-item-title>
                <v-list-item-subtitle class="lgh-row-sub">{{ row.subtitle }}</v-list-item-subtitle>
                <template #append>
                  <div class="lgh-qty" :class="row.negative ? 'lgh-qty-out' : 'lgh-qty-in'">
                    {{ row.qtyLabel }}
                  </div>
                </template>
              </v-list-item>
            </v-list>
          </template>
        </template>

        <div v-if="nextCursor" class="lgh-more">
          <v-btn size="small" variant="text" :loading="loadingMore" @click="loadMore">
            {{ t('logiHistoryMore') }}
          </v-btn>
        </div>
      </template>
    </div>
  </v-navigation-drawer>
</template>

<script>
import { useStore } from 'vuex'
import { useI18n } from '@/i18n/useI18n'

const REASON_META = {
  DELIVERY: { icon: 'mdi-truck-delivery-outline', color: 'success', key: 'logiReasonDelivery' },
  TRANSFER_SHOP: { icon: 'mdi-swap-horizontal', color: 'info', key: 'logiReasonTransferShop' },
  TRANSFER_STORAGE: { icon: 'mdi-warehouse', color: 'info', key: 'logiReasonTransferStorage' },
  EXPIRY: { icon: 'mdi-calendar-remove', color: 'warning', key: 'logiReasonExpiry' },
  SALE: { icon: 'mdi-cart-outline', color: 'primary', key: 'logiReasonSale' },
  INVENTORY_RESET: { icon: 'mdi-restore', color: 'secondary', key: 'logiReasonReset' },
  OTHER: { icon: 'mdi-pencil-outline', color: 'grey', key: 'logiReasonOther' },
}

/**
 * Historique de logistique d'un PDV/storage : mouvements manuels ligne à ligne
 * + ventes agrégées par event (une seule ligne par event, spec 2026-07-06).
 * Chargé à l'ouverture via l'action logistics/loadHistory (pas de cache).
 */
export default {
  name: 'LogisticHistoryDrawer',
  props: {
    modelValue: { type: Boolean, default: false },
    /** { id, name } */
    element: { type: Object, default: null },
  },
  emits: ['update:modelValue'],
  setup() {
    const store = useStore()
    const { t } = useI18n()
    return { store, t }
  },
  data() {
    return {
      loading: false,
      loadingMore: false,
      error: null,
      movements: [],
      salesByEvent: [],
      nextCursor: null,
      // Accordéon par jour : override explicite (clé = dateKey) — sans entrée,
      // seul le groupe le plus récent (index 0) est ouvert par défaut.
      expandedDates: {},
    }
  },
  created() {
    // Jeton anti-race non réactif (invalidé par chaque load(true)).
    this._histSeq = 0
  },
  computed: {
    /** Mouvements + lignes ventes/event fusionnés, triés par date décroissante. */
    rows() {
      const rows = []
      for (const m of this.movements) {
        const meta = REASON_META[m.reason] || REASON_META.OTHER
        const negative = (m.packedDelta || 0) < 0 || (m.looseDelta || 0) < 0
        let subtitle = this.formatTime(m.createdAt)
        if (m.counterpartyName) {
          subtitle += ` — ${negative ? this.t('logiHistoryTo') : this.t('logiHistoryFrom')} ${m.counterpartyName}`
        }
        if (m.reason === 'OTHER' && m.note) subtitle += ` — ${m.note}`
        if (m.reason === 'EXPIRY' && m.expiryDate) subtitle += ` — DLC ${this.formatDate(m.expiryDate)}`
        rows.push({
          key: `mv-${m.id}`,
          at: new Date(m.createdAt).getTime(),
          icon: meta.icon,
          color: meta.color,
          title: `${m.itemKey} · ${this.t(meta.key)}`,
          subtitle,
          negative,
          qtyLabel: this.qtyLabel(m.packedDelta, m.looseDelta),
        })
      }
      // Les opérations de transactions (ventes) sont agrégées par event : 1 ligne.
      for (const s of this.salesByEvent) {
        rows.push({
          key: `ev-${s.eventId ?? 'none'}`,
          at: new Date(s.lastAt).getTime(),
          icon: REASON_META.SALE.icon,
          color: REASON_META.SALE.color,
          title: s.eventName || this.t('logiHistorySalesNoEvent'),
          subtitle: `${this.formatTime(s.lastAt)} — ${this.t('logiHistorySales')}`,
          negative: true,
          qtyLabel: `−${this.round(s.soldUnits)} ${this.t('logiUnits')}`,
        })
      }
      return rows.sort((a, b) => b.at - a.at)
    },
    /** `rows` regroupées par jour calendaire (en-tête « Aujourd'hui »/« Hier »/date). */
    groups() {
      const map = new Map()
      for (const row of this.rows) {
        const date = new Date(row.at)
        const dayKey = Number.isNaN(date.getTime()) ? 'unknown' : date.toDateString()
        let group = map.get(dayKey)
        if (!group) {
          group = { dateKey: dayKey, dateLabel: this.formatDateHeader(row.at), items: [] }
          map.set(dayKey, group)
        }
        group.items.push(row)
      }
      return [...map.values()]
    },
  },
  watch: {
    modelValue(open) {
      if (open) this.load(true)
    },
  },
  methods: {
    isDateExpanded(dateKey, index) {
      if (Object.prototype.hasOwnProperty.call(this.expandedDates, dateKey)) return this.expandedDates[dateKey]
      return index === 0
    },
    toggleDate(dateKey, index) {
      this.expandedDates = { ...this.expandedDates, [dateKey]: !this.isDateExpanded(dateKey, index) }
    },
    round(n) {
      return Math.round((Number(n) || 0) * 100) / 100
    },
    qtyLabel(packedDelta, looseDelta) {
      const parts = []
      if (packedDelta) parts.push(`${packedDelta > 0 ? '+' : ''}${packedDelta} ${this.t('logiPackedShort')}`)
      if (looseDelta) parts.push(`${looseDelta > 0 ? '+' : ''}${this.round(looseDelta)} ${this.t('logiLooseShort')}`)
      return parts.join(' · ') || '—'
    },
    formatDate(d) {
      const date = new Date(d)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    },
    formatTime(d) {
      const date = new Date(d)
      if (Number.isNaN(date.getTime())) return ''
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    },
    /** En-tête de groupe : « Aujourd'hui » / « Hier » / date complète sinon. */
    formatDateHeader(d) {
      const date = new Date(d)
      if (Number.isNaN(date.getTime())) return ''
      const today = new Date()
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      if (date.toDateString() === today.toDateString()) return this.t('logiToday')
      if (date.toDateString() === yesterday.toDateString()) return this.t('logiYesterday')
      return date.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
    },
    async load(reset = false) {
      if (!this.element?.id) return
      // Invalide un loadMore en vol (réouverture rapide → réponse obsolète ignorée).
      const mySeq = ++this._histSeq
      this.loading = true
      this.error = null
      if (reset) {
        this.movements = []
        this.salesByEvent = []
        this.nextCursor = null
        this.expandedDates = {}
      }
      try {
        const data = await this.store.dispatch('logistics/loadHistory', { elementId: this.element.id })
        if (mySeq !== this._histSeq) return
        this.movements = data?.movements || []
        this.salesByEvent = data?.salesByEvent || []
        this.nextCursor = data?.nextCursor || null
      } catch (e) {
        console.error('[logistics] 🕘❌ history ÉCHEC —', e?.response?.status, e?.message)
        if (mySeq === this._histSeq) this.error = e?.userMessage || this.t('logiHistoryError')
      } finally {
        if (mySeq === this._histSeq) this.loading = false
      }
    },
    async loadMore() {
      if (!this.nextCursor || !this.element?.id || this.loadingMore || this.loading) return
      const mySeq = this._histSeq
      this.loadingMore = true
      try {
        const data = await this.store.dispatch('logistics/loadHistory', {
          elementId: this.element.id,
          cursor: this.nextCursor,
        })
        if (mySeq !== this._histSeq) return
        this.movements = [...this.movements, ...(data?.movements || [])]
        this.nextCursor = data?.nextCursor || null
      } catch (e) {
        console.error('[logistics] 🕘❌ history more ÉCHEC —', e?.message)
        if (mySeq === this._histSeq) this.error = e?.userMessage || this.t('logiHistoryError')
      } finally {
        if (mySeq === this._histSeq) this.loadingMore = false
      }
    },
  },
}
</script>

<style scoped>
:deep(.v-navigation-drawer) { max-width: 100vw; }
/* Header rouge charte (le corps reste piloté par le contrat --fb-* de l'hôte). */
.lgh-head {
  display: flex;
  align-items: center;
  gap: 12px;
  /* padding-top généreux : le contenu ne colle plus au bord haut du drawer. */
  padding: 22px 18px 18px;
  background: #ff3131;
}
.lgh-head__icon {
  width: 38px; height: 38px; border-radius: 11px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.lgh-head__text { flex: 1; min-width: 0; }
.lgh-title { font-weight: 700; font-size: 1rem; color: #fff; }
.lgh-subtitle { color: rgba(255,255,255,.8); font-size: 0.82rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgh-close {
  width: 30px; height: 30px; border: none; border-radius: 8px;
  background: rgba(255,255,255,.18); color: rgba(255,255,255,.9);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .18s; flex-shrink: 0;
}
.lgh-close:hover { background: rgba(255,255,255,.3); }
.lgh-body { overflow-y: auto; }
.lgh-date-header {
  appearance: none;
  width: 100%;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 1;
  padding: 11px 16px;
  border: 0;
  border-bottom: 1px solid var(--fb-border, #f3f4f6);
  font: inherit;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--fb-muted, #6b7280);
  background: var(--fb-subtle, #f9fafb);
  cursor: pointer;
  transition: background .15s, color .15s;
}
.lgh-date-header:hover { background: var(--fb-border, #f3f4f6); }
/* Jour déplié : léger fond marque + libellé plus contrasté → repère visuel clair. */
.lgh-date-header--open { background: rgba(255, 49, 49, 0.06); color: var(--fb-text, #111827); }
.lgh-date-header-left { display: flex; align-items: center; gap: 8px; min-width: 0; }
.lgh-date-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgh-date-ico { color: #ff3131; opacity: .55; flex-shrink: 0; }
.lgh-date-header--open .lgh-date-ico { opacity: 1; }
.lgh-date-header-right { display: flex; align-items: center; gap: 6px; color: var(--fb-faint, #9ca3af); flex-shrink: 0; }
.lgh-date-chevron { color: var(--fb-faint, #9ca3af); }
.lgh-date-count {
  min-width: 20px;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(255, 49, 49, 0.12);
  color: #ff3131;
  font-size: 0.68rem;
  font-weight: 700;
  text-align: center;
  text-transform: none;
  letter-spacing: normal;
}
.lgh-center { display: flex; justify-content: center; padding: 32px 16px; }
.lgh-empty { color: var(--fb-faint, #9ca3af); font-size: 0.9rem; }
.lgh-row { border-bottom: 1px solid var(--fb-border, #f3f4f6); }
.lgh-row-title { font-size: 0.85rem; font-weight: 600; white-space: normal; }
.lgh-row-sub { font-size: 0.75rem; }
.lgh-qty { font-size: 0.8rem; font-weight: 700; white-space: nowrap; margin-left: 8px; }
.lgh-qty-in { color: #16a34a; }
.lgh-qty-out { color: #ff3131; }
.lgh-more { display: flex; justify-content: center; padding: 8px 0 16px; }

/* Vert 600 prévu pour du texte sur fond clair → version claire en sombre.
   Le rouge de marque #ff3131 reste lisible sur les deux fonds. */
.v-theme--dataFridayDark .lgh-qty-in { color: #86efac; }
</style>
