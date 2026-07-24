<template>
  <!-- Onglet Inventaire live (module Live v2, 11_LIVE.md §3 / LIVE_API_GUIDE.md §3).
       Arbre dépliable Shop→items ou Item→shops sur GET /spaces/:id/live/inventory.
       « Restant » = (packs × unitsPerPack + loose) − consumedLoose, repack côté vue
       (convention Logistic, logistics.api.js:8-15). -->
  <div class="lip" :class="{ 'lip--dark': isDark }">

    <!-- Toolbar -->
    <div class="lip-toolbar">
      <div class="lip-title">
        <Boxes :size="18" />
        <span>{{ t('anLiveInvTitle') }}</span>
      </div>
      <div class="lip-view-toggle">
        <button
          class="lip-view-btn"
          :class="{ 'lip-view-btn--active': view === 'shop' }"
          @click="view = 'shop'"
        >{{ t('anLiveInvByShop') }}</button>
        <button
          class="lip-view-btn"
          :class="{ 'lip-view-btn--active': view === 'item' }"
          @click="view = 'item'"
        >{{ t('anLiveInvByItem') }}</button>
      </div>
      <v-spacer />
      <span v-if="lastUpdatedLabel" class="lip-updated">{{ t('anLiveInvUpdated') }} {{ lastUpdatedLabel }}</span>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-3">
      {{ error }}
    </v-alert>

    <!-- Loading initial -->
    <div v-if="loading && !inv" class="lip-empty">
      <v-progress-circular indeterminate color="#ff3131" size="30" width="3" />
    </div>

    <!-- Vide -->
    <div v-else-if="!rows.length" class="lip-empty">
      <div class="lip-empty__icon"><Boxes :size="24" /></div>
      <p class="lip-empty__text">{{ t('anLiveInvEmpty') }}</p>
    </div>

    <!-- Arbre -->
    <div v-else class="lip-tree">
      <div v-for="node in rows" :key="node.key" class="lip-node">
        <button class="lip-node__head" @click="toggle(node.key)">
          <ChevronDown v-if="isOpen(node.key)" :size="16" class="lip-chevron" />
          <ChevronRight v-else :size="16" class="lip-chevron" />
          <span class="lip-node__name">{{ node.label }}</span>
          <span class="lip-node__count">
            {{ node.children.length }}
            {{ view === 'shop' ? t('anLiveInvItemsUnit') : t('anLiveInvShopsUnit') }}
          </span>
        </button>

        <div v-if="isOpen(node.key)" class="lip-rows">
          <div class="lip-rows__header">
            <span class="lip-rows__col lip-rows__col--main">
              {{ view === 'shop' ? t('anLiveInvColItem') : t('anLiveInvColShop') }}
            </span>
            <span class="lip-rows__col lip-rows__col--num">{{ t('anLiveInvColRemaining') }}</span>
            <span class="lip-rows__col lip-rows__col--num">{{ t('anLiveInvColConsumed') }}</span>
          </div>
          <div v-for="child in node.children" :key="child.key" class="lip-row">
            <span class="lip-row__main">{{ child.label }}</span>
            <span class="lip-row__val" :class="{ 'lip-row__val--empty': child.remainingLoose <= 0 }">
              {{ child.remainingLabel }}
            </span>
            <span class="lip-row__consumed">{{ formatNumber(child.consumedLoose) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { Boxes, ChevronDown, ChevronRight } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { getSpaceLiveInventory } from '@/api/endpoints/space.api';

// Rafraîchissement live aligné sur le mode flux d'AnalyseView (11_LIVE.md §5).
const LIVE_POLL_MS = 15000;

export default {
  name: 'LiveInventoryPanel',
  components: { Boxes, ChevronDown, ChevronRight },
  props: {
    spaceId: { type: String, default: '' },
    isDark: { type: Boolean, default: false },
    // Onglet réellement affiché → ne poller que quand visible.
    active: { type: Boolean, default: true },
  },
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      inv: null,
      loading: false,
      error: '',
      view: 'shop', // 'shop' | 'item'
      expanded: [], // clés dépliées
      lastUpdated: null,
      pollTimer: null,
    };
  },
  computed: {
    rows() {
      if (!this.inv) return [];
      if (this.view === 'shop') {
        return (this.inv.shops || []).map((s) => ({
          key: `shop:${s.shopId}`,
          label: s.shopName || s.shopId || '—',
          children: (s.items || []).map((it) => this.buildChild(it, it.itemKey || '—', `${s.shopId}:${it.itemKey}`)),
        }));
      }
      return (this.inv.items || []).map((it) => ({
        key: `item:${it.itemKey}`,
        label: it.itemKey || '—',
        children: (it.shops || []).map((s) => this.buildChild(s, s.shopName || s.shopId || '—', `${it.itemKey}:${s.shopId}`)),
      }));
    },
    lastUpdatedLabel() {
      if (!this.lastUpdated) return '';
      try { return new Date(this.lastUpdated).toLocaleTimeString(); } catch { return ''; }
    },
  },
  watch: {
    spaceId() { this.fetchInventory(); },
    active(v) {
      if (v) { this.fetchInventory(); this.startPolling(); }
      else { this.stopPolling(); }
    },
  },
  mounted() {
    this.fetchInventory();
    if (this.active) this.startPolling();
  },
  beforeUnmount() {
    this.stopPolling();
  },
  methods: {
    // Restant affiché = (packs × unitsPerPack + loose) − consumedLoose, repack côté
    // vue (casse de pack). Composants bruts fournis par l'endpoint (LIVE_API_GUIDE §3.3).
    buildChild(node, label, keySeed) {
      const unitsPerPack = Number(node.unitsPerPack) || 0;
      const packed = Number(node.packedUnits) || 0;
      const loose = Number(node.looseUnits) || 0;
      const consumed = Number(node.consumedLoose) || 0;
      const perPack = unitsPerPack > 0 ? unitsPerPack : 1;
      const totalLoose = packed * perPack + loose;
      const remainingLoose = Math.max(0, totalLoose - consumed);

      let remainingLabel;
      if (unitsPerPack > 1) {
        const packs = Math.floor(remainingLoose / unitsPerPack);
        const rest = remainingLoose % unitsPerPack;
        remainingLabel = packs > 0
          ? `${this.formatNumber(packs)} × ${unitsPerPack}${rest ? ` + ${rest}` : ''}`
          : `${this.formatNumber(rest)}`;
      } else {
        remainingLabel = this.formatNumber(remainingLoose);
      }
      return { key: keySeed, label, remainingLoose, consumedLoose: consumed, remainingLabel };
    },
    async fetchInventory() {
      if (!this.spaceId) return;
      this.loading = true;
      this.error = '';
      try {
        const res = await getSpaceLiveInventory(this.spaceId);
        this.inv = res || { shops: [], items: [] };
        this.lastUpdated = Date.now();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('anLiveInvError');
      } finally {
        this.loading = false;
      }
    },
    startPolling() {
      this.stopPolling();
      this.pollTimer = setInterval(() => this.fetchInventory(), LIVE_POLL_MS);
    },
    stopPolling() {
      if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    },
    toggle(key) {
      const i = this.expanded.indexOf(key);
      if (i === -1) this.expanded.push(key);
      else this.expanded.splice(i, 1);
    },
    isOpen(key) { return this.expanded.includes(key); },
    formatNumber(v) {
      const n = Number(v);
      return Number.isFinite(n) ? n.toLocaleString('fr-FR') : '0';
    },
  },
};
</script>

<style scoped>
.lip {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  overflow: hidden;
}

/* Toolbar */
.lip-toolbar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-bottom: 1px solid #e5e7eb;
  flex-wrap: wrap;
}
.lip-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
  font-weight: 700;
  color: #111827;
}
.lip-view-toggle {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  border-radius: 100px;
  background: #f3f4f6;
}
.lip-view-btn {
  padding: 4px 14px;
  border: none;
  background: transparent;
  border-radius: 100px;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #6b7280;
  cursor: pointer;
  transition: background .15s, color .15s;
}
.lip-view-btn--active { background: #ff3131; color: #fff; }
.lip-updated { font-size: 0.75rem; color: #9ca3af; white-space: nowrap; }

/* Empty / loading */
.lip-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 220px;
  color: #9ca3af;
}
.lip-empty__icon {
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  display: flex; align-items: center; justify-content: center; color: #ff3131;
}
.lip-empty__text { font-size: 0.85rem; font-weight: 500; color: #6b7280; margin: 0; }

/* Tree */
.lip-tree { padding: 8px; }
.lip-node { border-radius: 12px; overflow: hidden; }
.lip-node + .lip-node { margin-top: 4px; }
.lip-node__head {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 11px 12px;
  border: none;
  background: #f9fafb;
  border-radius: 10px;
  cursor: pointer;
  transition: background .15s;
}
.lip-node__head:hover { background: #f3f4f6; }
.lip-chevron { color: #9ca3af; flex-shrink: 0; }
.lip-node__name { font-size: 0.875rem; font-weight: 700; color: #111827; flex: 1; text-align: left; }
.lip-node__count { font-size: 0.75rem; color: #9ca3af; white-space: nowrap; }

.lip-rows { padding: 2px 6px 8px 30px; }
.lip-rows__header {
  display: grid;
  grid-template-columns: 1fr 130px 110px;
  gap: 8px;
  padding: 8px 12px 6px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: #9ca3af;
}
.lip-rows__col--num { text-align: right; }
.lip-row {
  display: grid;
  grid-template-columns: 1fr 130px 110px;
  gap: 8px;
  padding: 8px 12px;
  border-top: 1px solid #f3f4f6;
  font-size: 0.8125rem;
  align-items: center;
}
.lip-row__main {
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lip-row__val { text-align: right; font-weight: 700; color: #111827; font-variant-numeric: tabular-nums; }
.lip-row__val--empty { color: #ff3131; }
.lip-row__consumed { text-align: right; color: #6b7280; font-variant-numeric: tabular-nums; }

/* ── Dark mode (palette slate, alignée AnalyseView) ── */
.lip--dark { background: #1e293b; border-color: rgba(255,255,255,.08); }
.lip--dark .lip-toolbar { border-bottom-color: rgba(255,255,255,.08); }
.lip--dark .lip-title { color: #f9fafb; }
.lip--dark .lip-view-toggle { background: #0f172a; }
.lip--dark .lip-view-btn { color: #94a3b8; }
.lip--dark .lip-view-btn--active { background: #ff3131; color: #fff; }
.lip--dark .lip-updated { color: #94a3b8; }
.lip--dark .lip-empty__text { color: #94a3b8; }
.lip--dark .lip-node__head { background: #0f172a; }
.lip--dark .lip-node__head:hover { background: rgba(255,255,255,.05); }
.lip--dark .lip-node__name { color: #f1f5f9; }
.lip--dark .lip-row { border-top-color: rgba(255,255,255,.06); }
.lip--dark .lip-row__main { color: #cbd5e1; }
.lip--dark .lip-row__val { color: #f1f5f9; }
.lip--dark .lip-row__val--empty { color: #fca5a5; }
.lip--dark .lip-row__consumed { color: #94a3b8; }
</style>
