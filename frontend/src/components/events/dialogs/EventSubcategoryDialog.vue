<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="480" :persistent="loading">
    <div class="escd-card">
      <!-- Gradient header -->
      <div class="escd-grad-header">
        <div class="escd-grad-header__icon">
          <Layers :size="20" color="white" />
        </div>
        <div class="escd-grad-header__text">
          <div class="escd-grad-header__title">{{ t('eventSubcategoryDialogTitle') }}</div>
          <div class="escd-grad-header__sub">{{ t('eventSubcategoryDialogSubtitle') }}</div>
        </div>
        <button class="escd-grad-header__close" @click="close">
          <X :size="16" />
        </button>
      </div>

      <!-- Body -->
      <div class="escd-body">
        <div v-if="error" class="escd-error">
          <AlertCircle :size="14" /> {{ error }}
        </div>

        <v-form ref="form" v-model="formValid" validate-on="submit">
          <!-- Category select -->
          <div class="escd-field-wrap mb-4">
            <label class="escd-field-label">{{ t('eventSubcategoryDialogCategoryLabel') }} <span class="escd-star">*</span></label>
            <v-select
              v-model="categoryId"
              :items="categories"
              item-title="name"
              item-value="id"
              :placeholder="t('eventSubcategoryDialogCategoryPlaceholder')"
              density="comfortable"
              variant="outlined"
              hide-details="auto"
              :rules="[rules.required]"
              class="escd-v-select"
            />
          </div>

          <!-- Name input -->
          <div class="escd-field-wrap mb-4">
            <label class="escd-field-label">{{ t('eventSubcategoryDialogNameLabel') }} <span class="escd-star">*</span></label>
            <v-text-field
              v-model="name"
              variant="outlined"
              density="comfortable"
              hide-details
              class="escd-v-select"
            />
          </div>
        </v-form>
      </div>

      <!-- Footer -->
      <div class="escd-foot">
        <button class="escd-btn escd-btn--cancel" @click="close">
          {{ t('eventSubcategoryDialogCancel') }}
        </button>
        <button class="escd-btn escd-btn--primary" :disabled="loading" @click="submit">
          <Save :size="14" />
          {{ loading ? 'Enregistrement…' : t('eventSubcategoryDialogSave') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Layers, AlertCircle, Save } from 'lucide-vue-next';
import { createEventSubcategory } from '@/api/endpoints/event.api';

export default {
  name: 'EventSubcategoryDialog',
  components: { X, Layers, AlertCircle, Save },

  setup() {
    const { t } = useI18n();
    return { t };
  },

  props: {
    modelValue: { type: Boolean, default: false },
    categories: { type: Array, default: () => [] },
    preselectedCategoryId: { type: [String, Number], default: '' },
  },

  emits: ['update:modelValue', 'created'],

  data() {
    return {
      name: '',
      categoryId: this.preselectedCategoryId || '',
      loading: false,
      error: '',
      formValid: false,
      rules: { required: (v) => !!v || 'Ce champ est obligatoire' },
    };
  },

  watch: {
    modelValue(isOpen) {
      if (isOpen) {
        this.name = '';
        this.categoryId = this.preselectedCategoryId || '';
        this.error = '';
        this.loading = false;
      }
    },
    preselectedCategoryId(v) {
      this.categoryId = v || '';
    },
  },

  methods: {
    close() {
      this.$emit('update:modelValue', false);
      this.error = '';
    },
    async submit() {
      if (!this.$refs.form) return;
      const { valid } = await this.$refs.form.validate();
      if (!valid) return;
      this.loading = true;
      this.error = '';
      try {
        const response = await createEventSubcategory({
          name: this.name.trim(),
          categoryId: this.categoryId,
        });
        const created = response?.data || response;
        const id = created?.id || created?._id;
        if (id) {
          await this.$store.dispatch('eventSubcategories/addEventSubcategory', {
            id,
            name: this.name.trim(),
            categoryId: this.categoryId,
          });
          this.$emit('created', { id, name: this.name.trim(), categoryId: this.categoryId });
        }
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || 'Failed to create event subcategory';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.escd-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.15);
}

/* Gradient header */
.escd-grad-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
}
.escd-grad-header__icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.escd-grad-header__text { flex: 1; }
.escd-grad-header__title { font-size: 16px; font-weight: 700; color: #fff; }
.escd-grad-header__sub { font-size: 12.5px; color: rgba(255,255,255,.75); margin-top: 2px; }
.escd-grad-header__close {
  width: 30px; height: 30px; border-radius: 8px; border: none;
  background: rgba(255,255,255,.15);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: rgba(255,255,255,.85); flex-shrink: 0; transition: background .2s;
}
.escd-grad-header__close:hover { background: rgba(255,255,255,.25); }

/* Body */
.escd-body { padding: 22px 22px 16px; }
.escd-error {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca;
  color: #991b1b; border-radius: 10px;
  padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
}

/* v-select */
.escd-field-wrap { display: flex; flex-direction: column; gap: 6px; }
.escd-field-label { font-size: 12.5px; font-weight: 600; color: #374151; }
.escd-star { color: #ff3131; }
.escd-v-select :deep(.v-field) {
  border: 1.5px solid #e5e7eb;
  border-radius: 11px;
  box-shadow: none;
}
.escd-v-select :deep(.v-field--focused) {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.10);
}
.escd-v-select :deep(.v-field__outline) { display: none; }
.escd-v-select :deep(.v-field__input) { font-size: 14px; }

/* form-floating */
.escd-input {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
  font-size: 14px;
  padding: 20px 14px 8px !important;
  height: 52px;
  transition: border-color .2s, box-shadow .2s;
}
.escd-input:focus {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.12) !important;
}
.form-floating > label { font-size: 14px; color: #9ca3af; padding: 14px 16px; }
.form-floating > .escd-input:focus ~ label,
.form-floating > .escd-input:not(:placeholder-shown) ~ label {
  color: #ff3131; font-size: 11px;
  transform: scale(.85) translateY(-0.5rem) translateX(0.15rem);
}

/* Footer */
.escd-foot {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 22px; background: #f9fafb; border-top: 1px solid #f3f4f6;
}
.escd-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 38px;
  border-radius: 50px; font-size: 13.5px; font-weight: 500;
  border: none; cursor: pointer; transition: all .2s;
}
.escd-btn:disabled { opacity: .5; cursor: not-allowed; }
.escd-btn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.escd-btn--cancel:hover { background: #e9ecef; }
.escd-btn--primary {
  background: #ff3131;
  color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.3);
}
.escd-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
</style>
