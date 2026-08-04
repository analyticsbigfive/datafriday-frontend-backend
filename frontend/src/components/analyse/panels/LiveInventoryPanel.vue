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
            <span class="lip-rows__col lip-rows__col--gauge">{{ t('anLiveInvColRemaining') }}</span>
          </div>
          <div v-for="child in node.children" :key="child.key" class="lip-row">
            <div class="lip-row__main-col">
              <span class="lip-row__main">{{ child.label }}</span>
              <span class="lip-row__consumed-sub">{{ t('anLiveInvColConsumed') }} : {{ formatNumber(child.consumedLoose) }}</span>
            </div>

            <!-- Jauge "stock restant / stock de départ" (départ = niveau déjà fixé par
                 Reset/mouvements Logistique, cf. buildChild), purement visuelle, aucune
                 écriture. Toujours affichée, y compris à 0% (rouge) quand rien n'a jamais
                 été compté. Sous le seuil critique, le remplissage est trop étroit pour
                 loger le texte "%" lisiblement, le label bascule à l'extérieur, à droite
                 de la piste. -->
            <div class="lip-row__gauge">
              <span class="lip-row__gauge-num lip-row__gauge-num--start">{{ formatNumber(child.remainingLoose) }}</span>
              <div class="lip-row__gauge-track">
                <div
                  class="lip-row__gauge-fill"
                  :class="`lip-row__gauge-fill--${child.gaugeStatus}`"
                  :style="{ width: child.gaugePercent + '%' }"
                >
                  <span v-if="child.gaugeLabelInside" class="lip-row__gauge-pct lip-row__gauge-pct--inside">{{ child.gaugeLabel }}</span>
                </div>
                <span
                  v-if="!child.gaugeLabelInside"
                  class="lip-row__gauge-pct lip-row__gauge-pct--outside"
                  :class="`lip-row__gauge-pct--${child.gaugeStatus}`"
                  :style="{ left: `calc(${child.gaugePercent}% + 4px)` }"
                >
                  <AlertTriangle v-if="child.gaugeStatus === 'critical'" :size="10" />
                  {{ child.gaugeLabel }}
                </span>
              </div>
              <span class="lip-row__gauge-num lip-row__gauge-num--end">{{ formatNumber(child.totalLoose) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { Boxes, ChevronDown, ChevronRight, AlertTriangle } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { getSpaceLiveInventory } from '@/api/endpoints/space.api';

// Rafraîchissement live aligné sur le mode flux d'AnalyseView (11_LIVE.md §5).
const LIVE_POLL_MS = 15000;

// Seuils de la jauge "restant / départ", palette status figée (jamais thémée),
// cf. skill dataviz : good ≥50%, warning 20-50%, critical <20%. Mode-invariant
// (validée à la fois sur surface claire et sombre), donc pas de variante dark ici.
const GAUGE_WARNING_THRESHOLD = 50;
const GAUGE_CRITICAL_THRESHOLD = 20;

export default {
  name: 'LiveInventoryPanel',
  components: { Boxes, ChevronDown, ChevronRight, AlertTriangle },
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

      // Jauge : "départ" = totalLoose (niveau déjà fixé par Reset/mouvements Logistique,
      // avant décrément ventes), sert de référence 100%, vert. Décroît vers 0%, rouge,
      // au fil des ventes (habillage visuel, aucune écriture nouvelle).
      const gaugePercent = totalLoose > 0
        ? Math.round(Math.min(100, Math.max(0, (remainingLoose / totalLoose) * 100)))
        : 0;
      const gaugeStatus = gaugePercent < GAUGE_CRITICAL_THRESHOLD
        ? 'critical'
        : gaugePercent < GAUGE_WARNING_THRESHOLD
          ? 'warning'
          : 'good';
      const gaugeLabel = `${gaugePercent}%`;
      // Sous le seuil critique, le remplissage est trop étroit pour loger le texte
      // en lisible, le label bascule à l'extérieur de la piste (cf. template).
      const gaugeLabelInside = gaugePercent >= GAUGE_CRITICAL_THRESHOLD;

      return {
        key: keySeed, label, remainingLoose, consumedLoose: consumed, remainingLabel,
        totalLoose, gaugePercent, gaugeStatus, gaugeLabel, gaugeLabelInside,
      };
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
  grid-template-columns: 1fr 260px;
  gap: 8px;
  padding: 8px 12px 6px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: #9ca3af;
}
.lip-rows__col--gauge { text-align: right; }
.lip-row {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-top: 1px solid #f3f4f6;
  font-size: 0.8125rem;
}
.lip-row__main-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.lip-row__main {
  color: #374151;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lip-row__consumed-sub { font-size: 0.72rem; color: #9ca3af; }

/* Jauge "[restant] [piste + % dedans] [départ]", palette status figée (dataviz
   skill), mode-invariante. Cf. LogisticsService.getStock : départ = niveau déjà fixé
   par Reset/mouvements, avant décrément ventes ; jauge = habillage visuel, aucune
   écriture propre. */
.lip-row__gauge {
  display: flex;
  align-items: center;
  gap: 8px;
}
.lip-row__gauge-num {
  font-size: 0.78rem;
  font-weight: 700;
  color: #111827;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.lip-row__gauge-track {
  position: relative;
  flex: 1;
  height: 20px;
  border-radius: 10px;
  background: #e5e7eb;
  overflow: hidden;
}
.lip-row__gauge-fill {
  height: 100%;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding-right: 6px;
  transition: width .3s ease;
  min-width: 0;
}
.lip-row__gauge-fill--good { background: #0ca30c; }
.lip-row__gauge-fill--warning { background: #fab219; }
.lip-row__gauge-fill--critical { background: #d03b3b; }
.lip-row__gauge-pct {
  font-size: 0.7rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.lip-row__gauge-pct--inside { color: #fff; }
.lip-row__gauge-pct--outside {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: inline-flex;
  align-items: center;
  gap: 2px;
}
.lip-row__gauge-pct--outside.lip-row__gauge-pct--good { color: #0ca30c; }
.lip-row__gauge-pct--outside.lip-row__gauge-pct--warning { color: #b8860b; }
.lip-row__gauge-pct--outside.lip-row__gauge-pct--critical { color: #d03b3b; }

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
.lip--dark .lip-row__consumed-sub { color: #94a3b8; }
.lip--dark .lip-row__gauge-num { color: #f1f5f9; }
.lip--dark .lip-row__gauge-track { background: rgba(255, 255, 255, .1); }
/* Statuts good/critical mode-invariants (validés dataviz skill sur les 2 surfaces),
   seul warning est réajusté : #b8860b (assombri pour lisibilité en texte clair sur
   fond blanc) est trop terne sur fond sombre, on reprend le hex status brut #fab219,
   déjà validé (contraste 9.49 sur surface sombre). */
.lip--dark .lip-row__gauge-pct--outside.lip-row__gauge-pct--warning { color: #fab219; }
</style>
