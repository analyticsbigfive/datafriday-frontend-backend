<script>
import { computed } from "vue";
import { useTheme } from "vuetify";
import {
  Check, ChevronDown, ChevronRight, Clock, Leaf,
  Package, Plus, Search, ShoppingBasket, Truck, X,
} from "lucide-vue-next";
import * as api from "../utils/api";
import { toast } from "vue-sonner";
import ImageWithFallback from "../figma/ImageWithFallBack.vue";

export default {
  name: "MarketPriceSelector",
  components: {
    Check, ChevronDown, ChevronRight, Clock, Leaf,
    Package, Plus, Search, ShoppingBasket, Truck, X,
    ImageWithFallback,
  },
  props: {
    open:          { type: Boolean,  required: true },
    onClose:       { type: Function, required: true },
    onSelect:      { type: Function, required: true },
    goodTypeFilter:{ type: String,   default: undefined },
    title:         { type: String,   default: "Sélectionner des ingrédients" },
    description:   { type: String,   default: "Choisissez des ingrédients depuis la liste Market Price" },
  },
  setup() {
    const theme  = useTheme();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { isDark };
  },
  data() {
    return {
      searchQuery:    "",
      categoryFilter: "all",
      marketPrices:   [],
      loading:        true,
      expandedItems:  new Set(),
      selectedItems:  new Map(),
    };
  },
  watch: {
    open: {
      immediate: true,
      handler(isOpen) { if (isOpen) this.fetchData(); },
    },
  },
  computed: {
    groupedItems() {
      return (this.marketPrices || []).reduce((acc, item) => {
        if (this.goodTypeFilter && item.goodType !== this.goodTypeFilter) return acc;
        const existing = acc.find(g => g.itemName === item.itemName);
        if (existing) {
          existing.supplierItems.push(item);
        } else {
          acc.push({
            itemName:              item.itemName,
            goodType:              item.goodType,
            category:              item.category,
            recipeUnit:            item.recipeUnit,
            purchaseUnitConversion:item.purchaseUnitConversion,
            image:                 item.image,
            supplierItems:         [item],
          });
        }
        return acc;
      }, []);
    },
    filteredItems() {
      const q = String(this.searchQuery || "").toLowerCase();
      return (this.groupedItems || []).filter(group => {
        const matchesSearch =
          String(group.itemName || "").toLowerCase().includes(q) ||
          String(group.category || "").toLowerCase().includes(q);
        const matchesCategory =
          this.categoryFilter === "all" || group.category === this.categoryFilter;
        return matchesSearch && matchesCategory;
      });
    },
    categories() {
      return Array.from(
        new Set((this.groupedItems || []).map(g => g.category).filter(Boolean))
      );
    },
  },
  methods: {
    async fetchData() {
      try {
        this.loading = true;
        this.marketPrices = await api.getAllMarketPrices();
      } catch (err) {
        console.error("MarketPriceSelector fetchData:", err);
        toast.error("Impossible de charger les ingrédients");
      } finally {
        this.loading = false;
      }
    },
    toggleExpansion(itemName) {
      const s = new Set(this.expandedItems);
      s.has(itemName) ? s.delete(itemName) : s.add(itemName);
      this.expandedItems = s;
    },
    toggleItemSelection(itemName, marketPriceId) {
      const m = new Map(this.selectedItems);
      m.get(itemName) === marketPriceId ? m.delete(itemName) : m.set(itemName, marketPriceId);
      this.selectedItems = m;
      // auto-expand
      const s = new Set(this.expandedItems);
      s.add(itemName);
      this.expandedItems = s;
    },
    handleAddSelected() {
      const itemsToAdd = [];
      this.selectedItems.forEach((marketPriceId, itemName) => {
        const mp = (this.marketPrices || []).find(x => x.id === marketPriceId);
        if (!mp) return;
        const costPerRecipeUnit = mp.purchaseUnitConversion
          ? mp.pricePerUnit * mp.purchaseUnitConversion
          : mp.pricePerUnit;
        itemsToAdd.push({
          itemName:               mp.itemName,
          marketPriceId:          mp.id,
          goodType:               mp.goodType,
          category:               mp.category,
          recipeUnit:             mp.recipeUnit,
          purchaseUnitConversion: mp.purchaseUnitConversion,
          unit:                   mp.unit,
          pricePerUnit:           mp.pricePerUnit,
          costPerRecipeUnit,
          supplier_id:            mp.supplierId || mp.supplier_id,
          image:                  mp.image,
        });
      });
      this.onSelect(itemsToAdd);
      this.selectedItems  = new Map();
      this.expandedItems  = new Set();
      this.onClose();
    },
    formatDate(value) {
      if (!value) return "—";
      try { return new Date(value).toLocaleDateString(); }
      catch { return "—"; }
    },
    supplierName(item) {
      return item.supplierRel?.name || item.supplier?.name || "—";
    },
  },
};
</script>

<template>
  <Teleport to="body">
    <Transition name="mps">
      <div v-if="open" class="mps-overlay" :class="{ 'mps--dark': isDark }" @mousedown.self="onClose">
        <div class="mps-panel">

          <!-- ── Gradient Header ── -->
          <div class="mps-header">
            <div class="mps-header__icon">
              <ShoppingBasket :size="22" color="white" />
            </div>
            <div class="mps-header__titles">
              <p class="mps-header__title">{{ title }}</p>
              <p class="mps-header__subtitle">{{ description }}</p>
            </div>
            <button class="mps-header__close" @click="onClose">
              <X :size="18" />
            </button>
          </div>

          <!-- ── Toolbar : search + category pills ── -->
          <div class="mps-toolbar">
            <div class="mps-search">
              <Search :size="15" class="mps-search__icon" />
              <input
                v-model="searchQuery"
                class="mps-search__input"
                placeholder="Rechercher un ingrédient, une catégorie…"
              />
            </div>
            <div class="mps-pills">
              <button
                class="mps-pill"
                :class="{ 'mps-pill--active': categoryFilter === 'all' }"
                @click="categoryFilter = 'all'"
              >Tous</button>
              <button
                v-for="cat in categories"
                :key="cat"
                class="mps-pill"
                :class="{ 'mps-pill--active': categoryFilter === cat }"
                @click="categoryFilter = cat"
              >{{ cat }}</button>
            </div>
          </div>

          <!-- ── Content ── -->
          <div class="mps-content">

            <!-- Loading -->
            <div v-if="loading" class="mps-empty">
              <v-progress-circular indeterminate color="#ff3131" size="36" width="3" />
              <p class="mps-empty__text">Chargement…</p>
            </div>

            <!-- Empty state -->
            <div v-else-if="filteredItems.length === 0" class="mps-empty">
              <div class="mps-empty__icon"><Leaf :size="28" /></div>
              <p class="mps-empty__text">Aucun ingrédient trouvé</p>
            </div>

            <!-- List -->
            <div v-else class="mps-list">
              <div
                v-for="group in filteredItems"
                :key="group.itemName"
                class="mps-card"
                :class="{ 'mps-card--selected': selectedItems.get(group.itemName) !== undefined }"
              >
                <!-- Item header row -->
                <div class="mps-card__header" @click="toggleExpansion(group.itemName)">

                  <!-- Checkbox indicator -->
                  <div
                    class="mps-checkbox"
                    :class="{ 'mps-checkbox--on': selectedItems.get(group.itemName) !== undefined }"
                  >
                    <Check v-if="selectedItems.get(group.itemName) !== undefined" :size="11" color="white" />
                  </div>

                  <!-- Image -->
                  <div class="mps-card__img">
                    <ImageWithFallback v-if="group.image" :src="group.image" :alt="group.itemName" />
                    <div v-else class="mps-card__img-placeholder">
                      <Leaf :size="16" />
                    </div>
                  </div>

                  <!-- Name + tags -->
                  <div class="mps-card__info">
                    <span class="mps-card__name">{{ group.itemName }}</span>
                    <div class="mps-card__tags">
                      <span class="mps-tag mps-tag--type">{{ group.goodType }}</span>
                      <span v-if="group.category" class="mps-tag">{{ group.category }}</span>
                      <span v-if="group.recipeUnit" class="mps-tag mps-tag--unit">{{ group.recipeUnit }}</span>
                    </div>
                  </div>

                  <!-- Right: supplier count + chevron -->
                  <div class="mps-card__right">
                    <span class="mps-card__supplier-count">
                      {{ group.supplierItems.length }}
                      fournisseur{{ group.supplierItems.length > 1 ? 's' : '' }}
                    </span>
                    <ChevronDown v-if="expandedItems.has(group.itemName)" :size="16" class="mps-chevron" />
                    <ChevronRight v-else :size="16" class="mps-chevron" />
                  </div>
                </div>

                <!-- ── Supplier rows (expanded) ── -->
                <div v-if="expandedItems.has(group.itemName)" class="mps-suppliers">
                  <div
                    v-for="si in group.supplierItems"
                    :key="si.id"
                    class="mps-supplier"
                    :class="{ 'mps-supplier--selected': selectedItems.get(group.itemName) === si.id }"
                    @click.stop="toggleItemSelection(group.itemName, si.id)"
                  >
                    <!-- Radio -->
                    <div class="mps-radio" :class="{ 'mps-radio--on': selectedItems.get(group.itemName) === si.id }">
                      <div class="mps-radio__dot" />
                    </div>

                    <!-- Supplier name + ref -->
                    <div class="mps-supplier__main">
                      <div class="mps-supplier__name">
                        <Truck :size="13" class="mps-supplier__icon" />
                        {{ supplierName(si) }}
                      </div>
                      <div class="mps-supplier__ref">{{ si.supplierItem || '—' }}</div>
                    </div>

                    <!-- Unit price -->
                    <div class="mps-supplier__price">
                      <span class="mps-supplier__price-value">
                        €{{ (si.pricePerUnit || 0).toFixed(2) }}
                      </span>
                      <span class="mps-supplier__price-unit">/ {{ si.unit || '—' }}</span>
                    </div>

                    <!-- Added at -->
                    <div class="mps-supplier__date">
                      <Clock :size="12" class="mps-supplier__icon" />
                      {{ formatDate(si.createdAt) }}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <!-- ── Footer ── -->
          <div class="mps-footer">
            <span class="mps-footer__count">
              <span v-if="selectedItems.size > 0" class="mps-footer__badge">{{ selectedItems.size }}</span>
              <span v-else class="mps-footer__none">Aucune sélection</span>
              <template v-if="selectedItems.size > 0">
                ingrédient{{ selectedItems.size > 1 ? 's' : '' }} sélectionné{{ selectedItems.size > 1 ? 's' : '' }}
              </template>
            </span>
            <div class="mps-footer__actions">
              <button class="mps-btn mps-btn--cancel" @click="onClose">Annuler</button>
              <button
                class="mps-btn mps-btn--primary"
                :disabled="selectedItems.size === 0"
                @click="handleAddSelected"
              >
                <Plus :size="15" class="me-1" />
                Ajouter ({{ selectedItems.size }})
              </button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* ── Overlay ── */
.mps-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

/* ── Panel ── */
.mps-panel {
  width: 100%;
  max-width: 860px;
  max-height: 90vh;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Transition ── */
.mps-enter-active, .mps-leave-active { transition: opacity .22s ease; }
.mps-enter-active .mps-panel, .mps-leave-active .mps-panel { transition: transform .25s cubic-bezier(.4,0,.2,1); }
.mps-enter-from, .mps-leave-to { opacity: 0; }
.mps-enter-from .mps-panel, .mps-leave-to .mps-panel { transform: scale(.95) translateY(10px); }

/* ── Gradient Header ── */
.mps-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 24px;
  background: linear-gradient(135deg, #ff3131 0%, #b91c1c 100%);
  flex-shrink: 0;
}
.mps-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.mps-header__titles { flex: 1; min-width: 0; }
.mps-header__title  { font-size: 15px; font-weight: 700; color: #fff; margin: 0; line-height: 1.2; }
.mps-header__subtitle { font-size: 12px; color: rgba(255,255,255,.72); margin: 3px 0 0; }
.mps-header__close {
  width: 32px; height: 32px; border-radius: 8px;
  border: none; background: rgba(255,255,255,.18); color: rgba(255,255,255,.85);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .18s; flex-shrink: 0; margin-left: auto;
}
.mps-header__close:hover { background: rgba(255,255,255,.3); }

/* ── Toolbar ── */
.mps-toolbar {
  padding: 14px 24px 12px;
  border-bottom: 1px solid #f0f0f0;
  flex-shrink: 0;
  background: #fafafa;
}
.mps-search {
  display: flex; align-items: center; gap: 10px;
  background: #fff; border: 1.5px solid #e5e7eb; border-radius: 12px;
  padding: 9px 14px; margin-bottom: 12px;
  transition: border-color .18s, box-shadow .18s;
}
.mps-search:focus-within {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1);
}
.mps-search__icon { color: #9ca3af; flex-shrink: 0; }
.mps-search__input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 13.5px; color: #111827;
}
.mps-search__input::placeholder { color: #9ca3af; }

.mps-pills {
  display: flex; flex-wrap: wrap; gap: 8px;
}
.mps-pill {
  padding: 5px 13px; border-radius: 100px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-size: 12.5px; font-weight: 500; color: #6b7280;
  cursor: pointer; user-select: none;
  transition: border-color .18s, background .18s, color .18s;
}
.mps-pill:hover { border-color: #ff3131; color: #ff3131; background: #fff5f5; }
.mps-pill--active {
  background: #fef2f2; border-color: #ff3131; color: #ff3131;
  font-weight: 700; box-shadow: 0 0 0 2px rgba(255, 49, 49,.1);
}

/* ── Content ── */
.mps-content {
  flex: 1 1 0; overflow-y: auto; padding: 16px 24px;
  scrollbar-width: thin; scrollbar-color: #e5e7eb transparent;
}
.mps-content::-webkit-scrollbar { width: 5px; }
.mps-content::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 5px; }

/* Empty */
.mps-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; min-height: 200px; color: #9ca3af;
}
.mps-empty__icon {
  width: 60px; height: 60px; border-radius: 50%;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  display: flex; align-items: center; justify-content: center;
  color: #ff3131;
}
.mps-empty__text { font-size: 14px; font-weight: 500; color: #6b7280; margin: 0; }

/* ── Item Card ── */
.mps-list { display: flex; flex-direction: column; gap: 10px; }
.mps-card {
  border-radius: 14px; border: 1.5px solid #e5e7eb;
  overflow: hidden; background: #fff;
  transition: border-color .18s, box-shadow .18s;
}
.mps-card:hover { border-color: #d1d5db; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.mps-card--selected { border-color: #ff3131; box-shadow: 0 0 0 2px rgba(255, 49, 49,.12); }

.mps-card__header {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; cursor: pointer;
}
.mps-card__header:hover { background: #fafafa; }

/* Checkbox */
.mps-checkbox {
  width: 18px; height: 18px; border-radius: 5px;
  border: 2px solid #d1d5db; background: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: border-color .15s, background .15s;
}
.mps-checkbox--on {
  background: #ff3131; border-color: #ff3131;
}

/* Image */
.mps-card__img {
  width: 44px; height: 44px; border-radius: 10px;
  overflow: hidden; flex-shrink: 0;
}
.mps-card__img img { width: 100%; height: 100%; object-fit: cover; }
.mps-card__img-placeholder {
  width: 100%; height: 100%;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  display: flex; align-items: center; justify-content: center;
  color: #ff3131;
}

/* Info */
.mps-card__info { flex: 1; min-width: 0; }
.mps-card__name {
  font-size: 14px; font-weight: 700; color: #111827;
  display: block; margin-bottom: 5px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mps-card__tags { display: flex; flex-wrap: wrap; gap: 5px; }
.mps-tag {
  font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 100px;
  background: #f3f4f6; color: #6b7280;
}
.mps-tag--type  { background: #fef2f2; color: #ff3131; }
.mps-tag--unit  { background: #eff6ff; color: #2563eb; }

/* Right */
.mps-card__right {
  display: flex; align-items: center; gap: 8px;
  flex-shrink: 0; color: #9ca3af;
}
.mps-card__supplier-count { font-size: 12px; white-space: nowrap; }
.mps-chevron { color: #9ca3af; }

/* ── Supplier rows ── */
.mps-suppliers {
  border-top: 1px solid #f3f4f6;
  background: #fafafa;
}
.mps-supplier {
  display: flex; align-items: center; gap: 14px;
  padding: 12px 20px; cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
  transition: background .15s;
}
.mps-supplier:last-child { border-bottom: none; }
.mps-supplier:hover { background: #f9fafb; }
.mps-supplier--selected { background: #fff5f5; }

/* Radio */
.mps-radio {
  width: 16px; height: 16px; border-radius: 50%;
  border: 2px solid #d1d5db; background: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: border-color .15s;
}
.mps-radio--on { border-color: #ff3131; }
.mps-radio__dot {
  width: 7px; height: 7px; border-radius: 50%; background: transparent;
  transition: background .15s;
}
.mps-radio--on .mps-radio__dot { background: #ff3131; }

/* Supplier main */
.mps-supplier__main { flex: 1; min-width: 0; }
.mps-supplier__name {
  display: flex; align-items: center; gap: 5px;
  font-size: 13px; font-weight: 600; color: #374151;
}
.mps-supplier__ref { font-size: 12px; color: #9ca3af; margin-top: 2px; }
.mps-supplier__icon { color: #9ca3af; flex-shrink: 0; }

/* Price */
.mps-supplier__price {
  display: flex; align-items: baseline; gap: 2px; flex-shrink: 0;
}
.mps-supplier__price-value { font-size: 14px; font-weight: 700; color: #111827; }
.mps-supplier__price-unit  { font-size: 12px; color: #9ca3af; }

/* Date */
.mps-supplier__date {
  display: flex; align-items: center; gap: 4px;
  font-size: 11.5px; color: #9ca3af; white-space: nowrap; flex-shrink: 0;
}

/* ── Footer ── */
.mps-footer {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 16px 24px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa; flex-shrink: 0;
}
.mps-footer__count {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: #6b7280;
}
.mps-footer__badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 24px; height: 24px; padding: 0 8px;
  background: #ff3131; color: #fff;
  border-radius: 100px; font-size: 12px; font-weight: 700;
}
.mps-footer__none { font-size: 13px; color: #9ca3af; }
.mps-footer__actions { display: flex; gap: 10px; }

/* Buttons */
.mps-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 9px 20px; border-radius: 100px;
  font-size: 13.5px; font-weight: 600; cursor: pointer;
  transition: all .2s; border: none; line-height: 1.4;
}
.mps-btn:disabled { opacity: .45; cursor: not-allowed; }
.mps-btn--cancel {
  background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280;
}
.mps-btn--cancel:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; }
.mps-btn--primary {
  background: #ff3131;
  color: #fff; box-shadow: 0 4px 14px rgba(255, 49, 49,.3);
}
.mps-btn--primary:hover:not(:disabled) {
  box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px);
}

/* ── Dark mode ── */
.mps--dark .mps-panel { background: #111827; }
.mps--dark .mps-toolbar { background: #1a2332; border-bottom-color: #374151; }
.mps--dark .mps-search { background: #263548; border-color: #374151; }
.mps--dark .mps-search__input { color: #f9fafb; }
.mps--dark .mps-pill { background: #263548; border-color: #374151; color: #9ca3af; }
.mps--dark .mps-pill--active { background: #3d1a1a; border-color: #ff3131; color: #f87171; }
.mps--dark .mps-card { background: #1f2937; border-color: #374151; }
.mps--dark .mps-card__header:hover { background: #263548; }
.mps--dark .mps-card__name { color: #f9fafb; }
.mps--dark .mps-tag { background: #374151; color: #9ca3af; }
.mps--dark .mps-suppliers { background: #1a2332; }
.mps--dark .mps-supplier { border-bottom-color: #374151; }
.mps--dark .mps-supplier:hover { background: #263548; }
.mps--dark .mps-supplier--selected { background: #3d1a1a; }
.mps--dark .mps-supplier__name { color: #e5e7eb; }
.mps--dark .mps-supplier__price-value { color: #f9fafb; }
.mps--dark .mps-footer { background: #1a2332; border-top-color: #374151; }
.mps--dark .mps-btn--cancel { border-color: #374151; color: #9ca3af; }
.mps--dark .mps-btn--cancel:hover:not(:disabled) { background: #263548; }
</style>
