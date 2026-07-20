<template>
  <Teleport to="body">
    <Transition name="ptfd-slide">
      <div v-if="modelValue" class="ptfd-overlay" @mousedown.self="close">
        <div class="ptfd-panel" :class="{'ptfd-panel--dark': isDark}">

          <!-- Gradient header -->
          <div class="ptfd-header">
            <div class="ptfd-header__icon">
              <Tag :size="20" color="#fff" />
            </div>
            <div class="ptfd-header__text">
              <div class="ptfd-header__title">{{ mode === 'edit' ? t('productTypeList.dialogEditTitle') : t('productTypeList.dialogCreateTitle') }}</div>
              <div class="ptfd-header__subtitle">{{ mode === 'edit' ? t('productTypeList.dialogEditSubtitle') : t('productTypeList.dialogCreateSubtitle') }}</div>
            </div>
            <button class="ptfd-close-btn" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="ptfd-body">
            <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-5">
              {{ error }}
            </v-alert>

            <div class="ptfd-field-label">{{ t('productTypeList.labelName') }}</div>
            <v-text-field
              v-model="form.name"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              :placeholder="t('productTypeList.namePlaceholder')"
              prepend-inner-icon="mdi-tag-outline"
              class="ptfd-field"
            />
          </div>

          <!-- Footer -->
          <div class="ptfd-footer">
            <button class="ptfd-fbtn ptfd-fbtn--cancel" @click="close">
              {{ t('productTypeList.cancel') }}
            </button>
            <button
              class="ptfd-fbtn ptfd-fbtn--primary"
              :disabled="loading"
              @click="submit"
            >
              <Save :size="15" />
              {{ mode === 'edit' ? t('productTypeList.save') : t('productTypeList.create') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Save, Tag } from 'lucide-vue-next';
import { createProductType, updateProductType } from '@/api/endpoints/product.api';

export default {
  name: 'ProductTypeFormDrawer',
  components: { X, Save, Tag },
  props: {
    modelValue: { type: Boolean, default: false },
    mode: { type: String, default: 'create' },
    initialData: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'saved'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      form: { id: '', name: '' },
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
          };
        } else {
          this.form = { id: '', name: '' };
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
      if (!name) { this.error = this.t('productTypeList.nameRequired'); return; }

      this.loading = true;
      try {
        const payload = { name };
        if (this.mode === 'edit') {
          if (!this.form.id) { this.error = this.t('productTypeList.missingId'); return; }
          await updateProductType(this.form.id, payload);
          await this.$store.dispatch('productTypes/updateProductType', { id: this.form.id, ...payload });
          this.$emit('saved', { id: this.form.id, ...payload });
        } else {
          const response = await createProductType(payload);
          const created = response?.data || response;
          const id = created?.id || created?._id;
          if (id) {
            await this.$store.dispatch('productTypes/addProductType', { ...created, id });
            this.$emit('saved', { ...created, id });
          }
        }
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('productTypeList.saveError');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.ptfd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

/* ── Panel ── */
.ptfd-panel {
  width: 480px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}
.ptfd-panel--dark {
  background: #111827;
  border-left-color: #374151;
  color: #f9fafb;
}

/* ── Gradient header ── */
.ptfd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.ptfd-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ptfd-header__text {
  flex: 1;
  min-width: 0;
}
.ptfd-header__title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}
.ptfd-header__subtitle {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin-top: 2px;
}
.ptfd-close-btn {
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
.ptfd-close-btn:hover {
  background: rgba(255, 255, 255, .25);
}

/* ── Body ── */
.ptfd-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
}

.ptfd-field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}
.ptfd-panel--dark .ptfd-field-label {
  color: #d1d5db;
}

/* styled field */
.ptfd-field :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
}
.ptfd-field :deep(.v-field__outline) {
  display: none;
}
.ptfd-field :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1) !important;
}

/* ── Footer ── */
.ptfd-footer {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, .06);
}
.ptfd-panel--dark .ptfd-footer {
  background: #1a2332;
  border-top-color: #374151;
}

.ptfd-fbtn {
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
.ptfd-fbtn--cancel {
  background: #f3f4f6;
  color: #374151;
}
.ptfd-fbtn--cancel:hover {
  background: #e5e7eb;
}
.ptfd-fbtn--primary {
  background: #ff3131;
  color: #fff;
}
.ptfd-fbtn--primary:hover {
  box-shadow: 0 4px 12px rgba(255, 49, 49, .35);
}
.ptfd-fbtn:disabled {
  opacity: .5;
  cursor: not-allowed;
}

/* ── Transition ── */
.ptfd-slide-enter-active,
.ptfd-slide-leave-active {
  transition: opacity 0.25s ease;
}
.ptfd-slide-enter-active .ptfd-panel,
.ptfd-slide-leave-active .ptfd-panel {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.ptfd-slide-enter-from,
.ptfd-slide-leave-to {
  opacity: 0;
}
.ptfd-slide-enter-from .ptfd-panel,
.ptfd-slide-leave-to .ptfd-panel {
  transform: translateX(100%);
}
</style>
