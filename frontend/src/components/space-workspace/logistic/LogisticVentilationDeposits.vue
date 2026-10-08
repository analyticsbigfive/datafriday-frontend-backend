<template>
  <div v-if="movements.length" class="lgvd-root">
    <button type="button" class="lgvd-toggle" :aria-expanded="open" @click="open = !open">
      <v-icon size="16">mdi-history</v-icon>
      <span>{{ t('logiVentilationDepositedTitle') }} ({{ activeCount }})</span>
      <v-icon size="16" class="lgvd-chevron">{{ open ? 'mdi-chevron-up' : 'mdi-chevron-down' }}</v-icon>
    </button>

    <div v-show="open" class="lgvd-list">
      <div
        v-for="m in movements"
        :key="m.id"
        class="lgvd-row"
        :class="{ 'lgvd-row--cancelled': m.cancelled }"
      >
        <div class="lgvd-copy">
          <span class="lgvd-item">{{ m.itemKey }}</span>
          <span class="lgvd-meta">
            {{ m.elementName || '' }} · {{ formatTime(m.createdAt) }}<template v-if="m.depositorName"> · {{ m.depositorName }}</template>
          </span>
        </div>
        <span class="lgvd-qty">{{ qtyLabel(m) }}</span>
        <span v-if="m.cancelled" class="lgvd-cancelled">{{ t('logiVentilationCancelled') }}</span>
        <button
          v-else-if="m.cancellable"
          type="button"
          class="lgvd-cancel"
          :class="{ 'lgvd-cancel--confirm': confirmingId === m.id }"
          :disabled="cancellingId === m.id"
          @click="onCancel(m)"
        >
          <v-progress-circular v-if="cancellingId === m.id" size="12" width="2" indeterminate />
          <template v-else>{{ confirmingId === m.id ? t('logiVentilationCancelConfirm') : t('logiVentilationCancel') }}</template>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useI18n } from '@/i18n/useI18n'
import { formatUnits } from '@/composables/useFormatters'

const { t, locale } = useI18n()

const props = defineProps({
  /** [{ id, elementName, itemKey, packed, loose, depositorName, createdAt, cancelled, cancellable }] */
  movements: { type: Array, default: () => [] },
  /** Id du dépôt en cours d'annulation (spinner). */
  cancellingId: { type: String, default: null },
})
const emit = defineEmits(['cancel'])

const open = ref(false)
// Annulation en deux clics : le premier arme, le second confirme (pas de dialogue
// sur un téléphone en zone logistique).
const confirmingId = ref(null)

const activeCount = computed(() => props.movements.filter((m) => !m.cancelled).length)

function qtyLabel(m) {
  const parts = []
  if (m.packed) parts.push(`${formatUnits(m.packed)} ${t('logiPacksShort')}`)
  if (m.loose) parts.push(`${formatUnits(m.loose)} ${t('logiLooseShort')}`)
  return parts.join(' + ') || '0'
}

function formatTime(value) {
  if (!value) return ''
  try {
    return new Date(value).toLocaleString(locale.value === 'fr' ? 'fr-FR' : 'en-GB', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function onCancel(m) {
  if (confirmingId.value !== m.id) {
    confirmingId.value = m.id
    return
  }
  confirmingId.value = null
  emit('cancel', m)
}
</script>

<style scoped>
.lgvd-root { border: 1px solid var(--fb-border, #e5e7eb); border-radius: 14px; background: var(--fb-surface, #fff); overflow: hidden; }
.lgvd-toggle { appearance: none; width: 100%; display: flex; align-items: center; gap: 8px; padding: 12px 16px; border: 0; background: transparent; color: var(--fb-muted, #6b7280); font: inherit; font-size: var(--fs-base); font-weight: var(--fw-bold); cursor: pointer; text-align: left; }
.lgvd-chevron { margin-left: auto; }
.lgvd-list { border-top: 1px solid var(--fb-subtle, #f3f4f6); padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
.lgvd-row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 10px; background: var(--fb-subtle, #fafafa); }
.lgvd-row--cancelled { opacity: 0.55; }
.lgvd-copy { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.lgvd-item { font-size: var(--fs-base); font-weight: var(--fw-bold); color: var(--fb-text, #212121); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgvd-meta { font-size: var(--fs-xs); color: var(--fb-faint, #9ca3af); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lgvd-qty { font-size: var(--fs-base); font-weight: var(--fw-bold); color: var(--fb-text, #212121); white-space: nowrap; }
.lgvd-cancelled { font-size: var(--fs-xs); font-weight: var(--fw-bold); color: var(--fb-faint, #9ca3af); }
.lgvd-cancel { border: 0; border-radius: 8px; padding: 5px 10px; font-size: var(--fs-sm); font-weight: var(--fw-bold); cursor: pointer; background: var(--fb-danger-soft, #fef2f2); color: var(--fb-danger, #dc2626); min-width: 64px; display: inline-flex; align-items: center; justify-content: center; }
.lgvd-cancel--confirm { background: var(--fb-danger, #dc2626); color: #fff; }
.lgvd-cancel:disabled { cursor: default; }
</style>
