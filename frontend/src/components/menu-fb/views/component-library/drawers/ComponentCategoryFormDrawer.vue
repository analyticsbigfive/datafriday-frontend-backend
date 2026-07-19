<template>
  <Teleport to="body">
    <Transition name="ccfd-slide">
      <div v-if="modelValue" class="ccfd-overlay" @mousedown.self="close">
        <div class="ccfd-panel" :class="{'ccfd-panel--dark': isDark}">

          <!-- Gradient header -->
          <div class="ccfd-header">
            <div class="ccfd-header__icon">
              <Shapes :size="20" color="#fff" />
            </div>
            <div class="ccfd-header__text">
              <div class="ccfd-header__title">{{ mode === 'edit' ? t('componentCategoryList.dialogEditTitle') : t('componentCategoryList.dialogCreateTitle') }}</div>
              <div class="ccfd-header__subtitle">{{ mode === 'edit' ? t('componentCategoryList.dialogEditSubtitle') : t('componentCategoryList.dialogCreateSubtitle') }}</div>
            </div>
            <button class="ccfd-close-btn" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="ccfd-body">
            <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-5">
              {{ error }}
            </v-alert>

            <div class="ccfd-field-label">{{ t('componentCategoryList.labelType') }}</div>
            <v-select
              v-model="form.typeId"
              :items="types"
              item-title="name"
              item-value="id"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              :placeholder="t('componentCategoryList.selectType')"
              :menu-props="{ zIndex: 10001 }"
              class="mb-6 ccfd-field"
            />

            <div class="ccfd-field-label">{{ t('componentCategoryList.labelName') }}</div>
            <v-text-field
              v-model="form.name"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              :placeholder="t('componentCategoryList.namePlaceholder')"
              class="ccfd-field"
            />
          </div>

          <!-- Footer -->
          <div class="ccfd-footer">
            <button class="ccfd-fbtn ccfd-fbtn--cancel" @click="close">
              {{ t('componentCategoryList.cancel') }}
            </button>
            <button
              class="ccfd-fbtn ccfd-fbtn--primary"
              :disabled="loading"
              @click="submit"
            >
              <Save :size="15" />
              {{ mode === 'edit' ? t('componentCategoryList.save') : t('componentCategoryList.create') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Save, Shapes } from 'lucide-vue-next';
import { createComponentCategory, updateComponentCategory } from '@/api/endpoints/menu.api';

export default {
  name: 'ComponentCategoryFormDrawer',
  components: { X, Save, Shapes },
  props: {
    modelValue: { type: Boolean, default: false },
    mode: { type: String, default: 'create' },
    initialData: { type: Object, default: null },
    types: { type: Array, default: () => [] },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'saved'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      form: { id: '', name: '', typeId: '' },
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
            id: this.initialData.id || this.initialData._id || '',
            name: this.initialData.name || '',
            typeId: this.initialData.typeId || this.initialData.componentTypeId || this.initialData.type || '',
          };
        } else {
          this.form = { id: '', name: '', typeId: '' };
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
      if (!name) { this.error = this.t('componentCategoryList.nameRequired'); return; }
      if (!this.form.typeId) { this.error = this.t('componentCategoryList.typeRequired'); return; }

      this.loading = true;
      try {
        const payload = { name, typeId: this.form.typeId };
        const typeName = (this.types.find(t => t.id === payload.typeId) || {}).name || '';

        if (this.mode === 'edit') {
          if (!this.form.id) { this.error = this.t('componentCategoryList.missingId'); return; }
          await updateComponentCategory(this.form.id, payload);
          await this.$store.dispatch('componentCategories/updateComponentCategory', {
            id: this.form.id, ...payload, typeName,
          });
          this.$emit('saved', { id: this.form.id, ...payload, typeName });
        } else {
          const response = await createComponentCategory(payload);
          const created = response?.data || response;
          const id = created?.id || created?._id;
          if (id) {
            await this.$store.dispatch('componentCategories/addComponentCategory', {
              ...created, id, typeId: payload.typeId, typeName,
            });
            this.$emit('saved', { ...created, id, typeId: payload.typeId, typeName });
          }
        }
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('componentCategoryList.saveError');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.ccfd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

/* ── Panel ── */
.ccfd-panel {
  width: 480px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}
.ccfd-panel--dark {
  background: #111827;
  border-left-color: #374151;
  color: #f9fafb;
}

/* ── Gradient header ── */
.ccfd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.ccfd-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ccfd-header__text {
  flex: 1;
  min-width: 0;
}
.ccfd-header__title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}
.ccfd-header__subtitle {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin-top: 2px;
}
.ccfd-close-btn {
  background: rgba(255, 255, 255, .15);
  border: none;
  cursor: pointer;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: background .15s;
  flex-shrink: 0;
}
.ccfd-close-btn:hover {
  background: rgba(255, 255, 255, .25);
}

/* ── Body ── */
.ccfd-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
}

.ccfd-field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}
.ccfd-panel--dark .ccfd-field-label {
  color: #d1d5db;
}

/* styled fields */
.ccfd-field :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
}
.ccfd-field :deep(.v-field__outline) {
  display: none;
}
.ccfd-field :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1) !important;
}

/* ── Footer ── */
.ccfd-footer {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, .06);
}
.ccfd-panel--dark .ccfd-footer {
  background: #1a2332;
  border-top-color: #374151;
}

.ccfd-fbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
  height: 40px;
  border-radius: 50px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all .2s;
}
.ccfd-fbtn--cancel {
  background: #f3f4f6;
  color: #374151;
}
.ccfd-fbtn--cancel:hover {
  background: #e5e7eb;
}
.ccfd-fbtn--primary {
  background: #ff3131;
  color: #fff;
}
.ccfd-fbtn--primary:hover {
  box-shadow: 0 4px 12px rgba(255, 49, 49, .35);
}
.ccfd-fbtn:disabled {
  opacity: .5;
  cursor: not-allowed;
}

/* ── Transition ── */
.ccfd-slide-enter-active,
.ccfd-slide-leave-active {
  transition: opacity 0.25s ease;
}
.ccfd-slide-enter-active .ccfd-panel,
.ccfd-slide-leave-active .ccfd-panel {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.ccfd-slide-enter-from,
.ccfd-slide-leave-to {
  opacity: 0;
}
.ccfd-slide-enter-from .ccfd-panel,
.ccfd-slide-leave-to .ccfd-panel {
  transform: translateX(100%);
}
</style>
