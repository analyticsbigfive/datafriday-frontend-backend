<template>
  <Teleport to="body">
    <Transition name="ued-slide">
      <div v-if="modelValue" class="ued-overlay" @mousedown.self="close">
        <div class="ued-panel" :class="{ 'ued--dark': isDark }">

          <!-- Header dégradé -->
          <div class="ued-header">
            <div class="ued-header__icon"><UserCog :size="20" color="white" /></div>
            <div class="ued-header__text">
              <p class="ued-header__title">{{ t('userList.drawerEditTitle') }}</p>
              <p class="ued-header__sub">{{ t('userList.drawerEditSubtitle') }}</p>
            </div>
            <button class="ued-header__close" @click="close"><X :size="16" /></button>
          </div>

          <div class="ued-body">

            <!-- Stepper -->
            <div class="ued-stepper">
              <div class="ued-step" :class="{ active: currentStep === 1, done: currentStep > 1 }">
                <div class="ued-step-dot">
                  <Check v-if="currentStep > 1" :size="14" />
                  <span v-else>1</span>
                </div>
                <span class="ued-step-label">Informations</span>
              </div>
              <div class="ued-step-line" :class="{ done: currentStep > 1 }" />
              <div class="ued-step" :class="{ active: currentStep === 2 }">
                <div class="ued-step-dot"><span>2</span></div>
                <span class="ued-step-label">Rôle &amp; accès</span>
              </div>
            </div>

            <!-- Erreur -->
            <div v-if="error" class="ued-error">
              <AlertTriangle :size="14" />
              {{ error }}
            </div>

            <!-- Avatar preview -->
            <div class="ued-avatar-row">
              <div class="ued-avatar">{{ initials }}</div>
              <div>
                <div class="ued-avatar__name">{{ fullName || t('userList.noName') }}</div>
                <div class="ued-avatar__email">{{ form.email || '—' }}</div>
              </div>
            </div>

            <!-- ÉTAPE 1 — Informations -->
            <div v-show="currentStep === 1">
              <div class="ued-section">
                <span>{{ t('userList.sectionIdentity') }}</span>
              </div>

              <div class="ued-row">
                <div class="ued-field">
                  <label class="ued-label">{{ t('userList.labelFirstName') }}</label>
                  <input v-model="form.firstName" class="ued-input" :placeholder="t('userList.firstNamePlaceholder')" />
                </div>
                <div class="ued-field">
                  <label class="ued-label">{{ t('userList.labelLastName') }}</label>
                  <input v-model="form.lastName" class="ued-input" :placeholder="t('userList.lastNamePlaceholder')" />
                </div>
              </div>

              <div class="ued-section">
                <span>{{ t('userList.sectionContact') }}</span>
              </div>

              <div class="ued-field">
                <label class="ued-label">{{ t('userList.labelEmail') }}</label>
                <input v-model="form.email" class="ued-input" :placeholder="t('userList.emailPlaceholder')" type="email" />
              </div>

              <div class="ued-field" style="margin-top: 12px;">
                <label class="ued-label">{{ t('userList.labelPhone') }}</label>
                <input v-model="form.phone" class="ued-input" :placeholder="t('userList.phonePlaceholder')" />
              </div>
            </div>

            <!-- ÉTAPE 2 — Rôle & accès -->
            <div v-show="currentStep === 2">
              <div class="ued-section">
                <span>{{ t('userList.labelRole') }}</span>
              </div>

              <div class="ued-field">
                <label class="ued-label">{{ t('userList.labelRole') }}</label>
                <div class="ued-select-wrap">
                  <select v-model="form.roleId" class="ued-select" :disabled="!canChangeRole || rolesLoading">
                    <option value="">{{ rolesLoading ? 'Chargement…' : t('userList.rolePlaceholder') }}</option>
                    <option v-for="r in roleOptions" :key="r.id" :value="r.id">{{ r.name }}</option>
                  </select>
                  <ChevronDown class="ued-select-chevron" :size="15" />
                </div>
                <p v-if="!canChangeRole" class="ued-hint">Seul un administrateur peut modifier le rôle.</p>
              </div>

              <div class="ued-section" style="margin-top: 20px;">
                <span>Espaces accessibles</span>
              </div>

              <div class="ued-space-modes">
                <button
                  v-for="opt in spaceModeOptions"
                  :key="opt.value"
                  type="button"
                  class="ued-space-mode"
                  :class="{ selected: form.spaceMode === opt.value }"
                  @click="form.spaceMode = opt.value"
                >
                  <Globe v-if="opt.value === 'all'" :size="18" />
                  <ListChecks v-else :size="18" />
                  <span>{{ opt.title }}</span>
                </button>
              </div>

              <div v-if="form.spaceMode === 'some'" class="ued-field" style="margin-top: 12px;">
                <label class="ued-label">Sélection des espaces</label>
                <div class="ued-space-list">
                  <label v-for="space in spacesList" :key="space.id" class="ued-space-check">
                    <input type="checkbox" :value="space.id" v-model="form.spaceIds" />
                    <span>{{ space.name }}</span>
                  </label>
                  <p v-if="!spacesList.length" class="ued-hint" style="padding: 8px 0;">Aucun espace disponible</p>
                </div>
              </div>

              <p class="ued-hint" style="margin-top: 12px;">
                « Tous » inclut les espaces présents et futurs. Le propriétaire voit toujours tout. L'accès est indépendant du rôle.
              </p>
            </div>

          </div>

          <!-- Footer -->
          <div class="ued-footer">
            <button v-if="currentStep === 2" class="ued-btn ued-btn--ghost" @click="prevStep">
              <ChevronLeft :size="16" /> Précédent
            </button>
            <button v-else class="ued-btn ued-btn--ghost" @click="close">
              {{ t('userList.cancel') }}
            </button>

            <button v-if="currentStep === 1" class="ued-btn ued-btn--primary" @click="nextStep">
              Suivant <ChevronRight :size="16" />
            </button>
            <button v-else class="ued-btn ued-btn--primary" :disabled="loading" @click="submit">
              <v-progress-circular v-if="loading" indeterminate size="14" width="2" color="white" />
              <Save v-else :size="15" />
              {{ t('userList.save') }}
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { X, Save, UserCog, Check, ChevronLeft, ChevronRight, ChevronDown, Globe, ListChecks, AlertTriangle } from 'lucide-vue-next';
import { updateUser, getUser, changeUserRole } from '@/api/endpoints/user.api';
import { getSpacesLight } from '@/api/endpoints/space.api';

export default {
  name: 'UserEditDrawer',
  components: { X, Save, UserCog, Check, ChevronLeft, ChevronRight, ChevronDown, Globe, ListChecks, AlertTriangle },
  props: {
    modelValue: { type: Boolean, default: false },
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
      form: { id: '', firstName: '', lastName: '', email: '', phone: '', roleId: '', spaceMode: 'all', spaceIds: [] },
      originalRoleId: '',
      currentStep: 1,
      spacesList: [],
      loading: false,
      rolesLoading: false,
      error: '',
    };
  },
  computed: {
    roleOptions() {
      return this.$store.getters['roles/roles'] || [];
    },
    canChangeRole() {
      return this.$store.getters['auth/can']('org.users.changeRole');
    },
    spaceModeOptions() {
      return [
        { title: 'Tous les espaces', value: 'all' },
        { title: 'Espaces spécifiques', value: 'some' },
      ];
    },
    fullName() {
      return [this.form.firstName, this.form.lastName].filter(Boolean).join(' ');
    },
    initials() {
      const f = (this.form.firstName || '')[0] || '';
      const l = (this.form.lastName || '')[0] || '';
      return (f + l).toUpperCase() || '?';
    },
  },
  watch: {
    modelValue(isOpen) {
      if (isOpen) {
        this.error = '';
        this.loading = false;
        this.currentStep = 1;
        document.body.style.overflow = 'hidden';
        this.loadRoles();
        const role = (this.initialData && this.initialData.role) || {};
        this.form = {
          id: (this.initialData && (this.initialData.id || this.initialData._id)) || '',
          firstName: (this.initialData && this.initialData.firstName) || '',
          lastName: (this.initialData && this.initialData.lastName) || '',
          email: (this.initialData && this.initialData.email) || '',
          phone: (this.initialData && this.initialData.phone) || '',
          roleId: (this.initialData && (this.initialData.roleId || role.id || role._id)) || '',
          spaceMode: 'all',
          spaceIds: [],
        };
        this.originalRoleId = this.form.roleId;
        this.loadDetail();
      } else {
        document.body.style.overflow = '';
      }
    },
  },
  beforeUnmount() {
    document.body.style.overflow = '';
  },
  methods: {
    async loadRoles() {
      this.rolesLoading = true;
      try {
        await this.$store.dispatch('roles/fetchRoles');
      } finally {
        this.rolesLoading = false;
      }
    },
    close() {
      this.$emit('update:modelValue', false);
      this.error = '';
    },
    async loadDetail() {
      try {
        this.spacesList = (await getSpacesLight()) || [];
      } catch {
        this.spacesList = [];
      }
      if (!this.form.id) return;
      try {
        const u = await getUser(this.form.id);
        const access = (u.spaceAccess || [])
          .map((a) => a.spaceId || (a.space && a.space.id))
          .filter(Boolean);
        const roleObj = u.role && typeof u.role === 'object' ? u.role : null;
        if (roleObj && roleObj.id) {
          this.form.roleId = roleObj.id;
          this.originalRoleId = roleObj.id;
        } else if (u.roleId) {
          this.form.roleId = u.roleId;
          this.originalRoleId = u.roleId;
        }
        this.form.spaceIds = access;
        this.form.spaceMode = u.allSpacesAccess ? 'all' : 'some';
      } catch {
        // garde les valeurs initiales en cas d'échec
      }
    },
    nextStep() {
      this.error = '';
      if (!this.form.firstName?.trim() && !this.form.lastName?.trim()) {
        this.error = 'Le nom ou prénom est requis';
        return;
      }
      if (!this.form.email?.trim()) {
        this.error = "L'email est requis";
        return;
      }
      this.currentStep = 2;
    },
    prevStep() {
      this.currentStep = 1;
    },
    async submit() {
      this.error = '';
      if (!this.form.id) { this.error = 'Identifiant manquant'; return; }

      const useSome = this.form.spaceMode === 'some';
      // Miroir de UserCreateView : « espaces spécifiques » sans aucune sélection
      // enverrait spaceIds: [] au backend (efface tous les accès). On bloque.
      if (useSome && !(this.form.spaceIds || []).length) {
        this.error = 'Sélectionnez au moins un espace (ou choisissez « Tous »).';
        return;
      }

      this.loading = true;
      try {
        const payload = {
          firstName: this.form.firstName.trim(),
          lastName: this.form.lastName.trim(),
          email: this.form.email.trim(),
          phone: (this.form.phone || '').trim(),
          allSpaces: useSome ? undefined : true,
          spaceIds: useSome ? (this.form.spaceIds || []) : undefined,
        };
        await updateUser(this.form.id, payload);

        if (this.canChangeRole && this.form.roleId && this.form.roleId !== this.originalRoleId) {
          await changeUserRole(this.form.id, { roleId: this.form.roleId });
        }

        // Re-fetch depuis l'API pour refléter le rôle réellement persisté par le
        // backend (un changement refusé/normalisé ne doit pas laisser le store
        // désync). Repli sur le rôle local si le refetch échoue.
        let resolvedRoleId = this.form.roleId;
        let resolvedRole = null;
        try {
          const fresh = await getUser(this.form.id);
          const roleObj = fresh.role && typeof fresh.role === 'object' ? fresh.role : null;
          resolvedRoleId = (roleObj && roleObj.id) || fresh.roleId || this.form.roleId;
          resolvedRole = roleObj || this.roleOptions.find((r) => r.id === resolvedRoleId) || null;
        } catch {
          resolvedRole = this.roleOptions.find((r) => r.id === resolvedRoleId) || null;
        }

        await this.$store.dispatch('users/updateUser', {
          id: this.form.id,
          firstName: payload.firstName,
          lastName: payload.lastName,
          email: payload.email,
          phone: payload.phone,
          roleId: resolvedRoleId,
          role: resolvedRole,
        });
        this.$emit('saved');
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
.ued-overlay {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0, 0, 0, 0.45);
  display: flex; justify-content: flex-end;
  backdrop-filter: blur(2px);
}

.ued-panel {
  width: 520px; height: 100%;
  background: #fff;
  display: flex; flex-direction: column;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.12);
}

/* ── Header ── */
.ued-header {
  display: flex; align-items: center; gap: 14px;
  padding: 20px 24px; flex-shrink: 0;
  background: #ff3131;
  box-shadow: 0 4px 20px rgba(255, 49, 49, 0.25);
}
.ued-header__icon {
  width: 42px; height: 42px; border-radius: 11px;
  background: rgba(255, 255, 255, 0.18);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.ued-header__text { flex: 1; min-width: 0; }
.ued-header__title { font-size: var(--fs-md); font-weight: 700; color: #fff; margin: 0; }
.ued-header__sub { font-size: var(--fs-sm); color: rgba(255, 255, 255, 0.72); margin: 2px 0 0; }
.ued-header__close {
  background: rgba(255, 255, 255, 0.15); border: none; cursor: pointer;
  width: 30px; height: 30px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; transition: background 0.15s; flex-shrink: 0;
}
.ued-header__close:hover { background: rgba(255, 255, 255, 0.25); }

/* ── Body ── */
.ued-body { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 0; }

/* ── Stepper ── */
.ued-stepper { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; }
.ued-step { display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ued-step-dot {
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.8125rem; font-weight: 700;
  border: 2px solid #e5e7eb; color: #9ca3af; background: #fff;
  transition: all 0.2s ease;
}
.ued-step.active .ued-step-dot { border-color: #ff3131; background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255, 49, 49, 0.3); }
.ued-step.done .ued-step-dot { border-color: #ff3131; background: rgba(255, 49, 49, 0.12); color: #ff3131; }
.ued-step-label { font-size: 0.75rem; font-weight: 600; color: #9ca3af; white-space: nowrap; }
.ued-step.active .ued-step-label, .ued-step.done .ued-step-label { color: #374151; }
.ued-step-line { flex: 1; height: 2px; background: #e5e7eb; border-radius: 2px; margin: 0 4px 22px; transition: background 0.2s ease; }
.ued-step-line.done { background: #ff3131; }

/* ── Error ── */
.ued-error {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px; margin-bottom: 16px;
  background: rgba(255, 49, 49, 0.08);
  border: 1px solid rgba(255, 49, 49, 0.2);
  border-radius: 10px;
  font-size: 0.8125rem; color: #ff3131;
}

/* ── Avatar ── */
.ued-avatar-row {
  display: flex; align-items: center; gap: 14px;
  padding: 14px 16px; background: #f9fafb; border-radius: 12px;
  margin-bottom: 20px; border: 1px solid #e5e7eb;
}
.ued-avatar {
  width: 48px; height: 48px; border-radius: 50%;
  background: linear-gradient(135deg, #ff3131, #b91c1c);
  display: flex; align-items: center; justify-content: center;
  font-size: var(--fs-lg); font-weight: var(--fw-bold); color: #fff; flex-shrink: 0; user-select: none;
}
.ued-avatar__name { font-size: 0.9375rem; font-weight: 700; color: #111827; }
.ued-avatar__email { font-size: 0.8125rem; color: #6b7280; margin-top: 2px; }

/* ── Fields ── */
.ued-section {
  display: flex; align-items: center; gap: 8px;
  font-size: 0.6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em;
  color: #6b7280; margin-bottom: 14px; margin-top: 4px;
}
.ued-section::after { content: ''; flex: 1; height: 1px; background: #e5e7eb; }
.ued-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.ued-field { display: flex; flex-direction: column; gap: 6px; }
.ued-label { font-size: 0.8125rem; font-weight: 600; color: #374151; }
.ued-input {
  width: 100%; height: 40px;
  border: 1.5px solid #e5e7eb; border-radius: 10px;
  padding: 0 12px; font-size: 0.875rem; color: #111827;
  background: #fff; outline: none; transition: border-color 0.2s, box-shadow 0.2s;
}
.ued-input:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1); }

/* ── Select ── */
.ued-select-wrap { position: relative; }
.ued-select {
  width: 100%; height: 40px; appearance: none;
  border: 1.5px solid #e5e7eb; border-radius: 10px;
  padding: 0 36px 0 12px; font-size: 0.875rem; color: #111827;
  background: #fff; outline: none; cursor: pointer; transition: border-color 0.2s;
}
.ued-select:focus { border-color: #ff3131; box-shadow: 0 0 0 3px rgba(255, 49, 49, 0.1); }
.ued-select:disabled { opacity: 0.6; cursor: not-allowed; }
.ued-select-chevron { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); color: #9ca3af; pointer-events: none; }

/* ── Space modes ── */
.ued-space-modes { display: flex; gap: 10px; }
.ued-space-mode {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;
  padding: 12px 8px; border: 1.5px solid #e5e7eb; border-radius: 12px;
  background: #fff; color: #6b7280; font-size: 0.8125rem; font-weight: 600;
  cursor: pointer; transition: all 0.18s;
}
.ued-space-mode:hover { border-color: #d1d5db; }
.ued-space-mode.selected { border-color: #ff3131; background: rgba(255, 49, 49, 0.06); color: #ff3131; }

/* ── Space checklist ── */
.ued-space-list {
  max-height: 180px; overflow-y: auto;
  border: 1.5px solid #e5e7eb; border-radius: 10px;
  padding: 4px 0;
}
.ued-space-check {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px; cursor: pointer; transition: background 0.15s;
  font-size: 0.875rem; color: #374151;
}
.ued-space-check:hover { background: #f9fafb; }
.ued-space-check input[type="checkbox"] { accent-color: #ff3131; width: 15px; height: 15px; }

.ued-hint { font-size: 0.75rem; color: #9ca3af; margin: 0; }

/* ── Footer ── */
.ued-footer {
  padding: 16px 24px; display: flex; align-items: center; justify-content: space-between;
  gap: 12px; border-top: 1px solid #e5e7eb; flex-shrink: 0; background: #f9fafb;
}
.ued-btn {
  display: inline-flex; align-items: center; gap: 7px;
  padding: 0 22px; height: 42px; border-radius: 50px;
  font-size: var(--fs-md); font-weight: 600; cursor: pointer; border: none; transition: all 0.2s;
}
.ued-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.ued-btn--ghost { background: #f3f4f6; color: #374151; }
.ued-btn--ghost:hover:not(:disabled) { background: #e5e7eb; }
.ued-btn--primary { background: #ff3131; color: #fff; }
.ued-btn--primary:hover:not(:disabled) { box-shadow: 0 4px 14px rgba(255, 49, 49, 0.35); }

/* ── Transition ── */
.ued-slide-enter-active, .ued-slide-leave-active { transition: opacity 0.25s ease; }
.ued-slide-enter-active .ued-panel, .ued-slide-leave-active .ued-panel { transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1); }
.ued-slide-enter-from, .ued-slide-leave-to { opacity: 0; }
.ued-slide-enter-from .ued-panel, .ued-slide-leave-to .ued-panel { transform: translateX(100%); }

/* ── Dark mode ── (drawer téléporté sur <body>, piloté par la prop isDark →
   .ued--dark ; header rouge #ff3131 + bouton primaire conservés). */
.ued--dark.ued-panel { background: #1f2937; }
.ued--dark .ued-avatar-row { background: #111827; }
.ued--dark .ued-avatar__name { color: #f9fafb; }
.ued--dark .ued-avatar__email { color: #9ca3af; }
.ued--dark .ued-step-dot { background: #1f2937; border-color: #374151; color: #9ca3af; }
.ued--dark .ued-step-label { color: #9ca3af; }
.ued--dark .ued-step.active .ued-step-label,
.ued--dark .ued-step.done .ued-step-label { color: #e5e7eb; }
.ued--dark .ued-step-line { background: #374151; }
.ued--dark .ued-section { color: #9ca3af; }
.ued--dark .ued-section::after { background: #374151; }
.ued--dark .ued-label { color: #d1d5db; }
.ued--dark .ued-input,
.ued--dark .ued-select { background: #1f2937; border-color: #374151; color: #f9fafb; }
.ued--dark .ued-input::placeholder { color: #9ca3af; }
.ued--dark .ued-select-chevron { color: #9ca3af; }
.ued--dark .ued-space-mode { background: #1f2937; border-color: #374151; color: #d1d5db; }
.ued--dark .ued-space-mode:hover { border-color: #4b5563; }
.ued--dark .ued-space-list { border-color: #374151; }
.ued--dark .ued-space-check { color: #d1d5db; }
.ued--dark .ued-space-check:hover { background: #1f2937; }
.ued--dark .ued-hint { color: #9ca3af; }
.ued--dark .ued-footer { background: #1f2937; border-top-color: #374151; }
.ued--dark .ued-btn--ghost { background: #374151; color: #f9fafb; }
.ued--dark .ued-btn--ghost:hover:not(:disabled) { background: #4b5563; }
</style>
