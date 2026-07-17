<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="460" persistent>
    <div class="ccd-card">
      <!-- Gradient header -->
      <div class="ccd-grad-header">
        <div class="ccd-grad-header__icon"><Shapes :size="20" color="white" /></div>
        <div class="ccd-grad-header__text">
          <div class="ccd-grad-header__title">{{ t('menuItemCreateCategoryDialogTitle') }}</div>
          <div class="ccd-grad-header__sub">{{ t('menuItemCreateCategoryDialogSubtitle') }}</div>
        </div>
        <button class="ccd-close" @click="cancel"><X :size="18" /></button>
      </div>
      <!-- Body -->
      <div class="ccd-body">
        <div v-if="error" class="ccd-error"><AlertCircle :size="14" /> {{ error }}</div>
        <!-- Type label badge -->
        <div class="ccd-type-badge">
          <span class="ccd-type-badge__label">{{ t('menuItemCreateCategoryDialogTypeLabel') }}</span>
          <span class="ccd-type-badge__val">{{ typeName || '—' }}</span>
        </div>
        <div class="form-floating">
          <input
            id="ccd-name"
            v-model="name"
            class="form-control ccd-input"
            placeholder=" "
            autofocus
            @keyup.enter="submit"
          />
          <label for="ccd-name">{{ t('menuItemCreateCategoryDialogLabel') }}</label>
        </div>
      </div>
      <!-- Footer -->
      <div class="ccd-foot">
        <button class="ccd-btn ccd-btn--cancel" @click="cancel">{{ t('menuItemCreateCategoryDialogCancel') }}</button>
        <button class="ccd-btn ccd-btn--primary" :disabled="loading" @click="submit">
          <Save :size="14" />
          {{ loading ? 'Création…' : t('menuItemCreateCategoryDialogCreate') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { AlertCircle, Save, Shapes, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import { createProductCategory } from '@/api/endpoints/product.api';

export default {
  name: 'CreateCategoryDialog',
  components: { AlertCircle, Save, Shapes, X },
  props: {
    modelValue: { type: Boolean, default: false },
    typeName: { type: String, default: '' },
    typeId: { type: String, default: '' },
  },
  emits: ['update:modelValue', 'created'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      name: '',
      loading: false,
      error: '',
    };
  },
  methods: {
    cancel() {
      this.name = '';
      this.error = '';
      this.$emit('update:modelValue', false);
    },
    async submit() {
      const trimmed = this.name.trim();
      if (!trimmed) {
        this.error = this.t('menuItemCreateCategoryDialogNameRequiredError');
        return;
      }
      if (!this.typeId) {
        this.error = this.t('menuItemCreateCategoryDialogTypeRequiredError');
        return;
      }
      this.loading = true;
      this.error = '';
      try {
        const response = await createProductCategory({ name: trimmed, typeId: this.typeId });
        const created = response?.data || response;
        const id = created?.id || created?._id;
        if (id) {
          await this.$store.dispatch('productCategories/addProductCategory', {
            ...created,
            id,
            typeId: this.typeId,
            typeName: this.typeName,
          });
        }
        this.$emit('created', trimmed);
        this.name = '';
        this.$emit('update:modelValue', false);
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('menuItemCreateGenericError');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.ccd-card { background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.15); }
.ccd-grad-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
}
.ccd-grad-header__icon {
  width: 40px; height: 40px; border-radius: 10px;
  background: rgba(255,255,255,.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ccd-grad-header__text { flex: 1; }
.ccd-grad-header__title { font-size: 16px; font-weight: 700; color: #fff; }
.ccd-grad-header__sub { font-size: 12px; color: rgba(255,255,255,.75); margin-top: 2px; }
.ccd-close {
  background: rgba(255,255,255,.15); border: none; cursor: pointer;
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; transition: background .15s;
}
.ccd-close:hover { background: rgba(255,255,255,.25); }
.ccd-body { padding: 22px 22px 10px; }
.ccd-error {
  display: flex; align-items: center; gap: 7px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
}
.ccd-type-badge {
  display: flex; align-items: center; gap: 6px;
  background: rgba(255, 49, 49,.06); border: 1px solid rgba(255, 49, 49,.15);
  border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
}
.ccd-type-badge__label { color: #6b7280; }
.ccd-type-badge__val { font-weight: 700; color: #111827; }
.ccd-input {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
  height: 52px; font-size: 14px;
}
.ccd-input:focus {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.1) !important;
}
.ccd-foot { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 22px 22px; }
.ccd-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 40px; border-radius: 50px;
  font-size: 13.5px; font-weight: 600; cursor: pointer;
  border: none; transition: all .2s;
}
.ccd-btn--cancel { background: #f3f4f6; color: #374151; }
.ccd-btn--cancel:hover { background: #e5e7eb; }
.ccd-btn--primary { background: #ff3131; color: #fff; }
.ccd-btn--primary:hover { box-shadow: 0 4px 14px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.ccd-btn:disabled { opacity: .6; cursor: not-allowed; transform: none !important; }
</style>
