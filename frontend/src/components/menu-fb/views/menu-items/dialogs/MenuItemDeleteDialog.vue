<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="480"
  >
    <div class="midd-card" :class="{'midd--dark': isDark}">
      <div class="midd-card__head">
        <div class="midd-card__icon-wrap">
          <Trash2 :size="20" color="#ff3131" />
        </div>
        <div class="midd-card__headtext">
          <div class="midd-card__title">{{ title }}</div>
          <div v-if="subtitle" class="midd-card__sub">{{ subtitle }}</div>
        </div>
        <button class="midd-card__close" @click="$emit('update:modelValue', false)"><X :size="16" /></button>
      </div>
      <div class="midd-card__body">
        <div v-if="error" class="midd-card__error"><AlertCircle :size="14" /> {{ error }}</div>
        <p class="midd-card__msg">{{ message }} <strong>{{ itemName }}</strong> ?</p>
      </div>
      <div class="midd-card__foot">
        <button class="midd-btn midd-btn--cancel" @click="$emit('update:modelValue', false)">{{ cancelLabel }}</button>
        <button class="midd-btn midd-btn--danger" :disabled="loading" @click="$emit('confirm')">
          <Trash2 :size="14" />
          {{ loading ? 'Suppression…' : confirmLabel }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { AlertCircle, Trash2, X } from 'lucide-vue-next';

export default {
  name: 'MenuItemDeleteDialog',
  components: { AlertCircle, Trash2, X },
  props: {
    modelValue: { type: Boolean, default: false },
    itemName: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    isDark: { type: Boolean, default: false },
    title: { type: String, default: 'Supprimer' },
    subtitle: { type: String, default: '' },
    message: { type: String, default: 'Supprimer' },
    cancelLabel: { type: String, default: 'Annuler' },
    confirmLabel: { type: String, default: 'Supprimer' },
  },
  emits: ['update:modelValue', 'confirm'],
};
</script>

<style scoped>
.midd-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.15);
}
.midd-card__head {
  display: flex; align-items: flex-start; gap: 14px;
  padding: 22px 22px 16px;
}
.midd-card__icon-wrap {
  width: 42px; height: 42px; border-radius: 12px;
  background: #fef2f2;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.midd-card__headtext { flex: 1; min-width: 0; }
.midd-card__title { font-size: 16px; font-weight: 700; color: #111827; }
.midd-card__sub { font-size: 13px; color: #6b7280; margin-top: 2px; }
.midd-card__close {
  background: none; border: none; cursor: pointer; padding: 4px;
  color: #9ca3af; border-radius: 8px; display: flex; align-items: center;
  transition: color .15s, background .15s;
}
.midd-card__close:hover { color: #374151; background: #f3f4f6; }
.midd-card__body { padding: 0 22px 20px; }
.midd-card__error {
  display: flex; align-items: center; gap: 7px;
  background: #fef2f2; border: 1px solid #fecaca; color: #991b1b;
  border-radius: 10px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px;
}
.midd-card__msg { font-size: 14px; color: #374151; margin: 0; }
.midd-card__foot {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 22px 22px;
  border-top: 1px solid #f3f4f6;
}
.midd-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 20px; height: 40px; border-radius: 50px;
  font-size: 13.5px; font-weight: 600; cursor: pointer;
  border: none; transition: all .2s;
}
.midd-btn--cancel { background: #f3f4f6; color: #374151; }
.midd-btn--cancel:hover { background: #e5e7eb; }
.midd-btn--danger { background: #ff3131; color: #fff; }
.midd-btn--danger:hover { box-shadow: 0 4px 14px rgba(255, 49, 49,.4); transform: translateY(-1px); }
.midd-btn:disabled { opacity: .6; cursor: not-allowed; transform: none !important; }

/* Dark */
.midd--dark.midd-card { background: #1f2937; }
.midd--dark .midd-card__title { color: #f9fafb; }
.midd--dark .midd-card__sub { color: #9ca3af; }
.midd--dark .midd-card__msg { color: #d1d5db; }
.midd--dark .midd-card__foot { border-top-color: #374151; }
.midd--dark .midd-btn--cancel { background: #374151; color: #d1d5db; }
.midd--dark .midd-btn--cancel:hover { background: #4b5563; }
</style>
