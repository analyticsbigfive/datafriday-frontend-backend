<template>
  <v-app>
    <div class="container-fluid px-0">
      <div class="row g-0" style="min-height: 100vh;">
        <!-- Hero gauche -->
        <div class="col-lg-7 d-none d-lg-flex px-0">
          <v-parallax
            class="parallax-img"
            height="100vh"
            src="https://images.unsplash.com/photo-1556742111-a301076d9d18?q=80&w=2070&auto=format&fit=crop"
          >
            <div class="parallax-overlay">
              <div class="brand-header">
                <img :src="require('@/assets/datafriday.png')" alt="DataFriday Logo" class="brand-logo" />
                <div>
                  <p class="brand-name">Data Friday</p>
                  <p class="brand-tagline">Intelligence F&B</p>
                </div>
              </div>
              <h1 class="parallax-title">
                Rejoignez des milliers de
                <span class="highlight">restaurateurs</span>
              </h1>
              <p class="parallax-subtitle">
                Créez votre compte gratuitement et découvrez comment Data Friday peut transformer votre gestion de restaurant.
              </p>
              <div class="features-list">
                <div class="feature-item">
                  <div class="feature-icon">✓</div>
                  <span>Accès immédiat, aucune carte bancaire</span>
                </div>
                <div class="feature-item">
                  <div class="feature-icon">✓</div>
                  <span>Données synchronisées en temps réel</span>
                </div>
                <div class="feature-item">
                  <div class="feature-icon">✓</div>
                  <span>Support dédié pendant l'onboarding</span>
                </div>
              </div>
            </div>
          </v-parallax>
        </div>

        <!-- Panneau formulaire -->
        <div class="col-lg-5 box-form d-flex align-items-center">
          <div class="form-inner w-100">
            <!-- Logo mobile -->
            <div class="d-flex d-lg-none align-items-center mb-8 gap-3">
              <img :src="require('@/assets/datafriday.png')" alt="Logo" style="width:36px;height:36px;object-fit:contain;" />
              <div>
                <p style="color:white;font-size:16px;font-weight:700;margin:0;">Data Friday</p>
                <p style="color:#ff3131;font-size:12px;margin:0;">Intelligence F&B</p>
              </div>
            </div>

            <div style="margin-bottom: 36px;">
              <h2 class="form-title">Créer un compte</h2>
              <p class="form-subtitle">Commencez votre essai gratuit aujourd'hui.</p>
            </div>

            <form @submit.prevent="handleSignUp">
              <v-text-field
                v-model="email"
                label="Email professionnel"
                type="email"
                placeholder="vous@exemple.com"
                variant="outlined"
                color="#ff3131"
                bg-color="rgba(30,41,59,0.7)"
                base-color="#64748b"
                density="comfortable"
                class="auth-field mb-3"
                :error-messages="submitted && errors.email ? [errors.email] : []"
              />

              <v-text-field
                v-model="password"
                label="Mot de passe"
                :type="showPassword ? 'text' : 'password'"
                placeholder="••••••••"
                variant="outlined"
                color="#ff3131"
                bg-color="rgba(30,41,59,0.7)"
                base-color="#64748b"
                density="comfortable"
                class="auth-field mb-3"
                :error-messages="submitted && errors.password ? [errors.password] : []"
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
                placeholder="••••••••"
                variant="outlined"
                color="#ff3131"
                bg-color="rgba(30,41,59,0.7)"
                base-color="#64748b"
                density="comfortable"
                class="auth-field mb-5"
                :error-messages="submitted && errors.confirmPassword ? [errors.confirmPassword] : []"
              >
                <template #append-inner>
                  <Eye v-if="!showConfirmPassword" :size="18" class="eye-icon" @click="showConfirmPassword = true" />
                  <EyeOff v-else :size="18" class="eye-icon" @click="showConfirmPassword = false" />
                </template>
              </v-text-field>

              <v-btn
                color="#ff3131"
                type="submit"
                block
                size="large"
                rounded="lg"
                class="submit-btn mb-4"
                :loading="loading"
                elevation="0"
              >
                Créer mon compte
              </v-btn>

              <div class="divider-or">
                <span class="divider-line"></span>
                <span class="divider-text">OU</span>
                <span class="divider-line"></span>
              </div>

              <v-btn
                block
                size="large"
                rounded="lg"
                class="google-btn mt-4 mb-6"
                variant="outlined"
                @click="handleGoogleSignIn"
                elevation="0"
              >
                <svg style="width:20px;height:20px;margin-right:10px;" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continuer avec Google
              </v-btn>

              <p class="text-center" style="color:#64748b;font-size:14px;margin:0 0 16px 0;">
                Vous avez déjà un compte ?
                <router-link to="/login" class="link-accent font-bold ml-1">Se connecter</router-link>
              </p>

              <p class="text-center" style="color:#334155;font-size:12px;margin:0;">
                © 2025 DataFriday. Tous droits réservés.
              </p>
            </form>
          </div>
        </div>
      </div>
    </div>

    <v-alert
      v-if="submitted && authError"
      class="custom_alert alert_error"
      :text="authError || 'Une erreur est survenue lors de l\'inscription. Veuillez réessayer.'"
      title="Erreur d'inscription"
      type="error"
      closable
    />
  </v-app>
</template>

<script>
import { mapActions, mapGetters } from 'vuex'
import { Eye, EyeOff } from 'lucide-vue-next'

export default {
  name: 'SignUpView',
  components: { Eye, EyeOff },

  data() {
    return {
      email: '',
      password: '',
      confirmPassword: '',
      showPassword: false,
      showConfirmPassword: false,
      loading: false,
      submitted: false,
      errors: {}
    }
  },

  computed: {
    ...mapGetters('auth', ['authError'])
  },

  methods: {
    ...mapActions('auth', ['signUp', 'signInWithGoogle']),

    validateForm() {
      this.errors = {}
      if (!this.email) this.errors.email = "L'email est requis"
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email)) this.errors.email = "Format d'email invalide"
      if (!this.password) this.errors.password = 'Le mot de passe est requis'
      else if (this.password.length < 6) this.errors.password = 'Minimum 6 caractères'
      if (!this.confirmPassword) this.errors.confirmPassword = 'Veuillez confirmer votre mot de passe'
      else if (this.password !== this.confirmPassword) this.errors.confirmPassword = 'Les mots de passe ne correspondent pas'
      return Object.keys(this.errors).length === 0
    },

    async handleSignUp() {
      this.submitted = true
      if (!this.validateForm()) return
      this.loading = true
      try {
        await this.signUp({ email: this.email, password: this.password })
        this.$router.push(`/verify-email?email=${encodeURIComponent(this.email)}`)
      } catch {}
      finally { this.loading = false }
    },

    async handleGoogleSignIn() {
      this.loading = true
      try { await this.signInWithGoogle() }
      catch {}
      finally { this.loading = false }
    }
  }
}
</script>

<style scoped>
.box-form {
  background: #0f172a;
  min-height: 100vh;
  padding: 48px;
}

.form-inner {
  max-width: 440px;
  margin: 0 auto;
}

.form-title {
  color: white;
  font-size: 32px;
  font-weight: 700;
  margin: 0 0 10px 0;
  line-height: 1.2;
}

.form-subtitle {
  color: #64748b;
  font-size: 16px;
  margin: 0;
}

.parallax-img { z-index: 1; }

.parallax-overlay {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 60px 60px 200px 80px;
  background: linear-gradient(135deg, rgba(10,15,40,0.9) 0%, rgba(30,10,10,0.7) 100%);
}

.brand-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 64px;
}

.brand-logo {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.brand-name {
  color: white;
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  line-height: 1.2;
}

.brand-tagline {
  color: #ff3131;
  font-size: 13px;
  margin: 0;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.parallax-title {
  color: white;
  font-size: 50px;
  font-weight: 800;
  line-height: 1.15;
  margin-bottom: 24px;
  max-width: 540px;
}

.highlight { color: #ff3131; }

.parallax-subtitle {
  color: #cbd5e1;
  font-size: 17px;
  line-height: 1.7;
  max-width: 480px;
  margin: 0 0 40px 0;
}

.features-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #cbd5e1;
  font-size: 15px;
}

.feature-icon {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(255, 49, 49, 0.15);
  border: 1px solid rgba(255, 49, 49, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ff3131;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
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

.link-accent {
  color: #ff3131;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  transition: opacity 0.2s;
}
.link-accent:hover { opacity: 0.8; }

.submit-btn {
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0;
  text-transform: none;
}

.google-btn {
  border-color: rgba(51, 65, 85, 0.8) !important;
  color: #e2e8f0 !important;
  font-weight: 600;
  font-size: 15px;
  text-transform: none;
  background: rgba(30, 41, 59, 0.5) !important;
  transition: all 0.2s;
}
.google-btn:hover {
  border-color: rgba(100, 116, 139, 0.8) !important;
  background: rgba(30, 41, 59, 0.8) !important;
}

.divider-or {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0;
}
.divider-line {
  flex: 1;
  height: 1px;
  background: rgba(51, 65, 85, 0.7);
}
.divider-text {
  color: #475569;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
}

.custom_alert {
  z-index: 9999;
  position: fixed;
  top: 25px;
  right: 2%;
  width: 25%;
}
</style>
