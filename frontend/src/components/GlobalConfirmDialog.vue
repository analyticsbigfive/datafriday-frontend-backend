<template>
  <v-dialog v-model="state.show" max-width="380" persistent>
    <!-- Classe --dark sur la racine PROPRE : contenu v-dialog téléporté hors du
         v-app, .v-theme--dataFridayDark n'y descend pas (BUG-198/199, BUG-247-01). -->
    <div class="gcd-card" :class="{ 'gcd-card--dark': isDark }">
      <!-- Icon + text -->
      <div class="gcd-body">
        <div class="gcd-icon" :style="{ background: iconBg }">
          <v-icon :icon="state.icon" size="22" :color="state.iconColor" />
        </div>
        <div class="gcd-title">{{ state.title }}</div>
        <p class="gcd-message">{{ state.message }}</p>
      </div>

      <!-- Actions -->
      <div class="gcd-actions">
        <!-- Save and leave (only for leaveDialog) -->
        <button
          v-if="state.saveButtonText"
          key="gcd-save"
          class="gcd-btn gcd-btn--save"
          :style="{ background: state.saveButtonColor }"
          @click="onSave"
        >
          <v-icon size="15" style="margin-right:6px">mdi-content-save-outline</v-icon>
          {{ state.saveButtonText }}
        </button>

        <!-- Confirm / leave without saving -->
        <button
          key="gcd-confirm"
          class="gcd-btn gcd-btn--confirm"
          :style="{ background: confirmBg }"
          @click="onConfirm"
        >{{ state.confirmText }}</button>

        <!-- Cancel -->
        <button key="gcd-cancel" class="gcd-btn gcd-btn--cancel" @click="onCancel">
          {{ state.cancelText }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { useConfirmDialogState } from '@/composables/useConfirmDialog';
import { useTheme } from 'vuetify';

export default {
  name: 'GlobalConfirmDialog',
  setup() {
    const { global } = useTheme();
    return { theme: global };
  },
  data() {
    return {
      state: useConfirmDialogState(),
    };
  },
  computed: {
    isDark() {
      return this.theme.current.value.dark;
    },
    // 'primary', 'deep-orange', 'warning'… sont des NOMS de couleur Vuetify, PAS des
    // couleurs CSS : passés bruts en `background`, le bouton devient sans fond (texte
    // blanc invisible sur carte blanche). On résout tout nom connu vers un hex.
    confirmBg() {
      return this.resolveColor(this.state.confirmColor, '#6366f1');
    },
    iconBg() {
      const hex = this.resolveColor(this.state.iconColor, '#6366f1');
      return hex + '1A'; // ~10% alpha (tint derrière l'icône)
    },
  },
  methods: {
    // Accepte un hex/rgb/hsl direct, sinon mappe un token Vuetify connu vers un hex.
    resolveColor(color, fallback) {
      if (!color) return fallback;
      if (/^(#|rgb|hsl)/i.test(color)) return color;
      const VUETIFY = {
        primary: '#6366f1',
        secondary: '#64748b',
        'deep-orange': '#f4511e',
        orange: '#fb8c00',
        warning: '#fb8c00',
        error: '#ef4444',
        red: '#ff3131',
        success: '#22c55e',
        green: '#22c55e',
        info: '#3b82f6',
        blue: '#3b82f6',
      };
      return VUETIFY[color] || fallback;
    },
    onSave() {
      this.state.show = false;
      if (this.state.resolveFn) this.state.resolveFn('save');
    },
    onConfirm() {
      this.state.show = false;
      if (this.state.resolveFn) this.state.resolveFn(this.state.saveButtonText ? 'leave' : true);
    },
    onCancel() {
      this.state.show = false;
      if (this.state.resolveFn) this.state.resolveFn(false);
    },
  },
};
</script>

<style scoped>
.gcd-card {
  background: #fff;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.18);
}

.gcd-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 28px 28px 20px;
  gap: 10px;
}

.gcd-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.gcd-title {
  font-size: 15.5px;
  font-weight: 700;
  color: #111827;
  line-height: 1.3;
}

.gcd-message {
  font-size: 13px;
  color: #6b7280;
  line-height: 1.5;
  margin: 0;
  white-space: pre-line;
}

/* ── Actions ── */
.gcd-actions {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 0 20px 20px;
}

.gcd-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity .15s, transform .1s;
  line-height: 1.4;
}
.gcd-btn:active { transform: scale(.98); }

.gcd-btn--save {
  color: #fff;
  opacity: .93;
}
.gcd-btn--save:hover { opacity: 1; }

.gcd-btn--confirm {
  color: #fff;
  opacity: .93;
}
.gcd-btn--confirm:hover { opacity: 1; }

.gcd-btn--cancel {
  background: #f3f4f6;
  color: #6b7280;
  font-weight: 500;
}
.gcd-btn--cancel:hover {
  background: #e5e7eb;
  color: #374151;
}

/* ── Dark (BUG-247-01) — palette slate, overrides uniquement, clair inchangé.
   Boutons save/confirm : fonds inline résolus par resolveColor, inchangés. ── */
.gcd-card--dark { background: #1e293b; }
.gcd-card--dark .gcd-title { color: #f9fafb; }
.gcd-card--dark .gcd-message { color: #94a3b8; }
.gcd-card--dark .gcd-btn--cancel { background: rgba(255, 255, 255, .08); color: #94a3b8; }
.gcd-card--dark .gcd-btn--cancel:hover { background: rgba(255, 255, 255, .14); color: #e2e8f0; }
</style>
