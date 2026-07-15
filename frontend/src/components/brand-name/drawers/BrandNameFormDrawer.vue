<template>
  <Teleport to="body">
    <Transition name="bnfd-slide">
      <div v-if="modelValue" class="bnfd-overlay" @mousedown.self="close">
        <div class="bnfd-panel" :class="{'bnfd-panel--dark': isDark}">

          <!-- ── Header gradient ── -->
          <div class="bnfd-header">
            <div class="bnfd-header__icon">
              <Tag :size="20" color="white" />
            </div>
            <div class="bnfd-header__text">
              <div class="bnfd-header__title">{{ mode === 'edit' ? t('brandNameList.dialogEditTitle') : t('brandNameList.dialogCreateTitle') }}</div>
              <div class="bnfd-header__sub">{{ mode === 'edit' ? t('brandNameList.dialogEditSubtitle') : t('brandNameList.dialogCreateSubtitle') }}</div>
            </div>
            <button class="bnfd-close-btn" @click="close"><X :size="16" /></button>
          </div>

          <!-- ── Body ── -->
          <div class="bnfd-body">
            <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-5">
              {{ error }}
            </v-alert>

            <div class="bnfd-field-label">{{ t('brandNameList.labelName') }}</div>
            <v-text-field
              v-model="form.name"
              class="bnfd-field"
              density="compact"
              variant="outlined"
              hide-details="auto"
              :placeholder="t('brandNameList.namePlaceholder')"
            />
          </div>

          <!-- ── Footer ── -->
          <div class="bnfd-footer">
            <button class="bnfd-fbtn bnfd-fbtn--cancel" @click="close">
              {{ t('brandNameList.cancel') }}
            </button>
            <button class="bnfd-fbtn bnfd-fbtn--primary" :disabled="loading" @click="submit">
              <Save :size="14" />
              {{ loading ? 'Sauvegarde…' : (mode === 'edit' ? t('brandNameList.save') : t('brandNameList.create')) }}
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
import { createBrandName, updateBrandName } from '@/api/endpoints/brand-name.api';

export default {
  name: 'BrandNameFormDrawer',
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
          await updateBrandName(this.form.id, payload);
          await this.$store.dispatch('brandNames/updateBrandName', { id: this.form.id, ...payload });
          this.$emit('saved', { id: this.form.id, ...payload });
        } else {
          const response = await createBrandName(payload);
          const created = response?.data || response;
          const id = created?.id || created?._id;
          if (id) {
            await this.$store.dispatch('brandNames/addBrandName', { ...created, id });
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
.bnfd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

.bnfd-panel {
  width: 480px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}

.bnfd-panel--dark {
  background: #111827;
  border-left-color: #374151;
  color: #f9fafb;
}

/* ── Gradient header ── */
.bnfd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.bnfd-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.bnfd-header__text { flex: 1; min-width: 0; }
.bnfd-header__title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  line-height: 1.3;
}
.bnfd-header__sub {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin-top: 2px;
}
.bnfd-close-btn {
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
  flex-shrink: 0;
  transition: background .15s;
}
.bnfd-close-btn:hover { background: rgba(255, 255, 255, .25); }

/* ── Body ── */
.bnfd-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
}

.bnfd-field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}
.bnfd-panel--dark .bnfd-field-label { color: #d1d5db; }

/* Styled input */
.bnfd-field :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
}
.bnfd-field :deep(.v-field__outline) { display: none; }
.bnfd-field :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1) !important;
}
.bnfd-panel--dark .bnfd-field :deep(.v-field) {
  border-color: #374151 !important;
  background: #1f2937 !important;
}
.bnfd-panel--dark .bnfd-field :deep(.v-field input) { color: #f9fafb; }

/* ── Footer ── */
.bnfd-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, .06);
}
.bnfd-panel--dark .bnfd-footer {
  border-top-color: #374151;
  background: #1a2332;
}

.bnfd-fbtn {
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
.bnfd-fbtn--cancel { background: #f3f4f6; color: #374151; }
.bnfd-fbtn--cancel:hover { background: #e5e7eb; }
.bnfd-fbtn--primary { background: #ff3131; color: #fff; }
.bnfd-fbtn--primary:hover { box-shadow: 0 4px 12px rgba(255, 49, 49, .35); }
.bnfd-fbtn:disabled { opacity: .5; cursor: not-allowed; }
.bnfd-panel--dark .bnfd-fbtn--cancel { background: #374151; color: #d1d5db; }

/* ── Transitions ── */
.bnfd-slide-enter-active,
.bnfd-slide-leave-active { transition: opacity 0.25s ease; }
.bnfd-slide-enter-active .bnfd-panel,
.bnfd-slide-leave-active .bnfd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.bnfd-slide-enter-from,
.bnfd-slide-leave-to { opacity: 0; }
.bnfd-slide-enter-from .bnfd-panel,
.bnfd-slide-leave-to .bnfd-panel { transform: translateX(100%); }
</style>
