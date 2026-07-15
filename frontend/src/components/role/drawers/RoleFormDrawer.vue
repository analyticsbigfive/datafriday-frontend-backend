<template>
  <Teleport to="body">
    <Transition name="rfd-slide">
      <div v-if="modelValue" class="rfd-overlay" @mousedown.self="close">
        <div class="rfd-panel">

          <!-- Header dégradé -->
          <div class="rfd-header">
            <div class="rfd-header__icon"><Crown :size="20" color="white" /></div>
            <div class="rfd-header__text">
              <p class="rfd-header__title">{{ mode === 'edit' ? t('roleList.dialogEditTitle') : t('roleList.dialogCreateTitle') }}</p>
              <p class="rfd-header__sub">{{ mode === 'edit' ? t('roleList.dialogEditSubtitle') : t('roleList.dialogCreateSubtitle') }}</p>
            </div>
            <button class="rfd-header__close" @click="close"><X :size="15" /></button>
          </div>

          <!-- Body -->
          <div class="rfd-body">

            <!-- Erreur -->
            <div v-if="error" class="rfd-error mb-4">
              <AlertTriangle :size="14" />
              {{ error }}
            </div>

            <!-- Nom -->
            <div class="rfd-field-wrap mb-4">
              <label class="rfd-label">{{ t('roleList.labelName') }} <span class="rfd-required">*</span></label>
              <input
                v-model="form.name"
                class="rfd-input"
                :readonly="form.isSystem"
                :placeholder="t('roleList.namePlaceholder')"
              />
            </div>

            <!-- Description -->
            <div class="rfd-field-wrap mb-5">
              <label class="rfd-label">{{ t('roleList.labelDescription') }}</label>
              <textarea
                v-model="form.description"
                class="rfd-input rfd-textarea"
                rows="3"
                :placeholder="t('roleList.descriptionPlaceholder')"
              />
            </div>

            <!-- Section permissions -->
            <div class="rfd-section-divider">
              <ShieldCheck :size="14" />
              <span>{{ t('roleList.sectionPermissions') }}</span>
            </div>

            <div v-if="availablePermissions.length === 0" class="rfd-empty">
              <ShieldOff :size="28" />
              <span>{{ t('roleList.noPermissionsAvailable') }}</span>
            </div>

            <template v-else>
              <!-- Note admin -->
              <div v-if="isAdminRole" class="rfd-info-note mb-3">
                <Info :size="14" />
                {{ t('roleList.adminAllPermissionsNote') }}
              </div>

              <!-- Recherche permissions -->
              <div class="rfd-field-wrap mb-3">
                <div class="rfd-search-wrap">
                  <Search :size="14" class="rfd-search-icon" />
                  <input
                    v-model="permissionSearch"
                    class="rfd-input rfd-input--search"
                    :placeholder="t('roleList.searchPermissions')"
                  />
                </div>
              </div>

              <!-- Liste des permissions -->
              <div class="rfd-permissions-list">
                <div
                  v-for="perm in filteredPermissions"
                  :key="perm.id"
                  class="rfd-perm-row"
                  :class="{
                    'rfd-perm-row--selected': isSelected(perm.id),
                    'rfd-perm-row--disabled': isAdminRole,
                  }"
                  @click="togglePermission(perm.id)"
                >
                  <CheckCircle2 v-if="isSelected(perm.id)" :size="17" class="rfd-perm-check rfd-perm-check--on" />
                  <Circle v-else :size="17" class="rfd-perm-check rfd-perm-check--off" />
                  <div class="rfd-perm-info">
                    <div class="rfd-perm-name">{{ perm.name }}</div>
                    <div v-if="perm.description" class="rfd-perm-desc">{{ perm.description }}</div>
                  </div>
                </div>
              </div>

              <!-- Compteur sélection -->
              <div class="rfd-selected-count">
                <ShieldCheck :size="13" />
                {{ form.permissionIds.length }} {{ t('roleList.permissionsSelected') }}
              </div>
            </template>
          </div>

          <!-- Footer -->
          <div class="rfd-footer">
            <button class="rfd-btn rfd-btn--ghost" :disabled="loading" @click="close">
              {{ t('roleList.cancel') }}
            </button>
            <button class="rfd-btn rfd-btn--primary" :disabled="loading" @click="submit">
              <v-progress-circular v-if="loading" indeterminate size="13" width="2" color="white" />
              <Save v-else :size="14" />
              {{ mode === 'edit' ? t('roleList.save') : t('roleList.create') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Save, Crown, ShieldCheck, ShieldOff, AlertTriangle, Info, Search, CheckCircle2, Circle } from 'lucide-vue-next';
import { createRole, updateRole } from '@/api/endpoints/role.api';

export default {
  name: 'RoleFormDrawer',
  components: { X, Save, Crown, ShieldCheck, ShieldOff, AlertTriangle, Info, Search, CheckCircle2, Circle },
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
      form: { id: '', name: '', description: '', permissionIds: [], isSystem: false, systemKey: null },
      permissionSearch: '',
      loading: false,
      error: '',
    };
  },
  computed: {
    isAdminRole() {
      return this.form.systemKey === 'ADMIN';
    },
    availablePermissions() {
      return this.$store.getters['permissions/permissions'] || [];
    },
    filteredPermissions() {
      const q = (this.permissionSearch || '').toLowerCase().trim();
      if (!q) return this.availablePermissions;
      return this.availablePermissions.filter(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q)
      );
    },
  },
  watch: {
    modelValue(isOpen) {
      if (isOpen) {
        this.error = '';
        this.loading = false;
        this.permissionSearch = '';
        document.body.style.overflow = 'hidden';
        this.$store.dispatch('permissions/fetchPermissions');
        if (this.mode === 'edit' && this.initialData) {
          const perms = this.initialData.permissions || [];
          this.form = {
            id: this.initialData.id || this.initialData._id || '',
            name: this.initialData.name || '',
            description: this.initialData.description || '',
            permissionIds: perms.map((p) => (typeof p === 'object' ? p.id || p._id : p)).filter(Boolean),
            isSystem: !!this.initialData.isSystem,
            systemKey: this.initialData.systemKey || null,
          };
        } else {
          this.form = { id: '', name: '', description: '', permissionIds: [], isSystem: false, systemKey: null };
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
    isSelected(permId) {
      if (this.isAdminRole) return true;
      return this.form.permissionIds.includes(permId);
    },
    togglePermission(permId) {
      if (this.isAdminRole) return;
      const idx = this.form.permissionIds.indexOf(permId);
      if (idx === -1) {
        this.form.permissionIds = [...this.form.permissionIds, permId];
      } else {
        this.form.permissionIds = this.form.permissionIds.filter((id) => id !== permId);
      }
    },
    close() {
      this.$emit('update:modelValue', false);
      this.error = '';
      this.loading = false;
    },
    async submit() {
      this.error = '';
      const name = String(this.form.name || '').trim();
      if (!name) { this.error = 'Le nom est requis'; return; }

      this.loading = true;
      try {
        const payload = {
          name,
          description: this.form.description || '',
          permissionIds: this.form.permissionIds,
        };

        if (this.mode === 'edit') {
          if (!this.form.id) { this.error = 'Identifiant manquant'; return; }
          await updateRole(this.form.id, payload);
          const updatedPermissions = this.availablePermissions.filter((p) =>
            this.form.permissionIds.includes(p.id)
          );
          await this.$store.dispatch('roles/updateRole', {
            id: this.form.id,
            ...payload,
            permissions: updatedPermissions,
          });
          this.$emit('saved');
        } else {
          const response = await createRole(payload);
          const created = response?.data || response;
          const id = created?.id || created?._id;
          if (id) {
            const newPermissions = this.availablePermissions.filter((p) =>
              this.form.permissionIds.includes(p.id)
            );
            await this.$store.dispatch('roles/addRole', {
              ...created,
              id,
              permissions: created.permissions || newPermissions,
            });
            this.$emit('saved');
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
/* ── Overlay & Panel ── */
.rfd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  justify-content: flex-end;
  backdrop-filter: blur(2px);
}

.rfd-panel {
  width: 520px;
  max-width: 100%;
  height: 100%;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
}

/* ── Header dégradé ── */
.rfd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, 0.2);
}

.rfd-header__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rfd-header__text { flex: 1; min-width: 0; }

.rfd-header__title {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  margin: 0;
  line-height: 1.3;
}

.rfd-header__sub {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
  margin: 2px 0 0;
}

.rfd-header__close {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  cursor: pointer;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: background 0.15s;
  flex-shrink: 0;
}

.rfd-header__close:hover { background: rgba(255, 255, 255, 0.25); }

/* ── Body ── */
.rfd-body {
  flex: 1;
  overflow-y: auto;
  padding: 24px 24px;
  background: #f9fafb;
}

/* ── Champs ── */
.rfd-field-wrap { display: flex; flex-direction: column; }

.rfd-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: #374151;
  margin-bottom: 6px;
}

.rfd-required { color: #ff3131; margin-left: 2px; }

.rfd-input {
  width: 100%;
  padding: 9px 12px;
  border: 1.5px solid #e5e7eb;
  border-radius: 10px;
  font-size: 0.875rem;
  color: #111827;
  background: #fff;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  font-family: inherit;
  resize: none;
}

.rfd-input:focus {
  border-color: #ff3131;
  box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.08);
}

.rfd-input[readonly] {
  background: #f3f4f6;
  color: #9ca3af;
  cursor: not-allowed;
}

.rfd-textarea {
  resize: vertical;
  min-height: 80px;
  line-height: 1.5;
}

/* ── Recherche permissions ── */
.rfd-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.rfd-search-icon {
  position: absolute;
  left: 11px;
  color: #9ca3af;
  pointer-events: none;
  flex-shrink: 0;
}

.rfd-input--search {
  padding-left: 34px;
}

/* ── Erreur / Info ── */
.rfd-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(255, 49, 49, 0.08);
  border: 1px solid rgba(255, 49, 49, 0.2);
  border-radius: 10px;
  font-size: 0.8125rem;
  color: #ff3131;
}

.rfd-info-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(59, 130, 246, 0.07);
  border: 1px solid rgba(59, 130, 246, 0.18);
  border-radius: 10px;
  font-size: 0.8125rem;
  color: #2563eb;
}

/* ── Section divider ── */
.rfd-section-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: #6b7280;
  margin-bottom: 16px;
}

.rfd-section-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #e5e7eb;
}

/* ── Empty state ── */
.rfd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 16px;
  color: #9ca3af;
  font-size: 0.875rem;
  text-align: center;
}

/* ── Liste permissions ── */
.rfd-permissions-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
  max-height: 280px;
  overflow-y: auto;
  border: 1.5px solid #e5e7eb;
  border-radius: 12px;
  padding: 6px;
  background: #fff;
}

.rfd-perm-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 9px 11px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.13s;
}

.rfd-perm-row:hover { background: rgba(255, 49, 49, 0.05); }

.rfd-perm-row--selected { background: rgba(255, 49, 49, 0.06); }

.rfd-perm-row--disabled {
  cursor: not-allowed;
  opacity: 0.7;
}

.rfd-perm-check {
  flex-shrink: 0;
  margin-top: 1px;
}

.rfd-perm-check--on { color: #ff3131; }
.rfd-perm-check--off { color: #d1d5db; }

.rfd-perm-info { flex: 1; min-width: 0; }

.rfd-perm-name {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #111827;
  font-family: 'Courier New', monospace;
}

.rfd-perm-desc {
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 2px;
}

/* ── Compteur ── */
.rfd-selected-count {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.75rem;
  color: #6b7280;
  margin-top: 8px;
}

/* ── Footer ── */
.rfd-footer {
  flex-shrink: 0;
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.06);
}

.rfd-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 22px;
  height: 40px;
  border-radius: 50px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.rfd-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.rfd-btn--ghost {
  background: #f3f4f6;
  color: #374151;
}

.rfd-btn--ghost:hover:not(:disabled) { background: #e5e7eb; }

.rfd-btn--primary {
  background: #ff3131;
  color: #fff;
}

.rfd-btn--primary:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(255, 49, 49, 0.35);
}

/* ── Transition slide ── */
.rfd-slide-enter-active,
.rfd-slide-leave-active { transition: opacity 0.25s ease; }
.rfd-slide-enter-active .rfd-panel,
.rfd-slide-leave-active .rfd-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.rfd-slide-enter-from,
.rfd-slide-leave-to { opacity: 0; }
.rfd-slide-enter-from .rfd-panel,
.rfd-slide-leave-to .rfd-panel { transform: translateX(100%); }
</style>
