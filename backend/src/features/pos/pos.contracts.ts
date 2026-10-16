/**
 * Contrats du chantier POS (frontend/docs/chantiers/pos_mvp/PLAN.md, lot L0).
 * Source unique des formes échangées entre les lots : un agent qui a besoin d'un champ de plus
 * le demande à l'agent central, il ne modifie pas ce fichier lui-même.
 * Miroir front : frontend/src/api/endpoints/pos.contracts.js (à garder aligné).
 */

/** Phase des fenêtres d'accès invité POS (`InventoryWindow.phase`). Exclue de INVENTORY_PHASES. */
export const POS_PHASE = 'pos' as const;

/**
 * Préfixe du nom de l'Integration provider POS. UNE intégration POS PAR ESPACE (tenant, espace) :
 * LocationSpaceMapping est unique sur (tenantId, salesLocationId) et salesLocationId porte l'ID
 * d'intégration, donc une intégration ne peut être rattachée qu'à un seul espace (lot L1, 2026-10-16).
 * Nom complet : `${POS_INTEGRATION_NAME} · ${nom de l'espace}`.
 */
export const POS_INTEGRATION_NAME = 'Data Friday POS';

/** Valeur de `ProductMapping.mappedBy` pour les mappings posés automatiquement par le POS. */
export const POS_MAPPED_BY = 'pos';

/**
 * Moyens de paiement : RÉFÉRENTIEL en base (modèle PaymentMethod, Configuration > Moyens de
 * paiement), jamais une liste figée. `kind` est une catégorie ouverte qui pilote le comportement
 * de la caisse ; on peut en ajouter sans changer le contrat. Espèces et Carte sont créés à la
 * demande (isSystem) pour la V1 (décision 12).
 */
export const POS_PAYMENT_KINDS_KNOWN = ['cash', 'card', 'voucher', 'cashless', 'other'] as const;
export type PosPaymentKind = string; // liste ouverte, cf. POS_PAYMENT_KINDS_KNOWN
export const POS_DEFAULT_PAYMENT_METHODS: Array<{ name: string; kind: PosPaymentKind; sortOrder: number }> = [
  { name: 'Espèces', kind: 'cash', sortOrder: 0 },
  { name: 'Carte', kind: 'card', sortOrder: 1 },
];

/** Moyen de paiement tel qu'exposé à la caisse et au back-office. */
export interface PosPaymentMethodDto {
  id: string;
  name: string;
  kind: PosPaymentKind;
  active: boolean;
  sortOrder: number;
  isSystem: boolean;
}

/** Copie figée au moment de la vente (renommer un moyen ne réécrit pas l'historique). */
export interface PosPaymentSnapshot {
  paymentMethodId: string;
  name: string;
  kind: PosPaymentKind;
}

/**
 * Une ligne de paiement d'un ticket. Partage de l'addition = plusieurs lignes (10 au plus) :
 * N parts égales ou montant par montant ; la somme des amountTtc égale le total du ticket.
 * tipTtc = pourboire porté par ce paiement : HORS chiffre d'affaires et HORS TVA, jamais compté
 * dans SalesTransaction.amount ni dans les agrégats ; tracé à part (clôture, historique, vendeur).
 */
export interface PosPaymentLine extends PosPaymentSnapshot {
  amountTtc: number;
  tipTtc: number;
}

/** Longueur maximale du nom de vendeur saisi à la connexion. */
export const POS_VENDOR_NAME_MAX = 60;

/** Codes d'erreur métier renvoyés dans `{ code, message }` (HTTP 400/403/409). */
export const POS_ERROR_CODES = {
  EVENT_NOT_SELLABLE: 'POS_EVENT_NOT_SELLABLE', // évènement terminé (fin réelle + grâce dépassée)
  PDV_NOT_IN_EVENT_CONFIG: 'POS_PDV_NOT_IN_EVENT_CONFIG',
  PDV_STOPPED: 'POS_PDV_STOPPED', // caisse arrêtée (■) : session invité révoquée
  ITEM_NOT_ON_PDV: 'POS_ITEM_NOT_ON_PDV', // menu item absent des articles du PdV dans la config
  PAYMENT_METHOD_DISABLED: 'POS_PAYMENT_METHOD_DISABLED',
  CANCEL_DISABLED: 'POS_CANCEL_DISABLED',
  VENDOR_NAME_REQUIRED: 'POS_VENDOR_NAME_REQUIRED',
  EMPTY_TICKET: 'POS_EMPTY_TICKET',
  INVALID_LINE: 'POS_INVALID_LINE', // quantité hors 1..999 ; une ligne négative vient d'un prix négatif (déconsigne)
  PAYMENT_MISMATCH: 'POS_PAYMENT_MISMATCH', // somme des paiements différente du total
  TICKET_CONFLICT: 'POS_TICKET_CONFLICT', // clientTicketId déjà utilisé par un autre PdV (409)
  TIPS_DISABLED: 'POS_TIPS_DISABLED', // pourboire envoyé alors que tipsEnabled=false
  INVALID_TIP: 'POS_INVALID_TIP', // pourboire négatif, non fini, ou sur un ticket négatif (déconsigne)
} as const;
export type PosErrorCode = (typeof POS_ERROR_CODES)[keyof typeof POS_ERROR_CODES];

/** Contenu de SalesTransaction.metadata pour une vente POS. */
export interface PosTransactionMetadata {
  provider: 'pos';
  clientTicketId: string;
  ticketNumber: number;
  vendorName: string;
  responsibleHrPersonId: string | null;
  guestAccessId: string;
  deviceId: string | null;
  /** Tableau pour permettre plus tard le paiement fractionné ; V1 : un seul élément. */
  payments: PosPaymentLine[];
  /** Somme des pourboires du ticket (hors CA, hors TVA). */
  tipTotal: number;
  elementId: string;
  /** Horodatage tablette (préparation hors ligne) ; transactionDate = réception serveur en V1. */
  clientCreatedAt: string | null;
}

/** rawData d'une ligne : prix d'origine et promotion, reduction reste à 0 (convention Digifood). */
export interface PosItemRawData {
  pos: true;
  menuItemId: string;
  originalUnitPrice: number | null;
  promotionLabel: string | null;
}

// ---------------------------------------------------------------------------------------------
// Staff (permission front.fb.pos, PIN en clair : front.fb.posManage)
// ---------------------------------------------------------------------------------------------

/** GET pos/:spaceId/events */
export interface PosEventListItem {
  id: string;
  name: string;
  eventDate: string;
  status: 'live' | 'upcoming';
  configurationId: string | null;
  startedPdvCount: number;
}

export type PosPdvStatus = 'inactive' | 'ready' | 'selling';

/** Une ligne PdV de GET pos/:spaceId/events/:eventId */
export interface PosPdvRow {
  elementId: string;
  name: string;
  type: string | null;
  zoneLabel: string | null;
  spaceMenuLabel: string | null;
  itemsCount: number;
  status: PosPdvStatus;
  /** Déchiffré seulement avec front.fb.posManage, sinon null. */
  pin: string | null;
  qrSlug: string;
  responsibleHrPersonId: string | null;
  responsibleName: string | null;
  /** Autres sources de ventes déjà mappées sur ce PdV (rappel « les sources s'additionnent »). */
  otherSources: Array<'WEEZEVENT' | 'DIGIFOOD'>;
  sales: { tickets: number; revenueTtc: number };
}

export interface PosEventSettingDto {
  /** Moyens activés pour l'évènement ; vide = tous les moyens actifs du tenant. */
  paymentMethodIds: string[];
  promosEnabled: boolean;
  cancelEnabled: boolean;
  /** Seuil « stock bas » en unités encore vendables (défaut 5, 0 = jamais « bas »). */
  lowStockUnits: number;
  /** Pourboires acceptés à la caisse (défaut false). */
  tipsEnabled: boolean;
}

/** GET pos/:spaceId/events/:eventId */
export interface PosEventDetail {
  event: PosEventListItem;
  pdvs: PosPdvRow[];
  settings: PosEventSettingDto;
  kpis: { activePdv: number; totalPdv: number; tickets: number; revenueTtc: number; averageBasketTtc: number };
}

/**
 * Réponse de POST .../pdv/:elementId/start, /stop et /reset-pin (lot L2, défini dans
 * guest-pin-access/pos-access.service.ts sous le même nom, à garder identique).
 */
export interface PosAccessStatusDto {
  elementId: string;
  windowId: string | null;
  open: boolean;
  pin: string | null; // en clair seulement avec front.fb.posManage
  pinSetAt: string | null;
  openedAt: string | null;
  closedAt: string | null;
  lastLoginAt: string | null;
}

/** Réponse de POST .../start-all et /stop-all : un PdV en échec n'empêche pas les autres. */
export interface PosBulkResultDto {
  results: PosAccessStatusDto[];
  failures: Array<{ elementId: string; code: string; message: string }>;
}

/** GET guest-pin/context/:slug : champ ajouté par L2 au contexte public existant. */
export interface PosPublicContextExtension {
  posActive: boolean;
}

/** PUT pos/:spaceId/events/:eventId/pdv/:elementId */
export interface PosPdvSettingUpdate {
  responsibleHrPersonId: string | null;
}

/** Ligne d'historique (staff et invité). Montants en euros TTC, 2 décimales. */
export interface PosSaleRow {
  id: string;
  ticketNumber: number;
  createdAt: string;
  elementId: string;
  pdvName: string;
  vendorName: string;
  payments: PosPaymentLine[];
  totalTtc: number;
  tipTotal: number;
  vatTotal: number;
  cancelled: boolean;
  syncStatus: 'synced';
  lines: Array<{ menuItemId: string; name: string; quantity: number; unitPrice: number; totalTtc: number; vatRate: number }>;
}

/** GET pos/:spaceId/events/:eventId/sales et GET guest-pin/pos/sales */
export interface PosSalesPage {
  rows: PosSaleRow[];
  nextCursor: string | null;
  totals: { tickets: number; cancelled: number; revenueTtc: number; tipsTtc: number };
}

/** Filtres de l'historique staff (query string). */
export interface PosSalesQuery {
  elementId?: string;
  paymentMethodId?: string;
  search?: string; // numéro de ticket ou nom de vendeur
  cursor?: string;
  limit?: number; // 50 par défaut, 200 au plus
}

// ---------------------------------------------------------------------------------------------
// Invité (JwtGuestPinGuard, phase 'pos' ; tout le périmètre vient du jeton)
// ---------------------------------------------------------------------------------------------

/** POST guest-pin/login/:slug : vendorName obligatoire si la fenêtre trouvée est en phase 'pos'. */
export interface PosGuestLoginBody {
  pin: string; // 6 chiffres, comme l'inventaire
  vendorName?: string;
}

export type PosAvailability = 'available' | 'low' | 'out';

/** GET guest-pin/pos/catalog */
export interface PosCatalog {
  pdv: { elementId: string; name: string };
  event: { id: string; name: string };
  vendorName: string;
  settings: PosEventSettingDto;
  /** Moyens utilisables à cette caisse, déjà filtrés et triés (sortOrder). */
  paymentMethods: PosPaymentMethodDto[];
  categories: Array<{ id: string; label: string }>;
  items: Array<{
    menuItemId: string;
    name: string;
    categoryId: string;
    unitPrice: number; // TTC après promo : SpaceMenuItem.priceTtc puis MenuItem.basePrice
    originalUnitPrice: number | null; // prix avant promo si promotion active, sinon null
    promotionLabel: string | null; // PromotionType.name (Happy-Hour, Pack x4...) ou 'Promo'
    vatRate: number; // SpaceMenuItem.vatRate puis MenuItem.vatRate puis défaut tenant
    note: string | null; // composition d'un combo, etc.
    availability: PosAvailability; // lot L5
    remainingUnits: number | null; // lot L5, null si non calculable
  }>;
  nextTicketNumber: number;
}

/** POST guest-pin/pos/sales (idempotent sur clientTicketId). */
export interface PosCreateSaleBody {
  clientTicketId: string; // UUID v4 généré par la tablette
  /** V1 : un seul paiement du montant total ; le tableau prépare le paiement fractionné. */
  payments: Array<{ paymentMethodId: string; amountTtc: number; tipTtc?: number }>;
  clientCreatedAt?: string; // ISO 8601
  lines: Array<{ menuItemId: string; quantity: number }>; // quantity entière non nulle
}

export interface PosCreateSaleResult {
  sale: PosSaleRow;
  /** true si clientTicketId était déjà connu (rejeu) : rien n'a été réécrit. */
  replayed: boolean;
}

/** GET guest-pin/pos/closing */
export interface PosClosing {
  tickets: number;
  cancelled: number;
  byPaymentMethod: Array<{ paymentMethodId: string; name: string; kind: PosPaymentKind; amountTtc: number; tipTtc: number }>;
  /** Pourboires : total, et par vendeur pour la redistribution (décision Ulrich 2026-10-16). */
  tips: { totalTtc: number; byVendor: Array<{ vendorName: string; tipTtc: number; tickets: number }> };
  vatTotal: number;
  revenueTtc: number;
}
