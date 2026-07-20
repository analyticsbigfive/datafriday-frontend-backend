<template>
  <FlatReferentialFormDrawer
    :model-value="modelValue"
    @update:model-value="$emit('update:modelValue', $event)"
    :mode="mode"
    :initial-data="initialData"
    :is-dark="isDark"
    i18n-prefix="displayNameList"
    :icon="Tag"
    store-module="displayNames"
    add-action="addDisplayName"
    update-action="updateDisplayName"
    :create-fn="createDisplayName"
    :update-fn="updateDisplayName"
    @saved="$emit('saved', $event)"
  />
</template>

<script>
import { Tag } from 'lucide-vue-next';
import { createDisplayName, updateDisplayName } from '@/api/endpoints/display-name.api';
import FlatReferentialFormDrawer from '@/components/common/FlatReferentialFormDrawer.vue';

// BUG-165: thin per-entity config over the generic FlatReferentialFormDrawer. Kept as its own
// component (not inlined into DisplayNameListView) because MenuItemCreateView.vue imports this
// exact path directly to open a display-name-creation drawer from the menu item form.
export default {
  name: 'DisplayNameFormDrawer',
  components: { FlatReferentialFormDrawer },
  props: {
    modelValue: { type: Boolean, default: false },
    mode: { type: String, default: 'create' },
    initialData: { type: Object, default: null },
    isDark: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'saved'],
  data() {
    return { Tag, createDisplayName, updateDisplayName };
  },
};
</script>
