<template>
  <Teleport to="body">
    <Transition name="ccd-drawer">
      <div v-if="modelValue" class="ccd-overlay" @mousedown.self="close">
        <div class="ccd-panel component-create__drawer" :class="{ 'ccd-panel--dark': isDark }">
          <div class="cld-drawer__header">
            <div class="cld-drawer__header-icon"><Boxes :size="20" color="white" /></div>
            <div class="cld-drawer__header-text">
              <div class="cld-drawer__header-title">{{ t('compCreateCompDrawerTitle') }}</div>
              <div class="cld-drawer__header-sub">{{ t('compCreateCompDrawerSubtitle') }}</div>
            </div>
            <button class="cld-drawer__close" @click="close"><X :size="16" /></button>
          </div>

          <div class="component-create__drawer-body">
            <div class="d-flex gap-3 ccd-toolbar">
              <v-text-field
                v-model="search"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                :placeholder="t('compCreateCompSearchPlaceholder')"
                prepend-inner-icon="mdi-magnify"
                clearable
                class="ccd-field"
              />
              <v-select
                v-model="category"
                :items="categoryOptions"
                item-title="title"
                item-value="value"
                variant="outlined"
                density="compact"
                rounded="lg"
                hide-details
                prepend-inner-icon="mdi-shape"
                :loading="loading"
                :menu-props="{ zIndex: 10000 }"
                class="ccd-field"
              />
            </div>

            <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mt-3">
              {{ error }}
            </v-alert>

            <div class="mt-3 ccd-table-card">
              <v-data-table
                v-model="selectedIds"
                :headers="headers"
                :items="filteredItems"
                item-value="id"
                show-select
                density="compact"
                :loading="loading"
                class="component-create__drawer-table"
              >
                <template #item.category="{ item }">
                  <v-chip size="small" variant="tonal" color="secondary" rounded="lg">
                    {{ item?.raw?.category || item?.category || "-" }}
                  </v-chip>
                </template>

                <template #item.type="{ item }">
                  <v-chip size="small" color="#ff3131" rounded="lg" class="text-white">
                    {{ item?.raw?.type || item?.type || "-" }}
                  </v-chip>
                </template>

                <template #item.unitCost="{ item }">
                  {{ formatCurrency(Number(item?.raw?.unitCost ?? item?.unitCost ?? 0)) }}
                </template>
              </v-data-table>
            </div>
          </div>

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
import { Boxes, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'ComponentPickerDrawer',
  components: { Boxes, X },
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
    categoryOptions() {
      const cats = Array.from(new Set((this.items || []).map(c => c.category).filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
      return [
        { value: null, title: this.t('compListAllCategories') },
        ...cats.map(c => ({ value: c, title: c })),
      ];
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
    headers() {
      return [
        { title: this.t('compCreateCompColName'), key: 'name', minWidth: '180px' },
        { title: this.t('compCreateCompColType'), key: 'type', width: '110px' },
        { title: this.t('compCreateCompColCategory'), key: 'category', width: '140px' },
        { title: this.t('compCreateCompColUnit'), key: 'unit', width: '90px' },
        { title: this.t('compCreateCompColUnitCost'), key: 'unitCost', width: '100px', align: 'end' },
      ];
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
  background: rgb(var(--v-theme-surface));
  box-shadow: -4px 0 24px rgba(0, 0, 0, 0.18);
}

.component-create__drawer {
  overflow: hidden;
}

.component-create__drawer-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

/* Champs de la toolbar (recherche + filtre catégorie) : même style doux que le reste de l'app
   (bordure gris clair, coin arrondi) au lieu du contour noir par défaut de Vuetify. */
.ccd-toolbar { align-items: flex-start; }
.ccd-field { flex: 1; min-width: 0; }
.ccd-field :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 12px !important;
  background: #f9fafb !important;
  box-shadow: none !important;
}
.ccd-field :deep(.v-field__outline) { display: none; }
.ccd-field :deep(.v-field--focused) { border-color: #ff3131 !important; }
.ccd-field :deep(.v-field__input) { font-size: 0.8125rem !important; }

/* Tableau : carte blanche cohérente avec le reste de la page, en-têtes sur une seule ligne. */
.ccd-table-card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  overflow: hidden;
}
.component-create__drawer-table :deep(.v-data-table__th) {
  background: #f9fafb !important;
  color: #6b7280 !important;
  font-size: 0.75rem !important;
  font-weight: 700 !important;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.component-create__drawer-table :deep(.v-data-table__td) {
  font-size: 0.8125rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

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

.cld-drawer__footer-count {
  font-size: 0.8125rem;
  color: #6b7280;
}

.cld-drawer__footer-actions {
  display: flex;
  gap: 10px;
}

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

.ccd-drawer-enter-active,
.ccd-drawer-leave-active {
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.ccd-drawer-enter-from,
.ccd-drawer-leave-to {
  transform: translateX(100%);
}

/* ── Dark mode ── */
.ccd-panel--dark .ccd-field :deep(.v-field) { border-color: rgba(255,255,255,.12) !important; background: #1a2332 !important; }
.ccd-panel--dark .ccd-table-card { background: #1e293b; border-color: rgba(255,255,255,.08); }
.ccd-panel--dark .component-create__drawer-table :deep(.v-data-table__th) { background: #1a2332 !important; color: #94a3b8 !important; }
.ccd-panel--dark .component-create__drawer-table :deep(.v-data-table__td) { color: #e2e8f0; }
.ccd-panel--dark .cld-drawer__footer { background: #1e293b; border-top-color: rgba(255,255,255,.08); }
.ccd-panel--dark .cld-drawer__footer-count { color: #94a3b8; }
.ccd-panel--dark .cld-fbtn--cancel { background: rgba(255,255,255,.08); color: #cbd5e1; }
.ccd-panel--dark .cld-fbtn--cancel:hover { background: rgba(255,255,255,.14); }
/* Inputs (recherche + filtre) : texte saisi, label et icônes clairs sur fond sombre. */
.ccd-panel--dark .ccd-field :deep(.v-field__input),
.ccd-panel--dark .ccd-field :deep(input),
.ccd-panel--dark .ccd-field :deep(.v-select__selection-text) { color: #e2e8f0 !important; }
.ccd-panel--dark .ccd-field :deep(.v-label) { color: #94a3b8 !important; }
.ccd-panel--dark .ccd-field :deep(.v-field__clearable),
.ccd-panel--dark .ccd-field :deep(.v-field__append-inner),
.ccd-panel--dark .ccd-field :deep(.v-field__prepend-inner) { color: #94a3b8 !important; }
</style>
