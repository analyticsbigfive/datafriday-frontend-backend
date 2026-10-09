/**
 * CFG-2 — les 8 départements historiques du Builder v2 + leurs sous-types. GLOBAL, pas par
 * tenant (cf. doc du modèle Department) — source unique consommée par
 * `scripts/backfill-departments.ts`, le seed one-shot pour toute la plateforme.
 *
 * Valeurs (color/icon/subtypes) reprises telles quelles de
 * frontend/src/components/spaces/views/builder2/constants/elementTaxonomy.js TOOLS.
 * needsRh reprend sectionsForType()'s `staff` (seller || entrance || kitchen || entertainment).
 * isSeller reprend SELLER_TYPES (shop/merchshop/hospitality).
 * allowsSuppliers reprend HR_SUPPLIER_DEPARTMENTS (tous sauf storage), cf.
 * frontend/src/components/hr/hrShared.js.
 */
export interface LegacyDepartmentSeed {
  code: string;
  name: string;
  color: string;
  icon: string;
  needsRh: boolean;
  isSeller: boolean;
  allowsSuppliers: boolean;
  sortOrder: number;
  subtypes: Array<{ code: string; name: string }>;
}

export const LEGACY_DEPARTMENTS: LegacyDepartmentSeed[] = [
  {
    code: 'shop', name: 'F&B', color: '#10b981', icon: 'mdi-store',
    needsRh: true, isSeller: true, allowsSuppliers: true, sortOrder: 0,
    subtypes: [
      { code: 'food', name: 'Food' },
      { code: 'beverages', name: 'Beverages' },
      { code: 'beer', name: 'Beer' },
      { code: 'gppremium', name: 'GP Premium' },
      { code: 'temporary', name: 'Temporary' },
      { code: 'drinkee', name: 'Drinkee' },
      { code: 'mixology', name: 'Mixology' },
      { code: 'front_food', name: 'Front Food' },
      { code: 'kitchen_food', name: 'Kitchen Food' },
    ],
  },
  {
    code: 'hospitality', name: 'Hospitality', color: '#E91E63', icon: 'mdi-crown',
    needsRh: true, isSeller: true, allowsSuppliers: true, sortOrder: 1,
    subtypes: [
      { code: 'lodges', name: 'Lodges' },
      { code: 'salon', name: 'Salon' },
    ],
  },
  {
    code: 'merchshop', name: 'Merch', color: '#616161', icon: 'mdi-shopping',
    needsRh: true, isSeller: true, allowsSuppliers: true, sortOrder: 2,
    subtypes: [
      { code: 'onsite', name: 'On site' },
      { code: 'offsite', name: 'Off site' },
      { code: 'temporary', name: 'Temporary' },
    ],
  },
  {
    code: 'storage', name: 'Storage', color: '#FF9800', icon: 'mdi-package-variant',
    needsRh: false, isSeller: false, allowsSuppliers: false, sortOrder: 3,
    subtypes: [
      { code: 'dry', name: 'Dry storage' },
      { code: 'cold', name: 'Cold storage' },
      { code: 'belowzero', name: 'Below zero storage' },
      { code: 'material', name: 'Material storage' },
      { code: 'merch', name: 'Merch storage' },
    ],
  },
  {
    code: 'entrance', name: 'Ticketing', color: '#F44336', icon: 'mdi-ticket-confirmation',
    needsRh: true, isSeller: false, allowsSuppliers: true, sortOrder: 4,
    subtypes: [
      { code: 'public', name: 'Public' },
      { code: 'vip', name: 'VIP' },
      { code: 'staff', name: 'Staff' },
    ],
  },
  {
    code: 'entertainment', name: 'Entertainment', color: '#9C27B0', icon: 'mdi-party-popper',
    needsRh: true, isSeller: false, allowsSuppliers: true, sortOrder: 5,
    subtypes: [
      { code: 'sportground', name: 'Sport Ground' },
      { code: 'stage', name: 'Stage' },
      { code: 'mice', name: 'M.I.C.E.' },
    ],
  },
  {
    code: 'access', name: 'Access', color: '#607D8B', icon: 'mdi-transit-connection-variant',
    needsRh: false, isSeller: false, allowsSuppliers: true, sortOrder: 6,
    subtypes: [
      { code: 'lift', name: 'Lift' },
      { code: 'staircase', name: 'Staircase' },
      { code: 'servicelift', name: 'Service Lift' },
      { code: 'venueentrance', name: 'Venue Entrance' },
      { code: 'parking', name: 'Parking' },
      { code: 'reception', name: 'Reception' },
      { code: 'information', name: 'Information' },
    ],
  },
  {
    code: 'kitchen', name: 'Kitchen', color: '#FFA000', icon: 'mdi-chef-hat',
    needsRh: true, isSeller: false, allowsSuppliers: true, sortOrder: 7,
    subtypes: [
      { code: 'fb', name: 'F&B' },
      { code: 'hospitality', name: 'Hospitality' },
      { code: 'storage', name: 'Storage' },
    ],
  },
];
