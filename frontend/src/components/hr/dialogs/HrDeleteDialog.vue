<template>
  <v-dialog
    :model-value="modelValue"
    max-width="420"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="hdd" :class="{ 'hdd--dark': isDark }">

      <!-- Header -->
      <div class="hdd__header">
        <button class="hdd__close" :aria-label="t('hrCancel')" @click="close">
          <X :size="18" />
        </button>
        <div class="hdd__warning-icon">
          <Trash2 :size="34" color="white" />
        </div>
        <h3 class="hdd__title">{{ t('hrDeleteSupplierTitle') }}</h3>
        <p class="hdd__message">
          {{ t('hrDeleteConfirm') }} <strong>"{{ supplierName }}"</strong> ?
          <br />
          <span class="hdd__irreversible">{{ t('hrDeleteIrreversible') }}</span>
        </p>
      </div>

      <!-- Error -->
      <div v-if="error" class="hdd__error">
        <AlertCircle :size="14" class="me-2" style="flex-shrink:0" />
        {{ error }}
      </div>

      <!-- Footer -->
      <div class="hdd__footer">
        <button class="hdd-btn hdd-btn--cancel" :disabled="loading" @click="close">
          {{ t('hrCancel') }}
        </button>
        <button class="hdd-btn hdd-btn--delete" :disabled="loading" @click="confirm">
          <span v-if="loading" class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
          <Trash2 v-else :size="15" class="me-1" />
          {{ t('hrDelete') }}
        </button>
      </div>

    </div>
  </v-dialog>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useTheme } from 'vuetify'
import { AlertCircle, Trash2, X } from 'lucide-vue-next'
import { t } from '@/i18n'
import * as hrApi from '@/utils/hrApi'

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  supplierName: { type: String, default: '' },
  supplierId: { type: [String, Number], default: null },
})
const emit = defineEmits(['update:modelValue', 'deleted'])

const theme = useTheme()
const isDark = computed(() => !!theme.global.current.value.dark)

const loading = ref(false)
const error = ref('')

function close() {
  error.value = ''
  loading.value = false
  emit('update:modelValue', false)
}
async function confirm() {
  if (!props.supplierId) { error.value = t('hrSaveError'); return }
  loading.value = true
  error.value = ''
  try {
    await hrApi.deleteHRSupplier(props.supplierId)
    emit('deleted')
    close()
  } catch (e) {
    error.value = t('hrSaveError')
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
/* Dialog de suppression self-contained (parité SupplierDeleteDialog `.sdd-*`),
   en-tête rouge dégradé, tokens de la charte typo. */
.hdd {
  background: #fff;
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.15);
}
.hdd--dark { background: #0f172a; }

.hdd__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36px 28px 24px;
  text-align: center;
  position: relative;
  background: linear-gradient(180deg, #fff5f5 0%, #fff 100%);
}
.hdd--dark .hdd__header { background: linear-gradient(180deg, rgba(255, 49, 49, 0.12) 0%, #0f172a 100%); }
.hdd__close {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #9ca3af;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.18s, color 0.18s;
}
.hdd__close:hover { background: #f3f4f6; color: #374151; }
.hdd--dark .hdd__close:hover { background: rgba(255, 255, 255, 0.1); color: #e2e8f0; }
.hdd__warning-icon {
  width: 68px;
  height: 68px;
  border-radius: 20px;
  background: linear-gradient(135deg, #ff3131, #b91c1c);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 18px;
  box-shadow: 0 8px 24px rgba(255, 49, 49, 0.3);
}
.hdd__title { font-size: var(--fs-lg); font-weight: var(--fw-bold); color: #111827; margin: 0 0 12px; }
.hdd--dark .hdd__title { color: #f9fafb; }
.hdd__message { font-size: var(--fs-md); color: #4b5563; line-height: 1.6; margin: 0; }
.hdd--dark .hdd__message { color: #cbd5e1; }
.hdd__message strong { color: #111827; }
.hdd--dark .hdd__message strong { color: #f9fafb; }
.hdd__irreversible { font-size: var(--fs-sm); color: #9ca3af; }

.hdd__error {
  display: flex;
  align-items: center;
  padding: 10px 24px;
  background: #fef2f2;
  border-top: 1px solid #fecaca;
  border-bottom: 1px solid #fecaca;
  font-size: var(--fs-base);
  color: #ff3131;
}

.hdd__footer {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 20px 24px;
  background: #fafafa;
  border-top: 1px solid #f0f0f0;
}
.hdd--dark .hdd__footer { background: #1e293b; border-top-color: rgba(255, 255, 255, 0.08); }
.hdd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 26px;
  border-radius: 100px;
  font-size: var(--fs-md);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  transition: all 0.2s;
  border: none;
  line-height: 1.4;
  min-width: 120px;
}
.hdd-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.hdd-btn--cancel { background: transparent; border: 1.5px solid #e5e7eb; color: #6b7280; }
.hdd-btn--cancel:hover:not(:disabled) { background: #f3f4f6; border-color: #9ca3af; color: #374151; }
.hdd--dark .hdd-btn--cancel { border-color: rgba(255, 255, 255, 0.14); color: #cbd5e1; }
.hdd--dark .hdd-btn--cancel:hover:not(:disabled) { background: #1e293b; }
.hdd-btn--delete { background: #ff3131; color: #fff; box-shadow: 0 4px 14px rgba(255, 49, 49, 0.3); }
.hdd-btn--delete:hover:not(:disabled) { box-shadow: 0 6px 20px rgba(255, 49, 49, 0.42); transform: translateY(-1px); }
</style>
