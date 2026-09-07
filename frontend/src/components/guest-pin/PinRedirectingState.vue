<template>
  <div class="pin-redirect">
    <div class="pin-redirect__header">
      <img src="@/assets/datafriday.png" alt="Data Friday" class="pin-redirect__logo" />
      <div>
        <p class="pin-redirect__brand">Data Friday</p>
        <p class="pin-redirect__tagline">{{ t('pinLoginTitle') }}</p>
      </div>
    </div>

    <div class="pin-redirect__body">
      <div class="pin-redirect__spinner" />
      <div>
        <h1 class="pin-redirect__title">{{ t('pinLoginRedirectingTitle') }}</h1>
        <p class="pin-redirect__subtitle">{{ t('pinLoginRedirectingMessage') }}</p>
      </div>
      <div class="pin-redirect__dots">
        <span />
        <span />
        <span />
      </div>
    </div>

    <p class="pin-redirect__footer">{{ t('loginCopyright') }}</p>
  </div>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'PinRedirectingState',
  setup() {
    const { t } = useI18n();
    return { t };
  },
};
</script>

<style scoped>
.pin-redirect {
  width: 100%;
  min-height: 100vh;
  background: #0f172a;
  display: flex;
  flex-direction: column;
  padding: 28px;
  box-sizing: border-box;
  color: #fff;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
}

.pin-redirect__header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pin-redirect__logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.pin-redirect__brand {
  margin: 0;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.2;
}

.pin-redirect__tagline {
  margin: 0;
  color: #ff3131;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.pin-redirect__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: 20px;
  max-width: 440px;
  margin: 0 auto;
  width: 100%;
}

.pin-redirect__spinner {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 4px solid rgba(255, 49, 49, 0.15);
  border-top-color: #ff3131;
  animation: pin-redirect-spin 0.9s linear infinite;
}

.pin-redirect__title {
  margin: 0 0 8px 0;
  color: #fff;
  font-size: 1.25rem;
  font-weight: 700;
}

.pin-redirect__subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.8125rem;
  line-height: 1.5;
  max-width: 260px;
}

.pin-redirect__dots {
  display: flex;
  gap: 6px;
}

.pin-redirect__dots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ff3131;
  animation: pin-redirect-pulse 1.2s ease-in-out infinite;
}

.pin-redirect__dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.pin-redirect__dots span:nth-child(3) {
  animation-delay: 0.4s;
}

.pin-redirect__footer {
  margin: 0;
  text-align: center;
  color: #334155;
  font-size: 0.6875rem;
}

@keyframes pin-redirect-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pin-redirect-pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}
</style>
