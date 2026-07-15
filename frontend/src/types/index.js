/**
 * @file Contrats de données partagés entre `analyse/`, `EventPredictView`,
 * `usePredictiveTimeline`, `SpacesPage` et le backend Supabase Edge Function.
 *
 * Importer un type depuis ce module via JSDoc :
 *   /** @type {import('@/types').Event} *\/
 *
 * Ces définitions sont indicatives — le projet est en JavaScript pur sans
 * vérification statique. Garder synchronisé avec les schémas backend
 * (`make-server-eb31619c`).
 */

/**
 * Configuration d'un floor plan (zones, capacité, sponsors).
 * @typedef {Object} Configuration
 * @property {string} id
 * @property {string} spaceId
 * @property {string} name
 * @property {Array<{ id: string, name: string }>} [floors]
 * @property {Array<{ id: string, name: string, capacity?: number }>} [areas]
 * @property {Object<string, unknown>} [meta]
 */

/**
 * Espace racine (lieu/venue) auquel sont rattachés events et configurations.
 * @typedef {Object} Space
 * @property {string} id
 * @property {string} name
 * @property {string} [imageUrl]
 * @property {number} [maxCapacity]
 * @property {Array<Configuration>} [configurations]
 */

/**
 * Session d'un événement (heure, capacité, type de billet…).
 * @typedef {Object} EventSession
 * @property {string} [id]
 * @property {string} [showTime]      HH:mm (heure du show)
 * @property {string} [doorsOpening]  HH:mm (ouverture des portes)
 * @property {string} [doorsClosing]  HH:mm
 * @property {number} [ticketsSold]
 * @property {number} [ticketsScanned]
 */

/**
 * Évènement (passé ou futur) lié à un space + une configuration.
 * @typedef {Object} Event
 * @property {string} id
 * @property {string} spaceId
 * @property {string} eventName
 * @property {string} eventDate          Format DD/MM/YYYY (FR) ou YYYY-MM-DD.
 * @property {string} [eventType]
 * @property {string} [eventCategory]
 * @property {string} [eventSubcategory]
 * @property {string} [sponsor]
 * @property {number} [ticketsSold]
 * @property {number} [ticketsScanned]
 * @property {number} [maxCapacity]
 * @property {Array<EventSession>} [sessions]
 * @property {string} [configurationId]
 * @property {boolean} [isPast]
 * @property {Object<string, unknown>} [meta]
 */

/**
 * Élément d'un menu (item/produit vendu).
 * @typedef {Object} MenuItem
 * @property {string} id
 * @property {string} name
 * @property {string} [type]            Catégorie technique (Food / Beverage…)
 * @property {string} [category]
 * @property {number} [price]
 * @property {number} [cost]            Coût unitaire (pour calcul marge).
 */

/**
 * Record granulaire de vente — granularité (event, shop, menuItem, minute).
 * Source : KV `shop-granular-records:${spaceId}`.
 * @typedef {Object} ShopGranularRecord
 * @property {string} eventId
 * @property {string} elementId         Identifiant du shop (élément du floor plan).
 * @property {string} [shopId]          Alias historique de elementId.
 * @property {string} menuItemId
 * @property {string} [itemName]
 * @property {string} [shopName]
 * @property {string} [minute]          HH:mm (timestamp d'agrégation par minute).
 * @property {number} quantity
 * @property {number} revenue
 * @property {number} [cost]
 * @property {number} [transactionCount]
 * @property {boolean} [isPredictive]   true si record généré par Predict.
 */

/**
 * Record prédit — sortie de `generatePredictionsForEvent` /
 * `usePredictiveTimeline`. Étend `ShopGranularRecord` avec un score de fiabilité.
 * @typedef {ShopGranularRecord & {
 *   confidence?: number,                 // 0..100
 *   isLowConfidence?: boolean,
 *   sourceEventIds?: string[],
 *   weight?: number
 * }} PredictedRecord
 */

/**
 * Record d'une timeline minute-par-minute (live ou prédit).
 * @typedef {Object} TimelineRecord
 * @property {string} eventId
 * @property {string} minute            HH:mm
 * @property {string} [elementId]
 * @property {string} [menuItemId]
 * @property {number} totalQuantity
 * @property {number} totalRevenue
 * @property {boolean} [isPredictive]
 */

/**
 * Évènement passé scoré pour la prédiction (cf. doc §8).
 * @typedef {Object} ScoredEvent
 * @property {Event} event
 * @property {number} score             Score brut de similarité.
 * @property {number} [weight]          Poids normalisé (0..1).
 * @property {{
 *   type?: number,
 *   category?: number,
 *   subcategory?: number,
 *   sponsor?: number,
 *   capacity?: number,
 *   weekday?: number,
 *   season?: number
 * }} [breakdown]
 */

/**
 * Version sauvegardée d'une prédiction d'event (cf. doc §10.4).
 * @typedef {Object} EventPredictVersion
 * @property {string} id
 * @property {string} eventId
 * @property {string} name
 * @property {number} timestamp
 * @property {number} totalRevenue
 * @property {number} adjustedTotalRevenue
 * @property {Object<string, number>} [quantityAdjustments]
 * @property {string[]} [selectedPastEventIds]
 * @property {Array<PredictedRecord>} [snapshot]
 */

/**
 * Métriques all-time agrégées par space (cf. doc §4 & §13.1).
 * @typedef {Object} SpaceAllTimeMetrics
 * @property {string} spaceId
 * @property {number} totalRevenue
 * @property {number} totalTransactions
 * @property {number} eventCount
 * @property {number} totalAttendance
 * @property {{
 *   perCapita: number,
 *   avgTransaction: number,
 *   avgEvent: number
 * }} metrics
 * @property {Array<{ shopId: string, shopName: string, revenue: number }>} [topShops]
 */

// ─── Space Menus + Inventaire (Règles 1/2/3) ────────────────────────────────
// Indicatif (JS pur). Aligné sur versionReact/src/app/components/types/menu-types.ts.

/**
 * @typedef {Object} MenuItemComponent
 * @property {string} id
 * @property {string} name
 * @property {'Ingredient'|'Component'} itemType
 * @property {string} [unit]
 * @property {number} [numberOfUnits]    3 décimales
 * @property {number} [totalCost]
 * @property {string} [storageType]
 * @property {string} [category]
 * @property {string} [sourceId]
 * @property {string} [marketPriceId]    -> MarketPriceItem (ingrédients)
 * @property {string} [marketPriceItemName]
 */

/**
 * @typedef {Object} MenuItemData
 * @property {string} id
 * @property {string} name
 * @property {'Food'|'Beverage'|'Combo'} [type]
 * @property {'Yes'|'No'} readyForSale
 * @property {'Yes'|'No'} comboItem
 * @property {number} numberOfPiecesRecipe
 * @property {MenuItemComponent[]} components
 * @property {string[]} [spaceIds]
 * @property {Array<{ spaceId: string, price: number, margin: number }>} [spacePricingData]
 * @property {string} [picture]
 * @property {string[]} [storageType]
 */

/**
 * @typedef {Object} MarketPriceItem
 * @property {string} id
 * @property {string} itemName
 * @property {string} supplierItem
 * @property {'Food'|'Beverage'|'Packaging'} goodType  packaging ici
 * @property {'kg'|'l'|'pc'} [recipeUnit]
 * @property {number} unitsPerPurchase
 * @property {number} price
 * @property {number} pricePerUnit
 * @property {string} [inventoryPackagingId]
 * @property {number} [inventoryQuantityPackaged]
 * @property {string} [unit]
 * @property {string} [image]
 */

/**
 * @typedef {Object} InventoryItem
 * @property {string} id
 * @property {string} name
 * @property {'Ingredients'|'Packaging'|'Consumables'} category
 * @property {string} storageUnit
 * @property {number} storageQuantity
 * @property {number} costPerUnit
 * @property {number} [reorderPoint]
 */

/**
 * Item agrégé de la liste de courses (Règle 3).
 * @typedef {Object} AggregatedItem
 * @property {string} name
 * @property {string} [unit]
 * @property {boolean} isPackaging
 * @property {number} totalUnits
 * @property {number} totalPackedUnits
 * @property {number} totalLooseUnits
 * @property {number} shopCount
 * @property {Array<{ elementId: string, shopName: string, gap: number }>} shops
 */

export {}
