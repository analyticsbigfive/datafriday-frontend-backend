<template>
  <div class="lh-wrap" :class="{ 'lh-wrap--dark': isDark }">
    <div class="lh-left">
      <span v-if="isLive" class="lh-badge">
        <span class="lh-pulse"></span>
        {{ t('anToolLive') }}
      </span>
      <span class="lh-title">{{ eventName || t('liveHeaderNoEvent') }}</span>
    </div>
    <span v-if="isLive && sinceLabel" class="lh-since">{{ t('liveHeaderSince') }} {{ sinceLabel }}</span>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  isLive: { type: Boolean, default: false },
  eventName: { type: String, default: '' },
  since: { type: String, default: null },
  isDark: { type: Boolean, default: false },
})

const sinceLabel = computed(() => {
  if (!props.since) return ''
  const mins = Math.max(0, Math.round((Date.now() - new Date(props.since).getTime()) / 60000))
  return mins < 60 ? `${mins} min` : `${Math.round(mins / 60)} h`
})
</script>

<style scoped>
.lh-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  margin-bottom: 12px;
}
.lh-wrap--dark { background: #1e293b; border-color: rgba(255, 255, 255, 0.1); }
.lh-left { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
.lh-badge {
  display: flex; align-items: center; gap: 6px;
  background: #ff3131; color: #fff;
  font-size: var(--fs-xs); font-weight: var(--fw-bold); letter-spacing: 0.4px;
  padding: 4px 10px; border-radius: 999px;
}
.lh-pulse {
  width: 7px; height: 7px; border-radius: 50%; background: #fff;
  animation: lh-pulse 1.4s ease-in-out infinite;
}
@keyframes lh-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .lh-pulse { animation: none; } }
.lh-title { font-size: var(--fs-lg); font-weight: var(--fw-bold); color: #111827; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lh-wrap--dark .lh-title { color: #f9fafb; }
.lh-since { font-size: var(--fs-base); color: #6b7280; flex-shrink: 0; margin-left: 8px; }
.lh-wrap--dark .lh-since { color: #9ca3af; }
</style>
