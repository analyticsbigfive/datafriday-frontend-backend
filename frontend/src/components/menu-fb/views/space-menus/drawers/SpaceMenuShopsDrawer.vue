<template>
  <Teleport to="body">
    <Transition name="sms-drawer">
      <div v-if="modelValue" class="sms-overlay" @click.self="close">
        <div class="sms-panel" :class="{ 'sms-panel--dark': isDark }">

          <!-- Header -->
          <div class="sms-header">
            <div class="sms-header__icon">
              <Store :size="20" color="white" />
            </div>
            <div class="sms-header__titles">
              <div class="sms-header__title">{{ menuItem ? menuItem.name : '' }}</div>
              <div class="sms-header__sub">
                <span class="sms-count-badge">
                  {{ selectedShopIds.length }}/{{ shops.length }} {{ t('spaceMenu.shops') }}
                </span>
              </div>
            </div>
            <button class="sms-close-btn" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="sms-body">

            <!-- Empty : aucune boutique dans cette configuration -->
            <div v-if="!shops.length" class="sms-empty">
              <div class="sms-empty__icon"><Store :size="32" style="color:#d1d5db" /></div>
              <p class="sms-empty__title">{{ t('spaceMenu.noShopsAvailable') }}</p>
            </div>

            <div v-else class="sms-content">

              <!-- Recherche : au-delà d'une quinzaine de boutiques, scroller pour en
                   trouver une coûte plus cher que taper trois lettres. -->
              <div class="sms-search">
                <Search :size="15" class="sms-search__icon" />
                <input
                  v-model="shopQuery"
                  class="sms-search__input"
                  type="search"
                  :placeholder="t('spaceMenu.searchShops')"
                />
              </div>

              <!-- Tout sélectionner / tout désélectionner (tri-état). Porte sur TOUTES les
                   boutiques, pas seulement celles filtrées par la recherche : le libellé
                   annonce `shops.length` et une bascule silencieusement partielle serait
                   un piège. -->
              <div
                class="sms-select-all"
                :class="{ 'sms-select-all--pending': bulkPending }"
                @click="toggleSelectAllShops"
              >
                <span
                  class="sms-check-box"
                  :class="{
                    checked: allShopsSelected,
                    indeterminate: someShopsSelected && !allShopsSelected,
                  }"
                >
                  <Check v-if="allShopsSelected" :size="11" color="white" />
                  <Minus v-else-if="someShopsSelected" :size="11" color="white" />
                </span>
                <span class="sms-select-all__label">
                  {{ allShopsSelected ? t('unselectAll') : t('selectAll') }} ({{ shops.length }})
                </span>
                <span v-if="bulkPending" class="sms-spinner sms-spinner--accent" />
              </div>

              <!-- List header -->
              <div class="sms-list-header">
                <div class="sms-list-header__shop">{{ t('spaceMenu.shops') }}</div>
                <div class="sms-list-header__check"></div>
              </div>

              <!-- Filtre sans résultat -->
              <div v-if="!filteredShops.length" class="sms-empty">
                <div class="sms-empty__icon"><Store :size="32" style="color:#d1d5db" /></div>
                <p class="sms-empty__title">{{ t('spaceMenu.noMatchingShops') }}</p>
              </div>

              <!-- Boutiques -->
              <div v-else class="sms-list">
                <div
                  v-for="shop in filteredShops"
                  :key="shop.id"
                  class="sms-shop-row"
                  :class="{
                    selected: isAssigned(shop.id),
                    'sms-shop-row--pending': isTogglePending(shop.id),
                  }"
                  @click="toggleShop(shop)"
                >
                  <div class="sms-shop-row__icon">
                    <Store :size="16" style="color:#6b7280" />
                  </div>
                  <div class="sms-shop-row__info">
                    <div class="sms-shop-row__name">{{ shop.name }}</div>
                    <div v-if="shop.type" class="sms-shop-row__type">{{ shop.type }}</div>
                  </div>
                  <span v-if="isTogglePending(shop.id)" class="sms-spinner sms-spinner--accent" />
                  <div v-else class="sms-check-dot" :class="{ active: isAssigned(shop.id) }">
                    <Check v-if="isAssigned(shop.id)" :size="10" color="white" />
                  </div>
                </div>
              </div>

            </div>
          </div>

          <!-- Footer : pas de bouton valider — chaque clic est écrit immédiatement. -->
          <div class="sms-footer">
            <button class="sms-btn sms-btn--ghost" @click="close">
              {{ t('close') }}
            </button>
            <p class="sms-footer__hint">{{ t('spaceMenu.changesSavedInstantly') }}</p>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from "@/i18n/useI18n";
import { X, Store, Check, Minus, Search } from 'lucide-vue-next';
import { assignMenuItemsToShop, saveSpaceMenuConfiguration } from '@/api/endpoints/menu.api';

/**
 * Sélection des BOUTIQUES pour UN menu item — symétrique de ShopMenuItemsDrawer
 * (qui sélectionne les menu items d'UNE boutique).
 *
 * L'état coché n'est jamais stocké localement : il est lu dans `menuAssignmentMap`, la
 * matrice chargée par SpaceMenuView. Chaque bascule écrit côté serveur puis émet
 * `menu-item-toggled` ; c'est le parent qui met la matrice à jour, donc l'affichage
 * reflète toujours ce qui est réellement persisté (pas d'optimistic UI à réconcilier).
 */
export default {
  name: "SpaceMenuShopsDrawer",
  components: { X, Store, Check, Minus, Search },
  props: {
    modelValue:        { type: Boolean, default: false },
    // Menu item dont on gère les boutiques (null quand le drawer est fermé).
    menuItem:          { type: Object,  default: null },
    shops:             { type: Array,   default: () => [] },
    // { [shopId]: { [menuItemId]: boolean } } — source de vérité de l'état coché.
    menuAssignmentMap: { type: Object,  default: () => ({}) },
    spaceId:           { type: String,  default: '' },
    configId:          { type: String,  default: '' },
    isDark:            { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'menu-item-toggled', 'show-error'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      shopQuery: '',
      pendingToggles: {},
      bulkPending: false,
    };
  },
  computed: {
    menuItemId() {
      return String(this.menuItem?.id || this.menuItem?._id || '');
    },
    selectedShopIds() {
      const mid = this.menuItemId;
      if (!mid) return [];
      return (this.shops || [])
        .filter(shop => this.menuAssignmentMap?.[String(shop.id)]?.[mid] === true)
        .map(shop => String(shop.id));
    },
    filteredShops() {
      const q = this.shopQuery.trim().toLowerCase();
      if (!q) return this.shops || [];
      return (this.shops || []).filter(shop =>
        String(shop.name || '').toLowerCase().includes(q) ||
        String(shop.type || '').toLowerCase().includes(q)
      );
    },
    allShopsSelected() {
      return this.shops.length > 0 && this.selectedShopIds.length === this.shops.length;
    },
    someShopsSelected() {
      return this.selectedShopIds.length > 0;
    },
  },
  watch: {
    // Réinitialise la recherche entre deux ouvertures : rouvrir sur un autre article avec
    // un filtre hérité donnerait une liste tronquée sans raison visible.
    modelValue(open) {
      if (open) this.shopQuery = '';
    },
  },
  methods: {
    close() {
      this.$emit('update:modelValue', false);
    },
    isAssigned(shopId) {
      return this.menuAssignmentMap?.[String(shopId)]?.[this.menuItemId] === true;
    },
    isTogglePending(shopId) {
      return !!this.pendingToggles[String(shopId)];
    },
    async toggleShop(shop) {
      const mid = this.menuItemId;
      const shopId = String(shop.id);
      if (!mid || this.pendingToggles[shopId]) return;
      const enabled = !this.isAssigned(shopId);
      this.pendingToggles = { ...this.pendingToggles, [shopId]: true };
      try {
        await assignMenuItemsToShop(this.spaceId, this.configId, shopId, { [mid]: enabled });
        // Upsert PARTIEL côté backend : seule cette paire shop×item bouge, donc pas de
        // refetch — on connaît exactement le delta.
        this.$emit('menu-item-toggled', { shopId, menuItemId: mid, enabled });
      } catch (e) {
        this.$emit('show-error', e?.response?.data?.message || e?.message || this.t('spaceMenu.updateFailed'));
      } finally {
        const updated = { ...this.pendingToggles };
        delete updated[shopId];
        this.pendingToggles = updated;
      }
    },
    // N'envoie que le delta, en 1 seul appel batché : saveSpaceMenuConfiguration accepte
    // plusieurs boutiques à la fois, contrairement à assignMenuItemsToShop.
    async toggleSelectAllShops() {
      const mid = this.menuItemId;
      if (!mid || this.bulkPending || !this.shops.length) return;
      const targetEnabled = !this.allShopsSelected;
      const currentlyAssigned = new Set(this.selectedShopIds);
      const shopsToChange = this.shops.filter(
        shop => currentlyAssigned.has(String(shop.id)) !== targetEnabled
      );
      if (!shopsToChange.length) return;
      this.bulkPending = true;
      try {
        const menuItems = {};
        for (const shop of shopsToChange) menuItems[String(shop.id)] = { [mid]: targetEnabled };
        await saveSpaceMenuConfiguration({ spaceId: this.spaceId, configId: this.configId, menuItems });
        for (const shop of shopsToChange) {
          this.$emit('menu-item-toggled', { shopId: String(shop.id), menuItemId: mid, enabled: targetEnabled });
        }
      } catch (e) {
        this.$emit('show-error', e?.response?.data?.message || e?.message || this.t('spaceMenu.updateFailed'));
      } finally {
        this.bulkPending = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.sms-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 2000; display: flex; justify-content: flex-end; }

/* ── Panel ── */
.sms-panel { width: 460px; max-width: 100vw; height: 100%; display: flex; flex-direction: column; background: #fff; box-shadow: -8px 0 32px rgba(0,0,0,.12); }

/* ── Header ── */
.sms-header {
  flex-shrink: 0; background: #ff3131;
  padding: 18px 20px; display: flex; align-items: center; gap: 12px;
}
.sms-header__icon { width: 40px; height: 40px; border-radius: 12px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.sms-header__titles { flex: 1; min-width: 0; }
.sms-header__title { font-size: 15px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sms-header__sub { margin-top: 3px; }
.sms-count-badge { font-size: 11px; font-weight: 600; color: rgba(255,255,255,.85); background: rgba(255,255,255,.2); padding: 2px 8px; border-radius: 100px; }
.sms-close-btn { background: rgba(255,255,255,.15); border: none; cursor: pointer; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; transition: background .2s; }
.sms-close-btn:hover { background: rgba(255,255,255,.25); }

/* ── Body ── */
.sms-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: #f9fafb; display: flex; flex-direction: column; }
.sms-content { display: flex; flex-direction: column; flex: 1; }

/* ── Search ── */
.sms-search {
  display: flex; align-items: center; gap: 8px;
  margin: 12px 12px 0; padding: 8px 12px;
  background: #fff; border: 1.5px solid #e5e7eb; border-radius: 100px;
}
.sms-search__icon { color: #9ca3af; flex-shrink: 0; }
.sms-search__input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: 13px; color: #111827; }
.sms-search__input::placeholder { color: #9ca3af; }

/* ── Select all ── */
.sms-select-all {
  display: flex; align-items: center; gap: 10px;
  margin: 12px 12px 0; padding: 10px 14px;
  background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px;
  cursor: pointer; transition: background .15s;
}
.sms-select-all:hover { background: #fee2e2; }
.sms-select-all--pending { opacity: .6; pointer-events: none; }
.sms-select-all__label { flex: 1; font-size: 12.5px; font-weight: 700; color: #ff3131; }

.sms-check-box {
  width: 18px; height: 18px; border-radius: 4px;
  border: 2px solid #d1d5db; background: #fff;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s; flex-shrink: 0;
}
.sms-check-box.checked,
.sms-check-box.indeterminate { background: #ff3131; border-color: #ff3131; }

/* ── Empty ── */
.sms-empty { display: flex; flex-direction: column; align-items: center; padding: 48px 20px; text-align: center; gap: 10px; }
.sms-empty__icon { width: 60px; height: 60px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.sms-empty__title { font-size: 14px; font-weight: 600; color: #6b7280; }

/* ── List header ── */
.sms-list-header {
  display: flex; align-items: center; margin-top: 12px; padding: 8px 12px;
  border-bottom: 2px solid #e5e7eb; background: #fff;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #9ca3af;
}
.sms-list-header__shop { flex: 1; }
.sms-list-header__check { width: 32px; }

/* ── Shop rows ── */
.sms-list { flex: 1; background: #fff; }
.sms-shop-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; cursor: pointer;
  border-bottom: 1px solid #f3f4f6; transition: background .15s;
}
.sms-shop-row:hover { background: #f9fafb; }
.sms-shop-row.selected { background: #fef2f2; }
.sms-shop-row--pending { opacity: .6; pointer-events: none; }
.sms-shop-row__icon { width: 32px; height: 32px; border-radius: 8px; background: #f3f4f6; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.sms-shop-row__info { flex: 1; min-width: 0; }
.sms-shop-row__name { font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sms-shop-row__type { font-size: 11px; color: #9ca3af; }

/* ── Check dot ── */
.sms-check-dot {
  width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid #d1d5db; background: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all .15s;
}
.sms-check-dot.active { background: #ff3131; border-color: #ff3131; }

/* ── Footer ── */
.sms-footer {
  flex-shrink: 0; display: flex; align-items: center; gap: 8px;
  padding: 14px 16px; border-top: 1px solid #e5e7eb; background: #fff;
  box-shadow: 0 -4px 16px rgba(0,0,0,.06); min-height: 64px;
}
.sms-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 16px; border-radius: 100px; font-size: 13.5px; font-weight: 600;
  border: none; cursor: pointer; transition: all .2s;
}
.sms-btn--ghost { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; flex-shrink: 0; }
.sms-btn--ghost:hover { background: #e5e7eb; }
.sms-footer__hint { flex: 1; font-size: 12px; color: #9ca3af; text-align: center; margin: 0; }

/* ── Spinner ── */
.sms-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(0,0,0,.12); animation: sms-spin .6s linear infinite; flex-shrink: 0; }
.sms-spinner--accent { border-top-color: #ff3131; }
@keyframes sms-spin { to { transform: rotate(360deg); } }

/* ── Transition ── */
.sms-drawer-enter-active, .sms-drawer-leave-active { transition: opacity .25s ease; }
.sms-drawer-enter-active .sms-panel, .sms-drawer-leave-active .sms-panel { transition: transform .25s cubic-bezier(.4,0,.2,1); }
.sms-drawer-enter-from, .sms-drawer-leave-to { opacity: 0; }
.sms-drawer-enter-from .sms-panel, .sms-drawer-leave-to .sms-panel { transform: translateX(100%); }

/* ── Dark mode ── */
.sms-panel--dark { background: #111827; }
.sms-panel--dark .sms-body { background: #111827; }
.sms-panel--dark .sms-search { background: #1e293b; border-color: #334155; }
.sms-panel--dark .sms-search__input { color: #e2e8f0; }
.sms-panel--dark .sms-select-all { background: rgba(255,49,49,.1); border-color: rgba(255,49,49,.3); }
.sms-panel--dark .sms-select-all:hover { background: rgba(255,49,49,.18); }
.sms-panel--dark .sms-check-box { border-color: #475569; background: #1e293b; }
.sms-panel--dark .sms-check-box.checked,
.sms-panel--dark .sms-check-box.indeterminate { background: #ff3131; border-color: #ff3131; }
.sms-panel--dark .sms-list-header { background: #1f2937; border-bottom-color: rgba(255,255,255,.08); }
.sms-panel--dark .sms-list { background: #111827; }
.sms-panel--dark .sms-shop-row { background: #111827; border-bottom-color: rgba(255,255,255,.05); }
.sms-panel--dark .sms-shop-row:hover { background: #1e293b; }
.sms-panel--dark .sms-shop-row.selected { background: rgba(255,49,49,.1); }
.sms-panel--dark .sms-shop-row__name { color: #e2e8f0; }
.sms-panel--dark .sms-shop-row__icon { background: #1e293b; }
.sms-panel--dark .sms-check-dot { border-color: #475569; background: #1e293b; }
.sms-panel--dark .sms-empty__icon { background: #1e293b; }
.sms-panel--dark .sms-footer { background: #111827; border-top-color: rgba(255,255,255,.08); }
.sms-panel--dark .sms-btn--ghost { background: #1e293b; color: #e2e8f0; border-color: #334155; }
</style>
