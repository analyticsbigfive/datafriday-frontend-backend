<template>
  <v-dialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    max-width="520"
  >
    <v-card rounded="lg" :class="{'pdd--dark': isDark}">
      <v-card-title class="pb-0">
        <div class="d-flex align-center justify-space-between w-100">
          <div>
            <div class="text-h6 font-weight-bold">{{ t('permissionList.deleteTitle') }}</div>
            <div class="text-body-2 text-medium-emphasis mt-1">{{ t('permissionList.deleteSubtitle') }}</div>
          </div>
          <v-btn icon variant="text" density="compact" @click="$emit('update:modelValue', false)">
            <X :size="18" />
          </v-btn>
        </div>
      </v-card-title>

      <v-card-text class="pt-6">
        <v-alert v-if="error" type="error" variant="tonal" density="compact" class="mb-4">
          {{ error }}
        </v-alert>
        <div>{{ t('permissionList.deleteConfirm') }} <span class="font-weight-bold">{{ itemName }}</span>&nbsp;?</div>
      </v-card-text>

      <v-card-actions class="px-6 pb-6">
        <v-spacer />
        <v-btn variant="outlined" rounded="lg" class="text-none" @click="$emit('update:modelValue', false)">
          {{ t('permissionList.cancel') }}
        </v-btn>
        <v-btn
          color="#ff3131"
          variant="flat"
          rounded="lg"
          class="text-white text-none"
          :loading="loading"
          @click="$emit('confirm')"
        >
          <Trash2 :size="16" class="mr-1" />
          {{ t('permissionList.delete') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import { Trash2, X } from 'lucide-vue-next';
import { useI18n } from '@/i18n/useI18n';

export default {
  name: 'PermissionDeleteDialog',
  components: { Trash2, X },
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
.pdd--dark {
  background: #1f2937 !important;
  color: rgba(255, 255, 255, 0.87);
}
.pdd--dark :deep(.v-card-title),
.pdd--dark :deep(.v-card-text),
.pdd--dark :deep(.v-card-actions) {
  background: #1f2937;
  color: rgba(255, 255, 255, 0.87);
}
</style>
