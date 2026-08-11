<template>
  <v-dialog
    :model-value="modelValue"
    max-width="440"
    :persistent="loading"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="edd" :class="{ 'edd--dark': isDark }">
      <!-- Header rouge charte -->
      <div class="edd__header">
        <div class="edd__icon"><Trash2 :size="20" color="white" /></div>
        <div class="edd__head-text">
          <div class="edd__title">{{ t('eventsList.deleteTitle') }}</div>
          <div class="edd__subtitle">{{ t('eventsList.deleteSubtitle') }}</div>
        </div>
        <button
          v-if="!loading"
          type="button"
          class="edd__close"
          :aria-label="t('eventsList.deleteCancel')"
          @click="$emit('update:modelValue', false)"
        >
          <X :size="18" />
        </button>
      </div>

      <!-- Body -->
      <div class="edd__body">
        <div v-if="error" class="edd__error">
          <AlertCircle :size="14" style="flex-shrink:0" /> {{ error }}
        </div>
        <p class="edd__text">
          {{ t('eventsList.deleteText') }} <strong>{{ eventName }}</strong> ?
        </p>
      </div>

      <!-- Footer -->
      <div class="edd__footer">
        <button type="button" class="edd__btn edd__btn--cancel" @click="$emit('update:modelValue', false)">
          {{ t('eventsList.deleteCancel') }}
        </button>
        <button type="button" class="edd__btn edd__btn--danger" :disabled="loading" @click="$emit('confirm')">
          <Trash2 :size="14" />
          {{ loading ? t('eventsList.deleteConfirming') : t('eventsList.deleteConfirm') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { Trash2, X, AlertCircle } from 'lucide-vue-next';

export default {
  name: 'EventDeleteDialog',
  components: { Trash2, X, AlertCircle },
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
.edd { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,.18); }

/* Header rouge charte */
.edd__header { display: flex; align-items: center; gap: 12px; padding: 16px 18px; background: #ff3131; }
.edd__icon { width: 38px; height: 38px; border-radius: 11px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.edd__head-text { flex: 1; min-width: 0; }
.edd__title { color: #fff; font-size: var(--fs-md); font-weight: 700; }
.edd__subtitle { color: rgba(255,255,255,.8); font-size: var(--fs-sm); margin-top: 1px; }
.edd__close { width: 30px; height: 30px; border: none; border-radius: 8px; background: rgba(255,255,255,.18); color: rgba(255,255,255,.9); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background .18s; flex-shrink: 0; }
.edd__close:hover { background: rgba(255,255,255,.3); }

/* Body */
.edd__body { padding: 20px 18px; display: flex; flex-direction: column; gap: 14px; }
.edd__error { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 10px; font-size: var(--fs-base); }
.edd__text { font-size: var(--fs-md); color: #374151; line-height: 1.6; margin: 0; }
.edd__text strong { color: #111827; font-weight: 700; }

/* Footer */
.edd__footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 18px; border-top: 1px solid #f0f0f0; background: #fafafa; }
.edd__btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: 100px; font-size: var(--fs-base); font-weight: 600; cursor: pointer; border: none; transition: all .2s; }
.edd__btn:disabled { opacity: .55; cursor: not-allowed; }
.edd__btn--cancel { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.edd__btn--cancel:hover:not(:disabled) { background: #f3f4f6; color: #374151; }
.edd__btn--danger { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255,49,49,.3); }
.edd__btn--danger:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(255,49,49,.4); transform: translateY(-1px); }

/* Dark */
.edd--dark { background: #1f2937; }
.edd--dark .edd__body { background: #1f2937; }
.edd--dark .edd__text { color: #d1d5db; }
.edd--dark .edd__text strong { color: #f3f4f6; }
.edd--dark .edd__error { background: rgba(255,49,49,.12); border-color: rgba(255,49,49,.3); color: #fca5a5; }
.edd--dark .edd__footer { background: #111827; border-top-color: rgba(255,255,255,.08); }
.edd--dark .edd__btn--cancel { background: transparent; border-color: rgba(255,255,255,.14); color: #cbd5e1; }
.edd--dark .edd__btn--cancel:hover:not(:disabled) { background: #374151; color: #fff; }
</style>
