<template>
  <FlatReferentialListView
    i18n-prefix="displayNameList"
    :icon="Tag"
    store-module="displayNames"
    fetch-action="fetchDisplayNames"
    add-action="addDisplayName"
    update-action="updateDisplayName"
    remove-action="removeDisplayName"
    :create-fn="createDisplayName"
    :update-fn="updateDisplayName"
    :delete-fn="deleteDisplayName"
    add-button-key="displayNameList.addDisplayName"
    total-count-key="displayNameList.totalDisplayNames"
  />
</template>

<script>
import { Tag } from 'lucide-vue-next';
import { createDisplayName, updateDisplayName, deleteDisplayName } from '@/api/endpoints/display-name.api';
import FlatReferentialListView from '@/components/common/FlatReferentialListView.vue';

// BUG-165: thin per-entity config over the generic FlatReferentialListView.
export default {
  name: 'DisplayNameListView',
  components: { FlatReferentialListView },
  data() {
    return { Tag, createDisplayName, updateDisplayName, deleteDisplayName };
  },
};
</script>
