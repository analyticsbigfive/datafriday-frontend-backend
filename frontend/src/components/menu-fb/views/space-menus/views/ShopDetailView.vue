<template>
  <div class="sdv-page" id="shop-detail-page">
    <div class="sdv-container">

      <!-- Header -->
      <div class="sdv-header">
        <button class="sdv-back" @click="goBack">
          <ArrowLeft :size="16" /> Retour aux boutiques
        </button>

        <div class="sdv-shop-identity">
          <div class="sdv-shop-avatar">
            <img v-if="shop?.image" :src="shop.image" :alt="shop.name" />
            <Store v-else :size="28" />
          </div>
          <div class="sdv-shop-info">
            <div class="sdv-shop-name">{{ shop?.name || "Shop" }}</div>
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
              {{ loading ? 'Chargement...' : `${filteredMenuItems.length} article${filteredMenuItems.length > 1 ? 's' : ''}` }}
            </div>
            <button class="sdv-edit-btn" :disabled="loading || !shop" @click="openEditDrawer">
              <Pencil :size="15" />
            </button>
          </div>
        </div>
      </div>

      <!-- Error -->
      <div v-if="error" class="sdv-error">
        <AlertCircle :size="16" /> {{ error }}
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
              <div class="sdv-card__title">Menu Items disponibles</div>
              <div class="sdv-card__sub">Sélectionnez des items pour les attacher au shop</div>
            </div>
            <div class="sdv-card__actions">
              <button
                v-if="selectedItems.length"
                class="sdv-btn sdv-btn--primary"
                @click="attachSelectedItems"
              >
                <Link :size="13" /> Attacher ({{ selectedItems.length }})
              </button>
              <div class="sdv-count-pill">
                <span class="sdv-count-pill__val">{{ availableCount }}</span>
                <span class="sdv-count-pill__sep">/</span>
                <span class="sdv-count-pill__total">{{ totalCount }}</span>
              </div>
            </div>
          </div>

          <!-- Tabs Available / Not Available -->
          <div class="sdv-tabs">
            <button
              class="sdv-tab"
              :class="{ active: availabilityTab === 'available' }"
              @click="availabilityTab = 'available'"
            >
              Available
              <span class="sdv-tab__count">{{ availableCount }}</span>
            </button>
            <button
              class="sdv-tab"
              :class="{ active: availabilityTab === 'not-available' }"
              @click="availabilityTab = 'not-available'"
            >
              Not Available
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
              Select All Available Items ({{ availableCount }})
            </span>
          </div>

          <!-- Items list -->
          <div class="sdv-items-list">
            <div v-if="!displayedMenuItems.length" class="sdv-empty">
              <Package :size="40" style="color:#d1d5db" />
              <p class="sdv-empty__title">Aucun article trouvé</p>
              <p class="sdv-empty__sub">Cette boutique ne contient pas d'articles dans cette catégorie</p>
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
                <div class="sdv-item-row__cat">{{ item.category || 'Uncategorized' }}</div>
              </div>
              <!-- Price -->
              <div class="sdv-item-row__price">
                {{ item.price != null ? `$${Number(item.price).toFixed(2)}` : '-' }}
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
                <Link2 :size="18" style="color:#059669" /> Items attachés au shop
              </div>
              <div class="sdv-attached-sub">{{ attachedCount }} item{{ attachedCount > 1 ? 's' : '' }} actuellement attaché{{ attachedCount > 1 ? 's' : '' }}</div>
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
                  {{ item.available ? 'Disponible' : 'Indisponible' }}
                </span>
              </div>
              <div class="sdv-attached-card__body">
                <div class="sdv-attached-card__name">{{ item.name }}</div>
                <div class="sdv-attached-card__desc">{{ item.description || 'Aucune description' }}</div>
                <div class="sdv-attached-card__footer">
                  <span class="sdv-attached-card__cat">{{ item.category || 'Autre' }}</span>
                  <span class="sdv-attached-card__price">{{ item.price != null ? `$${Number(item.price).toFixed(2)}` : '-' }}</span>
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
        @saved="onShopSaved"
      />
    </div>
  </div>
</template>

<script>
import { getShopMenuItems } from "@/api/endpoints/menu.api";
import { getAllMenuItems } from "@/api/endpoints/menu-item.api";
import { ArrowLeft, Store, Tag, Building, Settings, UtensilsCrossed, Pencil, AlertCircle, Link, Link2, Package, Check, Minus } from 'lucide-vue-next';
import ShopDetailEditDrawer from '../drawers/ShopDetailEditDrawer.vue';

export default {
  name: "ShopDetailView",
  components: { ShopDetailEditDrawer, ArrowLeft, Store, Tag, Building, Settings, UtensilsCrossed, Pencil, AlertCircle, Link, Link2, Package, Check, Minus },
  data() {
    return {
      loading: false,
      error: "",
      shop: null,
      menuItems: [], // Menu items attachés au shop
      allAvailableMenuItems: [], // Tous les menu items disponibles pour sélection

      availabilityTab: "available",
      selectedItems: [],

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
      this.$router.push({ path: "/space-menus" });
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

    async attachSelectedItems() {
      if (!this.selectedItems.length) return;

      try {
        // TODO: Appeler l'API pour attacher les items au shop
        // await attachMenuItemsToShop(this.shopId, this.selectedItems);

        // Pour l'instant, déplacer les items sélectionnés vers menuItems
        const itemsToAttach = this.allAvailableMenuItems.filter(item =>
          this.selectedItems.includes(String(item.id))
        );

        this.menuItems = [...this.menuItems, ...itemsToAttach];

        // Retirer les items attachés de la liste disponible
        this.allAvailableMenuItems = this.allAvailableMenuItems.filter(item =>
          !this.selectedItems.includes(String(item.id))
        );

        // Réinitialiser la sélection
        this.selectedItems = [];

        console.log("Items attached successfully");
      } catch (e) {
        console.error("Error attaching items:", e);
        this.error = "Failed to attach items to shop";
      }
    },

    unwrapList(res) {
      if (Array.isArray(res)) return res;
      if (Array.isArray(res?.data)) return res.data;
      if (Array.isArray(res?.items)) return res.items;
      if (Array.isArray(res?.menuItems)) return res.menuItems;
      if (Array.isArray(res?.data?.data)) return res.data.data;
      if (Array.isArray(res?.data?.items)) return res.data.items;
      return [];
    },

    normalizeMenuItem(item) {
      // Extraire le prix - PRIORITÉ: totalCost
      let price = null;
      if (item?.totalCost !== undefined && item?.totalCost !== null) {
        price = Number(item.totalCost); // PRIORITÉ 1: Coût total
      } else if (item?.basePrice !== undefined && item?.basePrice !== null) {
        price = Number(item.basePrice);
      } else if (item?.price !== undefined && item?.price !== null) {
        price = Number(item.price);
      } else if (item?.sellingPrice !== undefined && item?.sellingPrice !== null) {
        price = Number(item.sellingPrice);
      } else if (item?.unitPrice !== undefined && item?.unitPrice !== null) {
        price = Number(item.unitPrice);
      } else if (item?.unitCost !== undefined && item?.unitCost !== null) {
        price = Number(item.unitCost);
      }

      // Extraire la catégorie depuis productCategory si disponible
      let category = "";
      if (item?.productCategory?.name) {
        category = String(item.productCategory.name);
      } else if (item?.category) {
        category = String(item.category);
      } else if (item?.type) {
        category = String(item.type);
      }

      const normalized = {
        id: String(item?.id ?? item?._id ?? ""),
        name: String(item?.name ?? item?.title ?? "").trim() || "-",
        description: String(item?.description ?? "").trim(),
        category: category.trim(),
        price: price,
        image: item?.picture ?? item?.image ?? item?.photo ?? "",
        available: item?.readyForSale === "Yes" || item?.available === true || item?.isAvailable === true,
        _raw: item,
      };

      // Debug: afficher les items sans prix
      if (normalized.price === null || normalized.price === undefined || isNaN(normalized.price)) {
        console.warn("Menu item without valid price:", item);
      }

      return normalized;
    },

    normalizeShop(data) {
      return {
        id: String(data?.shopId || data?.id || ""),
        name: String(data?.shopName || data?.name || "").trim() || "Shop",
        type: String(data?.shopType || data?.type || "").trim(),
        subTypes: Array.isArray(data?.shopSubTypes) ? data.shopSubTypes : [],
        notes: data?.notes || "",
        image: data?.image || "",
        attributes: data?.attributes || {},
        _raw: data,
      };
    },

    async load() {
      if (!this.shopId) return;

      this.loading = true;
      this.error = "";
      try {
        // Charger les menu items du shop via l'API (scopé configuration si connue)
        const res = await getShopMenuItems(this.shopId, this.configId || undefined);
        console.log("Shop API Response:", res);

        // Déterminer où se trouvent les données (res directement ou res.data)
        const data = res?.data || res;

        // Extraire les informations du shop depuis la réponse
        if (data?.shopId || data?.shopName) {
          this.shop = this.normalizeShop(data);
        } else {
          // Fallback si les données du shop ne sont pas dans la réponse
          this.shop = {
            id: this.shopId,
            name: "Shop",
            type: "",
            subTypes: [],
            notes: "",
            image: "",
            attributes: {},
          };
        }

        // Extraire et normaliser les menu items attachés au shop
        let menuItemsList = [];
        if (Array.isArray(data?.menuItems)) {
          menuItemsList = data.menuItems;
        } else {
          menuItemsList = this.unwrapList(res);
        }

        this.menuItems = (menuItemsList || [])
          .map((item) => this.normalizeMenuItem(item))
          .filter((item) => item.id);

        console.log("Shop:", this.shop);
        console.log("Attached Menu Items:", this.menuItems);

        // Charger TOUS les menu items disponibles pour sélection
        await this.loadAllMenuItems();

        // Réinitialiser les sélections
        this.selectedItems = [];
        this.availabilityTab = "available";
      } catch (e) {
        this.shop = null;
        this.menuItems = [];
        this.error = e?.response?.data?.message || e?.message || "Failed to load shop menu items";
        console.error("Error loading shop menu items:", e);
      } finally {
        this.loading = false;
      }
    },

    async loadAllMenuItems() {
      try {
        const res = await getAllMenuItems();
        console.log("All Menu Items Response:", res);

        const data = res?.data || res;
        let allItems = [];

        if (Array.isArray(data)) {
          allItems = data;
        } else if (Array.isArray(data?.items)) {
          allItems = data.items;
        } else if (Array.isArray(data?.data)) {
          allItems = data.data;
        }

        console.log("Raw menu items before normalization:", allItems.slice(0, 3)); // Afficher les 3 premiers items

        // Normaliser tous les menu items
        const normalized = allItems
          .map((item) => this.normalizeMenuItem(item))
          .filter((item) => item.id);

        // Filtrer les items déjà attachés au shop
        const attachedIds = new Set(this.menuItems.map(item => item.id));
        this.allAvailableMenuItems = normalized.filter(item => !attachedIds.has(item.id));

        console.log("Available Menu Items (not attached):", this.allAvailableMenuItems.slice(0, 3));
        console.log("Total available items:", this.allAvailableMenuItems.length);
      } catch (e) {
        console.error("Error loading all menu items:", e);
        this.allAvailableMenuItems = [];
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

.sdv-shop-identity {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}
.sdv-shop-avatar {
  width: 64px; height: 64px; border-radius: 16px;
  background: #f3f4f6; flex-shrink: 0; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 12px rgba(0,0,0,.08); color: #9ca3af;
}
.sdv-shop-avatar img { width: 100%; height: 100%; object-fit: cover; }
.sdv-shop-info { flex: 1; min-width: 0; }
.sdv-shop-name { font-size: 22px; font-weight: 800; color: #111827; margin-bottom: 6px; }
.sdv-shop-badges { display: flex; flex-wrap: wrap; gap: 6px; }
.sdv-badge {
  display: inline-flex; align-items: center; gap: 3px;
  padding: 3px 10px; border-radius: 100px; font-size: 11px; font-weight: 600;
  background: #f3f4f6; color: #6b7280; border: 1px solid #e5e7eb;
}
.sdv-badge--type { background: rgba(99,102,241,.1); color: #6366f1; border-color: rgba(99,102,241,.2); }
.sdv-badge--space { background: rgba(255, 49, 49,.08); color: #ff3131; border-color: rgba(255, 49, 49,.2); }
.sdv-badge--config { background: rgba(5,150,105,.08); color: #059669; border-color: rgba(5,150,105,.2); }

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

/* ── Error ── */
.sdv-error {
  display: flex; align-items: center; gap: 8px;
  padding: 12px 16px; border-radius: 12px;
  background: #fef2f2; border: 1px solid rgba(255, 49, 49,.2);
  color: #ff3131; font-size: 13.5px; margin-bottom: 20px;
}

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
.sdv-skeleton--card { height: 120px; }
.sdv-skeletons-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.sdv-skeleton--item { height: 180px; }

/* ── Card ── */
.sdv-card { background: #fff; border-radius: 20px; border: 1px solid #e5e7eb; overflow: hidden; margin-bottom: 24px; }
.sdv-card__head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
  padding: 20px 24px 0; flex-wrap: wrap;
}
.sdv-card__title { font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 2px; }
.sdv-card__sub { font-size: 12px; color: #9ca3af; }
.sdv-card__actions { display: flex; align-items: center; gap: 10px; }

.sdv-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 100px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; transition: all .2s; }
.sdv-btn--primary { background: #ff3131; color: #fff; box-shadow: 0 4px 10px rgba(255, 49, 49,.3); }
.sdv-btn--primary:hover { box-shadow: 0 6px 16px rgba(255, 49, 49,.4); transform: translateY(-1px); }

.sdv-count-pill { display: flex; align-items: center; gap: 4px; padding: 6px 12px; background: rgba(5,150,105,.1); border-radius: 100px; }
.sdv-count-pill__val { font-size: 14px; font-weight: 700; color: #059669; }
.sdv-count-pill__sep { font-size: 12px; color: #d1d5db; }
.sdv-count-pill__total { font-size: 13px; font-weight: 500; color: #059669; }

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

/* ── Select all ── */
.sdv-select-all {
  display: flex; align-items: center; gap: 10px;
  margin: 14px 24px 8px; padding: 12px 16px;
  background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 12px;
  cursor: pointer; transition: background .15s;
}
.sdv-select-all:hover { background: #dbeafe; }
.sdv-select-all__label { font-size: 14px; font-weight: 700; color: #1e40af; }

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

/* ── Items list ── */
.sdv-items-list { padding: 0 24px 20px; max-height: 500px; overflow-y: auto; }
.sdv-empty { display: flex; flex-direction: column; align-items: center; padding: 40px 20px; text-align: center; }
.sdv-empty__title { font-size: 16px; font-weight: 600; color: #6b7280; margin: 12px 0 4px; }
.sdv-empty__sub { font-size: 13px; color: #9ca3af; }

.sdv-item-row {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 14px; margin-bottom: 6px;
  background: #f9fafb; border-radius: 12px;
  border: 1px solid transparent; cursor: pointer; transition: all .2s;
}
.sdv-item-row:hover { background: #fff; border-color: #1e40af; box-shadow: 0 2px 8px rgba(30,64,175,.1); transform: translateX(2px); }
.sdv-item-row--selected { background: #eff6ff; border-color: #93c5fd; }
.sdv-item-row__avatar {
  width: 44px; height: 44px; border-radius: 10px; background: #e5e7eb;
  flex-shrink: 0; overflow: hidden; display: flex; align-items: center; justify-content: center;
}
.sdv-item-row__avatar img { width: 100%; height: 100%; object-fit: cover; }
.sdv-item-row__info { flex: 1; min-width: 0; }
.sdv-item-row__name { font-size: 14px; font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sdv-item-row__cat { font-size: 11.5px; color: #6b7280; }
.sdv-item-row__price { font-size: 15px; font-weight: 700; color: #111827; min-width: 70px; text-align: right; }

/* ── Attached section ── */
.sdv-attached-section { margin-top: 8px; }
.sdv-attached-header { margin-bottom: 16px; }
.sdv-attached-title { display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; color: #111827; margin-bottom: 4px; }
.sdv-attached-sub { font-size: 12px; color: #9ca3af; }
.sdv-attached-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 14px; }
.sdv-attached-card { background: #fff; border-radius: 16px; border: 1px solid #e5e7eb; overflow: hidden; transition: all .2s; }
.sdv-attached-card:hover { transform: translateY(-3px); box-shadow: 0 8px 20px rgba(0,0,0,.08); }
.sdv-attached-card__img { height: 130px; background: #f3f4f6; position: relative; overflow: hidden; }
.sdv-attached-card__img img { width: 100%; height: 100%; object-fit: cover; }
.sdv-attached-card__img-placeholder { height: 100%; display: flex; align-items: center; justify-content: center; }
.sdv-avail-badge { position: absolute; top: 8px; right: 8px; padding: 3px 8px; border-radius: 100px; font-size: 10px; font-weight: 700; }
.sdv-avail-badge--ok { background: #ecfdf5; color: #059669; }
.sdv-avail-badge--ko { background: #fef2f2; color: #ff3131; }
.sdv-attached-card__body { padding: 10px 12px; }
.sdv-attached-card__name { font-size: 13px; font-weight: 700; color: #111827; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; }
.sdv-attached-card__desc { font-size: 11px; color: #6b7280; margin-bottom: 8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.sdv-attached-card__footer { display: flex; align-items: center; justify-content: space-between; }
.sdv-attached-card__cat { font-size: 10.5px; font-weight: 600; color: #6366f1; background: rgba(99,102,241,.1); padding: 2px 8px; border-radius: 100px; }
.sdv-attached-card__price { font-size: 13px; font-weight: 700; color: #ff3131; }

/* ── Scrollbar ── */
.sdv-items-list::-webkit-scrollbar { width: 6px; }
.sdv-items-list::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 3px; }
.sdv-items-list::-webkit-scrollbar-thumb { background: #d1d5db; border-radius: 3px; }
.sdv-items-list::-webkit-scrollbar-thumb:hover { background: #9ca3af; }
</style>
