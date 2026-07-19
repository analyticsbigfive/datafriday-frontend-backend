<template>
  <FlatReferentialListView
    i18n-prefix="packingTypeList"
    :icon="Box"
    store-module="packingTypes"
    fetch-action="fetchPackingTypes"
    add-action="addPackingType"
    update-action="updatePackingType"
    remove-action="removePackingType"
    :create-fn="createPackingType"
    :update-fn="updatePackingType"
    :delete-fn="deletePackingType"
    add-button-key="packingTypeList.addPackingType"
    total-count-key="packingTypeList.totalPackingTypes"
    search-count-mode="total"
  />
</template>

<script>
import { Box } from 'lucide-vue-next';
import { createPackingType, updatePackingType, deletePackingType } from '@/api/endpoints/packing-type.api';
import FlatReferentialListView from '@/components/common/FlatReferentialListView.vue';

// BUG-165: thin per-entity config over the generic FlatReferentialListView.
// `load-error-fallback` removed: same BUG-166 leftover as Industrial, now closed —
// `packingTypeListLoadError` exists in en/fr, falls through to `t('packingTypeList.loadError')`.
// `search-count-mode="total"` reproduces a real divergence: PackingTypeListView's searchbar count
// showed the *unfiltered* total (`packingTypes.length`) while Brand/DisplayName/Industrial show
// the filtered count — kept as-is, not unified, per BUG-165 instructions.
export default {
  name: 'PackingTypeListView',
  components: { FlatReferentialListView },
  data() {
    return { Box, createPackingType, updatePackingType, deletePackingType };
  },
};
</script>
