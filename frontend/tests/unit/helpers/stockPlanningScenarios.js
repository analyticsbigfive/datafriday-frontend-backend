// Générateur DÉTERMINISTE de scénarios pour `stockRecordIndex.spec.js` : plusieurs
// PdV, records identifiés par shopId / elementId / shopName / registryId, lignes
// manuelles, PdV fermés, articles indisponibles, ajustements, menu items absents
// du catalogue, quantités nulles ou négatives, doublons. Graine fixe, jamais de
// Math.random : un échec se rejoue à l'identique.

/** PRNG mulberry32 : suite reproductible à partir d'un entier. */
export function createRng(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (list) => list[Math.floor(next() * list.length)],
  }
}

const SHOP_TYPES = ['shop', 'shop', 'shop', 'hospitality', 'kitchen']
const QUANTITY_FIELDS = ['totalQuantity', 'adjustedQuantity', 'quantity', 'qty']

function buildMenuItems(rng, count) {
  const items = []
  for (let k = 0; k < count; k += 1) {
    const roll = rng.next()
    const item = {
      id: `mi-${k}`,
      // Quelques homonymes de nom pour exercer le rattrapage par nom.
      name: rng.chance(0.12) && k > 0 ? `Item ${k - 1}` : `Item ${k}`,
      readyForSale: roll < 0.5 ? 'Yes' : roll < 0.9 ? 'No' : undefined,
      comboItem: rng.chance(0.08) ? 'Yes' : 'No',
      numberOfPiecesRecipe: rng.pick([1, 1, 2, 4, 0, undefined]),
    }
    if (item.readyForSale === 'No' || item.comboItem === 'Yes') {
      const lines = rng.int(0, 4)
      item.components = []
      for (let c = 0; c < lines; c += 1) {
        const kind = rng.next()
        const component = {
          id: `cmp-${k}-${c}`,
          numberOfUnits: rng.pick([1, 2, 0.3, 0.7, 1.1, 0, undefined]),
          unit: rng.pick(['kg', 'L', 'pcs', undefined]),
          unitCost: rng.pick([0, 1.5, undefined]),
        }
        if (kind < 0.3 && k < count - 1) {
          // Constituant qui référence un menu item d'index SUPÉRIEUR (combo ou
          // non) : le graphe reste sans cycle, l'expansion reste bornée.
          const target = rng.int(k + 1, count - 1)
          component.sourceId = `mi-${target}`
          component.name = `Item ${target}`
        } else if (kind < 0.8) {
          component.itemType = rng.pick(['Ingredient', 'Packaging', 'Component'])
          component.name = `Mat ${rng.int(0, 12)}`
          component.sourceId = rng.chance(0.7) ? `mat-${rng.int(0, 12)}` : undefined
        } else {
          // Ligne anonyme : ignorée par l'expansion (avec une trace console).
          component.itemType = 'Ingredient'
        }
        item.components.push(component)
      }
    }
    items.push(item)
  }
  return items
}

function buildShops(rng, count) {
  const shops = []
  for (let i = 0; i < count; i += 1) {
    const shop = {
      id: `shop-${i}`,
      // Homonymes de PdV : plusieurs PdV partagent un nom ou un registryId.
      name: rng.chance(0.2) && i > 0 ? `Bar ${i - 1}` : `Bar ${i}`,
      type: rng.pick(SHOP_TYPES),
      shopType: rng.pick(['bar', 'food', undefined]),
    }
    if (rng.chance(0.5)) shop.registryId = rng.chance(0.2) && i > 0 ? `reg-${i - 1}` : `reg-${i}`
    if (rng.chance(0.3)) shop.shopName = `Stand ${rng.int(0, Math.max(1, count - 1))}`
    shops.push(shop)
  }
  return shops
}

function buildConfiguration(rng, shops) {
  const floors = [{ elements: [] }, { elements: [] }]
  const forecourt = { elements: [] }
  const externalMerch = { elements: [] }
  const buckets = [floors[0].elements, floors[1].elements, forecourt.elements, externalMerch.elements]
  shops.forEach((shop) => rng.pick(buckets).push(shop))
  // Éléments qui ne sont pas des PdV F&B : ignorés par collectFbElements.
  floors[0].elements.push({ id: 'storage-1', name: 'Reserve', type: 'storage' })
  // Un doublon d'id de PdV (même élément placé deux fois dans la config).
  if (shops.length && rng.chance(0.3)) externalMerch.elements.push({ ...shops[0] })
  const data = { floors, forecourt, externalMerch }
  return rng.chance(0.5) ? { data } : data
}

function pickIdentityFields(rng, shop) {
  // Un record identifie son PdV par UNE ou deux de ses clés, au hasard.
  const candidates = [
    ['shopId', shop.id],
    ['elementId', shop.id],
    ['shop', shop.name],
    ['shopName', shop.name],
    ['elementName', shop.name],
    ['registryId', shop.registryId],
    ['shopName', shop.shopName],
  ].filter(([, value]) => value !== undefined)
  const fields = {}
  const picks = rng.int(1, 2)
  for (let n = 0; n < picks; n += 1) {
    const [field, value] = rng.pick(candidates)
    fields[field] = value
  }
  return fields
}

function pickQuantity(rng) {
  const roll = rng.next()
  if (roll < 0.1) return 0
  if (roll < 0.15) return -rng.int(1, 5)
  if (roll < 0.2) return null
  if (roll < 0.25) return String(rng.int(1, 30))
  if (roll < 0.3) return 'abc'
  if (roll < 0.6) return rng.int(1, 60)
  // Flottants : l'ordre d'addition change le dernier bit du résultat.
  return rng.pick([0.1, 0.2, 0.3, 0.7, 1.1, 2.3, 3.7]) * rng.int(1, 9)
}

function buildRecords(rng, shops, menuItems, count) {
  const records = []
  for (let n = 0; n < count; n += 1) {
    const shop = rng.pick(shops)
    const record = { ...pickIdentityFields(rng, shop) }
    if (rng.chance(0.04)) {
      // Record d'un PdV inconnu de la configuration.
      Object.keys(record).forEach((key) => delete record[key])
      record.shopId = `ghost-${rng.int(0, 3)}`
    }
    const mi = rng.pick(menuItems)
    const idRoll = rng.next()
    if (idRoll < 0.6) {
      record.menuItemId = mi.id
    } else if (idRoll < 0.72) {
      record.mappedMenuItemId = mi.id
    } else if (idRoll < 0.8) {
      record.itemId = mi.id
    } else if (idRoll < 0.9) {
      // Id de timeline différent de l'id catalogue : rattrapage par mappedMenuItemId.
      record.menuItemId = `timeline-${rng.int(0, 20)}`
      record.mappedMenuItemId = mi.id
    } else if (idRoll < 0.95) {
      // Id orphelin, rattrapable seulement par le nom.
      record.menuItemId = `orphan-${rng.int(0, 5)}`
      record.itemName = mi.name
    } else {
      // Record sans aucun id de menu item.
    }
    if (rng.chance(0.4)) record.itemName = mi.name
    if (rng.chance(0.2)) record.mappedMenuItemName = mi.name
    record[rng.pick(QUANTITY_FIELDS)] = pickQuantity(rng)
    if (rng.chance(0.15)) record[rng.pick(QUANTITY_FIELDS)] = pickQuantity(rng)
    if (rng.chance(0.15)) record.isManual = true
    else if (rng.chance(0.03)) record.isManual = 'true'
    records.push(record)
    // Doublons exacts.
    if (rng.chance(0.1)) records.push({ ...record })
  }
  return records
}

function buildSelection(rng, shops, menuItems) {
  const selected = {}
  shops.forEach((shop) => {
    const roll = rng.next()
    if (roll < 0.35) return // pas de sélection explicite : dérivée des records
    const ids = []
    const size = rng.int(0, 6)
    for (let n = 0; n < size; n += 1) {
      ids.push(rng.chance(0.1) ? `unknown-${rng.int(0, 3)}` : rng.pick(menuItems).id)
    }
    if (roll < 0.7) selected[shop.id] = ids
    else if (roll < 0.8) selected[shop.id] = new Set(ids)
    else if (roll < 0.9) selected[shop.id] = Object.fromEntries(ids.map((id) => [id, rng.chance(0.8)]))
    else selected[shop.id] = ids.concat(ids) // doublons dans la sélection
  })
  return selected
}

function buildAdjustments(rng, shops, menuItems) {
  const adjustments = {}
  shops.forEach((shop) => {
    menuItems.forEach((mi) => {
      if (!rng.chance(0.15)) return
      adjustments[`${shop.id}-${mi.id}`] = rng.pick([0, 50, 80, 100, 120, 150, 250, '75', 'x', null, undefined])
    })
  })
  return adjustments
}

function buildManualQuantities(rng, shops, menuItems) {
  const manual = {}
  shops.forEach((shop) => {
    menuItems.forEach((mi) => {
      if (!rng.chance(0.08)) return
      manual[`${shop.id}-${mi.id}`] = rng.pick([0, 5, 12, -4, '9', 'z', 2.5])
    })
  })
  return manual
}

/**
 * Un scénario complet = les arguments de `buildStockRequirements` /
 * `buildMenuItemDemand` (les clés en trop sont ignorées par `buildMenuItemDemand`).
 */
export function buildScenario(seed, size = {}) {
  const rng = createRng(seed)
  const shopCount = size.shops ?? rng.int(3, 15)
  const itemCount = size.items ?? rng.int(8, 40)
  const recordCount = size.records ?? rng.int(40, 250)
  const shops = buildShops(rng, shopCount)
  const menuItems = buildMenuItems(rng, itemCount)
  const configuration = buildConfiguration(rng, shops)
  const predictedRecords = buildRecords(rng, shops, menuItems, recordCount)

  // Menu items absents du catalogue : on retire quelques articles APRÈS avoir
  // généré les records, qui continuent à les référencer.
  const catalog = menuItems.filter(() => !rng.chance(0.07))

  const closedShopNames = shops
    .filter(() => rng.chance(0.12))
    .map((shop) => (rng.chance(0.5) ? shop.name.toUpperCase() : ` ${shop.name} `))

  const unavailableItems = rng.chance(0.7)
    ? {
        ids: menuItems.filter(() => rng.chance(0.06)).map((mi) => mi.id),
        names: menuItems.filter(() => rng.chance(0.05)).map((mi) => mi.name.toLowerCase()),
      }
    : null

  return {
    configuration,
    menuItems: catalog,
    components: [],
    predictedRecords,
    selectedMenuItems: buildSelection(rng, shops, menuItems),
    quantityAdjustments: buildAdjustments(rng, shops, menuItems),
    closedShopNames,
    unavailableItems,
    manualQuantities: buildManualQuantities(rng, shops, menuItems),
    // Données annexes pour les tests des helpers unitaires.
    shops,
    allMenuItemIds: menuItems.map((mi) => mi.id),
  }
}
