<template>
  <!-- Dialog de suppression multiple réutilisable — 2 états : confirmation puis
       progression « X/N supprimés ». Style charte (header rouge, boutons pilule,
       dark). Le parent gère la boucle de suppression et pousse progress/total. -->
  <v-dialog :model-value="modelValue" max-width="440" :persistent="loading" @update:model-value="$emit('update:modelValue', $event)">
    <div class="bdd" :class="{ 'bdd--dark': isDark }">
      <div class="bdd__header">
        <div class="bdd__icon"><Trash2 :size="20" color="white" /></div>
        <div class="bdd__title">{{ title }}</div>
        <button v-if="!loading" type="button" class="bdd__close" :aria-label="cancelLabel" @click="$emit('update:modelValue', false)">
          <X :size="18" />
        </button>
      </div>

      <div class="bdd__body">
        <div v-if="error" class="bdd__error">
          <AlertCircle :size="14" style="flex-shrink:0" /> {{ error }}
        </div>

        <template v-if="loading">
          <div class="bdd__progress">
            <div class="bdd__progress-bar" :style="{ width: pct + '%' }"></div>
          </div>
          <div class="bdd__progress-label">
            {{ progress }}/{{ total }} {{ progressLabel }}
          </div>
        </template>
        <p v-else class="bdd__text">
          <slot name="message">{{ message }}</slot>
        </p>
      </div>

      <div class="bdd__footer">
        <template v-if="!loading">
          <button type="button" class="bdd__btn bdd__btn--cancel" @click="$emit('update:modelValue', false)">{{ cancelLabel }}</button>
          <button type="button" class="bdd__btn bdd__btn--danger" :disabled="disabled" @click="$emit('confirm')">
            <Trash2 :size="14" /> {{ confirmLabel }}
          </button>
        </template>
        <button v-else type="button" class="bdd__btn bdd__btn--cancel" disabled>{{ deletingLabel }}</button>
      </div>
    </div>
  </v-dialog>
</template>

<script setup>
import { computed } from 'vue'
import { Trash2, X, AlertCircle } from 'lucide-vue-next'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: 'Supprimer' },
  message: { type: String, default: '' },
  progress: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  progressLabel: { type: String, default: 'supprimés' },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
  disabled: { type: Boolean, default: false },
  isDark: { type: Boolean, default: false },
  confirmLabel: { type: String, default: 'Supprimer' },
  cancelLabel: { type: String, default: 'Annuler' },
  deletingLabel: { type: String, default: 'Suppression en cours…' },
})
defineEmits(['update:modelValue', 'confirm'])

const pct = computed(() => (props.total ? Math.round((props.progress / props.total) * 100) : 0))
</script>

<style scoped>
.bdd { background: #fff; border-radius: 16px; overflow: hidden; }
.bdd__header { display: flex; align-items: center; gap: 12px; padding: 16px 18px; background: #ff3131; }
.bdd__icon { width: 38px; height: 38px; border-radius: 11px; background: rgba(255,255,255,.2); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.bdd__title { flex: 1; min-width: 0; color: #fff; font-size: var(--fs-md); font-weight: 700; }
.bdd__close { width: 30px; height: 30px; border: none; border-radius: 8px; background: rgba(255,255,255,.18); color: rgba(255,255,255,.9); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background .18s; flex-shrink: 0; }
.bdd__close:hover { background: rgba(255,255,255,.3); }
.bdd__body { padding: 20px 18px; display: flex; flex-direction: column; gap: 14px; }
.bdd__error { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; border-radius: 10px; font-size: var(--fs-base); }
.bdd__text { font-size: var(--fs-md); color: #374151; line-height: 1.6; margin: 0; }
.bdd__progress { height: 10px; background: #f1f5f9; border-radius: 100px; overflow: hidden; }
.bdd__progress-bar { height: 100%; background: #ff3131; border-radius: 100px; transition: width .2s ease; }
.bdd__progress-label { font-size: var(--fs-sm); color: #6b7280; text-align: center; font-weight: 600; }
.bdd__footer { display: flex; justify-content: flex-end; gap: 10px; padding: 14px 18px; border-top: 1px solid #f0f0f0; background: #fafafa; }
.bdd__btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 18px; border-radius: 100px; font-size: var(--fs-base); font-weight: 600; cursor: pointer; border: none; transition: all .2s; }
.bdd__btn:disabled { opacity: .6; cursor: default; }
.bdd__btn--cancel { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.bdd__btn--cancel:hover:not(:disabled) { background: #f3f4f6; color: #374151; }
.bdd__btn--danger { background: #ff3131; color: #fff; box-shadow: 0 4px 12px rgba(255,49,49,.3); }
.bdd__btn--danger:hover:not(:disabled) { box-shadow: 0 6px 18px rgba(255,49,49,.4); transform: translateY(-1px); }
/* Dark */
.bdd--dark { background: #1f2937; }
.bdd--dark .bdd__body { background: #1f2937; }
.bdd--dark .bdd__text { color: #d1d5db; }
.bdd--dark .bdd__error { background: rgba(255,49,49,.12); border-color: rgba(255,49,49,.3); color: #fca5a5; }
.bdd--dark .bdd__progress { background: rgba(255,255,255,.08); }
.bdd--dark .bdd__progress-label { color: #94a3b8; }
.bdd--dark .bdd__footer { background: #111827; border-top-color: rgba(255,255,255,.08); }
.bdd--dark .bdd__btn--cancel { background: transparent; border-color: rgba(255,255,255,.14); color: #cbd5e1; }
.bdd--dark .bdd__btn--cancel:hover:not(:disabled) { background: #374151; color: #fff; }
</style>
