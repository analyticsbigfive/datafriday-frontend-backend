/**
 * analyseAggregations — fonctions PURES partagées par les graphiques Analyse et
 * par le dataset d'export (`useAnalyseDataset`).
 *
 * Règle du module : aucune dépendance à Vue, au store, ni à i18n. Les libellés
 * traduits sont passés par l'appelant (objet `headers` / `labelFn`). C'est ce qui
 * rend ces fonctions testables sans monter de composant, et réutilisables aussi
 * bien pour un canvas Chart.js que pour une feuille Excel.
 *
 * Deux consommateurs pour chaque fonction, jamais un seul : si une agrégation
 * n'existe qu'ici et nulle part à l'écran, elle n'a rien à y faire.
 */

import { resolveItemType, resolveItemCategory } from '@/utils/analyseDimensions'

// ─── Groupement générique ────────────────────────────────────────────────────

/**
 * Regroupe des records par clé et somme une métrique, tri décroissant.
 *
 * Contrat identique au `groupBy` local de ShopDistributionPieChart (dont il est
 * extrait) : une clé falsy fait sauter le record — c'est ainsi que les lignes
 * shop-level, dépourvues de dimension article, sortent des donuts article.
 *
 * @param {Array} records
 * @param {(r: any) => string} keyFn      clé de regroupement
 * @param {(r: any) => number} valueFn    métrique sommée
 * @param {object|null} colorMap          couleurs par clé (sinon palette)
 * @param {((k: string) => string)|null} labelFn  clé → libellé affiché
 * @param {string[]} palette              couleurs de repli, cyclées
 * @returns {{ keys: string[], labels: string[], values: number[], colors: string[] }}
 */
export function groupBy(records, keyFn, valueFn, colorMap = null, labelFn = null, palette = []) {
  const map = new Map()
  for (const r of records || []) {
    if (!r) continue
    const k = keyFn(r)
    if (!k) continue
    map.set(k, (map.get(k) || 0) + (valueFn(r) || 0))
  }
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1])
  return {
    keys: entries.map((e) => e[0]),
    labels: entries.map((e) => (labelFn ? labelFn(e[0]) : e[0])),
    values: entries.map((e) => e[1]),
    colors: entries.map(([k], i) => {
      if (typeof colorMap === 'function') return colorMap(k, i)
      if (colorMap && colorMap[k]) return colorMap[k]
      return palette.length ? palette[i % palette.length] : undefined
    }),
  }
}

/** Part en pourcentage, `0` si le total est nul (jamais `NaN` dans une cellule). */
export function pctOf(value, total) {
  return total ? round2(((value || 0) / total) * 100) : 0
}

/** Arrondi 2 décimales SANS passer par une chaîne : la cellule doit rester un Number. */
export function round2(v) {
  return Math.round((Number(v) || 0) * 100) / 100
}

// ─── Noms de feuilles Excel ──────────────────────────────────────────────────

const SHEET_FORBIDDEN = /[:\\/?*[\]]/g
const SHEET_MAX = 31

/**
 * Assainit un nom d'onglet Excel : ≤ 31 caractères, sans `: \ / ? * [ ]`, unique
 * dans le classeur.
 *
 * Reprend le nettoyage de l'export legacy (`components/MenuItemsByShopTable.vue`)
 * en ajoutant les deux garanties qui lui manquaient : troncature sur un mot
 * plutôt qu'au milieu, et unicité — deux événements homonymes produiraient sinon
 * deux onglets de même nom, ce qu'Excel refuse à l'ouverture.
 *
 * `used` est muté : le nom retenu y est inscrit. C'est voulu — l'appelant boucle
 * sur ses feuilles avec un seul Set.
 *
 * @param {string} name
 * @param {Set<string>} used  noms déjà attribués (muté)
 */
export function safeSheetName(name, used = new Set()) {
  let base = String(name || '')
    .replace(SHEET_FORBIDDEN, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!base) base = 'Feuille'

  if (base.length > SHEET_MAX) {
    const cut = base.slice(0, SHEET_MAX)
    const lastSpace = cut.lastIndexOf(' ')
    // Ne couper sur un mot que s'il reste un nom lisible : sinon on préfère une
    // troncature brute à un « Per » de trois lettres.
    base = (lastSpace > SHEET_MAX * 0.6 ? cut.slice(0, lastSpace) : cut).trim()
  }

  if (!used.has(base)) {
    used.add(base)
    return base
  }
  for (let n = 2; n < 1000; n += 1) {
    const suffix = ` (${n})`
    const candidate = `${base.slice(0, SHEET_MAX - suffix.length).trim()}${suffix}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
  // Inatteignable en pratique (999 homonymes) — mais on ne renvoie jamais un nom
  // qui ferait échouer `book_append_sheet` en silence.
  const fallback = base.slice(0, SHEET_MAX - 6) + Math.random().toString(36).slice(2, 7)
  used.add(fallback)
  return fallback
}

// ─── Agrégations « Articles × PdV » ──────────────────────────────────────────

/** Nom d'article d'un record, avec les replis historiques du tableau. */
function itemNameOf(r) {
  return r.menuItemName || r.itemName || r.productName
}

/**
 * Ventes groupées par PdV puis par article (vue « By shop » du tableau).
 *
 * `pictureOf` permet au composant d'injecter sa résolution d'image catalogue
 * sans que ce module connaisse le catalogue. L'export ne le fournit pas.
 *
 * @param {Array} records
 * @param {{ pictureOf?: (name: string, record: any) => (string|null) }} options
 */
export function aggregateByShop(records, { pictureOf = null } = {}) {
  const shopMap = new Map()
  const eventsPerShop = new Map()

  for (const r of records || []) {
    if (!r) continue
    if (!shopMap.has(r.shopName)) {
      shopMap.set(r.shopName, new Map())
      eventsPerShop.set(r.shopName, new Set())
    }
    const itemsMap = shopMap.get(r.shopName)
    const key = itemNameOf(r)
    if (!key) continue
    if (!itemsMap.has(key)) {
      itemsMap.set(key, {
        name: key,
        menuItemId: r.menuItemId || null,
        type: resolveItemType(r),
        category: resolveItemCategory(r),
        picture: pictureOf ? pictureOf(key, r) : null,
        quantity: 0,
        revenue: 0,
        eventIds: new Set(),
      })
    }
    const it = itemsMap.get(key)
    if (!it.menuItemId && r.menuItemId) it.menuItemId = r.menuItemId
    it.quantity += r.quantity || 0
    it.revenue += r.revenue || 0
    if (r.eventId) it.eventIds.add(r.eventId)
    eventsPerShop.get(r.shopName).add(r.eventId)
  }

  const out = []
  for (const [shopName, itemsMap] of shopMap.entries()) {
    const items = [...itemsMap.values()]
      .map((i) => ({
        ...i,
        events: i.eventIds.size,
        avgQuantity: i.eventIds.size ? Math.round(i.quantity / i.eventIds.size) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
    const total = items.reduce((a, i) => a + i.quantity, 0)
    const nEvents = eventsPerShop.get(shopName).size
    out.push({
      name: shopName,
      items,
      total,
      events: nEvents,
      avg: nEvents ? Math.round(total / nEvents) : 0,
    })
  }
  return out.sort((a, b) => b.total - a.total)
}

/** Ventes groupées par article puis par PdV (vue « By item » du tableau). */
export function aggregateByItem(records) {
  const itemMap = new Map()

  for (const r of records || []) {
    if (!r) continue
    // Les agrégats shop-level n'ont pas de nom d'article : on les ignore plutôt
    // que de les regrouper sous un libellé fourre-tout.
    const key = itemNameOf(r)
    if (!key) continue
    if (!itemMap.has(key)) {
      itemMap.set(key, {
        name: key,
        menuItemId: r.menuItemId || null,
        type: resolveItemType(r),
        category: resolveItemCategory(r),
        totalQuantity: 0,
        totalRevenue: 0,
        shopMap: new Map(),
        eventsPerShop: new Map(),
      })
    }
    const it = itemMap.get(key)
    if (!it.menuItemId && r.menuItemId) it.menuItemId = r.menuItemId
    it.totalQuantity += r.quantity || 0
    it.totalRevenue += r.revenue || 0
    if (!it.shopMap.has(r.shopName)) {
      it.shopMap.set(r.shopName, { name: r.shopName, quantity: 0, revenue: 0 })
      it.eventsPerShop.set(r.shopName, new Set())
    }
    const s = it.shopMap.get(r.shopName)
    s.quantity += r.quantity || 0
    s.revenue += r.revenue || 0
    it.eventsPerShop.get(r.shopName).add(r.eventId)
  }

  const out = []
  for (const it of itemMap.values()) {
    const shopList = [...it.shopMap.values()]
      .map((s) => ({ ...s, events: it.eventsPerShop.get(s.name).size }))
      .sort((a, b) => b.revenue - a.revenue)
    out.push({
      name: it.name,
      menuItemId: it.menuItemId,
      type: it.type,
      category: it.category,
      totalQuantity: it.totalQuantity,
      totalRevenue: it.totalRevenue,
      shops: shopList,
    })
  }
  return out.sort((a, b) => b.totalRevenue - a.totalRevenue)
}

/**
 * Lignes d'export du tableau « Articles par PdV », dans les deux sens de lecture.
 *
 * Appelé par le bouton XLSX du composant ET par le dataset : une seule définition
 * des colonnes, donc pas de divergence possible entre les deux fichiers produits.
 *
 * @param {Array} records
 * @param {{ shop, item, type, category, quantity, revenue, events }} h  en-têtes traduits
 * @param {'shops'|'items'} view
 */
export function buildItemsByShopRows(records, h, view = 'items') {
  const rows = []
  if (view === 'shops') {
    for (const shop of aggregateByShop(records)) {
      for (const it of shop.items) {
        rows.push({
          [h.shop]: shop.name,
          [h.item]: it.name,
          [h.type]: it.type,
          [h.category]: it.category,
          [h.quantity]: it.quantity,
          [h.revenue]: round2(it.revenue),
        })
      }
    }
    return rows
  }
  for (const it of aggregateByItem(records)) {
    for (const s of it.shops) {
      rows.push({
        [h.item]: it.name,
        [h.type]: it.type,
        [h.category]: it.category,
        [h.shop]: s.name,
        [h.quantity]: s.quantity,
        [h.revenue]: round2(s.revenue),
        [h.events]: s.events,
      })
    }
  }
  return rows
}

// ─── Performance PdV ─────────────────────────────────────────────────────────

/**
 * Shops réellement affichés par le panneau « Performance des shops » : ceux qui
 * ont vendu, triés par CA décroissant.
 *
 * Le filtre et le tri vivent ICI et pas dans le composant, parce que le classeur
 * doit refléter ce qui est à l'écran : `useShopPerformance` construit sa liste
 * depuis une Map (ordre d'insertion), et sans ce passage l'onglet aurait montré
 * des PdV masqués dans la page, dans un ordre différent des cartes — et le seul
 * onglet du classeur non trié par valeur décroissante.
 *
 * Idempotent : le composant passe déjà sa liste visible, la réappliquer ne change
 * rien.
 */
export function visibleShopsForPerf(shops) {
  return [...(shops || [])]
    .filter((s) => (s?.transactionRate || 0) > 0 || (s?.totalRevenue || 0) > 0)
    .sort((a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0))
}

/**
 * Lignes de l'onglet « Performance des shops », version enrichie (8 colonnes).
 * Exige des shops passés par `useShopPerformance.enrich()` : les 3 métriques de
 * débit viennent de la timeline minute par minute.
 *
 * @param {Array} shops  sortie de useShopPerformance
 * @param {object} h     en-têtes traduits
 */
export function buildShopPerfRows(shops, h) {
  return visibleShopsForPerf(shops).map((s) => ({
    [h.shop]: s.elementName || s.shopName,
    [h.revenue]: round2(s.totalRevenue),
    [h.transactions]: Math.round(s.totalTransactions || 0),
    [h.rate]: round2(s.transactionRate),
    [h.firstHour]: s.first60MinTransactionRate ? round2(s.first60MinTransactionRate) : null,
    [h.peak]: s.peakTransactionRate ? round2(s.peakTransactionRate) : null,
    [h.events]: s.eventCount,
    [h.minutes]: Math.round(s.operatingMinutes || 0),
  }))
}

/**
 * BUG-298-01 — Coût (et CA de même grain) par événement, depuis les records
 * ITEM-LEVEL.
 *
 * `shopGranularData` (API `shop-details`) est shop-level : ses lignes ne portent
 * AUCUN `menuItemId`. Le coût, lui, ne se résout que par article (coût unitaire ×
 * quantité) : sur ce grain `costMap[r.menuItemId]` vaut donc toujours 0. C'est la
 * raison pour laquelle le getter `filteredEventAggregates`
 * (store/modules/analyse.js) renvoie un coût nul pour chaque event, alors que le
 * KPI COÛT du bandeau — qui agrège `event-timeline`, grain article — est juste.
 *
 * Formule VERBATIM du KPI (`useMetricsCalculator.js`) : recalcul à la volée, et
 * surtout PAS `r.totalCost`. Ce dernier est figé au pré-traitement avec la costMap
 * du moment, qui peut encore être vide en phase 1 (cf. `useSpaceData.js`) — la
 * somme des barres doit égaler le KPI, pas un instantané périmé.
 *
 * Le CA est cumulé dans la même passe pour que tout ratio dérivé (marge) reste
 * d'un SEUL grain : croiser un coût item-level avec le CA shop-level des agrégats
 * produit des marges négatives ou > 100 % dès que les deux grains divergent.
 *
 * @param {Array} records  records item-level (portent `menuItemId`)
 * @param {Object<string, number>} costMap  menuItemId → coût unitaire
 * @returns {Map<string, {cost: number, revenue: number}>} eventId → totaux. VIDE
 *   si aucun record item-level : l'appelant doit alors laisser ses agrégats
 *   intacts, surtout pas écrire 0 (l'item-level se charge en asynchrone, un 0
 *   transitoire serait un faux chiffre affiché).
 */
export function itemLevelTotalsByEvent(records, costMap = {}) {
  const byEvent = new Map()
  for (const r of records || []) {
    if (!r?.eventId || r.menuItemId == null) continue
    const unitCost = costMap[r.menuItemId] || 0
    let totals = byEvent.get(r.eventId)
    if (!totals) {
      totals = { cost: 0, revenue: 0 }
      byEvent.set(r.eventId, totals)
    }
    totals.cost += unitCost * (r.quantity || 0)
    totals.revenue += r.revenue || 0
  }
  return byEvent
}

/**
 * Repli sans débit : agrégats de base par PdV, calculés depuis les records déjà
 * en mémoire.
 *
 * Sert quand le panneau « Performance des shops » n'a jamais été ouvert. On ne
 * déclenche PAS `enrich()` à sa place : cette même référence alimente le
 * leaderboard de la colonne droite (SummaryPanel `:shop-rates`), qu'un export ne
 * doit pas modifier — un bouton de téléchargement qui change la page est un bug.
 *
 * @param {Array} records  shop-level filtré
 * @param {object} h       en-têtes traduits
 */
export function buildBaseShopRows(records, h) {
  const byShop = new Map()
  for (const r of records || []) {
    if (!r) continue
    const name = r.shopName || '—'
    let s = byShop.get(name)
    if (!s) {
      s = { name, revenue: 0, transactions: 0, eventIds: new Set() }
      byShop.set(name, s)
    }
    s.revenue += r.revenue || 0
    s.transactions += r.transactionCount || 0
    if (r.eventId) s.eventIds.add(r.eventId)
  }
  return [...byShop.values()]
    .sort((a, b) => b.revenue - a.revenue)
    .map((s) => ({
      [h.shop]: s.name,
      [h.revenue]: round2(s.revenue),
      [h.transactions]: Math.round(s.transactions),
      [h.events]: s.eventIds.size,
    }))
}
