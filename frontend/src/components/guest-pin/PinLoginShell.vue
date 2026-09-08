<template>
  <div class="pin-shell">
    <div class="pin-shell__header">
      <img :src="require('@/assets/datafriday.png')" alt="Data Friday" class="pin-shell__logo" />
      <div>
        <p class="pin-shell__brand">Data Friday</p>
        <p class="pin-shell__tagline">{{ t('pinLoginTitle') }}</p>
      </div>
    </div>

    <div class="pin-shell__body">
      <div v-if="icon" class="pin-shell__icon" :style="iconStyle">
        <component :is="icon" :size="28" :color="iconColor" />
      </div>

      <div class="pin-shell__copy">
        <h1 class="pin-shell__title">{{ title }}</h1>
        <p class="pin-shell__subtitle">{{ subtitle }}</p>
      </div>

      <slot />
    </div>

    <p class="pin-shell__footer">{{ t('loginCopyright') }}</p>
  </div>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'PinLoginShell',

  props: {
    icon: { type: [Object, Function], default: null },
    iconColor: { type: String, default: '#ff3131' },
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
  },

  setup() {
    const { t } = useI18n();
    return { t };
  },

  computed: {
    iconStyle() {
      return {
        background: `${this.iconColor}1f`,
        borderColor: `${this.iconColor}4d`,
      };
    },
  },
};
</script>

<style scoped>
.pin-shell {
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

.pin-shell__header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pin-shell__logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
}

.pin-shell__brand {
  margin: 0;
  color: #fff;
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.2;
}

.pin-shell__tagline {
  margin: 0;
  color: #ff3131;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.pin-shell__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  gap: 22px;
  max-width: 440px;
  margin: 0 auto;
  width: 100%;
}

.pin-shell__icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 1px solid;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pin-shell__copy {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pin-shell__title {
  margin: 0;
  color: #fff;
  font-size: 1.5rem;
  font-weight: 700;
  line-height: 1.2;
}

.pin-shell__subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.8125rem;
  line-height: 1.5;
  max-width: 280px;
}

.pin-shell__footer {
  margin: 0;
  text-align: center;
  color: #334155;
  font-size: 0.6875rem;
}
</style>
