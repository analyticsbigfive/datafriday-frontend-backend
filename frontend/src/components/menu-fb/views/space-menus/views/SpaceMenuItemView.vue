<template>
  <div>
    <!-- Loading skeletons -->
    <div v-if="menuItemsLoading || shopMenuItemsLoading" class="smiv-grid">
      <div v-for="i in 8" :key="i" class="smiv-skeleton">
        <div class="smiv-skeleton__img"></div>
        <div class="smiv-skeleton__body">
          <div class="smiv-skeleton__line smiv-skeleton__line--title"></div>
          <div class="smiv-skeleton__line smiv-skeleton__line--sub"></div>
        </div>
      </div>
    </div>

    <!-- Erreur de chargement : état DISTINCT du « vraiment vide » (avant, un appel en
         échec affichait « Aucun menu item » — indiscernable d'un catalogue vide). -->
    <div v-else-if="loadError" class="smiv-empty smiv-empty--error">
      <div class="smiv-empty__icon"><AlertCircle :size="32" style="color:#ff3131" /></div>
      <p class="smiv-empty__title">{{ t('spaceMenu.loadError') }}</p>
      <p class="smiv-empty__sub">{{ loadError }}</p>
      <button class="smiv-retry-btn" @click="$emit('retry')">{{ t('spaceMenu.retry') }}</button>
    </div>

    <!-- Empty: aucun menu item dans ce space -->
    <div v-else-if="menuItemsByCategory.length === 0 && !menuItemQuery" class="smiv-empty">
      <div class="smiv-empty__icon"><Package :size="32" style="color:#d1d5db" /></div>
      <p class="smiv-empty__title">Aucun menu item</p>
      <p class="smiv-empty__sub">Aucun menu item n'est rattaché à cet espace.</p>
    </div>

    <!-- Empty: filtre sans résultat -->
    <div v-else-if="menuItemsByCategory.length === 0" class="smiv-empty">
      <div class="smiv-empty__icon"><Package :size="32" style="color:#d1d5db" /></div>
      <p class="smiv-empty__title">{{ t("spaceMenu.noMatchingShops") }}</p>
      <p class="smiv-empty__sub">{{ t("spaceMenu.tryAdjustingFilters") }}</p>
    </div>

    <!-- Menu items groupés par catégorie -->
    <div v-else>
      <div v-for="group in menuItemsByCategory" :key="group.category" class="smiv-group">

        <!-- Category header -->
        <div class="smiv-cat-head">
          <div class="smiv-cat-head__line"></div>
          <span class="smiv-cat-head__label">{{ group.category }}</span>
          <span class="smiv-cat-head__count">{{ group.items.length }}</span>
          <div class="smiv-cat-head__line"></div>
        </div>

        <!-- Items grid -->
        <div class="smiv-grid">
          <div
            v-for="item in group.items"
            :key="item.id || item._id"
            class="smiv-item-card"
            :class="{ 'smiv-item-card--unavailable': !isMenuItemAvailable(item) }"
            :title="missingTitle(item)"
          >
            <!-- Image -->
            <div class="smiv-item-card__img">
              <img v-if="item.picture || item.image" :src="item.picture || item.image" :alt="item.name" />
              <div v-else class="smiv-item-card__img-empty"><Package :size="20" /></div>
            </div>
            <!-- Body -->
            <div class="smiv-item-card__body">
              <div class="smiv-item-card__name">{{ item.name }}</div>
              <div class="smiv-item-card__cat">{{ item.category || item?.productCategory?.name || '' }}</div>
              <div class="smiv-item-card__price">${{ Number(item.price ?? item.basePrice ?? 0).toFixed(2) }}</div>
            </div>
            <!-- Shops expandable footer -->
            <div class="smiv-item-card__foot" @click.stop="toggleExpand(item.id || item._id)">
              <span class="smiv-item-card__shop-count">
                <Store :size="11" />
                {{ shopsWithMenuItem(item.id || item._id).length }}/{{ shops.length }} shops
              </span>
              <ChevronDown
                :size="14"
                :style="{ transform: isExpanded(item.id || item._id) ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }"
              />
            </div>
            <!-- Expandable shops list -->
            <div v-if="isExpanded(item.id || item._id)" class="smiv-shops-list">
              <div v-if="!shops.length" class="smiv-shops-list__empty">Aucun shop disponible</div>
              <div
                v-for="shop in shops"
                :key="shop.id"
                class="smiv-shops-list__row"
                :class="{
                  'smiv-shops-list__row--checked': shopsWithMenuItem(item.id || item._id).some(s => s.id === shop.id),
                  'smiv-shops-list__row--pending': isTogglePending(shop.id, item.id || item._id),
                }"
                @click="toggleShopForMenuItem(shop, item.id || item._id)"
              >
                <div class="smiv-shops-list__icon-wrap">
                  <Store :size="16" style="color:#6b7280" />
                </div>
                <div class="smiv-shops-list__info">
                  <span class="smiv-shops-list__name">{{ shop.name }}</span>
                  <span v-if="shop.type" class="smiv-shops-list__type">{{ shop.type }}</span>
                </div>
                <span v-if="isTogglePending(shop.id, item.id || item._id)" class="smiv-spinner" />
                <!-- .prevent : l'état coché vient du serveur (:checked), pas du DOM.
                     .stop + appel direct : avant, @click.stop SANS handler avalait le
                     clic → cocher la case ne déclenchait rien (bug « rien ne se passe »). -->
                <input
                  v-else
                  type="checkbox"
                  :checked="shopsWithMenuItem(item.id || item._id).some(s => s.id === shop.id)"
                  class="smiv-checkbox"
                  @click.stop.prevent="toggleShopForMenuItem(shop, item.id || item._id)"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useI18n } from "@/i18n/useI18n";
import { Package, Store, ChevronDown, AlertCircle } from 'lucide-vue-next';
import { assignMenuItemsToShop } from '@/api/endpoints/menu.api';

export default {
  name: "SpaceMenuItemView",
  components: { Package, Store, ChevronDown, AlertCircle },
  props: {
    menuItemsByCategory: { type: Array,   required: true },
    shops:               { type: Array,   required: true },
    menuItemsLoading:    { type: Boolean, default: false },
    shopMenuItemsLoading:{ type: Boolean, default: false },
    menuItemQuery:       { type: String,  default: '' },
    spaceId:             { type: String,  default: '' },
    configId:            { type: String,  default: '' },
    // { [shopId]: { [menuItemId]: boolean } } — matrice d'assignation chargée en 1 seul
    // appel par le parent (GET /space-menu/:spaceId/:configId), remplace l'ancien fetch
    // /space-menu/shop/:shopId répété pour chaque shop.
    menuAssignmentMap:   { type: Object,  default: () => ({}) },
    // Message d'échec de chargement (null = pas d'erreur) — affiché à la place de
    // l'état vide, avec bouton réessayer (emit 'retry').
    loadError:           { type: String,  default: null },
  },
  emits: ["show-error", "menu-item-toggled", "retry"],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      expandedIds: [],
      pendingToggles: {},
    };
  },
  methods: {
    // `available` vient du BACKEND (mêmes règles fournisseur×espace que le drawer shop) —
    // l'ancien calcul local (« a un marketPriceId ») donnait un résultat différent du
    // drawer pour un même item.
    isMenuItemAvailable(item) {
      return item?.available === true;
    },
    // Tooltip natif sur les cartes non disponibles : raisons serveur « Ingrédient (Fournisseur) ».
    missingTitle(item) {
      if (item?.available !== false) return '';
      const missing = item?.missingIngredients || [];
      if (!missing.length) return this.t('spaceMenu.noRecipe');
      return `${this.t('spaceMenu.missingIngredients')}\n` +
        missing.map(m => `• ${m.name}${m.supplierName ? ` (${m.supplierName})` : ''}`).join('\n');
    },
    isMenuItemAssignedToShop(shopId, menuItemId) {
      return this.menuAssignmentMap?.[shopId]?.[String(menuItemId)] === true;
    },
    shopsWithMenuItem(menuItemId) {
      const mid = String(menuItemId);
      return this.shops.filter(shop => this.isMenuItemAssignedToShop(shop.id, mid));
    },
    toggleExpand(id) {
      const sid = String(id);
      if (this.expandedIds.includes(sid)) {
        this.expandedIds = this.expandedIds.filter(x => x !== sid);
      } else {
        this.expandedIds = [...this.expandedIds, sid];
      }
    },
    isExpanded(id) {
      return this.expandedIds.includes(String(id));
    },
    isTogglePending(shopId, menuItemId) {
      return !!this.pendingToggles[`${shopId}_${menuItemId}`];
    },
    async toggleShopForMenuItem(shop, menuItemId) {
      const mid = String(menuItemId);
      const shopId = String(shop.id);
      const key = `${shopId}_${mid}`;
      if (this.pendingToggles[key]) return;
      const isCurrentlyAssigned = this.isMenuItemAssignedToShop(shopId, mid);
      this.pendingToggles = { ...this.pendingToggles, [key]: true };
      try {
        const enabled = !isCurrentlyAssigned;
        await assignMenuItemsToShop(this.spaceId, this.configId, shopId, { [mid]: enabled });
        // Le backend upsert désormais en PARTIEL (cf. saveMenuConfiguration) : ce toggle
        // ne touche QUE cette paire shop×item, pas besoin de refetch — on connaît déjà
        // exactement ce qui a changé.
        this.$emit('menu-item-toggled', { shopId, menuItemId: mid, enabled });
      } catch (e) {
        this.$emit('show-error', e?.response?.data?.message || e?.message || 'Erreur lors de la mise à jour');
      } finally {
        const updated = { ...this.pendingToggles };
        delete updated[key];
        this.pendingToggles = updated;
      }
    },
  },
};
</script>

<style scoped>
/* ── Category header ── */
.smiv-group { margin-bottom: 40px; }
.smiv-cat-head {
  display: flex; align-items: center; gap: 12px; margin-bottom: 16px;
}
.smiv-cat-head__line { flex: 1; height: 1px; background: #e5e7eb; }
.smiv-cat-head__label { font-size: 13px; font-weight: 700; color: #6b7280; white-space: nowrap; text-transform: uppercase; letter-spacing: .04em; }
.smiv-cat-head__count {
  background: rgba(255, 49, 49,.1); color: #ff3131;
  font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px; flex-shrink: 0;
}

/* ── Grid ── */
.smiv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 14px;
}

/* ── Item card ── */
.smiv-item-card {
  background: #fff; border-radius: 16px; border: 1px solid #e5e7eb;
  overflow: hidden; transition: box-shadow .2s, border-color .2s; display: flex; flex-direction: column;
}
.smiv-item-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,.08); border-color: #d1d5db; }
/* pointer-events uniquement sur les zones interactives (pas sur la carte entière,
   sinon le tooltip natif :title des raisons d'indisponibilité ne s'affiche jamais). */
.smiv-item-card--unavailable { opacity: .45; }
.smiv-item-card--unavailable .smiv-item-card__foot,
.smiv-item-card--unavailable .smiv-shops-list { pointer-events: none; }

.smiv-item-card__img { height: 110px; background: #f3f4f6; overflow: hidden; }
.smiv-item-card__img img { width: 100%; height: 100%; object-fit: cover; }
.smiv-item-card__img-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: #d1d5db; }

.smiv-item-card__body { padding: 10px 12px; flex: 1; }
.smiv-item-card__name { font-size: 13.5px; font-weight: 700; color: #111827; margin-bottom: 3px; line-height: 1.3; }
.smiv-item-card__cat { font-size: 11px; color: #9ca3af; margin-bottom: 4px; }
.smiv-item-card__price { font-size: 13px; font-weight: 700; color: #ff3131; }

.smiv-item-card__foot {
  border-top: 1px solid #f3f4f6; padding: 8px 12px;
  display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; background: #fafafa; transition: background .15s;
}
.smiv-item-card__foot:hover { background: #f3f4f6; }
.smiv-item-card__shop-count { display: flex; align-items: center; gap: 4px; font-size: 12px; color: #6b7280; font-weight: 500; }

/* ── Shops dropdown ── */
.smiv-shops-list { border-top: 1px solid #f3f4f6; background: #fafafa; max-height: 260px; overflow-y: auto; }
.smiv-shops-list__empty { font-size: 12px; color: #9ca3af; padding: 10px 12px; }
.smiv-shops-list__row {
  display: flex; align-items: center; gap: 8px;
  padding: 8px 12px; cursor: pointer; transition: background .15s; border-bottom: 1px solid #f3f4f6;
}
.smiv-shops-list__row:last-child { border-bottom: none; }
.smiv-shops-list__row:hover { background: #f3f4f6; }
.smiv-shops-list__row--checked { background: #eff6ff; }
.smiv-shops-list__row--checked:hover { background: #dbeafe; }
.smiv-shops-list__row--pending { opacity: .7; cursor: wait; pointer-events: none; }

.smiv-spinner {
  width: 16px; height: 16px; flex-shrink: 0;
  border: 2px solid #e5e7eb; border-top-color: #ff3131;
  border-radius: 50%; animation: smivSpin .6s linear infinite;
}
@keyframes smivSpin { to { transform: rotate(360deg); } }
.smiv-shops-list__icon-wrap { width: 28px; height: 28px; border-radius: 6px; background: #e5e7eb; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.smiv-shops-list__row--checked .smiv-shops-list__icon-wrap { background: #bfdbfe; }
.smiv-shops-list__info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.smiv-shops-list__name { font-size: 12.5px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.smiv-shops-list__type { font-size: 10.5px; color: #9ca3af; }
.smiv-checkbox { width: 16px; height: 16px; accent-color: #ff3131; cursor: pointer; flex-shrink: 0; }

/* ── Skeleton ── */
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.smiv-skeleton { background: #fff; border-radius: 16px; border: 1px solid rgba(0,0,0,.06); overflow: hidden; }
.smiv-skeleton__img {
  height: 110px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
  background-size: 800px 100%; animation: shimmer 1.5s infinite;
}
.smiv-skeleton__body { padding: 10px 12px; }
.smiv-skeleton__line {
  border-radius: 6px; margin-bottom: 6px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
  background-size: 800px 100%; animation: shimmer 1.5s infinite;
}
.smiv-skeleton__line--title { height: 13px; width: 70%; }
.smiv-skeleton__line--sub { height: 10px; width: 45%; }

/* ── Empty state ── */
.smiv-empty { padding: 60px 20px; text-align: center; border: 2px dashed #e5e7eb; border-radius: 16px; background: #fafafa; }
.smiv-empty--error { border-color: #fecaca; background: #fef2f2; }
.smiv-retry-btn {
  margin-top: 14px; padding: 8px 20px; border: none; border-radius: 100px;
  background: #ff3131; color: #fff; font-size: 13px; font-weight: 600; cursor: pointer;
  transition: box-shadow .2s;
}
.smiv-retry-btn:hover { box-shadow: 0 4px 12px rgba(255, 49, 49,.35); }
.smiv-empty__icon { width: 64px; height: 64px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
.smiv-empty__title { font-size: 16px; font-weight: 600; color: #6b7280; margin-bottom: 4px; }
.smiv-empty__sub { font-size: 13px; color: #9ca3af; }
</style>
