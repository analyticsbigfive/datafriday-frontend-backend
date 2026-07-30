<template>
  <FlatReferentialListView
    i18n-prefix="storageTypeList"
    :icon="Thermometer"
    store-module="storageTypes"
    fetch-action="fetchStorageTypes"
    add-action="addStorageType"
    update-action="updateStorageType"
    remove-action="removeStorageType"
    :create-fn="createStorageType"
    :update-fn="updateStorageType"
    :delete-fn="deleteStorageType"
    :get-fn="getStorageTypes"
    add-button-key="storageTypeList.addStorageType"
    total-count-key="storageTypeList.totalStorageTypes"
    search-count-mode="total"
  />
</template>

<script>
import { Thermometer } from 'lucide-vue-next';
import { createStorageType, updateStorageType, deleteStorageType, getStorageTypes } from '@/api/endpoints/storage-type.api';
import FlatReferentialListView from '@/components/common/FlatReferentialListView.vue';

// Thin per-entity config over the generic FlatReferentialListView, même motif que
// PackingTypeListView.vue.
export default {
  name: 'StorageTypeListView',
  components: { FlatReferentialListView },
  data() {
    return { Thermometer, createStorageType, updateStorageType, deleteStorageType, getStorageTypes };
  },
};
</script>
