<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="480"
  >
    <div class="pktd-card" :class="{'pktd--dark': isDark}">
      <div class="pktd-card__head">
        <div class="pktd-card__icon-wrap">
          <Trash2 :size="20" color="#ff3131" />
        </div>
        <div class="pktd-card__headtext">
          <div class="pktd-card__title">{{ t('packingTypeList.deleteTitle') }}</div>
          <div class="pktd-card__sub">{{ t('packingTypeList.deleteSubtitle') }}</div>
        </div>
        <button class="pktd-card__close" @click="$emit('update:modelValue', false)">
          <X :size="16" />
        </button>
      </div>

      <div class="pktd-card__body">
        <div v-if="error" class="pktd-card__error">
          <AlertCircle :size="14" /> {{ error }}
        </div>
        <p class="pktd-card__msg">
          {{ t('packingTypeList.deleteConfirm') }} <strong>{{ itemName }}</strong>&nbsp;?
        </p>
      </div>

      <div class="pktd-card__foot">
        <button class="pktd-btn pktd-btn--cancel" @click="$emit('update:modelValue', false)">
          {{ t('packingTypeList.cancel') }}
        </button>
        <button class="pktd-btn pktd-btn--danger" :disabled="loading" @click="$emit('confirm')">
          <Trash2 :size="14" /> {{ loading ? t('packingTypeList.deleting') : t('packingTypeList.delete') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { Trash2, X, AlertCircle } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'PackingTypeDeleteDialog',
  components: { Trash2, X, AlertCircle },
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
.pktd-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .15);
}
.pktd-card__head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 22px 22px 16px;
}
.pktd-card__icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: #fef2f2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.pktd-card__headtext { flex: 1; min-width: 0; }
.pktd-card__title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}
.pktd-card__sub {
  font-size: 13px;
  color: #6b7280;
  margin-top: 2px;
}
.pktd-card__close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  color: #9ca3af;
  border-radius: 8px;
  display: flex;
  align-items: center;
  transition: color .15s, background .15s;
}
.pktd-card__close:hover { color: #374151; background: #f3f4f6; }

.pktd-card__body { padding: 0 22px 20px; }
.pktd-card__error {
  display: flex;
  align-items: center;
  gap: 7px;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 13px;
  margin-bottom: 14px;
}
.pktd-card__msg {
  font-size: 14px;
  color: #374151;
  margin: 0;
}

.pktd-card__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 22px;
  border-top: 1px solid #f3f4f6;
}
.pktd-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 20px;
  height: 40px;
  border-radius: 50px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all .2s;
}
.pktd-btn--cancel { background: #f3f4f6; color: #374151; }
.pktd-btn--cancel:hover { background: #e5e7eb; }
.pktd-btn--danger { background: #ff3131; color: #fff; }
.pktd-btn--danger:hover { box-shadow: 0 4px 14px rgba(255, 49, 49, .4); transform: translateY(-1px); }
.pktd-btn:disabled { opacity: .6; cursor: not-allowed; transform: none !important; }

/* ── Dark mode ── */
.pktd--dark.pktd-card { background: #1f2937; }
.pktd--dark .pktd-card__title { color: #f9fafb; }
.pktd--dark .pktd-card__sub { color: #9ca3af; }
.pktd--dark .pktd-card__msg { color: #d1d5db; }
.pktd--dark .pktd-card__foot { border-top-color: #374151; }
.pktd--dark .pktd-btn--cancel { background: #374151; color: #d1d5db; }
</style>
