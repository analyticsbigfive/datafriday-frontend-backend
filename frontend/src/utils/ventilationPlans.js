// Ventilation de PLUSIEURS matchs (maquettes Bertrand du 2026-10-09 : « possibilité
// de choisir plusieurs events qui agrègent les nombres d'éléments à déposer »).
//
// Chaque match a sa feuille de réarmement (la plus récemment modifiée qui le
// contient, même règle que le serveur). Les feuilles choisies sont fusionnées en une
// seule feuille virtuelle :
//   - rowKey préfixé par l'id de la feuille (`planId::rowKey`), corrections et lignes
//     cochées « réarmé » renommées pareil : deux feuilles peuvent porter la même ligne ;
//   - lignes dans l'ordre chronologique des feuilles : buildDepositLines impute les
//     dépôts dans cet ordre, le match le plus proche est donc couvert en premier ;
//   - les dépôts comptent pour TOUS les matchs de chaque feuille : une feuille qui
//     couvre deux matchs n'affiche pas deux fois ce qui a déjà été déposé.
// Fonctions PURES.

const PLAN_KEY_SEP = '::'

/** rowKey d'une ligne dans la feuille fusionnée. */
export function mergedRowKey(planId, rowKey) {
  return `${planId}${PLAN_KEY_SEP}${rowKey}`
}

/** Feuille et rowKey d'origine d'une ligne de la feuille fusionnée. */
export function splitMergedRowKey(key) {
  const s = String(key || '')
  const i = s.indexOf(PLAN_KEY_SEP)
  if (i < 0) return { planId: null, rowKey: s }
  return { planId: s.slice(0, i), rowKey: s.slice(i + PLAN_KEY_SEP.length) }
}

/**
 * Feuille de chaque match : la première de la liste (triée par modification
 * décroissante) qui le contient ; une feuille commune à plusieurs matchs n'est
 * gardée qu'une fois.
 * @param {Array<{id:string, selectedEventIds?:string[]}>} plans liste du serveur, plus récentes d'abord
 * @param {string[]} eventIds matchs choisis
 */
export function pickPlansForEvents(plans, eventIds) {
  const out = []
  const seen = new Set()
  for (const eventId of eventIds || []) {
    const plan = (plans || []).find((p) => (p.selectedEventIds || []).map(String).includes(String(eventId)))
    if (plan && !seen.has(String(plan.id))) {
      seen.add(String(plan.id))
      out.push(plan)
    }
  }
  return out
}

function remapKeys(obj, planId) {
  const out = {}
  for (const [k, v] of Object.entries(obj && typeof obj === 'object' ? obj : {})) out[mergedRowKey(planId, k)] = v
  return out
}

/**
 * Rang chronologique d'une feuille : celui de son match le plus proche parmi
 * `eventOrder` (matchs triés par date) ; une feuille sans match connu passe à la fin.
 */
function planRank(plan, eventOrder) {
  const ranks = (plan.selectedEventIds || []).map((id) => eventOrder.indexOf(String(id))).filter((r) => r >= 0)
  return ranks.length ? Math.min(...ranks) : Number.MAX_SAFE_INTEGER
}

/**
 * Feuille virtuelle des matchs choisis.
 * @param {Array<object>} plans feuilles complètes (GET /restock-plans/:id)
 * @param {string[]} eventOrder ids de matchs dans l'ordre chronologique
 * @returns {object|null} `{ name, restockLines, lineOverrides, restockedRows, shoppingGroups, eventIds, plans }`
 */
export function mergeRestockPlans(plans, eventOrder = []) {
  const list = (plans || []).filter(Boolean)
  if (!list.length) return null
  const order = (eventOrder || []).map(String)
  const sorted = [...list].sort((a, b) => planRank(a, order) - planRank(b, order))
  const merged = {
    name: sorted.map((p) => p.name).filter(Boolean).join(' + ') || null,
    restockLines: [],
    lineOverrides: {},
    restockedRows: {},
    shoppingGroups: [],
    eventIds: [],
    plans: sorted.map((p) => ({ id: String(p.id), selectedEventIds: (p.selectedEventIds || []).map(String) })),
  }
  for (const plan of sorted) {
    const planId = String(plan.id)
    for (const line of plan.restockLines || []) {
      merged.restockLines.push({ ...line, rowKey: mergedRowKey(planId, line.rowKey), planId })
    }
    Object.assign(merged.lineOverrides, remapKeys(plan.lineOverrides, planId))
    Object.assign(merged.restockedRows, remapKeys(plan.restockedRows, planId))
    merged.shoppingGroups.push(...(plan.shoppingGroups || []))
    for (const id of plan.selectedEventIds || []) {
      if (!merged.eventIds.includes(String(id))) merged.eventIds.push(String(id))
    }
  }
  return merged
}

/**
 * Match sur lequel enregistrer un dépôt fait pour une feuille : son match le plus
 * proche parmi ceux choisis, sinon son premier match. Les dépôts étant relus pour
 * tous les matchs de la feuille, le choix ne change pas le reste à déposer.
 * @param {{selectedEventIds:string[]}} plan
 * @param {string[]} eventOrder matchs choisis, ordre chronologique
 */
export function depositEventForPlan(plan, eventOrder = []) {
  const ids = (plan?.selectedEventIds || []).map(String)
  return (eventOrder || []).map(String).find((id) => ids.includes(id)) || ids[0] || null
}

/**
 * Répartit un dépôt entre les feuilles d'une même destination × article, dans
 * l'ordre chronologique : chaque part reçoit de quoi couvrir son reste à déposer,
 * la dernière prend le surplus. Les packs restent ENTIERS (le stock Logistic
 * distingue packs et unités en vrac : couper un pack fausserait le niveau).
 * @param {{packed:number, loose:number}} deposit saisie
 * @param {Array<{rowKey:string, quantity:number}>} parts lignes fusionnées, ordre chronologique
 * @param {number|null} unitsPerPack taille de pack du dépôt
 * @returns {Array<{rowKey:string, packed:number, loose:number}>} parts non vides
 */
export function allocateDeposit({ packed = 0, loose = 0 }, parts, unitsPerPack = null) {
  const list = (parts || []).filter(Boolean)
  if (!list.length) return []
  const upp = Number(unitsPerPack) > 0 ? Number(unitsPerPack) : null
  let packsLeft = Math.max(0, Math.floor(Number(packed) || 0))
  let looseLeft = Math.max(0, Number(loose) || 0)
  const out = []
  list.forEach((part, i) => {
    if (packsLeft <= 0 && looseLeft <= 0) return
    let p = 0
    let l = 0
    if (i === list.length - 1) {
      p = packsLeft
      l = looseLeft
    } else {
      let need = Math.max(0, Number(part.quantity) || 0)
      if (upp) {
        p = Math.min(packsLeft, Math.floor(need / upp + 1e-9))
        need -= p * upp
      }
      l = Math.min(looseLeft, need)
      need -= l
      // Reste à couvrir sans vrac disponible : un pack entier de plus.
      if (need > 1e-9 && upp && packsLeft - p > 0) p += 1
    }
    packsLeft -= p
    looseLeft = Math.round((looseLeft - l) * 1000) / 1000
    if (p > 0 || l > 0) out.push({ rowKey: part.rowKey, packed: p, loose: l })
  })
  return out
}
