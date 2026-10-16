<template>
  <div class="pos-sync" :class="`pos-sync--${state}`" role="status">
    <span class="pos-sync__dot" aria-hidden="true" />
    <span>{{ label }}</span>
  </div>
</template>

<script setup>
// Témoin d'envoi : En direct, ventes en attente d'envoi, ou Hors ligne.
defineProps({
  state: { type: String, default: 'live' }, // 'live' | 'pending' | 'offline'
  label: { type: String, default: '' },
})
</script>

<style scoped>
.pos-sync { display: flex; align-items: center; gap: 8px; font-size: var(--fs-base); font-weight: var(--fw-semibold); }
.pos-sync__dot { width: 9px; height: 9px; border-radius: 5px; background: currentColor; }
.pos-sync--live { color: var(--pos-ok); }
.pos-sync--pending { color: var(--pos-warn); }
.pos-sync--offline { color: var(--pos-danger); }
</style>
