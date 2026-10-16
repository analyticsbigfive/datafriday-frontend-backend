<template>
  <PinRedirectingState v-if="uiState === 'redirecting'" />
  <PinLockedState v-else-if="uiState === 'locked'" />
  <PinInactiveState
    v-else-if="uiState === 'inactive'"
    :pdv-name="pdvName"
    :can-check="!!slug"
    :checking="checking"
    @check="checkContext"
    @scanned="onScanned"
  />

  <PinLoginShell
    v-else
    :icon="Lock"
    icon-color="#ff3131"
    :title="posActive ? t('guestPosLoginTitle') : t('pinLoginTitle')"
    :subtitle="posActive ? t('guestPosLoginSubtitle') : t('pinLoginSubtitle')"
  >
    <div class="pin-login__form">
      <!-- PDV identifié par le lien scanné (slug dans l'URL, un seul lien pour les
           deux phases), résolu AVANT toute saisie de PIN — confirme visuellement le
           bon point de vente. La phase n'est connue qu'après le login (elle dépend
           de la fenêtre à laquelle le PIN appartient), donc pas affichée ici. -->
      <span v-if="pdvName" class="pin-login__pdv-chip">
        <MapPin :size="12" />
        {{ pdvName }}
      </span>

      <!-- Caisse POS ouverte pour ce PDV : le nom du vendeur est enregistré sur chaque ticket
           (traçabilité). Les PIN d'inventaire du même PDV l'ignorent, le flux inventaire reste
           identique. -->
      <label v-if="posActive" class="pin-login__vendor">
        <span class="pin-login__vendor-label">{{ t('guestPosLoginVendorLabel') }}</span>
        <input
          ref="vendorInput"
          v-model="vendorName"
          class="pin-login__vendor-input"
          :class="{ 'pin-login__vendor-input--error': nameError }"
          type="text"
          autocomplete="name"
          :maxlength="vendorNameMax"
          :placeholder="t('guestPosLoginVendorPlaceholder')"
          :disabled="submitting"
          @input="onVendorInput"
        />
      </label>

      <PinInputPad :error="hasError" :disabled="submitting" @change="onPinChange" @complete="onPinComplete" />

      <div v-if="hasError || nameError" class="pin-login__error">
        <AlertCircle :size="16" color="#FF6E4A" />
        <span>{{ errorMessage }}</span>
      </div>

      <p class="pin-login__disclaimer">{{ t('pinLoginDisclaimer') }}</p>

      <button
        class="pin-login__submit"
        :disabled="currentPin.length !== 6 || submitting"
        @click="handleSubmit(currentPin)"
      >
        {{ t('pinLoginSubmit') }}
        <ArrowRight :size="18" />
      </button>
    </div>
  </PinLoginShell>
</template>

<script>
import { Lock, AlertCircle, ArrowRight, MapPin } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import PinLoginShell from '@/components/guest-pin/PinLoginShell.vue';
import PinInputPad from '@/components/guest-pin/PinInputPad.vue';
import PinLockedState from '@/components/guest-pin/PinLockedState.vue';
import PinInactiveState from '@/components/guest-pin/PinInactiveState.vue';
import PinRedirectingState from '@/components/guest-pin/PinRedirectingState.vue';
import { rememberGuestSlug } from '@/utils/guestPinLanding';
import { guestRouteForPhase } from '@/router/guards';
import { POS_ERROR_CODES, POS_VENDOR_NAME_MAX, POS_PHASE } from '@/api/endpoints/pos.contracts';
import { requestPosFullscreen } from '@/utils/posFullscreen';
import { posErrorCode } from '@/utils/posErrors';

/** Cadence de vérification de la reprise sur la page d'attente. */
const AUTO_CHECK_MS = 30 * 1000;

export default {
  name: 'PinLoginView',

  components: {
    PinLoginShell,
    PinInputPad,
    PinLockedState,
    PinInactiveState,
    PinRedirectingState,
    AlertCircle,
    ArrowRight,
    MapPin,
  },

  setup() {
    const { t } = useI18n();
    return { t, Lock, vendorNameMax: POS_VENDOR_NAME_MAX };
  },

  data() {
    return {
      uiState: 'form', // 'form' | 'locked' | 'inactive' | 'redirecting'
      currentPin: '',
      hasError: false,
      errorMessage: '',
      submitting: false,
      pdvName: null,
      checking: false,
      // Caisse POS ouverte pour ce PDV (contexte public) : le nom du vendeur est demandé.
      posActive: false,
      vendorName: '',
      nameError: false,
    };
  },

  computed: {
    slug() {
      return this.$route.params.slug;
    },
  },

  // Résout le PDV depuis le lien scanné AVANT toute saisie : nom affiché tout de
  // suite, et bascule immédiate sur la page d'attente si aucune fenêtre (pré ou post)
  // n'est ouverte pour ce PDV. Rejoué quand un nouveau QR est scanné (même route).
  watch: {
    slug: {
      immediate: true,
      handler() {
        this.resetForSlug();
      },
    },
    uiState(state) {
      if (state === 'inactive') this.startAutoCheck();
      else this.stopAutoCheck();
    },
  },

  beforeUnmount() {
    this.stopAutoCheck();
    document.removeEventListener('visibilitychange', this.onVisibility);
  },

  mounted() {
    document.addEventListener('visibilitychange', this.onVisibility);
  },

  methods: {
    async resetForSlug() {
      this.pdvName = null;
      this.hasError = false;
      this.nameError = false;
      this.posActive = false;
      this.currentPin = '';
      // Sans slug (lien perdu) : page d'attente générique, seul le scan est proposé.
      if (!this.slug) {
        this.uiState = 'inactive';
        return;
      }
      rememberGuestSlug(this.slug);
      this.uiState = 'form';
      await this.checkContext();
    },

    /** Relit l'état du PDV : inventaire repris → retour à la saisie du PIN. */
    async checkContext() {
      if (!this.slug || this.checking) return;
      this.checking = true;
      try {
        const context = await this.$store.dispatch('guestPin/getContext', { slug: this.slug });
        // QR Ventilation : pas d'élément, le nom de l'espace confirme le bon lien.
        this.pdvName = context?.elementName ?? context?.spaceName ?? null;
        this.posActive = !!context?.posActive;
        if (!context?.active) this.uiState = 'inactive';
        else if (this.uiState === 'inactive') this.uiState = 'form';
      } catch {
        // Contexte indisponible (réseau) : état inchangé, le login ou le prochain
        // tick révéleront la même chose.
      } finally {
        this.checking = false;
      }
    },

    startAutoCheck() {
      if (this.autoCheckTimer || !this.slug) return;
      this.autoCheckTimer = setInterval(() => {
        if (!document.hidden) this.checkContext();
      }, AUTO_CHECK_MS);
    },

    stopAutoCheck() {
      if (this.autoCheckTimer) clearInterval(this.autoCheckTimer);
      this.autoCheckTimer = null;
    },

    onVisibility() {
      // Téléphone rallumé ou onglet revenu au premier plan : vérification immédiate.
      if (!document.hidden && this.uiState === 'inactive') this.checkContext();
    },

    onScanned(slug) {
      if (slug === this.slug) {
        this.checkContext();
        return;
      }
      this.$router.replace({ name: 'login-pin', params: { slug } });
    },

    onPinChange(value) {
      this.currentPin = value;
      if (this.hasError) this.hasError = false;
    },

    onVendorInput() {
      if (this.nameError) {
        this.nameError = false;
        this.errorMessage = '';
      }
    },

    /** Saisie du 6e chiffre : sur une caisse, on attend le nom du vendeur avant d'envoyer. */
    onPinComplete(pin) {
      if (this.posActive && !this.vendorName.trim()) {
        this.currentPin = pin;
        this.showNameRequired();
        return;
      }
      this.handleSubmit(pin);
    },

    showNameRequired() {
      this.nameError = true;
      this.errorMessage = this.t('guestPosLoginVendorRequired');
      this.$refs.vendorInput?.focus();
    },

    async handleSubmit(pin) {
      if (this.submitting || pin.length !== 6) return;
      this.submitting = true;
      try {
        const vendorName = this.posActive ? this.vendorName.trim().slice(0, POS_VENDOR_NAME_MAX) : undefined;
        const result = await this.$store.dispatch('guestPin/login', { pin, slug: this.slug, vendorName });
        this.applyResult(result);
      } catch (error) {
        this.applyLoginError(error);
      } finally {
        this.submitting = false;
      }
    },

    /** Erreurs HTTP du login : codes POS explicites, sinon le message historique « PIN incorrect ». */
    applyLoginError(error) {
      const code = posErrorCode(error);
      if (code === POS_ERROR_CODES.VENDOR_NAME_REQUIRED) this.showNameRequired();
      else if (code === POS_ERROR_CODES.EVENT_NOT_SELLABLE) this.showError(this.t('guestPosErrorEventEnded'));
      else if (code === POS_ERROR_CODES.PDV_STOPPED) this.showError(this.t('guestPosErrorStopped'));
      else this.showError(this.t('pinLoginErrorIncorrect'));
    },

    applyResult(result) {
      switch (result.state) {
        case 'ok': {
          // Geste de l'utilisateur encore valide : le plein écran de la caisse démarre ici (repli
          // silencieux si le navigateur refuse, la caisse retente au premier toucher).
          if (result.phase === POS_PHASE) requestPosFullscreen();
          this.uiState = 'redirecting';
          const targetName = guestRouteForPhase(result.phase);
          setTimeout(() => this.$router.replace({ name: targetName }), 700);
          break;
        }
        case 'not_found': {
          const suffix = this.t('pinLoginErrorAttemptsLeft').replace('{count}', result.attemptsRemaining);
          this.showError(`${this.t('pinLoginErrorIncorrect')} — ${suffix}`);
          break;
        }
        case 'locked':
          this.uiState = 'locked';
          break;
        case 'inactive':
        default:
          if (this.posActive) {
            // Caisse arrêtée entre-temps : message clair, puis le contexte rebascule sur la page d'attente.
            this.showError(this.t('guestPosErrorStopped'));
            this.checkContext();
          } else {
            this.uiState = 'inactive';
          }
          break;
      }
    },

    showError(message) {
      this.errorMessage = message;
      this.nameError = false;
      this.hasError = true;
    },
  },
};
</script>

<style scoped>
.pin-login__form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 22px;
  width: 100%;
}

.pin-login__pdv-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: center;
  margin: -6px 0 4px;
  background: rgba(255, 49, 49, 0.12);
  border: 1px solid rgba(255, 49, 49, 0.3);
  border-radius: 100px;
  padding: 5px 12px;
  color: #ff3131;
  font-size: 0.75rem;
  font-weight: 700;
}

.pin-login__vendor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.pin-login__vendor-label {
  color: #94a3b8;
  font-size: 0.75rem;
  font-weight: 700;
}

.pin-login__vendor-input {
  height: 52px;
  width: 100%;
  box-sizing: border-box;
  padding: 0 14px;
  border-radius: 10px;
  background: rgba(30, 41, 59, 0.7);
  border: 1.5px solid rgba(51, 65, 85, 0.8);
  color: #fff;
  font-size: 1rem;
  outline: none;
}

.pin-login__vendor-input:focus {
  border-color: #ff3131;
}

.pin-login__vendor-input--error {
  border-color: #ff6e4a;
}

.pin-login__error {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #ff6e4a;
  font-size: 0.875rem;
  font-weight: 600;
}

.pin-login__disclaimer {
  margin: 0;
  color: #475569;
  font-size: 0.6875rem;
  max-width: 260px;
  text-align: center;
}

.pin-login__submit {
  width: 100%;
  height: 52px;
  border-radius: 8px;
  background: #ff3131;
  color: #fff;
  font-weight: 700;
  font-size: 1rem;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
}

.pin-login__submit:disabled {
  background: rgba(255, 49, 49, 0.25);
  color: rgba(255, 255, 255, 0.4);
  cursor: not-allowed;
}
</style>
