/**
 * Miroir front des contrats POS (backend/src/features/pos/pos.contracts.ts, lot L0 du
 * chantier frontend/docs/chantiers/pos_mvp/PLAN.md). Toute évolution passe par l'agent central
 * et se fait des deux côtés en même temps.
 */

export const POS_PHASE = 'pos'

// Moyens de paiement : référentiel en base (Configuration > Moyens de paiement), jamais figés.
// `kind` est une catégorie ouverte qui pilote le comportement de la caisse (ex. rendu de monnaie).
export const POS_PAYMENT_KINDS_KNOWN = ['cash', 'card', 'voucher', 'cashless', 'other']

export const POS_VENDOR_NAME_MAX = 60

export const POS_ERROR_CODES = {
  EVENT_NOT_SELLABLE: 'POS_EVENT_NOT_SELLABLE',
  PDV_NOT_IN_EVENT_CONFIG: 'POS_PDV_NOT_IN_EVENT_CONFIG',
  PDV_STOPPED: 'POS_PDV_STOPPED',
  ITEM_NOT_ON_PDV: 'POS_ITEM_NOT_ON_PDV',
  PAYMENT_METHOD_DISABLED: 'POS_PAYMENT_METHOD_DISABLED',
  CANCEL_DISABLED: 'POS_CANCEL_DISABLED',
  VENDOR_NAME_REQUIRED: 'POS_VENDOR_NAME_REQUIRED',
  EMPTY_TICKET: 'POS_EMPTY_TICKET',
  INVALID_LINE: 'POS_INVALID_LINE',
  PAYMENT_MISMATCH: 'POS_PAYMENT_MISMATCH',
  TICKET_CONFLICT: 'POS_TICKET_CONFLICT',
  TIPS_DISABLED: 'POS_TIPS_DISABLED',
  INVALID_TIP: 'POS_INVALID_TIP',
}

/**
 * @typedef {string} PosPaymentKind   liste ouverte, cf. POS_PAYMENT_KINDS_KNOWN
 *
 * @typedef {Object} PosPaymentMethod
 * @property {string} id
 * @property {string} name
 * @property {PosPaymentKind} kind
 * @property {boolean} active
 * @property {number} sortOrder
 * @property {boolean} isSystem
 *
 * @typedef {Object} PosPaymentLine   Copie figée au moment de la vente ; plusieurs lignes = addition partagée
 * @property {string} paymentMethodId
 * @property {string} name
 * @property {PosPaymentKind} kind
 * @property {number} amountTtc
 * @property {number} tipTtc   pourboire, hors CA et hors TVA
 *
 * @typedef {'inactive'|'ready'|'selling'} PosPdvStatus
 * @typedef {'available'|'low'|'out'} PosAvailability
 *
 * @typedef {Object} PosEventListItem
 * @property {string} id
 * @property {string} name
 * @property {string} eventDate
 * @property {'live'|'upcoming'} status
 * @property {string|null} configurationId
 * @property {number} startedPdvCount
 *
 * @typedef {Object} PosPdvRow
 * @property {string} elementId
 * @property {string} name
 * @property {string|null} type
 * @property {string|null} zoneLabel
 * @property {string|null} spaceMenuLabel
 * @property {number} itemsCount
 * @property {PosPdvStatus} status
 * @property {string|null} pin            Déchiffré seulement avec front.fb.posManage
 * @property {string} qrSlug
 * @property {string|null} responsibleHrPersonId
 * @property {string|null} responsibleName
 * @property {Array<'WEEZEVENT'|'DIGIFOOD'>} otherSources
 * @property {{tickets:number, revenueTtc:number}} sales
 *
 * @typedef {Object} PosAccessStatus   Réponse de start, stop et reset-pin
 * @property {string} elementId
 * @property {string|null} windowId
 * @property {boolean} open
 * @property {string|null} pin
 * @property {string|null} pinSetAt
 * @property {string|null} openedAt
 * @property {string|null} closedAt
 * @property {string|null} lastLoginAt
 *
 * @typedef {Object} PosBulkResult   Réponse de start-all et stop-all
 * @property {PosAccessStatus[]} results
 * @property {Array<{elementId:string, code:string, message:string}>} failures
 *
 * Contexte public GET guest-pin/context/:slug : champ `posActive` (boolean) en plus.
 *
 * @typedef {Object} PosEventSetting
 * @property {string[]} paymentMethodIds   vide = tous les moyens actifs
 * @property {boolean} promosEnabled
 * @property {boolean} cancelEnabled
 * @property {number} lowStockUnits   seuil « stock bas » (défaut 5, 0 = jamais)
 * @property {boolean} tipsEnabled   pourboires acceptés (défaut false)
 *
 * @typedef {Object} PosEventDetail
 * @property {PosEventListItem} event
 * @property {PosPdvRow[]} pdvs
 * @property {PosEventSetting} settings
 * @property {{activePdv:number,totalPdv:number,tickets:number,revenueTtc:number,averageBasketTtc:number}} kpis
 *
 * @typedef {Object} PosSaleLine
 * @property {string} menuItemId
 * @property {string} name
 * @property {number} quantity
 * @property {number} unitPrice
 * @property {number} totalTtc
 * @property {number} vatRate
 *
 * @typedef {Object} PosSaleRow
 * @property {string} id
 * @property {number} ticketNumber
 * @property {string} createdAt
 * @property {string} elementId
 * @property {string} pdvName
 * @property {string} vendorName
 * @property {PosPaymentLine[]} payments
 * @property {number} tipTotal
 * @property {number} totalTtc
 * @property {number} vatTotal
 * @property {boolean} cancelled
 * @property {'synced'} syncStatus
 * @property {PosSaleLine[]} lines
 *
 * @typedef {Object} PosSalesPage
 * @property {PosSaleRow[]} rows
 * @property {string|null} nextCursor
 * @property {{tickets:number,cancelled:number,revenueTtc:number,tipsTtc:number}} totals
 *
 * @typedef {Object} PosCatalogItem
 * @property {string} menuItemId
 * @property {string} name
 * @property {string} categoryId
 * @property {number} unitPrice
 * @property {number|null} originalUnitPrice
 * @property {string|null} promotionLabel
 * @property {number} vatRate
 * @property {string|null} note
 * @property {PosAvailability} availability
 * @property {number|null} remainingUnits
 *
 * @typedef {Object} PosCatalog
 * @property {{elementId:string,name:string}} pdv
 * @property {{id:string,name:string}} event
 * @property {string} vendorName
 * @property {PosEventSetting} settings
 * @property {PosPaymentMethod[]} paymentMethods   utilisables à cette caisse, triés
 * @property {Array<{id:string,label:string}>} categories
 * @property {PosCatalogItem[]} items
 * @property {number} nextTicketNumber
 *
 * @typedef {Object} PosCreateSaleBody
 * @property {string} clientTicketId   UUID v4 généré par la tablette
 * @property {Array<{paymentMethodId:string, amountTtc:number, tipTtc?:number}>} payments   1 à 10 (addition partagée)
 * @property {string} [clientCreatedAt]
 * @property {Array<{menuItemId:string, quantity:number}>} lines
 *
 * @typedef {Object} PosCreateSaleResult
 * @property {PosSaleRow} sale
 * @property {boolean} replayed
 *
 * @typedef {Object} PosClosing
 * @property {number} tickets
 * @property {number} cancelled
 * @property {Array<{paymentMethodId:string,name:string,kind:string,amountTtc:number,tipTtc:number}>} byPaymentMethod
 * @property {{totalTtc:number, byVendor:Array<{vendorName:string,tipTtc:number,tickets:number}>}} tips
 * @property {number} vatTotal
 * @property {number} revenueTtc
 */
