import { getDisplayNames } from '@/api/endpoints/display-name.api'
import { createFlatReferentialModule } from './factories/flatReferentialModule'

// BUG-165: thin config over the generic flat-referential factory. Action/getter names kept
// identical to the pre-refactor module — other screens dispatch/read them by exact string.
export default createFlatReferentialModule({
  fetchFn: getDisplayNames,
  getterName: 'displayNames',
  fetchAction: 'fetchDisplayNames',
  addAction: 'addDisplayName',
  updateAction: 'updateDisplayName',
  removeAction: 'removeDisplayName',
  mergeOnUpdate: true, // BUG-160 fix: merge partial update payload into existing row
})
