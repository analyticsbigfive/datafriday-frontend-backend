<template>
  <v-dialog
    :model-value="modelValue"
    max-width="420"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="hrdd" :class="{ 'hrdd--dark': isDark }">
      <div class="hrdd-header">
        <button class="hrdd-close" :aria-label="t('hrCancel')" @click="close">
          <X :size="18" />
        </button>
        <div class="hrdd-icon">
          <Trash2 :size="34" color="white" />
        </div>
        <h3 class="hrdd-title">{{ t('hrDeleteTitle') }}</h3>
        <p class="hrdd-message">
          {{ t('hrDeleteConfirm') }} <strong>« {{ itemName }} »</strong> ?
        </p>
      </div>

      <div class="hrdd-footer">
        <button class="hrdd-btn hrdd-btn--cancel" @click="close">
          {{ t('hrCancel') }}
        </button>
        <button class="hrdd-btn hrdd-btn--delete" @click="$emit('confirm')">
          <Trash2 :size="15" />
          {{ t('hrDelete') }}
        </button>
      </div>
    </div>
  </v-dialog>
</template>

<script setup>
import { Trash2, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import './hrForms.css'

defineProps({
  modelValue: { type: Boolean, default: false },
  itemName: { type: String, default: '' },
  isDark: { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'confirm'])

function close() {
  emit('update:modelValue', false)
}
</script>
