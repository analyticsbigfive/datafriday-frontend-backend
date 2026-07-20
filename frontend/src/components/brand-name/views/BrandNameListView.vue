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
    :get-fn="getBrandNames"
    add-button-key="brandNameList.addBrand"
    total-count-key="brandNameList.totalBrands"
  />
</template>

<script>
import { Tag } from 'lucide-vue-next';
import { createBrandName, updateBrandName, deleteBrandName, getBrandNames } from '@/api/endpoints/brand-name.api';
import FlatReferentialListView from '@/components/common/FlatReferentialListView.vue';

// BUG-165: thin per-entity config over the generic FlatReferentialListView. Kept as its own named
// component (rather than pointed to directly from the router) because this exact import path is
// not referenced elsewhere, but the pattern is shared with the sibling wrappers below.
// BUG-171: `getBrandNames` (paginated GET) is now also passed through — drives this screen's own
// server-side paginated/searched table, separate from the `fetchAction` full-list loop.
export default {
  name: 'BrandNameListView',
  components: { FlatReferentialListView },
  data() {
    return { Tag, createBrandName, updateBrandName, deleteBrandName, getBrandNames };
  },
};
</script>
