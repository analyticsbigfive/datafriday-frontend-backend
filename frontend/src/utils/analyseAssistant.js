// =============================================================================
//  Assistant analytique local — DataFriday
// =============================================================================
//  Architecture 100 % frontend, gratuite, sans backend ni LLM.
//  • Lit directement les getters Vuex du module `analyse` (filtres respectés).
//  • Calculs déterministes, exacts, instantanés.
//  • Matching intent par regex (fallback simple, extensible plus tard à
//    Transformers.js pour un matching sémantique côté navigateur).
//
//  Public API :
//    - answer(store, query)     -> { ok, intent, text, data?, suggestions? }
//    - SUGGESTION_GROUPS        -> tour d'horizon catégorisé pour l'UI
//    - SUGGESTIONS              -> liste à plat (rétro-compat)
// =============================================================================

import {
  formatCurrency,
  formatCurrencyDetailed,
  formatNumber,
  formatPercent,
  formatVariation,
} from '@/composables/useFormatters'

// ─── Tour d'horizon catégorisé ──────────────────────────────────────────────
export const SUGGESTION_GROUPS = [
  {
    id: 'kpi',
    label: 'Vue d\'ensemble',
    icon: 'mdi-view-dashboard-outline',
    items: ['CA total', 'Synthèse des KPI', 'Combien de transactions', 'Combien d\'événements'],
  },
  {
    id: 'top',
    label: 'Top performers',
    icon: 'mdi-trophy-outline',
    items: ['Top 5 articles', 'Top 10 articles', 'Top 5 shops', 'Meilleur événement'],
  },
  {
    id: 'compare',
    label: 'Comparaisons',
    icon: 'mdi-compare-horizontal',
    items: ['vs N-1', 'vs période précédente', 'Évolution année dernière'],
  },
  {
    id: 'finance',
    label: 'Coûts & marge',
    icon: 'mdi-cash-multiple',
    items: ['Coût total', 'Marge moyenne', 'Panier moyen', 'Moyenne par spectateur'],
  },
  {
    id: 'by_event',
    label: 'Par type d\'événement',
    icon: 'mdi-tag-multiple-outline',
    items: [
      'Mon plus gros concert',
      'Combien de matchs de basket ?',
      'Top 3 articles sur les MMA',
      'Quel stand cartonne le plus en sport ?',
      'Meilleur meeting',
      'Top concerts',
      'Concerts vs période précédente',
      'Top articles sur la boxe',
      'Marge sur les concerts',
      'Moyenne par spectateur sur le basket',
      'Évolution du sport vs N-1',
      'Meilleur événement de volley',
    ],
  },
  {
    id: 'filters',
    label: 'Filtres',
    icon: 'mdi-filter-variant',
    items: ['Mes filtres actifs', 'Efface tous les filtres', 'Aide'],
  },
]

export const SUGGESTIONS = SUGGESTION_GROUPS.flatMap((g) => g.items)

// ─── Helpers de formatage ───────────────────────────────────────────────────
function fmtSign(v) {
  if (v == null || Number.isNaN(v)) return 'n/d'
  const s = formatVariation(v)
  return v >= 0 ? `+${s}` : s
}

/**
 * Lignes d'une table du dataset Analyse (`useAnalyseDataset`), ou `null`.
 *
 * `null` signifie « pas de réponse fiable ici » et déclenche le repli sur le
 * chemin historique. Pas besoin de comparer une signature : le composable
 * REMET le dataset à `null` dès que les filtres changent, avant de reconstruire
 * en idle — un dataset présent est donc, par construction, à jour. C'est plus
 * sûr qu'une comparaison, qui supposerait de réimplémenter ici le hachage des
 * filtres et de le garder synchronisé.
 */
function datasetRows(store, key) {
  const dataset = store.state?.analyse?.dataset
  if (!dataset) return null
  const table = (dataset.tables || []).find((tb) => tb.key === key)
  return table && table.rows.length ? table.rows : null
}

function topByRevenue(records, key, n) {
  const map = new Map()
  for (const r of records) {
    if (!r) continue
    const k = r[key]
    if (!k) continue
    const cur = map.get(k) || { name: k, revenue: 0, quantity: 0, transactions: 0 }
    cur.revenue += r.revenue || 0
    cur.quantity += r.quantity || 0
    cur.transactions += r.transactionCount || 0
    map.set(k, cur)
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, n)
}

// ─── Vocabulaire d'entités (FR → catégorie/type d'événement) ────────────────
// Permet de comprendre "mon plus gros concert" → filter eventType=Concert.
// Mots-clés flexibles, accents normalisés, pluriels via radicaux.
const EVENT_TYPE_KEYWORDS = {
  Concert: ['concert', 'show', 'live', 'spectacle', 'musique', 'gig'],
  Basket: ['basket', 'basketball', 'nba', 'euroleague', 'lnb'],
  MMA: ['mma', 'combat', 'boxe', 'boxing', 'ufc', 'arts martiaux', 'cage'],
  Volley: ['volley', 'volleyball'],
  Meeting: ['meeting', 'reunion', 'conference', 'conférence', 'politique'],
}
const EVENT_CATEGORY_KEYWORDS = {
  Sport: ['sport', 'sportif', 'match', 'compétition', 'competition', 'rencontre'],
  Culture: ['culture', 'culturel', 'artistique'],
  Corporate: ['corporate', 'entreprise', 'professionnel', 'pro'],
}

function normalize(str) {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // retire accents
}

/**
 * Extrait les entités (eventType, category) d'une question.
 * @returns {{ eventType?: string, category?: string, raw: string }}
 */
export function extractEventEntities(query) {
  const q = ' ' + normalize(query) + ' '
  const out = { raw: query }

  // 1) Type d'événement (plus spécifique → priorité)
  for (const [type, words] of Object.entries(EVENT_TYPE_KEYWORDS)) {
    for (const w of words) {
      // \b ne marche pas après normalize ; on utilise des espaces.
      const re = new RegExp(`[\\s'"-]${normalize(w)}s?[\\s'"-?.!,]`, 'i')
      if (re.test(q)) {
        out.eventType = type
        break
      }
    }
    if (out.eventType) break
  }

  // 2) Catégorie (fallback si pas de type précis)
  if (!out.eventType) {
    for (const [cat, words] of Object.entries(EVENT_CATEGORY_KEYWORDS)) {
      for (const w of words) {
        const re = new RegExp(`[\\s'"-]${normalize(w)}s?[\\s'"-?.!,]`, 'i')
        if (re.test(q)) {
          out.category = cat
          break
        }
      }
      if (out.category) break
    }
  }

  return out
}

/**
 * Filtre les events par eventType ou category (sans muter).
 */
function filterEventsByEntity(events, entities) {
  if (!entities || (!entities.eventType && !entities.category)) return events
  return events.filter((e) => {
    if (entities.eventType && e.eventType !== entities.eventType) return false
    if (entities.category && e.category !== entities.category) return false
    return true
  })
}

/** Libellé humain de l'entité pour affichage ("Concert", "événement Sport"...). */
function entityLabel(entities) {
  if (entities?.eventType) return entities.eventType.toLowerCase()
  if (entities?.category) return `événement ${entities.category.toLowerCase()}`
  return null
}

/** Renvoie true si une entité event a été détectée. */
function hasEntity(entities) {
  return !!(entities && (entities.eventType || entities.category))
}

/**
 * Recalcule les totaux (revenue, cost, margin, transactions, attendees)
 * en filtrant records + events par entité. Si pas d'entité, retourne null
 * pour laisser l'appelant utiliser le getter Vuex (plus rapide).
 */
function computeTotalsForEntities(store, entities) {
  if (!hasEntity(entities)) return null
  const events = store.getters['analyse/filteredEvents'] || []
  const scopedEvents = filterEventsByEntity(events, entities)
  const ids = new Set(scopedEvents.map((e) => e.id))
  const records = (store.getters['analyse/filteredShopGranularData'] || []).filter((r) =>
    ids.has(r.eventId),
  )
  let revenue = 0
  let cost = 0
  let transactions = 0
  for (const r of records) {
    revenue += r.revenue || 0
    cost += r.cost || 0
    transactions += r.transactionCount || 0
  }
  const attendees = scopedEvents.reduce((s, e) => s + (e.attendees || 0), 0)
  const margin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : 0
  return {
    revenue,
    cost,
    margin,
    transactions,
    attendees,
    eventsCount: scopedEvents.length,
    scopedEvents,
    records,
  }
}

/** Suffixe " (concerts uniquement)" si une entité est définie. */
function scopeSuffix(entities) {
  const lbl = entityLabel(entities)
  return lbl ? ` *(${lbl}s uniquement)*` : ''
}

// ─── Outils (calculs purs sur le store) ─────────────────────────────────────
const TOOLS = {
  greet() {
    return {
      text: 'Bonjour ! Posez-moi une question sur vos données — top articles, CA, comparaisons N-1, marge, événements…',
    }
  },

  help() {
    return {
      text: [
        '**Voici ce que je sais faire :**',
        '• Top articles — *« top 5 articles »*',
        '• CA total — *« quel est le chiffre d\'affaires »*',
        '• Comparaisons N-1 / Précédent — *« vs n-1 »*, *« vs période précédente »*',
        '• Coûts & marge — *« coût total »*, *« marge moyenne »*',
        '• Événements — *« combien d\'événements »*, *« meilleur événement »*',
        '• Shops / PdV — *« top shops »*',
        '• Transactions — *« combien de transactions »*',
      ].join('\n'),
    }
  },

  topMenuItems(store, { n = 5, entities } = {}) {
    let records = store.getters['analyse/filteredShopGranularData']
    const events = store.getters['analyse/filteredEvents'] || []
    const filteredEvents = filterEventsByEntity(events, entities)
    const scopedByEntity = !!(entities && (entities.eventType || entities.category))
    if (scopedByEntity) {
      const ids = new Set(filteredEvents.map((e) => e.id))
      records = records.filter((r) => ids.has(r.eventId))
    }
    // `filteredShopGranularData` est du SHOP-level : `menuItemName` y vaut null,
    // et `topByRevenue` écarte toute clé falsy → la question « top articles »
    // triait un ensemble vide. Le grain article n'existe que dans le dataset
    // (`useAnalyseDataset`, table `topArticles`, item-level réconcilié).
    //
    // Le repli reste le chemin historique dans deux cas : dataset absent (pas
    // encore construit — il l'est en idle après le rendu) et question portée par
    // une entité (type/catégorie d'événement), périmètre que les tables agrégées
    // ont perdu puisqu'elles ne portent plus d'eventId.
    const fromDataset = scopedByEntity ? null : datasetRows(store, 'topArticles')
    const list = fromDataset
      ? fromDataset.slice(0, n).map((r) => ({
          name: r.label,
          revenue: r.revenue || 0,
          quantity: r.quantity || 0,
          transactions: 0,
        }))
      : topByRevenue(records, 'menuItemName', n)
    if (!list.length) {
      const lbl = entityLabel(entities)
      return { text: lbl ? `Aucune donnée pour les ${lbl}s.` : 'Aucune donnée disponible pour la sélection actuelle.' }
    }
    const lines = list.map(
      (it, i) =>
        `${i + 1}. **${it.name}** — ${formatCurrency(it.revenue)} *(${formatNumber(it.quantity)} unités)*`,
    )
    const lbl = entityLabel(entities)
    const suffix = lbl ? ` *(${lbl}s uniquement)*` : ' *(filtres actifs)*'
    return { text: `**Top ${list.length} articles**${suffix} :\n${lines.join('\n')}`, data: list }
  },

  topShops(store, { n = 5, entities } = {}) {
    let records = store.getters['analyse/filteredShopGranularData']
    const events = store.getters['analyse/filteredEvents'] || []
    const filteredEvents = filterEventsByEntity(events, entities)
    const scopedByEntity = !!(entities && (entities.eventType || entities.category))
    if (scopedByEntity) {
      const ids = new Set(filteredEvents.map((e) => e.id))
      records = records.filter((r) => ids.has(r.eventId))
    }
    // Le shop-level répondait déjà juste ici : on rebranche pour la cohérence,
    // pas pour corriger. L'assistant et le panneau « Performance des shops »
    // affichaient les mêmes nombres par deux agrégations distinctes — une de
    // trop. Même repli que topMenuItems (dataset absent, ou question portée par
    // une entité).
    const fromDataset = scopedByEntity ? null : datasetRows(store, 'shopPerformance')
    const list = fromDataset
      ? fromDataset.slice(0, n).map((r) => ({
          name: r.shop,
          revenue: r.revenue || 0,
          quantity: 0,
          transactions: r.transactions || 0,
        }))
      : topByRevenue(records, 'shopName', n)
    if (!list.length) {
      const lbl = entityLabel(entities)
      return { text: lbl ? `Aucune donnée pour les ${lbl}s.` : 'Aucune donnée disponible pour la sélection actuelle.' }
    }
    const lines = list.map(
      (s, i) =>
        `${i + 1}. **${s.name}** — ${formatCurrency(s.revenue)} *(${formatNumber(s.transactions)} transactions)*`,
    )
    const lbl = entityLabel(entities)
    const suffix = lbl ? ` *(${lbl}s uniquement)*` : ''
    return { text: `**Top ${list.length} points de vente**${suffix} :\n${lines.join('\n')}`, data: list }
  },

  kpiSummary(store, { entities } = {}) {
    const scoped = computeTotalsForEntities(store, entities)
    const totals = scoped || store.getters['analyse/currentPeriodTotals']
    const events = scoped ? scoped.scopedEvents : store.getters['analyse/filteredEvents']
    if (!totals || !events?.length) {
      const lbl = entityLabel(entities)
      return { text: lbl ? `Aucun ${lbl} dans la sélection courante.` : 'Aucune donnée pour la sélection actuelle.' }
    }
    const suffix = scopeSuffix(entities)
    return {
      text: [
        `**Synthèse de la période courante**${suffix}`,
        `• CA total : **${formatCurrencyDetailed(totals.revenue)}**`,
        `• Coût total : ${formatCurrencyDetailed(totals.cost)}`,
        `• Marge : **${formatPercent(totals.margin)}**`,
        `• Événements : ${events.length}`,
        `• Transactions : ${formatNumber(totals.transactions)}`,
        `• Spectateurs : ${formatNumber(totals.attendees)}`,
      ].join('\n'),
      data: totals,
    }
  },

  costSummary(store, { entities } = {}) {
    const t = computeTotalsForEntities(store, entities) || store.getters['analyse/currentPeriodTotals']
    if (!t || !t.revenue) return { text: 'Aucune donnée disponible.' }
    const suffix = scopeSuffix(entities)
    return {
      text:
        `Coût total${suffix} : **${formatCurrencyDetailed(t.cost)}** ` +
        `(soit ${formatPercent((t.cost / t.revenue) * 100)} du CA, marge ${formatPercent(t.margin)}).`,
    }
  },

  margin(store, { entities } = {}) {
    const t = computeTotalsForEntities(store, entities) || store.getters['analyse/currentPeriodTotals']
    if (!t || !t.revenue) return { text: 'Aucune donnée disponible.' }
    const suffix = scopeSuffix(entities)
    return {
      text: `Marge moyenne${suffix} : **${formatPercent(t.margin)}** sur ${formatCurrencyDetailed(t.revenue)} de CA.`,
    }
  },

  perCapita(store, { entities } = {}) {
    const t = computeTotalsForEntities(store, entities) || store.getters['analyse/currentPeriodTotals']
    if (!t || !t.attendees) return { text: 'Aucune donnée disponible.' }
    const suffix = scopeSuffix(entities)
    return {
      text: `Panier par tête${suffix} : **${formatCurrency(t.revenue / t.attendees)}** (${formatNumber(t.attendees)} spectateurs).`,
    }
  },

  avgTransaction(store, { entities } = {}) {
    const t = computeTotalsForEntities(store, entities) || store.getters['analyse/currentPeriodTotals']
    if (!t || !t.transactions) return { text: 'Aucune donnée disponible.' }
    const suffix = scopeSuffix(entities)
    return {
      text: `Transaction moyenne${suffix} : **${formatCurrency(t.revenue / t.transactions)}** sur ${formatNumber(t.transactions)} transactions.`,
    }
  },

  transactions(store, { entities } = {}) {
    const t = computeTotalsForEntities(store, entities) || store.getters['analyse/currentPeriodTotals']
    if (!t) return { text: 'Aucune donnée disponible.' }
    const suffix = scopeSuffix(entities)
    return {
      text: `**${formatNumber(t.transactions)}** transactions${suffix} sur la période, pour ${formatCurrencyDetailed(t.revenue)} de CA.`,
    }
  },

  eventsCount(store, { entities } = {}) {
    const events = store.getters['analyse/filteredEvents'] || []
    const total = (store.state.analyse.events || []).length
    if (entities?.eventType || entities?.category) {
      const scoped = filterEventsByEntity(events, entities)
      const lbl = entityLabel(entities)
      return {
        text: `**${scoped.length}** ${lbl}${scoped.length > 1 ? 's' : ''} dans la sélection courante (${events.length} événements au total filtrés, ${total} au global).`,
        data: scoped,
      }
    }
    return {
      text: `**${events.length}** événement${events.length > 1 ? 's' : ''} dans la sélection courante (${total} au total).`,
    }
  },

  bestEvent(store, { entities, n = 1 } = {}) {
    const records = store.getters['analyse/filteredShopGranularData']
    const events = store.getters['analyse/filteredEvents'] || []
    const scoped = filterEventsByEntity(events, entities)
    const scopedIds = new Set(scoped.map((e) => e.id))
    const lbl = entityLabel(entities)

    // Si l'utilisateur a précisé une catégorie/type ET aucun event ne matche → message dédié.
    if ((entities?.eventType || entities?.category) && !scoped.length) {
      return {
        text: `Aucun ${lbl} dans la sélection courante.\nAjustez vos filtres ou tapez *« combien d'événements »*.`,
      }
    }

    const byEvent = new Map()
    for (const r of records) {
      if ((entities?.eventType || entities?.category) && !scopedIds.has(r.eventId)) continue
      byEvent.set(r.eventId, (byEvent.get(r.eventId) || 0) + (r.revenue || 0))
    }
    const sorted = [...byEvent.entries()].sort((a, b) => b[1] - a[1])
    if (!sorted.length) return { text: 'Aucun événement dans la sélection.' }

    // Si on demande "les concerts" (pluriel détecté) ou top, on liste plusieurs.
    const showTop = n > 1 || sorted.length > 1 && /\b(top|liste|tous?|tous les|meilleur(s|es))\b/i.test(entities?.raw || '')
    if (showTop && (entities?.eventType || entities?.category)) {
      const top = sorted.slice(0, Math.min(5, sorted.length))
      const lines = top.map(([id, rev], i) => {
        const ev = events.find((e) => e.id === id)
        return `${i + 1}. **${ev?.name || id}** — ${formatCurrencyDetailed(rev)}`
      })
      return {
        text: `**Top ${top.length} ${lbl}s** par CA :\n${lines.join('\n')}`,
        data: top,
      }
    }

    const [bestId, bestRevenue] = sorted[0]
    const ev = events.find((e) => e.id === bestId)
    const prefix = lbl ? `Meilleur ${lbl}` : 'Meilleur événement'
    return {
      text:
        `${prefix} : **${ev?.name || bestId}** — ${formatCurrencyDetailed(bestRevenue)} de CA` +
        (ev?.attendees ? ` *(${formatNumber(ev.attendees)} spectateurs)*` : '') +
        '.',
      data: { eventId: bestId, revenue: bestRevenue, event: ev },
    }
  },

  compareYoY(store, { entities } = {}) {
    const v = store.getters['analyse/variationsYoY']
    if (!v) return { text: 'Comparaison N-1 indisponible.' }
    const lbl = entityLabel(entities)
    const note = lbl
      ? `\n*ℹ️ Variations calculées sur l'ensemble de la période (filtre ${lbl} non appliqué sur N-1).*`
      : ''
    return {
      text: [
        '**Comparaison vs N-1**',
        `• CA : ${fmtSign(v.revenue)}`,
        `• Transactions : ${fmtSign(v.transactions)}`,
        `• Spectateurs : ${fmtSign(v.attendees)}`,
        `• Marge : ${fmtSign(v.margin)}`,
        `• Panier moyen : ${fmtSign(v.avgTransaction)}`,
      ].join('\n') + note,
      data: v,
    }
  },

  comparePrev(store, { entities } = {}) {
    const v = store.getters['analyse/variationsPrev']
    if (!v) return { text: 'Comparaison période précédente indisponible.' }
    const lbl = entityLabel(entities)
    const note = lbl
      ? `\n*ℹ️ Variations sur l'ensemble de la période (filtre ${lbl} non appliqué historiquement).*`
      : ''
    return {
      text: [
        '**Comparaison vs période précédente**',
        `• CA : ${fmtSign(v.revenue)}`,
        `• Transactions : ${fmtSign(v.transactions)}`,
        `• Spectateurs : ${fmtSign(v.attendees)}`,
        `• Marge : ${fmtSign(v.margin)}`,
        `• Panier moyen : ${fmtSign(v.avgTransaction)}`,
      ].join('\n') + note,
      data: v,
    }
  },

  activeFilters(store) {
    const chips = store.getters['analyse/activeFilterChips'] || []
    if (!chips.length) return { text: 'Aucun filtre actif. Vous voyez la totalité des données.' }
    return { text: `**Filtres actifs** :\n${chips.map((c) => `• ${c.label}`).join('\n')}` }
  },

  resetFilters(store) {
    store.dispatch('analyse/resetFilters')
    return { text: '✅ Tous les filtres ont été réinitialisés.' }
  },
}

// ─── Intents (regex → tool) ─────────────────────────────────────────────────
const INTENTS = [
  { id: 'greeting', patterns: [/^(bonjour|salut|hello|hi|hey|coucou)\b/i], tool: 'greet' },
  { id: 'help', patterns: [/^(aide|help|que.*(peux|sais).*(tu|vous))/i, /comment ça marche/i], tool: 'help' },
  {
    id: 'top_items',
    patterns: [
      /top\s*(\d+)?\s*(article|item|produit|menu)/i,
      /(meilleur|best).*(vente|seller|article|produit)/i,
      /produits?\s+les\s+plus\s+vendus?/i,
      /articles?\s+phare/i,
    ],
    tool: 'topMenuItems',
    captureN: 1,
    defaultN: 5,
  },
  {
    id: 'top_shops',
    patterns: [
      /top\s*(\d+)?\s*(shop|pdv|point.de.vente|boutique|stand)/i,
      /(meilleur|best).*(shop|pdv|boutique|stand)/i,
      /(stand|pdv|boutique|shop).*(plus|gros|meilleur|cartonne|marche|performe)/i,
      /(stand|pdv|boutique|shop).*(rentable|ca|revenu)/i,
      /(quel|quels)\s+(stand|pdv|boutique|shop).*(cartonne|marche|performe|rentable)/i,
    ],
    tool: 'topShops',
    captureN: 1,
    defaultN: 5,
  },
  {
    id: 'kpis',
    patterns: [/kpi/i, /indicateurs?/i, /statistiques?\s+globales?/i, /résumé\s+(des\s+)?perform/i, /synthèse/i],
    tool: 'kpiSummary',
  },
  {
    id: 'ca_total',
    patterns: [
      /\bca\s+total\b/i,
      /\bca\s+(des?|du|de\s+la|sur\s+les?)?\s*(concerts?|matchs?|spectacles?|basket|mma|volley|meeting|sport|culture|corporate)/i,
      /chiffre.d.affaires?/i,
      /revenu\s+total/i,
      /total.*(revenu|ventes?)/i,
      /combien.*(j.ai|on.a|nous.avons).*(gagn|fait|vendu)/i,
    ],
    tool: 'kpiSummary',
  },
  {
    id: 'compare_prev',
    patterns: [/vs\s*pr[ée]c[ée]dent/i, /compar.*(p[ée]riode\s*pr[ée]c|précédent)/i, /(évolution|variation).*(p[ée]riode|mois)/i],
    tool: 'comparePrev',
  },
  {
    id: 'compare_yoy',
    patterns: [
      /vs\s*n.?1/i,
      /compar.*(n.?1|année.*pr[ée]c|an.*dernier)/i,
      /(évolution|variation).*(an|année)/i,
      /year.over.year/i,
    ],
    tool: 'compareYoY',
  },
  { id: 'events_count', patterns: [/combien.*(événement|event|évenement|concert|match|spectacle|basket|mma|volley|meeting)/i, /nombre.*(événement|event|évenement|concert|match|spectacle|basket|mma|volley|meeting)/i], tool: 'eventsCount' },
  {
    id: 'best_event',
    patterns: [
      /(meilleur|best|plus.gros|top).*(événement|event|évenement|concert|match|spectacle|basket|mma|volley|volleyball|meeting|sport|culture|boxe)/i,
      /(événement|concert|match|spectacle|basket|mma|volley|volleyball|meeting|boxe).*(plus.*(rentable|gros|ca|revenu))/i,
      /(mon|le|la)\s+(plus.gros|meilleur|best)\s+(concert|match|spectacle|basket|mma|volley|volleyball|meeting|boxe|événement)/i,
      /meilleur\s+événement\s+(de|du|des|en)\s+(concert|match|spectacle|basket|mma|volley|volleyball|meeting|boxe|sport|culture|corporate)/i,
    ],
    tool: 'bestEvent',
  },
  { id: 'transactions', patterns: [/combien.*(transaction|ticket)/i, /nombre.*(transaction|ticket)/i, /total.*(transaction)/i, /transactions?\s+(des?|du|de\s+la|sur\s+les?|au[x]?)?\s*(concerts?|matchs?|spectacles?|basket|mma|volley|meeting|sport|culture|corporate)/i], tool: 'transactions' },
  {
    id: 'cost_total',
    patterns: [
      /co[uû]t\s+total/i,
      /co[uû]ts?\s+(des?|du|de\s+la|sur\s+les?)?\s*(concerts?|matchs?|spectacles?|basket|mma|volley|meeting|sport|culture|corporate)/i,
      /total.*(co[uû]t|d[ée]penses?)/i,
      /combien.*(d[ée]pens|co[uû]t)/i,
    ],
    tool: 'costSummary',
  },
  { id: 'margin', patterns: [/marge\s+(moyen|globale|totale)?/i, /marge\s+(des?|du|de\s+la|sur\s+les?|au[x]?)?\s*(concerts?|matchs?|spectacles?|basket|mma|volley|meeting|sport|culture|corporate)/i, /rentabilit[ée]/i, /profit\s+(global|moyen)?/i], tool: 'margin' },
  {
    id: 'per_capita',
    patterns: [/par\s+t[êe]te/i, /per\s*capita/i, /panier\s+moyen.*(spectateur|visiteur)/i, /moyenne\s+par\s+(spectateur|visiteur)/i],
    tool: 'perCapita',
  },
  { id: 'avg_transaction', patterns: [/(panier|ticket|transaction)\s+moyen/i, /moyenne.*(transaction|panier)/i], tool: 'avgTransaction' },
  { id: 'filters', patterns: [/(quels?|mes)\s+filtres?/i, /filtres?\s+actifs?/i], tool: 'activeFilters' },
  { id: 'reset_filters', patterns: [/(efface|enl[èe]ve|reset|remet|annul).*(filtres?)/i, /tout\s+effacer/i], tool: 'resetFilters' },
]

function findIntent(text) {
  const t = (text || '').toLowerCase().trim()
  if (!t) return null
  for (const intent of INTENTS) {
    for (const re of intent.patterns) {
      const m = t.match(re)
      if (m) return { intent, match: m }
    }
  }
  return null
}

function extractParams(intent, match, query) {
  const params = {}
  if (intent.captureN && match[intent.captureN]) {
    const n = parseInt(match[intent.captureN], 10)
    if (Number.isFinite(n) && n > 0 && n <= 50) params.n = n
  }
  if (params.n == null && intent.defaultN) params.n = intent.defaultN
  // Entity extraction — toujours actif, ignoré par les outils qui ne s'en servent pas.
  params.entities = extractEventEntities(query || '')
  return params
}

// ─── API publique : answer(store, query) ────────────────────────────────────
export function answer(store, query) {
  const found = findIntent(query)
  if (!found) {
    return {
      ok: false,
      intent: null,
      text:
        "Je ne suis pas sûr de comprendre. Essayez par exemple :\n" +
        "• *« top 5 articles »*\n" +
        "• *« CA total »*\n" +
        "• *« vs N-1 »*\n" +
        "• *« meilleur événement »*\n" +
        "Ou tapez **aide** pour la liste complète.",
    }
  }
  return runTool(found.intent.tool, store, extractParams(found.intent, found.match, query))
}

// Variante asynchrone : tente d'abord regex (instantané), puis fallback
// sémantique via Transformers.js si activé. Utile pour les paraphrases.
export async function answerSemantic(store, query, { enableSemantic = true } = {}) {
  // 1) Match regex prioritaire (rapide, déterministe)
  const found = findIntent(query)
  if (found) {
    return runTool(found.intent.tool, store, extractParams(found.intent, found.match, query))
  }

  // 2) Fallback sémantique (Transformers.js)
  if (enableSemantic) {
    try {
      const { findIntentSemantic } = await import('./analyseAssistantSemantic')
      const semantic = await findIntentSemantic(query)
      if (semantic?.tool) {
        // Même en sémantique on extrait les entités → "plus gros concert" filtre par eventType.
        const params = { entities: extractEventEntities(query) }
        const out = runTool(semantic.tool, store, params)
        return { ...out, intent: semantic.tool, semantic: true, score: semantic.score }
      }
    } catch (e) {
      console.warn('[analyseAssistant] semantic matcher failed:', e)
    }
  }

  return {
    ok: false,
    intent: null,
    text:
      "Je réponds seulement sur **les données de cet écran** (ventes, CA, marge, " +
      "points de vente, événements). Reformulez ou essayez :\n" +
      "• *« top 5 articles »*\n" +
      "• *« quel est mon meilleur point de vente »*\n" +
      "• *« CA total »* · *« ma marge »*\n" +
      "• *« meilleur événement »* · *« vs N-1 »*\n" +
      "Tapez **aide** pour la liste complète.",
  }
}

function runTool(toolName, store, params) {
  try {
    const fn = TOOLS[toolName]
    if (typeof fn !== 'function') {
      return { ok: false, intent: toolName, text: `⚠️ Outil \`${toolName}\` introuvable.` }
    }
    const out = fn(store, params)
    return { ok: true, intent: toolName, ...out }
  } catch (e) {
    console.error('[analyseAssistant]', e)
    return { ok: false, intent: toolName, text: `❌ Erreur : ${e.message || e}` }
  }
}

// Renderer markdown léger sécurisé — utilisable côté composant via v-html.
export function renderAssistantMarkdown(text) {
  if (text == null) return ''
  let html = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  html = html.replace(/^• (.+)$/gm, '<div class="aa-li">• $1</div>')
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<div class="aa-li">$1. $2</div>')
  html = html.replace(/\n/g, '<br/>')
  return html
}
