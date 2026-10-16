<template>
  <div class="pos-grid">
    <GuestPosProductTile v-for="tile in tiles" :key="tile.menuItemId" :tile="tile" @add="$emit('add', $event)" />
    <p v-if="tiles.length === 0" class="pos-grid__empty">{{ t('guestPosNoItems') }}</p>
  </div>
</template>

<script setup>
import { useI18n } from '@/i18n/useI18n'
import GuestPosProductTile from './GuestPosProductTile.vue'

defineProps({ tiles: { type: Array, default: () => [] } })
defineEmits(['add'])

const { t } = useI18n()
</script>

<style scoped>
.pos-grid {
  flex: 1; min-height: 0; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  grid-auto-rows: 112px; gap: 12px; align-content: start; padding-bottom: 88px;
}
.pos-grid__empty { grid-column: 1 / -1; margin: 32px 0; text-align: center; color: var(--pos-muted); font-size: var(--fs-md); }
</style>
