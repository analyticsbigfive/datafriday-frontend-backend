<template>
  <div :class="['sdv-page', { 'sdv-page--dark': isDark }]" id="shop-detail-page">
    <div class="sdv-container">

      <!-- Header -->
      <div class="sdv-header">
        <button class="sdv-back" @click="goBack">
          <ArrowLeft :size="16" /> {{ t('spaceMenu.backToShops') }}
        </button>

        <div class="sdv-shop-identity">
          <div class="sdv-shop-avatar">
            <img v-if="shop?.image" :src="shop.image" :alt="shop.name" />
            <Store v-else :size="28" />
          </div>
          <div class="sdv-shop-info">
            <div class="sdv-shop-name">{{ shop?.name || t('spaceMenu.shopFallback') }}</div>
            <div class="sdv-shop-badges">
              <span v-if="shop?.type" class="sdv-badge sdv-badge--type">
                <Tag :size="10" /> {{ shop.type }}
              </span>
              <span v-for="subType in shop?.subTypes || []" :key="subType" class="sdv-badge">{{ subType }}</span>
              <span v-if="spaceName" class="sdv-badge sdv-badge--space">
                <Building :size="10" /> {{ spaceName }}
              </span>
              <span v-if="configName" class="sdv-badge sdv-badge--config">
                <Settings :size="10" /> {{ configName }}
              </span>
            </div>
          </div>
          <div class="sdv-header-actions">
            <div class="sdv-item-count-chip" :class="{ 'sdv-item-count-chip--loading': loading }">
              <UtensilsCrossed :size="14" />
              {{ loading ? t('loading') : `${filteredMenuItems.length} ${t('spaceMenu.items')}` }}
            </div>
            <button class="sdv-edit-btn" :disabled="loading || !shop" @click="openEditDrawer">
              <Pencil :size="15" />
            </button>
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="sdv-error">
        <AlertCircle :size="16" />
        <span class="sdv-error__msg">{{ error }}</span>
        <button class="sdv-retry-btn" @click="load">{{ t('spaceMenu.retry') }}</button>
      </div>

      <!-- Loading -->
      <div v-else-if="loading" class="sdv-skeleton-wrap">
        <div class="sdv-skeleton sdv-skeleton--card"></div>
        <div class="sdv-skeletons-grid">
          <div v-for="i in 6" :key="i" class="sdv-skeleton sdv-skeleton--item"></div>
        </div>
      </div>

      <!-- Content -->
      <div v-else class="sdv-content">

        <!-- Menu Items Section -->
        <div class="sdv-card">
          <!-- Card header -->
          <div class="sdv-card__head">
            <div>
              <div class="sdv-card__title">{{ t('spaceMenu.availableMenuItems') }}</div>
              <div class="sdv-card__sub">{{ t('spaceMenu.selectItemsToAttach') }}</div>
            </div>
            <div class="sdv-card__actions">
              <button
                v-if="selectedItems.length"
                class="sdv-btn sdv-btn--primary"
                :disabled="attachLoading"
                @click="attachSelectedItems"
              >
                <span v-if="attachLoading" class="sdv-spinner"></span>
                <Link v-else :size="13" />
                {{ t('spaceMenu.attachMenuItems') }} ({{ selectedItems.length }})
              </button>
              <div class="sdv-count-pill">
                <span class="sdv-count-pill__val">{{ availableCount }}</span>
                <span class="sdv-count-pill__sep">/</span>
                <span class="sdv-count-pill__total">{{ totalCount }}</span>
              </div>
            </div>
          </div>

          <!-- Attach error banner -->
          <div v-if="attachError" class="sdv-error sdv-error--inline">
            <AlertCircle :size="16" /> <span class="sdv-error__msg">{{ attachError }}</span>
          </div>

          <!-- Tabs Available / Not Available -->
          <div class="sdv-tabs">
            <button
              class="sdv-tab"
              :class="{ active: availabilityTab === 'available' }"
              @click="availabilityTab = 'available'"
            >
              {{ t('spaceMenu.available') }}
              <span class="sdv-tab__count">{{ availableCount }}</span>
            </button>
            <button
              class="sdv-tab"
              :class="{ active: availabilityTab === 'not-available' }"
              @click="availabilityTab = 'not-available'"
            >
              {{ t('spaceMenu.notAvailable') }}
              <span class="sdv-tab__count sdv-tab__count--grey">{{ notAvailableCount }}</span>
            </button>
          </div>

          <!-- Select All -->
          <div class="sdv-select-all" @click="toggleSelectAll">
            <label class="sdv-check-wrap" @click.stop>
              <input
                type="checkbox"
                :checked="allItemsSelected"
                :indeterminate.prop="someItemsSelected && !allItemsSelected"
                class="visually-hidden"
                @change="toggleSelectAll"
              />
              <span class="sdv-check-box" :class="{ checked: allItemsSelected, indeterminate: someItemsSelected && !allItemsSelected }">
                <Check v-if="allItemsSelected" :size="11" color="white" />
                <Minus v-else-if="someItemsSelected" :size="11" color="white" />
              </span>
            </label>
            <span class="sdv-select-all__label">
              {{ t('spaceMenu.selectAllAvailableItems') }} ({{ availableCount }})
            </span>
          </div>

          <!-- Items list -->
          <div class="sdv-items-list">
            <div v-if="!displayedMenuItems.length" class="sdv-empty">
              <Package :size="40" style="color:#d1d5db" />
              <p class="sdv-empty__title">{{ t('spaceMenu.noItemsFound') }}</p>
              <p class="sdv-empty__sub">{{ t('spaceMenu.noItemsFoundSub') }}</p>
            </div>

            <div
              v-for="item in displayedMenuItems"
              :key="item.id"
              class="sdv-item-row"
              :class="{ 'sdv-item-row--selected': selectedItems.includes(String(item.id)) }"
              @click="toggleItemSelection(item)"
            >
              <!-- Avatar -->
              <div class="sdv-item-row__avatar">
                <img v-if="item.image" :src="item.image" cover />
                <Package v-else :size="20" style="color:#9ca3af" />
              </div>
              <!-- Info -->
              <div class="sdv-item-row__info">
                <div class="sdv-item-row__name">{{ item.name }}</div>
                <div class="sdv-item-row__cat">{{ item.category || t('spaceMenu.uncategorized') }}</div>
              </div>
              <!-- Price -->
              <div class="sdv-item-row__price">
                {{ item.price != null ? formatCurrency(item.price) : '-' }}
              </div>
              <!-- Checkbox -->
              <label class="sdv-check-wrap" @click.stop>
                <input
                  type="checkbox"
                  :value="String(item.id)"
                  v-model="selectedItems"
                  class="visually-hidden"
                />
                <span class="sdv-check-box" :class="{ checked: selectedItems.includes(String(item.id)) }">
                  <Check v-if="selectedItems.includes(String(item.id))" :size="11" color="white" />
                </span>
              </label>
            </div>
          </div>
        </div>

        <!-- Attached Menu Items Section -->
        <div v-if="attachedCount > 0" class="sdv-attached-section">
          <div class="sdv-attached-header">
            <div>
              <div class="sdv-attached-title">
                <Link2 :size="18" style="color:#059669" /> {{ t('spaceMenu.attachedToShop') }}
              </div>
              <div class="sdv-attached-sub">{{ attachedCount }} {{ t('spaceMenu.itemsCurrentlyAttached') }}</div>
            </div>
          </div>

          <div class="sdv-attached-grid">
            <div v-for="item in attachedMenuItems" :key="item.id" class="sdv-attached-card">
              <div class="sdv-attached-card__img">
                <img v-if="item.image" :src="item.image" />
                <div v-else class="sdv-attached-card__img-placeholder">
                  <Package :size="24" style="color:#d1d5db" />
                </div>
                <span
                  v-if="item.available !== undefined"
                  class="sdv-avail-badge"
                  :class="item.available ? 'sdv-avail-badge--ok' : 'sdv-avail-badge--ko'"
                >
                  {{ item.available ? t('spaceMenu.available') : t('spaceMenu.notAvailable') }}
                </span>
              </div>
              <div class="sdv-attached-card__body">
                <div class="sdv-attached-card__name">{{ item.name }}</div>
                <div class="sdv-attached-card__desc">{{ item.description || t('spaceMenu.noDescription') }}</div>
                <div class="sdv-attached-card__footer">
                  <span class="sdv-attached-card__cat">{{ item.category || t('spaceMenu.uncategorized') }}</span>
                  <span class="sdv-attached-card__price">{{ item.price != null ? formatCurrency(item.price) : '-' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      <ShopDetailEditDrawer
        v-model="editDrawer"
        :shop="shop"
        :current-configurations="currentConfigurations"
        :is-dark="isDark"
        @saved="onShopSaved"
      />
    </div>
  </div>
</template>

<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import { useI18n } from "@/i18n/useI18n";
import { formatCurrency } from "@/composables/useFormatters";
import { getShopMenuItems, getShopAvailableMenuItems, assignMenuItemsToShop } from "@/api/endpoints/menu.api";
import { ArrowLeft, Store, Tag, Building, Settings, UtensilsCrossed, Pencil, AlertCircle, Link, Link2, Package, Check, Minus } from 'lucide-vue-next';
import ShopDetailEditDrawer from '../drawers/ShopDetailEditDrawer.vue';

export default {
  name: "ShopDetailView",
  components: { ShopDetailEditDrawer, ArrowLeft, Store, Tag, Building, Settings, UtensilsCrossed, Pencil, AlertCircle, Link, Link2, Package, Check, Minus },
  setup() {
    const theme = useTheme();
    const { t } = useI18n();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark, formatCurrency };
  },
  data() {
    return {
      loading: false,
      error: "",
      shop: null,
      menuItems: [], // Menu items attachés au shop (enabled === true)
      allAvailableMenuItems: [], // Menu items disponibles pour sélection (non attachés)

      availabilityTab: "available",
      selectedItems: [],

      attachLoading: false,
      attachError: "",

      editDrawer: false,
    };
  },
  computed: {
    spaceId() {
      return this.$route?.params?.spaceId ? String(this.$route.params.spaceId) : "";
    },
    shopId() {
      return this.$route?.params?.shopId ? String(this.$route.params.shopId) : "";
    },
    // Scope des assignations menu (les MenuAssignment sont par configuration) ; absent =
    // le backend retombe sur la config v1 du parent puis la 1re adhésion v2 (arbitraire).
    configId() {
      const v = this.$route?.query?.configId;
      return v ? String(v) : "";
    },

    spaceName() {
      const v = this.$route?.query?.spaceName;
      return v ? String(v) : "";
    },
    configName() {
      const v = this.$route?.query?.configName;
      return v ? String(v) : "";
    },

    totalCount() {
      // Total des menu items disponibles pour sélection
      return Array.isArray(this.allAvailableMenuItems) ? this.allAvailableMenuItems.length : 0;
    },

    availableCount() {
      // Items disponibles (non attachés) et actifs
      return Array.isArray(this.allAvailableMenuItems)
        ? this.allAvailableMenuItems.filter(item => item.available !== false).length
        : 0;
    },

    notAvailableCount() {
      // Items disponibles (non attachés) mais inactifs
      return Array.isArray(this.allAvailableMenuItems)
        ? this.allAvailableMenuItems.filter(item => item.available === false).length
        : 0;
    },

    attachedCount() {
      // Nombre d'items déjà attachés au shop
      return Array.isArray(this.menuItems) ? this.menuItems.length : 0;
    },

    displayedMenuItems() {
      // Afficher les menu items disponibles (non attachés) pour sélection
      const list = Array.isArray(this.allAvailableMenuItems) ? this.allAvailableMenuItems : [];
      if (this.availabilityTab === "available") {
        return list.filter(item => item.available !== false);
      } else if (this.availabilityTab === "not-available") {
        return list.filter(item => item.available === false);
      }
      return list;
    },

    attachedMenuItems() {
      // Menu items déjà attachés au shop
      return Array.isArray(this.menuItems) ? this.menuItems : [];
    },

    filteredMenuItems() {
      return this.displayedMenuItems;
    },

    allItemsSelected() {
      if (!this.displayedMenuItems.length) return false;
      return this.displayedMenuItems.every(item => this.selectedItems.includes(String(item.id)));
    },

    someItemsSelected() {
      return this.displayedMenuItems.some(item => this.selectedItems.includes(String(item.id)));
    },

    currentConfigurations() {
      if (!this.configName) return [];
      return [
        {
          id: "current",
          name: this.configName,
          count: this.availableCount,
        },
      ];
    },
  },
  watch: {
    shopId: {
      immediate: true,
      handler() {
        this.load();
      },
    },
  },
  methods: {
    goBack() {
      if (window.history.length > 1) {
        this.$router.back();
        return;
      }
      this.$router.push({ path: "/menu-fb/space-menus" });
    },

    openEditDrawer() {
      if (!this.shop) return;
      this.editDrawer = true;
    },

    onShopSaved(updatedShop) {
      this.shop = { ...updatedShop };
      if (this.spaceId) {
        this.$store.dispatch('spaceShops/invalidateForSpace', this.spaceId);
      }
    },

    toggleItemSelection(item) {
      const id = String(item?.id || "");
      if (!id) return;

      const idx = this.selectedItems.indexOf(id);
      if (idx >= 0) {
        this.selectedItems.splice(idx, 1);
      } else {
        this.selectedItems.push(id);
      }
    },

    toggleSelectAll() {
      if (this.allItemsSelected) {
        // Deselect all displayed items
        const displayedIds = this.displayedMenuItems.map(item => String(item.id));
        this.selectedItems = this.selectedItems.filter(id => !displayedIds.includes(id));
      } else {
        // Select all displayed items
        const displayedIds = this.displayedMenuItems.map(item => String(item.id));
        const newIds = displayedIds.filter(id => !this.selectedItems.includes(id));
        this.selectedItems = [...this.selectedItems, ...newIds];
      }
    },

    // Rattache réellement les items sélectionnés au shop via le même client que
    // ShopMenuItemsDrawer.vue (assignMenuItemsToShop). Aucun déplacement optimiste :
    // les items ne bougent de "disponibles" vers "attachés" qu'une fois l'appel résolu,
    // pour ne jamais faire croire à un succès silencieux en cas d'échec réseau.
    async attachSelectedItems() {
      if (!this.selectedItems.length || this.attachLoading) return;

      this.attachLoading = true;
      this.attachError = "";
      try {
        const menuItemsMap = Object.fromEntries(
          this.selectedItems.map((id) => [id, true])
        );
        await assignMenuItemsToShop(this.spaceId, this.configId, this.shopId, menuItemsMap);

        const itemsToAttach = this.allAvailableMenuItems
          .filter(item => this.selectedItems.includes(String(item.id)))
          .map(item => ({ ...item, enabled: true }));

        this.menuItems = [...this.menuItems, ...itemsToAttach];

        // Retirer les items attachés de la liste disponible
        this.allAvailableMenuItems = this.allAvailableMenuItems.filter(item =>
          !this.selectedItems.includes(String(item.id))
        );

        // Réinitialiser la sélection
        this.selectedItems = [];
      } catch (e) {
        this.attachError = e?.response?.data?.message || e?.message || this.t('spaceMenu.failedToAttachMenuItems');
      } finally {
        this.attachLoading = false;
      }
    },

    normalizeMenuItem(item) {
      return {
        id: String(item?.id ?? ""),
        name: String(item?.name ?? "").trim() || "-",
        description: String(item?.description ?? "").trim(),
        category: String(item?.category ?? "").trim(),
        price: item?.price != null ? Number(item.price) : null,
        image: item?.picture ?? item?.image ?? "",
        // Disponibilité calculée côté SERVEUR (ingrédients actifs + fournisseur résolu +
        // fournisseur livrant l'espace du shop) — même contrat que ShopMenuItemsDrawer,
        // plus de calcul local ad-hoc.
        available: item?.available === true,
        enabled: item?.enabled === true,
        missingIngredients: item?.missingIngredients || [],
        _raw: item,
      };
    },

    normalizeShop(data) {
      return {
        id: String(data?.shopId || data?.id || ""),
        name: String(data?.shopName || data?.name || "").trim() || this.t('spaceMenu.shopFallback'),
        type: String(data?.shopType || data?.type || "").trim(),
        subTypes: Array.isArray(data?.shopSubTypes) ? data.shopSubTypes : [],
        notes: data?.notes || "",
        image: data?.image || "",
        attributes: data?.attributes || {},
        _raw: data,
      };
    },

    // Un seul contrat pour tout charger : les infos du shop (nom/type/sous-types/image,
    // nécessaires au header et à ShopDetailEditDrawer) et les menu items avec disponibilité
    // ET statut d'attache calculés côté SERVEUR (getShopAvailableMenuItems, même client que
    // ShopMenuItemsDrawer.vue). Remplace l'ancien duo getShopMenuItems (items attachés) +
    // getAllMenuItems (catalogue tenant non scopé, cf. BUG-114).
    async load() {
      if (!this.shopId) return;

      this.loading = true;
      this.error = "";
      try {
        const [shopRes, itemsRes] = await Promise.all([
          getShopMenuItems(this.shopId, this.configId || undefined),
          getShopAvailableMenuItems(this.shopId, this.configId || undefined),
        ]);

        const shopData = shopRes?.data || shopRes;
        if (shopData?.shopId || shopData?.shopName) {
          this.shop = this.normalizeShop(shopData);
        } else {
          // Fallback si les données du shop ne sont pas dans la réponse
          this.shop = {
            id: this.shopId,
            name: this.t('spaceMenu.shopFallback'),
            type: "",
            subTypes: [],
            notes: "",
            image: "",
            attributes: {},
          };
        }

        const items = (itemsRes?.items || [])
          .map((item) => this.normalizeMenuItem(item))
          .filter((item) => item.id);

        this.menuItems = items.filter((item) => item.enabled);
        this.allAvailableMenuItems = items.filter((item) => !item.enabled);

        // Réinitialiser les sélections
        this.selectedItems = [];
        this.availabilityTab = "available";
      } catch (e) {
        this.shop = null;
        this.menuItems = [];
        this.allAvailableMenuItems = [];
        this.error = e?.response?.data?.message || e?.message || "Failed to load shop menu items";
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Page ── */
.sdv-page {
  background: linear-gradient(135deg, #f6f7fb 0%, #fafbfc 100%);
  min-height: 100vh;
}
.sdv-page--dark { background: #0f172a; }
.sdv-container { padding: 32px 24px; max-width: 1200px; margin: 0 auto; }

/* ── Header ── */
.sdv-header { margin-bottom: 28px; }
.sdv-back {
  display: inline-flex; align-items: center; gap: 6px;
  background: none; border: none; cursor: pointer;
  font-size: 13.5px; font-weight: 500; color: #6b7280;
  padding: 6px 0; margin-bottom: 16px; transition: color .2s;
}
.sdv-back:hover { color: #ff3131; }
.sdv-page--dark .sdv-back { color: #94a3b8; }
.sdv-page--dark .sdv-back:hover { color: #ff3131; }

.sdv-shop-identity {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}
.sdv-shop-avatar {
  width: 64px; height: 64px; border-radius: 16px;
  background: #f3f4f6; flex-shrink: 0; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,.08); color: #9ca3af;
}
.sdv-page--dark .sdv-shop-avatar { background: #1e293b; box-shadow: none; }
.sdv-shop-avatar img { width: 100%; height: 100%; object-fit: cover; }
.sdv-shop-info { flex: 1; min-width: 0; }
.sdv-shop-name { font-size: 22px; font-weight: 800; color: #111827; margin-bottom: 6px; }
.sdv-page--dark .sdv-shop-name { color: #e2e8f0; }
.sdv-shop-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.sdv-badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 600;
  background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb;
}
.sdv-page--dark .sdv-badge { background: #1e293b; color: #94a3b8; border-color: rgba(255,255,255,.08); }
.sdv-badge--type { background: rgba(99,102,241,.1); color: #6366f1; border-color: rgba(99,102,241,.2); }
.sdv-badge--space { background: rgba(255, 49, 49,.08); color: #ff3131; border-color: rgba(255, 49, 49,.2); }
.sdv-badge--config { background: rgba(5,150,105,.08); color: #059669; border-color: rgba(5,150,105,.2); }
.sdv-page--dark .sdv-badge--type { background: rgba(99,102,241,.15); border-color: rgba(99,102,241,.3); }
.sdv-page--dark .sdv-badge--space { background: rgba(255, 49, 49,.15); border-color: rgba(255, 49, 49,.3); }
.sdv-page--dark .sdv-badge--config { background: rgba(5,150,105,.15); border-color: rgba(5,150,105,.3); }

.sdv-header-actions { display: flex; align-items: center; gap: 10px; margin-left: auto; }
.sdv-item-count-chip {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 100px;
  background: linear-gradient(135deg, #ff3131, #b91c1c);
  color: #fff; font-size: 13.5px; font-weight: 600;
  box-shadow: 0 4px 12px rgba(255, 49, 49,.3);
}
.sdv-item-count-chip--loading { background: linear-gradient(135deg, #9ca3af, #6b7280); box-shadow: none; }
.sdv-edit-btn {
  width: 40px; height: 40px; border-radius: 12px;
  border: 1.5px solid #e5e7eb; background: #fff; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: #374151; transition: all .2s;
}
.sdv-edit-btn:hover:not(:disabled) { border-color: #ff3131; color: #ff3131; }
.sdv-edit-btn:disabled { opacity: .4; cursor: not-allowed; }
.sdv-page--dark .sdv-edit-btn { background: #1e293b; border-color: rgba(255,255,255,.08); color: #e2e8f0; }

/* ── Error ── */
.sdv-error {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px; border-radius: 12px;
  background: #fef2f2; border: 1px solid rgba(255, 49, 49,.2);
  color: #ff3131; font-size: 13.5px; margin-bottom: 20px;
}
.sdv-error--inline { margin: 14px 24px 0; }
.sdv-error__msg { flex: 1; }
.sdv-page--dark .sdv-error { background: rgba(255, 49, 49,.1); border-color: rgba(255, 49, 49,.3); }
.sdv-retry-btn {
  padding: 6px 16px; border: none; border-radius: 100px;
  background: #ff3131; color: #fff; font-size: 12.5px; font-weight: 600; cursor: pointer;
  transition: box-shadow .2s; flex-shrink: 0;
}
.sdv-retry-btn:hover { box-shadow: 0 4px 12px rgba(255, 49, 49,.35); }

/* ── Skeleton ── */
@keyframes shimmer {
  0% { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
.sdv-skeleton-wrap { display: flex; flex-direction: column; gap: 16px; }
.sdv-skeleton {
  border-radius: 16px;
  background: linear-gradient(90deg, #f3f4f6 25%, #e5e7eb 50%, #f3f4f6 75%);
  background-size: 800px 100%; animation: shimmer 1.5s infinite;
}
.sdv-page--dark .sdv-skeleton {
  background: linear-gradient(90deg, #1e293b 25%, #334155 50%, #1e293b 75%);
  background-size: 800px 100%;
}
.sdv-skeleton--card { height: 120px; }
.sdv-skeletons-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.sdv-skeleton--item { height: 180px; }

/* ── Card ── */
.sdv-card { background: #fff; border-radius: 20px; border: 1px solid #e5e7eb; overflow: hidden; margin-bottom: 24px; }
.sdv-page--dark .sdv-card { background: #111827; border-color: rgba(255,255,255,.08); }
.sdv-card__head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  padding: 20px 24px 0; flex-wrap: wrap;
}
.sdv-card__title { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 2px; }
.sdv-page--dark .sdv-card__title { color: #e2e8f0; }
.sdv-card__sub { font-size: 12px; color: #9ca3af; }
.sdv-page--dark .sdv-card__sub { color: #64748b; }
.sdv-card__actions { display: flex; align-items: center; gap: 10px; }

.sdv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 100px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: all .2s; }
.sdv-btn--primary { background: #ff3131; color: #fff; box-shadow: 0 4px 10px rgba(255, 49, 49,.3); }
.sdv-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 16px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.sdv-btn--primary:disabled { opacity: .6; cursor: not-allowed; transform: none; }

.sdv-spinner {
  width: 13px; height: 13px; border-radius: 50%;
  border: 2px solid rgba(255,255,255,.35); border-top-color: #fff;
  animation: sdv-spin .6s linear infinite; flex-shrink: 0;
}
@keyframes sdv-spin { to { transform: rotate(360deg); } }

.sdv-count-pill { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: rgba(5,150,105,.1); border-radius: 100px; }
.sdv-count-pill__val { font-size: 14px; font-weight: 700; color: #059669; }
.sdv-count-pill__sep { font-size: 12px; color: #d1d5db; }
.sdv-count-pill__total { font-size: 13px; font-weight: 500; color: #059669; }
.sdv-page--dark .sdv-count-pill { background: rgba(5,150,105,.15); }
.sdv-page--dark .sdv-count-pill__sep { color: #475569; }

/* ── Tabs ── */
.sdv-tabs { display: flex; padding: 16px 24px 0; gap: 4px; }
.sdv-tab {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 100px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-size: 13px; font-weight: 500; color: #6b7280; cursor: pointer; transition: all .2s;
}
.sdv-tab.active { border-color: #1e40af; background: rgba(30,64,175,.08); color: #1e40af; font-weight: 700; }
.sdv-tab__count {
  background: #1e40af; color: #fff;
  font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 100px;
}
.sdv-tab__count--grey { background: #6b7280; }
.sdv-page--dark .sdv-tab { border-color: rgba(255,255,255,.08); background: #1e293b; color: #94a3b8; }
.sdv-page--dark .sdv-tab.active { border-color: #3b82f6; background: rgba(59,130,246,.15); color: #93c5fd; }

/* ── Select all ── */
.sdv-select-all {
  display: flex; align-items: center; gap: 10px;
  margin: 14px 24px 8px; padding: 12px 16px;
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px;
  cursor: pointer; transition: background .15s;
}
.sdv-select-all:hover { background: #dbeafe; }
.sdv-select-all__label { font-size: 14px; font-weight: 700; color: #1e40af; }
.sdv-page--dark .sdv-select-all { background: rgba(59,130,246,.1); border-color: rgba(59,130,246,.3); }
.sdv-page--dark .sdv-select-all:hover { background: rgba(59,130,246,.18); }
.sdv-page--dark .sdv-select-all__label { color: #93c5fd; }

/* ── Custom checkbox ── */
.sdv-check-wrap { display: inline-flex; align-items: center; cursor: pointer; }
.visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
.sdv-check-box {
  width: 18px; height: 18px; border-radius: 4px;
  border: 2px solid #d1d5db; background: #fff;
  display: flex; align-items: center; justify-content: center;
  transition: all .15s;
}
.sdv-check-box.checked { background: #1e40af; border-color: #1e40af; }
.sdv-check-box.indeterminate { background: #1e40af; border-color: #1e40af; }
.sdv-page--dark .sdv-check-box { border-color: #475569; background: #1e293b; }

/* ── Items list ── */
.sdv-items-list { padding: 0 24px 20px; max-height: 500px; overflow-y: auto; }
.sdv-empty { display: flex; flex-direction: column; align-items: center; padding: 40px 20px; text-align: center; }
.sdv-empty__title { font-size: 16px; font-weight: 600; color: #6b7280; margin: 12px 0 4px; }
.sdv-empty__sub { font-size: 13px; color: #9ca3af; }
.sdv-page--dark .sdv-empty__title { color: #94a3b8; }
.sdv-page--dark .sdv-empty__sub { color: #64748b; }

.sdv-item-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 14px; margin-bottom: 6px;
  background: #f9fafb; border-radius: 12px;
  border: 1px solid transparent; cursor: pointer; transition: all .2s;
}
.sdv-item-row:hover { background: #fff; border-color: #1e40af; box-shadow: 0 2px 8px rgba(30,64,175,.1); transform: translateX(2px); }
.sdv-item-row--selected { background: #eff6ff; border-color: #93c5fd; }
.sdv-page--dark .sdv-item-row { background: #1e293b; }
.sdv-page--dark .sdv-item-row:hover { background: #263449; border-color: #3b82f6; }
.sdv-page--dark .sdv-item-row--selected { background: rgba(59,130,246,.15); border-color: #3b82f6; }
.sdv-item-row__avatar {
  width: 44px; height: 44px; border-radius: 10px; background: #e5e7eb;
  flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center;
}
.sdv-page--dark .sdv-item-row__avatar { background: #334155; }
.sdv-item-row__avatar img { width: 100%; height: 100%; object-fit: cover; }
.sdv-item-row__info { flex: 1; min-width: 0; }
.sdv-item-row__name { font-size: 14px; font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sdv-item-row__cat { font-size: 11.5px; color: #6b7280; }
.sdv-item-row__price { font-size: 15px; font-weight: 700; color: #111827; min-width: 70px; text-align: right; }
.sdv-page--dark .sdv-item-row__name { color: #e2e8f0; }
.sdv-page--dark .sdv-item-row__cat { color: #94a3b8; }
.sdv-page--dark .sdv-item-row__price { color: #e2e8f0; }

/* ── Attached section ── */
.sdv-attached-section { margin-top: 8px; }
.sdv-attached-header { margin-bottom: 16px; }
.sdv-attached-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 4px; }
.sdv-attached-sub { font-size: 12px; color: #9ca3af; }
.sdv-page--dark .sdv-attached-title { color: #e2e8f0; }
.sdv-page--dark .sdv-attached-sub { color: #64748b; }
.sdv-attached-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
.sdv-attached-card { background: #fff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden; transition: all .2s; }
.sdv-attached-card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,.08); }
.sdv-page--dark .sdv-attached-card { background: #111827; border-color: rgba(255,255,255,.08); }
.sdv-attached-card__img { height: 130px; background: #f3f4f6; position: relative; overflow: hidden; }
.sdv-page--dark .sdv-attached-card__img { background: #1e293b; }
.sdv-attached-card__img img { width: 100%; height: 100%; object-fit: cover; }
.sdv-attached-card__img-placeholder { height: 100%; display: flex; align-items: center; justify-content: center; }
.sdv-avail-badge { position: absolute; top: 8px; right: 8px; padding: 3px 8px; border-radius: 100px; font-size: 10px; font-weight: 700; }
.sdv-avail-badge--ok { background: #ecfdf5; color: #059669; }
.sdv-avail-badge--ko { background: #fef2f2; color: #ff3131; }
.sdv-page--dark .sdv-avail-badge--ok { background: rgba(5,150,105,.2); }
.sdv-page--dark .sdv-avail-badge--ko { background: rgba(255, 49, 49,.2); }
.sdv-attached-card__body { padding: 10px 12px; }
.sdv-attached-card__name { font-size: 13px; font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; }
.sdv-attached-card__desc { font-size: 11px; color: #6b7280; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sdv-page--dark .sdv-attached-card__name { color: #e2e8f0; }
.sdv-page--dark .sdv-attached-card__desc { color: #94a3b8; }
.sdv-attached-card__footer { display: flex; align-items: center; justify-content: space-between; }
.sdv-attached-card__cat { font-size: 10.5px; font-weight: 600; color: #6366f1; background: rgba(99,102,241,.1); padding: 2px 8px; border-radius: 100px; }
.sdv-attached-card__price { font-size: 13px; font-weight: 700; color: #ff3131; }
.sdv-page--dark .sdv-attached-card__cat { background: rgba(99,102,241,.2); }

/* ── Scrollbar ── */
.sdv-items-list::-webkit-scrollbar { width: 6px; }
.sdv-items-list::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
.sdv-items-list::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
.sdv-items-list::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
.sdv-page--dark .sdv-items-list::-webkit-scrollbar-track { background: #1e293b; }
.sdv-page--dark .sdv-items-list::-webkit-scrollbar-thumb { background: #475569; }
.sdv-page--dark .sdv-items-list::-webkit-scrollbar-thumb:hover { background: #64748b; }
</style>
