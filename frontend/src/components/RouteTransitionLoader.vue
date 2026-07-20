<template>
  <Teleport to="body">
    <transition name="rtl-fade">
      <div v-if="visible" class="rtl-overlay" role="status" aria-live="polite">
        <div class="rtl-logo-wrap">
          <img
            :src="logoSrc"
            alt="DataFriday"
            class="rtl-logo"
          />
          <div class="rtl-ring"></div>
        </div>
        <p v-if="label" class="rtl-label">{{ label }}</p>
      </div>
    </transition>
  </Teleport>
</template>

<script>
import logo from '@/assets/datafriday.png'

// Routes "silencieuses" — pas d'overlay sur ces transitions car elles sont
// instantanées ou bruyantes (auth handshake, callback, etc.).
const SILENT_PATTERNS = [
  /\/auth-callback/,
  /\/verify-email/,
  /\/reset-password/,
]

// Vues qui gèrent déjà leur chargement initial. Afficher overlay global avant
// leur skeleton produit deux écrans de chargement successifs.
const SELF_LOADING_PATTERNS = [
  /^\/spaces\/[^/]+\/?$/,
]

function isSilentPath(path) {
  return SILENT_PATTERNS.some((p) => p.test(path))
}

function hasOwnLoadingState(path) {
  return SELF_LOADING_PATTERNS.some((p) => p.test(path))
}

/**
 * Décide si l'overlay doit s'afficher pour une transition donnée.
 * Règle : afficher dès que le `path` change (les query-only changes —
 * `?toolbox=predict`, `?event=`, etc. — ne déclenchent pas l'overlay
 * pour éviter le flash sur chaque filtre).
 */
function matchesTransition(from, to, fromPath, toPath) {
  if (!from || !to || from === to) return false
  // Same path, only query changed → no overlay.
  if (fromPath === toPath) return false
  if (isSilentPath(toPath)) return false
  if (hasOwnLoadingState(toPath)) return false
  return true
}

export default {
  name: 'RouteTransitionLoader',
  data() {
    return {
      visible: false,
      label: 'Chargement…',
      logoSrc: logo,
      _hideTimer: null,
    }
  },
  watch: {
    $route(to, from) {
      const fromFull = from?.fullPath || from?.path
      const toFull = to?.fullPath || to?.path
      const fromPath = from?.path
      const toPath = to?.path
      if (matchesTransition(fromFull, toFull, fromPath, toPath)) {
        this.show(this.labelFor(toPath))
      }
    },
  },
  mounted() {
    window.addEventListener('datafriday:route-loader', this.onExternalShow)
  },
  methods: {
    labelFor(path) {
      const p = String(path || '')
      if (/event-predict/.test(p)) return 'Chargement Event Predict…'
      if (/\/predict/.test(p)) return 'Chargement Predict…'
      if (/\/pre-inventory/.test(p)) return 'Chargement Pre-event Inventory…'
      if (/\/inventory/.test(p)) return 'Chargement Post-event Inventory…'
      if (/\/builder/.test(p)) return 'Chargement Space Builder…'
      if (/\/spaces-overview/.test(p)) return 'Chargement vue d\'ensemble…'
      if (/\/spaces\/[^/]+$/.test(p)) return 'Chargement Analyse…'
      if (/\/spaces\b/.test(p)) return 'Chargement Espaces…'
      if (/\/events\b/.test(p)) return 'Chargement Événements…'
      if (/\/event-types/.test(p)) return 'Chargement Types d\'événements…'
      if (/\/event-categories/.test(p)) return 'Chargement Catégories…'
      if (/\/event-subcategories/.test(p)) return 'Chargement Sous-catégories…'
      if (/\/suppliers/.test(p)) return 'Chargement Fournisseurs…'
      if (/\/market-price/.test(p)) return 'Chargement Prix marché…'
      if (/\/menu-items/.test(p)) return 'Chargement Menu Items…'
      if (/\/component/.test(p)) return 'Chargement Composants…'
      if (/\/space-menu/.test(p)) return 'Chargement Space Menus…'
      if (/\/products?/.test(p)) return 'Chargement Produits…'
      if (/\/ingredient/.test(p)) return 'Chargement Ingrédients…'
      if (/\/dashboard/.test(p)) return 'Chargement Dashboard…'
      if (/\/onboarding/.test(p)) return 'Chargement Onboarding…'
      if (/\/login/.test(p)) return 'Connexion…'
      if (/\/signup/.test(p)) return 'Inscription…'
      if (/\/forgot-password/.test(p)) return 'Récupération de mot de passe…'
      if (/\/home/.test(p)) return 'Chargement…'
      return 'Chargement…'
    },
    show(label) {
      this.visible = true
      this.label = label || 'Chargement…'
      if (this._hideTimer) clearTimeout(this._hideTimer)
      // Auto-dismiss : 2 s couvre les transitions lourdes (Analyse → Predict)
      // qui font du lazy-load + re-aggregation côté store. Le nouvel écran
      // peut prendre la main avec son propre loader entre-temps.
      this._hideTimer = setTimeout(() => {
        this.visible = false
      }, 2000)
    },
    onExternalShow(event) {
      this.show(event?.detail?.label || this.label)
    },
  },
  beforeUnmount() {
    if (this._hideTimer) clearTimeout(this._hideTimer)
    window.removeEventListener('datafriday:route-loader', this.onExternalShow)
  },
}
</script>

<style scoped>
.rtl-overlay {
  position: fixed;
  inset: 0;
  /* Remplit la hauteur visible réelle sur mobile (barre d'URL dynamique). */
  min-height: 100vh;
  min-height: 100dvh;
  z-index: 9999;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(2px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: clamp(12px, 3.5vw, 18px);
  /* Marge de sécurité (encoches) pour ne jamais coller aux bords. */
  box-sizing: border-box;
  padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right))
           max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left));
  text-align: center;
}
.rtl-logo-wrap {
  position: relative;
  /* Taille fluide : compacte sur petit écran, plafonnée sur grand. */
  width: clamp(88px, 26vw, 120px);
  height: clamp(88px, 26vw, 120px);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rtl-logo {
  width: clamp(60px, 18vw, 84px);
  height: clamp(60px, 18vw, 84px);
  object-fit: contain;
  animation: rtl-pulse 1.2s ease-in-out infinite;
  z-index: 1;
}
.rtl-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid rgba(15, 23, 42, 0.1);
  border-top-color: #FF6E40;
  animation: rtl-spin 1s linear infinite;
}
.rtl-label {
  margin: 0;
  /* Jamais bord à bord : largeur bornée + retour à la ligne propre. */
  max-width: min(88vw, 340px);
  font-size: clamp(0.85rem, 3.4vw, 0.95rem);
  line-height: 1.4;
  font-weight: 600;
  color: #475569;
  letter-spacing: 0.02em;
  overflow-wrap: anywhere;
}
.rtl-fade-enter-active,
.rtl-fade-leave-active {
  transition: opacity 180ms ease;
}
.rtl-fade-enter-from,
.rtl-fade-leave-to {
  opacity: 0;
}
@keyframes rtl-spin {
  to { transform: rotate(360deg); }
}
@keyframes rtl-pulse {
  0%, 100% { transform: scale(0.96); opacity: 0.85; }
  50%      { transform: scale(1.08); opacity: 1; }
}
</style>
