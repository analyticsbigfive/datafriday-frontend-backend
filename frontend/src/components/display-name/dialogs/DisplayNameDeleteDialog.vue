<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="480"
  >
    <div class="dnd-card" :class="{'dnd--dark': isDark}">
      <div class="dnd-card__head">
        <div class="dnd-card__icon-wrap">
          <Trash2 :size="20" color="#ff3131" />
        </div>
        <div class="dnd-card__headtext">
          <div class="dnd-card__title">{{ t('displayNameList.deleteTitle') }}</div>
          <div class="dnd-card__sub">{{ t('displayNameList.deleteSubtitle') }}</div>
        </div>
        <button class="dnd-card__close" @click="$emit('update:modelValue', false)">
          <X :size="16" />
        </button>
      </div>

      <div class="dnd-card__body">
        <div v-if="error" class="dnd-card__error">
          <AlertCircle :size="14" /> {{ error }}
        </div>
        <p class="dnd-card__msg">
          {{ t('displayNameList.deleteConfirm') }} <strong>{{ itemName }}</strong>&nbsp;?
        </p>
      </div>

      <div class="dnd-card__foot">
        <button class="dnd-btn dnd-btn--cancel" @click="$emit('update:modelValue', false)">
          {{ t('displayNameList.cancel') }}
        </button>
        <button class="dnd-btn dnd-btn--danger" :disabled="loading" @click="$emit('confirm')">
          <Trash2 :size="14" /> {{ loading ? t('displayNameList.deleting') : t('displayNameList.delete') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { Trash2, X, AlertCircle } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'DisplayNameDeleteDialog',
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
.dnd-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .15);
}
.dnd-card__head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 22px 22px 16px;
}
.dnd-card__icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: #fef2f2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.dnd-card__headtext { flex: 1; min-width: 0; }
.dnd-card__title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}
.dnd-card__sub {
  font-size: 13px;
  color: #6b7280;
  margin-top: 2px;
}
.dnd-card__close {
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
.dnd-card__close:hover { color: #374151; background: #f3f4f6; }

.dnd-card__body { padding: 0 22px 20px; }
.dnd-card__error {
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
.dnd-card__msg {
  font-size: 14px;
  color: #374151;
  margin: 0;
}

.dnd-card__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 22px;
  border-top: 1px solid #f3f4f6;
}
.dnd-btn {
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
.dnd-btn--cancel { background: #f3f4f6; color: #374151; }
.dnd-btn--cancel:hover { background: #e5e7eb; }
.dnd-btn--danger { background: #ff3131; color: #fff; }
.dnd-btn--danger:hover { box-shadow: 0 4px 14px rgba(255, 49, 49, .4); transform: translateY(-1px); }
.dnd-btn:disabled { opacity: .6; cursor: not-allowed; transform: none !important; }

/* ── Dark mode ── */
.dnd--dark.dnd-card { background: #1f2937; }
.dnd--dark .dnd-card__title { color: #f9fafb; }
.dnd--dark .dnd-card__sub { color: #9ca3af; }
.dnd--dark .dnd-card__msg { color: #d1d5db; }
.dnd--dark .dnd-card__foot { border-top-color: #374151; }
.dnd--dark .dnd-btn--cancel { background: #374151; color: #d1d5db; }
</style>
