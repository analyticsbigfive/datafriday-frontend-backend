<template>
  <Teleport to="body">
    <Transition name="ppd-slide">
      <div v-if="modelValue" class="ppd-overlay" @mousedown.self="close">
        <div class="ppd-panel" :class="{ 'ppd-panel--dark': isDark }">

          <!-- Header -->
          <div class="ppd-header">
            <div class="ppd-header__icon"><Package :size="20" color="white" /></div>
            <div class="ppd-header__titles">
              <p class="ppd-header__title">{{ t('menuItemCreate.pkgTitle') }}</p>
              <p class="ppd-header__sub">{{ t('menuItemCreate.pkgSubtitle') }}</p>
            </div>
            <button class="ppd-header__close" @click="close"><X :size="16" /></button>
          </div>

          <!-- Error : juste sous le header, hors zone scrollable, toujours visible. -->
          <div v-if="error" class="ppd-error">{{ error }}</div>

          <!-- Toolbar -->
          <div class="ppd-toolbar">
            <div class="ppd-search">
              <Search :size="15" class="ppd-search__icon" />
              <input
                v-model="search"
                class="ppd-search__input"
                :placeholder="t('menuItemCreate.pkgSearchPlaceholder')"
              />
              <button v-if="search" class="ppd-search__clear" @click="search = ''">
                <X :size="13" />
              </button>
            </div>
            <div class="ppd-pills">
              <button
                class="ppd-pill"
                :class="{ 'ppd-pill--active': !category }"
                @click="category = null"
              >Tous</button>
              <button
                v-for="opt in categories"
                :key="opt"
                class="ppd-pill"
                :class="{ 'ppd-pill--active': category === opt }"
                @click="category = opt"
              >{{ opt }}</button>
            </div>
          </div>

          <!-- Body -->
          <div class="ppd-body">
            <div v-if="loading" class="ppd-empty">
              <v-progress-circular indeterminate color="#ff3131" size="32" width="3" />
            </div>

            <div v-else-if="!filteredGroups.length" class="ppd-empty">
              <div class="ppd-empty__icon"><Package :size="24" /></div>
              <p class="ppd-empty__text">{{ t('menuItemCreate.pkgNoData') }}</p>
            </div>

            <div v-else class="ppd-list">
              <div
                v-for="group in filteredGroups"
                :key="group.itemName"
                class="ppd-card"
                :class="{ 'ppd-card--has-selection': groupHasSelection(group) }"
              >
                <!-- Group header -->
                <div class="ppd-card__header" @click="toggleGroup(group.itemName)">
                  <div class="ppd-card__img">
                    <div class="ppd-card__img-placeholder"><Package :size="14" /></div>
                  </div>
                  <div class="ppd-card__info">
                    <span class="ppd-card__name">{{ group.itemName }}</span>
                    <div class="ppd-card__tags">
                      <span class="ppd-tag ppd-tag--type">Packaging</span>
                      <span v-if="group.category" class="ppd-tag">{{ group.category }}</span>
                    </div>
                  </div>
                  <div class="ppd-card__right">
                    <span class="ppd-card__count">
                      {{ group.rows.length }}
                      fournisseur{{ group.rows.length > 1 ? 's' : '' }}
                    </span>
                    <ChevronDown v-if="isExpanded(group.itemName)" :size="16" class="ppd-chevron" />
                    <ChevronRight v-else :size="16" class="ppd-chevron" />
                  </div>
                </div>

                <!-- Supplier rows -->
                <div v-if="isExpanded(group.itemName)" class="ppd-rows">
                  <div class="ppd-rows__header">
                    <div class="ppd-rows__header-check"></div>
                    <div class="ppd-rows__header-col ppd-rows__header-col--main">{{ t('menuItemCreate.colItem') }}</div>
                    <div class="ppd-rows__header-col">{{ t('menuItemCreate.colSupplier') }}</div>
                    <div class="ppd-rows__header-col">{{ t('menuItemCreate.colUnitCost') }}</div>
                    <div class="ppd-rows__header-col">{{ t('menuItemCreate.colUnit') }}</div>
                  </div>

                  <div
                    v-for="row in group.rows"
                    :key="row.id"
                    class="ppd-row"
                    :class="{ 'ppd-row--selected': selectedIds.includes(row.id) }"
                    @click="toggleSelection(row.id, !selectedIds.includes(row.id))"
                  >
                    <div class="ppd-checkbox" :class="{ 'ppd-checkbox--on': selectedIds.includes(row.id) }">
                      <Check v-if="selectedIds.includes(row.id)" :size="11" color="white" />
                    </div>
                    <div class="ppd-row__main">
                      <span class="ppd-row__name">{{ row.itemName }}</span>
                      <span v-if="row.supplierItemName" class="ppd-row__ref">{{ row.supplierItemName }}</span>
                    </div>
                    <div class="ppd-row__supplier">
                      <Truck :size="12" class="ppd-row__icon" />
                      <span>{{ row.supplierName || '—' }}</span>
                    </div>
                    <div class="ppd-row__price">
                      <span class="ppd-row__price-val">{{ formatCurrency(row.costPerRecipeUnit) }}</span>
                    </div>
                    <div class="ppd-row__unit">{{ row.recipeUnit || '—' }}</div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="ppd-footer">
            <span class="ppd-footer__count">
              <span v-if="selectedIds.length" class="ppd-footer__badge">{{ selectedIds.length }}</span>
              <span v-else class="ppd-footer__none">Aucune sélection</span>
              <template v-if="selectedIds.length">
                sélectionné{{ selectedIds.length > 1 ? 's' : '' }}
              </template>
            </span>
            <div class="ppd-footer__actions">
              <button class="ppd-btn ppd-btn--cancel" :disabled="loading" @click="close">
                {{ t('menuItemCreate.cancel') }}
              </button>
              <button
                class="ppd-btn ppd-btn--primary"
                :disabled="!selectedIds.length || loading"
                @click="addSelected"
              >
                <Plus :size="14" class="me-1" />
                {{ t('menuItemCreate.pkgAddBtn') }} ({{ selectedIds.length }})
              </button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { Check, ChevronDown, ChevronRight, Package, Plus, Search, Truck, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { formatCurrencyDetailed } from '@/composables/useFormatters';

export default {
  name: 'PackagingPickerDrawer',
  components: { Check, ChevronDown, ChevronRight, Package, Plus, Search, Truck, X },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'add'],
  setup() {
    const { t } = useI18n();
    return { t, formatCurrency: formatCurrencyDetailed };
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
      document.body.style.overflow = val ? 'hidden' : '';
      if (val) this.loadItems();
    },
  },
  beforeUnmount() {
    document.body.style.overflow = '';
  },
  computed: {
    rows() {
      // Source = table Packaging réelle (via /packaging), pas un filtre texte sur
      // MarketPrice.goodType/category : chaque ligne a un vrai id Packaging distinct
      // du MarketPrice dont elle est issue, nécessaire pour MenuItemPackaging.packagingId.
      const rawList = this.$store.getters['packaging/rows'] || [];
      return rawList
        .map(pkg => {
          const packagingId = String(pkg?.id ?? '').trim();
          const mp = pkg?.marketPrice || {};
          const itemName = String(pkg?.name ?? mp?.itemName ?? '').trim();
          if (!packagingId || !itemName) return null;
          const supplierName = String(pkg?.supplier ?? mp?.supplierRel?.name ?? mp?.supplier ?? '').trim();
          const supplierItemName = String(mp?.supplierItem ?? '').trim();
          const recipeUnit = pkg?.recipeUnit || mp?.recipeUnit || mp?.unit || '';
          const costPerRecipeUnit = Number.isFinite(Number(pkg?.costPerRecipeUnit))
            ? Number(pkg.costPerRecipeUnit)
            : Number(mp?.pricePerUnit) || 0;
          return {
            id: packagingId,
            packagingId,
            itemName,
            // Vraie catégorie référentielle (MarketPriceCategory), pas le texte
            // libre legacy — cf. IngredientPickerDrawer pour le même choix.
            category: String(mp?.marketPriceCategory?.name ?? '').trim() || 'Packaging',
            supplierName,
            supplierItemName,
            supplierId: mp?.supplierRel?.id ?? mp?.supplierId ?? null,
            recipeUnit,
            costPerRecipeUnit,
            marketPriceId: pkg?.marketPriceId ?? mp?.id ?? null,
            createdAt: pkg?.createdAt || null,
            active: pkg?.active,
          };
        })
        .filter(Boolean)
        // BUG-092 : masquer les packagings désactivés (active=false) des dialogs de sélection.
        .filter(r => r.active !== false);
    },
    groups() {
      const map = new Map();
      for (const r of this.rows) {
        const key = r.itemName;
        const existing = map.get(key);
        if (!existing) {
          map.set(key, { itemName: key, category: r.category, rows: [r] });
        } else {
          existing.rows.push(r);
          if (!existing.category && r.category) existing.category = r.category;
        }
      }
      return Array.from(map.values())
        .map(g => ({ ...g, rows: g.rows.sort((a, b) => a.costPerRecipeUnit - b.costPerRecipeUnit) }))
        .sort((a, b) => String(a.itemName).localeCompare(String(b.itemName)));
    },
    categories() {
      return Array.from(new Set(this.groups.map(g => g.category).filter(Boolean)))
        .sort((a, b) => String(a).localeCompare(String(b)));
    },
    filteredGroups() {
      const q = String(this.search || '').toLowerCase();
      const cat = this.category;
      return this.groups.filter(g => {
        const matchesSearch = !q ||
          String(g.itemName || '').toLowerCase().includes(q) ||
          String(g.category || '').toLowerCase().includes(q) ||
          g.rows.some(r => String(r.supplierName || '').toLowerCase().includes(q));
        const matchesCategory = !cat || g.category === cat;
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
        await this.$store.dispatch('packaging/fetchPackaging');
      } catch (e) {
        this.error = e?.userMessage || e?.message || 'Failed to load packaging items';
      } finally {
        this.loading = false;
      }
    },
    toggleGroup(itemName) {
      const next = new Set(this.expandedGroups);
      if (next.has(itemName)) next.delete(itemName);
      else next.add(itemName);
      this.expandedGroups = next;
    },
    isExpanded(itemName) {
      return this.expandedGroups.has(itemName);
    },
    groupHasSelection(group) {
      return group.rows.some(r => this.selectedIds.includes(r.id));
    },
    toggleSelection(id, checked) {
      const next = new Set(this.selectedIds);
      if (checked) next.add(id);
      else next.delete(id);
      this.selectedIds = Array.from(next);
    },
    addSelected() {
      const selectedSet = new Set(this.selectedIds);
      const picked = this.rows.filter(r => selectedSet.has(r.id));
      if (!picked.length) return;
      const toAdd = picked.map(r => ({
        id: `pkg-${Date.now()}-${Math.random()}`,
        name: r.itemName,
        type: 'Packaging',
        category: r.category,
        unit: r.recipeUnit,
        quantity: 1,
        unitCost: Number(r.costPerRecipeUnit || 0),
        totalCost: Number(r.costPerRecipeUnit || 0),
        storage: 'Dry',
        packagingId: r.packagingId,
        marketPriceId: r.marketPriceId,
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        supplierItemName: r.supplierItemName,
      }));
      this.$emit('add', toAdd);
      this.close();
    },
  },
};
</script>

<style scoped>
/* ── Overlay + Panel ── */
.ppd-overlay {
  position: fixed; inset: 0; z-index: 2000;
  display: flex; justify-content: flex-end;
}
.ppd-panel {
  width: 650px; max-width: 100vw; height: 100%;
  display: flex; flex-direction: column;
  background: #fff;
  box-shadow: -4px 0 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

/* ── Transition ── */
.ppd-slide-enter-active, .ppd-slide-leave-active { transition: transform .28s cubic-bezier(.4,0,.2,1); }
.ppd-slide-enter-from, .ppd-slide-leave-to { transform: translateX(100%); }

/* ── Header ── */
.ppd-header {
  flex-shrink: 0;
  display: flex; align-items: center; gap: 12px;
  padding: 18px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49,.2);
}
.ppd-header__icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ppd-header__titles { flex: 1; }
.ppd-header__title  { font-size: 15px; font-weight: 700; color: #fff; margin: 0; line-height: 1.2; }
.ppd-header__sub    { font-size: 12px; color: rgba(255,255,255,.72); margin: 2px 0 0; }
.ppd-header__close  {
  width: 30px; height: 30px; border-radius: 8px;
  border: none; background: rgba(255,255,255,.15); color: #fff;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s;
}
.ppd-header__close:hover { background: rgba(255,255,255,.28); }

/* ── Toolbar ── */
.ppd-toolbar {
  flex-shrink: 0;
  padding: 14px 20px 12px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
}
.ppd-search {
  display: flex; align-items: center; gap: 10px;
  background: #fff; border: 1.5px solid #e5e7eb; border-radius: 12px;
  padding: 9px 13px; margin-bottom: 11px;
  transition: border-color .18s, box-shadow .18s;
}
.ppd-search:focus-within {
  border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49,.1);
}
.ppd-search__icon  { color: #9ca3af; flex-shrink: 0; }
.ppd-search__input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 13.5px; color: #111827;
}
.ppd-search__input::placeholder { color: #9ca3af; }
.ppd-search__clear {
  border: none; background: none; color: #9ca3af; cursor: pointer;
  padding: 0; display: flex; align-items: center;
}
.ppd-search__clear:hover { color: #374151; }

.ppd-pills { display: flex; flex-wrap: wrap; gap: 7px; }
.ppd-pill {
  padding: 4px 12px; border-radius: 100px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-size: 12px; font-weight: 500; color: #6b7280;
  cursor: pointer; user-select: none;
  transition: border-color .15s, background .15s, color .15s;
}
.ppd-pill:hover       { border-color: #ff3131; color: #ff3131; background: #fff5f5; }
.ppd-pill--active     { background: #fef2f2; border-color: #ff3131; color: #ff3131; font-weight: 700; box-shadow: 0 0 0 2px rgba(255, 49, 49,.1); }

/* ── Body ── */
.ppd-body {
  flex: 1 1 0; min-height: 0; overflow-y: auto; padding: 16px 20px;
  scrollbar-width: thin; scrollbar-color: #e5e7eb transparent;
  background: #f9fafb;
}
.ppd-body::-webkit-scrollbar { width: 5px; }
.ppd-body::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 5px; }

/* Empty state */
.ppd-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; min-height: 180px; color: #9ca3af;
}
.ppd-empty__icon {
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  display: flex; align-items: center; justify-content: center; color: #ff3131;
}
.ppd-empty__text { font-size: 13.5px; font-weight: 500; color: #6b7280; margin: 0; }

/* ── Item cards ── */
.ppd-list { display: flex; flex-direction: column; gap: 10px; }
.ppd-card {
  border-radius: 14px; border: 1.5px solid #e5e7eb;
  overflow: hidden; background: #fff;
  transition: border-color .18s, box-shadow .18s;
}
.ppd-card:hover { border-color: #d1d5db; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
.ppd-card--has-selection { border-color: #ff3131; box-shadow: 0 0 0 2px rgba(255, 49, 49,.1); }

.ppd-card__header {
  display: flex; align-items: center; gap: 12px;
  padding: 14px 16px; cursor: pointer;
}
.ppd-card__header:hover { background: #fafafa; }

.ppd-card__img {
  width: 42px; height: 42px; border-radius: 10px;
  overflow: hidden; flex-shrink: 0; background: #f3f4f6;
  display: flex; align-items: center; justify-content: center;
}
.ppd-card__img-placeholder { color: #9ca3af; display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }

.ppd-card__info { flex: 1; min-width: 0; }
.ppd-card__name {
  font-size: 13.5px; font-weight: 700; color: #111827;
  display: block; margin-bottom: 4px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ppd-card__tags { display: flex; flex-wrap: wrap; gap: 4px; }
.ppd-tag {
  font-size: 11px; font-weight: 600; padding: 2px 7px;
  border-radius: 100px; background: #f3f4f6; color: #6b7280;
}
.ppd-tag--type { background: #fef2f2; color: #ff3131; }

.ppd-card__right {
  display: flex; align-items: center; gap: 6px;
  flex-shrink: 0; color: #9ca3af;
}
.ppd-card__count { font-size: 11.5px; white-space: nowrap; }
.ppd-chevron     { color: #9ca3af; }

/* ── Supplier rows ── */
.ppd-rows { border-top: 1px solid #f3f4f6; background: #fafafa; }

.ppd-rows__header {
  display: flex; align-items: center; gap: 12px;
  padding: 7px 16px;
  border-bottom: 1px solid #e5e7eb;
  background: #f3f4f6;
}
.ppd-rows__header-check { width: 17px; flex-shrink: 0; }
.ppd-rows__header-col {
  font-size: 10.5px; font-weight: 700;
  text-transform: uppercase; letter-spacing: .6px;
  color: #9ca3af; white-space: nowrap; flex-shrink: 0;
  min-width: 70px;
}
.ppd-rows__header-col--main { flex: 1; min-width: 0; }

.ppd-row {
  display: flex; align-items: center; gap: 12px;
  padding: 11px 16px;
  border-bottom: 1px solid #f3f4f6;
  cursor: pointer; transition: background .15s;
}
.ppd-row:last-child { border-bottom: none; }
.ppd-row:hover      { background: #f9fafb; }
.ppd-row--selected  { background: #fff5f5; }

.ppd-checkbox {
  width: 17px; height: 17px; border-radius: 5px;
  border: 2px solid #d1d5db; background: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; transition: border-color .15s, background .15s;
}
.ppd-checkbox--on { background: #ff3131; border-color: #ff3131; }

.ppd-row__main { flex: 1; min-width: 0; }
.ppd-row__name {
  font-size: 13px; font-weight: 600; color: #111827;
  display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ppd-row__ref { font-size: 11.5px; color: #9ca3af; margin-top: 1px; }

.ppd-row__supplier {
  display: flex; align-items: center; gap: 4px;
  font-size: 12px; color: #6b7280; white-space: nowrap; flex-shrink: 0;
  min-width: 90px; max-width: 130px; overflow: hidden; text-overflow: ellipsis;
}
.ppd-row__icon { color: #9ca3af; flex-shrink: 0; }

.ppd-row__price { display: flex; align-items: baseline; gap: 2px; flex-shrink: 0; min-width: 70px; }
.ppd-row__price-val { font-size: 13.5px; font-weight: 700; color: #ff3131; }

.ppd-row__unit { font-size: 11.5px; color: #9ca3af; flex-shrink: 0; min-width: 50px; }

/* Barre d'erreur fixe, entre le corps scrollable et le footer. */
.ppd-error {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 9px 16px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  color: #ff3131;
  font-size: 0.8125rem;
  line-height: 1.35;
}

/* ── Footer ── */
.ppd-footer {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0,0,0,.06);
}
.ppd-footer__count {
  display: flex; align-items: center; gap: 8px;
  font-size: 13px; color: #6b7280;
}
.ppd-footer__badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 22px; height: 22px; padding: 0 7px;
  background: #ff3131; color: #fff;
  border-radius: 100px; font-size: 11.5px; font-weight: 700;
}
.ppd-footer__none  { font-size: 13px; color: #9ca3af; }
.ppd-footer__actions { display: flex; gap: 9px; }

.ppd-btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 9px 18px; border-radius: 100px;
  font-size: 13px; font-weight: 600; cursor: pointer;
  transition: all .2s; border: none; line-height: 1.4;
}
.ppd-btn:disabled { opacity: .45; cursor: not-allowed; }
.ppd-btn--cancel {
  background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280;
}
.ppd-btn--cancel:hover:not(:disabled) { border-color: #9ca3af; background: #f3f4f6; }
.ppd-btn--primary {
  background: #ff3131;
  color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.28);
}
.ppd-btn--primary:hover:not(:disabled) {
  box-shadow: 0 6px 18px rgba(255, 49, 49,.38); transform: translateY(-1px);
}

/* ── Dark mode ── */
.ppd-panel--dark { background: #111827; }
.ppd-panel--dark .ppd-toolbar { background: #1f2937; border-bottom-color: rgba(255,255,255,0.08); }
.ppd-panel--dark .ppd-search { background: #1e293b; border-color: rgba(255,255,255,0.1); }
.ppd-panel--dark .ppd-search__input { color: #e2e8f0; }
.ppd-panel--dark .ppd-body { background: #111827; }
.ppd-panel--dark .ppd-card { background: #1f2937; border-color: rgba(255,255,255,0.08); }
.ppd-panel--dark .ppd-card--has-selection { border-color: #ff3131; }
.ppd-panel--dark .ppd-card__header:hover { background: #273548; }
.ppd-panel--dark .ppd-card__name { color: #e2e8f0; }
.ppd-panel--dark .ppd-rows { background: #1a2332; border-top-color: rgba(255,255,255,0.05); }
.ppd-panel--dark .ppd-rows__header { background: #273548; border-bottom-color: rgba(255,255,255,0.08); }
.ppd-panel--dark .ppd-row { background: #1f2937; border-bottom-color: rgba(255,255,255,0.05); }
.ppd-panel--dark .ppd-row:hover { background: #273548; }
.ppd-panel--dark .ppd-row--selected { background: #3b1f1f; }
.ppd-panel--dark .ppd-row__name { color: #e2e8f0; }
.ppd-panel--dark .ppd-checkbox { border-color: #475569; background: #1e293b; }
.ppd-panel--dark .ppd-footer { background: #1f2937; border-top-color: rgba(255,255,255,0.08); }
/* Pills de filtre + tags de catégorie */
.ppd-panel--dark .ppd-pill { background: #1a2332; border-color: rgba(255,255,255,.12); color: #94a3b8; }
.ppd-panel--dark .ppd-pill:hover { border-color: #ff3131; color: #fca5a5; }
.ppd-panel--dark .ppd-tag { background: rgba(255,255,255,.08); color: #cbd5e1; }
.ppd-panel--dark .ppd-tag--type { background: rgba(255,49,49,.15); color: #fca5a5; }
</style>
