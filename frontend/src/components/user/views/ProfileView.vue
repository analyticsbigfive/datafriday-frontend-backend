<template>
  <div class="pv-page" :class="{ 'pv--dark': isDark }">

    <!-- Banner compact -->
    <div class="pv-banner">
      <div class="pv-banner-bg" />
      <div class="pv-banner-content">
        <div class="pv-avatar">{{ initials }}</div>
        <div class="pv-hero-info">
          <span class="pv-hero-name">{{ fullName }}</span>
          <span v-if="roleName" class="pv-role-chip">{{ roleName }}</span>
          <span class="pv-hero-sep">·</span>
          <span class="pv-hero-email">{{ profileData.email }}</span>
        </div>

        <!-- Org info côté droit -->
        <div v-if="orgName" class="pv-banner-org">
          <div class="pv-banner-org-name">{{ orgName }}</div>
          <div v-if="orgInvitationCode" class="pv-banner-org-code">
            <span>{{ orgInvitationCode }}</span>
            <button class="pv-copy-btn pv-copy-btn--white" @click="copyCode" :title="copied ? t('profileCopied') : t('profileCopy')">
              <Check :size="12" v-if="copied" /><Copy :size="12" v-else />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Contenu : 60 / 40 -->
    <div class="pv-content">

      <!-- Colonne gauche : Informations personnelles -->
      <div class="pv-col pv-col--main">
        <div class="pv-card">
          <div class="pv-card-header">
            <div class="pv-card-header-icon"><UserCog :size="16" /></div>
            <div>
              <div class="pv-card-title">{{ t('profilePersonalInfoTitle') }}</div>
              <div class="pv-card-subtitle">{{ t('profilePersonalInfoSubtitle') }}</div>
            </div>
          </div>
          <div class="pv-card-body">
            <div class="pv-row">
              <div class="pv-field">
                <label class="pv-label">{{ t('profileFirstName') }}</label>
                <input v-model="form.firstName" class="pv-input" :placeholder="t('profileFirstNamePlaceholder')" :disabled="savingProfile" />
              </div>
              <div class="pv-field">
                <label class="pv-label">{{ t('profileLastName') }}</label>
                <input v-model="form.lastName" class="pv-input" :placeholder="t('profileLastNamePlaceholder')" :disabled="savingProfile" />
              </div>
            </div>
            <div class="pv-field">
              <label class="pv-label">{{ t('profileEmail') }} <span class="pv-badge-readonly">{{ t('profileReadonly') }}</span></label>
              <div class="pv-input pv-input--readonly">{{ profileData.email }}</div>
            </div>
            <div class="pv-field">
              <label class="pv-label">{{ t('profilePhone') }}</label>
              <input v-model="form.phone" class="pv-input" :placeholder="t('profilePhonePlaceholder')" type="tel" :disabled="savingProfile" />
            </div>
          </div>
          <div class="pv-card-footer">
            <div v-if="profileSuccess" class="pv-feedback pv-feedback--ok"><CheckCircle :size="15" class="mr-1" />{{ t('profileUpdated') }}</div>
            <div v-if="profileError" class="pv-feedback pv-feedback--err"><AlertCircle :size="15" class="mr-1" />{{ profileError }}</div>
            <button class="pv-btn pv-btn--primary" :class="{ 'pv-btn--loading': savingProfile }" :disabled="savingProfile" @click="saveProfile">
              <span v-if="savingProfile" class="pv-spinner" />
              <Save :size="15" v-else class="mr-1" />
              {{ t('profileSave') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Colonne droite : Sécurité + Organisation + Compte -->
      <div class="pv-col pv-col--side">

        <!-- Sécurité -->
        <div class="pv-card">
          <div class="pv-card-header">
            <div class="pv-card-header-icon"><Lock :size="16" /></div>
            <div>
              <div class="pv-card-title">{{ t('profileSecurity') }}</div>
              <div class="pv-card-subtitle">{{ t('profileSecuritySubtitle') }}</div>
            </div>
          </div>
          <div class="pv-card-body">
            <div class="pv-field">
              <label class="pv-label">{{ t('profileNewPassword') }}</label>
              <div class="pv-input-wrap">
                <input v-model="form.newPassword" :type="showNewPwd ? 'text' : 'password'" class="pv-input pv-input--pwd" placeholder="••••••••" :disabled="savingPassword" autocomplete="new-password" />
                <button type="button" class="pv-eye-btn" @click="showNewPwd = !showNewPwd">
                  <Eye :size="16" v-if="!showNewPwd" /><EyeOff :size="16" v-else />
                </button>
              </div>
              <div v-if="form.newPassword" class="pv-strength">
                <div class="pv-strength-bars">
                  <div v-for="i in 4" :key="i" class="pv-strength-bar" :class="{ 'pv-strength-bar--active': passwordStrength >= i, [`pv-strength-bar--${passwordStrengthColor}`]: passwordStrength >= i }" />
                </div>
                <span class="pv-strength-label" :class="`pv-strength-label--${passwordStrengthColor}`">{{ passwordStrengthLabel }}</span>
              </div>
            </div>
            <div class="pv-field">
              <label class="pv-label">{{ t('profileConfirmPassword') }}</label>
              <div class="pv-input-wrap">
                <input v-model="form.confirmPassword" :type="showConfirmPwd ? 'text' : 'password'" class="pv-input pv-input--pwd" :class="{ 'pv-input--err': form.confirmPassword && form.newPassword !== form.confirmPassword }" placeholder="••••••••" :disabled="savingPassword" autocomplete="new-password" />
                <button type="button" class="pv-eye-btn" @click="showConfirmPwd = !showConfirmPwd">
                  <Eye :size="16" v-if="!showConfirmPwd" /><EyeOff :size="16" v-else />
                </button>
              </div>
              <div v-if="form.confirmPassword && form.newPassword !== form.confirmPassword" class="pv-field-err">{{ t('profilePasswordMismatch') }}</div>
            </div>
          </div>
          <div class="pv-card-footer">
            <div v-if="passwordSuccess" class="pv-feedback pv-feedback--ok"><CheckCircle :size="15" class="mr-1" />{{ t('profilePasswordUpdated') }}</div>
            <div v-if="passwordError" class="pv-feedback pv-feedback--err"><AlertCircle :size="15" class="mr-1" />{{ passwordError }}</div>
            <button class="pv-btn pv-btn--primary" :class="{ 'pv-btn--loading': savingPassword }" :disabled="savingPassword || !canSavePassword" @click="savePassword">
              <span v-if="savingPassword" class="pv-spinner" />
              <Lock :size="15" v-else class="mr-1" />
              {{ t('profileUpdate') }}
            </button>
          </div>
        </div>

      </div>
    </div>

    <!-- Loading overlay -->
    <div v-if="loading" class="pv-loading-overlay">
      <div class="pv-loading-spinner" />
    </div>

  </div>
</template>

<script>
import { mapGetters, mapActions } from 'vuex'
import { useTheme } from 'vuetify'
import { computed } from 'vue'
import api from '@/lib/api'
import { useI18n } from '@/i18n/useI18n'
import {
  UserCog, Lock, Save, Eye, EyeOff,
  CheckCircle, AlertCircle,
  Copy, Check,
} from 'lucide-vue-next'

export default {
  name: 'ProfileView',

  components: {
    UserCog, Lock, Save, Eye, EyeOff,
    CheckCircle, AlertCircle,
    Copy, Check,
  },

  setup() {
    const theme = useTheme()
    const { t } = useI18n()
    const isDark = computed(() => !!theme.global.current.value.dark)
    return { isDark, t }
  },

  data() {
    return {
      loading: false,
      profileData: {},
      form: { firstName: '', lastName: '', phone: '', newPassword: '', confirmPassword: '' },
      savingProfile: false,
      profileSuccess: false,
      profileError: null,
      savingPassword: false,
      passwordSuccess: false,
      passwordError: null,
      showNewPwd: false,
      showConfirmPwd: false,
      copied: false,
    }
  },

  computed: {
    ...mapGetters('auth', ['currentUser', 'currentTenant', 'userId']),

    tenant() { return this.currentTenant },

    orgName() {
      return this.profileData.tenant?.name || this.currentTenant?.name || null
    },

    orgInvitationCode() {
      return this.profileData.tenant?.invitationCode || this.currentTenant?.invitationCode || null
    },

    initials() {
      const f = this.profileData.firstName || this.form.firstName
      const l = this.profileData.lastName || this.form.lastName
      if (f && l) return `${f[0]}${l[0]}`.toUpperCase()
      return (this.profileData.email?.[0] || 'U').toUpperCase()
    },

    fullName() {
      const f = this.profileData.firstName || ''
      const l = this.profileData.lastName || ''
      if (f || l) return `${f} ${l}`.trim()
      return this.profileData.email?.split('@')[0] || this.t('profileUserFallback')
    },

    roleName() {
      return this.profileData.role?.name || this.profileData.roleName || this.currentUser?.role?.name || null
    },

    passwordStrength() {
      const pwd = this.form.newPassword
      if (!pwd) return 0
      let score = 0
      if (pwd.length >= 8) score++
      if (pwd.length >= 12) score++
      if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++
      if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++
      return score
    },

    passwordStrengthColor() {
      return ['', 'red', 'orange', 'yellow', 'green'][this.passwordStrength] || 'red'
    },

    passwordStrengthLabel() {
      return ['', this.t('profilePwdVeryWeak'), this.t('profilePwdWeak'), this.t('profilePwdMedium'), this.t('profilePwdStrong')][this.passwordStrength] || ''
    },

    canSavePassword() {
      return this.form.newPassword.length >= 6 && this.form.newPassword === this.form.confirmPassword
    },
  },

  async mounted() {
    await this.loadProfile()
  },

  methods: {
    ...mapActions('auth', ['updatePassword']),

    async loadProfile() {
      this.loading = true
      try {
        const response = await api.get('/me')
        this.profileData = response.data || {}
        this.form.firstName = this.profileData.firstName || ''
        this.form.lastName  = this.profileData.lastName  || ''
        this.form.phone     = this.profileData.phone     || ''
      } catch {
        const storeUser = (this.$store.getters['users/users'] || [])
          .find(u => u.id === this.userId || u.email === this.profileData?.email)
        if (storeUser) {
          this.profileData    = storeUser
          this.form.firstName = storeUser.firstName || ''
          this.form.lastName  = storeUser.lastName  || ''
          this.form.phone     = storeUser.phone     || ''
        }
      } finally {
        this.loading = false
      }
    },

    async saveProfile() {
      this.savingProfile = true
      this.profileSuccess = false
      this.profileError   = null
      try {
        // Self-service : /me autorise tout utilisateur authentifié à modifier SON
        // profil (identité + téléphone). /users/:id est réservé aux managers.
        await api.patch('/me', {
          firstName: this.form.firstName,
          lastName:  this.form.lastName,
          phone:     this.form.phone,
        })
        this.profileData  = { ...this.profileData, firstName: this.form.firstName, lastName: this.form.lastName, phone: this.form.phone }
        // Rafraîchit l'identité globale (menu utilisateur en haut à droite).
        this.$store.dispatch('auth/fetchCurrentUser').catch(() => {})
        this.profileSuccess = true
        setTimeout(() => { this.profileSuccess = false }, 3000)
      } catch (err) {
        this.profileError = err?.response?.data?.message || this.t('profileErrorGeneric')
        setTimeout(() => { this.profileError = null }, 4000)
      } finally {
        this.savingProfile = false
      }
    },

    async savePassword() {
      if (!this.canSavePassword) return
      this.savingPassword  = true
      this.passwordSuccess = false
      this.passwordError   = null
      try {
        await this.updatePassword(this.form.newPassword)
        this.form.newPassword     = ''
        this.form.confirmPassword = ''
        this.passwordSuccess = true
        setTimeout(() => { this.passwordSuccess = false }, 3000)
      } catch (err) {
        this.passwordError = err?.message || this.t('profilePasswordError')
        setTimeout(() => { this.passwordError = null }, 4000)
      } finally {
        this.savingPassword = false
      }
    },

    async copyCode() {
      try {
        await navigator.clipboard.writeText(this.orgInvitationCode || '')
        this.copied = true
        setTimeout(() => { this.copied = false }, 2000)
      } catch {}
    },
  },
}
</script>

<style scoped>
/* ── Base ── */
.pv-page {
  min-height: calc(100vh - var(--v-layout-top, 64px) - var(--v-layout-bottom, 0px));
  display: flex;
  flex-direction: column;
  background: rgb(var(--v-theme-background));
  color: rgb(var(--v-theme-on-surface));
  position: relative;
}

/* ── Banner ── */
.pv-banner { position: relative; flex-shrink: 0; }

.pv-banner-bg {
  position: absolute;
  inset: 0;
  background: #ff3131;
}

.pv-banner-bg::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    radial-gradient(circle at 15% 50%, rgba(255,255,255,0.07) 0%, transparent 55%),
    radial-gradient(circle at 85% 30%, rgba(255,255,255,0.05) 0%, transparent 45%);
}


.pv-banner-content {
  position: relative;
  padding: 14px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
}

/* ── Avatar ── */
.pv-avatar {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  border: 2px solid rgba(255,255,255,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 800;
  color: white;
  flex-shrink: 0;
  user-select: none;
}

/* ── Hero info ── */
.pv-hero-info {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pv-hero-name  { font-size: 1rem; font-weight: 700; color: white; white-space: nowrap; }
.pv-hero-email { font-size: 0.8rem; color: rgba(255,255,255,0.75); white-space: nowrap; }
.pv-hero-sep   { color: rgba(255,255,255,0.35); font-size: 0.8rem; }

/* ── Org dans le banner (droite) ── */
.pv-banner-org {
  margin-left: auto;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.pv-banner-org-name {
  font-size: 0.875rem;
  font-weight: 700;
  color: white;
}

.pv-banner-org-code {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.75rem;
  color: rgba(255,255,255,0.65);
  font-family: monospace;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 6px;
  padding: 2px 8px;
}

.pv-copy-btn--white {
  color: rgba(255,255,255,0.6) !important;
}
.pv-copy-btn--white:hover { color: white !important; }

.pv-role-chip {
  background: rgba(255,255,255,0.18);
  color: white;
  border-radius: 20px;
  padding: 1px 8px;
  font-size: 0.68rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border: 1px solid rgba(255,255,255,0.28);
  white-space: nowrap;
}

.pv-role-chip--sm {
  background: rgba(255, 49, 49,0.1);
  color: #ff3131;
  border: 1px solid rgba(255, 49, 49,0.25);
  font-size: 0.68rem;
}

/* ── Layout 60 / 40 ── */
.pv-content {
  flex: 1;
  width: 100%;
  padding: 16px 24px;
  display: flex;
  gap: 16px;
  align-items: flex-start;
  box-sizing: border-box;
}

.pv-col--main { flex: 3; min-width: 0; }
.pv-col--side { flex: 2; min-width: 0; display: flex; flex-direction: column; gap: 12px; }

/* ── Cards ── */
.pv-card {
  background: rgb(var(--v-theme-surface));
  border-radius: 12px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.04);
}

.pv-card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px 9px;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.pv-card-header-icon {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: rgba(255, 49, 49,0.1);
  color: #ff3131;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pv-card-title    { font-size: 0.875rem; font-weight: 700; color: rgb(var(--v-theme-on-surface)); }
.pv-card-subtitle { font-size: 0.72rem; color: rgba(var(--v-theme-on-surface), 0.45); margin-top: 1px; }

.pv-card-body {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pv-card-footer {
  padding: 9px 14px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.pv-card--compact .pv-card-header { padding: 10px 12px 8px; }
.pv-card--compact .pv-card-body   { padding: 10px 12px 12px; gap: 8px; }

/* ── Form ── */
.pv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.pv-field { display: flex; flex-direction: column; gap: 4px; }

.pv-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
  display: flex;
  align-items: center;
  gap: 6px;
}

.pv-badge-readonly {
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), 0.4);
  border-radius: 8px;
  padding: 1px 7px;
  font-size: 0.68rem;
  font-weight: 500;
}

.pv-input {
  width: 100%;
  height: 34px;
  border: 1.5px solid rgba(var(--v-theme-on-surface), 0.14);
  border-radius: 8px;
  padding: 0 10px;
  font-size: 0.8125rem;
  background: rgba(var(--v-theme-on-surface), 0.03);
  color: rgb(var(--v-theme-on-surface));
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
}

.pv-input:focus { border-color: #ff3131; box-shadow: 0 0 0 2px rgba(255, 49, 49,0.1); }
.pv-input:disabled { opacity: 0.6; cursor: not-allowed; }

.pv-input--readonly {
  display: flex;
  align-items: center;
  background: rgba(var(--v-theme-on-surface), 0.04);
  color: rgba(var(--v-theme-on-surface), 0.55);
  cursor: default;
  user-select: all;
}

.pv-input--err { border-color: #ff3131 !important; }
.pv-field-err  { font-size: 0.75rem; color: #ff3131; margin-top: 2px; }

/* ── Password ── */
.pv-input-wrap { position: relative; }
.pv-input--pwd { padding-right: 40px; }

.pv-eye-btn {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.4);
  display: flex;
  align-items: center;
  transition: color 0.15s;
}
.pv-eye-btn:hover { color: rgba(var(--v-theme-on-surface), 0.7); }

.pv-strength { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.pv-strength-bars { display: flex; gap: 4px; flex: 1; }

.pv-strength-bar {
  height: 3px;
  flex: 1;
  border-radius: 2px;
  background: rgba(var(--v-theme-on-surface), 0.1);
  transition: background 0.3s;
}

.pv-strength-bar--active.pv-strength-bar--red    { background: #ff3131; }
.pv-strength-bar--active.pv-strength-bar--orange { background: #f97316; }
.pv-strength-bar--active.pv-strength-bar--yellow { background: #eab308; }
.pv-strength-bar--active.pv-strength-bar--green  { background: #22c55e; }

.pv-strength-label { font-size: 0.72rem; font-weight: 600; min-width: 60px; text-align: right; }
.pv-strength-label--red    { color: #ff3131; }
.pv-strength-label--orange { color: #f97316; }
.pv-strength-label--yellow { color: #eab308; }
.pv-strength-label--green  { color: #22c55e; }

/* ── Buttons ── */
.pv-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.pv-btn--primary { background: #ff3131; color: white; }
.pv-btn--primary:hover:not(:disabled) { background: #b71c1c; transform: translateY(-1px); box-shadow: 0 4px 12px rgba(255, 49, 49,0.3); }
.pv-btn:disabled { opacity: 0.55; cursor: not-allowed; transform: none !important; box-shadow: none !important; }
.pv-btn--loading { pointer-events: none; }

.pv-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: pv-spin 0.7s linear infinite;
}

@keyframes pv-spin { to { transform: rotate(360deg); } }

/* ── Feedback ── */
.pv-feedback { display: flex; align-items: center; font-size: 0.78rem; font-weight: 500; margin-right: auto; }
.pv-feedback--ok  { color: #22c55e; }
.pv-feedback--err { color: #ff3131; }

/* ── Org rows ── */
.pv-org-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.05);
}
.pv-org-row:last-child { border-bottom: none; }
.pv-org-label { font-size: 0.75rem; color: rgba(var(--v-theme-on-surface), 0.5); font-weight: 500; }
.pv-org-value { font-size: 0.8125rem; font-weight: 600; color: rgb(var(--v-theme-on-surface)); display: flex; align-items: center; gap: 6px; }
.pv-org-code  { font-family: monospace; background: rgba(var(--v-theme-on-surface), 0.06); padding: 2px 8px; border-radius: 6px; font-size: 0.8rem; }
.pv-org-id    { font-family: monospace; font-size: 0.78rem; color: rgba(var(--v-theme-on-surface), 0.55); }

.pv-copy-btn {
  background: none;
  border: none;
  padding: 2px 4px;
  cursor: pointer;
  color: rgba(var(--v-theme-on-surface), 0.4);
  display: flex;
  align-items: center;
  transition: color 0.15s;
  border-radius: 4px;
}
.pv-copy-btn:hover { color: #ff3131; }

/* ── Loading ── */
.pv-loading-overlay {
  position: absolute;
  inset: 0;
  background: rgba(var(--v-theme-background), 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.pv-loading-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid rgba(255, 49, 49,0.2);
  border-top-color: #ff3131;
  border-radius: 50%;
  animation: pv-spin 0.8s linear infinite;
}

/* ── Responsive ── */
@media (max-width: 700px) {
  .pv-content { flex-direction: column; padding: 12px; }
  .pv-col--main, .pv-col--side { flex: none; width: 100%; }
  .pv-row { grid-template-columns: 1fr; }
  .pv-banner-content { padding: 12px 14px; }
}
</style>
