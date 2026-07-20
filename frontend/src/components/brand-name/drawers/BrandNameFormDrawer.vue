<template>
  <FlatReferentialFormDrawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :mode="mode"
    :initial-data="initialData"
    :is-dark="isDark"
    i18n-prefix="brandNameList"
    :icon="Tag"
    store-module="brandNames"
    add-action="addBrandName"
    update-action="updateBrandName"
    :create-fn="createBrandName"
    :update-fn="updateBrandName"
    @saved="$emit('saved', $event)"
  />
</template>

<script>
import { Tag } from 'lucide-vue-next';
import { createBrandName, updateBrandName } from '@/api/endpoints/brand-name.api';
import FlatReferentialFormDrawer from '@/components/common/FlatReferentialFormDrawer.vue';

// BUG-165: thin per-entity config over the generic FlatReferentialFormDrawer. Kept as its own
// component (not inlined into BrandNameListView) because MenuItemCreateView.vue imports this exact
// path directly to open a brand-creation drawer from the menu item form.
export default {
  name: 'BrandNameFormDrawer',
  components: { FlatReferentialFormDrawer },
  props: {
    modelValue: { type: Boolean, default: false },
    mode: { type: String, default: 'create' },
    initialData: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'saved'],
  data() {
    return { Tag, createBrandName, updateBrandName };
  },
};
</script>
