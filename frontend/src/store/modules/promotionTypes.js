import { getPromotionTypes } from '@/api/endpoints/promotion-type.api'
import { createFlatReferentialModule } from './factories/flatReferentialModule'

// Thin config over the generic flat-referential factory (comme displayNames.js).
export default createFlatReferentialModule({
  fetchFn: getPromotionTypes,
  getterName: 'promotionTypes',
  fetchAction: 'fetchPromotionTypes',
  addAction: 'addPromotionType',
  updateAction: 'updatePromotionType',
  removeAction: 'removePromotionType',
  mergeOnUpdate: true,
})
