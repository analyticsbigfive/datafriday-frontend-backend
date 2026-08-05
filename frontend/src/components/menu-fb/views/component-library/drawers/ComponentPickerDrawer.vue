<template>
  <Teleport to="body">
    <Transition name="ccd-drawer">
      <div v-if="modelValue" class="ccd-overlay" @mousedown.self="close">
        <div class="ccd-panel component-create__drawer" :class="{ 'ccd-panel--dark': isDark }">

          <!-- ── Header ── -->
          <div class="cld-drawer__header">
            <div class="cld-drawer__header-icon"><Boxes :size="20" color="white" /></div>
            <div class="cld-drawer__header-text">
              <div class="cld-drawer__header-title">{{ t('compCreateCompDrawerTitle') }}</div>
              <div class="cld-drawer__header-sub">{{ t('compCreateCompDrawerSubtitle') }}</div>
            </div>
            <button class="cld-drawer__close" @click="close"><X :size="16" /></button>
          </div>

          <!-- ── Toolbar (recherche + pills), natif comme IngredientPickerDrawer ── -->
          <div class="ccd-toolbar">
            <div class="ccd-search">
              <Search :size="15" class="ccd-search__icon" />
              <input
                v-model="search"
                class="ccd-search__input"
                :placeholder="t('compCreateCompSearchPlaceholder')"
              />
              <button v-if="search" class="ccd-search__clear" @click="search = ''">
                <X :size="13" />
              </button>
            </div>

            <div class="ccd-pills">
              <button
                class="ccd-pill"
                :class="{ 'ccd-pill--active': !category }"
                @click="category = null"
              >{{ t('compListAllCategories') }}</button>
              <button
                v-for="opt in categoryList"
                :key="opt"
                class="ccd-pill"
                :class="{ 'ccd-pill--active': category === opt }"
                @click="category = opt"
              >{{ opt }}</button>
            </div>
          </div>

          <!-- ── Body ── -->
          <div class="ccd-body">
            <!-- Loading -->
            <div v-if="loading" class="ccd-empty">
              <v-progress-circular indeterminate color="#ff3131" size="32" width="3" />
            </div>

            <!-- Empty -->
            <div v-else-if="!filteredItems.length" class="ccd-empty">
              <div class="ccd-empty__icon"><Boxes :size="24" /></div>
              <p class="ccd-empty__text">Aucun composant trouvé</p>
            </div>

            <!-- Table native -->
            <div v-else class="ccd-table-card">
              <table class="ccd-table">
                <thead>
                  <tr>
                    <th class="ccd-th ccd-th--check">
                      <div
                        class="ccd-checkbox"
                        :class="{ 'ccd-checkbox--on': allSelected }"
                        @click="toggleAll"
                      >
                        <Check v-if="allSelected" :size="11" color="white" />
                      </div>
                    </th>
                    <th class="ccd-th ccd-th--main">{{ t('compCreateCompColName') }}</th>
                    <th class="ccd-th">{{ t('compCreateCompColType') }}</th>
                    <th class="ccd-th">{{ t('compCreateCompColCategory') }}</th>
                    <th class="ccd-th">{{ t('compCreateCompColUnit') }}</th>
                    <th class="ccd-th ccd-th--end">{{ t('compCreateCompColUnitCost') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="item in filteredItems"
                    :key="item.id"
                    class="ccd-row"
                    :class="{ 'ccd-row--selected': selectedIds.includes(item.id) }"
                    @click="toggleSelection(item.id, !selectedIds.includes(item.id))"
                  >
                    <td class="ccd-td ccd-td--check">
                      <div
                        class="ccd-checkbox"
                        :class="{ 'ccd-checkbox--on': selectedIds.includes(item.id) }"
                      >
                        <Check v-if="selectedIds.includes(item.id)" :size="11" color="white" />
                      </div>
                    </td>
                    <td class="ccd-td ccd-td--main"><span class="ccd-cell-name">{{ item.name }}</span></td>
                    <td class="ccd-td"><span class="ccd-tag ccd-tag--type">{{ item.type || '—' }}</span></td>
                    <td class="ccd-td"><span class="ccd-tag">{{ item.category || '—' }}</span></td>
                    <td class="ccd-td ccd-cell-muted">{{ item.unit || '—' }}</td>
                    <td class="ccd-td ccd-td--end"><span class="ccd-cell-price">{{ formatCurrency(item.unitCost) }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Erreur : hors zone scrollable, toujours visible juste au-dessus des boutons -->
          <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="ccd-error">
            {{ error }}
          </v-alert>

          <!-- ── Footer ── -->
          <div class="cld-drawer__footer">
            <div class="cld-drawer__footer-count">{{ selectedIds.length }} sélectionné{{ selectedIds.length > 1 ? 's' : '' }}</div>
            <div class="cld-drawer__footer-actions">
              <button class="cld-fbtn cld-fbtn--cancel" @click="close">{{ t('compCreateCancel') }}</button>
              <button class="cld-fbtn cld-fbtn--primary" :disabled="!selectedIds.length" @click="addSelected">{{ t('compCreateAddSelected') }} ({{ selectedIds.length }})</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { Boxes, Check, Search, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'ComponentPickerDrawer',
  components: { Boxes, Check, Search, X },
  props: {
    modelValue: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
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
    };
  },
  watch: {
    modelValue(val) {
      if (val) this.loadItems();
    },
  },
  computed: {
    items() {
      return (this.$store.getters['menuComponents/rows'] || [])
        .map(c => this.normalizeRow(c))
        .filter(c => c.id && c.name)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
    },
    categoryList() {
      return Array.from(new Set((this.items || []).map(c => c.category).filter(Boolean)))
        .sort((a, b) => String(a).localeCompare(String(b)));
    },
    filteredItems() {
      const q = String(this.search || '').toLowerCase();
      const cat = this.category;
      return (this.items || []).filter(c => {
        const name = String(c?.name || '').toLowerCase();
        const category = String(c?.category || '').toLowerCase();
        const type = String(c?.type || '').toLowerCase();
        const matchesSearch = !q || name.includes(q) || category.includes(q) || type.includes(q);
        const matchesCategory = cat === null || String(c?.category || '') === cat;
        return matchesSearch && matchesCategory;
      });
    },
    allSelected() {
      const f = this.filteredItems || [];
      return f.length > 0 && f.every(c => this.selectedIds.includes(c.id));
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
    toggleSelection(id, checked) {
      const next = new Set(this.selectedIds || []);
      if (checked) next.add(id);
      else next.delete(id);
      this.selectedIds = Array.from(next);
    },
    toggleAll() {
      const ids = (this.filteredItems || []).map(c => c.id);
      if (this.allSelected) {
        const remove = new Set(ids);
        this.selectedIds = this.selectedIds.filter(id => !remove.has(id));
      } else {
        const next = new Set(this.selectedIds || []);
        ids.forEach(id => next.add(id));
        this.selectedIds = Array.from(next);
      }
    },
    addSelected() {
      const selectedSet = new Set(this.selectedIds);
      const picked = (this.items || []).filter(c => selectedSet.has(c.id));
      if (!picked.length) return;
      const toAdd = picked.map(c => ({
        itemType: 'Component',
        childId: c.id,
        itemName: c.name,
        category: c.category,
        goodType: c.type,
        unit: c.unit,
        quantity: 1,
        unitCost: Number(c.unitCost || 0),
        totalCost: Number(c.unitCost || 0),
        storageType: c.storageType || 'Dry',
        addedAt: new Date().toISOString(),
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
        _raw: raw,
      };
    },
    formatCurrency(value) {
      const n = Number(value);
      if (!Number.isFinite(n)) return '€0.00';
      return n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    },
  },
};
</script>

<style scoped>
/* ── Overlay + Panel ── */
.ccd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  justify-content: flex-end;
}

.ccd-panel {
  width: 760px;
  max-width: 100vw;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #fff;
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.18);
}

.component-create__drawer { overflow: hidden; }

/* ── Transition ── */
.ccd-drawer-enter-active,
.ccd-drawer-leave-active {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}
.ccd-drawer-enter-from,
.ccd-drawer-leave-to {
  transform: translateX(100%);
}

/* ── Header ── */
.cld-drawer__header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, 0.2);
}
.cld-drawer__header-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.cld-drawer__header-text { flex: 1; }
.cld-drawer__header-title {
  font-size: 1rem;
  font-weight: 700;
  color: #fff;
}
.cld-drawer__header-sub {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.72);
  margin-top: 2px;
}
.cld-drawer__close {
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
.cld-drawer__close:hover { background: rgba(255, 255, 255, 0.25); }

/* ── Toolbar (recherche + pills) ── */
.ccd-toolbar {
  flex-shrink: 0;
  padding: 14px 20px 12px;
  border-bottom: 1px solid #f0f0f0;
  background: #fafafa;
}
.ccd-search {
  display: flex; align-items: center; gap: 10px;
  background: #fff; border: 1.5px solid #e5e7eb; border-radius: 12px;
  padding: 9px 13px; margin-bottom: 11px;
  transition: border-color .18s, box-shadow .18s;
}
.ccd-search:focus-within {
  border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49, .1);
}
.ccd-search__icon { color: #9ca3af; flex-shrink: 0; }
.ccd-search__input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: 0.875rem; color: #111827;
}
.ccd-search__input::placeholder { color: #9ca3af; }
.ccd-search__clear {
  border: none; background: none; color: #9ca3af; cursor: pointer;
  padding: 0; display: flex; align-items: center;
}
.ccd-search__clear:hover { color: #374151; }

.ccd-pills { display: flex; flex-wrap: wrap; gap: 7px; }
.ccd-pill {
  padding: 4px 12px; border-radius: 100px;
  border: 1.5px solid #e5e7eb; background: #f9fafb;
  font-size: 0.75rem; font-weight: 500; color: #6b7280;
  cursor: pointer; user-select: none;
  transition: border-color .15s, background .15s, color .15s;
}
.ccd-pill:hover { border-color: #ff3131; color: #ff3131; background: #fff5f5; }
.ccd-pill--active { background: #fef2f2; border-color: #ff3131; color: #ff3131; font-weight: 700; box-shadow: 0 0 0 2px rgba(255, 49, 49, .1); }

/* ── Body ── */
.ccd-body {
  flex: 1 1 0; min-height: 0; overflow-y: auto; padding: 16px 20px;
  scrollbar-width: thin; scrollbar-color: #e5e7eb transparent;
}
.ccd-body::-webkit-scrollbar { width: 5px; }
.ccd-body::-webkit-scrollbar-thumb { background: #e5e7eb; border-radius: 5px; }

/* Empty / loading */
.ccd-empty {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; gap: 10px; min-height: 180px; color: #9ca3af;
}
.ccd-empty__icon {
  width: 52px; height: 52px; border-radius: 50%;
  background: linear-gradient(135deg, #fef2f2, #fee2e2);
  display: flex; align-items: center; justify-content: center; color: #ff3131;
}
.ccd-empty__text { font-size: 0.8125rem; font-weight: 500; color: #6b7280; margin: 0; }

/* ── Table native ── */
.ccd-table-card {
  border-radius: 14px;
  border: 1.5px solid #e5e7eb;
  overflow: hidden;
  background: #fff;
}
.ccd-table { width: 100%; border-collapse: collapse; }
.ccd-th {
  text-align: left; padding: 9px 14px;
  background: #f3f4f6;
  font-size: 0.75rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: .6px;
  color: #9ca3af; white-space: nowrap;
  border-bottom: 1px solid #e5e7eb;
}
.ccd-th--check { width: 44px; }
.ccd-th--main { width: 40%; }
.ccd-th--end { text-align: right; }
.ccd-row { cursor: pointer; transition: background .15s; }
.ccd-row:hover { background: #f9fafb; }
.ccd-row--selected { background: #fff5f5; }
.ccd-td {
  padding: 10px 14px;
  border-bottom: 1px solid #f3f4f6;
  font-size: 0.8125rem;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ccd-row:last-child .ccd-td { border-bottom: none; }
.ccd-td--check { width: 44px; }
.ccd-td--end { text-align: right; }
.ccd-cell-name { font-weight: 600; color: #111827; }
.ccd-cell-muted { color: #6b7280; }
.ccd-cell-price { font-weight: 700; color: #111827; }
.ccd-tag {
  display: inline-block;
  font-size: 0.75rem; font-weight: 600;
  padding: 2px 8px; border-radius: 100px;
  background: #f3f4f6; color: #6b7280;
}
.ccd-tag--type { background: #fef2f2; color: #ff3131; }

/* Checkbox maison (cf. IngredientPickerDrawer) */
.ccd-checkbox {
  width: 17px; height: 17px; border-radius: 5px;
  border: 2px solid #d1d5db; background: #fff;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; cursor: pointer;
  transition: border-color .15s, background .15s;
}
.ccd-checkbox--on { background: #ff3131; border-color: #ff3131; }

/* Barre d'erreur fixe, entre le corps scrollable et le footer. */
.ccd-error {
  flex-shrink: 0;
  margin: 0;
  border-radius: 0 !important;
}

/* ── Footer ── */
.cld-drawer__footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
}
.cld-drawer__footer-count { font-size: 0.8125rem; color: #6b7280; }
.cld-drawer__footer-actions { display: flex; gap: 10px; }
.cld-fbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
  height: 38px;
  border-radius: 50px;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}
.cld-fbtn--cancel { background: #f3f4f6; color: #374151; }
.cld-fbtn--cancel:hover { background: #e5e7eb; }
.cld-fbtn--primary { background: #ff3131; color: #fff; }
.cld-fbtn--primary:hover { box-shadow: 0 4px 12px rgba(255, 49, 49, 0.35); }
.cld-fbtn:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Dark mode ── */
.ccd-panel--dark { background: #1e293b; }
.ccd-panel--dark .ccd-toolbar { background: #1a2332; border-bottom-color: rgba(255,255,255,.08); }
.ccd-panel--dark .ccd-search { background: #0f172a; border-color: rgba(255,255,255,.12); }
.ccd-panel--dark .ccd-search__input { color: #e2e8f0; }
.ccd-panel--dark .ccd-pill { border-color: rgba(255,255,255,.12); background: #1a2332; color: #94a3b8; }
.ccd-panel--dark .ccd-pill--active { background: rgba(255,49,49,.15); border-color: #ff3131; color: #fca5a5; }
.ccd-panel--dark .ccd-table-card { background: #1e293b; border-color: rgba(255,255,255,.08); }
.ccd-panel--dark .ccd-th { background: #1a2332; color: #94a3b8; border-bottom-color: rgba(255,255,255,.08); }
.ccd-panel--dark .ccd-row:hover { background: rgba(255,255,255,.03); }
.ccd-panel--dark .ccd-row--selected { background: rgba(255,49,49,.1); }
.ccd-panel--dark .ccd-td { border-bottom-color: rgba(255,255,255,.06); }
.ccd-panel--dark .ccd-cell-name,
.ccd-panel--dark .ccd-cell-price { color: #e2e8f0; }
.ccd-panel--dark .ccd-cell-muted { color: #94a3b8; }
.ccd-panel--dark .ccd-tag { background: rgba(255,255,255,.08); color: #94a3b8; }
.ccd-panel--dark .ccd-tag--type { background: rgba(255,49,49,.15); color: #fca5a5; }
.ccd-panel--dark .ccd-checkbox { border-color: #475569; background: #0f172a; }
.ccd-panel--dark .cld-drawer__footer { background: #1e293b; border-top-color: rgba(255,255,255,.08); }
.ccd-panel--dark .cld-drawer__footer-count { color: #94a3b8; }
.ccd-panel--dark .cld-fbtn--cancel { background: rgba(255,255,255,.08); color: #cbd5e1; }
.ccd-panel--dark .cld-fbtn--cancel:hover { background: rgba(255,255,255,.14); }
</style>
