<template>
  <div class="pos-modal" @click.self="$emit('close')">
    <div class="pos-modal__box" role="dialog" aria-modal="true" :aria-label="title" :style="{ width: width }">
      <slot />
    </div>
  </div>
</template>

<script setup>
// Voile + conteneur des fenêtres secondaires de la caisse (Échap ou clic hors de la fenêtre ferme).
import { onBeforeUnmount, onMounted } from 'vue'

defineProps({
  title: { type: String, default: '' },
  width: { type: String, default: '560px' },
})
const emit = defineEmits(['close'])

const onKey = (event) => {
  if (event.key === 'Escape') emit('close')
}
onMounted(() => document.addEventListener('keydown', onKey))
onBeforeUnmount(() => document.removeEventListener('keydown', onKey))
</script>

<style scoped>
.pos-modal { position: absolute; inset: 0; z-index: 40; background: rgba(17, 24, 39, 0.55); display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; }
.pos-modal__box {
  max-width: 100%; max-height: 100%; box-sizing: border-box; border-radius: 16px; background: var(--pos-surface); border: 1px solid var(--pos-border);
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.18); display: flex; flex-direction: column; overflow: hidden;
}
</style>
