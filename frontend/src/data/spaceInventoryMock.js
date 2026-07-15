/**
 * Mock data for the Space Inventory view (Vue port of versionReact's
 * SpaceInventory.tsx). Derives shops + storage + merch items from
 * `ADIDAS_ARENA_MOCK` so the page lights up in `?demo=1` without a backend.
 *
 * Shapes mirror the React component:
 *   ShopInventoryItem   = { id, name, picture, currentStock, minStock, maxStock,
 *                            unit, packagingType, dependents[] }
 *   ShopInventoryData   = { element, consolidatedInventory: ShopInventoryItem[] }
 *   StorageInventory    = { element, storageInventory[], merchInventory[] }
 */

import { ADIDAS_ARENA_MOCK } from './adidasArenaMock.js'
import { COUNTING_STATUS } from '../types/inventoryCount.js'

const STORAGE_LOCATIONS = ['Back-of-house', 'Cellar', 'Cold room', 'Dry storage']

function pickStorage(i) {
  return STORAGE_LOCATIONS[i % STORAGE_LOCATIONS.length]
}

function buildShopsWithInventory(mock = ADIDAS_ARENA_MOCK) {
  const shops = mock.shops || []
  const menuItems = mock.menuItems || []
  const costMap = mock.menuItemCostMap || {}

  return shops.map((shop, idx) => {
    // Pick ~6-8 items per shop based on type
    const types = String(shop.type || '').toLowerCase()
    const hasFood = types.includes('food')
    const hasBev = types.includes('beverage') || types.includes('drink')
    const hasBeer = types.includes('beer')
    const items = menuItems
      .filter((mi) => {
        const t = (mi.type || '').toLowerCase()
        const c = (mi.category || '').toLowerCase()
        if (t === 'food') return hasFood
        if (t === 'beverage' && c === 'beer') return hasBeer || hasBev
        if (t === 'beverage') return hasBev
        return false
      })
      .slice(0, 8)
    return {
      element: {
        id: `shop-${idx + 1}`,
        name: shop.name,
        type: 'shop',
        shopType: shop.type,
        shopArea: shop.area,
        picture: null,
      },
      consolidatedInventory: items.map((mi, j) => ({
        id: `inv-${idx + 1}-${mi.id}`,
        menuItemId: mi.id,
        name: mi.name,
        picture: mi.picture || null,
        category: mi.category || null,
        type: mi.type || null,
        unit: 'unit',
        packagingType: j % 2 === 0 ? 'box' : 'pack',
        packagingSize: j % 2 === 0 ? 24 : 12,
        inventoryQuantityPackaged: j % 2 === 0 ? 24 : 12,
        currentStock: 0,
        minStock: 12,
        maxStock: 240,
        unitCost: costMap[mi.id] || 0,
        storageLocation: pickStorage(j),
        dependents: [],
      })),
    }
  })
}

function buildStorages(mock = ADIDAS_ARENA_MOCK) {
  const menuItems = mock.menuItems || []
  // 2 storages : Main + Cold room
  return [
    {
      element: {
        id: 'storage-main',
        name: 'Main Storage',
        type: 'storage',
        picture: null,
      },
      storageInventory: menuItems.slice(0, 10).map((mi, i) => ({
        id: `storage-main-${mi.id}`,
        menuItemId: mi.id,
        name: mi.name,
        storageType: pickStorage(i),
        usedIn: [],
      })),
      merchInventory: [],
    },
    {
      element: {
        id: 'storage-cold',
        name: 'Cold Room',
        type: 'storage',
        picture: null,
      },
      storageInventory: menuItems
        .filter((mi) => (mi.type || '').toLowerCase() === 'beverage')
        .slice(0, 8)
        .map((mi) => ({
          id: `storage-cold-${mi.id}`,
          menuItemId: mi.id,
          name: mi.name,
          storageType: 'Cold room',
          usedIn: [],
        })),
      merchInventory: [],
    },
  ]
}

function buildMerch() {
  return [
    {
      element: { id: 'merch-1', name: 'Merch Booth East', type: 'external-merch', picture: null },
      merchInventory: [
        { id: 'merch-1-tshirt', name: 'T-Shirt PSB', usedIn: [{ merchShopName: 'Booth East', merchShopId: 'merch-1' }] },
        { id: 'merch-1-cap',    name: 'Cap PSB',     usedIn: [{ merchShopName: 'Booth East', merchShopId: 'merch-1' }] },
      ],
    },
  ]
}

const PACKAGING_TYPES_MOCK = [
  { id: 'pkg-box', name: 'Carton (box)', unitsPerPackage: 24 },
  { id: 'pkg-pack', name: 'Pack', unitsPerPackage: 12 },
  { id: 'pkg-tray', name: 'Plateau', unitsPerPackage: 6 },
  { id: 'pkg-palette', name: 'Palette', unitsPerPackage: 240 },
  { id: 'pkg-unit', name: 'Unité', unitsPerPackage: 1 },
]

/** Types de packaging de démo (remplace GET /packaging quand backend absent). */
export function buildPackagingTypesMock() {
  return PACKAGING_TYPES_MOCK.map((p) => ({ ...p }))
}

/**
 * Lignes de vente de démo (remplace l'edge function /functions/v1/sales).
 * Forme attendue par aggregateSalesToPredictedRecords : { menuItemId, productName,
 * shopName, quantity }. shopName = nom du shop (matché à l'element par nom).
 * Déterministe pour que la liste de courses soit stable.
 */
export function buildSalesRowsMock(mock = ADIDAS_ARENA_MOCK) {
  const shops = mock.shops || []
  const menuItems = mock.menuItems || []
  const rows = []
  shops.forEach((shop, si) => {
    menuItems.forEach((mi, j) => {
      // chaque shop ne vend qu'une partie des items (déterministe)
      if ((si + j) % 2 === 0) return
      rows.push({
        menuItemId: mi.id,
        productName: mi.name,
        shopName: shop.name,
        quantity: 20 + ((si * 7 + j * 13) % 80), // 20..99
      })
    })
  })
  return rows
}

/**
 * Counts de démo DÉTERMINISTES par shop/item (packedUnits + looseUnits + isCounted),
 * pour peupler l'inventaire + l'agrégat + la liste de courses sans backend
 * (`GET /inventory/:spaceId/:eventId` renvoie 404 tant qu'il n'est pas implémenté).
 *
 * @param {Array} shops shopsWithInventory (chaque élément a element.id + consolidatedInventory[])
 * @returns {Record<string, Record<string, {itemId, packedUnits, looseUnits, isCounted, countingStatus, storageLocation, eventId}>>}
 */
export function buildInventoryCountsMock(shops = []) {
  const counts = {}
  shops.forEach((shop, si) => {
    const shopId = shop?.element?.id
    if (!shopId) return
    const per = {}
    ;(shop.consolidatedInventory || []).forEach((it, j) => {
      // ~2/3 des items comptés ; le reste reste "à compter" (pour montrer les 2 états)
      if ((si + j) % 3 === 0) return
      per[it.id] = {
        itemId: it.id,
        packedUnits: ((si + j) % 5) + 1,
        looseUnits: (si * 2 + j) % 7,
        isCounted: true,
        countingStatus: COUNTING_STATUS.COUNTED,
        storageLocation: null,
        eventId: null,
      }
    })
    counts[shopId] = per
  })
  return counts
}

export function buildSpaceInventoryMock(mock = ADIDAS_ARENA_MOCK) {
  const shopsWithInventory = buildShopsWithInventory(mock)
  return {
    shopsWithInventory,
    storagesWithInventory: buildStorages(mock),
    merchWithInventory: buildMerch(),
    inventoryCounts: buildInventoryCountsMock(shopsWithInventory),
    packagingTypes: buildPackagingTypesMock(),
  }
}

export const SPACE_INVENTORY_MOCK = buildSpaceInventoryMock()
