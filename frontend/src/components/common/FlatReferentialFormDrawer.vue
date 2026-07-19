<template>
  <Teleport to="body">
    <Transition name="frfd-slide">
      <div v-if="modelValue" class="frfd-overlay" @mousedown.self="close">
        <div class="frfd-panel" :class="{'frfd-panel--dark': isDark}">

          <!-- ── Header gradient ── -->
          <div class="frfd-header">
            <div class="frfd-header__icon">
              <component :is="icon" :size="20" color="white" />
            </div>
            <div class="frfd-header__text">
              <div class="frfd-header__title">{{ mode === 'edit' ? t(`${i18nPrefix}.dialogEditTitle`) : t(`${i18nPrefix}.dialogCreateTitle`) }}</div>
              <div class="frfd-header__sub">{{ mode === 'edit' ? t(`${i18nPrefix}.dialogEditSubtitle`) : t(`${i18nPrefix}.dialogCreateSubtitle`) }}</div>
            </div>
            <button class="frfd-close-btn" @click="close"><X :size="16" /></button>
          </div>

          <!-- ── Body ── -->
          <div class="frfd-body">
            <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="mb-5">
              {{ error }}
            </v-alert>

            <div class="frfd-field-label">{{ t(`${i18nPrefix}.labelName`) }}</div>
            <v-text-field
              v-model="form.name"
              class="frfd-field"
              density="compact"
              variant="outlined"
              hide-details="auto"
              :placeholder="t(`${i18nPrefix}.namePlaceholder`)"
            />
          </div>

          <!-- ── Footer ── -->
          <div class="frfd-footer">
            <button class="frfd-fbtn frfd-fbtn--cancel" @click="close">
              {{ t(`${i18nPrefix}.cancel`) }}
            </button>
            <button class="frfd-fbtn frfd-fbtn--primary" :disabled="loading" @click="submit">
              <Save :size="14" />
              {{ loading ? t(`${i18nPrefix}.saving`) : (mode === 'edit' ? t(`${i18nPrefix}.save`) : t(`${i18nPrefix}.create`)) }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Save } from 'lucide-vue-next';

// BUG-165: generic replacement for BrandNameFormDrawer / DisplayNameFormDrawer /
// IndustrialFormDrawer / PackingTypeFormDrawer, which were byte-for-byte identical apart from
// their CSS class prefix, header icon, i18n namespace and api client. Those 4 components now wrap
// this one (each supplying its own icon + `createFn`/`updateFn` + Vuex action/module names).
export default {
  name: 'FlatReferentialFormDrawer',
  components: { X, Save },
  props: {
    modelValue: { type: Boolean, default: false },
    mode: { type: String, default: 'create' },
    initialData: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
    // i18n key prefix for this entity's screen, e.g. 'brandNameList'.
    i18nPrefix: { type: String, required: true },
    // Header icon component, e.g. Tag / Factory / Box (lucide-vue-next).
    icon: { type: [Object, Function], required: true },
    // Vuex module namespace, e.g. 'brandNames'.
    storeModule: { type: String, required: true },
    // Vuex action names within `storeModule`, e.g. 'addBrandName' / 'updateBrandName'.
    addAction: { type: String, required: true },
    updateAction: { type: String, required: true },
    // api/endpoints/*.api.js create/update functions for this entity.
    createFn: { type: Function, required: true },
    updateFn: { type: Function, required: true },
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
      if (!name) { this.error = this.t(`${this.i18nPrefix}.nameRequired`); return; }

      this.loading = true;
      try {
        const payload = { name };
        if (this.mode === 'edit') {
          if (!this.form.id) { this.error = this.t(`${this.i18nPrefix}.missingId`); return; }
          await this.updateFn(this.form.id, payload);
          await this.$store.dispatch(`${this.storeModule}/${this.updateAction}`, { id: this.form.id, ...payload });
          this.$emit('saved', { id: this.form.id, ...payload });
        } else {
          const response = await this.createFn(payload);
          const created = response?.data || response;
          const id = created?.id || created?._id;
          if (id) {
            await this.$store.dispatch(`${this.storeModule}/${this.addAction}`, { ...created, id });
            this.$emit('saved', { ...created, id });
          }
        }
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t(`${this.i18nPrefix}.saveError`);
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.frfd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

.frfd-panel {
  width: 480px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}

.frfd-panel--dark {
  background: #111827;
  border-left-color: #374151;
  color: #f9fafb;
}

/* ── Gradient header ── */
.frfd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.frfd-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.frfd-header__text { flex: 1; min-width: 0; }
.frfd-header__title {
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  line-height: 1.3;
}
.frfd-header__sub {
  font-size: 12.5px;
  color: rgba(255, 255, 255, .72);
  margin-top: 2px;
}
.frfd-close-btn {
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
.frfd-close-btn:hover { background: rgba(255, 255, 255, .25); }

/* ── Body ── */
.frfd-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
}

.frfd-field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}
.frfd-panel--dark .frfd-field-label { color: #d1d5db; }

/* Styled input */
.frfd-field :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
}
.frfd-field :deep(.v-field__outline) { display: none; }
.frfd-field :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1) !important;
}
.frfd-panel--dark .frfd-field :deep(.v-field) {
  border-color: #374151 !important;
  background: #1f2937 !important;
}
.frfd-panel--dark .frfd-field :deep(.v-field input) { color: #f9fafb; }

/* ── Footer ── */
.frfd-footer {
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
.frfd-panel--dark .frfd-footer {
  border-top-color: #374151;
  background: #1a2332;
}

.frfd-fbtn {
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
.frfd-fbtn--cancel { background: #f3f4f6; color: #374151; }
.frfd-fbtn--cancel:hover { background: #e5e7eb; }
.frfd-fbtn--primary { background: #ff3131; color: #fff; }
.frfd-fbtn--primary:hover { box-shadow: 0 4px 12px rgba(255, 49, 49, .35); }
.frfd-fbtn:disabled { opacity: .5; cursor: not-allowed; }
.frfd-panel--dark .frfd-fbtn--cancel { background: #374151; color: #d1d5db; }

/* ── Transitions ── */
.frfd-slide-enter-active,
.frfd-slide-leave-active { transition: opacity 0.25s ease; }
.frfd-slide-enter-active .frfd-panel,
.frfd-slide-leave-active .frfd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.frfd-slide-enter-from,
.frfd-slide-leave-to { opacity: 0; }
.frfd-slide-enter-from .frfd-panel,
.frfd-slide-leave-to .frfd-panel { transform: translateX(100%); }
</style>
