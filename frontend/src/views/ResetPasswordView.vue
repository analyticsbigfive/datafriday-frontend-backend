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
        <!-- Success -->
        <div v-if="success" class="text-center">
          <div class="state-icon-wrap state-icon--success">
            <CheckCircle :size="32" style="color: #4ade80;" />
          </div>
          <h2 class="card-title">Mot de passe mis à jour !</h2>
          <p class="card-subtitle" style="margin-bottom: 32px;">
            Votre mot de passe a été réinitialisé avec succès.
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
            Se connecter
            <ArrowRight :size="18" class="ml-2" />
          </v-btn>
        </div>

        <!-- Form -->
        <div v-else>
          <div class="card-header-block">
            <div class="state-icon-wrap state-icon--primary">
              <Lock :size="28" style="color: #ff3131;" />
            </div>
            <h2 class="card-title">Nouveau mot de passe</h2>
            <p class="card-subtitle">Choisissez un mot de passe sécurisé pour votre compte</p>
          </div>

          <!-- Global error -->
          <div v-if="authError" class="error-banner mb-4">
            <AlertCircle :size="18" style="color:#fca5a5;flex-shrink:0;" />
            <span style="color:#fca5a5;font-size:14px;">{{ authError }}</span>
          </div>

          <form @submit.prevent="handleSubmit">
            <v-text-field
              v-model="password"
              label="Nouveau mot de passe"
              :type="showPassword ? 'text' : 'password'"
              placeholder="Minimum 6 caractères"
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
              :type="showConfirmPassword ? 'text' : 'password'"
              placeholder="Confirmez votre mot de passe"
              variant="outlined"
              color="#ff3131"
              bg-color="rgba(30,41,59,0.7)"
              base-color="#64748b"
              density="comfortable"
              class="auth-field mb-5"
              :disabled="loading"
              :error-messages="errors.confirmPassword ? [errors.confirmPassword] : []"
            >
              <template #append-inner>
                <Eye v-if="!showConfirmPassword" :size="18" class="eye-icon" @click="showConfirmPassword = true" />
                <EyeOff v-else :size="18" class="eye-icon" @click="showConfirmPassword = false" />
              </template>
            </v-text-field>

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
              Réinitialiser le mot de passe
            </v-btn>
          </form>
        </div>
      </div>

      <p class="auth-footer">© 2025 DataFriday. Tous droits réservés.</p>
    </div>
  </div>
</template>

<script>
import { mapActions, mapGetters } from 'vuex'
import { Eye, EyeOff, AlertCircle, Lock, CheckCircle, ArrowRight } from 'lucide-vue-next'

export default {
  name: 'ResetPasswordView',
  components: { Eye, EyeOff, AlertCircle, Lock, CheckCircle, ArrowRight },

  data() {
    return {
      password: '',
      confirmPassword: '',
      showPassword: false,
      showConfirmPassword: false,
      loading: false,
      success: false,
      errors: {}
    }
  },

  computed: {
    ...mapGetters('auth', ['authError'])
  },

  methods: {
    ...mapActions('auth', ['updatePassword']),

    validateForm() {
      this.errors = {}
      if (!this.password) this.errors.password = 'Le mot de passe est requis'
      else if (this.password.length < 6) this.errors.password = 'Minimum 6 caractères'
      if (!this.confirmPassword) this.errors.confirmPassword = 'Veuillez confirmer votre mot de passe'
      else if (this.password !== this.confirmPassword) this.errors.confirmPassword = 'Les mots de passe ne correspondent pas'
      return Object.keys(this.errors).length === 0
    },

    async handleSubmit() {
      if (!this.validateForm()) return
      this.loading = true
      try {
        await this.updatePassword(this.password)
        this.success = true
      } catch {}
      finally { this.loading = false }
    }
  }
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
  max-width: 460px;
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

.state-icon--success {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.card-header-block {
  text-align: center;
  margin-bottom: 32px;
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

.error-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(255, 49, 49, 0.1);
  border: 1px solid rgba(255, 49, 49, 0.25);
  border-radius: 12px;
  padding: 14px 16px;
}

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
