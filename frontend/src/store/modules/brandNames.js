import { getBrandNames } from '@/api/endpoints/brand-name.api'
import { createFlatReferentialModule } from './factories/flatReferentialModule'

// BUG-165: thin config over the generic flat-referential factory. Action/getter names kept
// identical to the pre-refactor module — other screens dispatch/read them by exact string.
export default createFlatReferentialModule({
  fetchFn: getBrandNames,
  getterName: 'brandNames',
  fetchAction: 'fetchBrandNames',
  addAction: 'addBrandName',
  updateAction: 'updateBrandName',
  removeAction: 'removeBrandName',
  mergeOnUpdate: true, // BUG-160 fix: merge partial update payload into existing row
})
