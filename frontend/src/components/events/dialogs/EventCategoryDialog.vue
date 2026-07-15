<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="480">
    <div class="ecd-card">
      <!-- Gradient header -->
      <div class="ecd-grad-header">
        <div class="ecd-grad-header__icon">
          <Shapes :size="20" color="white" />
        </div>
        <div class="ecd-grad-header__text">
          <div class="ecd-grad-header__title">{{ t('eventCategoryDialogTitle') }}</div>
          <div class="ecd-grad-header__sub">{{ t('eventCategoryDialogSubtitle') }}</div>
        </div>
        <button class="ecd-grad-header__close" @click="close">
          <X :size="16" />
        </button>
      </div>

      <!-- Body -->
      <div class="ecd-body">
        <div v-if="error" class="ecd-error">
          <AlertCircle :size="14" /> {{ error }}
        </div>

        <v-form ref="form" v-model="formValid" validate-on="submit">
          <!-- Type select -->
          <div class="ecd-field-wrap mb-4">
            <label class="ecd-field-label">{{ t('eventCategoryDialogTypeLabel') }} <span class="ecd-star">*</span></label>
            <v-select
              v-model="eventTypeId"
              :items="eventTypes"
              item-title="name"
              item-value="id"
              :placeholder="t('eventCategoryDialogTypePlaceholder')"
              density="comfortable"
              variant="outlined"
              hide-details="auto"
              :rules="[rules.required]"
              class="ecd-v-select"
            />
          </div>

          <!-- Name input -->
          <div class="ecd-field-wrap mb-4">
            <label class="ecd-field-label">{{ t('eventCategoryDialogNameLabel') }} <span class="ecd-star">*</span></label>
            <v-text-field
              v-model="name"
              variant="outlined"
              density="comfortable"
              hide-details
              class="ecd-v-select"
            />
          </div>

          <!-- Has home team checkbox -->
          <label class="ecd-checkbox">
            <input type="checkbox" v-model="hasHomeTeam" class="ecd-checkbox__input" />
            <span class="ecd-checkbox__label">{{ t('eventCategoryDialogHasHomeTeam') }}</span>
          </label>
        </v-form>
      </div>

      <!-- Footer -->
      <div class="ecd-foot">
        <button class="ecd-btn ecd-btn--cancel" @click="close">
          {{ t('eventCategoryDialogCancel') }}
        </button>
        <button class="ecd-btn ecd-btn--primary" :disabled="loading" @click="submit">
          <Save :size="14" />
          {{ loading ? 'Enregistrement…' : t('eventCategoryDialogSave') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Shapes, AlertCircle, Save } from 'lucide-vue-next';
import { createEventCategory } from '@/api/endpoints/event.api';

export default {
  name: 'EventCategoryDialog',
  components: { X, Shapes, AlertCircle, Save },

  setup() {
    const { t } = useI18n();
    return { t };
  },

  props: {
    modelValue: { type: Boolean, default: false },
    eventTypes: { type: Array, default: () => [] },
    preselectedTypeId: { type: [String, Number], default: '' },
  },

  emits: ['update:modelValue', 'created'],

  data() {
    return {
      name: '',
      eventTypeId: this.preselectedTypeId || '',
      hasHomeTeam: false,
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
        this.eventTypeId = this.preselectedTypeId || '';
        this.hasHomeTeam = false;
        this.error = '';
        this.loading = false;
      }
    },
    preselectedTypeId(v) {
      this.eventTypeId = v || '';
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
        const response = await createEventCategory({
          name: this.name.trim(),
          eventTypeId: this.eventTypeId,
          hasHomeTeam: this.hasHomeTeam,
        });
        const created = response?.data || response;
        const id = created?.id || created?._id;
        if (id) {
          await this.$store.dispatch('eventCategories/addEventCategory', {
            id,
            name: this.name.trim(),
            eventTypeId: this.eventTypeId,
          });
          this.$emit('created', { id, name: this.name.trim(), eventTypeId: this.eventTypeId });
        }
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || 'Failed to create event category';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.ecd-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.15);
}

/* Gradient header */
.ecd-grad-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
}
.ecd-grad-header__icon {
  width: 42px; height: 42px; border-radius: 12px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ecd-grad-header__text { flex: 1; }
.ecd-grad-header__title { font-size: 16px; font-weight: 700; color: #fff; }
.ecd-grad-header__sub { font-size: 12.5px; color: rgba(255,255,255,.75); margin-top: 2px; }
.ecd-grad-header__close {
  width: 30px; height: 30px; border-radius: 8px; border: none;
  background: rgba(255,255,255,.15);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: rgba(255,255,255,.85); flex-shrink: 0; transition: background .2s;
}
.ecd-grad-header__close:hover { background: rgba(255,255,255,.25); }

/* Body */
.ecd-body { padding: 22px 22px 16px; }
.ecd-error {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca;
  color: #991b1b; border-radius: 10px;
  padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
}

/* v-select styling */
.ecd-field-wrap { display: flex; flex-direction: column; gap: 6px; }
.ecd-field-label { font-size: 12.5px; font-weight: 600; color: #374151; }
.ecd-star { color: #ff3131; }
.ecd-v-select :deep(.v-field) {
  border: 1.5px solid #e5e7eb;
  border-radius: 11px;
  box-shadow: none;
}
.ecd-v-select :deep(.v-field--focused) {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.10);
}
.ecd-v-select :deep(.v-field__outline) { display: none; }
.ecd-v-select :deep(.v-field__input) { font-size: 14px; }

/* form-floating */
.ecd-input {
  border: 1.5px solid #e5e7eb !important;
  border-radius: 11px !important;
  box-shadow: none !important;
  font-size: 14px;
  padding: 20px 14px 8px !important;
  height: 52px;
  transition: border-color .2s, box-shadow .2s;
}
.ecd-input:focus {
  border-color: #ff3131 !important;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.12) !important;
}
.form-floating > label { font-size: 14px; color: #9ca3af; padding: 14px 16px; }
.form-floating > .ecd-input:focus ~ label,
.form-floating > .ecd-input:not(:placeholder-shown) ~ label {
  color: #ff3131; font-size: 11px;
  transform: scale(.85) translateY(-0.5rem) translateX(0.15rem);
}

/* Checkbox */
.ecd-checkbox {
  display: flex; align-items: center; gap: 10px;
  cursor: pointer; margin-top: 4px;
}
.ecd-checkbox__input {
  width: 18px; height: 18px;
  accent-color: #ff3131; cursor: pointer; flex-shrink: 0;
}
.ecd-checkbox__label { font-size: 14px; color: #374151; user-select: none; }

/* Footer */
.ecd-foot {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 22px; background: #f9fafb; border-top: 1px solid #f3f4f6;
}
.ecd-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 38px;
  border-radius: 50px; font-size: 13.5px; font-weight: 500;
  border: none; cursor: pointer; transition: all .2s;
}
.ecd-btn:disabled { opacity: .5; cursor: not-allowed; }
.ecd-btn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.ecd-btn--cancel:hover { background: #e9ecef; }
.ecd-btn--primary {
  background: #ff3131;
  color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49,.3);
}
.ecd-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
</style>
