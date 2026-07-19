<template>
  <Teleport to="body">
    <Transition name="ifd-slide">
      <div v-if="modelValue" class="ifd-overlay" @mousedown.self="close">
        <div class="ifd-panel" :class="{'ifd-panel--dark': isDark}">

          <!-- ── Header gradient ── -->
          <div class="ifd-header">
            <div class="ifd-header__icon">
              <Factory :size="20" color="white" />
            </div>
            <div class="ifd-header__text">
              <div class="ifd-header__title">{{ mode === 'edit' ? t('industrialList.dialogEditTitle') : t('industrialList.dialogCreateTitle') }}</div>
              <div class="ifd-header__sub">{{ mode === 'edit' ? t('industrialList.dialogEditSubtitle') : t('industrialList.dialogCreateSubtitle') }}</div>
            </div>
            <button class="ifd-close-btn" @click="close"><X :size="16" /></button>
          </div>

          <!-- ── Body ── -->
          <div class="ifd-body">
            <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-5">
              {{ error }}
            </v-alert>

            <div class="ifd-field-label">{{ t('industrialList.labelName') }}</div>
            <v-text-field
              v-model="form.name"
              class="ifd-field"
              density="compact"
              variant="outlined"
              hide-details="auto"
              :placeholder="t('industrialList.namePlaceholder')"
            />
          </div>

          <!-- ── Footer ── -->
          <div class="ifd-footer">
            <button class="ifd-fbtn ifd-fbtn--cancel" @click="close">
              {{ t('industrialList.cancel') }}
            </button>
            <button class="ifd-fbtn ifd-fbtn--primary" :disabled="loading" @click="submit">
              <Save :size="14" />
              {{ loading ? t('industrialList.saving') : (mode === 'edit' ? t('industrialList.save') : t('industrialList.create')) }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Save, Factory } from 'lucide-vue-next';
import { createIndustrial, updateIndustrial } from '@/api/endpoints/industrial.api';

export default {
  name: 'IndustrialFormDrawer',
  components: { X, Save, Factory },
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
      if (!name) { this.error = this.t('industrialList.nameRequired'); return; }

      this.loading = true;
      try {
        const payload = { name };
        if (this.mode === 'edit') {
          if (!this.form.id) { this.error = this.t('industrialList.missingId'); return; }
          await updateIndustrial(this.form.id, payload);
          await this.$store.dispatch('industrials/updateIndustrial', { id: this.form.id, ...payload });
          this.$emit('saved', { id: this.form.id, ...payload });
        } else {
          const response = await createIndustrial(payload);
          const created = response?.data || response;
          const id = created?.id || created?._id;
          if (id) {
            await this.$store.dispatch('industrials/addIndustrial', { ...created, id });
            this.$emit('saved', { ...created, id });
          }
        }
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('industrialList.saveError');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.ifd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

.ifd-panel {
  width: 480px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}

.ifd-panel--dark {
  background: #111827;
  border-left-color: #374151;
  color: #f9fafb;
}

/* ── Gradient header ── */
.ifd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.ifd-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ifd-header__text { flex: 1; min-width: 0; }
.ifd-header__title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  line-height: 1.3;
}
.ifd-header__sub {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin-top: 2px;
}
.ifd-close-btn {
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
.ifd-close-btn:hover { background: rgba(255, 255, 255, .25); }

/* ── Body ── */
.ifd-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
}

.ifd-field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}
.ifd-panel--dark .ifd-field-label { color: #d1d5db; }

/* Styled input */
.ifd-field :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
}
.ifd-field :deep(.v-field__outline) { display: none; }
.ifd-field :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1) !important;
}
.ifd-panel--dark .ifd-field :deep(.v-field) {
  border-color: #374151 !important;
  background: #1f2937 !important;
}
.ifd-panel--dark .ifd-field :deep(.v-field input) { color: #f9fafb; }

/* ── Footer ── */
.ifd-footer {
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
.ifd-panel--dark .ifd-footer {
  border-top-color: #374151;
  background: #1a2332;
}

.ifd-fbtn {
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
.ifd-fbtn--cancel { background: #f3f4f6; color: #374151; }
.ifd-fbtn--cancel:hover { background: #e5e7eb; }
.ifd-fbtn--primary { background: #ff3131; color: #fff; }
.ifd-fbtn--primary:hover { box-shadow: 0 4px 12px rgba(255, 49, 49, .35); }
.ifd-fbtn:disabled { opacity: .5; cursor: not-allowed; }
.ifd-panel--dark .ifd-fbtn--cancel { background: #374151; color: #d1d5db; }

/* ── Transitions ── */
.ifd-slide-enter-active,
.ifd-slide-leave-active { transition: opacity 0.25s ease; }
.ifd-slide-enter-active .ifd-panel,
.ifd-slide-leave-active .ifd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.ifd-slide-enter-from,
.ifd-slide-leave-to { opacity: 0; }
.ifd-slide-enter-from .ifd-panel,
.ifd-slide-leave-to .ifd-panel { transform: translateX(100%); }
</style>
