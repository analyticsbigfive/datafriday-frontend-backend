<template>
  <Teleport to="body">
    <Transition name="dfd-slide">
      <div v-if="modelValue" class="dfd-overlay" @mousedown.self="close">
        <div class="dfd-panel" :class="{'dfd-panel--dark': isDark}">

          <!-- Gradient header -->
          <div class="dfd-header">
            <div class="dfd-header__icon">
              <Layers :size="20" color="#fff" />
            </div>
            <div class="dfd-header__text">
              <div class="dfd-header__title">{{ mode === 'edit' ? t('departmentList.dialogEditTitle') : t('departmentList.dialogCreateTitle') }}</div>
              <div class="dfd-header__subtitle">{{ mode === 'edit' ? t('departmentList.dialogEditSubtitle') : t('departmentList.dialogCreateSubtitle') }}</div>
            </div>
            <button class="dfd-close-btn" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="dfd-body">
            <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-5">
              {{ error }}
            </v-alert>

            <div class="dfd-field-label">{{ t('departmentList.labelName') }} <span class="dfd-star">*</span></div>
            <v-text-field
              v-model="form.name"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              :placeholder="t('departmentList.namePlaceholder')"
              class="dfd-field mb-4"
            />

            <div class="dfd-field-label">{{ t('departmentList.labelColor') }}</div>
            <div class="dfd-color-row mb-4">
              <input v-model="form.color" type="color" class="dfd-color-swatch" />
              <v-text-field
                v-model="form.color"
                density="compact"
                variant="outlined"
                rounded="lg"
                hide-details="auto"
                class="dfd-field"
              />
            </div>

            <div class="dfd-field-label">{{ t('departmentList.labelIcon') }}</div>
            <v-select
              v-model="form.icon"
              :items="iconOptions"
              item-title="label"
              item-value="value"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              class="dfd-field mb-4"
            >
              <template #selection="{ item }">
                <v-icon :icon="item.value" size="18" class="mr-2" />
                {{ item.title }}
              </template>
              <template #item="{ item, props: itemProps }">
                <v-list-item v-bind="itemProps">
                  <template #prepend>
                    <v-icon :icon="item.value" size="18" />
                  </template>
                </v-list-item>
              </template>
            </v-select>

            <div class="dfd-field-label">{{ t('departmentList.labelFlags') }}</div>
            <v-checkbox
              v-model="form.needsRh"
              :label="t('departmentList.flagNeedsRh')"
              density="compact"
              hide-details
            />
            <v-checkbox
              v-model="form.isSeller"
              :label="t('departmentList.flagIsSeller')"
              density="compact"
              hide-details
            />
            <v-checkbox
              v-model="form.allowsSuppliers"
              :label="t('departmentList.flagAllowsSuppliers')"
              density="compact"
              hide-details
            />
          </div>

          <!-- Footer -->
          <div class="dfd-footer">
            <button class="dfd-fbtn dfd-fbtn--cancel" @click="close">
              {{ t('departmentList.cancel') }}
            </button>
            <button class="dfd-fbtn dfd-fbtn--primary" :disabled="loading" @click="submit">
              <Save :size="15" />
              {{ mode === 'edit' ? t('departmentList.save') : t('departmentList.create') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Save, Layers } from 'lucide-vue-next';
import { createDepartment, updateDepartment } from '@/api/endpoints/department.api';

// Palette curatée d'icônes MDI (les 8 icônes historiques du Builder + quelques extras
// pertinents) — pas de saisie libre, pour éviter un nom d'icône typo/inexistant (rendu vide).
const ICON_OPTIONS = [
  { value: 'mdi-store', label: 'Store' },
  { value: 'mdi-crown', label: 'Crown' },
  { value: 'mdi-shopping', label: 'Shopping' },
  { value: 'mdi-package-variant', label: 'Package' },
  { value: 'mdi-ticket-confirmation', label: 'Ticket' },
  { value: 'mdi-party-popper', label: 'Party' },
  { value: 'mdi-transit-connection-variant', label: 'Access' },
  { value: 'mdi-chef-hat', label: 'Chef Hat (Kitchen)' },
  { value: 'mdi-glass-cocktail', label: 'Cocktail' },
  { value: 'mdi-food', label: 'Food' },
  { value: 'mdi-warehouse', label: 'Warehouse' },
  { value: 'mdi-storefront', label: 'Storefront' },
  { value: 'mdi-account-group', label: 'People' },
  { value: 'mdi-truck', label: 'Truck' },
  { value: 'mdi-star', label: 'Star' },
  { value: 'mdi-tag', label: 'Tag' },
  { value: 'mdi-cog', label: 'Cog' },
  { value: 'mdi-shape', label: 'Shape (générique)' },
];

export default {
  name: 'DepartmentFormDrawer',
  components: { X, Save, Layers },
  props: {
    modelValue: { type: Boolean, default: false },
    mode: { type: String, default: 'create' },
    initialData: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'saved'],
  setup() {
    const { t } = useI18n();
    return { t, iconOptions: ICON_OPTIONS };
  },
  data() {
    return {
      form: { id: '', name: '', color: '#94a3b8', icon: 'mdi-shape', needsRh: false, isSeller: false, allowsSuppliers: true },
      loading: false,
      error: '',
    };
  },
  watch: {
    modelValue(isOpen) {
      if (isOpen) {
        this.error = '';
        this.loading = false;
        if (this.mode === 'edit' && this.initialData) {
          this.form = {
            id: this.initialData.id || '',
            name: this.initialData.name || '',
            color: this.initialData.color || '#94a3b8',
            icon: this.initialData.icon || 'mdi-shape',
            needsRh: !!this.initialData.needsRh,
            isSeller: !!this.initialData.isSeller,
            allowsSuppliers: this.initialData.allowsSuppliers !== false,
          };
        } else {
          this.form = { id: '', name: '', color: '#94a3b8', icon: 'mdi-shape', needsRh: false, isSeller: false, allowsSuppliers: true };
        }
      }
    },
  },
  methods: {
    close() {
      this.$emit('update:modelValue', false);
      this.error = '';
      this.loading = false;
    },
    async submit() {
      this.error = '';
      const name = String(this.form.name || '').trim();
      if (!name) { this.error = this.t('departmentList.nameRequired'); return; }

      this.loading = true;
      try {
        const payload = {
          name,
          color: this.form.color,
          icon: this.form.icon,
          needsRh: this.form.needsRh,
          isSeller: this.form.isSeller,
          allowsSuppliers: this.form.allowsSuppliers,
        };
        if (this.mode === 'edit') {
          if (!this.form.id) { this.error = this.t('departmentList.missingId'); return; }
          await updateDepartment(this.form.id, payload);
          this.$emit('saved', { id: this.form.id, ...payload });
        } else {
          const created = await createDepartment(payload);
          this.$emit('saved', created);
        }
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('departmentList.saveError');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.dfd-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex; justify-content: flex-end;
  backdrop-filter: blur(2px);
}

/* ── Panel ── */
.dfd-panel {
  width: 480px; height: 100%; background: #ffffff;
  display: flex; flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}
.dfd-panel--dark { background: #111827; border-left-color: #374151; color: #f9fafb; }

/* ── Gradient header ── */
.dfd-header {
  flex-shrink: 0; display: flex; align-items: center; gap: 14px;
  padding: 20px 20px 18px; background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.dfd-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.dfd-header__text { flex: 1; min-width: 0; }
.dfd-header__title { font-size: 18px; font-weight: 700; color: #fff; }
.dfd-header__subtitle { font-size: 12.5px; color: rgba(255, 255, 255, .72); margin-top: 2px; }
.dfd-close-btn {
  background: rgba(255, 255, 255, .15); border: none; cursor: pointer;
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; color: #fff;
  transition: background .15s; flex-shrink: 0;
}
.dfd-close-btn:hover { background: rgba(255, 255, 255, .25); }

/* ── Body ── */
.dfd-body { flex: 1; overflow-y: auto; padding: 28px 24px; }

.dfd-field-label { font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 8px; }
.dfd-panel--dark .dfd-field-label { color: #d1d5db; }

.dfd-color-row { display: flex; align-items: center; gap: 10px; }
.dfd-color-swatch {
  width: 40px; height: 40px; border-radius: 10px; border: 1.5px solid #e5e7eb;
  cursor: pointer; padding: 2px; flex-shrink: 0;
}

.dfd-field :deep(.v-field) { border: 1.5px solid #e5e7eb !important; border-radius: 11px !important; box-shadow: none !important; }
.dfd-field :deep(.v-field__outline) { display: none; }
.dfd-field :deep(.v-field--focused) { border-color: #ff3131 !important; box-shadow: 0 0 0 3px rgba(255, 49, 49, .1) !important; }
.dfd-panel--dark .dfd-field :deep(.v-field) { background: #1f2937 !important; border-color: #4b5563 !important; }
.dfd-panel--dark .dfd-field :deep(.v-field input),
.dfd-panel--dark .dfd-field :deep(.v-field__input) { color: #f3f4f6 !important; }
.dfd-star { color: #ff3131; }

/* ── Footer ── */
.dfd-footer {
  flex-shrink: 0; display: flex; gap: 10px; justify-content: flex-end;
  padding: 14px 20px; border-top: 1px solid #e5e7eb; background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, .06);
}
.dfd-panel--dark .dfd-footer { background: #1f2937; border-top-color: #374151; }

.dfd-fbtn {
  display: inline-flex; align-items: center; gap: 6px; padding: 0 20px; height: 40px;
  border-radius: 50px; font-size: 13.5px; font-weight: 600; cursor: pointer; border: none; transition: all .2s;
}
.dfd-fbtn--cancel { background: #f3f4f6; color: #374151; }
.dfd-fbtn--cancel:hover { background: #e5e7eb; }
.dfd-fbtn--primary { background: #ff3131; color: #fff; }
.dfd-fbtn--primary:hover { box-shadow: 0 4px 12px rgba(255, 49, 49, .35); }
.dfd-fbtn:disabled { opacity: .5; cursor: not-allowed; }

/* ── Transition ── */
.dfd-slide-enter-active, .dfd-slide-leave-active { transition: opacity 0.25s ease; }
.dfd-slide-enter-active .dfd-panel, .dfd-slide-leave-active .dfd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.dfd-slide-enter-from, .dfd-slide-leave-to { opacity: 0; }
.dfd-slide-enter-from .dfd-panel, .dfd-slide-leave-to .dfd-panel { transform: translateX(100%); }
</style>
