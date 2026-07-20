<template>
  <FlatReferentialDeleteDialog
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    i18n-prefix="industrialList"
    :item-name="itemName"
    :loading="loading"
    :error="error"
    :is-dark="isDark"
    @confirm="$emit('confirm')"
  />
</template>

<script>
import FlatReferentialDeleteDialog from '@/components/common/FlatReferentialDeleteDialog.vue';

// BUG-165: thin per-entity config over the generic FlatReferentialDeleteDialog.
export default {
  name: 'IndustrialDeleteDialog',
  components: { FlatReferentialDeleteDialog },
  props: {
    modelValue: { type: Boolean, default: false },
    itemName: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    error: { type: String, default: '' },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'confirm'],
};
</script>
