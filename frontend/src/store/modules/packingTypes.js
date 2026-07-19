import { getPackingTypes } from '@/api/endpoints/packing-type.api'
import { createFlatReferentialModule } from './factories/flatReferentialModule'

// BUG-165: thin config over the generic flat-referential factory. Action/getter names kept
// identical to the pre-refactor module — other screens dispatch/read them by exact string.
export default createFlatReferentialModule({
  fetchFn: getPackingTypes,
  getterName: 'packingTypes',
  fetchAction: 'fetchPackingTypes',
  addAction: 'addPackingType',
  updateAction: 'updatePackingType',
  removeAction: 'removePackingType',
  // Was NOT covered by BUG-160 (that fix only touched brandNames.js/displayNames.js) — this
  // module used to replace the row wholesale on update. Closed here: the factory already
  // supports merge-on-update, so applying it to PackingType too is a one-line, zero-risk fix.
  mergeOnUpdate: true,
})
