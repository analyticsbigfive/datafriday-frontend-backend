<template>
  <EventDrawerShell
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :is-dark="isDark"
    :persistent="loading"
    width="480"
    :title="isEdit ? t('eventCategoryDialogEditTitle') : t('eventCategoryDialogTitle')"
    :subtitle="isEdit ? t('eventCategoryDialogEditSubtitle') : t('eventCategoryDialogSubtitle')"
    :error-message="error"
  >
    <template #icon>
      <Shapes :size="20" color="white" />
    </template>

    <div :class="{ 'ecd--dark': isDark }">
      <v-form ref="form" v-model="formValid" validate-on="submit">
        <div class="ecd-section-label">
          <Shapes :size="12" />
          <span>{{ t('eventCategoryDialogSectionInfo') }}</span>
        </div>

        <!-- Type select -->
        <div class="ecd-field-wrap mb-4">
          <span class="ecd-field-label">{{ t('eventCategoryDialogTypeLabel') }} <span class="ecd-star">*</span></span>
          <v-select
            v-model="eventTypeId"
            :items="allowCreateType ? eventTypesWithCreate : eventTypes"
            item-title="name"
            item-value="id"
            :placeholder="t('eventCategoryDialogTypePlaceholder')"
            density="comfortable"
            variant="outlined"
            hide-details="auto"
            :rules="[rules.required]"
            :menu-props="{ zIndex: 2500 }"
            class="ecd-v-select"
            @update:modelValue="handleTypeSelect"
          >
            <template v-if="allowCreateType" #item="{ props, item }">
              <v-list-item
                v-bind="props"
                :class="item.raw.id === '__create__' ? 'ecd-create-option' : ''"
                @click="item.raw.id === '__create__' ? openCreateType() : null"
              >
                <template #prepend v-if="item.raw.id === '__create__'">
                  <Plus :size="16" class="mr-2" />
                </template>
              </v-list-item>
            </template>
          </v-select>
        </div>

        <!-- Name input -->
        <div class="ecd-field-wrap mb-4">
          <span class="ecd-field-label">{{ t('eventCategoryDialogNameLabel') }} <span class="ecd-star">*</span></span>
          <v-text-field
            v-model="name"
            variant="outlined"
            density="comfortable"
            hide-details
            class="ecd-v-select"
          />
        </div>

        <div class="ecd-section-label">
          <Settings :size="12" />
          <span>{{ t('eventCategoryDialogSectionOptions') }}</span>
        </div>

        <!-- Has home team checkbox -->
        <label class="ecd-checkbox">
          <input type="checkbox" v-model="hasHomeTeam" class="ecd-checkbox__input" />
          <span class="ecd-checkbox__label">{{ t('eventCategoryDialogHasHomeTeam') }}</span>
        </label>
      </v-form>
    </div>

    <template #footer>
      <button class="ecd-btn ecd-btn--cancel" @click="close">
        {{ t('eventCategoryDialogCancel') }}
      </button>
      <button class="ecd-btn ecd-btn--primary" :disabled="loading" @click="submit">
        <Save :size="14" />
        {{ loading ? t('eventCategoryDialogSaving') : t('eventCategoryDialogSave') }}
      </button>
    </template>
  </EventDrawerShell>

  <!-- BUG-145 : capacité "créer un type à la volée" auto-portée (uniquement si allowCreateType) —
       remplace la copie dupliquée qui vivait dans EventsCategorieListView.vue. -->
  <EventTypeDialog v-if="allowCreateType" v-model="typeDialogOpen" @created="handleTypeCreated" />
</template>

<script>
import { computed } from 'vue';
import { useTheme } from 'vuetify';
import { useI18n } from '@/i18n/useI18n';
import { Shapes, Save, Plus, Settings } from 'lucide-vue-next';
import { createEventCategory, updateEventCategory } from '@/api/endpoints/event.api';
import EventDrawerShell from '../drawers/EventDrawerShell.vue';
import EventTypeDialog from './EventTypeDialog.vue';

export default {
  name: 'EventCategoryDialog',
  components: { Shapes, Save, Plus, Settings, EventDrawerShell, EventTypeDialog },

  setup() {
    const { t } = useI18n();
    const theme = useTheme();
    const isDark = computed(() => !!theme.global.current.value.dark);
    return { t, isDark };
  },

  props: {
    modelValue: { type: Boolean, default: false },
    eventTypes: { type: Array, default: () => [] },
    preselectedTypeId: { type: [String, Number], default: '' },
    // BUG-145 : mode édition — quand fourni, le dialog se pré-remplit et appelle
    // updateEventCategory au lieu de createEventCategory.
    category: { type: Object, default: null },
    // BUG-145 : option "Créer un nouveau type" dans le select, avec EventTypeDialog auto-porté —
    // seul l'écran /event-categories (qui avait cette capacité dans son ancien drawer inline)
    // l'active ; les autres appelants (EventFormDrawer, /event-subcategories) gardent leur
    // comportement actuel (simple select, pas de création inline depuis ce dialog).
    allowCreateType: { type: Boolean, default: false },
  },

  emits: ['update:modelValue', 'created', 'updated'],

  data() {
    return {
      name: '',
      eventTypeId: this.preselectedTypeId || '',
      hasHomeTeam: false,
      loading: false,
      error: '',
      formValid: false,
      typeDialogOpen: false,
      rules: { required: (v) => !!v || this.t('required') },
    };
  },

  computed: {
    isEdit() {
      return !!this.category;
    },
    eventTypesWithCreate() {
      return [{ id: '__create__', name: this.t('eventCategoryDialogCreateTypeOption') }, ...this.eventTypes];
    },
  },

  watch: {
    modelValue(isOpen) {
      if (isOpen) {
        if (this.category) {
          this.name = this.category.name || '';
          const rawTypeId = this.category.eventTypeId || this.category.eventType?._id || this.category.eventType?.id || null;
          // Défensif : eventTypeId peut arriver comme objet peuplé plutôt que string id
          // selon la forme renvoyée par le store (cf. normalizeId de l'ancien drawer inline).
          this.eventTypeId = (rawTypeId && typeof rawTypeId === 'object')
            ? (rawTypeId.id || rawTypeId._id || '')
            : (rawTypeId || '');
          this.hasHomeTeam = !!this.category.hasHomeTeam;
        } else {
          this.name = '';
          this.eventTypeId = this.preselectedTypeId || '';
          this.hasHomeTeam = false;
        }
        this.error = '';
        this.loading = false;
      }
    },
    preselectedTypeId(v) {
      if (!this.isEdit) this.eventTypeId = v || '';
    },
  },

  methods: {
    close() {
      this.$emit('update:modelValue', false);
      this.error = '';
    },
    handleTypeSelect(value) {
      if (value === '__create__') {
        this.eventTypeId = '';
        this.openCreateType();
      }
    },
    openCreateType() {
      this.eventTypeId = '';
      this.typeDialogOpen = true;
    },
    handleTypeCreated(newType) {
      this.eventTypeId = newType.id;
    },
    async submit() {
      if (!this.$refs.form) return;
      const { valid } = await this.$refs.form.validate();
      if (!valid) return;
      this.loading = true;
      this.error = '';
      try {
        if (this.isEdit) {
          const id = this.category.id || this.category._id;
          const payload = {
            name: this.name.trim(),
            eventTypeId: this.eventTypeId,
            hasHomeTeam: this.hasHomeTeam,
          };
          const response = await updateEventCategory(id, payload);
          const updated = response?.data || response;
          await this.$store.dispatch('eventCategories/updateEventCategory', { id, ...updated });
          this.$emit('updated', { id, ...updated });
          this.close();
          return;
        }

        const response = await createEventCategory({
          name: this.name.trim(),
          eventTypeId: this.eventTypeId,
          hasHomeTeam: this.hasHomeTeam,
        });
        const created = response?.data || response;
        const id = created?.id || created?._id;
        if (id) {
          await this.$store.dispatch('eventCategories/addEventCategory', created);
          this.$emit('created', created);
        }
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message
          || (this.isEdit ? 'Failed to update event category' : 'Failed to create event category');
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
/* v-select styling */
.ecd-field-wrap { display: flex; flex-direction: column; gap: 6px; }
.ecd-field-label { font-size: var(--fs-sm); font-weight: 600; color: #374151; }
.ecd-star { color: #ff3131; }
.ecd-v-select :deep(.v-field) {
  border: 1.5px solid #e5e7eb;
  border-radius: 11px;
  box-shadow: none;
  background: #fff;
}
.ecd-v-select :deep(.v-field--focused) {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49,.10);
}
.ecd-v-select :deep(.v-field__outline) { display: none; }
.ecd-v-select :deep(.v-field__input) { font-size: var(--fs-md); }

/* "Créer un nouveau type" option (BUG-145, allowCreateType) */
:deep(.ecd-create-option) { color: #ff3131; font-weight: 600; }

/* Checkbox */
.ecd-checkbox {
  display: flex; align-items: center; gap: 10px;
  cursor: pointer; margin-top: 4px;
}
.ecd-checkbox__input {
  width: 18px; height: 18px;
  accent-color: #ff3131; cursor: pointer; flex-shrink: 0;
}
.ecd-checkbox__label { font-size: var(--fs-md); color: #374151; user-select: none; }

/* Footer */
.ecd-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 38px;
  border-radius: 50px; font-size: var(--fs-base); font-weight: 500;
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

/* Dark mode */
.ecd--dark .ecd-field-label { color: #d1d5db; }
.ecd--dark .ecd-checkbox__label { color: #d1d5db; }
.ecd--dark .ecd-v-select :deep(.v-field) { background: #1f2937; border-color: #4b5563; }
.ecd--dark .ecd-v-select :deep(.v-field__input) { color: #f3f4f6; }
.ecd--dark .ecd-v-select :deep(.v-select__selection-text) { color: #f3f4f6; }
.ecd--dark .ecd-v-select :deep(.v-field__input input::placeholder) { color: #94a3b8; }
.ecd--dark .ecd-checkbox__input { color-scheme: dark; }
/* Bouton Cancel : slotté dans le footer d'EventDrawerShell → ciblé via .eds--dark. */
.eds--dark .ecd-btn--cancel { background: #1f2937; color: #e2e8f0; border-color: rgba(255,255,255,.14); }
.eds--dark .ecd-btn--cancel:hover { background: #374151; }
/* Labels de section (icône + span), calqués sur efd-section-label */
.ecd-section-label {
  display: flex; align-items: center; gap: 6px;
  font-size: var(--fs-xs); font-weight: 700; text-transform: uppercase;
  letter-spacing: .06em; color: #9ca3af; margin-bottom: 12px;
}
.ecd-section-label:not(:first-child) { margin-top: 20px; }
.ecd--dark .ecd-section-label { color: #6b7280; }
</style>
