<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="480" :persistent="loading">
    <div class="etd-card">
      <!-- Gradient header -->
      <div class="etd-grad-header">
        <div class="etd-grad-header__icon">
          <Tag :size="20" color="white" />
        </div>
        <div class="etd-grad-header__text">
          <div class="etd-grad-header__title">{{ t('eventTypeDialogTitle') }}</div>
          <div class="etd-grad-header__sub">{{ t('eventTypeDialogSubtitle') }}</div>
        </div>
        <button class="etd-grad-header__close" @click="close">
          <X :size="16" />
        </button>
      </div>

      <!-- Body -->
      <div class="etd-body">
        <div v-if="error" class="etd-error">
          <AlertCircle :size="14" /> {{ error }}
        </div>

        <div class="etd-field-wrap">
          <label class="etd-field-label">{{ t('eventTypeDialogNameLabel') }} <span class="etd-star">*</span></label>
          <v-text-field
            v-model="name"
            variant="outlined"
            density="comfortable"
            hide-details
            :error="!!nameError"
            class="etd-v-field"
            @update:model-value="nameError = ''"
          />
          <div v-if="nameError" class="etd-field-error">{{ nameError }}</div>
        </div>
      </div>

      <!-- Footer -->
      <div class="etd-foot">
        <button class="etd-btn etd-btn--cancel" @click="close">
          {{ t('eventTypeDialogCancel') }}
        </button>
        <button class="etd-btn etd-btn--primary" :disabled="loading" @click="submit">
          <Save :size="14" />
          {{ loading ? 'Enregistrement…' : t('eventTypeDialogSave') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Tag, AlertCircle, Save } from 'lucide-vue-next';
import { createEventType } from '@/api/endpoints/event.api';

export default {
  name: 'EventTypeDialog',
  components: { X, Tag, AlertCircle, Save },

  setup() {
    const { t } = useI18n();
    return { t };
  },

  props: {
    modelValue: { type: Boolean, default: false },
  },

  emits: ['update:modelValue', 'created'],

  data() {
    return {
      name: '',
      nameError: '',
      loading: false,
      error: '',
    };
  },

  watch: {
    modelValue(isOpen) {
      if (isOpen) {
        this.name = '';
        this.nameError = '';
        this.error = '';
        this.loading = false;
      }
    },
  },

  methods: {
    close() {
      this.$emit('update:modelValue', false);
      this.error = '';
      this.name = '';
      this.nameError = '';
    },
    async submit() {
      this.nameError = '';
      if (!this.name.trim()) {
        this.nameError = 'Ce champ est obligatoire';
        return;
      }
      this.loading = true;
      this.error = '';
      try {
        const response = await createEventType({ name: this.name.trim() });
        const created = response?.data || response;
        const id = created?.id || created?._id;
        if (id) {
          await this.$store.dispatch('eventTypes/addEventType', { id, name: this.name.trim() });
          this.$emit('created', { id, name: this.name.trim() });
        }
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || 'Failed to create event type';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.etd-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.15);
}

/* Gradient header */
.etd-grad-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px 20px 18px;
  background: #ff3131;
}
.etd-grad-header__icon {
  width: 42px; height: 42px;
  border-radius: 12px;
  background: rgba(255,255,255,.18);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.etd-grad-header__text { flex: 1; }
.etd-grad-header__title { font-size: 16px; font-weight: 700; color: #fff; }
.etd-grad-header__sub { font-size: 12.5px; color: rgba(255,255,255,.75); margin-top: 2px; }
.etd-grad-header__close {
  width: 30px; height: 30px; border-radius: 8px; border: none;
  background: rgba(255,255,255,.15);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: rgba(255,255,255,.85); flex-shrink: 0;
  transition: background .2s;
}
.etd-grad-header__close:hover { background: rgba(255,255,255,.25); }

/* Body */
.etd-body { padding: 22px 22px 16px; }
.etd-error {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca;
  color: #991b1b; border-radius: 10px;
  padding: 10px 14px; font-size: 13px; margin-bottom: 16px;
}

/* Champ : label statique visible au-dessus + v-text-field outlined (parité EventFormDrawer). */
.etd-field-wrap { display: flex; flex-direction: column; gap: 6px; }
.etd-field-label { font-size: 12.5px; font-weight: 600; color: #374151; }
.etd-star { color: #ff3131; }
.etd-v-field :deep(.v-field) {
  border: 1.5px solid #e5e7eb;
  border-radius: 11px;
  box-shadow: none;
}
.etd-v-field :deep(.v-field--focused) {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, .10);
}
.etd-v-field :deep(.v-field--error) { border-color: #ff3131; }
.etd-v-field :deep(.v-field__outline) { display: none; }
.etd-v-field :deep(.v-field__input) { font-size: 14px; }
.etd-field-error { font-size: 12px; color: #ff3131; margin-top: 4px; }

/* Footer */
.etd-foot {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 22px;
  background: #f9fafb; border-top: 1px solid #f3f4f6;
}
.etd-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 38px;
  border-radius: 50px; font-size: 13.5px; font-weight: 500;
  border: none; cursor: pointer; transition: all .2s;
}
.etd-btn:disabled { opacity: .5; cursor: not-allowed; }
.etd-btn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.etd-btn--cancel:hover { background: #e9ecef; }
.etd-btn--primary {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 12px rgba(255, 49, 49,.3);
}
.etd-btn--primary:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }
</style>
