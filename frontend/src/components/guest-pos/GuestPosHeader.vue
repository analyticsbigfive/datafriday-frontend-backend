<template>
  <header class="pos-header">
    <div class="pos-header__identity">
      <div class="pos-header__pdv">{{ pdvName }}</div>
      <div v-if="eventName" class="pos-header__event">{{ eventName }}</div>
    </div>
    <div class="pos-header__actions">
      <GuestPosSyncBadge :state="syncState" :label="syncLabel" />
      <button
        type="button"
        class="pos-header__menu-btn"
        aria-haspopup="menu"
        :aria-expanded="menuOpen ? 'true' : 'false'"
        :aria-label="t('guestPosMenuLabel')"
        @click.stop="$emit('toggle-menu')"
      >
        <Ellipsis :size="20" aria-hidden="true" />
      </button>
      <slot name="menu" />
    </div>
  </header>
</template>

<script setup>
import { Ellipsis } from 'lucide-vue-next'
import { useI18n } from '@/i18n/useI18n'
import GuestPosSyncBadge from './GuestPosSyncBadge.vue'

defineProps({
  pdvName: { type: String, default: '' },
  eventName: { type: String, default: '' },
  syncState: { type: String, default: 'live' },
  syncLabel: { type: String, default: '' },
  menuOpen: { type: Boolean, default: false },
})
defineEmits(['toggle-menu'])

const { t } = useI18n()
</script>

<style scoped>
.pos-header {
  height: 60px; flex-shrink: 0; box-sizing: border-box; padding: 0 20px; display: flex; align-items: center;
  justify-content: space-between; gap: 12px; background: var(--pos-surface); border-bottom: 1px solid var(--pos-border);
  position: relative; z-index: 30;
}
.pos-header__identity { display: flex; align-items: baseline; gap: 12px; min-width: 0; }
.pos-header__pdv { font-weight: var(--fw-bold); font-size: var(--fs-lg); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pos-header__event { font-size: var(--fs-base); color: var(--pos-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pos-header__actions { display: flex; align-items: center; gap: 12px; position: relative; }
.pos-header__menu-btn {
  width: 44px; height: 44px; border-radius: 8px; border: 1px solid var(--pos-border-strong); background: var(--pos-surface);
  color: var(--pos-text); display: flex; align-items: center; justify-content: center; cursor: pointer;
}
</style>
