<template>
  <FlatReferentialListView
    i18n-prefix="brandNameList"
    :icon="Tag"
    store-module="brandNames"
    fetch-action="fetchBrandNames"
    add-action="addBrandName"
    update-action="updateBrandName"
    remove-action="removeBrandName"
    :create-fn="createBrandName"
    :update-fn="updateBrandName"
    :delete-fn="deleteBrandName"
    add-button-key="brandNameList.addBrand"
    total-count-key="brandNameList.totalBrands"
  />
</template>

<script>
import { Tag } from 'lucide-vue-next';
import { createBrandName, updateBrandName, deleteBrandName } from '@/api/endpoints/brand-name.api';
import FlatReferentialListView from '@/components/common/FlatReferentialListView.vue';

// BUG-165: thin per-entity config over the generic FlatReferentialListView. Kept as its own named
// component (rather than pointed to directly from the router) because this exact import path is
// not referenced elsewhere, but the pattern is shared with the sibling wrappers below.
export default {
  name: 'BrandNameListView',
  components: { FlatReferentialListView },
  data() {
    return { Tag, createBrandName, updateBrandName, deleteBrandName };
  },
};
</script>
