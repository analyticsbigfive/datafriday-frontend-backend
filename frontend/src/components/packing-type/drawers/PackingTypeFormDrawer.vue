<template>
  <Teleport to="body">
    <Transition name="pkfd-slide">
      <div v-if="modelValue" class="pkfd-overlay" @mousedown.self="close">
        <div class="pkfd-panel" :class="{'pkfd-panel--dark': isDark}">

          <!-- ── Header gradient ── -->
          <div class="pkfd-header">
            <div class="pkfd-header__icon">
              <Box :size="20" color="white" />
            </div>
            <div class="pkfd-header__text">
              <div class="pkfd-header__title">{{ mode === 'edit' ? t('packingTypeList.dialogEditTitle') : t('packingTypeList.dialogCreateTitle') }}</div>
              <div class="pkfd-header__sub">{{ mode === 'edit' ? t('packingTypeList.dialogEditSubtitle') : t('packingTypeList.dialogCreateSubtitle') }}</div>
            </div>
            <button class="pkfd-close-btn" @click="close"><X :size="16" /></button>
          </div>

          <!-- ── Body ── -->
          <div class="pkfd-body">
            <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-5">
              {{ error }}
            </v-alert>

            <div class="pkfd-field-label">{{ t('packingTypeList.labelName') }}</div>
            <v-text-field
              v-model="form.name"
              class="pkfd-field"
              density="compact"
              variant="outlined"
              hide-details="auto"
              :placeholder="t('packingTypeList.namePlaceholder')"
            />
          </div>

          <!-- ── Footer ── -->
          <div class="pkfd-footer">
            <button class="pkfd-fbtn pkfd-fbtn--cancel" @click="close">
              {{ t('packingTypeList.cancel') }}
            </button>
            <button class="pkfd-fbtn pkfd-fbtn--primary" :disabled="loading" @click="submit">
              <Save :size="14" />
              {{ loading ? 'Sauvegarde…' : (mode === 'edit' ? t('packingTypeList.save') : t('packingTypeList.create')) }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Save, Box } from 'lucide-vue-next';
import { createPackingType, updatePackingType } from '@/api/endpoints/packing-type.api';

export default {
  name: 'PackingTypeFormDrawer',
  components: { X, Save, Box },
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
          await updatePackingType(this.form.id, payload);
          await this.$store.dispatch('packingTypes/updatePackingType', { id: this.form.id, ...payload });
          this.$emit('saved', { id: this.form.id, ...payload });
        } else {
          const response = await createPackingType(payload);
          const created = response?.data || response;
          const id = created?.id || created?._id;
          if (id) {
            await this.$store.dispatch('packingTypes/addPackingType', { ...created, id });
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
.pkfd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

.pkfd-panel {
  width: 480px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}

.pkfd-panel--dark {
  background: #111827;
  border-left-color: #374151;
  color: #f9fafb;
}

/* ── Gradient header ── */
.pkfd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.pkfd-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pkfd-header__text { flex: 1; min-width: 0; }
.pkfd-header__title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  line-height: 1.3;
}
.pkfd-header__sub {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin-top: 2px;
}
.pkfd-close-btn {
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
.pkfd-close-btn:hover { background: rgba(255, 255, 255, .25); }

/* ── Body ── */
.pkfd-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
}

.pkfd-field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}
.pkfd-panel--dark .pkfd-field-label { color: #d1d5db; }

/* Styled input */
.pkfd-field :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
}
.pkfd-field :deep(.v-field__outline) { display: none; }
.pkfd-field :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1) !important;
}
.pkfd-panel--dark .pkfd-field :deep(.v-field) {
  border-color: #374151 !important;
  background: #1f2937 !important;
}
.pkfd-panel--dark .pkfd-field :deep(.v-field input) { color: #f9fafb; }

/* ── Footer ── */
.pkfd-footer {
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
.pkfd-panel--dark .pkfd-footer {
  border-top-color: #374151;
  background: #1a2332;
}

.pkfd-fbtn {
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
.pkfd-fbtn--cancel { background: #f3f4f6; color: #374151; }
.pkfd-fbtn--cancel:hover { background: #e5e7eb; }
.pkfd-fbtn--primary { background: #ff3131; color: #fff; }
.pkfd-fbtn--primary:hover { box-shadow: 0 4px 12px rgba(255, 49, 49, .35); }
.pkfd-fbtn:disabled { opacity: .5; cursor: not-allowed; }
.pkfd-panel--dark .pkfd-fbtn--cancel { background: #374151; color: #d1d5db; }

/* ── Transitions ── */
.pkfd-slide-enter-active,
.pkfd-slide-leave-active { transition: opacity 0.25s ease; }
.pkfd-slide-enter-active .pkfd-panel,
.pkfd-slide-leave-active .pkfd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.pkfd-slide-enter-from,
.pkfd-slide-leave-to { opacity: 0; }
.pkfd-slide-enter-from .pkfd-panel,
.pkfd-slide-leave-to .pkfd-panel { transform: translateX(100%); }
</style>
