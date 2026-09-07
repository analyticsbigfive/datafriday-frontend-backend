<template>
  <PinRedirectingState v-if="uiState === 'redirecting'" />
  <PinLockedState v-else-if="uiState === 'locked'" />
  <PinInactiveState v-else-if="uiState === 'inactive'" />

  <PinLoginShell
    v-else
    :icon="Lock"
    icon-color="#ff3131"
    :title="t('pinLoginTitle')"
    :subtitle="t('pinLoginSubtitle')"
  >
    <div class="pin-login__form">
      <PinInputPad :error="hasError" :disabled="submitting" @change="onPinChange" @complete="handleSubmit" />

      <div v-if="hasError" class="pin-login__error">
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
import { Lock, AlertCircle, ArrowRight } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';
import PinLoginShell from '@/components/guest-pin/PinLoginShell.vue';
import PinInputPad from '@/components/guest-pin/PinInputPad.vue';
import PinLockedState from '@/components/guest-pin/PinLockedState.vue';
import PinInactiveState from '@/components/guest-pin/PinInactiveState.vue';
import PinRedirectingState from '@/components/guest-pin/PinRedirectingState.vue';

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
  },

  setup() {
    const { t } = useI18n();
    return { t, Lock };
  },

  data() {
    return {
      uiState: 'form', // 'form' | 'locked' | 'inactive' | 'redirecting'
      currentPin: '',
      hasError: false,
      errorMessage: '',
      submitting: false,
    };
  },

  methods: {
    onPinChange(value) {
      this.currentPin = value;
      if (this.hasError) this.hasError = false;
    },

    async handleSubmit(pin) {
      if (this.submitting || pin.length !== 6) return;
      this.submitting = true;
      try {
        const result = await this.$store.dispatch('guestPin/login', pin);
        this.applyResult(result);
      } catch (error) {
        this.showError(this.t('pinLoginErrorIncorrect'));
      } finally {
        this.submitting = false;
      }
    },

    applyResult(result) {
      switch (result.state) {
        case 'ok':
          this.uiState = 'redirecting';
          setTimeout(() => this.$router.replace({ name: 'guest-inventory' }), 700);
          break;
        case 'not_found': {
          const suffix = this.t('pinLoginErrorAttemptsLeft').replace('{count}', result.attemptsRemaining);
          this.showError(`${this.t('pinLoginErrorIncorrect')} — ${suffix}`);
          break;
        }
        case 'device_bound':
          this.showError(this.t('pinLoginDeviceBound'));
          break;
        case 'locked':
          this.uiState = 'locked';
          break;
        case 'inactive':
        default:
          this.uiState = 'inactive';
          break;
      }
    },

    showError(message) {
      this.errorMessage = message;
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
