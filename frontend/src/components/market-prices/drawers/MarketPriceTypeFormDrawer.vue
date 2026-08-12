<template>
  <Teleport to="body">
    <Transition name="mptfd-slide">
      <div v-if="modelValue" class="mptfd-overlay" @mousedown.self="close">
        <div class="mptfd-panel" :class="{'mptfd-panel--dark': isDark}">

          <!-- Gradient header -->
          <div class="mptfd-header">
            <div class="mptfd-header__icon">
              <Tag :size="20" color="#fff" />
            </div>
            <div class="mptfd-header__text">
              <div class="mptfd-header__title">{{ mode === 'edit' ? t('marketPriceTypeList.dialogEditTitle') : t('marketPriceTypeList.dialogCreateTitle') }}</div>
              <div class="mptfd-header__subtitle">{{ mode === 'edit' ? t('marketPriceTypeList.dialogEditSubtitle') : t('marketPriceTypeList.dialogCreateSubtitle') }}</div>
            </div>
            <button class="mptfd-close-btn" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Barre d'erreur : juste sous le header, hors zone scrollable, toujours visible. -->
          <div v-if="error" class="mptfd-error">
            <span>{{ error }}</span>
            <button class="mptfd-error__close" :aria-label="t('marketPriceTypeList.cancel')" @click="error = ''"><X :size="14" /></button>
          </div>

          <!-- Body -->
          <div class="mptfd-body">
            <div class="mptfd-field-label">{{ t('marketPriceTypeList.labelName') }} <span class="mptfd-star">*</span></div>
            <v-text-field
              v-model="form.name"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              :placeholder="t('marketPriceTypeList.namePlaceholder')"
              class="mptfd-field"
            />
          </div>

          <!-- Footer -->
          <div class="mptfd-footer">
            <button class="mptfd-fbtn mptfd-fbtn--cancel" @click="close">
              {{ t('marketPriceTypeList.cancel') }}
            </button>
            <button
              class="mptfd-fbtn mptfd-fbtn--primary"
              :disabled="loading"
              @click="submit"
            >
              <Save :size="15" />
              {{ mode === 'edit' ? t('marketPriceTypeList.save') : t('marketPriceTypeList.create') }}
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
import { createMarketPriceType, updateMarketPriceType } from '@/api/endpoints/market.price.api';

export default {
  name: 'MarketPriceTypeFormDrawer',
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
      if (!name) { this.error = this.t('marketPriceTypeList.nameRequired'); return; }

      this.loading = true;
      try {
        const payload = { name };
        if (this.mode === 'edit') {
          if (!this.form.id) { this.error = this.t('marketPriceTypeList.missingId'); return; }
          await updateMarketPriceType(this.form.id, payload);
          await this.$store.dispatch('marketPriceTypes/updateMarketPriceType', { id: this.form.id, ...payload });
          this.$emit('saved', { id: this.form.id, ...payload });
        } else {
          const response = await createMarketPriceType(payload);
          const created = response?.data || response;
          const id = created?.id || created?._id;
          if (id) {
            await this.$store.dispatch('marketPriceTypes/addMarketPriceType', { ...created, id });
            this.$emit('saved', { ...created, id });
          }
        }
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('marketPriceTypeList.saveError');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.mptfd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

/* ── Panel ── */
.mptfd-panel {
  width: 480px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}
.mptfd-panel--dark {
  background: #111827;
  border-left-color: #374151;
  color: #f9fafb;
}

/* ── Gradient header ── */
.mptfd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.mptfd-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.mptfd-header__text {
  flex: 1;
  min-width: 0;
}
.mptfd-header__title {
  font-size: var(--fs-lg);
  font-weight: 700;
  color: #fff;
}
.mptfd-header__subtitle {
  font-size: var(--fs-sm);
  color: rgba(255, 255, 255, .72);
  margin-top: 2px;
}
.mptfd-close-btn {
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
.mptfd-close-btn:hover {
  background: rgba(255, 255, 255, .25);
}

/* ── Body ── */
.mptfd-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
}

.mptfd-field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}
.mptfd-panel--dark .mptfd-field-label {
  color: #d1d5db;
}

/* styled field */
.mptfd-field :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
}
.mptfd-field :deep(.v-field__outline) {
  display: none;
}
.mptfd-field :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1) !important;
}

/* BUG-273 : barre d'erreur fixe, entre le corps scrollable et le footer. */
.mptfd-error {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 9px 16px;
  background: #fef2f2;
  border-bottom: 1px solid #fecaca;
  color: #ff3131;
  font-size: 0.8125rem;
  line-height: 1.35;
}
.mptfd-panel--dark .mptfd-error { background: rgba(255, 49, 49, .12); border-bottom-color: rgba(255, 49, 49, .3); color: #f87171; }
.mptfd-error__close {
  margin-left: auto;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: .7;
  transition: opacity .15s, background .15s;
}
.mptfd-error__close:hover { opacity: 1; background: rgba(255, 49, 49, .14); }

/* ── Footer ── */
.mptfd-footer {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, .06);
}
.mptfd-panel--dark .mptfd-footer {
  background: #1a2332;
  border-top-color: #374151;
}

.mptfd-fbtn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
  height: 40px;
  border-radius: 50px;
  font-size: var(--fs-base);
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all .2s;
}
.mptfd-fbtn--cancel {
  background: #f3f4f6;
  color: #374151;
}
.mptfd-fbtn--cancel:hover {
  background: #e5e7eb;
}
.mptfd-fbtn--primary {
  background: #ff3131;
  color: #fff;
}
.mptfd-fbtn--primary:hover {
  box-shadow: 0 4px 12px rgba(255, 49, 49, .35);
}
.mptfd-fbtn:disabled {
  opacity: .5;
  cursor: not-allowed;
}

/* Dark mode — compléments (champ + bouton Cancel) + étoile required */
.mptfd-panel--dark .mptfd-field :deep(.v-field) { border-color: #374151 !important; background: #1f2937 !important; }
.mptfd-panel--dark .mptfd-field :deep(.v-field input),
.mptfd-panel--dark .mptfd-field :deep(.v-field__input) { color: #f9fafb; }
.mptfd-panel--dark .mptfd-fbtn--cancel { background: #374151; color: #d1d5db; }
.mptfd-panel--dark .mptfd-fbtn--cancel:hover { background: #4b5563; }
.mptfd-star { color: #ff3131; }

/* ── Transition ── */
.mptfd-slide-enter-active,
.mptfd-slide-leave-active {
  transition: opacity 0.25s ease;
}
.mptfd-slide-enter-active .mptfd-panel,
.mptfd-slide-leave-active .mptfd-panel {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.mptfd-slide-enter-from,
.mptfd-slide-leave-to {
  opacity: 0;
}
.mptfd-slide-enter-from .mptfd-panel,
.mptfd-slide-leave-to .mptfd-panel {
  transform: translateX(100%);
}
</style>
