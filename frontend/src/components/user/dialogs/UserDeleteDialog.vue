<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="460"
    :persistent="loading"
  >
    <div class="udd-dialog" :class="{ 'udd--dark': isDark }">

      <div class="udd-header">
        <div class="udd-header__icon"><Trash2 :size="20" color="white" /></div>
        <div class="udd-header__text">
          <p class="udd-header__title">{{ t('userList.deleteTitle') }}</p>
          <p class="udd-header__sub">{{ t('userList.deleteSubtitle') }}</p>
        </div>
        <button class="udd-header__close" :disabled="loading" @click="$emit('update:modelValue', false)">
          <X :size="15" />
        </button>
      </div>

      <div class="udd-body">
        <div v-if="error" class="udd-error">
          <AlertTriangle :size="14" />
          {{ error }}
        </div>
        <p class="udd-confirm-text">
          {{ t('userList.deleteConfirm') }} <strong>{{ itemName }}</strong>&nbsp;?
        </p>
      </div>

      <div class="udd-footer">
        <button class="udd-btn udd-btn--ghost" :disabled="loading" @click="$emit('update:modelValue', false)">
          {{ t('userList.cancel') }}
        </button>
        <button class="udd-btn udd-btn--danger" :disabled="loading" @click="$emit('confirm')">
          <v-progress-circular v-if="loading" indeterminate size="13" width="2" color="white" />
          <Trash2 v-else :size="14" />
          {{ t('userList.delete') }}
        </button>
      </div>

    </div>
  </v-dialog>
</template>

<script>
import { Trash2, X, AlertTriangle } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'UserDeleteDialog',
  components: { Trash2, X, AlertTriangle },
  props: {
    modelValue: { type: Boolean, default: false },
    itemName: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'confirm'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
};
</script>

<style scoped>
.udd-dialog {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.14);
}

/* ── Header ── */
.udd-header {
  display: flex; align-items: center; gap: 12px;
  padding: 16px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, 0.2);
}
.udd-header__icon {
  width: 38px; height: 38px; border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.udd-header__text { flex: 1; min-width: 0; }
.udd-header__title { font-size: 14px; font-weight: 700; color: #fff; margin: 0; line-height: 1.3; }
.udd-header__sub { font-size: 12px; color: rgba(255, 255, 255, 0.72); margin: 2px 0 0; }
.udd-header__close {
  background: rgba(255, 255, 255, 0.15); border: none; cursor: pointer;
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  color: #fff; transition: background 0.15s; flex-shrink: 0;
}
.udd-header__close:hover:not(:disabled) { background: rgba(255, 255, 255, 0.25); }
.udd-header__close:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Body ── */
.udd-body { padding: 24px 24px 20px; background: #f9fafb; display: flex; flex-direction: column; gap: 12px; }
.udd-confirm-text { font-size: 0.9375rem; color: #374151; line-height: 1.55; margin: 0; }
.udd-confirm-text strong { color: #111827; }

.udd-error {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 14px;
  background: rgba(255, 49, 49, 0.08);
  border: 1px solid rgba(255, 49, 49, 0.2);
  border-radius: 10px;
  font-size: 0.8125rem; color: #ff3131;
}

/* ── Footer ── */
.udd-footer {
  padding: 14px 20px; display: flex; align-items: center; justify-content: flex-end;
  gap: 10px; border-top: 1px solid #e5e7eb; background: #fff;
}
.udd-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 38px; border-radius: 50px;
  font-size: 13.5px; font-weight: 600; cursor: pointer; border: none; transition: all 0.2s;
}
.udd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.udd-btn--ghost { background: #f3f4f6; color: #374151; }
.udd-btn--ghost:hover:not(:disabled) { background: #e5e7eb; }
.udd-btn--danger { background: #ff3131; color: #fff; }
.udd-btn--danger:hover:not(:disabled) { box-shadow: 0 4px 12px rgba(255, 49, 49, 0.35); }

/* ── Dark mode ── (v-dialog piloté par la prop isDark → .udd--dark ; header
   rouge et bouton danger conservés). */
.udd--dark.udd-dialog { background: #1f2937; }
.udd--dark .udd-body { background: #111827; }
.udd--dark .udd-confirm-text { color: #d1d5db; }
.udd--dark .udd-confirm-text strong { color: #f9fafb; }
.udd--dark .udd-footer { background: #1f2937; border-top-color: #374151; }
.udd--dark .udd-btn--ghost { background: #374151; color: #f9fafb; }
.udd--dark .udd-btn--ghost:hover:not(:disabled) { background: #4b5563; }
</style>
