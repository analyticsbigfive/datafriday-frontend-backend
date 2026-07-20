<template>
  <FlatReferentialFormDrawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :mode="mode"
    :initial-data="initialData"
    :is-dark="isDark"
    i18n-prefix="industrialList"
    :icon="Factory"
    store-module="industrials"
    add-action="addIndustrial"
    update-action="updateIndustrial"
    :create-fn="createIndustrial"
    :update-fn="updateIndustrial"
    @saved="$emit('saved', $event)"
  />
</template>

<script>
import { Factory } from 'lucide-vue-next';
import { createIndustrial, updateIndustrial } from '@/api/endpoints/industrial.api';
import FlatReferentialFormDrawer from '@/components/common/FlatReferentialFormDrawer.vue';

// BUG-165: thin per-entity config over the generic FlatReferentialFormDrawer.
export default {
  name: 'IndustrialFormDrawer',
  components: { FlatReferentialFormDrawer },
  props: {
    modelValue: { type: Boolean, default: false },
    mode: { type: String, default: 'create' },
    initialData: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'saved'],
  data() {
    return { Factory, createIndustrial, updateIndustrial };
  },
};
</script>
