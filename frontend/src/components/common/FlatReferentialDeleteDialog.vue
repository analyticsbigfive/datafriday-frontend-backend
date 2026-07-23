<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="480"
  >
    <div class="frdd-card" :class="{'frdd--dark': isDark}">
      <div class="frdd-card__head">
        <div class="frdd-card__icon-wrap">
          <Trash2 :size="20" color="#ff3131" />
        </div>
        <div class="frdd-card__headtext">
          <div class="frdd-card__title">{{ t(`${i18nPrefix}.deleteTitle`) }}</div>
          <div class="frdd-card__sub">{{ t(`${i18nPrefix}.deleteSubtitle`) }}</div>
        </div>
        <button class="frdd-card__close" @click="$emit('update:modelValue', false)">
          <X :size="16" />
        </button>
      </div>

      <div class="frdd-card__body">
        <div v-if="error" class="frdd-card__error">
          <AlertCircle :size="14" /> {{ error }}
        </div>
        <p class="frdd-card__msg">
          {{ t(`${i18nPrefix}.deleteConfirm`) }} <strong>{{ itemName }}</strong>&nbsp;?
        </p>
      </div>

      <div class="frdd-card__foot">
        <button class="frdd-btn frdd-btn--cancel" @click="$emit('update:modelValue', false)">
          {{ t(`${i18nPrefix}.cancel`) }}
        </button>
        <button class="frdd-btn frdd-btn--danger" :disabled="loading" @click="$emit('confirm')">
          <Trash2 :size="14" /> {{ loading ? t(`${i18nPrefix}.deleting`) : t(`${i18nPrefix}.delete`) }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { Trash2, X, AlertCircle } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

// BUG-165: generic replacement for BrandNameDeleteDialog / DisplayNameDeleteDialog /
// IndustrialDeleteDialog / PackingTypeDeleteDialog, which were byte-for-byte identical apart from
// their CSS class prefix and i18n namespace. Those 4 components now wrap this one.
export default {
  name: 'FlatReferentialDeleteDialog',
  components: { Trash2, X, AlertCircle },
  props: {
    modelValue: { type: Boolean, default: false },
    itemName: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    isDark: { type: Boolean, default: false },
    // i18n key prefix for this entity's screen, e.g. 'brandNameList' — resolves
    // `${i18nPrefix}.deleteTitle`, `.deleteSubtitle`, `.deleteConfirm`, `.cancel`, `.deleting`, `.delete`.
    i18nPrefix: { type: String, required: true },
  },
  emits: ['update:modelValue', 'confirm'],
  setup() {
    const { t } = useI18n();
    return { t };
  },
};
</script>

<style scoped>
.frdd-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .15);
}
.frdd-card__head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 22px 22px 16px;
}
.frdd-card__icon-wrap {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: #fef2f2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.frdd-card__headtext { flex: 1; min-width: 0; }
.frdd-card__title {
  font-size: 16px;
  font-weight: 700;
  color: #111827;
}
.frdd-card__sub {
  font-size: 13px;
  color: #6b7280;
  margin-top: 2px;
}
.frdd-card__close {
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
.frdd-card__close:hover { color: #374151; background: #f3f4f6; }

.frdd-card__body { padding: 0 22px 20px; }
.frdd-card__error {
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
.frdd-card__msg {
  font-size: 14px;
  color: #374151;
  margin: 0;
}

.frdd-card__foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 14px 22px 22px;
  border-top: 1px solid #f3f4f6;
}
.frdd-btn {
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
.frdd-btn--cancel { background: #f3f4f6; color: #374151; }
.frdd-btn--cancel:hover { background: #e5e7eb; }
.frdd-btn--danger { background: #ff3131; color: #fff; }
.frdd-btn--danger:hover { box-shadow: 0 4px 14px rgba(255, 49, 49, .4); transform: translateY(-1px); }
.frdd-btn:disabled { opacity: .6; cursor: not-allowed; transform: none !important; }

/* ── Dark mode ── */
.frdd--dark.frdd-card { background: #1f2937; }
.frdd--dark .frdd-card__title { color: #f9fafb; }
.frdd--dark .frdd-card__sub { color: #9ca3af; }
.frdd--dark .frdd-card__msg { color: #d1d5db; }
.frdd--dark .frdd-card__foot { border-top-color: #374151; }
.frdd--dark .frdd-btn--cancel { background: #374151; color: #d1d5db; }
.frdd--dark .frdd-btn--cancel:hover { background: #4b5563; }
.frdd--dark .frdd-card__icon-wrap { background: rgba(255, 49, 49, .15); }
.frdd--dark .frdd-card__error { background: rgba(255, 49, 49, .12); border-color: rgba(255, 49, 49, .3); color: #fca5a5; }
.frdd--dark .frdd-card__close { color: #9ca3af; }
.frdd--dark .frdd-card__close:hover { color: #f9fafb; background: #374151; }
</style>
