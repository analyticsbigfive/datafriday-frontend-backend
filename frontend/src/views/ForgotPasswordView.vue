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
        <div v-if="emailSent" class="text-center">
          <div class="state-icon-wrap state-icon--success">
            <CheckCircle :size="32" style="color: #4ade80;" />
          </div>
          <h2 class="card-title">Email envoyé !</h2>
          <p class="card-subtitle">
            Vérifiez votre boîte de réception. Vous devriez recevoir un email avec les instructions dans quelques instants.
          </p>

          <div class="success-banner">
            <CheckCircle :size="18" style="color:#86efac;flex-shrink:0;" />
            <span style="color:#a7f3d0;font-size:14px;">Lien de réinitialisation envoyé à <strong>{{ email }}</strong></span>
          </div>

          <router-link to="/login" class="back-link mt-6 d-inline-flex align-items-center gap-2">
            <ArrowLeft :size="18" />
            <span>Retour à la connexion</span>
          </router-link>
        </div>

        <!-- Form -->
        <div v-else>
          <div class="card-header-block">
            <div class="state-icon-wrap state-icon--primary">
              <KeyRound :size="28" style="color: #ff3131;" />
            </div>
            <h2 class="card-title">Mot de passe oublié ?</h2>
            <p class="card-subtitle">
              Pas de problème. Entrez votre email et nous vous enverrons un lien pour réinitialiser votre mot de passe.
            </p>
          </div>

          <form @submit.prevent="handleSubmit">
            <v-text-field
              v-model="email"
              label="Adresse e-mail"
              type="email"
              placeholder="vous@exemple.com"
              variant="outlined"
              color="#ff3131"
              bg-color="rgba(30,41,59,0.7)"
              base-color="#64748b"
              density="comfortable"
              class="auth-field mb-5"
              :disabled="loading"
              :error-messages="error ? [error] : []"
            />

            <v-btn
              type="submit"
              color="#ff3131"
              block
              size="large"
              rounded="lg"
              class="submit-btn mb-6"
              :loading="loading"
              elevation="0"
            >
              <Send :size="18" class="mr-2" />
              Envoyer le lien
            </v-btn>
          </form>

          <div class="text-center">
            <router-link to="/login" class="back-link d-inline-flex align-items-center gap-2">
              <ArrowLeft :size="18" />
              <span>Retour à la connexion</span>
            </router-link>
          </div>
        </div>
      </div>

      <p class="auth-footer">© 2025 DataFriday. Tous droits réservés.</p>
    </div>
  </div>
</template>

<script>
import { mapActions } from 'vuex'
import { Loader2, Send, ArrowLeft, KeyRound, CheckCircle } from 'lucide-vue-next'

export default {
  name: 'ForgotPasswordView',
  components: { Loader2, Send, ArrowLeft, KeyRound, CheckCircle },

  data() {
    return {
      email: '',
      loading: false,
      error: '',
      emailSent: false
    }
  },

  methods: {
    ...mapActions('auth', ['resetPassword']),

    async handleSubmit() {
      this.error = ''
      if (!this.email) { this.error = "L'adresse e-mail est requise"; return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) { this.error = 'Adresse e-mail invalide'; return; }
      this.loading = true
      try {
        await this.resetPassword(this.email)
        this.emailSent = true
      } catch (error) {
        this.error = error.message || 'Une erreur est survenue'
      } finally {
        this.loading = false
      }
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

/* Logo block */
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

/* Card */
.auth-card {
  background: rgba(30, 41, 59, 0.4);
  backdrop-filter: blur(20px);
  border: 1px solid rgba(51, 65, 85, 0.5);
  border-radius: 24px;
  padding: 44px 40px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

/* State icons */
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

/* Card text */
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

/* Success banner */
.success-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  background: rgba(34, 197, 94, 0.1);
  border: 1px solid rgba(34, 197, 94, 0.25);
  border-radius: 12px;
  padding: 14px 16px;
  margin: 20px 0 0;
  text-align: left;
}

/* Form fields */
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

/* Submit btn */
.submit-btn {
  font-weight: 700;
  font-size: 16px;
  text-transform: none;
  letter-spacing: 0;
}

/* Back link */
.back-link {
  color: #ff3131;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: opacity 0.2s;
}
.back-link:hover { opacity: 0.75; }

/* Footer */
.auth-footer {
  text-align: center;
  color: #334155;
  font-size: 12px;
  margin: 28px 0 0 0;
}
</style>
