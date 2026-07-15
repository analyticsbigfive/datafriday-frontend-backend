<template>
  <div class="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
    <div class="text-center">
      <div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 flex items-center justify-center mx-auto mb-6">
        <Loader2 class="w-8 h-8 text-white animate-spin" />
      </div>
      <h2 class="text-xl font-semibold text-white mb-2">Authentification en cours...</h2>
      <p class="text-slate-400">Veuillez patienter</p>
    </div>
  </div>
</template>

<script>
import { mapActions, mapGetters } from 'vuex'
import { Loader2 } from 'lucide-vue-next'
import { supabase } from '@/lib/supabase'

export default {
  name: 'AuthCallbackView',
  
  components: {
    Loader2
  },
  
  computed: {
    ...mapGetters('auth', ['hasOrganization'])
  },
  
  methods: {
    ...mapActions('auth', ['initialize', 'checkOnboardingStatus'])
  },
  
  async mounted() {
    try {
      // Échanger le code PKCE contre une session (OAuth flow v2)
      const code = new URLSearchParams(window.location.search).get('code')

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          console.error('Auth callback error (code exchange):', error)
          this.$router.push('/login')
          return
        }
      }

      // Récupérer la session (maintenant disponible après l'échange)
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Auth callback error:', error)
        this.$router.push('/login')
        return
      }

      if (session) {
        await this.initialize()
        await this.checkOnboardingStatus()

        if (this.hasOrganization) {
          this.$router.push('/dashboard')
        } else {
          this.$router.push('/onboarding')
        }
      } else {
        this.$router.push('/login')
      }
    } catch (error) {
      console.error('Auth callback error:', error)
      this.$router.push('/login')
    }
  }
}
</script>
