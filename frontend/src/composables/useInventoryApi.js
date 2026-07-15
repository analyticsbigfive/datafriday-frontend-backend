import {
  getInventory,
  saveInventory,
  saveInventoryCount,
  getAllPackagingTypes,
} from '@/api/endpoints/inventory.api'
import { getMarketPrices } from '@/api/endpoints/market.price.api'

export function useInventoryApi() {
  return {
    getInventory,
    saveInventory,
    saveInventoryCount,
    getAllPackagingTypes,
    getAllMarketPrices: getMarketPrices,
  }
}
