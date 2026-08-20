// Taxonomie des éléments du builder — CFG-2 Étape 5 : n'est plus la source statique (la table
// globale `Department`/`Subtype`, store Vuex `departments`, l'est désormais) mais reste LE seul
// point de dérivation partagé entre Palette/Canvas/Iso/Inspector — chacun lit la MÊME liste
// vivante au lieu de 4+ copies divergentes (doc REFONTE_3D_BUILDER_V2 §4.3, historique v1).
//
// Toutes les fonctions ci-dessous qui dépendaient auparavant du tableau `TOOLS` statique
// prennent maintenant un paramètre `tools` explicite — l'appelant le lit depuis le store
// (`store.getters['departments/departments']`) à l'intérieur de son propre `computed()`, pour
// que Vue détecte la dépendance réactive et re-calcule quand la liste change. Même motif déjà
// validé cette session avec `storageSubtypesFor()` (ci-dessous, généralisé par `buildTools()`).
//
// `normalizeType()` reste néanmoins une fonction PURE sans dépendance externe : elle ne fait que
// replier des préfixes legacy (fnb_*, merch-*, etc.) vers l'un des 8 codes canoniques, qui sont
// des valeurs `Department.code` STABLES PAR CONCEPTION (jamais éditables, cf. modèle Department)
// — ce mapping ne peut donc jamais changer, contrairement au nom/couleur/icône qui eux sont
// CRUD-éditables et doivent venir de `tools`.

/**
 * Construit la liste `TOOLS`-shaped à partir des lignes Department (avec leurs Subtype imbriqués)
 * renvoyées par `GET /departments`. `dept.code ?? dept.id` = identifiant stable persisté dans
 * SpaceElement.type ; idem pour chaque sous-type dans SpaceElement.subtypes[].
 * @param {Array} departments - store.getters['departments/departments']
 */
export function buildTools(departments = []) {
  return departments.map((dept) => ({
    type: dept.code ?? dept.id,
    label: dept.name,
    color: dept.color,
    icon: dept.icon,
    subtypes: (dept.subtypes || []).map((st) => ({ value: st.code ?? st.id, label: st.name })),
  }))
}

export function toolOf(type, tools = []) {
  const normalized = normalizeType(type)
  return tools.find((t) => t.type === normalized) || tools.find((t) => t.type === type) || null
}

export function colorOf(type, tools = []) {
  return toolOf(type, tools)?.color || '#94a3b8'
}

// Couleurs assombries des 8 départements historiques — utilisées pour les éléments sélectionnés/
// mis en évidence. PRÉSERVÉES telles quelles (parité v1 getDarkerColor(), jamais un simple
// assombrissement algorithmique de la couleur de base — entrance/entertainment/merchshop
// changent même de teinte, pas juste de luminosité — donc pas question de les recalculer sans
// changer visiblement l'app). Clé = `Department.code`, qui ne change JAMAIS même si le tenant
// renomme le département — contrairement à `label`. Un département créé par le super-admin
// (code null) n'a pas de valeur "main" ; on calcule alors un assombrissement HSL de sa couleur.
const LEGACY_DARKER = new Map([
  ['shop', '#059669'],
  ['hospitality', '#db2777'],
  ['merchshop', '#78350f'],
  ['storage', '#d97706'],
  ['entrance', '#ff3131'],
  ['entertainment', '#7c3aed'],
  ['access', '#475569'],
  ['kitchen', '#ea580c'],
])

function computeDarken(hex, amount = 0.18) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  if (!m) return hex || '#4b5563'
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => parseInt(h, 16) / 255)
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h /= 6
  }
  const l2 = Math.max(0, l - amount)
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  let r2, g2, b2
  if (s === 0) { r2 = g2 = b2 = l2 }
  else {
    const q = l2 < 0.5 ? l2 * (1 + s) : l2 + s - l2 * s
    const p = 2 * l2 - q
    r2 = hue2rgb(p, q, h + 1 / 3); g2 = hue2rgb(p, q, h); b2 = hue2rgb(p, q, h - 1 / 3)
  }
  const toHex = (x) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${toHex(r2)}${toHex(g2)}${toHex(b2)}`
}

export function darkerColorOf(type, tools = []) {
  const normalized = normalizeType(type)
  if (LEGACY_DARKER.has(normalized)) return LEGACY_DARKER.get(normalized)
  return computeDarken(colorOf(type, tools))
}

export function labelOf(type, tools = []) {
  return toolOf(type, tools)?.label || type || ''
}

// Les 8 codes canoniques (Department.code) — FIXES par conception (jamais éditables, cf. doc du
// modèle Department), donc utilisables ici sans dépendance au store contrairement au reste de ce
// module (name/color/icon/subtypes, eux CRUD-éditables).
const CANONICAL_CODES = new Set(['shop', 'hospitality', 'merchshop', 'storage', 'entrance', 'entertainment', 'access', 'kitchen'])

/**
 * Normalise un type d'élément vers un des 8 codes canoniques. Les éléments créés hors
 * builder2 (Data Integration : fnb_food, fnb-bar, merch-temporary…) sont ramenés à
 * leur catégorie ; le détail vit dans `subtypes`.
 */
export function normalizeType(type) {
  const t = String(type || '').toLowerCase().replace(/_/g, '-')
  if (CANONICAL_CODES.has(t)) return t
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

/**
 * CFG-2 : sous-types du tool "storage" pour la condition (dry/cold/belowzero) — ceux-là
 * seuls sont pilotés par le référentiel StorageType (Configurations, CRUD-éditable). Les 3
 * entrées historiques restent des chaînes figées (compat SpaceElement.subtypes[], déjà
 * persistées sur des éléments existants) ; toute ligne StorageType créée par un tenant
 * (code === null) ajoute une entrée `{value: son id, label: son name}`. `material`/`merch`
 * sont un axe différent — l'USAGE du stockage, pas sa condition (cf. BUG-020/BUG-021) — et
 * restent toujours figés, non concernés par ce référentiel.
 * @param {Array<{id:string,name:string,code:string|null}>} tenantStorageTypes
 */
export function storageSubtypesFor(tenantStorageTypes = []) {
  const legacy = [
    { value: 'dry', label: 'Dry storage' },
    { value: 'cold', label: 'Cold storage' },
    { value: 'belowzero', label: 'Below zero storage' },
  ]
  const custom = (tenantStorageTypes || [])
    .filter((st) => st?.code == null)
    .map((st) => ({ value: st.id, label: st.name }))
  return [...legacy, ...custom, { value: 'material', label: 'Material storage' }, { value: 'merch', label: 'Merch storage' }]
}

// ── Matrice sections d'inspecteur × type (doc §wireframe WF-02) ────────────────
// Reprend les règles v1 : Configurations masquée pour entrance/access ;
// Performance masquée pour storage/entertainment/access/kitchen ; Menu réservé aux
// types "vendeurs" ; Inventory pour vendeurs + storage ; Staff pour vendeurs + entrance + kitchen + entertainment.
// storage a deux sections dédiées : Shops (F&B qui stockent ici) et un Inventory
// AGRÉGÉ sur ces shops (storageInventory remplace inventory pour ce type).
// NB (demande Bertrand 2026-08-20) : la section Configuration EST affichée pour storage —
// un stockage est partagé par tout l'espace et naît membre de toutes les configs (cf.
// createElementFromDraw dans builderStore.js), mais on veut pouvoir voir/ajuster ce rattachement.
const SELLER_TYPES = new Set(['shop', 'merchshop', 'hospitality'])

export function sectionsForType(type, tools = []) {
  const t = normalizeType(type)
  const seller = SELLER_TYPES.has(t)
  return {
    identity: true,
    geometry: true,
    subtypes: (toolOf(t, tools)?.subtypes?.length || 0) > 0,
    configs: !['entrance', 'access'].includes(t),
    usage: seller,
    performance: !['storage', 'entertainment', 'access', 'kitchen'].includes(t),
    menu: seller,
    inventory: seller,
    storageShops: t === 'storage',
    storageInventory: t === 'storage',
    // Inputs de l'algo de staffing par paliers (nbFriteuses, txParSeconde…) — consommés
    // uniquement par StaffingCalculatorService, lui-même scopé à `shop`/legacy F&B
    // (STAFFING_ELEMENT_TYPES côté backend) : aucune formule équivalente pour les autres
    // départements, donc pas de section correspondante ailleurs (cf. BUG-260-02, décision
    // utilisateur 2026-08-01 : tout dans le Builder).
    staffingInputs: t === 'shop',
    // Saisie "vendu/prévu" par Menu Item (11_RH_STAFFING.md §11.16), source des associations
    // Rôle↔MenuItem — même périmètre que staffingInputs (shop uniquement).
    menuItemSalesInput: t === 'shop',
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
