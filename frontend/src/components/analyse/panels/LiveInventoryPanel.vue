<template>
  <!-- Onglet Inventaire live (module Live v2, 11_LIVE.md §3/§15 / LIVE_API_GUIDE.md §3).
       Arbre dépliable Shop→items ou Item→shops sur GET /spaces/:id/live/inventory.
       Stock de départ initialisé automatiquement depuis l'Inventaire pré-événement à
       l'ouverture des portes (InventoryLiveInitCronService, backend) — plus de
       déclenchement manuel côté écran (retiré 2026-08-05, décision utilisateur : tout
       doit être automatique). Logique de jauge/tri/filtre extraite dans
       utils/liveInventoryRows.js. -->
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
      <div class="lip-search">
        <Search :size="14" class="lip-search__icon" />
        <input
          v-model="search"
          type="text"
          class="lip-search__input"
          :placeholder="t('anLiveInvSearchPlaceholder')"
        >
      </div>
      <!-- Gestion des stocks en urgence : voir directement ce qui a besoin d'attention
           partout, sans connaître de nom d'article à l'avance (la recherche seule ne
           répond pas à ce besoin) et sans déplier chaque shop un par un — cf. retour
           utilisateur 2026-08-05. Stock bas (warning) et Rupture (critical) sont deux
           boutons SÉPARÉS, combinables : les confondre sous un même bouton "Stock bas"
           montrait aussi les articles à 0% et a induit l'utilisateur en erreur. -->
      <button
        class="lip-status-toggle lip-status-toggle--warning"
        :class="{ 'lip-status-toggle--active': lowStockOnly }"
        :disabled="!lowStockCount"
        @click="lowStockOnly = !lowStockOnly"
      >
        <AlertTriangle :size="13" />
        {{ t('anLiveInvLowStockToggle') }}
        <span v-if="lowStockCount" class="lip-status-toggle__count">{{ lowStockCount }}</span>
      </button>
      <button
        class="lip-status-toggle lip-status-toggle--critical"
        :class="{ 'lip-status-toggle--active': outOfStockOnly }"
        :disabled="!outOfStockCount"
        @click="outOfStockOnly = !outOfStockOnly"
      >
        <AlertTriangle :size="13" />
        {{ t('anLiveInvOutOfStockToggle') }}
        <span v-if="outOfStockCount" class="lip-status-toggle__count">{{ outOfStockCount }}</span>
      </button>
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
      <p class="lip-empty__text">{{ emptyMessage }}</p>
    </div>

    <!-- Arbre -->
    <div v-else class="lip-tree">
      <div v-for="node in rows" :key="node.key" class="lip-node">
        <button class="lip-node__head" @click="toggle(node.key)">
          <ChevronDown v-if="isOpen(node.key)" :size="16" class="lip-chevron" />
          <ChevronRight v-else :size="16" class="lip-chevron" />
          <span class="lip-node__name">{{ node.label }}</span>
          <span v-if="node.criticalCount" class="lip-node__critical-badge">
            <AlertTriangle :size="10" />{{ node.criticalCount }}
          </span>
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
              <span class="lip-row__consumed-sub">{{ t('anLiveInvColConsumed') }} : {{ formatQty(child.consumedLoose, child.unit) }}</span>
            </div>

            <!-- Jauge "stock restant / stock de départ" (départ = niveau déjà fixé par
                 l'auto-init pré-événement/mouvements Logistique, cf. buildLiveInventoryChild),
                 purement visuelle, aucune écriture. 0 restant = rupture (rouge, "0%"), sans
                 exception — jamais initialisé ou réellement épuisé, le résultat opérationnel
                 est identique : rien à servir (cf. retour utilisateur 2026-08-05). Sous le
                 seuil critique, le remplissage est trop étroit pour loger le texte "%"
                 lisiblement, le label bascule à l'extérieur, à droite de la piste. -->
            <div class="lip-row__gauge">
              <span class="lip-row__gauge-num lip-row__gauge-num--start">{{ formatQty(child.remainingLoose, child.unit) }}</span>
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
              <span class="lip-row__gauge-num lip-row__gauge-num--end">{{ formatQty(child.totalLoose, child.unit) }}</span>
            </div>

            <button
              class="lip-row__restock-btn"
              type="button"
              :title="t('restockButton')"
              @click="openRestocker(node, child)"
            >
              <Truck :size="15" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <RestockerDrawer
      v-model="restockerOpen"
      :space-id="spaceId"
      :element="restockerElement"
      :item-key="restockerItemKey"
      :item-kind="restockerItemKind"
      :item-ref-id="restockerItemRefId"
      :tasks="restockerTasks"
      :confirming="restockerConfirming"
      :error="restockerError"
      @add-task="onRestockAddTask"
      @remove-task="onRestockRemoveTask"
      @confirm="onRestockConfirm"
    />
  </div>
</template>

<script>
import { Boxes, ChevronDown, ChevronRight, AlertTriangle, Search, Truck } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { getSpaceLiveInventory } from '@/api/endpoints/space.api';
import { buildLiveInventoryRows, countByStatus, countGlobalByStatus } from '@/utils/liveInventoryRows';
import { useRestockerTaskQueue } from '@/composables/useRestockerTaskQueue';
import RestockerDrawer from './live-inventory/RestockerDrawer.vue';

// Rafraîchissement live aligné sur le mode flux d'AnalyseView (11_LIVE.md §5).
const LIVE_POLL_MS = 15000;

export default {
  name: 'LiveInventoryPanel',
  components: { Boxes, ChevronDown, ChevronRight, AlertTriangle, Search, Truck, RestockerDrawer },
  props: {
    spaceId: { type: String, default: '' },
    isDark: { type: Boolean, default: false },
    // Onglet réellement affiché → ne poller que quand visible.
    active: { type: Boolean, default: true },
  },
  setup() {
    const { t } = useI18n();
    // Possédée ici (pas dans le drawer) : survit à sa fermeture/réouverture entre
    // deux items — cf. mockup "cliquer sur un autre bouton transfert dans un Item".
    const restockerTaskQueue = useRestockerTaskQueue();
    return { t, restockerTaskQueue };
  },
  data() {
    return {
      inv: null,
      loading: false,
      error: '',
      view: 'shop', // 'shop' | 'item'
      search: '',
      lowStockOnly: false, // filtre 'warning' (20-50%) — combinable avec outOfStockOnly
      outOfStockOnly: false, // filtre 'critical' (<20%, rupture réelle) — combinable avec lowStockOnly
      expanded: [], // clés dépliées manuellement (ignoré tant qu'un filtre est actif, cf. isOpen)
      lastUpdated: null,
      pollTimer: null,
      // Jeton de requête (même pattern que analyse.js::refreshLiveShopSnapshot,
      // docs/modules/11_LIVE.md §14) : un tick de 15s qui répond après un tick
      // plus récent est ignoré, sinon il peut écraser l'arbre avec du stock périmé.
      _invReqId: 0,
      restockerOpen: false,
      restockerElement: null,
      restockerItemKey: '',
      restockerItemKind: null,
      restockerItemRefId: null,
    };
  },
  computed: {
    statusFilters() {
      const f = [];
      if (this.lowStockOnly) f.push('warning');
      if (this.outOfStockOnly) f.push('critical');
      return f;
    },
    rows() {
      const groups = buildLiveInventoryRows(this.inv, this.view, this.search, this.statusFilters);
      return groups.map((g) => ({ ...g, criticalCount: countByStatus(g.children, 'critical') }));
    },
    // Totaux sur TOUT l'espace, indépendants de la vue/recherche courante —
    // visibles sans rien déplier ni filtrer (badges sur les boutons Stock bas/Rupture).
    lowStockCount() {
      return countGlobalByStatus(this.inv, 'warning');
    },
    outOfStockCount() {
      return countGlobalByStatus(this.inv, 'critical');
    },
    filterActive() {
      return !!this.search.trim() || this.statusFilters.length > 0;
    },
    emptyMessage() {
      if (this.statusFilters.length) return this.t('anLiveInvNoAlerts');
      if (this.search.trim()) return this.t('anLiveInvNoMatch');
      return this.t('anLiveInvEmpty');
    },
    lastUpdatedLabel() {
      if (!this.lastUpdated) return '';
      try { return new Date(this.lastUpdated).toLocaleTimeString(); } catch { return ''; }
    },
    restockerTasks() { return this.restockerTaskQueue.queue.value; },
    restockerConfirming() { return this.restockerTaskQueue.confirming.value; },
    restockerError() { return this.restockerTaskQueue.error.value; },
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
    async fetchInventory() {
      if (!this.spaceId) return;
      const reqId = ++this._invReqId;
      this.loading = true;
      this.error = '';
      try {
        const res = await getSpaceLiveInventory(this.spaceId);
        if (reqId !== this._invReqId) return; // réponse périmée, un tick plus récent est déjà en vol
        this.inv = res || { shops: [], items: [] };
        this.lastUpdated = Date.now();
      } catch (e) {
        if (reqId !== this._invReqId) return;
        this.error = e?.response?.data?.message || e?.message || this.t('anLiveInvError');
      } finally {
        if (reqId === this._invReqId) this.loading = false;
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
    // Un filtre actif (recherche et/ou alertes) force l'ouverture de tous les groupes
    // affichés : le but de filtrer est de voir le résultat immédiatement, pas de devoir
    // encore cliquer pour déplier (cf. retour utilisateur 2026-08-05).
    isOpen(key) { return this.filterActive || this.expanded.includes(key); },
    formatNumber(v) {
      const n = Number(v);
      return Number.isFinite(n) ? n.toLocaleString('fr-FR') : '0';
    },
    // Unité affichée en minuscules (cosmétique, n'affecte pas la donnée stockée) —
    // le référentiel MarketPrice mélange casses ("kg"/"Kg") selon la saisie d'origine.
    formatQty(v, unit) {
      const num = this.formatNumber(v);
      return unit ? `${num} ${unit.toLowerCase()}` : num;
    },
    // `child.shopId`/`child.itemKey`/`child.itemKind`/`child.itemRefId` portés
    // explicitement par buildLiveInventoryChild (cf. utils/liveInventoryRows.js) —
    // valables dans les deux vues (shop/item), le nom du shop seul diffère (node.label
    // en vue shop, child.label en vue item). itemKind/itemRefId : ADR-0006 (chantier 377).
    openRestocker(node, child) {
      const shopName = this.view === 'shop' ? node.label : child.label;
      this.restockerElement = { id: child.shopId, name: shopName };
      this.restockerItemKey = child.itemKey;
      this.restockerItemKind = child.itemKind ?? null;
      this.restockerItemRefId = child.itemRefId ?? null;
      this.restockerOpen = true;
    },
    onRestockAddTask(task) {
      this.restockerTaskQueue.addTask(task);
    },
    onRestockRemoveTask(localId) {
      this.restockerTaskQueue.removeTask(localId);
    },
    async onRestockConfirm() {
      try {
        await this.restockerTaskQueue.confirm(this.spaceId);
        this.restockerOpen = false;
      } catch {
        // Erreur déjà exposée via restockerError (alerte dans le drawer).
      }
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

/* Recherche */
.lip-search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 100px;
  background: #f3f4f6;
  min-width: 180px;
}
.lip-search__icon { color: #9ca3af; flex-shrink: 0; }
.lip-search__input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 0.8125rem;
  color: #111827;
  width: 100%;
}
.lip-search__input::placeholder { color: #9ca3af; }

/* Toggles Stock bas / Rupture — gestion des stocks en urgence (retour utilisateur
   2026-08-05). Deux boutons DISTINCTS, couleur alignée sur la jauge (warning =
   orange, critical = rouge) : les fusionner sous un même bouton "Stock bas"
   montrait aussi les ruptures réelles (0%) et a induit l'utilisateur en erreur. */
.lip-status-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid transparent;
  border-radius: 100px;
  background: #fff;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s, color .15s, border-color .15s;
  white-space: nowrap;
}
.lip-status-toggle--warning { border-color: #fde68a; color: #b8860b; }
.lip-status-toggle--critical { border-color: #fecaca; color: #d03b3b; }
.lip-status-toggle:disabled { color: #9ca3af; border-color: #e5e7eb; cursor: default; opacity: .7; }
.lip-status-toggle--warning.lip-status-toggle--active { background: #fab219; border-color: #fab219; color: #fff; }
.lip-status-toggle--critical.lip-status-toggle--active { background: #d03b3b; border-color: #d03b3b; color: #fff; }
.lip-status-toggle__count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 100px;
  font-size: 0.7rem;
  font-weight: 700;
}
.lip-status-toggle--warning .lip-status-toggle__count { background: rgba(250,178,25,.15); color: #b8860b; }
.lip-status-toggle--critical .lip-status-toggle__count { background: rgba(208,59,59,.12); color: #d03b3b; }
.lip-status-toggle--active .lip-status-toggle__count { background: rgba(255,255,255,.25); color: #fff; }
.lip-status-toggle:disabled .lip-status-toggle__count { background: transparent; color: #9ca3af; }

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
.lip-node__critical-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  border-radius: 100px;
  background: #fee2e2;
  color: #d03b3b;
  font-size: 0.7rem;
  font-weight: 700;
  white-space: nowrap;
}

.lip-rows { padding: 2px 6px 8px 30px; }
.lip-rows__header {
  display: grid;
  grid-template-columns: 1fr 260px 30px;
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
  grid-template-columns: 1fr 260px 30px;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-top: 1px solid #f3f4f6;
  font-size: 0.8125rem;
}
.lip-row__restock-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid #e5e7eb;
  background: #fff;
  color: #6b7280;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .15s, color .15s, border-color .15s;
  flex-shrink: 0;
}
.lip-row__restock-btn:hover { background: #fef2f2; color: #ff3131; border-color: rgba(255, 49, 49, .3); }
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
   par l'auto-init/mouvements, avant décrément ventes ; jauge = habillage visuel,
   aucune écriture propre. */
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
  min-width: 64px;
}
.lip-row__gauge-num--start { text-align: right; }
.lip-row__gauge-num--end { text-align: left; }
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
.lip--dark .lip-search { background: #0f172a; }
.lip--dark .lip-search__input { color: #f1f5f9; }
.lip--dark .lip-search__input::placeholder { color: #64748b; }
.lip--dark .lip-status-toggle { background: #0f172a; }
.lip--dark .lip-status-toggle--warning { border-color: rgba(250,178,25,.4); color: #fab219; }
.lip--dark .lip-status-toggle--critical { border-color: rgba(208,59,59,.4); color: #f87171; }
.lip--dark .lip-status-toggle:disabled { color: #64748b; border-color: rgba(255,255,255,.08); }
.lip--dark .lip-status-toggle--warning.lip-status-toggle--active { background: #fab219; border-color: #fab219; color: #1e293b; }
.lip--dark .lip-status-toggle--critical.lip-status-toggle--active { background: #d03b3b; border-color: #d03b3b; color: #fff; }
.lip--dark .lip-status-toggle--warning .lip-status-toggle__count { background: rgba(250,178,25,.18); color: #fab219; }
.lip--dark .lip-status-toggle--critical .lip-status-toggle__count { background: rgba(248,113,113,.18); color: #f87171; }
.lip--dark .lip-empty__text { color: #94a3b8; }
.lip--dark .lip-node__head { background: #0f172a; }
.lip--dark .lip-node__head:hover { background: rgba(255,255,255,.05); }
.lip--dark .lip-node__name { color: #f1f5f9; }
.lip--dark .lip-node__critical-badge { background: rgba(208,59,59,.2); color: #f87171; }
.lip--dark .lip-row { border-top-color: rgba(255,255,255,.06); }
.lip--dark .lip-row__main { color: #cbd5e1; }
.lip--dark .lip-row__consumed-sub { color: #94a3b8; }
.lip--dark .lip-row__gauge-num { color: #f1f5f9; }
.lip--dark .lip-row__gauge-track { background: rgba(255, 255, 255, .1); }
.lip--dark .lip-row__restock-btn { background: #0f172a; border-color: rgba(255,255,255,.1); color: #94a3b8; }
.lip--dark .lip-row__restock-btn:hover { background: rgba(255,49,49,.12); color: #f87171; border-color: rgba(248,113,113,.4); }
/* Statuts good/critical mode-invariants (validés dataviz skill sur
   les 2 surfaces), seul warning est réajusté : #b8860b (assombri pour lisibilité en
   texte clair sur fond blanc) est trop terne sur fond sombre, on reprend le hex
   status brut #fab219, déjà validé (contraste 9.49 sur surface sombre). */
.lip--dark .lip-row__gauge-pct--outside.lip-row__gauge-pct--warning { color: #fab219; }
</style>
