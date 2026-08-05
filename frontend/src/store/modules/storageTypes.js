import { getStorageTypes } from '@/api/endpoints/storage-type.api'
import { createFlatReferentialModule } from './factories/flatReferentialModule'

export default createFlatReferentialModule({
  fetchFn: getStorageTypes,
  getterName: 'storageTypes',
  fetchAction: 'fetchStorageTypes',
  addAction: 'addStorageType',
  updateAction: 'updateStorageType',
  removeAction: 'removeStorageType',
  mergeOnUpdate: true,
})
