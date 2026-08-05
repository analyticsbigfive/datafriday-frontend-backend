<template>
  <Teleport to="body">
    <Transition name="dsd-slide">
      <div v-if="modelValue" class="dsd-overlay" @mousedown.self="close">
        <div class="dsd-panel" :class="{'dsd-panel--dark': isDark}">

          <!-- Gradient header -->
          <div class="dsd-header">
            <div class="dsd-header__icon">
              <v-icon v-if="department?.icon" :icon="department.icon" size="20" color="#fff" />
              <FolderOpen v-else :size="20" color="#fff" />
            </div>
            <div class="dsd-header__text">
              <div class="dsd-header__title">
                {{ t('departmentList.subtypesTitle') }}
                <span class="dsd-header__dept-name">{{ department?.name }}</span>
              </div>
              <div class="dsd-header__subtitle">{{ subtypeList.length }} {{ t('departmentList.subtypes') }}</div>
            </div>
            <button class="dsd-close-btn" @click="close">
              <X :size="18" />
            </button>
          </div>

          <!-- Body -->
          <div class="dsd-body">
            <!-- Ajout (super-admin uniquement) -->
            <div v-if="isSuperAdmin" class="dsd-add-row mb-4">
              <v-text-field
                v-model="newSubtypeName"
                density="compact"
                variant="outlined"
                rounded="lg"
                hide-details="auto"
                :placeholder="t('departmentList.subtypeNamePlaceholder')"
                class="dsd-field"
                @keyup.enter="addSubtype"
              />
              <button class="dsd-add-btn" :disabled="!newSubtypeName.trim() || saving" @click="addSubtype">
                <Plus :size="16" />
              </button>
            </div>

            <div v-if="subtypeList.length > 0" class="dsd-list">
              <div v-for="st in subtypeList" :key="st.id" class="dsd-item" :class="{'dsd-item--dark': isDark}">
                <div class="dsd-item-icon">
                  <Tag :size="16" />
                </div>
                <div class="dsd-item-info">
                  <v-text-field
                    v-if="editingId === st.id"
                    v-model="editingName"
                    density="compact"
                    variant="outlined"
                    rounded="lg"
                    hide-details="auto"
                    autofocus
                    class="dsd-field"
                    @keyup.enter="saveEdit(st)"
                    @keyup.escape="cancelEdit"
                  />
                  <template v-else>
                    <div class="dsd-item-name">{{ st.name }}</div>
                    <div v-if="st.code" class="dsd-item-code">{{ t('departmentList.legacyCode') }} : {{ st.code }}</div>
                  </template>
                </div>

                <div v-if="isSuperAdmin" class="dsd-item-actions">
                  <template v-if="editingId === st.id">
                    <div class="dsd-abtn dsd-abtn--save" @click="saveEdit(st)"><Check :size="14" /></div>
                    <div class="dsd-abtn" @click="cancelEdit"><X :size="14" /></div>
                  </template>
                  <template v-else>
                    <div class="dsd-abtn dsd-abtn--edit" @click="startEdit(st)"><Pencil :size="14" /></div>
                    <div
                      class="dsd-abtn dsd-abtn--del"
                      :class="{ 'dsd-abtn--disabled': !!st.code }"
                      :title="st.code ? t('departmentList.legacyDeleteBlocked') : ''"
                      @click="!st.code && removeSubtype(st)"
                    >
                      <Trash2 :size="14" />
                    </div>
                  </template>
                </div>
              </div>
            </div>
            <div v-else class="dsd-empty">
              <FolderOpen :size="40" style="opacity:.3" />
              <div class="mt-3">{{ t('departmentList.noSubtypesFound') }}</div>
            </div>
          </div>

          <!-- Erreur : hors zone scrollable, toujours visible juste au-dessus du footer.
               Pas de bouton "submit" unique ici (ajout/édition/suppression sont inline
               par ligne) : le footer fixe est la seule zone garantie visible sans scroll. -->
          <v-alert v-if="error" type="error" variant="tonal" density="compact" rounded="lg" class="dsd-error">
            {{ error }}
          </v-alert>

          <!-- Footer -->
          <div class="dsd-footer">
            <button class="dsd-fbtn dsd-fbtn--cancel" @click="close">
              {{ t('departmentList.close') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, FolderOpen, Tag, Plus, Pencil, Trash2, Check } from 'lucide-vue-next';
import { createSubtype, updateSubtype, deleteSubtype } from '@/api/endpoints/department.api';

export default {
  name: 'DepartmentSubtypesDrawer',
  components: { X, FolderOpen, Tag, Plus, Pencil, Trash2, Check },
  props: {
    modelValue: { type: Boolean, default: false },
    department: { type: Object, default: null },
    isSuperAdmin: { type: Boolean, default: false },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'changed'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
  data() {
    return {
      newSubtypeName: '',
      editingId: '',
      editingName: '',
      saving: false,
      error: '',
    };
  },
  computed: {
    subtypeList() {
      return Array.isArray(this.department?.subtypes) ? this.department.subtypes : [];
    },
  },
  watch: {
    modelValue(isOpen) {
      if (isOpen) {
        this.newSubtypeName = '';
        this.editingId = '';
        this.error = '';
      }
    },
  },
  methods: {
    close() {
      this.$emit('update:modelValue', false);
    },
    startEdit(st) {
      this.editingId = st.id;
      this.editingName = st.name;
      this.error = '';
    },
    cancelEdit() {
      this.editingId = '';
      this.editingName = '';
    },
    async addSubtype() {
      const name = this.newSubtypeName.trim();
      if (!name || !this.department?.id) return;
      this.saving = true;
      this.error = '';
      try {
        await createSubtype({ name, departmentId: this.department.id });
        this.newSubtypeName = '';
        this.$emit('changed');
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('departmentList.saveError');
      } finally {
        this.saving = false;
      }
    },
    async saveEdit(st) {
      const name = this.editingName.trim();
      if (!name) return;
      this.saving = true;
      this.error = '';
      try {
        await updateSubtype(st.id, { name });
        this.editingId = '';
        this.$emit('changed');
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('departmentList.saveError');
      } finally {
        this.saving = false;
      }
    },
    async removeSubtype(st) {
      this.saving = true;
      this.error = '';
      try {
        await deleteSubtype(st.id);
        this.$emit('changed');
      } catch (e) {
        this.error = e?.response?.data?.message || e?.message || this.t('departmentList.deleteError');
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>

<style scoped>
/* ── Overlay ── */
.dsd-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex; justify-content: flex-end;
  backdrop-filter: blur(2px);
}

/* ── Panel ── */
.dsd-panel {
  width: 560px; height: 100%; background: #ffffff;
  display: flex; flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
  border-left: 1px solid #e5e7eb;
}
.dsd-panel--dark { background: #111827; border-left-color: #374151; color: #f9fafb; }

/* ── Gradient header ── */
.dsd-header {
  flex-shrink: 0; display: flex; align-items: center; gap: 14px;
  padding: 20px 20px 18px; background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, .2);
}
.dsd-header__icon {
  width: 44px; height: 44px; border-radius: 12px;
  background: rgba(255, 255, 255, .2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.dsd-header__text { flex: 1; min-width: 0; }
.dsd-header__title { font-size: 18px; font-weight: 700; color: #fff; }
.dsd-header__dept-name { color: rgba(255, 255, 255, .85); font-weight: 800; }
.dsd-header__subtitle { font-size: 12.5px; color: rgba(255, 255, 255, .72); margin-top: 2px; }
.dsd-close-btn {
  background: rgba(255, 255, 255, .15); border: none; cursor: pointer;
  width: 32px; height: 32px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center; color: #fff;
  transition: background .15s; flex-shrink: 0;
}
.dsd-close-btn:hover { background: rgba(255, 255, 255, .25); }

/* ── Body ── */
.dsd-body { flex: 1; overflow-y: auto; padding: 28px 24px; }

.dsd-add-row { display: flex; align-items: center; gap: 10px; }
.dsd-add-btn {
  width: 40px; height: 40px; border-radius: 10px; flex-shrink: 0;
  background: #ff3131; color: #fff; border: none; cursor: pointer;
  display: flex; align-items: center; justify-content: center; transition: box-shadow .2s;
}
.dsd-add-btn:hover:not(:disabled) { box-shadow: 0 4px 12px rgba(255, 49, 49, .35); }
.dsd-add-btn:disabled { opacity: .4; cursor: not-allowed; }

.dsd-field :deep(.v-field) { border: 1.5px solid #e5e7eb !important; border-radius: 11px !important; box-shadow: none !important; }
.dsd-field :deep(.v-field__outline) { display: none; }
.dsd-field :deep(.v-field--focused) { border-color: #ff3131 !important; box-shadow: 0 0 0 3px rgba(255, 49, 49, .1) !important; }
.dsd-panel--dark .dsd-field :deep(.v-field) { background: #1f2937 !important; border-color: #4b5563 !important; }
.dsd-panel--dark .dsd-field :deep(.v-field input) { color: #f3f4f6 !important; }

.dsd-list { display: flex; flex-direction: column; gap: 8px; }

.dsd-item {
  display: flex; align-items: center; gap: 14px; padding: 10px 14px;
  border-radius: 12px; border: 1px solid #e5e7eb; background: #ffffff;
  transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.dsd-item--dark { background: #1a2332; border-color: #374151; }

.dsd-item-icon {
  width: 32px; height: 32px; border-radius: 8px;
  background: rgba(255, 49, 49, .08); color: #ff3131;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.dsd-panel--dark .dsd-item-icon { background: rgba(255, 49, 49, .15); }

.dsd-item-info { flex: 1; min-width: 0; }
.dsd-item-name { font-size: 0.9375rem; font-weight: 600; color: #111827; }
.dsd-panel--dark .dsd-item-name { color: #f9fafb; }
.dsd-item-code { font-size: 0.75rem; color: #9ca3af; margin-top: 2px; }

.dsd-item-actions { display: flex; gap: 4px; flex-shrink: 0; }
.dsd-abtn {
  width: 26px; height: 26px; border-radius: 7px;
  background: #f3f4f6; color: #6b7280;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: background .15s, color .15s; flex-shrink: 0;
}
.dsd-abtn--edit { background: #eff6ff; color: #2563eb; }
.dsd-abtn--edit:hover { background: #dbeafe; }
.dsd-abtn--del { background: #fef2f2; color: #ff3131; }
.dsd-abtn--del:hover { background: #fee2e2; }
.dsd-abtn--disabled { opacity: .35; cursor: not-allowed; }
.dsd-abtn--disabled:hover { background: #fef2f2; }
.dsd-abtn--save { background: #f0fdf4; color: #16a34a; }
.dsd-abtn--save:hover { background: #dcfce7; }

.dsd-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 48px 0; color: #9ca3af; font-size: 0.9rem;
}

/* Erreur fixe, entre le corps scrollable et le footer. */
.dsd-error { flex-shrink: 0; margin: 0; border-radius: 0 !important; }

/* ── Footer ── */
.dsd-footer {
  flex-shrink: 0; display: flex; gap: 10px; justify-content: flex-end;
  padding: 14px 20px; border-top: 1px solid #e5e7eb; background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, .06);
}
.dsd-panel--dark .dsd-footer { background: #1a2332; border-top-color: #374151; }

.dsd-fbtn {
  display: inline-flex; align-items: center; gap: 6px; padding: 0 20px; height: 40px;
  border-radius: 50px; font-size: 13.5px; font-weight: 600; cursor: pointer; border: none; transition: all .2s;
}
.dsd-fbtn--cancel { background: #f3f4f6; color: #374151; }
.dsd-fbtn--cancel:hover { background: #e5e7eb; }

/* ── Transition ── */
.dsd-slide-enter-active, .dsd-slide-leave-active { transition: opacity 0.25s ease; }
.dsd-slide-enter-active .dsd-panel, .dsd-slide-leave-active .dsd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.dsd-slide-enter-from, .dsd-slide-leave-to { opacity: 0; }
.dsd-slide-enter-from .dsd-panel, .dsd-slide-leave-to .dsd-panel { transform: translateX(100%); }
</style>
