<template>
  <v-dialog :model-value="modelValue" max-width="440" @update:model-value="$emit('update:modelValue', $event)">
    <div class="sdd-card">
      <div class="sdd-card__head">
        <div class="sdd-card__icon-wrap">
          <Trash2 :size="20" color="#ff3131" />
        </div>
        <div class="sdd-card__headtext">
          <div class="sdd-card__title">{{ t('spaceList.deleteTitle') }}</div>
          <div class="sdd-card__sub">{{ t('spaceList.deleteSubtitle') }}</div>
        </div>
        <button class="sdd-card__close" @click="$emit('update:modelValue', false)">
          <X :size="16" />
        </button>
      </div>
      <div class="sdd-card__body">
        {{ t('spaceList.deleteConfirm') }}
        <strong>{{ space?.name || '' }}</strong> ?
      </div>
      <div class="sdd-card__foot">
        <button class="sdd-btn sdd-btn--cancel" @click="$emit('update:modelValue', false)">
          {{ t('spaceList.cancel') }}
        </button>
        <button class="sdd-btn sdd-btn--danger" :disabled="loading" @click="$emit('confirm')">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
          <Trash2 v-else :size="14" />
          {{ t('spaceList.delete') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { useI18n } from '@/i18n/useI18n';
import { Trash2, X } from 'lucide-vue-next';

export default {
  name: 'SpaceDeleteDialog',
  components: { Trash2, X },
  props: {
    modelValue: { type: Boolean, default: false },
    space: { type: Object, default: null },
    loading: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'confirm'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
};
</script>

<style scoped>
.sdd-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}
.sdd-card__head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 24px 24px 16px;
}
.sdd-card__icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: #fef2f2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.sdd-card__headtext { flex: 1; }
.sdd-card__title { font-size: var(--fs-lg); font-weight: 700; color: #111827; }
.sdd-card__sub { font-size: var(--fs-base); color: #6b7280; margin-top: 2px; }
.sdd-card__close {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: none;
  background: #f3f4f6;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6b7280;
  flex-shrink: 0;
}
.sdd-card__close:hover { background: #e5e7eb; }
.sdd-card__body {
  padding: 0 24px 20px;
  font-size: var(--fs-md);
  color: #374151;
  line-height: 1.6;
}
.sdd-card__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 24px;
  background: #f9fafb;
  border-top: 1px solid #f3f4f6;
}
.sdd-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 18px;
  height: 38px;
  border-radius: 100px;
  font-size: var(--fs-base);
  font-weight: 500;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}
.sdd-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.sdd-btn--cancel {
  background: #f3f4f6;
  color: #374151;
  border: 1.5px solid #e5e7eb;
}
.sdd-btn--cancel:hover { background: #e9ecef; }
.sdd-btn--danger {
  background: #ff3131;
  color: #fff;
  box-shadow: 0 4px 12px rgba(255, 49, 49, 0.25);
}
.sdd-btn--danger:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49, 0.4); }
</style>
