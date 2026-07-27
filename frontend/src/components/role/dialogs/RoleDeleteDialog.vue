<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="460"
    :persistent="loading"
  >
    <div class="rdd-dialog" :class="{ 'rdd--dark': isDark }">

      <!-- Header dégradé danger -->
      <div class="rdd-header">
        <div class="rdd-header__icon"><Trash2 :size="20" color="white" /></div>
        <div class="rdd-header__text">
          <p class="rdd-header__title">{{ t('roleList.deleteTitle') }}</p>
          <p class="rdd-header__sub">{{ t('roleList.deleteSubtitle') }}</p>
        </div>
        <button class="rdd-header__close" :disabled="loading" @click="$emit('update:modelValue', false)">
          <X :size="15" />
        </button>
      </div>

      <!-- Body -->
      <div class="rdd-body">
        <div v-if="error" class="rdd-error mb-3">
          <AlertTriangle :size="14" />
          {{ error }}
        </div>
        <p class="rdd-confirm-text">
          {{ t('roleList.deleteConfirm') }} <strong>{{ itemName }}</strong>&nbsp;?
        </p>
      </div>

      <!-- Footer -->
      <div class="rdd-footer">
        <button class="rdd-btn rdd-btn--ghost" :disabled="loading" @click="$emit('update:modelValue', false)">
          {{ t('roleList.cancel') }}
        </button>
        <button class="rdd-btn rdd-btn--danger" :disabled="loading" @click="$emit('confirm')">
          <v-progress-circular v-if="loading" indeterminate size="13" width="2" color="white" />
          <Trash2 v-else :size="14" />
          {{ t('roleList.delete') }}
        </button>
      </div>

    </div>
  </v-dialog>
</template>

<script>
import { Trash2, X, AlertTriangle } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'RoleDeleteDialog',
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
.rdd-dialog {
  background: #fff;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.14);
}

/* ── Header ── */
.rdd-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  background: #ff3131;
  box-shadow: 0 2px 12px rgba(255, 49, 49, 0.2);
}

.rdd-header__icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.rdd-header__text { flex: 1; min-width: 0; }

.rdd-header__title {
  font-size: var(--fs-md);
  font-weight: var(--fw-bold);
  color: #fff;
  margin: 0;
  line-height: 1.3;
}

.rdd-header__sub {
  font-size: var(--fs-sm);
  color: rgba(255, 255, 255, 0.72);
  margin: 2px 0 0;
}

.rdd-header__close {
  background: rgba(255, 255, 255, 0.15);
  border: none;
  cursor: pointer;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  transition: background 0.15s;
  flex-shrink: 0;
}

.rdd-header__close:hover:not(:disabled) { background: rgba(255, 255, 255, 0.25); }
.rdd-header__close:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Body ── */
.rdd-body {
  padding: 24px 24px 20px;
  background: #f9fafb;
}

.rdd-confirm-text {
  font-size: 0.9375rem;
  color: #374151;
  line-height: 1.55;
  margin: 0;
}

.rdd-confirm-text strong { color: #111827; }

/* ── Erreur ── */
.rdd-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(255, 49, 49, 0.08);
  border: 1px solid rgba(255, 49, 49, 0.2);
  border-radius: 10px;
  font-size: 0.8125rem;
  color: #ff3131;
}

/* ── Footer ── */
.rdd-footer {
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
}

.rdd-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
  height: 38px;
  border-radius: 50px;
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.rdd-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.rdd-btn--ghost {
  background: #f3f4f6;
  color: #374151;
}

.rdd-btn--ghost:hover:not(:disabled) { background: #e5e7eb; }

.rdd-btn--danger {
  background: #ff3131;
  color: #fff;
}

.rdd-btn--danger:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(255, 49, 49, 0.35);
}

/* ── Dark mode ── (dialog téléporté, piloté par la prop isDark → .rdd--dark ;
   le header rouge #ff3131 et le bouton danger restent identiques). */
.rdd--dark.rdd-dialog { background: #1f2937; }
.rdd--dark .rdd-body { background: #111827; }
.rdd--dark .rdd-confirm-text { color: #d1d5db; }
.rdd--dark .rdd-confirm-text strong { color: #f9fafb; }
.rdd--dark .rdd-footer { background: #1f2937; border-top-color: #374151; }
.rdd--dark .rdd-btn--ghost { background: #374151; color: #f9fafb; }
.rdd--dark .rdd-btn--ghost:hover:not(:disabled) { background: #4b5563; }
</style>
