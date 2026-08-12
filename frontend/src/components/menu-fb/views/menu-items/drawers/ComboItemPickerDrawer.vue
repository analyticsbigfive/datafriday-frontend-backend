<template>
  <Teleport to="body">
    <Transition name="cbd-slide">
      <div v-if="modelValue" class="cbd-overlay" @mousedown.self="close">
        <div class="cbd-panel" :class="{ 'cbd-panel--dark': isDark }">

          <!-- ── Gradient Header ── -->
          <div class="cbd-header">
            <div class="cbd-header__icon"><Layers :size="20" color="white" /></div>
            <div class="cbd-header__titles">
              <p class="cbd-header__title">{{ t('menuItemCreate.comboTitle') }}</p>
              <p class="cbd-header__sub">{{ t('menuItemCreate.comboSubtitle') }}</p>
            </div>
            <button class="cbd-header__close" @click="close"><X :size="16" /></button>
          </div>

          <!-- Error : juste sous le header, hors zone scrollable, toujours visible. -->
          <div v-if="error" class="cbd-error">{{ error }}</div>

          <!-- ── Toolbar ── -->
          <div class="cbd-toolbar">
            <div class="cbd-search">
              <Search :size="15" class="cbd-search__icon" />
              <input
                v-model="search"
                class="cbd-search__input"
                :placeholder="t('menuItemCreate.comboSearchPlaceholder')"
              />
              <button v-if="search" class="cbd-search__clear" @click="search = ''">
                <X :size="13" />
              </button>
            </div>

            <div class="cbd-pills">
              <button
                class="cbd-pill"
                :class="{ 'cbd-pill--active': !category }"
                @click="category = null"
              >{{ t('menuItemCreate.comboPillAll') }}</button>
              <button
                v-for="opt in categoryOptions"
                :key="opt"
                class="cbd-pill"
                :class="{ 'cbd-pill--active': category === opt }"
                @click="category = opt"
              >{{ opt }}</button>
            </div>
          </div>

          <!-- ── Body ── -->
          <div class="cbd-body">

            <div v-if="loading" class="cbd-empty">
              <v-progress-circular indeterminate color="#ff3131" size="32" width="3" />
            </div>

            <div v-else-if="!filteredItems.length" class="cbd-empty">
              <div class="cbd-empty__icon"><Layers :size="24" /></div>
              <p class="cbd-empty__text">{{ t('menuItemCreate.comboNoData') }}</p>
            </div>

            <div v-else class="cbd-list">
              <div
                v-for="item in filteredItems"
                :key="item.id"
                class="cbd-row"
                :class="{ 'cbd-row--selected': selectedIds.includes(item.id) }"
                @click="toggleSelection(item.id)"
              >
                <div
                  class="cbd-checkbox"
                  :class="{ 'cbd-checkbox--on': selectedIds.includes(item.id) }"
                >
                  <Check v-if="selectedIds.includes(item.id)" :size="11" color="white" />
                </div>

                <div class="cbd-row__main">
                  <span class="cbd-row__name">{{ item.name }}</span>
                  <div class="cbd-row__tags">
                    <span v-if="item.type" class="cbd-tag cbd-tag--type">{{ item.type }}</span>
                    <span v-if="item.category" class="cbd-tag">{{ item.category }}</span>
                  </div>
                </div>

                <div class="cbd-row__price">
                  <span class="cbd-row__price-val">{{ formatCurrency(item.unitCost) }}</span>
                  <span class="cbd-row__price-unit">{{ t('menuItemCreate.colUnitCost') }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Footer ── -->
          <div class="cbd-footer">
            <span class="cbd-footer__count">
              <span v-if="selectedIds.length" class="cbd-footer__badge">{{ selectedIds.length }}</span>
              <span v-else class="cbd-footer__none">Aucune sélection</span>
              <template v-if="selectedIds.length">
                sélectionné{{ selectedIds.length > 1 ? 's' : '' }}
              </template>
            </span>
            <div class="cbd-footer__actions">
              <button class="cbd-btn cbd-btn--cancel" :disabled="loading" @click="close">
                {{ t('menuItemCreate.cancel') }}
              </button>
              <button
                class="cbd-btn cbd-btn--primary"
                :disabled="!selectedIds.length || loading"
                @click="addSelected"
              >
                <Plus :size="14" class="me-1" />
                {{ t('menuItemCreate.comboAddBtn') }} ({{ selectedIds.length }})
              </button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { Layers, Check, Plus, Search, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { formatCurrencyDetailed } from '@/composables/useFormatters';

export default {
  name: 'ComboItemPickerDrawer',
  components: { Layers, Check, Plus, Search, X },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
    // Menu item courant (mode édition) à exclure de la liste — un combo ne peut pas se référencer.
    excludeId: { type: String, default: null },
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
    items() {
      const excluded = String(this.excludeId || '');
      // Seuls les menu items marqués « combo » (comboItem = Yes) sont éligibles comme combo.
      return (this.$store.getters['menuItems/rows'] || [])
        .map(m => this.normalizeRow(m))
        .filter(m => m.id && m.name && m.id !== excluded && this.isCombo(m.comboItem))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    },
    categoryOptions() {
      return Array.from(new Set((this.items || []).map(m => m.category).filter(Boolean)))
        .sort((a, b) => String(a).localeCompare(String(b)));
    },
    filteredItems() {
      const q = String(this.search || '').toLowerCase();
      const cat = this.category;
      return (this.items || []).filter(m => {
        const matchesSearch = !q
          || String(m.name).toLowerCase().includes(q)
          || String(m.category).toLowerCase().includes(q)
          || String(m.type).toLowerCase().includes(q);
        const matchesCategory = !cat || m.category === cat;
        return matchesSearch && matchesCategory;
      });
    },
  },
  methods: {
    close() {
      this.search = '';
      this.category = null;
      this.selectedIds = [];
      this.error = '';
      this.$emit('update:modelValue', false);
    },
    toggleSelection(id) {
      const idx = this.selectedIds.indexOf(id);
      if (idx === -1) this.selectedIds.push(id);
      else this.selectedIds.splice(idx, 1);
    },
    // comboItem est une chaîne « Yes »/« No » côté API (backend normYesNo) — tolère aussi bool/1.
    isCombo(v) {
      if (v === true || v === 1) return true;
      return String(v ?? '').trim().toLowerCase() === 'yes';
    },
    async loadItems() {
      this.loading = true;
      this.error = '';
      try {
        // forceRefresh : sinon un item tout juste passé en « combo » (cache store 15 min) ne
        // remonterait pas dans la liste.
        await this.$store.dispatch('menuItems/fetchMenuItems', { forceRefresh: true });
      } catch (e) {
        this.error = e?.userMessage || e?.message || 'Failed to load menu items';
      } finally {
        this.loading = false;
      }
    },
    addSelected() {
      const selectedSet = new Set(this.selectedIds);
      const picked = (this.items || []).filter(m => selectedSet.has(m.id));
      if (!picked.length) return;
      const toAdd = picked.map(m => ({
        id: `combo-${Date.now()}-${Math.random()}`,
        name: m.name,
        type: 'ComboItem',
        category: m.category,
        unit: 'Pc',
        quantity: 1,
        unitCost: Number(m.unitCost || 0),
        totalCost: Number(m.unitCost || 0),
        storage: 'Dry',
        comboItemId: m.id,
      }));
      this.$emit('add', toAdd);
      this.close();
    },
    // Coût par pièce du menu item (contribution au coût de la recette parente) : fourni par le
    // backend (costPerPiece) sinon dérivé (totalCost / nombre de pièces).
    normalizeRow(m) {
      const raw = m || {};
      const pieces = Math.max(Number(raw?.numberOfPiecesRecipe) || 1, 1);
      const unitCost = raw?.costPerPiece != null
        ? Number(raw.costPerPiece)
        : (Number(raw?.totalCost || 0) / pieces);
      return {
        id: String(raw?.id ?? raw?._id ?? ''),
        name: String(raw?.name ?? raw?.title ?? '').trim(),
        category: String(raw?.category ?? raw?.categoryName ?? '').trim(),
        type: String(raw?.type ?? raw?.typeName ?? '').trim(),
        unitCost: Number.isFinite(unitCost) ? unitCost : 0,
        basePrice: Number(raw?.basePrice ?? 0) || 0,
        comboItem: raw?.comboItem,
      };
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.cbd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 2000;
  display: flex;
  justify-content: flex-end;
}

/* ── Panel ── */
.cbd-panel {
  width: 680px;
  max-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
}

/* ── Header ── */
.cbd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, 0.2);
}
.cbd-header__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cbd-header__titles { flex: 1; }
.cbd-header__title { font-size: 15px; font-weight: 700; color: #fff; margin: 0; }
.cbd-header__sub { font-size: 12px; color: rgba(255, 255, 255, 0.72); margin: 2px 0 0; }
.cbd-header__close {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: background 0.15s;
}
.cbd-header__close:hover { background: rgba(255, 255, 255, 0.25); }

/* ── Toolbar ── */
.cbd-toolbar {
  flex-shrink: 0;
  padding: 12px 16px 0;
  background: #fff;
  border-bottom: 1px solid #f3f4f6;
}

.cbd-search {
  position: relative;
  display: flex;
  align-items: center;
  background: #f9fafb;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 0 10px;
  height: 38px;
  gap: 8px;
}
.cbd-search__icon { color: #9ca3af; flex-shrink: 0; }
.cbd-search__input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13.5px;
  color: #111827;
  outline: none;
}
.cbd-search__input::placeholder { color: #9ca3af; }
.cbd-search__clear {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
  align-items: center;
  padding: 0;
}
.cbd-search__clear:hover { color: #374151; }

.cbd-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 0 12px;
}
.cbd-pill {
  padding: 3px 12px;
  border-radius: 50px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  font-size: 12px;
  font-weight: 500;
  color: #6b7280;
  cursor: pointer;
  transition: all 0.15s;
}
.cbd-pill:hover { border-color: #ff3131; color: #ff3131; }
.cbd-pill--active {
  background: #ff3131;
  border-color: #ff3131;
  color: #fff;
  font-weight: 600;
}

/* ── Body ── */
.cbd-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 16px;
  background: #f9fafb;
}

.cbd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 12px;
}
.cbd-empty__icon { color: #d1d5db; }
.cbd-empty__text { font-size: 13.5px; color: #9ca3af; margin: 0; }

/* ── List rows ── */
.cbd-list { display: flex; flex-direction: column; gap: 4px; }

.cbd-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  user-select: none;
}
.cbd-row:hover { border-color: #fca5a5; box-shadow: 0 1px 6px rgba(255, 49, 49, 0.08); }
.cbd-row--selected { border-color: #ff3131; background: #fff5f5; }

.cbd-checkbox {
  width: 18px;
  height: 18px;
  border-radius: 5px;
  border: 2px solid #d1d5db;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}
.cbd-checkbox--on { background: #ff3131; border-color: #ff3131; }

.cbd-row__main { flex: 1; min-width: 0; }
.cbd-row__name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
.cbd-row__tags { display: flex; gap: 4px; margin-top: 3px; flex-wrap: wrap; }

.cbd-tag {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 50px;
  background: #f3f4f6;
  color: #6b7280;
}
.cbd-tag--type {
  background: #fef2f2;
  color: #ff3131;
}

.cbd-row__price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  white-space: nowrap;
}
.cbd-row__price-val { font-size: 13px; font-weight: 700; color: #111827; }
.cbd-row__price-unit { font-size: 11px; color: #9ca3af; }

/* Barre d'erreur fixe, entre le corps scrollable et le footer. */
.cbd-error {
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
.cbd-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
}
.cbd-footer__count {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #6b7280;
}
.cbd-footer__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  border-radius: 50px;
  background: #ff3131;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
}
.cbd-footer__none { color: #9ca3af; font-style: italic; }
.cbd-footer__actions { display: flex; gap: 8px; }

.cbd-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 0 18px;
  height: 38px;
  border-radius: 50px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}
.cbd-btn--cancel { background: #f3f4f6; color: #374151; }
.cbd-btn--cancel:hover { background: #e5e7eb; }
.cbd-btn--primary { background: #ff3131; color: #fff; }
.cbd-btn--primary:hover { box-shadow: 0 4px 12px rgba(255, 49, 49, 0.35); }
.cbd-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Transition ── */
.cbd-slide-enter-active,
.cbd-slide-leave-active { transition: opacity 0.25s ease; }
.cbd-slide-enter-active .cbd-panel,
.cbd-slide-leave-active .cbd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.cbd-slide-enter-from,
.cbd-slide-leave-to { opacity: 0; }
.cbd-slide-enter-from .cbd-panel,
.cbd-slide-leave-to .cbd-panel { transform: translateX(100%); }

/* ── Dark mode ── */
.cbd-panel--dark { background: #111827; }
.cbd-panel--dark .cbd-toolbar { background: #1f2937; border-bottom-color: rgba(255,255,255,0.08); }
.cbd-panel--dark .cbd-search { background: #1e293b; border-color: rgba(255,255,255,0.1); }
.cbd-panel--dark .cbd-search__input { color: #e2e8f0; }
.cbd-panel--dark .cbd-body { background: #111827; }
.cbd-panel--dark .cbd-row { background: #1f2937; border-color: rgba(255,255,255,0.08); }
.cbd-panel--dark .cbd-row--selected { background: #3b1f1f; }
.cbd-panel--dark .cbd-row__name { color: #e2e8f0; }
.cbd-panel--dark .cbd-row__price-val { color: #e2e8f0; }
.cbd-panel--dark .cbd-checkbox { border-color: #475569; background: #1e293b; }
.cbd-panel--dark .cbd-footer { background: #1f2937; border-top-color: rgba(255,255,255,0.08); }
/* Pills de filtre + tags de catégorie */
.cbd-panel--dark .cbd-pill { background: #1a2332; border-color: rgba(255,255,255,.12); color: #94a3b8; }
.cbd-panel--dark .cbd-pill:hover { border-color: #ff3131; color: #fca5a5; }
.cbd-panel--dark .cbd-tag { background: rgba(255,255,255,.08); color: #cbd5e1; }
.cbd-panel--dark .cbd-tag--type { background: rgba(255,49,49,.18); color: #fca5a5; }
</style>
