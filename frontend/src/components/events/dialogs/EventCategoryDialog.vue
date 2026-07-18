<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="480" :persistent="loading">
    <div class="ecd-card">
      <!-- Gradient header -->
      <div class="ecd-grad-header">
        <div class="ecd-grad-header__icon">
          <Shapes :size="20" color="white" />
        </div>
        <div class="ecd-grad-header__text">
          <div class="ecd-grad-header__title">{{ isEdit ? t('eventCategoryDialogEditTitle') : t('eventCategoryDialogTitle') }}</div>
          <div class="ecd-grad-header__sub">{{ isEdit ? t('eventCategoryDialogEditSubtitle') : t('eventCategoryDialogSubtitle') }}</div>
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
              :items="allowCreateType ? eventTypesWithCreate : eventTypes"
              item-title="name"
              item-value="id"
              :placeholder="t('eventCategoryDialogTypePlaceholder')"
              density="comfortable"
              variant="outlined"
              hide-details="auto"
              :rules="[rules.required]"
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

  <!-- BUG-145 : capacité "créer un type à la volée" auto-portée (uniquement si allowCreateType) —
       remplace la copie dupliquée qui vivait dans EventsCategorieListView.vue. -->
  <EventTypeDialog v-if="allowCreateType" v-model="typeDialogOpen" @created="handleTypeCreated" />
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Shapes, AlertCircle, Save, Plus } from 'lucide-vue-next';
import { createEventCategory, updateEventCategory } from '@/api/endpoints/event.api';
import EventTypeDialog from './EventTypeDialog.vue';

export default {
  name: 'EventCategoryDialog',
  components: { X, Shapes, AlertCircle, Save, Plus, EventTypeDialog },

  setup() {
    const { t } = useI18n();
    return { t };
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
      rules: { required: (v) => !!v || 'Ce champ est obligatoire' },
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
          await updateEventCategory(id, payload);
          await this.$store.dispatch('eventCategories/updateEventCategory', { id, ...payload });
          this.$emit('updated', { id, ...payload });
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
          const createdCategory = { id, name: this.name.trim(), eventTypeId: this.eventTypeId, hasHomeTeam: this.hasHomeTeam };
          await this.$store.dispatch('eventCategories/addEventCategory', createdCategory);
          this.$emit('created', createdCategory);
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
