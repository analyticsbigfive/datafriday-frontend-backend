<template>
  <Teleport to="body">
    <Transition name="smi-drawer">
      <div v-if="modelValue" class="smi-overlay" @click.self="$emit('update:modelValue', false)">
        <div class="smi-panel" :class="{ 'smi-panel--dark': isDark }">

          <!-- Gradient Header -->
          <div class="smi-header">
            <div class="smi-header__icon">
              <UtensilsCrossed :size="20" color="white" />
            </div>
            <div class="smi-header__titles">
              <div class="smi-header__title">{{ shop ? shop.name : '' }}</div>
              <div class="smi-header__sub">
                <span class="smi-count-badge">{{ allMenuItems.length }} {{ t("spaceMenu.items") }}</span>
              </div>
            </div>
            <button class="smi-close-btn" @click="$emit('update:modelValue', false)">
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="smi-body">

            <!-- Loading -->
            <div v-if="menuItemsLoading" class="smi-loading">
              <v-progress-circular indeterminate color="#ff3131" :size="36" />
              <p>{{ t("spaceMenu.loadingMenuItems") }}</p>
            </div>

            <!-- Erreur de chargement (distincte du « vraiment vide ») -->
            <div v-else-if="loadError" class="smi-empty">
              <div class="smi-empty__icon"><AlertCircle :size="32" style="color:#ff3131" /></div>
              <p class="smi-empty__title">{{ t("spaceMenu.loadError") }}</p>
              <button class="smi-btn smi-btn--ghost" style="margin-top:10px" @click="loadMenuItems">
                {{ t("spaceMenu.retry") }}
              </button>
            </div>

            <!-- Empty -->
            <div v-else-if="allMenuItems.length === 0" class="smi-empty">
              <div class="smi-empty__icon"><Package :size="32" style="color:#d1d5db" /></div>
              <p class="smi-empty__title">{{ t("spaceMenu.noMenuItemsFound") }}</p>
            </div>

            <div v-else class="smi-content">

              <!-- Tabs -->
              <div class="smi-tabs">
                <button
                  class="smi-tab"
                  :class="{ active: availabilityTab === 'available' }"
                  @click="availabilityTab = 'available'"
                >
                  {{ t("spaceMenu.available") }}
                  <span class="smi-tab__count">{{ availableCount }}</span>
                </button>
                <button
                  class="smi-tab"
                  :class="{ active: availabilityTab === 'not-available' }"
                  @click="availabilityTab = 'not-available'"
                >
                  {{ t("spaceMenu.notAvailable") }}
                  <span class="smi-tab__count smi-tab__count--grey">{{ notAvailableCount }}</span>
                </button>
              </div>

              <!-- List header -->
              <div class="smi-list-header">
                <div class="smi-list-header__item">{{ t("spaceMenu.menuItem") }}</div>
                <div class="smi-list-header__price">{{ t("price") }}</div>
                <div class="smi-list-header__check"></div>
              </div>

              <!-- Items -->
              <div class="smi-list">
                <template v-for="item in displayedMenuItems" :key="item.id">
                  <div
                    class="smi-item-row"
                    :class="{
                      selected: item.available && selectedMenuItemIds.includes(String(item.id)),
                      'smi-item-row--unavailable': !item.available,
                    }"
                    @click="toggleMenuItem(item)"
                  >
                    <!-- Tooltip "Missing Ingredients" au survol de toute la ligne (items
                         non disponibles) — même pattern que le prototype React :
                         « Ingrédient (Fournisseur) », fournisseur venant du backend. -->
                    <v-tooltip
                      v-if="!item.available"
                      activator="parent"
                      location="left"
                      :z-index="10000"
                      content-class="smi-missing-tooltip"
                    >
                      <div class="smi-missing-tooltip__title">{{ t('spaceMenu.missingIngredients') }}</div>
                      <ul class="smi-missing-tooltip__list">
                        <template v-if="item.missingIngredients.length">
                          <li v-for="(m, i) in item.missingIngredients" :key="i">{{ missingLine(m) }}</li>
                        </template>
                        <li v-else>{{ t('spaceMenu.noRecipe') }}</li>
                      </ul>
                    </v-tooltip>
                    <!-- Image -->
                    <div class="smi-item-row__img">
                      <img v-if="item.image" :src="item.image" />
                      <Package v-else :size="16" style="color:#9ca3af" />
                    </div>
                    <!-- Info -->
                    <div class="smi-item-row__info">
                      <div class="smi-item-row__name" :class="{ 'smi-item-row__name--unavailable': !item.available }">
                        <span v-if="item.available" class="smi-avail-dot smi-avail-dot--ok"></span>
                        {{ item.name }}
                      </div>
                      <div class="smi-item-row__cat">{{ item.category }}</div>
                    </div>
                    <!-- Price -->
                    <div class="smi-item-row__price" :style="item.available ? 'color:#ff3131' : 'color:#9ca3af'">
                      {{ formatCurrency(item.price) }}
                    </div>
                    <!-- Check dot (disponible) / alerte rouge (non disponible) -->
                    <div v-if="item.available" class="smi-check-dot" :class="{ active: selectedMenuItemIds.includes(String(item.id)) }">
                      <Check v-if="selectedMenuItemIds.includes(String(item.id))" :size="10" color="white" />
                    </div>
                    <span v-else class="smi-alert-icon">
                      <AlertCircle :size="16" />
                    </span>
                  </div>
                </template>
              </div>

            </div>
          </div>

          <!-- Footer -->
          <div class="smi-footer">
            <button class="smi-btn smi-btn--ghost" @click="$emit('update:modelValue', false)">
              {{ t('cancel') }}
            </button>
            <button
              v-if="hasChanges"
              class="smi-btn smi-btn--primary"
              :disabled="attachLoading"
              @click="attachMenuItems"
            >
              <span v-if="attachLoading" class="smi-spinner"></span>
              <Check v-else :size="14" />
              {{ t("spaceMenu.validateSelection") }} ({{ selectedMenuItemIds.length }})
            </button>
            <p v-else class="smi-footer__hint">{{ t("spaceMenu.selectItemsToAttach") }}</p>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from "@/i18n/useI18n";
import { X, UtensilsCrossed, Package, Check, AlertCircle } from 'lucide-vue-next';
import { assignMenuItemsToShop, getShopAvailableMenuItems } from "@/api/endpoints/menu.api";
import { formatCurrency } from "@/composables/useFormatters";

export default {
  name: 'ShopMenuItemsDrawer',
  components: { X, UtensilsCrossed, Package, Check, AlertCircle },
  setup() {
    const { t } = useI18n();
    return { t, formatCurrency };
  },
  props: {
    modelValue: { type: Boolean, default: false },
    shop: { type: Object, default: null },
    spaceId: { type: String, default: '' },
    configId: { type: String, default: '' },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'attached'],
  beforeUnmount() {
    document.body.style.overflow = '';
  },
  // BUG-117 : la route hôte (/space-menus) est keep-alive — quitter la page sans fermer ce
  // tiroir déclenche `deactivated()`, jamais `beforeUnmount()`, ce qui laissait le scroll body
  // verrouillé en permanence sur les autres écrans de l'app.
  deactivated() {
    document.body.style.overflow = '';
  },
  data() {
    return {
      menuItemsLoading: false,
      allMenuItems: [],
      loadError: null,
      availabilityTab: 'available',
      selectedMenuItemIds: [],
      initialSelectedIds: [],
      attachLoading: false,
    };
  },
  watch: {
    modelValue(isOpen) {
      document.body.style.overflow = isOpen ? 'hidden' : '';
      // BUG-119 : annule le nettoyage différé d'une fermeture précédente — sans ça, une
      // réouverture rapide (<300ms) sur le même shop ou un autre pouvait laisser le timer
      // périmé vider le formulaire juste après son rechargement.
      if (this._clearTimer) {
        clearTimeout(this._clearTimer);
        this._clearTimer = null;
      }
      if (isOpen && this.shop) {
        this.selectedMenuItemIds = [];
        this.availabilityTab = 'available';
        this.loadMenuItems();
      } else if (!isOpen) {
        this._clearTimer = setTimeout(() => {
          this.allMenuItems = [];
          this.selectedMenuItemIds = [];
          this._clearTimer = null;
        }, 300);
      }
    },
  },
  computed: {
    availableMenuItems()    { return (this.allMenuItems || []).filter(item => item.available === true); },
    notAvailableMenuItems() { return (this.allMenuItems || []).filter(item => item.available !== true); },
    displayedMenuItems() {
      if (this.availabilityTab === 'available')     return this.availableMenuItems;
      if (this.availabilityTab === 'not-available') return this.notAvailableMenuItems;
      return this.allMenuItems;
    },
    availableCount()    { return this.availableMenuItems.length; },
    notAvailableCount() { return this.notAvailableMenuItems.length; },
    hasChanges() {
      const curr = new Set(this.selectedMenuItemIds);
      const init = new Set(this.initialSelectedIds);
      if (curr.size !== init.size) return true;
      if ([...curr].some(id => !init.has(id))) return true;
      return [...init].some(id => !curr.has(id));
    },
  },
  methods: {
    // Toute la logique de disponibilité (ingrédients actifs, fournisseur résolu,
    // fournisseur livrant l'espace du shop, récursion composants) est calculée côté
    // BACKEND — GET /space-menu/shop/:shopId/items. Ici on ne fait qu'afficher.
    async loadMenuItems() {
      if (!this.shop) return;
      // Garde anti-course : une sélection rapide shop A → shop B avant que la réponse de A ne
      // revienne ne doit pas écraser l'état affiché (déjà celui de B) avec les données de A.
      const requestedShopId = this.shop.id;
      this.menuItemsLoading = true;
      this.loadError = null;
      try {
        // configId : sans lui le backend devine (1re adhésion) — faux pour un shop
        // partagé entre configs (les coches de la config A s'affichaient en config B).
        const res = await getShopAvailableMenuItems(requestedShopId, this.configId);
        if (!this.shop || this.shop.id !== requestedShopId) return;
        this.allMenuItems = (res?.items || []).map(item => ({
          id: String(item.id),
          name: item.name || '-',
          category: item.category || '',
          price: item.price,
          image: item.picture || '',
          available: item.available === true,
          hasRecipe: item.hasRecipe === true,
          missingIngredients: item.missingIngredients || [],
        }));
        this.selectedMenuItemIds = (res?.items || [])
          .filter(item => item.enabled)
          .map(item => String(item.id));
        this.initialSelectedIds = [...this.selectedMenuItemIds];
      } catch (e) {
        console.error('Error loading menu items:', e);
        this.allMenuItems = [];
        this.loadError = e?.response?.data?.message || e?.message || 'Load failed';
      } finally {
        this.menuItemsLoading = false;
      }
    },
    // Une ligne du tooltip : « Ingrédient (Fournisseur) » comme le prototype ; si le
    // fournisseur n'est pas résolu, la raison backend en parenthèse (sans fournisseur…).
    missingLine(m) {
      if (m.supplierName) return `${m.name} (${m.supplierName})`;
      const reasonKey = {
        INACTIVE: 'spaceMenu.reasonInactive',
        NO_SUPPLIER: 'spaceMenu.reasonNoSupplier',
        SUPPLIER_NOT_IN_SPACE: 'spaceMenu.reasonSupplierNotInSpace',
      };
      return `${m.name} (${this.t(reasonKey[m.reason] || 'spaceMenu.notAvailable')})`;
    },
    toggleMenuItem(item) {
      if (!item.available) return;
      const id = String(item?.id || '');
      if (!id) return;
      const idx = this.selectedMenuItemIds.indexOf(id);
      if (idx >= 0) this.selectedMenuItemIds.splice(idx, 1);
      else this.selectedMenuItemIds.push(id);
    },
    async attachMenuItems() {
      if (!this.shop?.id) return;
      this.attachLoading = true;
      try {
        // N'envoyer que les items dont l'état a changé depuis l'ouverture du drawer
        const menuItemsMap = Object.fromEntries(
          this.allMenuItems
            .filter(item => {
              const id = String(item.id);
              const was = this.initialSelectedIds.includes(id);
              const is  = this.selectedMenuItemIds.includes(id);
              return was !== is;
            })
            .map(item => {
              const id = String(item.id);
              return [id, this.selectedMenuItemIds.includes(id)];
            })
        );
        if (!Object.keys(menuItemsMap).length) {
          this.$emit('update:modelValue', false);
          return;
        }
        await assignMenuItemsToShop(this.spaceId, this.configId, this.shop.id, menuItemsMap);
        // Pas de refetch : on connaît déjà l'état final (sélection locale = items enabled).
        this.$emit('attached', { shopId: this.shop.id, newCount: this.selectedMenuItemIds.length, error: null });
        this.$emit('update:modelValue', false);
      } catch (e) {
        this.$emit('attached', {
          shopId: this.shop.id,
          newCount: 0,
          error: e?.response?.data?.message || e?.message || 'Failed to attach menu items',
        });
      } finally {
        this.attachLoading = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.smi-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 2000; display: flex; justify-content: flex-end; }

/* ── Panel ── */
.smi-panel { width: 500px; height: 100%; display: flex; flex-direction: column; background: #fff; box-shadow: -8px 0 32px rgba(0,0,0,.12); }

/* ── Gradient Header ── */
.smi-header {
  flex-shrink: 0;
  background: #ff3131;
  padding: 18px 20px; display: flex; align-items: center; gap: 12px;
}
.smi-header__icon { width: 40px; height: 40px; border-radius: 12px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.smi-header__titles { flex: 1; min-width: 0; }
.smi-header__title { font-size: 15px; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.smi-header__sub { margin-top: 3px; }
.smi-count-badge { font-size: 11px; font-weight: 600; color: rgba(255,255,255,.8); background: rgba(255,255,255,.2); padding: 2px 8px; border-radius: 100px; }
.smi-close-btn { background: rgba(255,255,255,.15); border: none; cursor: pointer; width: 30px; height: 30px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; flex-shrink: 0; transition: background .2s; }
.smi-close-btn:hover { background: rgba(255,255,255,.25); }

/* ── Body ── */
.smi-body { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: #f9fafb; display: flex; flex-direction: column; }
.smi-content { display: flex; flex-direction: column; flex: 1; }

/* ── Loading ── */
.smi-loading { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px 20px; gap: 12px; }
.smi-loading p { font-size: 13px; color: #9ca3af; }

/* ── Empty ── */
.smi-empty { display: flex; flex-direction: column; align-items: center; padding: 48px 20px; text-align: center; gap: 10px; }
.smi-empty__icon { width: 60px; height: 60px; background: #f3f4f6; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
.smi-empty__title { font-size: 14px; font-weight: 600; color: #6b7280; }

/* ── Tabs ── */
.smi-tabs { display: flex; gap: 6px; padding: 12px 12px 0; background: #fff; }
.smi-tab {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 100px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-size: 12.5px; font-weight: 500; color: #6b7280; cursor: pointer; transition: all .2s;
}
.smi-tab.active { border-color: #ff3131; background: #fef2f2; color: #ff3131; font-weight: 700; }
.smi-tab__count {
  background: #ff3131; color: #fff;
  font-size: 10px; font-weight: 700; padding: 1px 5px; border-radius: 100px;
}
.smi-tab__count--grey { background: #6b7280; }

/* ── List header ── */
.smi-list-header {
  display: flex; align-items: center; padding: 8px 12px;
  border-bottom: 2px solid #e5e7eb; background: #fff;
  font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: #9ca3af;
}
.smi-list-header__item { flex: 1; }
.smi-list-header__price { width: 70px; text-align: right; }
.smi-list-header__check { width: 32px; }

/* ── Item rows ── */
.smi-list { flex: 1; background: #fff; }
.smi-item-row {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; cursor: pointer;
  border-bottom: 1px solid #f3f4f6; transition: background .15s;
}
.smi-item-row:hover { background: #f9fafb; }
.smi-item-row.selected { background: #fef2f2; }
.smi-item-row--unavailable { opacity: .65; cursor: help; }
.smi-item-row--unavailable:hover { background: #f9fafb; }

.smi-item-row__img { width: 36px; height: 36px; border-radius: 8px; background: #f3f4f6; flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center; }
.smi-item-row__img img { width: 100%; height: 100%; object-fit: cover; }

.smi-item-row__info { flex: 1; min-width: 0; }
.smi-item-row__name { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.smi-item-row__cat { font-size: 11px; color: #9ca3af; }
.smi-item-row__name--unavailable { text-decoration: line-through; color: #6b7280; }

/* ── Alert icon (non disponible) ── */
.smi-alert-icon { width: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: #ff3131; }

.smi-item-row__price { width: 70px; text-align: right; font-size: 13px; font-weight: 700; flex-shrink: 0; }

/* ── Check dot ── */
.smi-check-dot {
  width: 20px; height: 20px; border-radius: 50%;
  border: 2px solid #d1d5db; background: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: all .15s;
}
.smi-check-dot.active { background: #ff3131; border-color: #ff3131; }

/* ── Availability dot ── */
.smi-avail-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.smi-avail-dot--ok { background: #10b981; }
.smi-avail-dot--ko { background: #f59e0b; }

/* ── Footer ── */
.smi-footer {
  flex-shrink: 0; display: flex; align-items: center; gap: 8px;
  padding: 14px 16px; border-top: 1px solid #e5e7eb; background: #fff;
  box-shadow: 0 -4px 16px rgba(0,0,0,.06); min-height: 64px;
}
.smi-btn {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 9px 16px; border-radius: 100px; font-size: 13.5px; font-weight: 600;
  border: none; cursor: pointer; transition: all .2s;
}
.smi-btn--ghost { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; flex-shrink: 0; }
.smi-btn--ghost:hover { background: #e5e7eb; }
.smi-btn--primary { background: #ff3131; color: #fff; flex: 1; box-shadow: 0 4px 12px rgba(255, 49, 49,.3); }
.smi-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.smi-btn--primary:disabled { opacity: .5; cursor: not-allowed; transform: none; }
.smi-footer__hint { font-size: 12px; color: #9ca3af; text-align: center; margin: 0; width: 100%; }

/* ── Spinner ── */
.smi-spinner { width: 14px; height: 14px; border-radius: 50%; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; animation: smi-spin .6s linear infinite; }
@keyframes smi-spin { to { transform: rotate(360deg); } }

/* ── Transition ── */
.smi-drawer-enter-active, .smi-drawer-leave-active { transition: opacity .25s ease; }
.smi-drawer-enter-active .smi-panel, .smi-drawer-leave-active .smi-panel { transition: transform .25s cubic-bezier(.4,0,.2,1); }
.smi-drawer-enter-from, .smi-drawer-leave-to { opacity: 0; }
.smi-drawer-enter-from .smi-panel, .smi-drawer-leave-to .smi-panel { transform: translateX(100%); }

/* ── Dark mode ── */
.smi-panel--dark { background: #111827; }
.smi-panel--dark .smi-body { background: #111827; }
.smi-panel--dark .smi-list-header { background: #1f2937; border-bottom-color: rgba(255,255,255,.08); }
.smi-panel--dark .smi-item-row { border-bottom-color: rgba(255,255,255,.05); background: #111827; }
.smi-panel--dark .smi-item-row:hover { background: #1e293b; }
.smi-panel--dark .smi-item-row.selected { background: rgba(255, 49, 49,.1); }
.smi-panel--dark .smi-item-row__name { color: #e2e8f0; }
.smi-panel--dark .smi-item-row__img { background: #1e293b; }
.smi-panel--dark .smi-check-dot { border-color: #475569; background: #1e293b; }
.smi-panel--dark .smi-footer { background: #111827; border-top-color: rgba(255,255,255,.08); }
.smi-panel--dark .smi-btn--ghost { background: #1e293b; color: #e2e8f0; border-color: #334155; }
.smi-panel--dark .smi-tabs { background: #111827; }
.smi-panel--dark .smi-tab { border-color: #334155; background: #1e293b; color: #94a3b8; }
.smi-panel--dark .smi-tab.active { border-color: #ff3131; background: rgba(255, 49, 49,.15); color: #f87171; }
.smi-panel--dark .smi-list { background: #111827; }
.smi-panel--dark .smi-item-row--unavailable:hover { background: #1e293b; }
.smi-panel--dark .smi-item-row__name--unavailable { color: #94a3b8; }
</style>

<!-- Non-scoped : le contenu du v-tooltip est téléporté dans <body>, les styles scoped
     ne l'atteignent pas. Tooltip blanc type prototype (lisible sur thème clair ET sombre). -->
<style>
.smi-missing-tooltip {
  background: #fff !important;
  color: #111827 !important;
  border-radius: 12px !important;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25) !important;
  padding: 12px 16px !important;
  max-width: 360px;
  opacity: 1 !important;
}
.smi-missing-tooltip__title { font-weight: 700; font-size: 13px; margin-bottom: 6px; }
.smi-missing-tooltip__list { margin: 0; padding-left: 18px; font-size: 12.5px; line-height: 1.7; list-style: disc; }
</style>
