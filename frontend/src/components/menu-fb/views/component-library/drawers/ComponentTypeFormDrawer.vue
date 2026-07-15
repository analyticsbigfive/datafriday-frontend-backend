<template>
  <Teleport to="body">
    <Transition name="ctfd-slide">
      <div v-if="modelValue" class="ctfd-overlay" @mousedown.self="close">
        <div class="ctfd-panel" :class="{'ctfd-panel--dark': isDark}">

          <!-- Gradient header -->
          <div class="ctfd-header">
            <div class="ctfd-header__icon">
              <Tag :size="20" color="#fff" />
            </div>
            <div class="ctfd-header__text">
              <div class="ctfd-header__title">{{ mode === 'edit' ? t('componentTypeList.dialogEditTitle') : t('componentTypeList.dialogCreateTitle') }}</div>
              <div class="ctfd-header__subtitle">{{ mode === 'edit' ? t('componentTypeList.dialogEditSubtitle') : t('componentTypeList.dialogCreateSubtitle') }}</div>
            </div>
            <button class="ctfd-close-btn" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="ctfd-body">
            <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-5">
              {{ error }}
            </v-alert>

            <div class="ctfd-field-label">{{ t('componentTypeList.labelName') }}</div>
            <v-text-field
              v-model="form.name"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              :placeholder="t('componentTypeList.namePlaceholder')"
              prepend-inner-icon="mdi-tag-outline"
              class="ctfd-field"
            />
          </div>

          <!-- Footer -->
          <div class="ctfd-footer">
            <button class="ctfd-fbtn ctfd-fbtn--cancel" @click="close">
              {{ t('componentTypeList.cancel') }}
            </button>
            <button
              class="ctfd-fbtn ctfd-fbtn--primary"
              :disabled="loading"
              @click="submit"
            >
              <Save :size="15" />
              {{ mode === 'edit' ? t('componentTypeList.save') : t('componentTypeList.create') }}
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
import { createComponentType, updateComponentType } from '@/api/endpoints/menu.api';

export default {
  name: 'ComponentTypeFormDrawer',
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
      if (!name) { this.error = 'Le nom est requis'; return; }

      this.loading = true;
      try {
        const payload = { name };
        if (this.mode === 'edit') {
          if (!this.form.id) { this.error = 'Identifiant manquant'; return; }
          await updateComponentType(this.form.id, payload);
          await this.$store.dispatch('componentTypes/updateComponentType', { id: this.form.id, ...payload });
          this.$emit('saved', { id: this.form.id, ...payload });
        } else {
          const response = await createComponentType(payload);
          const created = response?.data || response;
          const id = created?.id || created?._id;
          if (id) {
            await this.$store.dispatch('componentTypes/addComponentType', { ...created, id });
            this.$emit('saved', { ...created, id });
          }
        }
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || 'Échec de la sauvegarde';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.ctfd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

/* ── Panel ── */
.ctfd-panel {
  width: 480px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}
.ctfd-panel--dark {
  background: #111827;
  border-left-color: #374151;
  color: #f9fafb;
}

/* ── Gradient header ── */
.ctfd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.ctfd-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ctfd-header__text {
  flex: 1;
  min-width: 0;
}
.ctfd-header__title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}
.ctfd-header__subtitle {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin-top: 2px;
}
.ctfd-close-btn {
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
.ctfd-close-btn:hover {
  background: rgba(255, 255, 255, .25);
}

/* ── Body ── */
.ctfd-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
}

.ctfd-field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}
.ctfd-panel--dark .ctfd-field-label {
  color: #d1d5db;
}

/* styled field */
.ctfd-field :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
}
.ctfd-field :deep(.v-field__outline) {
  display: none;
}
.ctfd-field :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1) !important;
}

/* ── Footer ── */
.ctfd-footer {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, .06);
}
.ctfd-panel--dark .ctfd-footer {
  background: #1a2332;
  border-top-color: #374151;
}

.ctfd-fbtn {
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
.ctfd-fbtn--cancel {
  background: #f3f4f6;
  color: #374151;
}
.ctfd-fbtn--cancel:hover {
  background: #e5e7eb;
}
.ctfd-fbtn--primary {
  background: #ff3131;
  color: #fff;
}
.ctfd-fbtn--primary:hover {
  box-shadow: 0 4px 12px rgba(255, 49, 49, .35);
}
.ctfd-fbtn:disabled {
  opacity: .5;
  cursor: not-allowed;
}

/* ── Transition ── */
.ctfd-slide-enter-active,
.ctfd-slide-leave-active {
  transition: opacity 0.25s ease;
}
.ctfd-slide-enter-active .ctfd-panel,
.ctfd-slide-leave-active .ctfd-panel {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.ctfd-slide-enter-from,
.ctfd-slide-leave-to {
  opacity: 0;
}
.ctfd-slide-enter-from .ctfd-panel,
.ctfd-slide-leave-to .ctfd-panel {
  transform: translateX(100%);
}
</style>
