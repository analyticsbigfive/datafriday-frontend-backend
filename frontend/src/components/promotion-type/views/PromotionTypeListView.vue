<template>
  <FlatReferentialListView
    i18n-prefix="promotionTypeList"
    :icon="BadgePercent"
    store-module="promotionTypes"
    fetch-action="fetchPromotionTypes"
    add-action="addPromotionType"
    update-action="updatePromotionType"
    remove-action="removePromotionType"
    :create-fn="createPromotionType"
    :update-fn="updatePromotionType"
    :delete-fn="deletePromotionType"
    :get-fn="getPromotionTypes"
    add-button-key="promotionTypeList.addPromotionType"
    total-count-key="promotionTypeList.totalPromotionTypes"
  />
</template>

<script>
import { BadgePercent } from 'lucide-vue-next';
import { createPromotionType, updatePromotionType, deletePromotionType, getPromotionTypes } from '@/api/endpoints/promotion-type.api';
import FlatReferentialListView from '@/components/common/FlatReferentialListView.vue';

// Thin per-entity config over the generic FlatReferentialListView (comme DisplayNameListView).
export default {
  name: 'PromotionTypeListView',
  components: { FlatReferentialListView },
  data() {
    return { BadgePercent, createPromotionType, updatePromotionType, deletePromotionType, getPromotionTypes };
  },
};
</script>
