<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="480"
  >
    <div class="ind-card" :class="{'ind--dark': isDark}">
      <div class="ind-card__head">
        <div class="ind-card__icon-wrap">
          <Trash2 :size="20" color="#ff3131" />
        </div>
        <div class="ind-card__headtext">
          <div class="ind-card__title">{{ t('industrialList.deleteTitle') }}</div>
          <div class="ind-card__sub">{{ t('industrialList.deleteSubtitle') }}</div>
        </div>
        <button class="ind-card__close" @click="$emit('update:modelValue', false)">
          <X :size="16" />
        </button>
      </div>

      <div class="ind-card__body">
        <div v-if="error" class="ind-card__error">
          <AlertCircle :size="14" /> {{ error }}
        </div>
        <p class="ind-card__msg">
          {{ t('industrialList.deleteConfirm') }} <strong>{{ itemName }}</strong>&nbsp;?
        </p>
      </div>

      <div class="ind-card__foot">
        <button class="ind-btn ind-btn--cancel" @click="$emit('update:modelValue', false)">
          {{ t('industrialList.cancel') }}
        </button>
        <button class="ind-btn ind-btn--danger" :disabled="loading" @click="$emit('confirm')">
          <Trash2 :size="14" /> {{ loading ? 'Suppression…' : t('industrialList.delete') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { Trash2, X, AlertCircle } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'IndustrialDeleteDialog',
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
.ind-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .15);
}
.ind-card__head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 22px 22px 16px;
}
.ind-card__icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: #fef2f2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ind-card__headtext { flex: 1; min-width: 0; }
.ind-card__title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}
.ind-card__sub {
  font-size: 13px;
  color: #6b7280;
  margin-top: 2px;
}
.ind-card__close {
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
.ind-card__close:hover { color: #374151; background: #f3f4f6; }

.ind-card__body { padding: 0 22px 20px; }
.ind-card__error {
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
.ind-card__msg {
  font-size: 14px;
  color: #374151;
  margin: 0;
}

.ind-card__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 22px;
  border-top: 1px solid #f3f4f6;
}
.ind-btn {
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
.ind-btn--cancel { background: #f3f4f6; color: #374151; }
.ind-btn--cancel:hover { background: #e5e7eb; }
.ind-btn--danger { background: #ff3131; color: #fff; }
.ind-btn--danger:hover { box-shadow: 0 4px 14px rgba(255, 49, 49, .4); transform: translateY(-1px); }
.ind-btn:disabled { opacity: .6; cursor: not-allowed; transform: none !important; }

/* ── Dark mode ── */
.ind--dark.ind-card { background: #1f2937; }
.ind--dark .ind-card__title { color: #f9fafb; }
.ind--dark .ind-card__sub { color: #9ca3af; }
.ind--dark .ind-card__msg { color: #d1d5db; }
.ind--dark .ind-card__foot { border-top-color: #374151; }
.ind--dark .ind-btn--cancel { background: #374151; color: #d1d5db; }
</style>
