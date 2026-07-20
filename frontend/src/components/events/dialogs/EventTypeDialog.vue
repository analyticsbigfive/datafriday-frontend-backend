<template>
  <EventDrawerShell
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :is-dark="isDark"
    :persistent="loading"
    width="480"
    :title="t('eventTypeDialogTitle')"
    :subtitle="t('eventTypeDialogSubtitle')"
  >
    <template #icon>
      <Tag :size="20" color="white" />
    </template>

    <div :class="{ 'etd--dark': isDark }">
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

    <template #footer>
      <button class="etd-btn etd-btn--cancel" @click="close">
        {{ t('eventTypeDialogCancel') }}
      </button>
      <button class="etd-btn etd-btn--primary" :disabled="loading" @click="submit">
        <Save :size="14" />
        {{ loading ? t('eventTypeDialogSaving') : t('eventTypeDialogSave') }}
      </button>
    </template>
  </EventDrawerShell>
</template>

<script>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { useI18n } from '@/i18n/useI18n';
import { Tag, AlertCircle, Save } from 'lucide-vue-next';
import { createEventType } from '@/api/endpoints/event.api';
import EventDrawerShell from '../drawers/EventDrawerShell.vue';

export default {
  name: 'EventTypeDialog',
  components: { Tag, AlertCircle, Save, EventDrawerShell },

  setup() {
    const { t } = useI18n();
    const theme = useTheme();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
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
        this.nameError = this.t('required');
        return;
      }
      this.loading = true;
      this.error = '';
      try {
        const response = await createEventType({ name: this.name.trim() });
        const created = response?.data || response;
        const id = created?.id || created?._id;
        if (id) {
          await this.$store.dispatch('eventTypes/addEventType', created);
          this.$emit('created', created);
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
  background: #fff;
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

/* Dark mode */
.etd--dark .etd-field-label { color: #d1d5db; }
.etd--dark .etd-v-field :deep(.v-field) { background: #1f2937; border-color: #4b5563; }
.etd--dark .etd-v-field :deep(.v-field__input) { color: #f3f4f6; }
</style>
