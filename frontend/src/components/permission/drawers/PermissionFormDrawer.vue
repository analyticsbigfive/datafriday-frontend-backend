<template>
  <Teleport to="body">
    <Transition name="pfd-slide">
      <div v-if="modelValue" class="pfd-overlay" @mousedown.self="close">
        <div class="pfd-panel" :class="{'pfd-panel--dark': isDark}">

          <div class="pfd-header">
            <div class="pfd-header-icon">
              <ShieldCheck :size="20" />
            </div>
            <div class="pfd-header-text">
              <div class="pfd-title">{{ mode === 'edit' ? t('permissionList.dialogEditTitle') : t('permissionList.dialogCreateTitle') }}</div>
              <div class="pfd-subtitle">{{ mode === 'edit' ? t('permissionList.dialogEditSubtitle') : t('permissionList.dialogCreateSubtitle') }}</div>
            </div>
            <v-btn icon variant="text" density="compact" class="pfd-close-btn" @click="close">
              <X :size="18" />
            </v-btn>
          </div>

          <div class="pfd-body">
            <div class="pfd-field-label">{{ t('permissionList.labelCode') }}</div>
            <v-text-field
              v-model="form.code"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              :placeholder="t('permissionList.codePlaceholder')"
              :hint="t('permissionList.codeHint')"
              persistent-hint
              :readonly="mode === 'edit'"
              :disabled="mode === 'edit'"
              class="mb-5"
            />

            <div class="pfd-field-label">{{ t('permissionList.labelName') }}</div>
            <v-text-field
              v-model="form.name"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              :placeholder="t('permissionList.namePlaceholder')"
              class="mb-5"
            />

            <div class="pfd-field-label">{{ t('permissionList.labelCategory') }}</div>
            <v-combobox
              v-model="form.category"
              :items="existingCategories"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              :placeholder="t('permissionList.categoryPlaceholder')"
              clearable
              class="mb-5"
            />

            <div class="pfd-field-label">{{ t('permissionList.labelDescription') }}</div>
            <v-textarea
              v-model="form.description"
              density="compact"
              variant="outlined"
              rounded="lg"
              hide-details="auto"
              :placeholder="t('permissionList.descriptionPlaceholder')"
              rows="3"
              auto-grow
            />
          </div>

          <!-- Erreur : hors zone scrollable, toujours visible juste au-dessus du footer -->
          <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="pfd-error">
            {{ error }}
          </v-alert>

          <div class="pfd-footer">
            <v-btn variant="outlined" rounded="lg" size="large" class="text-none pfd-cancel-btn" @click="close">
              {{ t('permissionList.cancel') }}
            </v-btn>
            <v-btn
              color="#ff3131"
              variant="flat"
              rounded="lg"
              size="large"
              class="text-white text-none"
              :loading="loading"
              @click="submit"
            >
              <Save :size="16" class="mr-1" />
              {{ mode === 'edit' ? t('permissionList.save') : t('permissionList.create') }}
            </v-btn>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Save, ShieldCheck } from 'lucide-vue-next';
import { createPermission, updatePermission } from '@/api/endpoints/permission.api';

export default {
  name: 'PermissionFormDrawer',
  components: { X, Save, ShieldCheck },
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
      form: { id: '', code: '', name: '', category: '', description: '' },
      loading: false,
      error: '',
    };
  },
  computed: {
    existingCategories() {
      const cats = (this.$store.getters['permissions/permissions'] || [])
        .map((p) => p.category)
        .filter(Boolean);
      return [...new Set(cats)].sort();
    },
  },
  watch: {
    modelValue(isOpen) {
      if (isOpen) {
        this.error = '';
        this.loading = false;
        document.body.style.overflow = 'hidden';
        if (this.mode === 'edit' && this.initialData) {
          this.form = {
            id: this.initialData.id || this.initialData._id || '',
            code: this.initialData.code || '',
            name: this.initialData.name || '',
            category: this.initialData.category || '',
            description: this.initialData.description || '',
          };
        } else {
          this.form = { id: '', code: '', name: '', category: '', description: '' };
        }
      } else {
        document.body.style.overflow = '';
      }
    },
  },
  beforeUnmount() {
    document.body.style.overflow = '';
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
      if (!name) { this.error = 'Le nom est requis'; return; }

      const category = typeof this.form.category === 'object'
        ? this.form.category?.title || this.form.category?.value || ''
        : String(this.form.category || '').trim();

      if (this.mode === 'create') {
        const code = String(this.form.code || '').trim();
        if (!code) { this.error = 'Le code est requis'; return; }
        if (!/^[a-z][a-zA-Z0-9.]*$/.test(code)) {
          this.error = 'Le code doit être en dot-notation (ex: custom.export.pdf)';
          return;
        }
      }

      this.loading = true;
      try {
        const payload = { name, description: this.form.description || '', category: category || undefined };
        if (this.mode === 'edit') {
          if (!this.form.id) { this.error = 'Identifiant manquant'; return; }
          await updatePermission(this.form.id, payload);
          await this.$store.dispatch('permissions/updatePermission', { id: this.form.id, ...payload });
          this.$emit('saved', { id: this.form.id, ...payload });
        } else {
          payload.code = String(this.form.code || '').trim();
          const response = await createPermission(payload);
          const created = response?.data || response;
          const id = created?.id || created?._id;
          if (id) {
            await this.$store.dispatch('permissions/addPermission', { ...created, id });
            this.$emit('saved', { ...created, id });
          }
        }
        this.close();
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || 'Échec de la sauvegarde';
      } finally {
        this.loading = false;
      }
    },
  },
};
</script>

<style scoped>
.pfd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

.pfd-panel {
  width: 480px;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}

.pfd-panel--dark {
  background: #111827;
  border-left-color: #374151;
  color: #f9fafb;
}

.pfd-header {
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: 14px;
  border-bottom: 1px solid #e5e7eb;
  flex-shrink: 0;
  background: #f9fafb;
}

.pfd-panel--dark .pfd-header {
  border-bottom-color: #374151;
  background: #1a2332;
}

.pfd-header-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 49, 49, 0.1);
  color: #ff3131;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pfd-panel--dark .pfd-header-icon {
  background: rgba(255, 49, 49, 0.15);
}

.pfd-header-text { flex: 1; min-width: 0; }

.pfd-title {
  font-size: 1rem;
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
}

.pfd-panel--dark .pfd-title { color: #f9fafb; }

.pfd-subtitle {
  font-size: 0.8125rem;
  color: #6b7280;
  margin-top: 2px;
}

.pfd-panel--dark .pfd-subtitle { color: #9ca3af; }

.pfd-close-btn { flex-shrink: 0; color: #6b7280 !important; }
.pfd-panel--dark .pfd-close-btn { color: #9ca3af !important; }

.pfd-body {
  flex: 1;
  overflow-y: auto;
  padding: 28px 24px;
}

.pfd-field-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 8px;
}

.pfd-panel--dark .pfd-field-label { color: #d1d5db; }

/* Erreur fixe, entre le corps scrollable et le footer. */
.pfd-error { flex-shrink: 0; margin: 0; border-radius: 0 !important; }

.pfd-footer {
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid #e5e7eb;
  flex-shrink: 0;
  background: #f9fafb;
}

.pfd-panel--dark .pfd-footer {
  border-top-color: #374151;
  background: #1a2332;
}

.pfd-cancel-btn {
  border-color: #d1d5db !important;
  color: #374151 !important;
}

.pfd-panel--dark .pfd-cancel-btn {
  border-color: #4b5563 !important;
  color: #d1d5db !important;
}

.pfd-slide-enter-active,
.pfd-slide-leave-active { transition: opacity 0.25s ease; }
.pfd-slide-enter-active .pfd-panel,
.pfd-slide-leave-active .pfd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.pfd-slide-enter-from,
.pfd-slide-leave-to { opacity: 0; }
.pfd-slide-enter-from .pfd-panel,
.pfd-slide-leave-to .pfd-panel { transform: translateX(100%); }
</style>
