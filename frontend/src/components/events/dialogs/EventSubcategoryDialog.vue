<template>
  <EventDrawerShell
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :is-dark="isDark"
    :persistent="loading"
    width="480"
    :title="t('eventSubcategoryDialogTitle')"
    :subtitle="t('eventSubcategoryDialogSubtitle')"
  >
    <template #icon>
      <Layers :size="20" color="white" />
    </template>

    <div :class="{ 'escd--dark': isDark }">
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

    <template #footer>
      <button class="escd-btn escd-btn--cancel" @click="close">
        {{ t('eventSubcategoryDialogCancel') }}
      </button>
      <button class="escd-btn escd-btn--primary" :disabled="loading" @click="submit">
        <Save :size="14" />
        {{ loading ? t('eventSubcategoryDialogSaving') : t('eventSubcategoryDialogSave') }}
      </button>
    </template>
  </EventDrawerShell>
</template>

<script>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { useI18n } from '@/i18n/useI18n';
import { Layers, AlertCircle, Save } from 'lucide-vue-next';
import { createEventSubcategory } from '@/api/endpoints/event.api';
import EventDrawerShell from '../drawers/EventDrawerShell.vue';

export default {
  name: 'EventSubcategoryDialog',
  components: { Layers, AlertCircle, Save, EventDrawerShell },

  setup() {
    const { t } = useI18n();
    const theme = useTheme();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
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
      rules: { required: (v) => !!v || this.t('required') },
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
          // categoryId (alias non-persisté, cf. events.service.ts) ajouté en plus des champs
          // réels renvoyés par l'API (dont eventCategoryId) — EventFormDrawer.vue lit created.categoryId.
          const createdSubcategory = { ...created, categoryId: this.categoryId };
          await this.$store.dispatch('eventSubcategories/addEventSubcategory', createdSubcategory);
          this.$emit('created', createdSubcategory);
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
  background: #fff;
}
.escd-v-select :deep(.v-field--focused) {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.10);
}
.escd-v-select :deep(.v-field__outline) { display: none; }
.escd-v-select :deep(.v-field__input) { font-size: 14px; }

/* Footer */
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

/* Dark mode */
.escd--dark .escd-field-label { color: #d1d5db; }
.escd--dark .escd-v-select :deep(.v-field) { background: #1f2937; border-color: #4b5563; }
.escd--dark .escd-v-select :deep(.v-field__input) { color: #f3f4f6; }
</style>
