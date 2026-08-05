<template>
  <EventDrawerShell
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :is-dark="isDark"
    :persistent="loading"
    width="420"
    :title="t('eventsList.deleteTitle')"
    :subtitle="t('eventsList.deleteSubtitle')"
    :error-message="error"
  >
    <template #icon>
      <Trash2 :size="18" color="white" />
    </template>

    <div :class="{ 'edd--dark': isDark }">
      <p class="edd-text">
        {{ t('eventsList.deleteText') }} <strong>{{ eventName }}</strong> ?
      </p>
    </div>

    <template #footer>
      <button class="edd-btn edd-btn--cancel" @click="$emit('update:modelValue', false)">{{ t('eventsList.deleteCancel') }}</button>
      <button class="edd-btn edd-btn--danger" :disabled="loading" @click="$emit('confirm')">
        <Trash2 :size="14" />
        {{ loading ? t('eventsList.deleteConfirming') : t('eventsList.deleteConfirm') }}
      </button>
    </template>
  </EventDrawerShell>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { Trash2 } from 'lucide-vue-next';
import EventDrawerShell from '../drawers/EventDrawerShell.vue';

export default {
  name: 'EventDeleteDialog',
  components: { Trash2, EventDrawerShell },
  setup() {
    const { t } = useI18n();
    return { t };
  },
  props: {
    modelValue: { type: Boolean, default: false },
    eventName: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'confirm'],
};
</script>

<style scoped>
.edd-text { font-size: var(--fs-md); color: #374151; line-height: 1.6; margin: 0; }
.edd-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 18px; height: 38px;
  border-radius: 50px; font-size: var(--fs-base); font-weight: 500;
  border: none; cursor: pointer; transition: all .2s;
}
.edd-btn:disabled { opacity: .5; cursor: not-allowed; }
.edd-btn--cancel { background: #f3f4f6; color: #374151; border: 1.5px solid #e5e7eb; }
.edd-btn--cancel:hover { background: #e9ecef; }
.edd-btn--danger {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 12px rgba(255, 49, 49,.3);
}
.edd-btn--danger:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49,.4); transform: translateY(-1px); }

/* Dark mode */
.edd--dark .edd-text { color: #d1d5db; }
/* Bouton Cancel : slotté dans le footer d'EventDrawerShell (hors du wrapper .edd--dark) ;
   on le cible via .eds--dark, la racine dark du shell qui l'englobe réellement. */
.eds--dark .edd-btn--cancel { background: #1f2937; color: #e2e8f0; border-color: rgba(255,255,255,.14); }
.eds--dark .edd-btn--cancel:hover { background: #374151; }
</style>
