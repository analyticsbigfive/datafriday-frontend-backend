<template>
  <Teleport to="body">
    <Transition name="cpd-slide">
      <div v-if="modelValue" class="cpd-overlay" @mousedown.self="close">
        <div class="cpd-panel" :class="{ 'cpd-panel--dark': isDark }">

          <!-- ── Gradient Header ── -->
          <div class="cpd-header">
            <div class="cpd-header__icon"><Boxes :size="20" color="white" /></div>
            <div class="cpd-header__titles">
              <p class="cpd-header__title">{{ t('menuItemCreate.compTitle') }}</p>
              <p class="cpd-header__sub">{{ t('menuItemCreate.compSubtitle') }}</p>
            </div>
            <button class="cpd-header__close" @click="close"><X :size="16" /></button>
          </div>

          <!-- ── Toolbar ── -->
          <div class="cpd-toolbar">
            <div class="cpd-search">
              <Search :size="15" class="cpd-search__icon" />
              <input
                v-model="search"
                class="cpd-search__input"
                :placeholder="t('menuItemCreate.compSearchPlaceholder')"
              />
              <button v-if="search" class="cpd-search__clear" @click="search = ''">
                <X :size="13" />
              </button>
            </div>

            <div class="cpd-pills">
              <button
                class="cpd-pill"
                :class="{ 'cpd-pill--active': !category }"
                @click="category = null"
              >{{ t('menuItemCreate.compPillAll') }}</button>
              <button
                v-for="opt in categoryOptions"
                :key="opt"
                class="cpd-pill"
                :class="{ 'cpd-pill--active': category === opt }"
                @click="category = opt"
              >{{ opt }}</button>
            </div>
          </div>

          <!-- ── Body ── -->
          <div class="cpd-body">

            <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-3">
              {{ error }}
            </v-alert>

            <div v-if="loading" class="cpd-empty">
              <v-progress-circular indeterminate color="#ff3131" size="32" width="3" />
            </div>

            <div v-else-if="!filteredItems.length" class="cpd-empty">
              <div class="cpd-empty__icon"><Boxes :size="24" /></div>
              <p class="cpd-empty__text">{{ t('menuItemCreate.compNoData') }}</p>
            </div>

            <div v-else class="cpd-list">
              <div
                v-for="item in filteredItems"
                :key="item.id"
                class="cpd-row"
                :class="{ 'cpd-row--selected': selectedIds.includes(item.id) }"
                @click="toggleSelection(item.id)"
              >
                <div
                  class="cpd-checkbox"
                  :class="{ 'cpd-checkbox--on': selectedIds.includes(item.id) }"
                >
                  <Check v-if="selectedIds.includes(item.id)" :size="11" color="white" />
                </div>

                <div class="cpd-row__main">
                  <span class="cpd-row__name">{{ item.name }}</span>
                  <div class="cpd-row__tags">
                    <span v-if="item.type" class="cpd-tag cpd-tag--type">{{ item.type }}</span>
                    <span v-if="item.category" class="cpd-tag">{{ item.category }}</span>
                  </div>
                </div>

                <div class="cpd-row__unit">
                  <span>{{ item.unit || '—' }}</span>
                </div>

                <div class="cpd-row__price">
                  <span class="cpd-row__price-val">{{ formatCurrency(item.unitCost) }}</span>
                  <span class="cpd-row__price-unit">/ {{ item.unit || 'u' }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- ── Footer ── -->
          <div class="cpd-footer">
            <span class="cpd-footer__count">
              <span v-if="selectedIds.length" class="cpd-footer__badge">{{ selectedIds.length }}</span>
              <span v-else class="cpd-footer__none">Aucune sélection</span>
              <template v-if="selectedIds.length">
                sélectionné{{ selectedIds.length > 1 ? 's' : '' }}
              </template>
            </span>
            <div class="cpd-footer__actions">
              <button class="cpd-btn cpd-btn--cancel" :disabled="loading" @click="close">
                {{ t('menuItemCreate.cancel') }}
              </button>
              <button
                class="cpd-btn cpd-btn--primary"
                :disabled="!selectedIds.length || loading"
                @click="addSelected"
              >
                <Plus :size="14" class="me-1" />
                {{ t('menuItemCreate.compAddBtn') }} ({{ selectedIds.length }})
              </button>
            </div>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { Boxes, Check, Plus, Search, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { formatCurrencyDetailed } from '@/composables/useFormatters';

export default {
  name: 'ComponentPickerDrawer',
  components: { Boxes, Check, Plus, Search, X },
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
      return (this.$store.getters['menuComponents/rows'] || [])
        .map(c => this.normalizeRow(c))
        .filter(c => c.id && c.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    },
    categoryOptions() {
      return Array.from(new Set((this.items || []).map(c => c.category).filter(Boolean)))
        .sort((a, b) => String(a).localeCompare(String(b)));
    },
    filteredItems() {
      const q = String(this.search || '').toLowerCase();
      const cat = this.category;
      return (this.items || []).filter(c => {
        const matchesSearch = !q
          || String(c.name).toLowerCase().includes(q)
          || String(c.category).toLowerCase().includes(q)
          || String(c.type).toLowerCase().includes(q);
        const matchesCategory = !cat || c.category === cat;
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
    async loadItems() {
      this.loading = true;
      this.error = '';
      try {
        await this.$store.dispatch('menuComponents/fetchComponents');
      } catch (e) {
        this.error = e?.userMessage || e?.message || 'Failed to load components';
      } finally {
        this.loading = false;
      }
    },
    addSelected() {
      const selectedSet = new Set(this.selectedIds);
      const picked = (this.items || []).filter(c => selectedSet.has(c.id));
      if (!picked.length) return;
      const toAdd = picked.map(c => ({
        id: `comp-${Date.now()}-${Math.random()}`,
        name: c.name,
        type: 'Component',
        category: c.category,
        unit: c.unit,
        quantity: 1,
        unitCost: Number(c.unitCost || 0),
        totalCost: Number(c.unitCost || 0),
        storage: c.storageType || 'Dry',
        componentId: c.id,
      }));
      this.$emit('add', toAdd);
      this.close();
    },
    normalizeRow(c) {
      const raw = c || {};
      return {
        id: String(raw?.id ?? raw?._id ?? ''),
        name: String(raw?.name ?? raw?.title ?? '').trim(),
        category: String(raw?.category ?? '').trim(),
        type: String(raw?.componentCategory ?? raw?.type ?? '').trim(),
        unit: String(raw?.unit ?? '').trim(),
        unitCost: Number(raw?.unitCost ?? raw?.unit_cost ?? 0) || 0,
        storageType: String(raw?.storageType ?? raw?.storage_type ?? '').trim(),
      };
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.cpd-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 2000;
  display: flex;
  justify-content: flex-end;
}

/* ── Panel ── */
.cpd-panel {
  width: 680px;
  max-width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
}

/* ── Header ── */
.cpd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, 0.2);
}
.cpd-header__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cpd-header__titles { flex: 1; }
.cpd-header__title { font-size: 15px; font-weight: 700; color: #fff; margin: 0; }
.cpd-header__sub { font-size: 12px; color: rgba(255, 255, 255, 0.72); margin: 2px 0 0; }
.cpd-header__close {
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
.cpd-header__close:hover { background: rgba(255, 255, 255, 0.25); }

/* ── Toolbar ── */
.cpd-toolbar {
  flex-shrink: 0;
  padding: 12px 16px 0;
  background: #fff;
  border-bottom: 1px solid #f3f4f6;
}

.cpd-search {
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
.cpd-search__icon { color: #9ca3af; flex-shrink: 0; }
.cpd-search__input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 13.5px;
  color: #111827;
  outline: none;
}
.cpd-search__input::placeholder { color: #9ca3af; }
.cpd-search__clear {
  background: none;
  border: none;
  cursor: pointer;
  color: #9ca3af;
  display: flex;
  align-items: center;
  padding: 0;
}
.cpd-search__clear:hover { color: #374151; }

.cpd-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 10px 0 12px;
}
.cpd-pill {
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
.cpd-pill:hover { border-color: #ff3131; color: #ff3131; }
.cpd-pill--active {
  background: #ff3131;
  border-color: #ff3131;
  color: #fff;
  font-weight: 600;
}

/* ── Body ── */
.cpd-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 12px 16px;
  background: #f9fafb;
}

.cpd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  gap: 12px;
}
.cpd-empty__icon { color: #d1d5db; }
.cpd-empty__text { font-size: 13.5px; color: #9ca3af; margin: 0; }

/* ── List rows ── */
.cpd-list { display: flex; flex-direction: column; gap: 4px; }

.cpd-row {
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
.cpd-row:hover { border-color: #fca5a5; box-shadow: 0 1px 6px rgba(255, 49, 49, 0.08); }
.cpd-row--selected { border-color: #ff3131; background: #fff5f5; }

.cpd-checkbox {
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
.cpd-checkbox--on { background: #ff3131; border-color: #ff3131; }

.cpd-row__main { flex: 1; min-width: 0; }
.cpd-row__name {
  font-size: 13px;
  font-weight: 600;
  color: #111827;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}
.cpd-row__tags { display: flex; gap: 4px; margin-top: 3px; flex-wrap: wrap; }

.cpd-tag {
  font-size: 11px;
  font-weight: 500;
  padding: 1px 7px;
  border-radius: 50px;
  background: #f3f4f6;
  color: #6b7280;
}
.cpd-tag--type {
  background: #eff6ff;
  color: #3b82f6;
}

.cpd-row__unit {
  font-size: 12px;
  color: #9ca3af;
  white-space: nowrap;
  min-width: 40px;
  text-align: center;
}

.cpd-row__price {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  white-space: nowrap;
}
.cpd-row__price-val { font-size: 13px; font-weight: 700; color: #111827; }
.cpd-row__price-unit { font-size: 11px; color: #9ca3af; }

/* ── Footer ── */
.cpd-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
}
.cpd-footer__count {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #6b7280;
}
.cpd-footer__badge {
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
.cpd-footer__none { color: #9ca3af; font-style: italic; }
.cpd-footer__actions { display: flex; gap: 8px; }

.cpd-btn {
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
.cpd-btn--cancel { background: #f3f4f6; color: #374151; }
.cpd-btn--cancel:hover { background: #e5e7eb; }
.cpd-btn--primary { background: #ff3131; color: #fff; }
.cpd-btn--primary:hover { box-shadow: 0 4px 12px rgba(255, 49, 49, 0.35); }
.cpd-btn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Transition ── */
.cpd-slide-enter-active,
.cpd-slide-leave-active { transition: opacity 0.25s ease; }
.cpd-slide-enter-active .cpd-panel,
.cpd-slide-leave-active .cpd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.cpd-slide-enter-from,
.cpd-slide-leave-to { opacity: 0; }
.cpd-slide-enter-from .cpd-panel,
.cpd-slide-leave-to .cpd-panel { transform: translateX(100%); }

/* ── Dark mode ── */
.cpd-panel--dark { background: #111827; }
.cpd-panel--dark .cpd-toolbar { background: #1f2937; border-bottom-color: rgba(255,255,255,0.08); }
.cpd-panel--dark .cpd-search { background: #1e293b; border-color: rgba(255,255,255,0.1); }
.cpd-panel--dark .cpd-search__input { color: #e2e8f0; }
.cpd-panel--dark .cpd-body { background: #111827; }
.cpd-panel--dark .cpd-row { background: #1f2937; border-color: rgba(255,255,255,0.08); }
.cpd-panel--dark .cpd-row--selected { background: #3b1f1f; }
.cpd-panel--dark .cpd-row__name { color: #e2e8f0; }
.cpd-panel--dark .cpd-row__price-val { color: #e2e8f0; }
.cpd-panel--dark .cpd-checkbox { border-color: #475569; background: #1e293b; }
.cpd-panel--dark .cpd-footer { background: #1f2937; border-top-color: rgba(255,255,255,0.08); }
/* Pills de filtre + tags de catégorie */
.cpd-panel--dark .cpd-pill { background: #1a2332; border-color: rgba(255,255,255,.12); color: #94a3b8; }
.cpd-panel--dark .cpd-pill:hover { border-color: #ff3131; color: #fca5a5; }
.cpd-panel--dark .cpd-tag { background: rgba(255,255,255,.08); color: #cbd5e1; }
.cpd-panel--dark .cpd-tag--type { background: rgba(59,130,246,.18); color: #93c5fd; }
</style>
