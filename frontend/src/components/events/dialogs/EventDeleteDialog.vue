<template>
  <v-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)" max-width="440">
    <div class="edd-card" :class="{'edd--dark': isDark}">
      <div class="edd-card__head">
        <div class="edd-card__icon-wrap">
          <Trash2 :size="20" color="#ff3131" />
        </div>
        <div class="edd-card__headtext">
          <div class="edd-card__title">Supprimer l'événement</div>
          <div class="edd-card__sub">Cette action est irréversible</div>
        </div>
        <button class="edd-card__close" @click="$emit('update:modelValue', false)">
          <X :size="16" />
        </button>
      </div>

      <div class="edd-card__body">
        <div v-if="error" class="edd-error">
          <AlertCircle :size="14" /> {{ error }}
        </div>
        <p class="edd-card__text">
          Voulez-vous supprimer l'événement <strong>{{ eventName }}</strong> ? Cette action est définitive et ne peut pas être annulée.
        </p>
      </div>

      <div class="edd-card__foot">
        <button class="edd-btn edd-btn--cancel" @click="$emit('update:modelValue', false)">Annuler</button>
        <button class="edd-btn edd-btn--danger" :disabled="loading" @click="$emit('confirm')">
          <Trash2 :size="14" />
          {{ loading ? 'Suppression…' : 'Supprimer' }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script>
import { Trash2, X, AlertCircle } from 'lucide-vue-next';
export default {
  name: 'EventDeleteDialog',
  components: { Trash2, X, AlertCircle },
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
.edd-card {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.15);
}
.edd-card__head {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 22px 22px 16px;
}
.edd-card__icon-wrap {
  width: 42px; height: 42px;
  border-radius: 12px;
  background: #fef2f2;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.edd-card__headtext { flex: 1; }
.edd-card__title { font-size: 16px; font-weight: 700; color: #111827; }
.edd-card__sub { font-size: 13px; color: #6b7280; margin-top: 2px; }
.edd-card__close {
  width: 28px; height: 28px;
  border-radius: 8px; border: none;
  background: #f3f4f6;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; color: #6b7280; flex-shrink: 0;
}
.edd-card__close:hover { background: #e5e7eb; }
.edd-card__body { padding: 0 22px 18px; }
.edd-card__text { font-size: 14px; color: #374151; line-height: 1.6; margin: 0; }
.edd-error {
  display: flex; align-items: center; gap: 8px;
  background: #fef2f2; border: 1px solid #fecaca;
  color: #991b1b; border-radius: 10px;
  padding: 10px 14px; font-size: 13px; margin-bottom: 14px;
}
.edd-card__foot {
  display: flex; justify-content: flex-end; gap: 10px;
  padding: 14px 22px;
  background: #f9fafb; border-top: 1px solid #f3f4f6;
}
.edd-btn {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 0 18px; height: 38px;
  border-radius: 50px; font-size: 13.5px; font-weight: 500;
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

/* Dark */
.edd--dark { background: #1f2937; }
.edd--dark .edd-card__title { color: #f9fafb; }
.edd--dark .edd-card__sub { color: #9ca3af; }
.edd--dark .edd-card__text { color: #d1d5db; }
.edd--dark .edd-card__close { background: #374151; color: #9ca3af; }
.edd--dark .edd-card__foot { background: #111827; border-top-color: #374151; }
.edd--dark .edd-btn--cancel { background: #374151; color: #d1d5db; border-color: #4b5563; }
</style>
