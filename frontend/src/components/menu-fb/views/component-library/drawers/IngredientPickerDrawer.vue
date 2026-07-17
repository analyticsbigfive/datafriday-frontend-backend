<template>
  <Teleport to="body">
    <Transition name="ipd-slide">
      <div v-if="modelValue" class="ipd-overlay" @mousedown.self="close">
        <div class="ipd-panel">

          <!-- ── Gradient Header ── -->
          <div class="ipd-header">
            <div class="ipd-header__icon"><Wheat :size="20" color="white" /></div>
            <div class="ipd-header__titles">
              <p class="ipd-header__title">{{ t('compCreateIngrDrawerTitle') }}</p>
              <p class="ipd-header__sub">{{ t('compCreateIngrDrawerSubtitle') }}</p>
            </div>
            <button class="ipd-header__close" @click="close"><X :size="16" /></button>
          </div>

          <!-- ── Toolbar ── -->
          <div class="ipd-toolbar">
            <!-- Search -->
            <div class="ipd-search">
              <Search :size="15" class="ipd-search__icon" />
              <input
                v-model="search"
                class="ipd-search__input"
                :placeholder="t('compCreateIngrSearchPlaceholder')"
              />
              <button v-if="search" class="ipd-search__clear" @click="search = ''">
                <X :size="13" />
              </button>
            </div>

            <!-- Category pills -->
            <div class="ipd-pills">
              <button
                class="ipd-pill"
                :class="{ 'ipd-pill--active': !category }"
                @click="category = null"
              >Tous</button>
              <button
                v-for="opt in categories"
                :key="opt"
                class="ipd-pill"
                :class="{ 'ipd-pill--active': category === opt }"
                @click="category = opt"
              >{{ opt }}</button>
            </div>
          </div>

          <!-- ── Body ── -->
          <div class="ipd-body">

            <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-3">
              {{ error }}
            </v-alert>

            <!-- Loading -->
            <div v-if="loading" class="ipd-empty">
              <v-progress-circular indeterminate color="#ff3131" size="32" width="3" />
            </div>

            <!-- Empty -->
            <div v-else-if="!filteredGroups.length" class="ipd-empty">
              <div class="ipd-empty__icon"><Wheat :size="24" /></div>
              <p class="ipd-empty__text">Aucun ingrédient trouvé</p>
            </div>

            <!-- Groups -->
            <div v-else class="ipd-list">
              <div
                v-for="group in filteredGroups"
                :key="group.itemName"
                class="ipd-card"
                :class="{ 'ipd-card--has-selection': groupHasSelection(group) }"
              >
                <!-- Group header -->
                <div class="ipd-card__header" @click="toggleGroup(group.itemName)">
                  <div class="ipd-card__img">
                    <img v-if="group.image" :src="group.image" :alt="group.itemName" />
                    <div v-else class="ipd-card__img-placeholder"><Wheat :size="14" /></div>
                  </div>
                  <div class="ipd-card__info">
                    <span class="ipd-card__name">{{ group.itemName }}</span>
                    <div class="ipd-card__tags">
                      <span v-if="group.type"     class="ipd-tag ipd-tag--type">{{ group.type }}</span>
                      <span v-if="group.category" class="ipd-tag">{{ group.category }}</span>
                    </div>
                  </div>
                  <div class="ipd-card__right">
                    <span class="ipd-card__count">
                      {{ group.rows.length }}
                      fournisseur{{ group.rows.length > 1 ? 's' : '' }}
                    </span>
                    <ChevronDown v-if="isExpanded(group.itemName)" :size="16" class="ipd-chevron" />
                    <ChevronRight v-else :size="16" class="ipd-chevron" />
                  </div>
                </div>

                <!-- Supplier rows (expanded) -->
                <div v-if="isExpanded(group.itemName)" class="ipd-rows">
                  <!-- Column headers -->
                  <div class="ipd-rows__header">
                    <div class="ipd-rows__header-check"></div>
                    <div class="ipd-rows__header-col ipd-rows__header-col--main">Item name</div>
                    <div class="ipd-rows__header-col">Supplier</div>
                    <div class="ipd-rows__header-col">Unit cost</div>
                    <div class="ipd-rows__header-col">Added at</div>
                  </div>
                  <div
                    v-for="row in group.rows"
                    :key="row.id"
                    class="ipd-row"
                    :class="{ 'ipd-row--selected': selectedIds.includes(row.id) }"
                    @click="toggleSelection(row.id, !selectedIds.includes(row.id))"
                  >
                    <!-- Checkbox -->
                    <div
                      class="ipd-checkbox"
                      :class="{ 'ipd-checkbox--on': selectedIds.includes(row.id) }"
                    >
                      <Check v-if="selectedIds.includes(row.id)" :size="11" color="white" />
                    </div>

                    <!-- Ingredient + supplier item ref -->
                    <div class="ipd-row__main">
                      <span class="ipd-row__name">
                        {{ row.ingredientName || row.itemName || group.itemName }}
                      </span>
                      <span v-if="row.supplierItemName" class="ipd-row__ref">
                        {{ row.supplierItemName }}
                      </span>
                    </div>

                    <!-- Supplier -->
                    <div class="ipd-row__supplier">
                      <Truck :size="12" class="ipd-row__icon" />
                      <span>{{ row.supplierName || '—' }}</span>
                    </div>

                    <!-- Unit price -->
                    <div class="ipd-row__price">
                      <span class="ipd-row__price-val">{{ formatCurrency(row.pricePerUnit) }}</span>
                      <span class="ipd-row__price-unit">/ {{ row.recipeUnit || '—' }}</span>
                    </div>

                    <!-- Added at -->
                    <div class="ipd-row__date">
                      <Clock :size="11" class="ipd-row__icon" />
                      {{ formatDate(row.createdAt) }}
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <!-- ── Footer ── -->
          <div class="ipd-footer">
            <span class="ipd-footer__count">
              <span v-if="selectedIds.length" class="ipd-footer__badge">{{ selectedIds.length }}</span>
              <span v-else class="ipd-footer__none">Aucune sélection</span>
              <template v-if="selectedIds.length">
                sélectionné{{ selectedIds.length > 1 ? 's' : '' }}
              </template>
            </span>
            <div class="ipd-footer__actions">
              <button class="ipd-btn ipd-btn--cancel" @click="close">{{ t('compCreateCancel') }}</button>
              <button
                class="ipd-btn ipd-btn--primary"
                :disabled="!selectedIds.length"
                @click="addSelected"
              >
                <Plus :size="14" class="me-1" />
                {{ t('compCreateAddSelected') }} ({{ selectedIds.length }})
              </button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { Check, ChevronDown, ChevronRight, Clock, Plus, Search, Truck, Wheat, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'IngredientPickerDrawer',
  components: { Check, ChevronDown, ChevronRight, Clock, Plus, Search, Truck, Wheat, X },
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'add'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      loading: false,
      error: '',
      search: '',
      category: null,
      selectedIds: [],
      expandedGroups: new Set(),
    };
  },
  watch: {
    modelValue(val) {
      if (val) this.loadItems();
    },
  },
  computed: {
    rows() {
      const rawList = this.$store.getters['marketPriceIngredients/rows'];
      const rows = [];
      for (const mp of rawList || []) {
        const marketPriceId = String(mp?.id ?? mp?._id ?? '').trim();
        const itemName = String(mp?.itemName ?? mp?.name ?? '').trim();
        if (!marketPriceId || !itemName) continue;
        const ingredients = mp?.ingredients || mp?.ingredientList || mp?.items || mp?.data?.ingredients || [];
        if (Array.isArray(ingredients) && ingredients.length) {
          for (const ing of ingredients) {
            const row = this.normalizeRow(mp, ing);
            if (!row.itemName || !row.marketPriceId) continue;
            rows.push(row);
          }
        } else {
          const row = this.normalizeRow(mp, mp);
          if (row.itemName && row.marketPriceId) rows.push(row);
        }
      }
      return rows;
    },
    groups() {
      const map = new Map();
      for (const r of this.rows || []) {
        const itemName = String(r?.itemName || '').trim();
        if (!itemName) continue;
        const existing = map.get(itemName);
        if (!existing) {
          map.set(itemName, { itemName, type: r.goodType || '', category: r.category || '', image: r.image || '', rows: [r] });
        } else {
          existing.rows.push(r);
          if (!existing.image && r.image) existing.image = r.image;
          if (!existing.type && r.goodType) existing.type = r.goodType;
          if (!existing.category && r.category) existing.category = r.category;
        }
      }
      return Array.from(map.values())
        .map(g => ({ ...g, rows: g.rows.sort((a, b) => Number(a.costPerRecipeUnit || 0) - Number(b.costPerRecipeUnit || 0)) }))
        .sort((a, b) => String(a.itemName).localeCompare(String(b.itemName)));
    },
    categories() {
      return Array.from(new Set((this.groups || []).map(g => g.category).filter(Boolean)))
        .sort((a, b) => String(a).localeCompare(String(b)));
    },
    filteredGroups() {
      const q = String(this.search || '').toLowerCase();
      const cat = this.category;
      return (this.groups || []).filter(g => {
        const matchesSearch = !q ||
          String(g?.itemName || '').toLowerCase().includes(q) ||
          String(g?.category || '').toLowerCase().includes(q) ||
          String(g?.type || '').toLowerCase().includes(q);
        const matchesCategory = !cat || String(g?.category || '') === cat;
        return matchesSearch && matchesCategory;
      });
    },
  },
  methods: {
    close() {
      this.search = '';
      this.category = null;
      this.selectedIds = [];
      this.expandedGroups = new Set();
      this.error = '';
      this.$emit('update:modelValue', false);
    },
    async loadItems() {
      this.loading = true;
      this.error = '';
      try {
        await this.$store.dispatch('marketPriceIngredients/fetchRows');
      } catch (e) {
        this.error = e?.userMessage || e?.message || 'Failed to load market prices';
      } finally {
        this.loading = false;
      }
    },
    toggleGroup(itemName) {
      const next = new Set(this.expandedGroups || []);
      if (next.has(itemName)) next.delete(itemName);
      else next.add(itemName);
      this.expandedGroups = next;
    },
    isExpanded(itemName) {
      return (this.expandedGroups || new Set()).has(itemName);
    },
    groupHasSelection(group) {
      return (group.rows || []).some(r => this.selectedIds.includes(r.id));
    },
    toggleSelection(id, checked) {
      const next = new Set(this.selectedIds || []);
      if (checked) next.add(id);
      else next.delete(id);
      this.selectedIds = Array.from(next);
    },
    addSelected() {
      const selectedSet = new Set(this.selectedIds);
      const picked = (this.rows || []).filter(r => selectedSet.has(r.id));
      if (!picked.length) return;
      const toAdd = picked.map(r => ({
        ingredientId:     String(r.ingredientId || '').trim(),
        itemName:         r.ingredientName || r.itemName,
        marketPriceId:    r.marketPriceId,
        goodType:         r.goodType,
        category:         r.category,
        recipeUnit:       r.recipeUnit,
        unit:             r.recipeUnit,
        quantity:         1,
        unitCost:         Number(r.costPerRecipeUnit || 0),
        cost:             Number(r.costPerRecipeUnit || 0),
        storageType:      this.getStorageTypeForCategory(r.category),
        supplier_id:      r.supplier_id,
        supplierName:     r.supplierName,
        supplierItemName: r.supplierItemName,
        image:            r.image,
        addedAt:          new Date().toISOString(),
      }));
      this.$emit('add', toAdd);
      this.close();
    },
    normalizeRow(marketPrice, ingredient) {
      const marketPriceId = String(marketPrice?.id ?? marketPrice?._id ?? '').trim();
      const ingredientId = String(
        ingredient?.id ?? ingredient?._id ?? ingredient?.ingredientId ?? ingredient?.ingredient_id ??
        ingredient?.ingredient?.id ?? ingredient?.ingredient?._id ?? ''
      ).trim();
      const ingredientName = String(ingredient?.name ?? ingredient?.itemName ?? ingredient?.ingredientName ?? ingredient?.label ?? '').trim();
      const itemName = ingredientName || String(marketPrice?.itemName ?? marketPrice?.name ?? '').trim();
      const goodType = String(marketPrice?.goodType ?? marketPrice?.type ?? ingredient?.goodType ?? '').trim();
      const category = String(ingredient?.ingredientCategory ?? marketPrice?.category ?? '').trim();
      const image = marketPrice?.image || '';
      const supplierName = String(
        marketPrice?.supplierRel?.name ?? marketPrice?.supplierName ?? marketPrice?.supplier ?? marketPrice?.supplier_name ?? ''
      ).trim();
      const supplierItemName = String(marketPrice?.supplierItem ?? marketPrice?.supplierItemName ?? marketPrice?.supplier_item ?? '').trim();
      const recipeUnit = ingredient?.recipeUnit || marketPrice?.recipeUnit || marketPrice?.unit || '';
      const ingredientCost = parseFloat(ingredient?.costPerRecipeUnit ?? ingredient?.cost_per_recipe_unit ?? NaN);
      const purchaseUnitConversion = Number(marketPrice?.purchaseUnitConversion);
      const pricePerUnit = Number(marketPrice?.pricePerUnit);
      const costPerRecipeUnit = Number.isFinite(ingredientCost)
        ? ingredientCost
        : Number.isFinite(pricePerUnit)
          ? Number.isFinite(purchaseUnitConversion) && purchaseUnitConversion > 0
            ? pricePerUnit * purchaseUnitConversion
            : pricePerUnit
          : 0;
      return {
        id:                     `${marketPriceId}::${ingredientId || ingredientName}`,
        ingredientId,
        ingredientName,
        itemName,
        marketPriceId,
        goodType,
        category,
        image,
        supplierName,
        supplierItemName,
        recipeUnit,
        pricePerUnit:            Number.isFinite(pricePerUnit) ? pricePerUnit : 0,
        purchaseUnitConversion:  Number.isFinite(purchaseUnitConversion) ? purchaseUnitConversion : null,
        costPerRecipeUnit,
        supplier_id:             marketPrice?.supplierRel?.id ?? marketPrice?.supplier_id ?? marketPrice?.supplierId ?? null,
        createdAt:               marketPrice?.createdAt || null,
      };
    },
    getStorageTypeForCategory(cat) {
      const c = String(cat || '').toLowerCase();
      if (c.includes('frozen') || c.includes('congel')) return 'Frozen';
      if (c.includes('cold') || c.includes('froid') || c.includes('réfrig') || c.includes('refrig')) return 'Cold';
      return 'Dry';
    },
    formatCurrency(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return '—';
      return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    },
    formatDate(value) {
      if (!value) return '—';
      try { return new Date(value).toLocaleDateString(); }
      catch { return '—'; }
    },
  },
};
</script>

<style scoped>
/* ── Overlay + Panel ── */
.ipd-overlay {
  position: fixed; inset: 0; z-index: 9999;
  display: flex; justify-content: flex-end;
}
.ipd-panel {
  width: 620px; max-width: 100vw; height: 100%;
  display: flex; flex-direction: column;
  background: #fff;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

/* ── Transition ── */
.ipd-slide-enter-active, .ipd-slide-leave-active { transition: transform .28s cubic-bezier(.4,0,.2,1); }
.ipd-slide-enter-from, .ipd-slide-leave-to { transform: translateX(100%); }

/* ── Header ── */
.ipd-header {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 18px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49,.2);
}
.ipd-header__icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ipd-header__titles { flex: 1; }
.ipd-header__title  { font-size: 1rem; font-weight: 700; color: #fff; margin: 0; line-height: 1.2; }
.ipd-header__sub    { font-size: 0.75rem; color: rgba(255,255,255,.72); margin: 2px 0 0; }
.ipd-header__close  {
  width: 30px; height: 30px; border-radius: 8px;
  border: none; background: rgba(255,255,255,.15); color: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s;
}
.ipd-header__close:hover { background: rgba(255,255,255,.28); }

/* ── Toolbar ── */
.ipd-toolbar {
  flex-shrink: 0;
  padding: 14px 20px 12px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
}
.ipd-search {
  display: flex; align-items: center; gap: 10px;
  background: #fff; border: 1.5px solid #e5e7eb; border-radius: 12px;
  padding: 9px 13px; margin-bottom: 11px;
  transition: border-color .18s, box-shadow .18s;
}
.ipd-search:focus-within {
  border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.1);
}
.ipd-search__icon  { color: #9ca3af; flex-shrink: 0; }
.ipd-search__input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 0.875rem; color: #111827;
}
.ipd-search__input::placeholder { color: #9ca3af; }
.ipd-search__clear {
  border: none; background: none; color: #9ca3af; cursor: pointer;
  padding: 0; display: flex; align-items: center;
}
.ipd-search__clear:hover { color: #374151; }

.ipd-pills { display: flex; flex-wrap: wrap; gap: 7px; }
.ipd-pill {
  padding: 4px 12px; border-radius: 100px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-size: 0.75rem; font-weight: 500; color: #6b7280;
  cursor: pointer; user-select: none;
  transition: border-color .15s, background .15s, color .15s;
}
.ipd-pill:hover       { border-color: #ff3131; color: #ff3131; background: #fff5f5; }
.ipd-pill--active     { background: #fef2f2; border-color: #ff3131; color: #ff3131; font-weight: 700; box-shadow: 0 0 0 2px rgba(255, 49, 49,.1); }

/* ── Body ── */
.ipd-body {
  flex: 1 1 0; overflow-y: auto; padding: 16px 20px;
  scrollbar-width: thin; scrollbar-color: #e5e7eb transparent;
}
.ipd-body::-webkit-scrollbar { width: 5px; }
.ipd-body::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 5px; }

/* Empty state */
.ipd-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; min-height: 180px; color: #9ca3af;
}
.ipd-empty__icon {
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  display: flex; align-items: center; justify-content: center; color: #ff3131;
}
.ipd-empty__text { font-size: 0.8125rem; font-weight: 500; color: #6b7280; margin: 0; }

/* ── Item cards ── */
.ipd-list { display: flex; flex-direction: column; gap: 10px; }
.ipd-card {
  border-radius: 14px; border: 1.5px solid #e5e7eb;
  overflow: hidden; background: #fff;
  transition: border-color .18s, box-shadow .18s;
}
.ipd-card:hover { border-color: #d1d5db; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.ipd-card--has-selection { border-color: #ff3131; box-shadow: 0 0 0 2px rgba(255, 49, 49,.1); }

.ipd-card__header {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; cursor: pointer;
}
.ipd-card__header:hover { background: #fafafa; }

.ipd-card__img {
  width: 42px; height: 42px; border-radius: 10px;
  overflow: hidden; flex-shrink: 0; background: #f3f4f6;
  display: flex; align-items: center; justify-content: center;
}
.ipd-card__img img { width: 100%; height: 100%; object-fit: cover; }
.ipd-card__img-placeholder { color: #9ca3af; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }

.ipd-card__info { flex: 1; min-width: 0; }
.ipd-card__name {
  font-size: 0.8125rem; font-weight: 700; color: #111827;
  display: block; margin-bottom: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ipd-card__tags { display: flex; flex-wrap: wrap; gap: 4px; }
.ipd-tag {
  font-size: 0.75rem; font-weight: 600; padding: 2px 7px;
  border-radius: 100px; background: #f3f4f6; color: #6b7280;
}
.ipd-tag--type { background: #fef2f2; color: #ff3131; }

.ipd-card__right {
  display: flex; align-items: center; gap: 6px;
  flex-shrink: 0; color: #9ca3af;
}
.ipd-card__count { font-size: 0.75rem; white-space: nowrap; }
.ipd-chevron     { color: #9ca3af; }

/* ── Supplier rows ── */
.ipd-rows { border-top: 1px solid #f3f4f6; background: #fafafa; }

.ipd-rows__header {
  display: flex; align-items: center; gap: 12px;
  padding: 7px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #f3f4f6;
}
.ipd-rows__header-check {
  width: 17px; flex-shrink: 0;
}
.ipd-rows__header-col {
  font-size: 0.75rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: .6px;
  color: #9ca3af; white-space: nowrap; flex-shrink: 0;
}
.ipd-rows__header-col--main { flex: 1; min-width: 0; }

.ipd-row {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 16px;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer; transition: background .15s;
}
.ipd-row:last-child { border-bottom: none; }
.ipd-row:hover      { background: #f9fafb; }
.ipd-row--selected  { background: #fff5f5; }

/* Checkbox */
.ipd-checkbox {
  width: 17px; height: 17px; border-radius: 5px;
  border: 2px solid #d1d5db; background: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: border-color .15s, background .15s;
}
.ipd-checkbox--on { background: #ff3131; border-color: #ff3131; }

/* Row content */
.ipd-row__main { flex: 1; min-width: 0; }
.ipd-row__name {
  font-size: 0.8125rem; font-weight: 600; color: #111827;
  display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ipd-row__ref { font-size: 0.75rem; color: #9ca3af; margin-top: 1px; }

.ipd-row__supplier {
  display: flex; align-items: center; gap: 4px;
  font-size: 0.75rem; color: #6b7280; white-space: nowrap; flex-shrink: 0;
  min-width: 90px; max-width: 120px; overflow: hidden; text-overflow: ellipsis;
}
.ipd-row__icon { color: #9ca3af; flex-shrink: 0; }

.ipd-row__price { display: flex; align-items: baseline; gap: 2px; flex-shrink: 0; }
.ipd-row__price-val  { font-size: 0.8125rem; font-weight: 700; color: #111827; }
.ipd-row__price-unit { font-size: 0.75rem; color: #9ca3af; }

.ipd-row__date {
  display: flex; align-items: center; gap: 4px;
  font-size: 0.75rem; color: #9ca3af; white-space: nowrap; flex-shrink: 0;
}

/* ── Footer ── */
.ipd-footer {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0,0,0,.06);
}
.ipd-footer__count {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.8125rem; color: #6b7280;
}
.ipd-footer__badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px; padding: 0 7px;
  background: #ff3131; color: #fff;
  border-radius: 100px; font-size: 0.75rem; font-weight: 700;
}
.ipd-footer__none  { font-size: 0.8125rem; color: #9ca3af; }
.ipd-footer__actions { display: flex; gap: 9px; }

/* Buttons */
.ipd-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 9px 18px; border-radius: 100px;
  font-size: 0.875rem; font-weight: 600; cursor: pointer;
  transition: all .2s; border: none; line-height: 1.4;
}
.ipd-btn:disabled { opacity: .45; cursor: not-allowed; }
.ipd-btn--cancel {
  background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280;
}
.ipd-btn--cancel:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; }
.ipd-btn--primary {
  background: #ff3131;
  color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.28);
}
.ipd-btn--primary:hover:not(:disabled) {
  box-shadow: 0 6px 18px rgba(255, 49, 49,.38); transform: translateY(-1px);
}
</style>
