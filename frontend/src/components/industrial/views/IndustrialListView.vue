<template>
  <FlatReferentialListView
    i18n-prefix="industrialList"
    :icon="Factory"
    store-module="industrials"
    fetch-action="fetchIndustrials"
    add-action="addIndustrial"
    update-action="updateIndustrial"
    remove-action="removeIndustrial"
    :create-fn="createIndustrial"
    :update-fn="updateIndustrial"
    :delete-fn="deleteIndustrial"
    :get-fn="getIndustrials"
    add-button-key="industrialList.addIndustrial"
    total-count-key="industrialList.totalIndustrials"
  />
</template>

<script>
import { Factory } from 'lucide-vue-next';
import { createIndustrial, updateIndustrial, deleteIndustrial, getIndustrials } from '@/api/endpoints/industrial.api';
import FlatReferentialListView from '@/components/common/FlatReferentialListView.vue';

// BUG-165: thin per-entity config over the generic FlatReferentialListView.
// `load-error-fallback` removed: BUG-166 left this string hardcoded in English for
// Industrial/PackingType (unlike Brand/DisplayName). Closed as a follow-up — `industrialListLoadError`
// now exists in en/fr, so this falls through to `t('industrialList.loadError')` like the other 3.
// BUG-171: `getIndustrials` (paginated GET) passed through for this screen's server-side
// paginated/searched table.
export default {
  name: 'IndustrialListView',
  components: { FlatReferentialListView },
  data() {
    return { Factory, createIndustrial, updateIndustrial, deleteIndustrial, getIndustrials };
  },
};
</script>
