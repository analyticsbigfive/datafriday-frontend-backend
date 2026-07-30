// Taxonomie des éléments du builder — SOURCE UNIQUE (doc REFONTE_3D_BUILDER_V2 §4.3).
// En v1 ces définitions étaient dupliquées dans 4+ fichiers (palette, plan, iso,
// inspecteur) avec des couleurs divergentes. Ici : un seul endroit, consommé partout.

export const TOOLS = [
  {
    type: 'shop',
    label: 'F&B',
    color: '#10b981',
    icon: 'mdi-store',
    subtypes: [
      { value: 'food', label: 'Food' },
      { value: 'beverages', label: 'Beverages' },
      { value: 'beer', label: 'Beer' },
      { value: 'gppremium', label: 'GP Premium' },
      { value: 'temporary', label: 'Temporary' },
      { value: 'drinkee', label: 'Drinkee' },
      // CFG-1 (2026-07-30) : catégories staffing (voir SUBTYPE_TO_FNB_CATEGORY,
      // backend staffing.service.ts) — sous-types du tool F&B existant, pas de
      // nouveau type top-level (décision utilisateur, cf. passe module doc RH).
      { value: 'mixology', label: 'Mixology' },
      { value: 'front_food', label: 'Front Food' },
      { value: 'kitchen_food', label: 'Kitchen Food' },
    ],
  },
  {
    type: 'hospitality',
    label: 'Hospitality',
    color: '#E91E63',
    icon: 'mdi-crown',
    subtypes: [
      { value: 'lodges', label: 'Lodges' },
      { value: 'salon', label: 'Salon' },
    ],
  },
  {
    type: 'merchshop',
    label: 'Merch',
    color: '#616161',
    icon: 'mdi-shopping',
    subtypes: [
      { value: 'onsite', label: 'On site' },
      { value: 'offsite', label: 'Off site' },
      { value: 'temporary', label: 'Temporary' },
    ],
  },
  {
    type: 'storage',
    label: 'Storage',
    color: '#FF9800',
    icon: 'mdi-package-variant',
    subtypes: [
      { value: 'dry', label: 'Dry storage' },
      { value: 'cold', label: 'Cold storage' },
      { value: 'belowzero', label: 'Below zero storage' },
      { value: 'material', label: 'Material storage' },
      { value: 'merch', label: 'Merch storage' },
    ],
  },
  {
    type: 'entrance',
    label: 'Ticketing',
    color: '#F44336',
    icon: 'mdi-ticket-confirmation',
    subtypes: [
      { value: 'public', label: 'Public' },
      { value: 'vip', label: 'VIP' },
      { value: 'staff', label: 'Staff' },
    ],
  },
  {
    type: 'entertainment',
    label: 'Entertainment',
    color: '#9C27B0',
    icon: 'mdi-party-popper',
    subtypes: [
      { value: 'sportground', label: 'Sport Ground' },
      { value: 'stage', label: 'Stage' },
      { value: 'mice', label: 'M.I.C.E.' },
    ],
  },
  {
    type: 'access',
    label: 'Access',
    color: '#607D8B',
    icon: 'mdi-transit-connection-variant',
    subtypes: [
      { value: 'lift', label: 'Lift' },
      { value: 'staircase', label: 'Staircase' },
      { value: 'servicelift', label: 'Service Lift' },
      { value: 'venueentrance', label: 'Venue Entrance' },
      { value: 'parking', label: 'Parking' },
      { value: 'reception', label: 'Reception' },
      { value: 'information', label: 'Information' },
    ],
  },
  {
    type: 'kitchen',
    label: 'Kitchen',
    color: '#FFA000',
    icon: 'mdi-chef-hat',
    subtypes: [
      { value: 'fb', label: 'F&B' },
      { value: 'hospitality', label: 'Hospitality' },
      { value: 'storage', label: 'Storage' },
    ],
  },
]

const byType = new Map(TOOLS.map((t) => [t.type, t]))

// Couleurs assombries — utilisées pour les éléments sélectionnés ou mis en évidence.
// Parité v1 getDarkerColor().
const DARKER = new Map([
  ['shop', '#059669'],
  ['hospitality', '#db2777'],
  ['merchshop', '#78350f'],
  ['storage', '#d97706'],
  ['entrance', '#ff3131'],
  ['entertainment', '#7c3aed'],
  ['access', '#475569'],
  ['kitchen', '#ea580c'],
])

export function toolOf(type) {
  return byType.get(normalizeType(type)) || null
}

export function colorOf(type) {
  return toolOf(type)?.color || '#94a3b8'
}

export function darkerColorOf(type) {
  return DARKER.get(normalizeType(type)) || '#4b5563'
}

export function labelOf(type) {
  return toolOf(type)?.label || type || ''
}

/**
 * Normalise un type d'élément vers un des 8 types d'outil. Les éléments créés hors
 * builder2 (Data Integration : fnb_food, fnb-bar, merch-temporary…) sont ramenés à
 * leur catégorie ; le détail vit dans `subtypes`.
 */
export function normalizeType(type) {
  const t = String(type || '').toLowerCase().replace(/_/g, '-')
  if (byType.has(t)) return t
  if (t === 'fb' || t.startsWith('fnb')) return 'shop'
  if (t.startsWith('merch')) return 'merchshop'
  if (t.startsWith('storage')) return 'storage'
  if (t.startsWith('hospitality')) return 'hospitality'
  if (t.startsWith('access')) return 'access'
  if (t.startsWith('entertainment')) return 'entertainment'
  if (t.startsWith('entrance') || t === 'ticketing') return 'entrance'
  if (t.startsWith('kitchen')) return 'kitchen'
  return t
}

// ── Matrice sections d'inspecteur × type (doc §wireframe WF-02) ────────────────
// Reprend les règles v1 : Configurations masquée pour storage/entrance/access ;
// Performance masquée pour storage/entertainment/access/kitchen ; Menu réservé aux
// types "vendeurs" ; Inventory pour vendeurs + storage ; Staff pour vendeurs + entrance + kitchen + entertainment.
// storage a deux sections dédiées : Shops (F&B qui stockent ici) et un Inventory
// AGRÉGÉ sur ces shops (storageInventory remplace inventory pour ce type).
const SELLER_TYPES = new Set(['shop', 'merchshop', 'hospitality'])

export function sectionsForType(type) {
  const t = normalizeType(type)
  const seller = SELLER_TYPES.has(t)
  return {
    identity: true,
    geometry: true,
    subtypes: (toolOf(t)?.subtypes?.length || 0) > 0,
    configs: !['storage', 'entrance', 'access'].includes(t),
    usage: seller,
    performance: !['storage', 'entertainment', 'access', 'kitchen'].includes(t),
    menu: seller,
    inventory: seller,
    storageShops: t === 'storage',
    storageInventory: t === 'storage',
    staff: seller || t === 'entrance' || t === 'kitchen' || t === 'entertainment',
  }
}

// ── Défauts géométriques ───────────────────────────────────────────────────────
export const DEFAULTS = {
  element: { height3d: 2, minDrawSizeM: 1 },
  floor: { width: 100, length: 100, height: 4 },
  forecourt: { width: 50, length: 50, height: 0 },
  external: { width: 50, length: 50, height: 0 },
}

export const ZONE_KINDS = {
  FLOOR: 'FLOOR',
  FORECOURT: 'FORECOURT',
  EXTERNAL: 'EXTERNAL',
}

// `t` = fonction de traduction du composant appelant (useI18n) — injectée pour que
// le libellé reste réactif au changement de langue (ce module n'est pas un composant).
export function zoneKindLabel(zone, t = (k) => k) {
  if (zone.kind === ZONE_KINDS.FORECOURT) return t('b2ZoneKindForecourt')
  if (zone.kind === ZONE_KINDS.EXTERNAL) return t('b2ZoneKindExternal')
  if (zone.level === 0) return t('b2ZoneKindGroundFloor')
  if (zone.level < 0) return `${t('b2ZoneKindBasement')} ${Math.abs(zone.level)}`
  return `${t('b2ZoneKindFloor')} ${zone.level}`
}
