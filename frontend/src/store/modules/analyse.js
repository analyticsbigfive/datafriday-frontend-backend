/**
 * Store Vuex module pour l'écran AnalyseView.
 * Contient les ~90 filtres + caches + état UI.
 */

import {
  aggregateTimeline,
  buildTimelineFilter,
  preprocessTimelineRecords,
} from '@/utils/timelineBucketing'
import { runWithConcurrency } from '@/utils/asyncPool'
import {
  resolveItemName,
  resolveShopType,
  resolveItemType,
  resolveItemCategory,
} from '@/utils/analyseDimensions'
import {
  buildReconciliationContext,
  reconcileRecord,
  UNATTACHED_SHOP_KEY,
} from '@/utils/analyseReconciliation'
import { OTHER_SHOP_TYPE } from '@/constants/shopTypes'
import {
  DATE_RANGE_LABEL_FR_MAP,
  PREDICT_DATE_RANGE_LABEL_FR_MAP,
  PRESET_I18N_KEYS,
} from '@/constants/dateRangePresets'
import { t as translate, getCurrentLocale } from '@/i18n/translations'
import { normalizeStr } from '@/utils/predictiveAnalytics'
import { scenarioRecordsToAnalyseRecords } from '@/utils/predictScenarioRecords'
import { parseEventSessions } from '@/utils/eventSessions'
import { normalizeType } from '@/components/spaces/views/builder2/constants/elementTaxonomy'
// getConfiguration : MIGRÉ vers l'API NestJS (projet Supabase alsgd VIVANT) au lieu
// du make-server Edge Function (projet uvxx MORT → 500/522). Import DYNAMIQUE au
// call-site (buildConfigShopEntry) et NON statique : configuration.api → client.js
// tire axios + @/router → @/store/index, ce qui recréerait un cycle (analyse.js EST
// un module du store) et casserait jest (axios/vuex ESM au chargement du graphe).
// Le lazy import garde le graphe statique du store propre ; au runtime le cycle est
// déjà résolu (store bootstrapé). Le builder gère les 2 shapes (config.data.floors
// ou config.floors). getSpaceMenuConfiguration (assignation edge) supprimé →
// assignation reconstruite depuis les menus NestJS par shop (fetchNestShopMenus).

// ---------------------------------------------------------------------------
// Helpers (purs, hors getters) — partagés par les variations Précédent / N-1
// ---------------------------------------------------------------------------

// Renvoie null quand la baseline est absente (prev <= 0) afin que l'UI
// puisse masquer la variation au lieu d'afficher un faux "↑ 100%".
function pctDiff(curr, prev) {
  if (!Number.isFinite(curr) || !Number.isFinite(prev)) return null
  if (!prev) return null
  return ((curr - prev) / prev) * 100
}

// Date d'un event, robuste aux DEUX champs (`date` ISO ET `eventDate` ISO ou
// DD/MM/YYYY). Indispensable pour exclure les events FUTURS en mode analyse : si
// un event ne porte que `eventDate` (pas `date`), le filtre basé sur `e.date`
// seul le laissait passer → event futur affiché (ex. « Item/Events performance »).
function eventDateOf(e) {
  const raw = e?.date ?? e?.eventDate
  if (!raw) return null
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw
  const s = String(raw).trim()
  const dd = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dd) return new Date(+dd[3], +dd[2] - 1, +dd[1])
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return new Date(+iso[1], +iso[2] - 1, +iso[3])
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function totalsForEventIds(events, records, costMap, eventIds) {
  if (!eventIds || eventIds.size === 0) {
    return {
      revenue: 0, cost: 0, transactions: 0, attendees: 0, eventCount: 0,
      avgRevenuePerEvent: 0, avgPerTransaction: 0, avgCost: 0,
      margin: 0, perCapita: 0, transferRate: 0,
    }
  }
  let revenue = 0, cost = 0, transactions = 0, attendees = 0
  const revByEvent = new Map()
  for (const r of records) {
    if (!eventIds.has(r.eventId)) continue
    revenue += r.revenue || 0
    cost += (costMap[r.menuItemId] || 0) * (r.quantity || 0)
    transactions += r.transactionCount || 0
    revByEvent.set(r.eventId, (revByEvent.get(r.eventId) || 0) + (r.revenue || 0))
  }
  for (const e of events) {
    if (!eventIds.has(e.id)) continue
    attendees += e.ticketsScanned ?? e.attendees ?? e.ticketsSold ?? 0
  }
  const eventCount = eventIds.size
  // Parité React (validEventCount, l.8197-8212) : les moyennes par event
  // divisent par les events AVEC CA (> 0), pas par toute la fenêtre — un event
  // sans ventes ne doit pas diluer la moyenne.
  let validEventCount = 0
  for (const v of revByEvent.values()) if (v > 0) validEventCount++
  return {
    revenue, cost, transactions, attendees, eventCount, validEventCount,
    avgRevenuePerEvent: validEventCount ? revenue / validEventCount : 0,
    avgPerTransaction: transactions ? revenue / transactions : 0,
    avgCost: validEventCount ? cost / validEventCount : 0,
    margin: revenue ? ((revenue - cost) / revenue) * 100 : 0,
    perCapita: attendees ? revenue / attendees : 0,
    transferRate: attendees ? (transactions / attendees) * 100 : 0,
  }
}

// Quand la période précédente n'a aucun event, aucune variation n'a de sens —
// on retourne un objet vide pour que l'UI masque tous les indicateurs.
function buildVariations(curr, prev) {
  if (!prev || !prev.eventCount) return {}
  return {
    revenue: pctDiff(curr.revenue, prev.revenue),
    avgRevenuePerEvent: pctDiff(curr.avgRevenuePerEvent, prev.avgRevenuePerEvent),
    cost: pctDiff(curr.cost, prev.cost),
    avgCost: pctDiff(curr.avgCost, prev.avgCost),
    transactions: pctDiff(curr.transactions, prev.transactions),
    avgTransaction: pctDiff(curr.avgPerTransaction, prev.avgPerTransaction),
    avgPerTransaction: pctDiff(curr.avgPerTransaction, prev.avgPerTransaction),
    attendees: pctDiff(curr.attendees, prev.attendees),
    perCapita: pctDiff(curr.perCapita, prev.perCapita),
    // Marge = points de % (parité React « pp », l.11051-11053) ; transfo =
    // pct diff des TAUX (parité React l.8880-8882).
    margin: curr.margin - prev.margin,
    transferRate: pctDiff(curr.transferRate, prev.transferRate),
    transactionRate: pctDiff(curr.transactionRate || 0, prev.transactionRate || 0),
  }
}

/**
 * Assignation item↔PdV pour TOUT le config en 1 appel batch (`getConfigShopMenuItemsLight`,
 * serveur-side : id/nom/catégorie des articles déjà filtrés `enabled === true`) — remplace
 * l'ancienne boucle par-shop sur `shopMenuItems/fetchForShop` (1 appel réseau par shop,
 * structure recette complète inutile ici ; ce store reste utilisé ailleurs — ShopMenuItemsDrawer
 * etc. — où la recette complète est nécessaire). Renvoie { shopRows, byName: Map<normNom,
 * {shopId, shopName, items[]}> }.
 */
async function fetchNestShopMenus({ spaceId, configId, perimeter, dispatch, commit }) {
  const EMPTY = { shopRows: [], byName: new Map(), batchFailed: false }
  if (!spaceId || !configId) return EMPTY
  let allRows = []
  try {
    const fetched = await dispatch('spaceShops/fetchForSpace', { spaceId }, { root: true }).catch(() => [])
    allRows = Array.isArray(fetched) ? fetched : []
    if (commit) commit('SET_SPACE_SHOPS_ROWS', { spaceId, rows: allRows })
  } catch (_) {
    /* noop */
  }
  // Périmètre des PdV RÉELLEMENT rattachés à la config = éléments des floors (endpoint
  // détail `getConfiguration`) + elementId portant une assignation d'items
  // (`getSpaceMenuConfiguration`). On scope les rows /shops à ce périmètre par id OU par
  // NOM normalisé (les deux id-spaces sont reliés par nom). On accepte aussi un row qui
  // porte explicitement le bon configId. PLUS de repli « tous les shops du space » :
  // c'était la cause du périmètre faux (weezevent-import ramenait tout l'espace ; une
  // config sans floors → 1 seul PdV). Sans aucun signal de périmètre, on ne garde que le
  // signal configId des rows — jamais l'espace entier.
  const nameSet = perimeter?.nameSet instanceof Set ? perimeter.nameSet : new Set()
  const idSet = perimeter?.idSet instanceof Set ? perimeter.idSet : new Set()
  const inPerimeter = (r) => {
    const id = String(r?.id ?? r?._id ?? r?.shopId ?? '')
    const nm = normalizeStr(r?.name ?? r?.shopName ?? '')
    if (id && idSet.has(id)) return true
    if (nm && nameSet.has(nm)) return true
    const rc = r?.configId ?? r?._raw?.configId
    return rc != null && rc === configId
  }
  const shopRows = (nameSet.size || idSet.size)
    ? allRows.filter(inPerimeter)
    : allRows.filter((r) => (r?.configId ?? r?._raw?.configId) === configId)
  if (!shopRows.length) return EMPTY
  // 1 SEUL appel batch pour tous les shops du config (remplace la boucle par-shop
  // shopMenuItems/fetchForShop qui saturait le backend N shops × M configs) — ne
  // remonte que id/nom/catégorie des articles ENABLED, pas la recette complète
  // (composants/ingrédients/pricing) inutile ici.
  let itemsByShopId = {}
  // `batchFailed` remonte jusqu'au cache de `buildConfigShopEntry` : un blip réseau
  // produit un contexte SANS articles, qu'il ne faut surtout pas mémoriser pour la
  // session (l'appelant doit pouvoir retenter au prochain dispatch).
  let batchFailed = false
  try {
    const { getConfigShopMenuItemsLight } = await import('@/api/endpoints/menu.api')
    itemsByShopId = (await getConfigShopMenuItemsLight(spaceId, configId)) || {}
  } catch (_) {
    batchFailed = true
  }
  const byName = new Map()
  for (const r of shopRows) {
    const shopId = String(r?.id ?? r?._id ?? r?.shopId ?? '')
    const name = r?.name ?? r?.shopName ?? ''
    const entry = itemsByShopId[shopId]
    if (!entry?.items?.length) continue
    const key = normalizeStr(name)
    if (!key) continue
    byName.set(key, { shopId, shopName: name, items: entry.items })
  }
  return { shopRows, byName, batchFailed }
}

/**
 * Types de PdV AUTORITAIRES depuis le Builder v2 : les subtypes (food/beverages/
 * beer/gppremium/temporary/drinkee — byte-identiques aux clés SHOP_TYPES) vivent
 * sur l'élément builder-v2, PAS dans le blob config v1 (souvent périmé : composites
 * « food, beverages ») ni sur les rows NestJS /shops. 1 fetch par espace, promise
 * partagée (les buildConfigShopEntry concurrents de « All Configurations » ne
 * déclenchent qu'une requête). Échec (404 espace jamais ouvert dans builder2,
 * réseau) → resolve null + reset : comportement actuel conservé, retry au prochain
 * dispatch. Map globale par espace (le subtype est porté par l'élément, identique
 * dans toutes les configs) → pas de scoping par memberships.
 */
let builder2SubtypesCache = { spaceId: null, promise: null }
function getBuilder2SubtypesByName(spaceId) {
  if (!spaceId) return Promise.resolve(null)
  if (builder2SubtypesCache.spaceId !== spaceId || !builder2SubtypesCache.promise) {
    builder2SubtypesCache = {
      spaceId,
      promise: import('@/api/endpoints/builder-v2.api')
        .then((m) => m.getBuilderState(spaceId))
        .then((s) => {
          // Types legacy Data Integration (fnb_food, fnb-bar, fb…) = shops F&B
          // (normalizeType d'elementTaxonomy.js côté builder2, réutilisé ici au lieu
          // d'une réimplémentation locale).
          const isShopType = (type) => normalizeType(type) === 'shop'
          const byName = new Map()
          for (const zone of s?.zones || []) {
            for (const el of zone?.elements || []) {
              if (!isShopType(el?.type)) continue
              if (!Array.isArray(el?.subtypes) || !el.subtypes.length) continue
              const k = normalizeStr(el?.name)
              if (k) byName.set(k, el.subtypes)
            }
          }
          return byName
        })
        .catch(() => {
          builder2SubtypesCache = { spaceId: null, promise: null }
          return null
        }),
    }
  }
  return builder2SubtypesCache.promise
}
export function resetBuilder2SubtypesCache() {
  builder2SubtypesCache = { spaceId: null, promise: null }
}

/** Union de deux assignations (forme `{menuItems:{el:{mi:bool}}}`). */
function mergeAssignments(edge, nest) {
  const e = edge?.menuItems || edge || null
  const n = nest?.menuItems || null
  if (!n) return edge || null
  if (!e) return nest
  const out = {}
  for (const k of new Set([...Object.keys(e), ...Object.keys(n)])) {
    out[k] = { ...(e[k] || {}), ...(n[k] || {}) }
  }
  return { menuItems: out }
}

/**
 * Construit le contexte PdV COMPLET d'UNE config : floorElements (floors config ∪ shops
 * NestJS scopés au périmètre) + assignation (Edge ∪ NestJS) + assignmentItemsByShop
 * (Map<normName, items[]>). Pur (ne commit rien) → réutilisé par loadConfigShopContext
 * (mono-config) ET loadAllConfigsShopContext (union « All Configurations »).
 */
async function buildConfigShopEntry(spaceId, configId, { state, dispatch, commit, rootGetters }) {
  // Lancé en parallèle du reste (pas d'await ici) — consommé après floorElements.
  const b2Promise = getBuilder2SubtypesByName(spaceId)
  const inMemCfg = (state.configurations || []).find((c) => c?.id === configId) || null
  const inMemFloors = inMemCfg?.data?.floors || inMemCfg?.floors || []
  const configData = inMemFloors.length
    ? inMemCfg
    : await import('@/api/endpoints/configuration.api')
        .then((m) => m.getConfiguration(configId))
        .catch(() => null)
  // getSpaceMenuConfiguration (make-server legacy MORT) supprimé → l'assignation
  // est reconstruite depuis les menus NestJS par shop (fetchNestShopMenus, plus bas).
  const edgeAssignment = null
  const floors = configData?.data?.floors || configData?.floors || []
  const configElements = []
  for (const floor of floors) {
    for (const el of floor?.elements || []) configElements.push({ ...el, floorName: floor?.name })
  }
  const assignedElementIds = new Set()
  const edgeMI = edgeAssignment?.menuItems || edgeAssignment || {}
  for (const [elId, obj] of Object.entries(edgeMI)) {
    if (obj && Object.values(obj).some(Boolean)) assignedElementIds.add(String(elId))
  }
  const perimeterNameSet = new Set()
  const perimeterIdSet = new Set(assignedElementIds)
  for (const el of configElements) {
    const k = normalizeStr(el?.name)
    if (k) perimeterNameSet.add(k)
    if (el?.id != null) perimeterIdSet.add(String(el.id))
  }
  const { shopRows, byName, batchFailed } = await fetchNestShopMenus({
    spaceId, configId, perimeter: { nameSet: perimeterNameSet, idSet: perimeterIdSet }, dispatch, commit, rootGetters,
  })
  const elByName = new Map()
  for (const el of configElements) {
    const k = normalizeStr(el?.name)
    if (k) elByName.set(k, el)
  }
  for (const r of shopRows) {
    const nm = r?.name ?? r?.shopName ?? ''
    const k = normalizeStr(nm)
    if (k && !elByName.has(k)) {
      elByName.set(k, {
        id: String(r?.id ?? r?._id ?? r?.shopId ?? k),
        name: nm,
        shopType: r?.shopType ?? r?.type ?? null,
        floorName: r?.locationName ?? r?.area ?? r?.zone ?? r?.floorName ?? '',
      })
    }
  }
  const floorElements = [...elByName.values()]
  // Priorité shopType : builder2 subtypes > .shopType v1 > NestJS shopType ?? type.
  // Mutation sûre : entrées config = spread copies (ci-dessus), entrées NestJS =
  // littéraux frais. reconcileRecord gère déjà shopType array (join(',')→normalize).
  const b2 = await b2Promise
  let b2Hits = 0
  if (b2 instanceof Map && b2.size) {
    for (const el of floorElements) {
      const subtypes = b2.get(normalizeStr(el?.name))
      if (Array.isArray(subtypes) && subtypes.length) {
        el.shopType = subtypes
        b2Hits += 1
      }
    }
  }
  const nestMenuItems = {}
  const assignmentItemsByShop = new Map()
  for (const el of floorElements) {
    const k = normalizeStr(el?.name)
    const shop = byName.get(k)
    if (shop?.items?.length) {
      nestMenuItems[String(el.id)] = Object.fromEntries(shop.items.map((it) => [it.id, true]))
      assignmentItemsByShop.set(k, shop.items)
    }
  }
  const assignment = mergeAssignments(edgeAssignment, { menuItems: nestMenuItems })
  return {
    floorElements, assignment, assignmentItemsByShop,
    _batchFailed: batchFailed,
    _diag: { configElements: configElements.length, nest: byName.size, builder2Types: b2Hits },
  }
}

/**
 * Cache de RÉSULTAT de buildConfigShopEntry, par (espace, config).
 *
 * Sans lui, chaque appel refaisait `getConfiguration` + le batch
 * `getConfigShopMenuItemsLight` : l'union « All Configurations » rechargeait la config
 * déjà chargée en mono-config, et un aller-retour A → B → A repayait A.
 *
 * Promise (pas résultat) → dédup AUSSI les appels concurrents : `loadConfigShopContext(cfg-1)`
 * et `loadAllConfigsShopContext` (qui inclut cfg-1) peuvent se chevaucher.
 *
 * Durée de vie = la session de page, purgée par `resetConfigShopEntryCache()` appelé en
 * tête de `loadSpace` — exactement le cycle du cache builder2 juste au-dessus. C'est CE
 * point qui rend le cache sûr : revenir du Builder remonte AnalyseView → `loadSpace` →
 * purge → refetch. (Cf. BUG-225, où une dédup « contexte déjà chargé » avait été REFUSÉE
 * faute d'un tel point de purge.)
 */
const configShopEntryCache = new Map() // `${spaceId}::${configId}` → Promise<entry>

export function resetConfigShopEntryCache() {
  configShopEntryCache.clear()
}

function buildConfigShopEntryCached(spaceId, configId, ctx) {
  const key = `${spaceId}::${configId}`
  const hit = configShopEntryCache.get(key)
  if (hit) return hit
  const p = buildConfigShopEntry(spaceId, configId, ctx).then(
    (entry) => {
      // `buildConfigShopEntry` avale ses propres échecs (chaque fetch a son .catch) :
      // un blip sur le batch shop-items renvoie donc un contexte SANS articles, qui
      // « réussit ». Le mémoriser figerait des PdV sans menu pour toute la session —
      // on ne cache que les builds dont le batch a abouti.
      if (entry?._batchFailed) configShopEntryCache.delete(key)
      return entry
    },
    (err) => {
      // Filet pour une évolution future qui laisserait remonter une exception.
      configShopEntryCache.delete(key)
      throw err
    },
  )
  configShopEntryCache.set(key, p)
  return p
}

/**
 * Sélection de configuration à CONSERVER après (re)chargement d'un espace :
 * gardée si elle existe dans les configurations fraîchement chargées, null sinon
 * (id périmé hérité d'un autre espace — intention du reset d'origine). Corrige le
 * bug « le sélecteur retombe sur All Configurations » : loadSpace est re-dispatché
 * par d'autres écrans (ex. EventPredictView.loadAll) pendant que l'utilisateur a
 * déjà fait sa sélection — on ne l'écrase plus aveuglément.
 *
 * @param {string|null} currentId
 * @param {Array<{id:string}>} configurations — liste FRAÎCHE (déjà passée par
 *   `filterValidConfigurations`)
 * @param {{ configurationsFetchFailed?: boolean }} [opts] — `true` quand
 *   `GET /configurations` a échoué : la liste reçue est alors `[]` par repli et ne
 *   dit RIEN sur la validité de `currentId` → on conserve la sélection.
 */
export function resolveConfigSelectionAfterLoad(
  currentId,
  configurations = [],
  { configurationsFetchFailed = false } = {},
) {
  if (!currentId || currentId === 'cfg-all') return null
  // Fetch dégradé (`GET /configurations` en échec, avalé en `[]` par useSpaceData) :
  // une liste absente n'est PAS une preuve que l'id est périmé. Sans cette garde, un
  // échec réseau transitoire fait retomber la sélection utilisateur sur
  // « All Configurations » — l'écran change de périmètre sans que personne l'ait
  // demandé. Liste VIDE mais fetch OK = l'espace n'a réellement aucune config → on
  // purge (comportement inchangé, sinon le select afficherait l'id BRUT).
  if (configurationsFetchFailed) return currentId
  return configurations.some((c) => c?.id === currentId) ? currentId : null
}

// Statuts backend considérés comme « supprimé/invalide » (comparaison lowercase).
const CONFIG_DELETED_STATUSES = new Set(['deleted', 'archived', 'inactive', 'removed'])

/**
 * True si une configuration est supprimée / invalide. La table Config fait
 * aujourd'hui du HARD delete (aucune colonne de soft-delete) → une config
 * supprimée n'est plus renvoyée par l'API. Ce prédicat reste DÉFENSIF : si le
 * backend expose un jour un flag (`deleted`/`isDeleted`/`archived`/`deletedAt`/
 * `status`), la config est écartée sans changement côté vues.
 */
export function isDeletedConfig(c) {
  if (!c || typeof c !== 'object') return true
  if (c.deleted === true || c.isDeleted === true || c.archived === true) return true
  if (c.deletedAt) return true
  const status = String(c.status ?? '').toLowerCase()
  if (status && CONFIG_DELETED_STATUSES.has(status)) return true
  return false
}

/**
 * Choke point UNIQUE de nettoyage des configurations. Appelé par la mutation
 * `SET_CONFIGURATIONS` : toutes les vues (Analyse, EventPredict, Inventory,
 * Restock) lisent `state.analyse.configurations` → une liste déjà filtrée.
 * On ne garde que les configs avec un `id` et non supprimées (la sentinelle
 * `cfg-all`, qui porte bien un id, est préservée).
 */
export function filterValidConfigurations(list) {
  if (!Array.isArray(list)) return []
  return list.filter((c) => c && c.id && !isDeletedConfig(c))
}

/**
 * True si `id` correspond à une configuration VALIDE présente dans `list`.
 * Helper partagé pour que les vues rejettent un `configurationId` périmé
 * (hérité d'un event dont la config a été supprimée) au lieu de l'afficher brut.
 */
export function isValidConfigId(id, list = []) {
  if (!id || id === 'cfg-all') return false
  return Array.isArray(list) && list.some((c) => c?.id === id && !isDeletedConfig(c))
}

const DEFAULT_FILTERS = () => ({
  // Configuration active (null = All)
  selectedConfigurationId: null,

  // Recherche & sélection
  searchQuery: '',
  selectedEventIds: [],
  selectedShopIds: [],
  selectedShopTypes: [],
  selectedShopAreas: [],
  selectedMenuItemIds: [],
  selectedMenuItemTypes: [],
  selectedMenuItemCategories: [],

  // Catégories d'événement
  selectedEventCategories: [],
  selectedEventTypes: [],
  selectedTeams: [],
  selectedSponsors: [],
  selectedSubcategories: [],
  selectedSessions: [],
  selectedPerformerNames: [],
  selectedVisitingTeams: [],
  selectedOpeningActs: [],

  // Dates
  // Défaut = 'all' (Tout l'historique) : au chargement TOUS les events du space
  // sont analysés, aucun périmètre date implicite (avant : 'thisyear' donnait
  // l'impression d'events « présélectionnés »). Valeurs alignées sur
  // DATE_RANGE_PRESETS (cf. constants/dateRangePresets.js).
  timeRange: 'all',
  startDate: null,
  endDate: null,
  selectedDoorsOpenings: [],
  selectedShowTimes: [],
  selectedIntermissions: [], // ['yes'] | ['no'] | ['yes','no'] | []

  // Ranges attendance
  ticketsSoldRange: [0, 1000000],
  ticketsScannedRange: [0, 1000000],

  // Plage horaire intra-event sélectionnée via la timeline (clic sur une
  // heure / drag sur les sliders). { start: 'HH:MM' | null, end: 'HH:MM' | null }
  selectedTimeRange: { start: null, end: null },

  // Comparison — null = OFF (défaut) : aucune flèche/label, aucun fetch des
  // timelines de comparaison. Activé par les pills Précédent / N-1.
  comparisonMode: null, // null | previous_period | year_over_year
})

const state = () => ({
  // Data brute
  spaceId: null,
  space: null,
  // Horodatage de la dernière phase 1 réussie — support du cache-first 15 min
  // de loadSpace (stale-while-revalidate au re-mount de la vue).
  spaceCachedAt: 0,
  configurations: [],
  shopGranularData: [],        // ShopGranularRecord[]
  menuItemCostMap: {},
  menuItems: [],               // MenuItemData[] (enrichi avec components/readyForSale)
  suppliers: [],               // SupplierItem[]
  ingredients: [],             // IngredientItem[]
  components: [],              // ComponentDefinition[]
  weezeventProducts: [],       // WeezeventProduct[] — prix réels (basePrice) pour Event Predict
  weezeventProductMappings: [], // [{ weezeventProductId, menuItemId }] — lien produit→MenuItem (coûts)
  // Taxonomie DataFriday (catalogue) — source UNIQUE des dimensions item (type/catégorie).
  productTypesList: [],         // ProductType[] { id, name }
  productCategoriesList: [],    // ProductCategory[] { id, name, typeId, typeName }
  // Contexte PdV de la config sélectionnée : shops 100% DataFriday (FloorElements)
  // + assignation item↔PdV (getSpaceMenuConfiguration). Alimente la réconciliation.
  configShopContext: { configId: null, floorElements: [], assignment: null },
  configContextLoading: false,  // true tant que loadConfig(All)ShopContext fetch (pilote l'état loading des filtres)
  configContextError: null,     // message d'erreur si getConfiguration/getSpaceMenuConfiguration échoue (filtres = état error, pas vide silencieux)
  configContextReqId: 0,        // jeton de requête : seul le DERNIER loadConfig(All)ShopContext dispatché commit son résultat (anti-race fire-and-forget + watcher)
  // false tant qu'AUCUN chargement de contexte PdV n'est allé au bout. Distingue
  // « pas encore tenté » (union All Configurations DIFFÉRÉE par AnalyseView après le
  // 1er rendu) de « chargé, réellement vide ». Sans ce flag, le donut « Par zone »
  // (shopArea vient des FloorElements) s'affiche VIDE pendant tout le différé.
  configContextSettled: false,
  configContextLoadingId: null, // configId du chargement de contexte en cours (dédup des dispatchs concurrents)
  // Options du filtre articles = articles VENDUS dans le scope events courant.
  // Remontées depuis AnalyseView (dataset item-level, hors store) via
  // setSoldItemOptions. Source des getters salesMenuItem* (data-driven : filtres
  // alignés sur les ventes affichées, jamais sur le catalogue/assignation).
  soldItemOptions: { names: [], types: [], categories: [] },
  // true tant que le fetch item-level (useAnalyseItemRecords, hors store) tourne :
  // `soldItemOptions` est alors vide PARCE QUE ça charge, pas parce qu'il n'y a
  // rien → filtersState doit afficher le loader, pas « Aucun article disponible ».
  soldItemOptionsLoading: false,
  events: [],
  summary: null,              // { totalRevenue, totalCost, variations: {...} } fourni par l'API ou le mock
  fromMock: false,             // true quand fallback mock (affiche badge "Données démo")
  weezeventSetupIncomplete: false, // true quand les tables Weezevent ne sont pas encore créées

  // UI
  loading: false,
  enriching: false,            // true tant que la phase 2 (granular/menu) charge en arrière-plan
  predictionsGenerating: false, // true pendant la génération (découpée) des prédictions — pilote le progress du bandeau Predict
  error: null,
  chartViewMode: 'default',     // default | timeline
  chartGroupBy: 'by-date',      // by-date | shops | menu-types | average
  cumulativeRevenue: false,
  selectedToolbox: 'analyse',   // analyse | predict | inventory
  activeMobilePanel: 'middle',  // left | middle | right

  // Assistant : requête injectée depuis l'extérieur (ex. clic sur une alerte du header)
  pendingAssistantQuery: null,

  // Tables mises à plat des graphiques de la page (`useAnalyseDataset`), publiées
  // ici pour deux consommateurs : l'export xlsx/csv et l'assistant, dont le
  // contrat est `answer(store, query)` — passer par le store évite d'en changer
  // la signature jusqu'au chemin sémantique et à SummaryPanel.
  //
  // Construit EN DERNIER (idle, après le rendu) et porteur d'une `signature` :
  // l'assistant la compare avant usage et retombe sur `filteredShopGranularData`
  // si elle diverge. Un dataset périmé qui répond est pire que pas de dataset.
  // Ce sont des tables agrégées (dizaines à centaines de lignes), pas une copie
  // des records.
  dataset: null,

  // EventPredict : id de l'event à pré-sélectionner quand on entre dans l'overlay
  // (ex. clic sur la barre d'un event futur dans EventRevenueByShopChart en mode predict)
  pendingPredictEventId: null,

  // Timeline
  timelineStartTime: null,
  timelineEndTime: null,

  // Filtres
  filters: DEFAULT_FILTERS(),

  // ---- Buckets agrégés API-shape (cf. plan : first-paint lightweight) ----
  // NB : spaceSummary/menuKpis/eventKpis/costBreakdown supprimés (2026-07-18) —
  // alimentés uniquement par l'action morte loadSpaceLightweight (jamais dispatchée),
  // jamais lus par aucun composant. Cf. fiche bug « chaîne /analyse/* morte ».
  shopSummaries: [],                  // ShopSummary[] (1 par shop)
  spaceMenuByConfig: {},              // configId → SpaceMenu
  shopMenusByShop: {},                // shopId → ShopMenu

  // ---- Caches lazy (lazy-load + invalidation) ----
  timelineCacheByEventId: {},                  // eventId → timelineRecords[]
  predictionCacheByEventConfigKey: {},         // `${eventId}::${configId}::${hash}` → predictionMetrics
  activePredictionVersionByEventId: {},        // eventId → versionId
  // Records PRÉDICTIFS AU GRAIN ARTICLE (shop × menuItem), reconstruits depuis les
  // `predictedRecords` du scénario actif/défaut de chaque event (cf.
  // regeneratePredictions). shopGranularData reste shop-level → sans ce bucket, les
  // vues « Répartition du CA par article » / « Articles du menu par PdV » n'ont
  // aucune dimension article en mode Predict. Vidé par clearPredictions.
  predictScenarioItemRecords: [],

  // Caches
  // (BUG-285 : `transactionRateCache`/`shopPerformanceCache` supprimés — déclarés
  // ici depuis l'origine mais jamais lus ni écrits nulle part.)
  // Cache local des shops NestJS (anciennement dans spaceShops/state, maintenant
  // que ce store est stateless on le garde ici pour les getters synchrones).
  spaceShopsRows: {}, // { [spaceId]: [] }
})

const getters = {
  // Configuration active (objet) ou null
  activeConfiguration(state) {
    const id = state.filters.selectedConfigurationId
    if (!id) return null
    return state.configurations.find((c) => c.id === id) || null
  },

  /**
   * Agrégation per-minute lightweight des records timeline cachés pour un
   * event donné. Source unique pour Analyse / Predict / EventPredict et les
   * futurs consommateurs (export CSV, comparateur de versions, annotations).
   *
   * Usage :
   *   store.getters['analyse/aggregatedTimelineByEvent']({
   *     eventId, bucketMinutes: 15, groupBy: 'global',
   *     range: { start: '19:00', end: '21:00' },
   *     shopIds, productIds, categories,
   *   })
   *
   * @returns {(opts:{
   *   eventId:string,
   *   bucketMinutes?:number,
   *   groupBy?:'global'|'shop'|'product',
   *   range?:{ start:any, end:any },
   *   shopIds?:string[]|string,
   *   productIds?:string[]|string,
   *   categories?:string[]|string,
   * })=>Array<object>}
   */
  aggregatedTimelineByEvent(state) {
    return (opts) => {
      if (!opts || !opts.eventId) return []
      const raw = state.timelineCacheByEventId?.[opts.eventId]
      if (!Array.isArray(raw) || raw.length === 0) return []
      const filter = buildTimelineFilter({
        shopIds: opts.shopIds,
        productIds: opts.productIds,
        categories: opts.categories,
        range: opts.range,
      })
      return aggregateTimeline(raw, {
        bucketMinutes: opts.bucketMinutes || 1,
        groupBy: opts.groupBy || 'global',
        menuItemCostMap: state.menuItemCostMap || {},
        filter,
      })
    }
  },

  // Événements restreints par la configuration choisie. Deux liens possibles :
  //  - la config liste ses events (`cfg.eventIds`), OU
  //  - chaque event porte sa config (`event.configurationId`).
  // On matche les DEUX pour que le filtre Configuration agisse même quand
  // `cfg.eventIds` est vide (cas observé en prod). Fallback non-régressif : si
  // la config n'a AUCUNE association (aucun event matché), on ne filtre pas
  // (évite une page vide trompeuse), comportement historique.
  eventsInActiveConfiguration(state, g) {
    const cfg = g.activeConfiguration
    // Mode union « All Configurations » (aucune config sélectionnée) → tous les events.
    if (!cfg) return state.events
    const ids = new Set(cfg.eventIds || [])
    // Scope STRICT (décision C catalogue-first) : on ne retourne QUE les events
    // rattachés à la config. Plus de fallback « tous les events » : une config sans
    // association → [] → AnalyseView affiche « Aucun event rattaché à cette config ».
    return state.events.filter(
      (e) => ids.has(e.id) || (e.configurationId && e.configurationId === cfg.id),
    )
  },

  // Events « analysables » = scope config (eventsInActiveConfiguration) moins les
  // events à venir en mode analyse (décision 5). Base des OPTIONS de filtres events
  // ET de la liste d'events (panneau gauche). Distinct de filteredEvents (qui applique
  // en plus les sélections multi-critères) → évite qu'un filtre vide ses propres options.
  analysableEvents(state, g) {
    const tb = state.selectedToolbox || 'analyse'
    let evs = g.eventsInActiveConfiguration
    if (tb === 'analyse') {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      evs = evs.filter((e) => {
        const d = eventDateOf(e)
        return !d || d <= today
      })
    }
    return evs
  },

  // Plage de dates effective selon timeRange
  // Plage de dates effective selon timeRange.
  // Étendu pour supporter tous les presets (analyse + predict) cf. React §6.1.
  // En mode 'predict', les presets thismonth/quarter/year vont jusqu'à la
  // fin de la période ; en mode 'analyse', ils s'arrêtent à today.
  dateBounds(state, g, rootState) {
    const { timeRange, startDate, endDate } = state.filters
    if (timeRange === 'custom') {
      return {
        start: startDate ? new Date(startDate) : null,
        end: endDate ? new Date(endDate) : null,
      }
    }
    // Saison (préset dynamique `season:<id>`, module Rapport Saison). Une saison
    // supprimée/inconnue retombe sur « tout l'historique » ({null,null}) et
    // SURTOUT pas sur le `default` du switch (année en cours) — un id orphelin
    // ne doit jamais filtrer silencieusement sur une mauvaise période.
    if (String(timeRange || '').startsWith('season:')) {
      const id = String(timeRange).slice('season:'.length)
      const season = (rootState.seasons?.seasons || []).find((s) => s.id === id)
      if (!season) return { start: null, end: null }
      const start = new Date(season.startDate)
      const end = new Date(season.endDate)
      end.setHours(23, 59, 59, 999)
      return { start, end }
    }
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const eod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59)
    const isPredict = (state.selectedToolbox === 'predict' || state.selectedToolbox === 'event-predict')
    const y = now.getFullYear()
    const m = now.getMonth()
    const q = Math.floor(m / 3)

    switch (timeRange) {
      case 'all':
        return { start: null, end: null }
      case 'today':
        return { start: today, end: eod(today) }
      case 'yesterday': {
        const d = new Date(y, m, now.getDate() - 1)
        return { start: d, end: eod(d) }
      }
      case 'thisweek': {
        const dow = (today.getDay() + 6) % 7 // lundi=0
        const start = new Date(y, m, today.getDate() - dow)
        return { start, end: eod(today) }
      }
      case 'lastweek': {
        const dow = (today.getDay() + 6) % 7
        const start = new Date(y, m, today.getDate() - dow - 7)
        const end = new Date(y, m, today.getDate() - dow - 1)
        return { start, end: eod(end) }
      }
      case 'week': // last 7 days
        return { start: new Date(y, m, today.getDate() - 6), end: eod(today) }
      case 'month': // last 30 days
        return { start: new Date(y, m, today.getDate() - 29), end: eod(today) }
      case 'quarter': // last 90 days
        return { start: new Date(y, m, today.getDate() - 89), end: eod(today) }
      case 'thismonth': {
        const start = new Date(y, m, 1)
        const end = isPredict ? new Date(y, m + 1, 0, 23, 59, 59) : eod(today)
        return { start, end }
      }
      case 'lastmonth': {
        const start = new Date(y, m - 1, 1)
        const end = new Date(y, m, 0, 23, 59, 59)
        return { start, end }
      }
      case 'nextmonth':
        return { start: new Date(y, m + 1, 1), end: new Date(y, m + 2, 0, 23, 59, 59) }
      case 'thisquarter': {
        const start = new Date(y, q * 3, 1)
        const end = isPredict ? new Date(y, q * 3 + 3, 0, 23, 59, 59) : eod(today)
        return { start, end }
      }
      case 'lastquarter': {
        const start = new Date(y, (q - 1) * 3, 1)
        const end = new Date(y, q * 3, 0, 23, 59, 59)
        return { start, end }
      }
      case 'nextquarter':
        return { start: new Date(y, (q + 1) * 3, 1), end: new Date(y, (q + 2) * 3, 0, 23, 59, 59) }
      case 'thisyear': {
        const start = new Date(y, 0, 1)
        const end = isPredict ? new Date(y, 11, 31, 23, 59, 59) : eod(today)
        return { start, end }
      }
      case 'year':
      case 'last_year':
      case 'lastyear':
        return { start: new Date(y - 1, 0, 1), end: new Date(y - 1, 11, 31, 23, 59, 59) }
      case 'nextyear':
        return { start: new Date(y + 1, 0, 1), end: new Date(y + 1, 11, 31, 23, 59, 59) }
      case 'this_year':
      default:
        return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59) }
    }
  },

  // Événements filtrés par tous les critères
  // Cf. React §6.1 : en mode 'analyse', exclure les events futurs (eventDate > today).
  // En mode 'predict', les events futurs sont conservés et alimentent les
  // prédictions.
  filteredEvents(state, g) {
    const {
      selectedEventIds, searchQuery,
      selectedEventCategories, selectedEventTypes, selectedTeams, selectedSponsors,
      selectedSubcategories, selectedSessions, selectedPerformerNames,
      selectedVisitingTeams, selectedOpeningActs,
      selectedDoorsOpenings, selectedShowTimes, selectedIntermissions,
      ticketsSoldRange, ticketsScannedRange,
    } = state.filters
    const { start, end } = g.dateBounds
    // Base = events analysables (scope config + non-futurs). Les sélections
    // multi-critères ci-dessous s'appliquent par-dessus.
    let events = g.analysableEvents

    if (selectedEventIds.length) {
      const set = new Set(selectedEventIds)
      events = events.filter((e) => set.has(e.id))
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      events = events.filter((e) => e.name?.toLowerCase().includes(q))
    }
    if (start || end) {
      events = events.filter((e) => {
        // Robuste aux deux champs (`date` / `eventDate`) et formats (ISO / DD/MM/YYYY),
        // comme `analysableEvents`. Avec `e.date` brut, un event ne portant que
        // `eventDate` passait toujours → preset de dates sans effet.
        const d = eventDateOf(e)
        if (!d) return true
        if (start && d < start) return false
        if (end && d > end) return false
        return true
      })
    }

    // Filtres catégories (chaque filtre est un Set, si non vide on intersecte)
    const multi = [
      [selectedEventCategories, 'category'],
      [selectedEventTypes, 'eventType'],
      [selectedTeams, 'team'],
      [selectedSponsors, 'sponsor'],
      [selectedSubcategories, 'subcategory'],
      [selectedSessions, 'session'],
      [selectedPerformerNames, 'performer'],
      [selectedVisitingTeams, 'visitingTeam'],
      [selectedOpeningActs, 'openingAct'],
      [selectedDoorsOpenings, 'doorsOpening'],
      [selectedShowTimes, 'showTime'],
    ]
    for (const [arr, key] of multi) {
      if (arr.length) {
        const set = new Set(arr)
        events = events.filter((e) => set.has(e[key]))
      }
    }

    // Intermission (binaire yes/no, cf. React selectedIntermissions)
    if (selectedIntermissions.length) {
      const set = new Set(selectedIntermissions)
      events = events.filter((e) => set.has(e.hasIntermission ? 'yes' : 'no'))
    }

    // Ranges
    events = events.filter((e) => {
      const sold = e.ticketsSold ?? e.attendees ?? 0
      const scanned = e.ticketsScanned ?? sold
      if (sold < ticketsSoldRange[0] || sold > ticketsSoldRange[1]) return false
      if (scanned < ticketsScannedRange[0] || scanned > ticketsScannedRange[1]) return false
      return true
    })

    return events
  },

  // Lignes granulaires filtrées
  // Records réconciliés : dimensions (identité item, catégorie, type, PdV) résolues
  // en cascade catalogue DataFriday → champs backend → produit Weezevent
  // (nature/subnature) → sentinelle UNATTACHED_*_KEY. Enrichissement pur.
  // Recalculé uniquement quand shopGranularData / catalogue / contexte config
  // changent (PAS à chaque filtre) → mis en cache par Vuex.
  reconciledShopGranularData(state) {
    const records = state.shopGranularData || []
    if (!records.length) return records
    const ctx = buildReconciliationContext({
      menuItems: state.menuItems || [],
      productCategories: state.productCategoriesList || [],
      productTypes: state.productTypesList || [],
      floorElements: state.configShopContext?.floorElements || [],
      assignment: state.configShopContext?.assignment || null,
      assignmentItemsByShop: state.configShopContext?.assignmentItemsByShop || null,
      weezeventProducts: state.weezeventProducts || [],
    })
    const _t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const out = records.map((r) => reconcileRecord(r, ctx))
    const _dt = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t0
    if (_dt > 100) console.log(`[perf] reconcile ${records.length} records en ${Math.round(_dt)}ms`)
    return out
  },

  filteredShopGranularData(state, g) {
    const eventIds = new Set(g.filteredEvents.map((e) => e.id))
    const {
      selectedShopIds, selectedShopTypes, selectedShopAreas,
      selectedMenuItemIds, selectedMenuItemTypes, selectedMenuItemCategories,
      selectedTimeRange,
    } = state.filters
    // Plage horaire issue de la timeline (drag-range sur le graphe intra-event).
    // Les records réels de l'API ont un champ `minute` (timestamp ISO complet),
    // pas un champ `hour` entier (celui-ci était réservé aux mocks).
    // On convertit selectedTimeRange ("HH:MM") en minutes depuis minuit pour
    // comparer avec l'heure extraite du timestamp `r.minute`.
    let timeStartMinutes = null
    let timeEndMinutes = null
    const parseHHMM = (s) => {
      if (!s) return null
      const parts = String(s).split(':')
      const h = Number(parts[0])
      const m = Number(parts[1] || 0)
      return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : null
    }
    if (selectedTimeRange && (selectedTimeRange.start || selectedTimeRange.end)) {
      timeStartMinutes = parseHHMM(selectedTimeRange.start)
      timeEndMinutes   = parseHHMM(selectedTimeRange.end)
    }
    // Filtres shop/item stockent des NOMS ; la liste d'options vient désormais du
    // catalogue (element.name) qui peut différer du shopName ventes par casse/accent.
    // On compare en NORMALISÉ des deux côtés (même clé que la réconciliation).
    const shopNameSet = selectedShopIds.length ? new Set(selectedShopIds.map((s) => normalizeStr(s))) : null
    const itemNameSet = selectedMenuItemIds.length ? new Set(selectedMenuItemIds.map((s) => normalizeStr(s))) : null
    // Cascade fidèle à React : si on a des events dans le store mais qu'aucun
    // ne passe les filtres, on retourne 0 records (sinon les sliders Affluence
    // n'auraient aucun effet visible). Pendant le loading state.events est []
    // donc on laisse passer pour ne pas masquer le skeleton.
    const hasEvents = state.events.length > 0
    // Mode predict : "predictive-preferred" — pour un event qui a des records
    // prédictifs (futur OU passé avec scénario), on masque ses records RÉELS
    // (sinon double comptage barre/KPI : actuel + prédit). Les autres events
    // (sans scénario) gardent leurs records réels.
    const isPredict =
      state.selectedToolbox === 'predict' || state.selectedToolbox === 'event-predict'
    let eventsWithPredictive = null
    if (isPredict) {
      eventsWithPredictive = new Set()
      for (const r of g.reconciledShopGranularData) {
        if (r && r.isPredictive && r.eventId) eventsWithPredictive.add(r.eventId)
      }
    }
    return g.reconciledShopGranularData.filter((r) => {
      if (isPredict && eventsWithPredictive.has(r.eventId) && !r.isPredictive) return false
      if (hasEvents && !eventIds.has(r.eventId)) return false
      if (shopNameSet && !shopNameSet.has(normalizeStr(r.shopName))) return false
      if (selectedShopTypes.length && !selectedShopTypes.includes(resolveShopType(r))) return false
      if (selectedShopAreas.length && !selectedShopAreas.includes(r.shopArea)) return false
      // Filtre article : ne s'applique qu'aux records qui PORTENT un nom d'article.
      // shopGranularData (shop-details) est shop-level → resolveItemName='' partout ;
      // sans ce garde-fou, sélectionner un article vide TOUTES les vues shop-level
      // (« No revenue data by shop available »). Le filtre article agit réellement
      // sur les sources item-level (event-timeline : AnalyseView.itemLevelRecords).
      if (itemNameSet) {
        const itemNm = resolveItemName(r)
        if (itemNm && !itemNameSet.has(normalizeStr(itemNm))) return false
      }
      // Type/catégorie = vrai catalogue (menuItemType/Category reconciliés via mapping
      // Weezevent), repli bucket classifieur quand le produit n'est pas mappé. Même
      // résolveur que les donuts/getters → clic-pour-filtrer cohérent.
      if (selectedMenuItemTypes.length && !selectedMenuItemTypes.includes(resolveItemType(r))) return false
      if (selectedMenuItemCategories.length && !selectedMenuItemCategories.includes(resolveItemCategory(r))) return false
      // Filtre plage horaire : compare en minutes depuis minuit.
      // Supporte r.minute (timestamp ISO réel) et r.hour (entier, anciens mocks).
      if (timeStartMinutes !== null || timeEndMinutes !== null) {
        let recordMinutes
        if (r.minute) {
          const d = new Date(r.minute)
          recordMinutes = d.getHours() * 60 + d.getMinutes()
        } else if (typeof r.hour === 'number') {
          recordMinutes = r.hour * 60
        } else {
          // Pas de timestamp → on ne filtre pas ce record
          recordMinutes = null
        }
        if (recordMinutes !== null) {
          if (timeStartMinutes !== null && recordMinutes < timeStartMinutes) return false
          if (timeEndMinutes   !== null && recordMinutes > timeEndMinutes)   return false
        }
      }
      return true
    })
  },

  // ============================
  // Options DATA-DRIVEN — dérivées des VENTES (records réconciliés), parité React
  // (`uniqueShops`/`uniqueMenuItems` depuis shopGranularData, AnalyseView.tsx L5081+).
  // La config ne pilote plus les listes : elle ne restreint que les EVENTS
  // (analysableEvents). Tout ce qui est vendu apparaît.
  // ============================
  // Base des options : records réconciliés scopés aux events analysables (passés en
  // mode analyse, scope config éventuel) — PAS aux sélections utilisateur, sinon les
  // options se réduiraient à la sélection courante. Garde hasEvents : pendant le
  // loading, state.events est vide → on ne masque pas le skeleton.
  optionsBaseRecords(state, g) {
    const ids = new Set((g.analysableEvents || []).map((e) => e.id))
    const hasEvents = (state.events || []).length > 0
    if (!hasEvents) return g.reconciledShopGranularData || []
    return (g.reconciledShopGranularData || []).filter((r) => ids.has(r.eventId))
  },
  salesShopNames(state, g) {
    return [...new Set(g.optionsBaseRecords.map((r) => r?.shopName).filter(Boolean))].sort()
  },
  salesShopTypes(state, g) {
    const out = new Set()
    for (const r of g.optionsBaseRecords) {
      // MÊME résolveur que le donut « By POS type » → clic-pour-filtrer cohérent.
      // Sentinelles exclues des OPTIONS (les donuts gardent leur bucket gris).
      const t = resolveShopType(r)
      if (t && t !== UNATTACHED_SHOP_KEY && t !== OTHER_SHOP_TYPE) out.add(t)
    }
    return [...out].sort()
  },
  salesShopAreas(state, g) {
    return [...new Set(g.optionsBaseRecords.map((r) => r?.shopArea).filter(Boolean))].sort()
  },
  // Items assignés aux PdV de la config = OBJETS getShopMenus ({id,name,category}),
  // dédupliqués, enrichis depuis le catalogue (state.menuItems) par id OU par nom pour
  // les dims type/catégorie. Source UNIQUE des options article + dims (robuste id-space).
  catalogAssignedItems(state, g) {
    const byCatId = new Map((state.menuItems || []).map((mi) => [String(mi?.id), mi]))
    const byCatName = new Map((state.menuItems || []).map((mi) => [normalizeStr(mi?.name), mi]))
    const itemsByShop = state.configShopContext?.assignmentItemsByShop
    const out = new Map()
    if (itemsByShop instanceof Map) {
      for (const items of itemsByShop.values()) {
        for (const it of items || []) {
          const id = String(it?.id ?? '')
          const key = id || normalizeStr(it?.name)
          if (!key || out.has(key)) continue
          const catalog = byCatId.get(id) || byCatName.get(normalizeStr(it?.name)) || null
          out.set(key, { id, name: it?.name, category: it?.category || '', catalog })
        }
      }
    }
    // Repli configs spatiales (assignation Edge par ids, items dans le catalogue).
    if (!out.size) {
      for (const id of g.catalogAssignedMenuItemIds) {
        const mi = byCatId.get(String(id))
        if (mi) out.set(String(id), { id: String(id), name: mi.name, category: '', catalog: mi })
      }
    }
    return [...out.values()]
  },
  catalogMenuItems(state, g) {
    return g.catalogAssignedItems.map((it) => it.catalog || it)
  },
  // « Menu Items by POS » : PdV = MÊME source/logique que l'écran Space Menus LIVE
  // (SpaceMenuView.loadShopsForSpace, cible du lien « Manage Menus ») → `spaceShops/forSpace`
  // filtré par `shop.configId`. Ces configs Auxerre sont des imports weezevent SANS floor
  // elements `type:'shop'` → les PdV réels (1B, 6B, BAR EPHEMERE) sont les rows spaceShops,
  // distingués par leur `configId`. Mono-config → `configId === config courant`. « All
  // Configurations » → UNION des shops dont `configId ∈ state.configurations` (vraies configs) :
  // un shop tagué sur un configId orphelin/inconnu, ou SANS configId, est exclu (c'est ce qui
  // ne « correspond à aucune config »). Articles joints via assignmentItemsByShop (clé name).
  assignedItemsPerShopElement(state) {
    const spaceId = String(state.spaceId || state.space?.id || '')
    const allShops = (state.spaceShopsRows?.[spaceId]) || []
    const sel = state.filters?.selectedConfigurationId
    const isAll = !sel || sel === 'cfg-all'
    const realConfigIds = new Set(
      (state.configurations || [])
        .filter((c) => c?.id && c.id !== 'cfg-all')
        .map((c) => String(c.id)),
    )
    const shopConfigId = (s) => String(s?.configId ?? s?._raw?.configId ?? '')
    // Filtre IDENTIQUE à SpaceMenuView : strict par configId (union sur les vraies configs).
    const seen = new Set()
    const shopsInScope = []
    for (const s of allShops) {
      const cid = shopConfigId(s)
      if (!cid) continue
      if (isAll ? !realConfigIds.has(cid) : cid !== String(sel)) continue
      const key = normalizeStr(s?.name ?? s?.shopName)
      if (!key || seen.has(key)) continue
      seen.add(key)
      shopsInScope.push(s)
    }
    const rawByShop = state.configShopContext?.assignmentItemsByShop
    const byShop = rawByShop instanceof Map ? rawByShop : new Map()
    const byCatId = new Map((state.menuItems || []).map((mi) => [String(mi?.id), mi]))
    const byCatName = new Map((state.menuItems || []).map((mi) => [normalizeStr(mi?.name), mi]))
    return shopsInScope.map((s) => {
      const name = s?.name ?? s?.shopName ?? ''
      const shopKey = normalizeStr(name)
      const raw = byShop.get(shopKey) || []
      const items = raw.map((it) => {
        const id = String(it?.id ?? '')
        const catalog = byCatId.get(id) || byCatName.get(normalizeStr(it?.name)) || null
        return {
          id,
          name: it?.name || catalog?.name || '',
          category: it?.category || catalog?.category || '',
          picture: catalog?.picture || null,
        }
      })
      const st = s?.shopType ?? s?.type ?? null
      return {
        elementId: String(s?.id ?? s?._id ?? s?.shopId ?? shopKey),
        shopName: name,
        shopKey,
        shopType: Array.isArray(st) ? st.join(',') : (st || null),
        area: s?.locationName ?? s?.area ?? s?.zone ?? s?.floorName ?? '',
        assignedItems: items,
      }
    })
  },
  // Catalogue COMPLET de l'espace = TOUS les menu items du space (pas seulement ceux
  // assignés à un PdV de la config). Alimente les OPTIONS des filtres latéraux (articles
  // / types / catégories) → l'utilisateur peut filtrer sur n'importe quel article dispo
  // pour ce space. `state.menuItems` est tagué `spaceIds` par useSpaceData ; on garde
  // les items du space courant (+ non tagués, attribués au space par défaut).
  spaceCatalogItems(state) {
    const sid = String(state.spaceId || state.space?.id || '')
    return (state.menuItems || []).filter((mi) => {
      if (!sid) return true
      const ids = mi?.spaceIds
      if (!Array.isArray(ids) || ids.length === 0) return true
      return ids.map(String).includes(sid)
    })
  },
  // Options du filtre articles = items ASSIGNÉS à un PdV de la config ET VENDUS dans le
  // périmètre (catalogSoldOptions, remonté par AnalyseView depuis le dataset item-level).
  // Repli quand l'item-level n'a pas encore chargé : items ASSIGNÉS (catalogMenuItems,
  // déjà scopé config) — JAMAIS le catalogue complet du space (spaceCatalogItems). Garde
  // filtres ⊆ graphes/KPI (décision user : sélectionner un article ne doit jamais donner
  // un graphe vide).
  // ⚠️ clé state = `soldItemOptions` (remontée par setSoldItemOptions). L'ancien
  // nom `catalogSoldOptions` n'a JAMAIS existé dans le state → les options
  // vendues n'atteignaient jamais ces getters (repli assignés permanent).
  catalogMenuItemNames(state, g) {
    const sold = state.soldItemOptions?.names || []
    if (sold.length) return [...new Set(sold.filter(Boolean))].sort()
    return [...new Set(g.catalogMenuItems.map((mi) => mi?.name).filter(Boolean))].sort()
  },
  catalogMenuItemTypes(state, g) {
    const sold = state.soldItemOptions?.types || []
    if (sold.length) return [...new Set(sold.filter(Boolean))].sort()
    const catById = new Map((state.productCategoriesList || []).map((c) => [String(c?.id), c]))
    const typeById = new Map((state.productTypesList || []).map((t) => [String(t?.id), t]))
    const out = new Set()
    for (const mi of g.catalogMenuItems) {
      const { type } = resolveCatalogDims(mi, catById, typeById)
      if (type) out.add(type)
    }
    return [...out].sort()
  },
  catalogMenuItemCategories(state, g) {
    const sold = state.soldItemOptions?.categories || []
    if (sold.length) return [...new Set(sold.filter(Boolean))].sort()
    const catById = new Map((state.productCategoriesList || []).map((c) => [String(c?.id), c]))
    const typeById = new Map((state.productTypesList || []).map((t) => [String(t?.id), t]))
    const out = new Set()
    for (const mi of g.catalogMenuItems) {
      const { category } = resolveCatalogDims(mi, catById, typeById)
      if (category) out.add(category)
    }
    return [...out].sort()
  },
  // Options ARTICLES des filtres latéraux — noms consommés par useFilters /
  // pruneFiltersToOptions / AnalyseView. Data-driven STRICT (contrat refonte,
  // cf. analyseStore.spec) : articles VENDUS dans le scope (soldItemOptions),
  // SANS repli sur les assignés — les options reflètent les ventes affichées,
  // jamais le catalogue. Ces getters manquaient (jamais définis après la
  // refonte) → options articles/types/catégories = undefined dans le panneau.
  salesMenuItemNames(state) {
    return [...new Set((state.soldItemOptions?.names || []).filter(Boolean))].sort()
  },
  salesMenuItemTypes(state) {
    return [...new Set((state.soldItemOptions?.types || []).filter(Boolean))].sort()
  },
  salesMenuItemCategories(state) {
    return [...new Set((state.soldItemOptions?.categories || []).filter(Boolean))].sort()
  },
  // État global des filtres pour piloter l'UI (loading/empty/error explicites).
  // Recâblé sur les SOURCES RÉELLES des options du panneau (getters sales*,
  // data-driven) — l'ancien code testait `catalogShopElements`, getter supprimé
  // par la refonte 2026-07-02 → undefined → jamais `ready` → le panneau affichait
  // en permanence « Failed to load the catalog » alors que tout était chargé.
  // Le contexte config (floors + assignation) n'est qu'un ENRICHISSEMENT : ses
  // états error/loading ne concernent le panneau que pour une config PRÉCISE.
  // Sous « All Configurations », l'union est différée (post-rendu) et ne doit
  // jamais afficher d'échec ni bloquer les filtres (options = ventes).
  filtersState(state, g) {
    const cfg = state.filters?.selectedConfigurationId
    const hasCfg = !!cfg && cfg !== 'cfg-all'
    if (hasCfg && state.configContextError) return 'error'
    if (hasCfg && state.configContextLoading) return 'loading'
    // Phase 1 (espace) → spinner. Phase 2 (enrichissement) → spinner UNIQUEMENT
    // tant qu'aucun record n'est là (sinon la data affichée suffit au panneau).
    if (state.loading) return 'loading'
    if (state.enriching && !(state.shopGranularData || []).length) return 'loading'
    // Options vides PENDANT un chargement = pas encore arrivées, pas « rien à
    // afficher » → spinner. Deux chargements concernés : la phase 2 (`enriching`)
    // et le fetch item-level hors store (`soldItemOptionsLoading`, qui alimente
    // salesMenuItem* et tourne APRÈS la fin de la phase 2). Avant : « Aucun
    // article disponible pour cette configuration. » s'affichait pendant que les
    // donuts et la table articles chargeaient encore — message mensonger.
    const busy = state.enriching || state.soldItemOptionsLoading
    if (!(g.salesShopNames || []).length) return busy ? 'loading' : 'empty-no-shops'
    if (!(g.salesMenuItemNames || []).length) return busy ? 'loading' : 'empty-no-items'
    return 'ready'
  },

  // Options events — dérivées des events ANALYSABLES (scope config + non-futurs),
  // pas de tous les state.events, pour rester cohérent avec le scope catalogue-first.
  uniqueEventCategories(state, g) {
    return [...new Set(g.analysableEvents.map((e) => e.category).filter(Boolean))].sort()
  },
  uniqueEventTypes(state, g) {
    return [...new Set(g.analysableEvents.map((e) => e.eventType).filter(Boolean))].sort()
  },
  uniqueTeams(state, g) {
    return [...new Set(g.analysableEvents.map((e) => e.team).filter(Boolean))].sort()
  },
  uniqueSponsors(state, g) {
    return [...new Set(g.analysableEvents.map((e) => e.sponsor).filter(Boolean))].sort()
  },

  // ============================
  // Filtres avancés additionnels (cf. React §6.1 — apply­AdvancedFilters)
  // ============================
  uniqueSubcategories(state, g) {
    return [...new Set(g.analysableEvents.map((e) => e.subcategory).filter(Boolean))].sort()
  },
  uniqueSessions(state, g) {
    return [...new Set(g.analysableEvents.map((e) => e.session).filter(Boolean))].sort()
  },
  uniqueDoorsOpenings(state, g) {
    return [...new Set(g.analysableEvents.map((e) => e.doorsOpening).filter(Boolean))].sort()
  },
  uniqueShowTimes(state, g) {
    return [...new Set(g.analysableEvents.map((e) => e.showTime).filter(Boolean))].sort()
  },
  uniquePerformers(state, g) {
    return [...new Set(g.analysableEvents.map((e) => e.performer).filter(Boolean))].sort()
  },
  uniqueVisitingTeams(state, g) {
    return [...new Set(g.analysableEvents.map((e) => e.visitingTeam).filter(Boolean))].sort()
  },
  uniqueOpeningActs(state, g) {
    return [...new Set(g.analysableEvents.map((e) => e.openingAct).filter(Boolean))].sort()
  },

  // Helpers de catégorie pour le rendu conditionnel des filtres avancés
  // (cf. React : performer/openingAct → catégorie Entertainment ;
  // visitingTeam → catégorie Sports ; sponsor → catégorie Tradeshow).
  hasEntertainmentCategory(state, g) {
    return g.analysableEvents.some((e) =>
      /entertainment|concert|spectacle|show/i.test(String(e.category || ''))
    )
  },
  hasSportsCategory(state, g) {
    return g.analysableEvents.some((e) =>
      /sport|home team|match/i.test(String(e.category || ''))
    )
  },
  hasTradeshowCategory(state, g) {
    return g.analysableEvents.some((e) =>
      /tradeshow|salon|conference|mice/i.test(String(e.category || ''))
    )
  },

  // Bornes attendance (pour configurer les sliders)
  attendanceBounds(state) {
    let minSold = Infinity
    let maxSold = 0
    let minScanned = Infinity
    let maxScanned = 0
    for (const e of state.events) {
      const s = e.ticketsSold ?? e.attendees ?? 0
      const sc = e.ticketsScanned ?? e.attendees ?? 0
      minSold = Math.min(minSold, s)
      maxSold = Math.max(maxSold, s)
      minScanned = Math.min(minScanned, sc)
      maxScanned = Math.max(maxScanned, sc)
    }
    return {
      soldMin: Number.isFinite(minSold) ? minSold : 0,
      soldMax: Math.max(maxSold, 1000),
      scannedMin: Number.isFinite(minScanned) ? minScanned : 0,
      scannedMax: Math.max(maxScanned, 1000),
    }
  },

  activeFilterChips(state, g, rootState) {
    const chips = []
    const { filters } = state
    // Préfixes de chips traduits (locale courante). Note : getter non réactif au
    // changement de locale à chaud — recalculé au prochain changement de filtre.
    const T = (k) => translate(k, getCurrentLocale())
    if (filters.selectedConfigurationId && g.activeConfiguration) {
      chips.push({
        key: 'selectedConfigurationId',
        label: `${T('anConfiguration')}: ${g.activeConfiguration.name}`,
        clearValue: null,
      })
    }
    // selectedEventIds : PAS de chip ici — FilterSummary a son chip dédié
    // (chip-events, prop events-count = vraie sélection) avec style + handler propres.
    if (filters.selectedShopIds.length)
      chips.push({ key: 'selectedShopIds', label: `${filters.selectedShopIds.length} ${T('anShops')}` })
    if (filters.selectedShopTypes.length)
      chips.push({ key: 'selectedShopTypes', label: `${T('anTypes')}: ${filters.selectedShopTypes.join(', ')}` })
    if (filters.selectedShopAreas.length)
      chips.push({ key: 'selectedShopAreas', label: `${T('anZones')}: ${filters.selectedShopAreas.join(', ')}` })
    if (filters.selectedMenuItemTypes.length)
      chips.push({ key: 'selectedMenuItemTypes', label: `${T('anItemType')}: ${filters.selectedMenuItemTypes.join(', ')}` })
    if (filters.selectedMenuItemCategories.length)
      chips.push({ key: 'selectedMenuItemCategories', label: `${T('anCategory')}: ${filters.selectedMenuItemCategories.join(', ')}` })
    if (filters.selectedEventCategories.length)
      chips.push({ key: 'selectedEventCategories', label: `${T('anEventCategory')}: ${filters.selectedEventCategories.join(', ')}` })
    if (filters.selectedEventTypes.length)
      chips.push({ key: 'selectedEventTypes', label: `${T('anEventType')}: ${filters.selectedEventTypes.join(', ')}` })
    if (filters.selectedTeams.length)
      chips.push({ key: 'selectedTeams', label: `${T('anTeam')}: ${filters.selectedTeams.join(', ')}` })
    if (filters.selectedSponsors.length)
      chips.push({ key: 'selectedSponsors', label: `${T('anSponsor')}: ${filters.selectedSponsors.join(', ')}` })
    if (filters.selectedSubcategories.length)
      chips.push({ key: 'selectedSubcategories', label: `${T('anSubcategory')}: ${filters.selectedSubcategories.join(', ')}` })
    if (filters.selectedSessions.length)
      chips.push({ key: 'selectedSessions', label: `${T('anSessions')}: ${filters.selectedSessions.join(', ')}` })
    if (filters.selectedDoorsOpenings.length)
      chips.push({ key: 'selectedDoorsOpenings', label: `${T('anDoorsOpening')}: ${filters.selectedDoorsOpenings.join(', ')}` })
    if (filters.selectedShowTimes.length)
      chips.push({ key: 'selectedShowTimes', label: `${T('anShowTime')}: ${filters.selectedShowTimes.join(', ')}` })
    if (filters.selectedPerformerNames.length)
      chips.push({ key: 'selectedPerformerNames', label: `${T('anPerformer')}: ${filters.selectedPerformerNames.join(', ')}` })
    if (filters.selectedVisitingTeams.length)
      chips.push({ key: 'selectedVisitingTeams', label: `${T('anVisitingTeam')}: ${filters.selectedVisitingTeams.join(', ')}` })
    if (filters.selectedOpeningActs.length)
      chips.push({ key: 'selectedOpeningActs', label: `${T('anOpeningAct')}: ${filters.selectedOpeningActs.join(', ')}` })
    if (filters.selectedIntermissions.length)
      chips.push({ key: 'selectedIntermissions', label: `${T('anIntermission')}: ${filters.selectedIntermissions.map((v) => v === 'yes' ? T('anYes') : T('anNo')).join(', ')}` })
    // Filtre de période (preset dates, ex. « Année dernière ») : chip visible dès
    // que le preset diffère du défaut, sinon le filtre est invisible dans le
    // bandeau et « Tout effacer » semble ne pas agir dessus. clearValue = défaut.
    const defaultTimeRange = DEFAULT_FILTERS().timeRange
    if (filters.timeRange && filters.timeRange !== defaultTimeRange) {
      // Saison (`season:<id>`) : libellé = nom de la saison (store seasons).
      const seasonId = String(filters.timeRange).startsWith('season:')
        ? String(filters.timeRange).slice('season:'.length)
        : null
      const seasonName = seasonId
        ? (rootState.seasons?.seasons || []).find((s) => s.id === seasonId)?.name || seasonId
        : null
      const rangeLabel = seasonName
        || (PRESET_I18N_KEYS[filters.timeRange] && T(PRESET_I18N_KEYS[filters.timeRange]))
        || DATE_RANGE_LABEL_FR_MAP[filters.timeRange]
        || PREDICT_DATE_RANGE_LABEL_FR_MAP[filters.timeRange]
        || filters.timeRange
      const label = filters.timeRange === 'custom'
        ? `${T('anChipDates')} : ${filters.startDate || '—'} → ${filters.endDate || '—'}`
        : `${T('anPeriod')} : ${rangeLabel}`
      chips.push({ key: 'timeRange', label, clearValue: defaultTimeRange })
    }
    if (filters.selectedTimeRange && (filters.selectedTimeRange.start || filters.selectedTimeRange.end)) {
      const s = filters.selectedTimeRange.start || '—'
      const e = filters.selectedTimeRange.end || '—'
      chips.push({
        key: 'selectedTimeRange',
        label: `${T('anChipTimeRange')} : ${s} → ${e}`,
        clearValue: { start: null, end: null },
      })
    }
    return chips
  },

  // ============================
  // Comparaisons Précédent / N-1 — parité versionReact (AnalyseView.tsx
  // getPreviousPeriodRange, l.7811-8042) :
  // - 'all' (Tout l'historique) → bornes NULLES = comparaison désactivée
  //   (le toggle est masqué côté UI) ;
  // - « Précédent » = PÉRIODE CIVILE précédente par preset (Ce mois → mois
  //   dernier entier, Cette année → mêmes jours écoulés N-1, …) ; custom et
  //   presets glissants (7/30/90 j) = décalage de la durée avec 1 jour d'écart ;
  // - N-1 = bornes courantes décalées de setFullYear(-1).
  // ============================
  previousPeriodBounds(state, g) {
    const { start, end } = g.dateBounds || {}
    if (!start || !end) return { start: null, end: null }
    const day = (d) => {
      const s = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
      const e = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
      return { start: s, end: e }
    }
    const span = (s, e) => ({
      start: new Date(s.getFullYear(), s.getMonth(), s.getDate(), 0, 0, 0, 0),
      end: new Date(e.getFullYear(), e.getMonth(), e.getDate(), 23, 59, 59, 999),
    })
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const y = now.getFullYear()
    const m = now.getMonth()
    const q = Math.floor(m / 3)
    const dow = (today.getDay() + 6) % 7 // lundi = 0

    switch (state.filters.timeRange) {
      case 'today':
        return day(new Date(y, m, now.getDate() - 1))
      case 'yesterday':
        return day(new Date(y, m, now.getDate() - 2))
      case 'thisweek': // semaine dernière ENTIÈRE (lun → dim)
        return span(new Date(y, m, today.getDate() - dow - 7), new Date(y, m, today.getDate() - dow - 1))
      case 'lastweek': // semaine encore avant
        return span(new Date(y, m, today.getDate() - dow - 14), new Date(y, m, today.getDate() - dow - 8))
      case 'week': // les 7 jours d'avant
        return span(new Date(y, m, today.getDate() - 13), new Date(y, m, today.getDate() - 7))
      case 'month': // les 30 jours d'avant
        return span(new Date(y, m, today.getDate() - 59), new Date(y, m, today.getDate() - 30))
      case 'quarter': // les 90 jours d'avant
        return span(new Date(y, m, today.getDate() - 179), new Date(y, m, today.getDate() - 90))
      case 'thismonth': // mois dernier ENTIER
        return span(new Date(y, m - 1, 1), new Date(y, m, 0))
      case 'lastmonth': // mois encore avant
        return span(new Date(y, m - 2, 1), new Date(y, m - 1, 0))
      case 'thisquarter': // trimestre dernier ENTIER
        return span(new Date(y, (q - 1) * 3, 1), new Date(y, q * 3, 0))
      case 'lastquarter': // trimestre encore avant
        return span(new Date(y, (q - 2) * 3, 1), new Date(y, (q - 1) * 3, 0))
      case 'thisyear': {
        // Mêmes jours écoulés l'an dernier (parité React l.7982-7986).
        const daysSoFar = Math.floor((today.getTime() - new Date(y, 0, 1).getTime()) / 86400000)
        return span(new Date(y - 1, 0, 1), new Date(y - 1, 0, 1 + daysSoFar))
      }
      case 'year':
      case 'last_year':
      case 'lastyear': // année dernière → année d'encore avant, entière
        return span(new Date(y - 2, 0, 1), new Date(y - 2, 11, 31))
      case 'custom':
      default: {
        // Décalage de la durée, avec 1 jour d'écart (parité React l.7842-7849).
        const duration = end.getTime() - start.getTime()
        const prevEnd = new Date(start.getTime() - 86400000)
        prevEnd.setHours(23, 59, 59, 999)
        const prevStart = new Date(prevEnd.getTime() - duration)
        prevStart.setHours(0, 0, 0, 0)
        return { start: prevStart, end: prevEnd }
      }
    }
  },
  yearOverYearBounds(state, g) {
    const { start, end } = g.dateBounds || {}
    if (!start || !end) return { start: null, end: null }
    const ys = new Date(start)
    ys.setFullYear(ys.getFullYear() - 1)
    const ye = new Date(end)
    ye.setFullYear(ye.getFullYear() - 1)
    return { start: ys, end: ye }
  },

  // Events qui passent tous les filtres SAUF la date.
  // Sert de base pour reconstruire les events de la période précédente / N-1
  // en réappliquant uniquement le filtre date sur la fenêtre voulue.
  eventsMatchingFiltersExceptDate(state, g) {
    const {
      selectedEventIds, searchQuery,
      selectedEventCategories, selectedEventTypes, selectedTeams, selectedSponsors,
      selectedSubcategories, selectedSessions, selectedPerformerNames,
      selectedVisitingTeams, selectedOpeningActs,
      selectedDoorsOpenings, selectedShowTimes, selectedIntermissions,
      ticketsSoldRange, ticketsScannedRange,
    } = state.filters
    let events = g.eventsInActiveConfiguration

    if (selectedEventIds.length) {
      const set = new Set(selectedEventIds)
      events = events.filter((e) => set.has(e.id))
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      events = events.filter((e) => e.name?.toLowerCase().includes(q))
    }
    const multi = [
      [selectedEventCategories, 'category'],
      [selectedEventTypes, 'eventType'],
      [selectedTeams, 'team'],
      [selectedSponsors, 'sponsor'],
      [selectedSubcategories, 'subcategory'],
      [selectedSessions, 'session'],
      [selectedPerformerNames, 'performer'],
      [selectedVisitingTeams, 'visitingTeam'],
      [selectedOpeningActs, 'openingAct'],
      [selectedDoorsOpenings, 'doorsOpening'],
      [selectedShowTimes, 'showTime'],
    ]
    for (const [arr, key] of multi) {
      if (arr.length) {
        const set = new Set(arr)
        events = events.filter((e) => set.has(e[key]))
      }
    }
    if (selectedIntermissions.length) {
      const set = new Set(selectedIntermissions)
      events = events.filter((e) => set.has(e.hasIntermission ? 'yes' : 'no'))
    }
    return events.filter((e) => {
      const sold = e.ticketsSold ?? e.attendees ?? 0
      const scanned = e.ticketsScanned ?? sold
      if (sold < ticketsSoldRange[0] || sold > ticketsSoldRange[1]) return false
      if (scanned < ticketsScannedRange[0] || scanned > ticketsScannedRange[1]) return false
      return true
    })
  },

  // Totaux KPI sur la période courante (depuis filteredEvents/filteredShopGranularData)
  currentPeriodTotals(state, g) {
    const ids = new Set(g.filteredEvents.map((e) => e.id))
    return totalsForEventIds(g.filteredEvents, g.filteredShopGranularData, state.menuItemCostMap, ids)
  },

  // Agrégats par événement en une passe sur les records filtrés.
  // Utilisé par les modales KPI/charts pour éviter le pattern coûteux
  // records.filter(eventId) répété pour chaque event.
  filteredEventAggregates(state, g) {
    const byEvent = new Map()
    const costMap = state.menuItemCostMap || {}

    for (const e of g.filteredEvents || []) {
      byEvent.set(e.id, {
        eventId: e.id,
        eventName: e.name || e.eventName || e.id,
        eventDate: e.date || e.eventDate || null,
        attendees: e.ticketsScanned ?? e.attendees ?? e.ticketsSold ?? 0,
        revenue: 0,
        cost: 0,
        margin: 0,
        transactions: 0,
        quantity: 0,
      })
    }

    for (const r of g.filteredShopGranularData || []) {
      if (!r?.eventId) continue
      const event = byEvent.get(r.eventId)
      if (!event) continue
      const revenue = r.revenue || 0
      const quantity = r.quantity || 0
      event.revenue += revenue
      event.cost += (costMap[r.menuItemId] || 0) * quantity
      event.transactions += r.transactionCount || 0
      event.quantity += quantity
      if (!event.eventName && r.eventName) event.eventName = r.eventName
      if (!event.eventDate && r.eventDate) event.eventDate = r.eventDate
    }

    return Array.from(byEvent.values()).map((e) => ({
      ...e,
      margin: e.revenue ? ((e.revenue - e.cost) / e.revenue) * 100 : 0,
      avgTransaction: e.transactions ? e.revenue / e.transactions : 0,
      perCap: e.attendees ? e.revenue / e.attendees : 0,
      transferRate: e.attendees ? (e.transactions / e.attendees) * 100 : 0,
    }))
  },

  // Totaux KPI sur la période précédente (même durée, juste avant)
  previousPeriodTotals(state, g) {
    const { start, end } = g.previousPeriodBounds || {}
    if (!start || !end) {
      return totalsForEventIds([], [], {}, new Set())
    }
    const baseEvents = g.eventsMatchingFiltersExceptDate
    const ids = new Set()
    for (const e of baseEvents) {
      const d = eventDateOf(e)
      if (!d) continue
      if (d < start || d > end) continue
      ids.add(e.id)
    }
    return totalsForEventIds(baseEvents, state.shopGranularData, state.menuItemCostMap, ids)
  },

  // Totaux KPI sur la même période N-1
  yearOverYearTotals(state, g) {
    const { start, end } = g.yearOverYearBounds || {}
    if (!start || !end) {
      return totalsForEventIds([], [], {}, new Set())
    }
    const baseEvents = g.eventsMatchingFiltersExceptDate
    const ids = new Set()
    for (const e of baseEvents) {
      const d = eventDateOf(e)
      if (!d) continue
      if (d < start || d > end) continue
      ids.add(e.id)
    }
    return totalsForEventIds(baseEvents, state.shopGranularData, state.menuItemCostMap, ids)
  },

  // Variations vs période précédente / vs N-1
  variationsPrev(state, g) {
    return buildVariations(g.currentPeriodTotals, g.previousPeriodTotals)
  },
  variationsYoY(state, g) {
    return buildVariations(g.currentPeriodTotals, g.yearOverYearTotals)
  },

  // Summary enrichi : variations TOUJOURS recalculées localement à partir des
  // données réelles (currentPeriodTotals vs previousPeriodTotals / yearOverYearTotals).
  // Cela garantit la cohérence avec les filtres actifs et avec les KPI affichés.
  // Les autres champs du summary (transferRate, etc.) viennent de l'API/mock.
  summaryWithComparisons(state, g) {
    const api = state.summary || {}
    const { variations: _ignoredApiVariations, variationsYoY: _ignoredApiYoY, ...rest } = api
    return {
      ...rest,
      variations: g.variationsPrev,
      variationsYoY: g.variationsYoY,
      comparisonMode: state.filters.comparisonMode,
    }
  },

  // Indique si on a déjà des records prédictifs en mémoire
  hasPredictiveRecords(state) {
    return state.shopGranularData.some((r) => r.isPredictive)
  },
}

const mutations = {
  SET_SPACE_SHOPS_ROWS(state, { spaceId, rows }) {
    state.spaceShopsRows = { ...state.spaceShopsRows, [spaceId]: rows }
  },
  SET_SPACE_ID(state, id) { state.spaceId = id },
  SET_SPACE(state, s) { state.space = s },
  SET_SPACE_CACHED_AT(state, ts) { state.spaceCachedAt = ts || 0 },
  SET_CONFIGURATIONS(state, c) { state.configurations = filterValidConfigurations(c) },
  SET_TAXONOMY(state, { productTypes, productCategories } = {}) {
    state.productTypesList = Array.isArray(productTypes) ? productTypes : []
    state.productCategoriesList = Array.isArray(productCategories) ? productCategories : []
  },
  SET_CONFIG_SHOP_CONTEXT(state, ctx) {
    state.configShopContext = ctx || { configId: null, floorElements: [], assignment: null }
  },
  // Jeton de requête monotone : incrémenté à chaque dispatch de loadConfig(All)ShopContext.
  // L'action capture sa valeur et n'écrit le contexte QUE si elle est encore la dernière.
  BUMP_CONFIG_CTX_REQ(state) { state.configContextReqId = (state.configContextReqId || 0) + 1 },
  SET_CONFIG_CONTEXT_LOADING(state, v) { state.configContextLoading = !!v },
  SET_CONFIG_CONTEXT_SETTLED(state, v) { state.configContextSettled = !!v },
  SET_CONFIG_CONTEXT_LOADING_ID(state, id) { state.configContextLoadingId = id || null },
  SET_CONFIG_CONTEXT_ERROR(state, e) { state.configContextError = e || null },
  SET_SOLD_ITEM_OPTIONS(state, { names, types, categories } = {}) {
    state.soldItemOptions = {
      names: Array.isArray(names) ? names : [],
      types: Array.isArray(types) ? types : [],
      categories: Array.isArray(categories) ? categories : [],
    }
  },
  SET_SOLD_ITEM_OPTIONS_LOADING(state, v) { state.soldItemOptionsLoading = !!v },
  SET_MENU_ITEMS(state, m) { state.menuItems = m || [] },
  SET_SUPPLIERS(state, s) { state.suppliers = s || [] },
  SET_INGREDIENTS(state, i) { state.ingredients = i || [] },
  SET_COMPONENTS(state, c) { state.components = c || [] },
  SET_WEEZEVENT_PRODUCTS(state, p) { state.weezeventProducts = p || [] },
  SET_WEEZEVENT_PRODUCT_MAPPINGS(state, m) { state.weezeventProductMappings = m || [] },
  // Heavy arrays (>50k records on the Adidas Arena mock) — freeze so Vuex
  // skips Proxy wrapping. Avoids the OOM that triggered "Aïe aïe aïe" page
  // crashes during Analyse → Predict → EventPredict transitions.
  SET_SHOP_GRANULAR(state, d) {
    const arr = Array.isArray(d) ? d : []
    state.shopGranularData = Object.isFrozen(arr) ? arr : Object.freeze(arr)
  },
  SET_EVENTS(state, events) {
    // Normalise au niveau racine pour que les filtres/getters lisent des STRINGS.
    // L'API /events renvoie `eventType`/`eventCategory`/`eventSubcategory` en OBJETS
    // `{ id, name }` (pas en strings) → on extrait `.name`. team/sponsor ne sont pas
    // fournis par cette API → restent null (filtres vides = pas de donnée à filtrer).
    const pickName = (v) =>
      v && typeof v === 'object' ? (v.name ?? v.label ?? v.title ?? null) : (v ?? null)
    const normalized = (events || []).map((e) => {
      // `sessions` arrive SÉRIALISÉ en JSON (string) → sans parsing,
      // `e.sessions?.[0]?.showTime` lisait « [ ».showTime = undefined, donc le
      // coup d'envoi (showTime) et l'ouverture des portes restaient null. On
      // parse pour la DÉRIVATION racine ci-dessous ; `...e` garde `e.sessions`
      // intact (aucun impact sur les autres consommateurs / EventPredict).
      const sessions = parseEventSessions(e.sessions)
      return {
        ...e,
        doorsOpening: e.doorsOpening ?? sessions[0]?.doorsOpening ?? e.metadata?.doorsOpening ?? null,
        showTime:     e.showTime     ?? sessions[0]?.showTime     ?? e.metadata?.showTime     ?? null,
        category:     pickName(e.eventCategory)    ?? e.category    ?? e.metadata?.category    ?? null,
        eventType:    pickName(e.eventType)        ?? e.metadata?.eventType    ?? null,
        subcategory:  pickName(e.eventSubcategory) ?? e.subcategory ?? e.metadata?.subcategory ?? null,
        team:         e.team         ?? e.metadata?.team         ?? null,
        sponsor:      e.sponsor      ?? e.metadata?.sponsor      ?? null,
        visitingTeam: e.visitingTeam ?? e.metadata?.visitingTeam ?? null,
      }
    })
    state.events = Object.freeze(normalized)
  },
  SET_MENU_ITEM_COST_MAP(state, m) { state.menuItemCostMap = m },
  SET_SUMMARY(state, s) { state.summary = s },
  SET_FROM_MOCK(state, v) { state.fromMock = v },
  SET_WEEZEVENT_SETUP_INCOMPLETE(state, v) { state.weezeventSetupIncomplete = v },

  SET_LOADING(state, v) { state.loading = v },
  SET_ENRICHING(state, v) { state.enriching = v },
  SET_PREDICTIONS_GENERATING(state, v) { state.predictionsGenerating = !!v },
  SET_ERROR(state, e) { state.error = e },

  SET_CHART_VIEW_MODE(state, v) { state.chartViewMode = v },
  SET_CHART_GROUP_BY(state, v) { state.chartGroupBy = v },
  SET_CUMULATIVE_REVENUE(state, v) { state.cumulativeRevenue = v },
  SET_TOOLBOX(state, v) { state.selectedToolbox = v },
  SET_MOBILE_PANEL(state, v) { state.activeMobilePanel = v },
  SET_PENDING_ASSISTANT_QUERY(state, v) { state.pendingAssistantQuery = v },
  SET_ANALYSE_DATASET(state, v) { state.dataset = v || null },
  SET_PENDING_PREDICT_EVENT_ID(state, v) { state.pendingPredictEventId = v },

  SET_TIMELINE(state, { start, end }) {
    state.timelineStartTime = start
    state.timelineEndTime = end
  },

  UPDATE_FILTER(state, { key, value }) {
    state.filters[key] = value
  },
  RESET_FILTERS(state) {
    state.filters = DEFAULT_FILTERS()
  },

  // ---- Buckets API-shape ----
  SET_SHOP_SUMMARIES(state, v) { state.shopSummaries = v || [] },
  SET_SPACE_MENU_BY_CONFIG(state, v) { state.spaceMenuByConfig = v || {} },
  SET_SHOP_MENUS_BY_SHOP(state, v) { state.shopMenusByShop = v || {} },

  // ---- Caches ----
  SET_TIMELINE_FOR_EVENT(state, { eventId, data }) {
    const records = preprocessTimelineRecords(data || [], {
      eventId,
      menuItemCostMap: state.menuItemCostMap || {},
    })
    // BUG-285 : gel (même motif que SET_SHOP_GRANULAR) — évite le Proxy profond
    // sur un gros tableau minute-level retenu en cache.
    for (const r of records) Object.freeze(r)
    state.timelineCacheByEventId = {
      ...state.timelineCacheByEventId,
      [eventId]: Object.freeze(records),
    }
  },
  INVALIDATE_TIMELINE_FOR_EVENT(state, eventId) {
    if (!(eventId in state.timelineCacheByEventId)) return
    const next = { ...state.timelineCacheByEventId }
    delete next[eventId]
    state.timelineCacheByEventId = next
  },
  SET_PREDICTION_FOR_KEY(state, { key, data }) {
    state.predictionCacheByEventConfigKey = {
      ...state.predictionCacheByEventConfigKey,
      [key]: data,
    }
  },
  INVALIDATE_PREDICTIONS_FOR_EVENT(state, eventId) {
    const prefix = `${eventId}::`
    const next = {}
    for (const [k, v] of Object.entries(state.predictionCacheByEventConfigKey)) {
      if (!k.startsWith(prefix)) next[k] = v
    }
    state.predictionCacheByEventConfigKey = next
  },
  SET_ACTIVE_PREDICTION_VERSION(state, { eventId, versionId }) {
    state.activePredictionVersionByEventId = {
      ...state.activePredictionVersionByEventId,
      [eventId]: versionId,
    }
  },
  SET_PREDICT_SCENARIO_ITEM_RECORDS(state, records) {
    // BUG-285 : gel (même motif que SET_SHOP_GRANULAR).
    const arr = Array.isArray(records) ? records : []
    state.predictScenarioItemRecords = Object.isFrozen(arr) ? arr : Object.freeze(arr)
  },
  // BUG-285 : purge des caches par clé au CHANGEMENT d'espace. loadSpace remplace
  // les tableaux plats (events, shopGranularData…) mais ces accumulateurs par
  // eventId/configId/spaceId gardaient les données de tous les espaces visités —
  // croissance sans borne sur une session multi-espaces.
  CLEAR_SPACE_KEYED_CACHES(state, { keepSpaceId } = {}) {
    state.timelineCacheByEventId = {}
    state.predictionCacheByEventConfigKey = {}
    state.activePredictionVersionByEventId = {}
    state.spaceMenuByConfig = {}
    state.shopMenusByShop = {}
    const kept = keepSpaceId != null ? state.spaceShopsRows?.[keepSpaceId] : undefined
    state.spaceShopsRows = kept !== undefined ? { [keepSpaceId]: kept } : {}
  },
  APPLY_EVENT_PREDICT_VERSION(state, { eventId, version }) {
    if (!eventId || !version) return
    if (version.eventSnapshot) {
      // Snapshot figé au save de version : ne jamais laisser son nom NI ses
      // dates écraser les valeurs canoniques (rename/changement de date
      // postérieur fait dans Settings/Profile). Une date périmée sortirait
      // l'event de futureEvents → badge calendrier disparu (BUG-163, miroir
      // de omitEventIdentity côté EventPredictView).
      const snap = { ...version.eventSnapshot }
      delete snap.name
      delete snap.eventName
      delete snap.date
      delete snap.eventDate
      delete snap.eventEndDate
      state.events = state.events.map((event) =>
        event.id === eventId
          ? {
              ...event,
              ...snap,
              id: event.id,
            }
          : event,
      )
    }
    state.activePredictionVersionByEventId = {
      ...state.activePredictionVersionByEventId,
      [eventId]: version.id,
    }
  },
}

const actions = {
  /**
   * Charge un espace. Accepte `spaceId` (string) ou `{ spaceId, force }`.
   *
   * Cache-first (stale-while-revalidate) : si le MÊME espace est déjà en store et
   * que la phase 1 date de moins de 15 min (convention TTL des stores, cf.
   * CLAUDE.md), on rend immédiatement depuis le store (pas de loading, pas de
   * skeletons) et on revalide en arrière-plan — le re-mount de la vue devient
   * instantané au lieu de re-payer les 4 requêtes de phase 1 en bloquant.
   */
  async loadSpace({ commit, dispatch, state }, payload) {
    const spaceId = typeof payload === 'object' && payload !== null ? payload.spaceId : payload
    const force = typeof payload === 'object' && payload !== null ? !!payload.force : false
    // Écran Live (AnalyseView.vue::isLive) : inclut les events QA « simulés » dans le
    // chargement — voir useSpaceDataFetch/fetchSpaceData ci-dessous.
    const isLive = typeof payload === 'object' && payload !== null ? !!payload.isLive : false
    const CACHE_TTL = 15 * 60 * 1000
    const fresh =
      !force &&
      state.space?.id === spaceId &&
      state.spaceCachedAt &&
      Date.now() - state.spaceCachedAt < CACHE_TTL

    // BUG-285 : au CHANGEMENT d'espace (pas au simple re-load du même), on purge les
    // accumulateurs par clé (timeline/prédictions/menus/shops de l'ancien espace) et
    // les caches session API des autres espaces — sinon chaque espace visité s'ajoute
    // aux précédents en mémoire, sans jamais redescendre.
    const prevSpaceId = state.spaceId || state.space?.id || null
    if (prevSpaceId && String(prevSpaceId) !== String(spaceId)) {
      commit('CLEAR_SPACE_KEYED_CACHES', { keepSpaceId: spaceId })
      // Import dynamique (comme useSpaceData ci-dessous) : un import statique de
      // space.api tirerait axios (ESM) dans les specs Jest du store — 3 suites
      // qui n'y touchent pas casseraient au parse.
      import('@/api/endpoints/space.api')
        .then(({ clearSpaceSessionCachesExcept }) => clearSpaceSessionCachesExcept(spaceId))
        .catch(() => {})
    }

    commit('SET_SPACE_ID', spaceId)
    // Le cache contexte-PdV est clé par configId ; on le purge au (re)chargement d'un
    // espace pour ne jamais servir un périmètre d'un autre espace / d'un état périmé.
    // Idem pour les subtypes builder2 : re-fetch après édition dans le builder.
    // C'est CE point de purge qui autorise `configShopEntryCache` à exister : sans lui,
    // un retour du Builder servirait des PdV/zones périmés.
    resetBuilder2SubtypesCache()
    resetConfigShopEntryCache()

    if (fresh) {
      // Rendu immédiat depuis le store ; revalidation silencieuse en fond (les
      // données fraîches remplaceront réactivement celles affichées, sans skeleton).
      commit('SET_ERROR', null)
      dispatch('useSpaceDataFetch', { spaceId, isLive }).catch((err) => {
        console.warn('[analyse] revalidation arrière-plan échouée:', err?.message)
      })
      return
    }

    commit('SET_LOADING', true)
    commit('SET_ENRICHING', true)
    commit('SET_ERROR', null)
    try {
      await dispatch('useSpaceDataFetch', { spaceId, isLive })
    } catch (err) {
      commit('SET_ERROR', err.message || 'Erreur de chargement du space')
      // Phase 2 ne sera jamais appelée si la phase 1 jette → on lève le skeleton.
      commit('SET_ENRICHING', false)
    } finally {
      commit('SET_LOADING', false)
    }
  },

  async useSpaceDataFetch({ commit, dispatch, getters, state }, payload) {
    const spaceId = typeof payload === 'object' && payload !== null ? payload.spaceId : payload
    const isLive = typeof payload === 'object' && payload !== null ? !!payload.isLive : false
    // Délégué au composable useSpaceData (two-phase load).
    // Phase 1 (critique) est attendue → loading=false dès qu'elle complète.
    // Phase 2 (enrichissement) rappelle onEnrichment en arrière-plan.
    const { fetchSpaceData } = await import('@/composables/useSpaceData')
    const data = await fetchSpaceData(spaceId, (enrichment) => {
      // Appelé PLUSIEURS fois : vague 2a (graphes : menu-items + granular + taxonomie),
      // puis vague 2b (catalogues recette). On ne commit QUE les clés réellement
      // présentes — sinon la 2e passe, qui n'envoie que son delta, remettrait à []
      // la taxonomie et les suppliers posés par la 1re (et le fallback d'erreur
      // effacerait les menu items déjà affichés).
      if (enrichment.menuItems) commit('SET_MENU_ITEMS', enrichment.menuItems)
      // Taxonomie catalogue → source unique des dimensions item (réconciliation).
      if (enrichment.productTypes || enrichment.productCategories) {
        commit('SET_TAXONOMY', {
          productTypes: enrichment.productTypes,
          productCategories: enrichment.productCategories,
        })
      }
      if (enrichment.suppliers) commit('SET_SUPPLIERS', enrichment.suppliers)
      if (enrichment.ingredients) commit('SET_INGREDIENTS', enrichment.ingredients)
      if (enrichment.components) commit('SET_COMPONENTS', enrichment.components)
      // Coûts (MARGE) : complète le costMap de phase 1 (shop-details) avec les
      // coûts dérivés des menu items (phase 2). Shop-details prioritaire → on
      // n'écrase pas une valeur existante par celle des items.
      if (enrichment.menuItemCostMap && Object.keys(enrichment.menuItemCostMap).length) {
        const merged = { ...enrichment.menuItemCostMap, ...(state.menuItemCostMap || {}) }
        commit('SET_MENU_ITEM_COST_MAP', merged)
        console.log(`[analyse] 💶 costMap fusionné — ${Object.keys(merged).length} entrée(s) (shop-details prioritaire + fallback menu items)`)
      }
      if (enrichment.weezeventProducts?.length) commit('SET_WEEZEVENT_PRODUCTS', enrichment.weezeventProducts)
      if (enrichment.weezeventProductMappings?.length) commit('SET_WEEZEVENT_PRODUCT_MAPPINGS', enrichment.weezeventProductMappings)
      // Granular data (heavy join) — chargé en arrière-plan (Option A)
      if (enrichment.shopGranularData?.length) commit('SET_SHOP_GRANULAR', enrichment.shopGranularData)
      // Events from the granular RPC response: always empty array (seasons, not matches).
      // Only overwrite state.events if the enrichment brings actual events (safeguard).
      if (enrichment.events?.length) commit('SET_EVENTS', enrichment.events)
      // Phase 2 terminée → on retire les skeletons des graphiques.
      commit('SET_ENRICHING', false)
    }, { excludeSimulated: !isLive })
    commit('SET_SPACE', data.space)
    commit('SET_CONFIGURATIONS', data.configurations || [])
    commit('SET_SHOP_GRANULAR', data.shopGranularData || [])
    commit('SET_EVENTS', data.events || [])
    // MERGE (pas d'écrasement) : la map phase-1 (shop-details) est souvent vide ;
    // un re-dispatch loadSpace effaçait le costMap déjà mergé en phase 2 →
    // cost/margin EventPredict intermittents. Phase 1 fraîche prioritaire.
    commit('SET_MENU_ITEM_COST_MAP', {
      ...state.menuItemCostMap,
      ...(data.menuItemCostMap || {}),
    })
    commit('SET_MENU_ITEMS', data.menuItems || [])
    commit('SET_SUPPLIERS', data.suppliers || [])
    commit('SET_INGREDIENTS', data.ingredients || [])
    commit('SET_COMPONENTS', data.components || [])
    commit('SET_WEEZEVENT_PRODUCTS', data.weezeventProducts || [])
    commit('SET_WEEZEVENT_PRODUCT_MAPPINGS', data.weezeventProductMappings || [])
    commit('SET_SUMMARY', data.summary || null)
    commit('SET_FROM_MOCK', !!data._fromMock)
    commit('SET_WEEZEVENT_SETUP_INCOMPLETE', !!data._weezeventSetupIncomplete)
    // Phase 1 fraîche → horodate le cache-first de loadSpace (15 min).
    commit('SET_SPACE_CACHED_AT', Date.now())

    // Calibre automatiquement les bornes des sliders attendance sur la data
    // réelle (évite de laisser [0, 1000000] quand le max réel est p.ex. 8500).
    const bounds = getters.attendanceBounds
    commit('UPDATE_FILTER', { key: 'ticketsSoldRange',    value: [bounds.soldMin, bounds.soldMax] })
    commit('UPDATE_FILTER', { key: 'ticketsScannedRange', value: [bounds.scannedMin, bounds.scannedMax] })

    // Sélection de config : PRÉSERVÉE si elle existe dans ce space (loadSpace est
    // re-dispatché par d'autres écrans — ex. overlay EventPredict — et écrasait la
    // sélection utilisateur → bug « retombe sur All »). Reset à null UNIQUEMENT si
    // l'id est périmé (hérité d'un autre espace, s'afficherait BRUT dans le select).
    // Le deep-link ?config=<id> restaure une config précise APRÈS loadSpace
    // (cf. AnalyseView.ensureAuthAndLoad). Non bloquant (fire-and-forget).
    //
    // AUCUNE pré-sélection par défaut (décision user 2026-07-30, annule BUG-225) :
    // on atterrit toujours sur « All Configurations ». `pickDefaultConfiguration` et
    // son garde-fou `configAutoSelectedSpaceId` ont été retirés avec cette décision.
    const validConfigs = filterValidConfigurations(data.configurations)
    const previousCfg = state.filters.selectedConfigurationId
    const preserved = resolveConfigSelectionAfterLoad(
      previousCfg,
      validConfigs,
      { configurationsFetchFailed: !!data._configurationsFetchFailed },
    )
    commit('UPDATE_FILTER', { key: 'selectedConfigurationId', value: preserved })
    // PERF (décision user « différer seulement ») : le chemin « All Configurations »
    // (~2-3 requêtes/config depuis le batch getConfigShopMenuItemsLight) n'est PLUS
    // lancé ici — AnalyseView le déclenche APRÈS le premier rendu (watcher enriching/idle).
    // Une config précise reste chargée immédiatement (2-3 requêtes).
    //
    // Dispatch INCONDITIONNEL (d'autres écrans que AnalyseView dispatchent loadSpace
    // sans watcher `selectedConfigurationId` derrière). Depuis le retrait de la
    // pré-sélection auto (2026-07-30) la valeur ne CHANGE plus ici — le watcher
    // d'AnalyseView ne re-fire donc pas et ce dispatch est le seul chemin. Il reste
    // couvert par la dédup in-flight de `loadConfigShopContext` (BUG-225, point 2)
    // pour les cas où les deux partent ensemble (config préservée + watcher au mount).
    if (preserved) dispatch('loadConfigShopContext', preserved)
  },

  /**
   * Charge le contexte PdV d'une configuration : FloorElements (shops 100%
   * DataFriday, avec shopType/area) + assignation item↔PdV (getSpaceMenuConfiguration,
   * source canonique Edge). Caché par configId. À déclencher au chargement et à
   * chaque changement de `selectedConfigurationId` (cf. AnalyseView watcher).
   */
  async loadConfigShopContext({ state, commit, dispatch, rootGetters }, configId) {
    const spaceId = state.spaceId || state.space?.id
    // Dédup (avant le jeton, sinon on annulerait la requête qu'on veut réutiliser) :
    // `buildConfigShopEntry` n'a AUCUN cache de résultat — chaque appel refait le
    // batch getConfigShopMenuItemsLight. Deux chemins dispatchent la même config au
    // même moment (useSpaceDataFetch + watcher `selectedConfigurationId`), on ne
    // garde donc que le premier.
    // NB : dédup UNIQUEMENT sur le vol en cours, PAS sur « déjà chargé » —
    // `configShopContext` n'est jamais purgé (loadSpace ne reset que le cache
    // builder2), un short-circuit sur l'existant servirait des zones/PdV périmés
    // après une édition dans le Builder.
    if (configId && configId !== 'cfg-all'
        && state.configContextLoading && state.configContextLoadingId === configId) {
      return
    }
    // Jeton anti-race : ce dispatch ne commit son résultat QUE s'il reste le dernier
    // (loadSpace fire-and-forget + watcher selectedConfigurationId peuvent se chevaucher).
    commit('BUMP_CONFIG_CTX_REQ')
    const myReq = state.configContextReqId
    const stale = () => state.configContextReqId !== myReq
    commit('SET_CONFIG_CONTEXT_ERROR', null)
    if (!spaceId || !configId || configId === 'cfg-all') {
      if (stale()) return
      commit('SET_CONFIG_SHOP_CONTEXT', {
        configId: null, floorElements: [], assignment: null, assignmentItemsByShop: new Map(),
      })
      commit('SET_CONFIG_CONTEXT_SETTLED', true)
      return
    }
    commit('SET_CONFIG_CONTEXT_LOADING', true)
    commit('SET_CONFIG_CONTEXT_LOADING_ID', configId)
    try {
      // Build COMPLET extrait (réutilisé par l'union « All Configurations »).
      const built = await buildConfigShopEntryCached(spaceId, configId, { state, dispatch, commit, rootGetters })
      const { floorElements, assignment, assignmentItemsByShop } = built

      // Réponse obsolète (une autre config a été demandée entre-temps) → ne RIEN écrire.
      if (stale()) return

      // 0 PdV = état VIDE, pas une erreur : depuis la refonte data-driven, les
      // options des filtres viennent des VENTES ; ce contexte n'est qu'un
      // enrichissement (dims type/zone). Le mapper sur configContextError
      // affichait « Échec du chargement du catalogue » pour une config sans PdV.
      commit('SET_CONFIG_SHOP_CONTEXT', { configId, floorElements, assignment, assignmentItemsByShop })

      // Diagnostic connexion (vérifiable sur Auxerre) : items assignés PAR shop.
      const perShop = [...assignmentItemsByShop.entries()]
        .map(([k, items]) => `${k}:${items.length}`)
        .join(', ')
      console.log(
        `[analyse] 🍽️ contexte PdV cfg ${configId} — ${floorElements.length} PdV ; ` +
          `assignation { ${perShop || 'aucune'} } (floors config ${built._diag.configElements}, NestJS ${built._diag.nest}, types builder2 ${built._diag.builder2Types})`,
      )
    } catch (err) {
      // VRAIE panne (réseau / API) : sans ce catch l'exception remontait au
      // dispatch fire-and-forget (rejection non gérée) et configContextError
      // restait null → l'échec réel était invisible et Retry sans objet.
      if (!stale()) {
        commit('SET_CONFIG_CONTEXT_ERROR', err?.message || 'Échec du chargement du contexte configuration')
      }
      console.warn('[analyse] loadConfigShopContext failed:', err?.message || err)
    } finally {
      // Ne libère l'état loading que si on est encore la dernière requête (sinon on
      // masquerait le spinner d'un chargement plus récent encore en cours).
      if (!stale()) {
        commit('SET_CONFIG_CONTEXT_LOADING', false)
        commit('SET_CONFIG_CONTEXT_LOADING_ID', null)
        commit('SET_CONFIG_CONTEXT_SETTLED', true)
      }
    }
  },

  /**
   * Union toutes-configs : charge + fusionne FloorElements + assignations de TOUTES
   * les configurations de l'espace. Déclenché UNIQUEMENT sur « All Configurations »
   * (décision D : le landing reste mono-config pour la perf). Réutilise le cache par config.
   */
  async loadAllConfigsShopContext({ state, commit, dispatch, rootGetters }) {
    const spaceId = state.spaceId || state.space?.id
    const configs = (state.configurations || []).filter((c) => c?.id && c.id !== 'cfg-all')
    // Même jeton anti-race que loadConfigShopContext (les deux écrivent configShopContext).
    commit('BUMP_CONFIG_CTX_REQ')
    const myReq = state.configContextReqId
    const stale = () => state.configContextReqId !== myReq
    commit('SET_CONFIG_CONTEXT_ERROR', null)
    if (!spaceId || !configs.length) {
      if (stale()) return
      commit('SET_CONFIG_SHOP_CONTEXT', { configId: null, floorElements: [], assignment: null, assignmentItemsByShop: new Map() })
      commit('SET_CONFIG_CONTEXT_SETTLED', true)
      return
    }
    commit('SET_CONFIG_CONTEXT_LOADING', true)
    const _t0 =(typeof performance !== 'undefined' ? performance.now() : Date.now())
    try {
      // Pool borné (3 configs à la fois, comme le pool shops de buildConfigShopEntry) :
      // avant, ce Promise.all lançait TOUTES les configs de l'espace en parallèle
      // (chacune fan-out déjà sur ses shops) → seul fan-out du repo sans plafond,
      // déclenché au montage de la page Analyse en "All Configurations".
      const entries = new Array(configs.length)
      await runWithConcurrency(
        configs.map((c, i) => [c, i]),
        3,
        async ([c, i]) => {
          const built = await buildConfigShopEntryCached(spaceId, c.id, { state, dispatch, commit, rootGetters })
          entries[i] = {
            floorElements: built.floorElements,
            assignment: built.assignment,
            assignmentItemsByShop: built.assignmentItemsByShop,
          }
        },
      )
      // Merge : floorElements (dédupliqués par NOM — un même PdV peut être dans plusieurs
      // configs) + union assignations {menuItems:{el:{mi:bool}}} + union assignmentItemsByShop
      // (par nom de PdV, articles dédupliqués par id).
      const mergedFloorElements = []
      const seenShopName = new Set()
      const mergedMenuItems = {}
      const mergedItemsByShop = new Map()
      for (const e of entries) {
        for (const el of e.floorElements || []) {
          const k = normalizeStr(el?.name)
          if (k && seenShopName.has(k)) continue
          if (k) seenShopName.add(k)
          mergedFloorElements.push(el)
        }
        const mi = e.assignment?.menuItems || e.assignment || {}
        for (const [elId, obj] of Object.entries(mi)) {
          mergedMenuItems[elId] = { ...(mergedMenuItems[elId] || {}), ...(obj || {}) }
        }
        const ibs = e.assignmentItemsByShop
        if (ibs instanceof Map) {
          for (const [k, items] of ibs.entries()) {
            const prev = mergedItemsByShop.get(k) || []
            const seenItem = new Set(prev.map((it) => String(it?.id ?? it?.name)))
            const merged = prev.slice()
            for (const it of items || []) {
              const id = String(it?.id ?? it?.name)
              if (id && !seenItem.has(id)) { seenItem.add(id); merged.push(it) }
            }
            mergedItemsByShop.set(k, merged)
          }
        }
      }
      if (stale()) return
      commit('SET_CONFIG_SHOP_CONTEXT', {
        configId: null,
        floorElements: mergedFloorElements,
        assignment: { menuItems: mergedMenuItems },
        assignmentItemsByShop: mergedItemsByShop,
      })
      console.log(
        `[perf] allConfigsCtx ${Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t0)}ms — ${configs.length} config(s), ${mergedFloorElements.length} PdV`,
      )
    } catch (err) {
      // Même logique que loadConfigShopContext : une vraie panne doit peupler
      // configContextError (état error + Retry), pas une rejection silencieuse.
      if (!stale()) {
        commit('SET_CONFIG_CONTEXT_ERROR', err?.message || 'Échec du chargement du contexte configuration')
      }
      console.warn('[analyse] loadAllConfigsShopContext failed:', err?.message || err)
    } finally {
      if (!stale()) {
        commit('SET_CONFIG_CONTEXT_LOADING', false)
        commit('SET_CONFIG_CONTEXT_SETTLED', true)
      }
    }
  },

  updateFilter({ commit }, payload) {
    commit('UPDATE_FILTER', payload)
  },
  // Remonte les options du filtre articles (articles VENDUS) depuis le dataset item-level
  // (qui vit dans AnalyseView, hors store). Alimente salesMenuItem*.
  setSoldItemOptions({ commit }, payload) {
    commit('SET_SOLD_ITEM_OPTIONS', payload || {})
  },
  // Remonté par AnalyseView depuis useAnalyseItemRecords.loading — le fetch
  // item-level vit hors store, le panneau de filtres a besoin de savoir qu'il
  // tourne pour afficher un loader au lieu d'un état vide.
  setSoldItemOptionsLoading({ commit }, v) {
    commit('SET_SOLD_ITEM_OPTIONS_LOADING', v)
  },
  // Purge les sélections de filtres devenues obsolètes après un changement de config :
  // pour chaque dimension, retire de la sélection les valeurs absentes des options
  // courantes. Garde anti-race : on ne purge une dimension QUE si ses options sont non
  // vides (sinon on viderait tout pendant le chargement async des records item-level).
  pruneFiltersToOptions({ state, getters, commit }) {
    const pairs = [
      ['salesShopNames',          'selectedShopIds',            true],
      ['salesShopTypes',          'selectedShopTypes',          false],
      ['salesShopAreas',          'selectedShopAreas',          false],
      ['salesMenuItemNames',      'selectedMenuItemIds',        true],
      ['salesMenuItemTypes',      'selectedMenuItemTypes',      false],
      ['salesMenuItemCategories', 'selectedMenuItemCategories', false],
    ]
    for (const [optionGetter, filterKey, byName] of pairs) {
      const options = getters[optionGetter] || []
      if (!options.length) continue
      const selection = state.filters?.[filterKey] || []
      if (!selection.length) continue
      const allowed = byName
        ? new Set(options.map((o) => normalizeStr(o)))
        : new Set(options)
      const pruned = byName
        ? selection.filter((v) => allowed.has(normalizeStr(v)))
        : selection.filter((v) => allowed.has(v))
      if (pruned.length !== selection.length) {
        commit('UPDATE_FILTER', { key: filterKey, value: pruned })
      }
    }
  },
  resetFilters({ commit, getters }) {
    commit('RESET_FILTERS')
    // Recalibre les sliders attendance sur les bornes réelles de la data
    // (sinon ils repartent sur [0, 1_000_000] qui n'est pas représentatif).
    const bounds = getters.attendanceBounds
    if (bounds) {
      commit('UPDATE_FILTER', { key: 'ticketsSoldRange',    value: [0, bounds.soldMax] })
      commit('UPDATE_FILTER', { key: 'ticketsScannedRange', value: [0, bounds.scannedMax] })
    }
  },

  /**
   * Génère et merge les records prédictifs pour tous les events futurs.
   * Cf. React §8.1 — appelée quand on entre en mode predict si pas déjà fait.
   * Idempotente : purge d'abord les éventuels anciens records prédictifs.
   *
   * Override des events qui ont une version par défaut Event Predict en
   * localStorage : on rescale les records prédits pour matcher
   * `adjustedTotalRevenue` (ou `totalRevenue`) de la version. Ainsi la barre
   * « Predict » affiche bien les valeurs validées par l'utilisateur dans
   * EventPredict, pas la prédiction automatique brute.
   */
  async regeneratePredictions({ state, commit }) {
    if (!state.events.length || !state.shopGranularData.length) return
    // Garde de ré-entrance : le watcher AnalyseView peut re-déclencher pendant
    // qu'une génération (désormais découpée en tranches) est en cours.
    if (state.predictionsGenerating) return
    commit('SET_PREDICTIONS_GENERATING', true)
    const _t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now())
    let predictiveRecords = []
    const actualOnly = state.shopGranularData.filter((r) => !r.isPredictive)
    try {
      // PERF : même sémantique que generatePredictionsForAllFutureEvents
      // (predictiveAnalytics.js L434-476 — split futur/passé identique) mais la
      // boucle par event vit ICI pour pouvoir YIELDER le main thread entre deux
      // events (3-8 s de scoring bloquaient l'UI au switch toolbox). Les RÈGLES
      // de scoring restent 100 % dans predictiveAnalytics (intouché).
      const { generatePredictionsForEvent } = await import('@/utils/predictiveAnalytics')
      const { parseEventDate } = await import('@/utils/dateFr')
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const eventsWithData = new Set(actualOnly.map((d) => d.eventId))
      const futureEvents = []
      const pastEvents = []
      for (const event of state.events || []) {
        const d = parseEventDate(event.eventDate)
        if (!d) continue
        d.setHours(0, 0, 0, 0)
        if (d.getTime() > today.getTime()) futureEvents.push(event)
        else if (d.getTime() === today.getTime()) {
          if (!eventsWithData.has(event.id)) futureEvents.push(event)
          else pastEvents.push(event)
        } else pastEvents.push(event)
      }
      const pastEventIds = new Set(pastEvents.map((e) => e.id))
      const pastData = actualOnly.filter((d) => pastEventIds.has(d.eventId))
      if (futureEvents.length && pastEvents.length && pastData.length) {
        for (const fe of futureEvents) {
          // Mémo par event×config×volume de données : re-entrée en mode predict
          // (après clearPredictions) → instantané.
          const cacheKey = `${fe.id}::${fe.configurationId || 'none'}::${pastData.length}`
          const cached = state.predictionCacheByEventConfigKey[cacheKey]
          let preds
          if (Array.isArray(cached)) {
            preds = cached
          } else {
            preds = generatePredictionsForEvent(fe, pastEvents, pastData) || []
            commit('SET_PREDICTION_FOR_KEY', { key: cacheKey, data: preds })
            // Yield UNIQUEMENT après un vrai calcul : rend la main au navigateur
            // (paint/scroll) entre deux events → plus de freeze perceptible.
            await new Promise((r) => setTimeout(r, 0))
          }
          if (preds.length) predictiveRecords.push(...preds)
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[analyse] regeneratePredictions failed:', err?.message)
      predictiveRecords = []
    }
    // L'utilisateur a quitté le mode predict pendant la génération (clearPredictions
    // est passé) → ne pas ressusciter les records prédictifs.
    const tb = state.selectedToolbox
    if (tb !== 'predict' && tb !== 'event-predict') {
      commit('SET_PREDICTIONS_GENERATING', false)
      return
    }

    // ---- Overlay des versions actives/default (saved EventPredict) --------
    const lsRead = (key) => {
      try {
        const raw = localStorage.getItem(`analyse:${key}`)
        return raw ? JSON.parse(raw) : null
      } catch (_) { return null }
    }
    const overrides = new Map() // eventId → { factor, versionId } (events futurs)
    const versionMap = new Map() // eventId → fullVersion
    const pastPredictive = [] // events passés avec scénario → copies prédictives scalées
    // Grain ARTICLE des scénarios : shopGranularData est shop-level, seul
    // `version.predictedRecords` (écrit par EventPredictView.buildPredictedRecords)
    // porte le couple shop × menuItem. Alimente les vues « Répartition du CA par
    // article » / « Articles du menu par PdV » en mode Predict.
    const scenarioItemRecords = []
    // shopId (elementId) → nom de PdV : les records de scénario portent `shop: null`
    // pour les quantités manuelles, et le NOM est la clé de jointure de reconcileRecord.
    const elementNameById = new Map()
    for (const el of state.configShopContext?.floorElements || []) {
      if (el?.id != null && el?.name) elementNameById.set(String(el.id), el.name)
    }
    const predictedEventIds = new Set(predictiveRecords.map((r) => r.eventId))
    for (const ev of state.events) {
      const active = lsRead(`event-predict-active-version:${ev.id}`)
      const def = lsRead(`event-predict-default-version:${ev.id}`)
      const selectedVersionId = active?.activeVersionId || def?.defaultVersionId
      if (!selectedVersionId) continue
      const list = lsRead(`event-predict-versions:${ev.id}`)
      if (!Array.isArray(list)) continue
      const version = list.find((v) => v.id === selectedVersionId)
      if (!version) continue
      // Total à atteindre = adjusted si dispo, sinon brut.
      const target = Number(version.adjustedTotalRevenue || version.totalRevenue || 0)
      if (!target) continue
      versionMap.set(ev.id, version)
      // Grain article : indépendant de la branche futur/passé ci-dessous (celle-ci
      // ne fait que rescaler du shop-level). Un scénario sauvegardé AVANT le calcul
      // de sa timeline a `predictedRecords: []` → l'util renvoie [] sans bruit.
      scenarioItemRecords.push(...scenarioRecordsToAnalyseRecords(version, ev, { elementNameById }))
      if (predictedEventIds.has(ev.id)) {
        // Event futur : on rescale les records prédits du moteur.
        const currentRev = predictiveRecords
          .filter((r) => r.eventId === ev.id)
          .reduce((s, r) => s + (r.revenue || 0), 0)
        if (currentRev) overrides.set(ev.id, { factor: target / currentRev, versionId: version.id })
      } else {
        // Event passé (pas de prédiction moteur) : on génère des copies
        // prédictives depuis les ventes réelles, scalées sur le total du
        // scénario → la barre Predict reflète le scénario Event Predict.
        const evActual = actualOnly.filter((r) => r.eventId === ev.id)
        const currentRev = evActual.reduce((s, r) => s + (Number(r.revenue ?? r.revenueHt) || 0), 0)
        if (!currentRev) continue
        const factor = target / currentRev
        for (const r of evActual) {
          pastPredictive.push({
            ...r,
            isPredictive: true,
            revenue: Math.round((Number(r.revenue ?? r.revenueHt) || 0) * factor * 100) / 100,
            quantity: Math.max(0, Math.round((r.quantity || 0) * factor)),
            fromVersionId: version.id,
          })
        }
      }
    }

    if (overrides.size > 0) {
      predictiveRecords = predictiveRecords.map((r) => {
        const ov = overrides.get(r.eventId)
        if (!ov) return r
        return {
          ...r,
          revenue: Math.round((r.revenue || 0) * ov.factor * 100) / 100,
          quantity: Math.max(0, Math.round((r.quantity || 0) * ov.factor)),
          fromVersionId: ov.versionId,
        }
      })
    }
    // Mapping eventId → versionId active (tooltip Predict) — futurs ET passés.
    for (const [eventId, version] of versionMap.entries()) {
      commit('SET_ACTIVE_PREDICTION_VERSION', { eventId, versionId: version.id })
    }

    // Marque ces records comme générés par le MOTEUR (vs pré-calibrés par le
    // mock). Sert de garde au déclencheur predict (AnalyseView) : on régénère
    // tant qu'il n'y a pas de records prédictifs `_engine` — ce qui, en démo,
    // remplace les prédictions du mock par celles du moteur (source de vérité
    // unique) tout en évitant une boucle (après régénération, le garde est
    // satisfait malgré le changement de longueur du granular).
    const engineTagged = [...predictiveRecords, ...pastPredictive].map((r) => ({ ...r, _engine: true }))
    commit('SET_SHOP_GRANULAR', [...actualOnly, ...engineTagged])
    commit('SET_PREDICT_SCENARIO_ITEM_RECORDS', scenarioItemRecords)
    commit('SET_PREDICTIONS_GENERATING', false)
    console.log(
      `[perf] regeneratePredictions ${Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - _t0)}ms — ${engineTagged.length} records prédictifs, ${scenarioItemRecords.length} records article (scénarios)`,
    )
  },

  /**
   * Purge les records prédictifs (ex. quand on quitte le mode predict).
   */
  clearPredictions({ state, commit }) {
    // Le grain article des scénarios se purge INCONDITIONNELLEMENT : il ne vit pas
    // dans shopGranularData, donc le garde ci-dessous ne le couvre pas (sortir du
    // mode predict laisserait sinon des records article fantômes).
    if (state.predictScenarioItemRecords.length) {
      commit('SET_PREDICT_SCENARIO_ITEM_RECORDS', [])
    }
    if (!state.shopGranularData.some((r) => r.isPredictive)) return
    commit('SET_SHOP_GRANULAR', state.shopGranularData.filter((r) => !r.isPredictive))
  },

  // NB (2026-07-18) : l'action loadSpaceLightweight (chargement « first-paint allégé »
  // via les 4 endpoints /analyse/*) a été supprimée — jamais dispatchée, et ses buckets
  // (spaceSummary/menuKpis/eventKpis/costBreakdown) n'étaient lus nulle part. Le vrai
  // chemin de chargement est loadSpace → useSpaceDataFetch (two-phase useSpaceData).

  /**
   * Lazy-load la timeline brute pour un event donné — uniquement si elle
   * n'est pas déjà dans le cache. Renvoie toujours la donnée du cache.
   */
  async loadTimelineForEvent({ state, commit }, { eventId, force = false }) {
    if (!eventId) return []
    if (!force && Array.isArray(state.timelineCacheByEventId[eventId])) {
      return state.timelineCacheByEventId[eventId]
    }
    try {
      const { getSpaceEventTimeline } = await import('@/api/endpoints/space.api')
      const spaceId = state.space?.id
      if (!spaceId) return []
      const data = await getSpaceEventTimeline(spaceId, eventId) || []
      commit('SET_TIMELINE_FOR_EVENT', { eventId, data })
      return data
    } catch (err) {
      console.warn(`[analyse] loadTimelineForEvent ${eventId} failed:`, err?.message)
      commit('SET_TIMELINE_FOR_EVENT', { eventId, data: [] })
      return []
    }
  },

  /**
   * Mémoise une prédiction agrégée par event×config×hash. Le hash doit refléter
   * la sélection (source events, menu, ajustements) côté appelant.
   */
  cachePrediction({ commit }, { eventId, configId = 'default', hash = '', data }) {
    const key = `${eventId}::${configId}::${hash}`
    commit('SET_PREDICTION_FOR_KEY', { key, data })
  },

  getCachedPrediction({ state }, { eventId, configId = 'default', hash = '' }) {
    const key = `${eventId}::${configId}::${hash}`
    return state.predictionCacheByEventConfigKey[key] || null
  },

  /**
   * Invalide les caches dépendant d'un event (timeline + prédictions).
   * Appelé après save EventPredict / changement de configuration / menu /
   * ajustement de quantité.
   */
  invalidateEvent({ commit }, eventId) {
    if (!eventId) return
    commit('INVALIDATE_TIMELINE_FOR_EVENT', eventId)
    commit('INVALIDATE_PREDICTIONS_FOR_EVENT', eventId)
  },

  setActivePredictionVersion({ commit }, payload) {
    commit('SET_ACTIVE_PREDICTION_VERSION', payload)
  },

  applyEventPredictVersion({ commit, dispatch }, { eventId, version }) {
    if (!eventId || !version) return
    commit('APPLY_EVENT_PREDICT_VERSION', { eventId, version })
    dispatch('invalidateEvent', eventId)
  },
}

export default {
  namespaced: true,
  state,
  getters,
  mutations,
  actions,
}
