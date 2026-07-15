<template>
  <div class="auth-page">
    <div class="auth-card-wrapper">
      <!-- Logo -->
      <div class="auth-logo-block">
        <div class="auth-logo-img-wrap">
          <img :src="require('@/assets/datafriday.png')" alt="DataFriday" class="auth-logo-img" />
        </div>
        <h1 class="auth-brand-name">DataFriday</h1>
        <p class="auth-brand-tag">Intelligence F&B</p>
      </div>

      <!-- Card -->
      <div class="auth-card">

        <!-- Lien invalide / expiré -->
        <div v-if="invalidLink" class="text-center">
          <div class="state-icon-wrap state-icon--error">
            <AlertCircle :size="32" style="color: #f87171;" />
          </div>
          <h2 class="card-title">Lien d'invitation invalide</h2>
          <p class="card-subtitle mb-8">
            Ce lien d'invitation est invalide ou a expiré. Demandez à un administrateur de vous réinviter.
          </p>
          <v-btn
            to="/login"
            color="#ff3131"
            block
            size="large"
            rounded="lg"
            class="submit-btn"
            elevation="0"
          >
            Aller à la connexion
            <ArrowRight :size="18" class="ml-2" />
          </v-btn>
        </div>

        <!-- Formulaire d'activation -->
        <div v-else>
          <div class="card-header-block">
            <div class="state-icon-wrap state-icon--primary">
              <Lock :size="28" style="color: #ff3131;" />
            </div>
            <h2 class="card-title">Bienvenue 👋</h2>
            <p class="card-subtitle">
              <template v-if="email">
                Vous avez été invité avec <strong style="color:#e2e8f0;">{{ email }}</strong>.
              </template>
              Choisissez un mot de passe pour finaliser votre compte.
            </p>
          </div>

          <!-- Server error -->
          <div v-if="serverError" class="error-banner mb-4">
            <AlertCircle :size="18" style="color:#fca5a5;flex-shrink:0;" />
            <span style="color:#fca5a5;font-size:14px;">{{ serverError }}</span>
          </div>

          <form @submit.prevent="handleSubmit">
            <v-text-field
              v-model="password"
              label="Mot de passe"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Minimum 8 caractères"
              variant="outlined"
              color="#ff3131"
              bg-color="rgba(30,41,59,0.7)"
              base-color="#64748b"
              density="comfortable"
              class="auth-field mb-3"
              :disabled="loading"
              :error-messages="errors.password ? [errors.password] : []"
            >
              <template #append-inner>
                <Eye v-if="!showPassword" :size="18" class="eye-icon" @click="showPassword = true" />
                <EyeOff v-else :size="18" class="eye-icon" @click="showPassword = false" />
              </template>
            </v-text-field>

            <v-text-field
              v-model="confirmPassword"
              label="Confirmer le mot de passe"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Confirmez votre mot de passe"
              variant="outlined"
              color="#ff3131"
              bg-color="rgba(30,41,59,0.7)"
              base-color="#64748b"
              density="comfortable"
              class="auth-field mb-5"
              :disabled="loading"
              :error-messages="errors.confirmPassword ? [errors.confirmPassword] : []"
            />

            <v-btn
              type="submit"
              color="#ff3131"
              block
              size="large"
              rounded="lg"
              class="submit-btn"
              :loading="loading"
              elevation="0"
            >
              Activer mon compte
            </v-btn>
          </form>
        </div>
      </div>

      <p class="auth-footer">© 2025 DataFriday. Tous droits réservés.</p>
    </div>
  </div>
</template>

<script>
import { mapActions } from 'vuex'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, AlertCircle, Loader2, Lock, ArrowRight } from 'lucide-vue-next'

export default {
  name: 'AcceptInviteView',
  components: { Eye, EyeOff, AlertCircle, Loader2, Lock, ArrowRight },

  data() {
    return {
      password: '',
      confirmPassword: '',
      showPassword: false,
      loading: false,
      serverError: null,
      invalidLink: false,
      email: '',
      errors: {},
    }
  },

  async mounted() {
    try {
      const { data } = await supabase.auth.getSession()
      if (!data?.session) {
        await new Promise((r) => setTimeout(r, 600))
        const retry = await supabase.auth.getSession()
        if (!retry.data?.session) { this.invalidLink = true; return }
        this.email = retry.data.session.user?.email || ''
      } else {
        this.email = data.session.user?.email || ''
      }
    } catch {
      this.invalidLink = true
    }
  },

  methods: {
    ...mapActions('auth', ['updatePassword', 'fetchCurrentUser', 'checkOnboardingStatus']),

    validate() {
      this.errors = {}
      if (!this.password) this.errors.password = 'Le mot de passe est requis'
      else if (this.password.length < 8) this.errors.password = 'Minimum 8 caractères'
      if (this.password !== this.confirmPassword) this.errors.confirmPassword = 'Les mots de passe ne correspondent pas'
      return Object.keys(this.errors).length === 0
    },

    async handleSubmit() {
      if (!this.validate()) return
      this.loading = true
      this.serverError = null
      try {
        await this.updatePassword(this.password)
        const status = await this.checkOnboardingStatus()
        await this.fetchCurrentUser().catch(() => {})
        this.$router.push(status?.hasOrganization ? '/dashboard' : '/onboarding')
      } catch (error) {
        this.serverError = error?.response?.data?.message || error?.message || 'Impossible d\'activer le compte'
      } finally {
        this.loading = false
      }
    },
  },
}
</script>

<style scoped>
.auth-page {
  min-height: 100vh;
  background: #0f172a;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  background-image: radial-gradient(ellipse at 20% 50%, rgba(255, 49, 49, 0.05) 0%, transparent 50%),
                    radial-gradient(ellipse at 80% 20%, rgba(255, 49, 49, 0.04) 0%, transparent 40%);
}

.auth-card-wrapper {
  width: 100%;
  max-width: 480px;
}

.auth-logo-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 40px;
}

.auth-logo-img-wrap {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: rgba(255, 49, 49, 0.1);
  border: 1px solid rgba(255, 49, 49, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
  box-shadow: 0 8px 32px rgba(255, 49, 49, 0.15);
}

.auth-logo-img {
  width: 44px;
  height: 44px;
  object-fit: contain;
}

.auth-brand-name {
  color: white;
  font-size: 26px;
  font-weight: 700;
  margin: 0 0 4px 0;
}

.auth-brand-tag {
  color: #ff3131;
  font-size: 13px;
  margin: 0;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.auth-card {
  background: rgba(30, 41, 59, 0.4);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(51, 65, 85, 0.5);
  border-radius: 24px;
  padding: 44px 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.state-icon-wrap {
  width: 60px;
  height: 60px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 20px;
}

.state-icon--primary {
  background: rgba(255, 49, 49, 0.12);
  border: 1px solid rgba(255, 49, 49, 0.2);
}

.state-icon--error {
  background: rgba(255, 49, 49, 0.12);
  border: 1px solid rgba(255, 49, 49, 0.2);
}

.card-header-block {
  text-align: center;
  margin-bottom: 28px;
}

.card-title {
  color: white;
  font-size: 26px;
  font-weight: 700;
  margin: 0 0 12px 0;
  line-height: 1.25;
}

.card-subtitle {
  color: #94a3b8;
  font-size: 15px;
  margin: 0;
  line-height: 1.65;
}

/* Error banner */
.error-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(255, 49, 49, 0.1);
  border: 1px solid rgba(255, 49, 49, 0.25);
  border-radius: 12px;
  padding: 14px 16px;
}

/* Fields */
:deep(.auth-field .v-field__input) {
  color: white !important;
  -webkit-text-fill-color: white !important;
}
:deep(.auth-field .v-field__input::placeholder) {
  color: #475569 !important;
  -webkit-text-fill-color: #475569 !important;
}
:deep(.auth-field .v-label) {
  color: #64748b !important;
}
:deep(.auth-field .v-field--focused .v-label) {
  color: #ff3131 !important;
}
:deep(.auth-field .v-field__outline__start),
:deep(.auth-field .v-field__outline__notch),
:deep(.auth-field .v-field__outline__end) {
  border-color: rgba(51, 65, 85, 0.8) !important;
}
:deep(.auth-field .v-field--focused .v-field__outline__start),
:deep(.auth-field .v-field--focused .v-field__outline__notch),
:deep(.auth-field .v-field--focused .v-field__outline__end) {
  border-color: #ff3131 !important;
}

.eye-icon {
  cursor: pointer;
  color: #64748b;
  transition: color 0.2s;
}
.eye-icon:hover { color: #94a3b8; }

.submit-btn {
  font-weight: 700;
  font-size: 16px;
  text-transform: none;
  letter-spacing: 0;
}

.auth-footer {
  text-align: center;
  color: #334155;
  font-size: 12px;
  margin: 28px 0 0 0;
}
</style>
