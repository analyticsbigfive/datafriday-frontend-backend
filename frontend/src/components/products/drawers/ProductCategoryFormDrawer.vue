<template>
  <Teleport to="body">
    <Transition name="pcfd-slide">
      <div v-if="modelValue" class="pcfd-overlay" @mousedown.self="close">
        <div class="pcfd-panel" :class="{'pcfd-panel--dark': isDark}">

          <!-- Gradient header -->
          <div class="pcfd-header">
            <div class="pcfd-header__icon">
              <Shapes :size="20" color="#fff" />
            </div>
            <div class="pcfd-header__text">
              <div class="pcfd-header__title">{{ mode === 'edit' ? t('productCategoryList.dialogEditTitle') : t('productCategoryList.dialogCreateTitle') }}</div>
              <div class="pcfd-header__subtitle">{{ mode === 'edit' ? t('productCategoryList.dialogEditSubtitle') : t('productCategoryList.dialogCreateSubtitle') }}</div>
            </div>
            <button class="pcfd-close-btn" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Barre d'erreur : juste sous le header, hors zone scrollable, toujours visible. -->
          <div v-if="error" class="pcfd-error">
            <span>{{ error }}</span>
            <button class="pcfd-error__close" :aria-label="t('productCategoryList.cancel')" @click="error = ''"><X :size="14" /></button>
          </div>

          <!-- Body -->
          <div class="pcfd-body">
            <div class="pcfd-field-label">{{ t('productCategoryList.labelType') }} <span class="pcfd-star">*</span></div>
            <v-select
              v-model="form.typeId"
              :items="typesWithAdd"
              item-title="name"
              item-value="id"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              :placeholder="t('productCategoryList.selectType')"
              :menu-props="{ zIndex: 10001 }"
              class="mb-6 pcfd-field"
            >
              <template #item="{ item, props }">
                <v-list-item
                  v-bind="props"
                  :style="item.raw.id === '__add_type__'
                    ? { color: '#ff3131', fontWeight: '700', borderBottom: '1px solid #f3f4f6' }
                    : {}"
                />
              </template>
            </v-select>

            <div class="pcfd-field-label">{{ t('productCategoryList.labelName') }} <span class="pcfd-star">*</span></div>
            <v-text-field
              v-model="form.name"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              :placeholder="t('productCategoryList.namePlaceholder')"
              class="pcfd-field"
            />
          </div>

          <!-- Footer -->
          <div class="pcfd-footer">
            <button class="pcfd-fbtn pcfd-fbtn--cancel" @click="close">
              {{ t('productCategoryList.cancel') }}
            </button>
            <button
              class="pcfd-fbtn pcfd-fbtn--primary"
              :disabled="loading"
              @click="submit"
            >
              <Save :size="15" />
              {{ mode === 'edit' ? t('productCategoryList.save') : t('productCategoryList.create') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Dialog création de type -->
  <v-dialog v-model="showCreateTypeDialog" max-width="420" :persistent="creatingType">
    <div class="pcfd-type-dialog">
      <div class="pcfd-type-dialog__header">
        <div class="pcfd-type-dialog__icon"><Tag :size="18" color="#fff" /></div>
        <div class="pcfd-type-dialog__text">
          <p class="pcfd-type-dialog__title">{{ t('productCategoryList.newTypeTitle') }}</p>
          <p class="pcfd-type-dialog__sub">{{ t('productCategoryList.newTypeSubtitle') }}</p>
        </div>
        <button class="pcfd-type-dialog__close" :disabled="creatingType" @click="showCreateTypeDialog = false">
          <X :size="14" />
        </button>
      </div>
      <div class="pcfd-type-dialog__body">
        <div class="pcfd-type-dialog__error" v-if="typeError">
          <AlertTriangle :size="13" /> {{ typeError }}
        </div>
        <label class="pcfd-field-label">{{ t('productCategoryList.newTypeLabel') }} <span class="pcfd-star">*</span></label>
        <input
          ref="typeInput"
          v-model="newTypeName"
          class="pcfd-type-input"
          :placeholder="t('productCategoryList.newTypePlaceholder')"
          @keydown.enter="confirmCreateType"
          @keydown.esc="showCreateTypeDialog = false"
        />
      </div>
      <div class="pcfd-type-dialog__footer">
        <button class="pcfd-fbtn pcfd-fbtn--cancel" :disabled="creatingType" @click="showCreateTypeDialog = false">
          {{ t('productCategoryList.cancel') }}
        </button>
        <button
          class="pcfd-fbtn pcfd-fbtn--primary"
          :disabled="!newTypeName.trim() || creatingType"
          @click="confirmCreateType"
        >
          <v-progress-circular v-if="creatingType" indeterminate size="13" width="2" color="white" />
          <Plus v-else :size="14" />
          {{ t('productCategoryList.create') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Save, Shapes, Plus, Tag, AlertTriangle } from 'lucide-vue-next';
import { createProductCategory, updateProductCategory, createProductType } from '@/api/endpoints/product.api';

export default {
  name: 'ProductCategoryFormDrawer',
  components: { X, Save, Shapes, Plus, Tag, AlertTriangle },
  props: {
    modelValue: { type: Boolean, default: false },
    mode: { type: String, default: 'create' },
    initialData: { type: Object, default: null },
    types: { type: Array, default: () => [] },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'saved', 'type-created'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      form: { id: '', name: '', typeId: '' },
      loading: false,
      error: '',
      showCreateTypeDialog: false,
      newTypeName: '',
      typeError: '',
      creatingType: false,
    };
  },
  computed: {
    typesWithAdd() {
      return [
        { id: '__add_type__', name: '+ Ajouter un type' },
        ...this.types,
      ];
    },
  },
  watch: {
    'form.typeId'(val) {
      if (val === '__add_type__') {
        this.form.typeId = '';
        this.newTypeName = '';
        this.typeError = '';
        this.showCreateTypeDialog = true;
        this.$nextTick(() => this.$refs.typeInput?.focus());
      }
    },
    modelValue(isOpen) {
      if (isOpen) {
        this.error = '';
        this.loading = false;
        if (this.mode === 'edit' && this.initialData) {
          this.form = {
            id: this.initialData.id || this.initialData._id || '',
            name: this.initialData.name || '',
            typeId: this.initialData.typeId || this.initialData.productTypeId || this.initialData.type || '',
          };
        } else {
          this.form = { id: '', name: '', typeId: '' };
        }
      }
    },
    showCreateTypeDialog(val) {
      if (val) {
        this.$nextTick(() => this.$refs.typeInput?.focus());
      }
    },
  },
  methods: {
    close() {
      this.$emit('update:modelValue', false);
      this.error = '';
      this.loading = false;
    },
    async confirmCreateType() {
      const name = this.newTypeName.trim();
      if (!name) return;
      this.creatingType = true;
      this.typeError = '';
      try {
        const res = await createProductType({ name });
        const created = res?.data || res;
        const id = created?.id || created?._id;
        await this.$store.dispatch('productTypes/fetchProductTypes', { forceRefresh: true });
        this.form.typeId = id;
        this.showCreateTypeDialog = false;
        this.newTypeName = '';
        this.$emit('type-created', created);
      } catch (e) {
        const msg = e?.response?.data?.message || e?.message || '';
        this.typeError = msg.includes('Unique constraint')
          ? this.t('productCategoryList.typeExists').replace('{name}', name)
          : msg || this.t('productCategoryList.typeCreateError');
      } finally {
        this.creatingType = false;
      }
    },
    async submit() {
      this.error = '';
      const name = String(this.form.name || '').trim();
      if (!name) { this.error = this.t('productCategoryList.nameRequired'); return; }
      if (!this.form.typeId) { this.error = this.t('productCategoryList.typeRequired'); return; }

      this.loading = true;
      try {
        const payload = { name, typeId: this.form.typeId };
        const typeName = (this.types.find(t => t.id === payload.typeId) || {}).name || '';

        if (this.mode === 'edit') {
          if (!this.form.id) { this.error = this.t('productCategoryList.missingId'); return; }
          await updateProductCategory(this.form.id, payload);
          await this.$store.dispatch('productCategories/updateProductCategory', {
            id: this.form.id, ...payload, typeName,
          });
          this.$emit('saved', { id: this.form.id, ...payload, typeName });
        } else {
          const response = await createProductCategory(payload);
          const created = response?.data || response;
          const id = created?.id || created?._id;
          if (id) {
            await this.$store.dispatch('productCategories/addProductCategory', {
              ...created, id, typeId: payload.typeId, typeName,
            });
            this.$emit('saved', { ...created, id, typeId: payload.typeId, typeName });
          }
        }
        // Rafraîchir les types pour mettre à jour leur liste de catégories imbriquée
        this.$store.dispatch('productTypes/fetchProductTypes', { forceRefresh: true });
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('productCategoryList.saveError');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.pcfd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

/* ── Panel ── */
.pcfd-panel {
  width: 480px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}
.pcfd-panel--dark {
  background: #111827;
  border-left-color: #374151;
  color: #f9fafb;
}

/* ── Gradient header ── */
.pcfd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.pcfd-header__icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pcfd-header__text { flex: 1; min-width: 0; }
.pcfd-header__title { font-size: 18px; font-weight: 700; color: #fff; }
.pcfd-header__subtitle { font-size: 12.5px; color: rgba(255, 255, 255, .72); margin-top: 2px; }
.pcfd-close-btn {
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
.pcfd-close-btn:hover { background: rgba(255, 255, 255, .25); }

/* ── Body ── */
.pcfd-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
}

.pcfd-field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}
.pcfd-panel--dark .pcfd-field-label { color: #d1d5db; }
.pcfd-star { color: #ff3131; }

/* styled fields */
.pcfd-field :deep(.v-field) {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
}
.pcfd-field :deep(.v-field__outline) { display: none; }
.pcfd-field :deep(.v-field--focused) {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .1) !important;
}
.pcfd-panel--dark .pcfd-field :deep(.v-field) { border-color: #374151 !important; }

/* BUG-273 : barre d'erreur fixe, entre le corps scrollable et le footer. */
.pcfd-error {
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
.pcfd-panel--dark .pcfd-error { background: rgba(255, 49, 49, .12); border-bottom-color: rgba(255, 49, 49, .3); color: #f87171; }
.pcfd-error__close {
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
.pcfd-error__close:hover { opacity: 1; background: rgba(255, 49, 49, .14); }

/* ── Footer ── */
.pcfd-footer {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 14px 20px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, .06);
}
.pcfd-panel--dark .pcfd-footer {
  background: #1a2332;
  border-top-color: #374151;
}

.pcfd-fbtn {
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
.pcfd-fbtn--cancel { background: #f3f4f6; color: #374151; }
.pcfd-fbtn--cancel:hover:not(:disabled) { background: #e5e7eb; }
.pcfd-fbtn--primary { background: #ff3131; color: #fff; }
.pcfd-fbtn--primary:hover:not(:disabled) { box-shadow: 0 4px 12px rgba(255, 49, 49, .35); }
.pcfd-fbtn:disabled { opacity: .5; cursor: not-allowed; }

/* ── Transition ── */
.pcfd-slide-enter-active,
.pcfd-slide-leave-active { transition: opacity 0.25s ease; }
.pcfd-slide-enter-active .pcfd-panel,
.pcfd-slide-leave-active .pcfd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.pcfd-slide-enter-from,
.pcfd-slide-leave-to { opacity: 0; }
.pcfd-slide-enter-from .pcfd-panel,
.pcfd-slide-leave-to .pcfd-panel { transform: translateX(100%); }

/* ── Dialog création de type ── */
.pcfd-type-dialog {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.14);
}
.pcfd-type-dialog__header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  background: #ff3131;
}
.pcfd-type-dialog__icon {
  width: 36px; height: 36px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.pcfd-type-dialog__text { flex: 1; min-width: 0; }
.pcfd-type-dialog__title { font-size: 14px; font-weight: 700; color: #fff; margin: 0; }
.pcfd-type-dialog__sub { font-size: 12px; color: rgba(255,255,255,0.72); margin: 2px 0 0; }
.pcfd-type-dialog__close {
  background: rgba(255,255,255,0.15); border: none; cursor: pointer;
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; transition: background 0.15s; flex-shrink: 0;
}
.pcfd-type-dialog__close:hover:not(:disabled) { background: rgba(255,255,255,0.25); }
.pcfd-type-dialog__close:disabled { opacity: 0.5; cursor: not-allowed; }
.pcfd-type-dialog__body { padding: 24px 20px 16px; display: flex; flex-direction: column; gap: 10px; }
.pcfd-type-dialog__error {
  display: flex; align-items: center; gap: 7px;
  padding: 9px 12px;
  background: rgba(255, 49, 49, 0.08);
  border: 1px solid rgba(255, 49, 49, 0.2);
  border-radius: 8px;
  font-size: 0.8125rem; color: #ff3131;
}
.pcfd-type-input {
  width: 100%; height: 40px;
  border: 1.5px solid #e5e7eb; border-radius: 10px;
  padding: 0 14px; font-size: 0.875rem; color: #111827;
  background: #fff; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
}
.pcfd-type-input:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1); }
.pcfd-type-dialog__footer {
  padding: 12px 20px; display: flex; justify-content: flex-end; gap: 8px;
  border-top: 1px solid #e5e7eb;
}
</style>
