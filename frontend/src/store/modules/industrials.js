import { getIndustrials } from '@/api/endpoints/industrial.api'
import { createFlatReferentialModule } from './factories/flatReferentialModule'

// BUG-165: thin config over the generic flat-referential factory. Action/getter names kept
// identical to the pre-refactor module — other screens dispatch/read them by exact string.
export default createFlatReferentialModule({
  fetchFn: getIndustrials,
  getterName: 'industrials',
  fetchAction: 'fetchIndustrials',
  addAction: 'addIndustrial',
  updateAction: 'updateIndustrial',
  removeAction: 'removeIndustrial',
  // Was NOT covered by BUG-160 (that fix only touched brandNames.js/displayNames.js) — this
  // module used to replace the row wholesale on update. Closed here: the factory already
  // supports merge-on-update, so applying it to Industrial too is a one-line, zero-risk fix.
  mergeOnUpdate: true,
})
