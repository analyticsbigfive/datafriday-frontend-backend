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
      <div class="auth-card text-center">

        <!-- Loading -->
        <div v-if="verifying">
          <div class="state-icon-wrap state-icon--primary">
            <Loader2 :size="32" style="color: #ff3131;" class="animate-spin" />
          </div>
          <h2 class="card-title">Vérification en cours...</h2>
          <p class="card-subtitle">Veuillez patienter pendant que nous vérifions votre email.</p>
        </div>

        <!-- Success -->
        <div v-else-if="verified">
          <div class="state-icon-wrap state-icon--success">
            <CheckCircle :size="32" style="color: #4ade80;" />
          </div>
          <h2 class="card-title">Email vérifié !</h2>
          <p class="card-subtitle mb-8">
            Votre adresse email a été confirmée avec succès. Vous pouvez maintenant vous connecter.
          </p>
          <v-btn
            to="/login"
            color="#ff3131"
            block
            size="large"
            rounded="lg"
            class="action-btn"
            elevation="0"
          >
            Se connecter
            <ArrowRight :size="18" class="ml-2" />
          </v-btn>
        </div>

        <!-- Error -->
        <div v-else-if="error">
          <div class="state-icon-wrap state-icon--error">
            <XCircle :size="32" style="color: #f87171;" />
          </div>
          <h2 class="card-title">Vérification échouée</h2>
          <p class="card-subtitle mb-2">{{ errorMessage }}</p>
          <p style="color: #475569; font-size: 13px; margin: 0 0 32px 0;">
            Le lien a peut-être expiré ou est invalide.
          </p>
          <v-btn
            to="/login"
            variant="outlined"
            block
            size="large"
            rounded="lg"
            class="action-btn-outlined"
            elevation="0"
          >
            <ArrowLeft :size="18" class="mr-2" />
            Retour à la connexion
          </v-btn>
        </div>

        <!-- Pending -->
        <div v-else>
          <div class="state-icon-wrap state-icon--mail">
            <Mail :size="32" style="color: #60a5fa;" />
          </div>
          <h2 class="card-title">Vérifiez votre email</h2>
          <p class="card-subtitle mb-8">
            Un email de confirmation a été envoyé à votre adresse. Cliquez sur le lien dans l'email pour vérifier votre compte.
          </p>

          <v-btn
            color="#ff3131"
            block
            size="large"
            rounded="lg"
            class="action-btn mb-4"
            :loading="resending"
            :disabled="resending || cooldown > 0"
            elevation="0"
            @click="resendEmail"
          >
            <RefreshCw v-if="!resending" :size="18" class="mr-2" />
            <span v-if="cooldown > 0">Renvoyer dans {{ cooldown }}s</span>
            <span v-else-if="resending">Envoi en cours...</span>
            <span v-else>Renvoyer l'email</span>
          </v-btn>

          <router-link to="/login" class="back-link d-inline-flex align-items-center gap-2">
            <ArrowLeft :size="16" />
            <span>Retour à la connexion</span>
          </router-link>
        </div>
      </div>

      <p class="auth-footer">© 2025 DataFriday. Tous droits réservés.</p>
    </div>
  </div>
</template>

<script>
import { mapActions } from 'vuex'
import { supabase } from '@/lib/supabase'
import { Mail, CheckCircle, XCircle, Loader2, ArrowRight, ArrowLeft, RefreshCw } from 'lucide-vue-next'

export default {
  name: 'VerifyEmailView',
  components: { Mail, CheckCircle, XCircle, Loader2, ArrowRight, ArrowLeft, RefreshCw },

  data() {
    return {
      verifying: false,
      verified: false,
      error: false,
      errorMessage: '',
      resending: false,
      cooldown: 0,
      cooldownInterval: null
    }
  },

  mounted() {
    this.handleEmailLink()
  },

  beforeUnmount() {
    if (this.cooldownInterval) clearInterval(this.cooldownInterval)
  },

  methods: {
    ...mapActions('auth', ['verifyEmailToken', 'resendVerificationEmail']),

    async handleEmailLink() {
      const tokenHash = this.$route.query.token_hash || this.$route.query.token
      const type = this.$route.query.type

      if (tokenHash) {
        await this.verifyEmail({ tokenHash, type })
        return
      }

      const hash = typeof window !== 'undefined' ? window.location.hash : ''

      if (hash.includes('error')) {
        const desc = decodeURIComponent(hash.match(/error_description=([^&]+)/)?.[1] || '').replace(/\+/g, ' ')
        this.error = true
        this.errorMessage = desc || 'Le lien de vérification a expiré ou est invalide.'
        return
      }

      if (hash.includes('access_token')) {
        this.verifying = true
        try {
          const { data: { session } } = await supabase.auth.getSession()
          this.verified = !!session
          if (!session) {
            this.error = true
            this.errorMessage = 'Impossible de confirmer la session. Réessayez depuis le lien de l\'email.'
          }
        } catch (error) {
          this.error = true
          this.errorMessage = error.message || 'Une erreur est survenue lors de la vérification'
        } finally {
          this.verifying = false
        }
      }
    },

    async verifyEmail({ tokenHash, type }) {
      this.verifying = true
      this.error = false
      try {
        await this.verifyEmailToken({ tokenHash, type })
        this.verified = true
      } catch (error) {
        this.error = true
        this.errorMessage = error.message || 'Une erreur est survenue lors de la vérification'
      } finally {
        this.verifying = false
      }
    },

    async resendEmail() {
      if (this.resending || this.cooldown > 0) return
      this.resending = true
      try {
        const email = typeof this.$route.query.email === 'string' ? this.$route.query.email : ''
        await this.resendVerificationEmail(email)
        this.cooldown = 60
        this.cooldownInterval = setInterval(() => {
          this.cooldown--
          if (this.cooldown <= 0) { clearInterval(this.cooldownInterval); this.cooldownInterval = null }
        }, 1000)
      } catch (error) {
        this.error = true
        this.errorMessage = error.message || 'Impossible de renvoyer l\'email'
      } finally {
        this.resending = false
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
  width: 64px;
  height: 64px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;
}

.state-icon--primary {
  background: rgba(255, 49, 49, 0.12);
  border: 1px solid rgba(255, 49, 49, 0.2);
}

.state-icon--success {
  background: rgba(34, 197, 94, 0.12);
  border: 1px solid rgba(34, 197, 94, 0.2);
}

.state-icon--error {
  background: rgba(255, 49, 49, 0.12);
  border: 1px solid rgba(255, 49, 49, 0.2);
}

.state-icon--mail {
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.card-title {
  color: white;
  font-size: 26px;
  font-weight: 700;
  margin: 0 0 14px 0;
  line-height: 1.25;
}

.card-subtitle {
  color: #94a3b8;
  font-size: 15px;
  margin: 0;
  line-height: 1.65;
}

.action-btn {
  font-weight: 700;
  font-size: 16px;
  text-transform: none;
  letter-spacing: 0;
}

.action-btn-outlined {
  border-color: rgba(51, 65, 85, 0.8) !important;
  color: #94a3b8 !important;
  font-weight: 600;
  font-size: 15px;
  text-transform: none;
  letter-spacing: 0;
}
.action-btn-outlined:hover {
  border-color: rgba(100, 116, 139, 0.8) !important;
  color: white !important;
}

.back-link {
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: color 0.2s;
}
.back-link:hover { color: #94a3b8; }

.auth-footer {
  text-align: center;
  color: #334155;
  font-size: 12px;
  margin: 28px 0 0 0;
}
</style>
