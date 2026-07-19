<template>
  <FlatReferentialFormDrawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :mode="mode"
    :initial-data="initialData"
    :is-dark="isDark"
    i18n-prefix="packingTypeList"
    :icon="Box"
    store-module="packingTypes"
    add-action="addPackingType"
    update-action="updatePackingType"
    :create-fn="createPackingType"
    :update-fn="updatePackingType"
    @saved="$emit('saved', $event)"
  />
</template>

<script>
import { Box } from 'lucide-vue-next';
import { createPackingType, updatePackingType } from '@/api/endpoints/packing-type.api';
import FlatReferentialFormDrawer from '@/components/common/FlatReferentialFormDrawer.vue';

// BUG-165: thin per-entity config over the generic FlatReferentialFormDrawer.
export default {
  name: 'PackingTypeFormDrawer',
  components: { FlatReferentialFormDrawer },
  props: {
    modelValue: { type: Boolean, default: false },
    mode: { type: String, default: 'create' },
    initialData: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'saved'],
  data() {
    return { Box, createPackingType, updatePackingType };
  },
};
</script>
