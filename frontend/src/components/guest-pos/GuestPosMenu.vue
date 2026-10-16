<template>
  <div class="pos-menu" role="menu">
    <div class="pos-menu__vendor">
      {{ t('guestPosMenuVendor') }} <strong>{{ vendorName }}</strong>
    </div>
    <button type="button" role="menuitem" class="pos-menu__item" @click="$emit('history')">{{ t('guestPosMenuHistory') }}</button>
    <button type="button" role="menuitem" class="pos-menu__item" @click="$emit('closing')">{{ t('guestPosMenuClosing') }}</button>
    <button v-if="fullscreenSupported" type="button" role="menuitem" class="pos-menu__item" @click="$emit('toggle-fullscreen')">
      {{ isFullscreen ? t('guestPosMenuExitFullscreen') : t('guestPosMenuEnterFullscreen') }}
    </button>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'

defineProps({
  vendorName: { type: String, default: '' },
  isFullscreen: { type: Boolean, default: false },
  fullscreenSupported: { type: Boolean, default: true },
})
defineEmits(['history', 'closing', 'toggle-fullscreen'])

const { t } = useI18n()
</script>

<style scoped>
.pos-menu {
  position: absolute; top: 52px; right: 0; width: 240px; background: var(--pos-surface); border: 1px solid var(--pos-border);
  border-radius: 12px; box-shadow: 0 4px 16px rgba(15, 23, 42, 0.14); padding: 6px; display: flex; flex-direction: column;
}
.pos-menu__vendor { padding: 10px 12px; font-size: var(--fs-base); color: var(--pos-muted); }
.pos-menu__vendor strong { color: var(--pos-text); }
.pos-menu__item {
  min-height: 48px; padding: 0 12px; border: 0; border-radius: 8px; background: transparent; text-align: left;
  font-size: var(--fs-md); font-weight: var(--fw-semibold); color: var(--pos-text); cursor: pointer;
}
.pos-menu__item:hover { background: var(--pos-bg); }
</style>
