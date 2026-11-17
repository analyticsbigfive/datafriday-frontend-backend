/**
 * Index de recherche des références de stock (ingrédients, composants, menu
 * items, market prices) pour `findStockReference` et ses candidats.
 *
 * Avant : pour CHAQUE ligne de stock, quatre catalogues de plusieurs milliers
 * d'éléments (enveloppés dans des proxys réactifs Vue) étaient reparcourus en
 * entier, avec un tableau construit par élément et `normalizeName` recalculé
 * à chaque appel pour la passe par nom. Coût quadratique, thread principal
 * bloqué plusieurs secondes sur la page Commandes.
 *
 * Maintenant : un index par catalogue, construit une fois puis réutilisé par
 * tous les appels du même calcul synchrone.
 *  - byId   : String(valeur) -> positions ASCENDANTES des éléments dont
 *             `id`, `sourceId`, `marketPriceId` ou `marketPrice.id` vaut cette
 *             valeur (null / undefined ignorés, un élément listé une seule fois
 *             par valeur).
 *  - byName : normalizeName(name || itemName) -> positions ASCENDANTES
 *             (éléments falsy et clés vides ignorés).
 *
 * Les résultats sont IDENTIQUES à l'ancien parcours, identité des objets
 * comprise : l'index ne stocke que des positions, et l'élément est toujours lu
 * dans le catalogue PASSÉ par l'appelant (proxy réactif inclus), exactement ce
 * que `Array.prototype.find` renvoyait.
 *
 * Cache : WeakMap indexé par le tableau BRUT. Une entrée n'est valable que
 * jusqu'à la fin de la tâche synchrone qui l'a créée (remise à zéro en
 * microtâche), et est reconstruite si la longueur du tableau change. Ainsi un
 * nom ou un identifiant modifié sur place entre deux tâches n'est jamais lu
 * dans un index périmé, tout en évitant le coût quadratique à l'intérieur d'un
 * même calcul. Conséquence assumée : une modification sur place faite DANS la
 * même tâche synchrone, sans changer la longueur, n'est pas vue avant la
 * tâche suivante.
 */
import { toRaw } from 'vue'

export function normalizeName(value) {
  return String(value || '').trim().toLowerCase()
}

const NO_POSITION = Object.freeze([])

let cache = new WeakMap()
let resetScheduled = false

function resetCache() {
  cache = new WeakMap()
  resetScheduled = false
}

function scheduleReset() {
  if (resetScheduled) return
  resetScheduled = true
  if (typeof queueMicrotask === 'function') queueMicrotask(resetCache)
  else Promise.resolve().then(resetCache)
}

// Les éléments sont parcourus en position croissante : un doublon éventuel
// (même valeur dans deux champs du même élément) est donc toujours en queue.
function addPosition(map, key, position) {
  const list = map.get(key)
  if (!list) map.set(key, [position])
  else if (list[list.length - 1] !== position) list.push(position)
}

function addIdValue(byId, value, position) {
  if (value != null) addPosition(byId, String(value), position)
}

function buildIndex(raw) {
  const byId = new Map()
  const byName = new Map()
  for (let i = 0; i < raw.length; i += 1) {
    const c = raw[i]
    if (!c) continue
    addIdValue(byId, c.id, i)
    addIdValue(byId, c.sourceId, i)
    addIdValue(byId, c.marketPriceId, i)
    addIdValue(byId, c.marketPrice?.id, i)
    const nameKey = normalizeName(c.name || c.itemName)
    if (nameKey) addPosition(byName, nameKey, i)
  }
  return { length: raw.length, byId, byName }
}

function getEntry(catalogue) {
  if (!catalogue) return null
  const raw = toRaw(catalogue)
  // Lecture de la longueur via le proxy, une seule fois : garde la dépendance
  // réactive sur l'ajout / retrait d'éléments dans un computed ou un effet.
  if (catalogue !== raw) void catalogue.length
  // Catalogue vide (ou sans longueur) : rien à indexer, et pas d'entrée de
  // cache pour les `[]` jetables des paramètres par défaut.
  if (!raw.length) return null
  let entry = cache.get(raw)
  if (!entry || entry.length !== raw.length) {
    entry = buildIndex(raw)
    cache.set(raw, entry)
    scheduleReset()
  }
  return entry
}

/** Positions ascendantes (sans doublon) des éléments qui portent au moins un des identifiants. */
function idPositions(catalogue, idCandidates) {
  const entry = getEntry(catalogue)
  if (!entry) return NO_POSITION
  let single = null
  let merged = null
  for (const key of idCandidates) {
    const list = entry.byId.get(key)
    if (!list) continue
    if (!single) {
      single = list
    } else {
      if (!merged) merged = new Set(single)
      for (const position of list) merged.add(position)
    }
  }
  if (merged) return Array.from(merged).sort((a, b) => a - b)
  return single || NO_POSITION
}

function namePositions(catalogue, name) {
  const entry = getEntry(catalogue)
  if (!entry) return NO_POSITION
  return entry.byName.get(name) || NO_POSITION
}

/** Premier élément (plus petite position) qui porte au moins un des identifiants. */
function firstIdMatch(catalogue, idCandidates) {
  const entry = getEntry(catalogue)
  if (!entry) return undefined
  let best = -1
  for (const key of idCandidates) {
    const list = entry.byId.get(key)
    if (list && (best < 0 || list[0] < best)) best = list[0]
  }
  return best < 0 ? undefined : catalogue[best]
}

function firstNameMatch(catalogue, name) {
  const list = namePositions(catalogue, name)
  return list.length ? catalogue[list[0]] : undefined
}

/** Clés de recherche d'une ligne de stock : identifiants (chaînes) et nom normalisé. */
function referenceKeys(item) {
  const idCandidates = new Set(
    [item?.itemId, item?.id, item?.sourceId, item?.marketPriceId].filter(Boolean).map(String),
  )
  const name = normalizeName(item?.itemName || item?.name)
  return { idCandidates, name }
}

/**
 * Deux passes STRICTES (BUG-299-01) : l'identifiant sur TOUS les catalogues
 * d'abord (dans l'ordre de `pools`), le nom seulement si aucun identifiant ne
 * résout nulle part. Ne jamais inverser.
 */
export function findReferenceInPools(item, pools) {
  const { idCandidates, name } = referenceKeys(item)
  if (idCandidates.size) {
    for (const pool of pools) {
      const hit = firstIdMatch(pool, idCandidates)
      if (hit) return hit
    }
  }
  if (!name) return null
  for (const pool of pools) {
    const hit = firstNameMatch(pool, name)
    if (hit) return hit
  }
  return null
}

/**
 * Toutes les correspondances ordonnées : par identifiant (catalogue par
 * catalogue, positions ascendantes), puis par nom, sans répéter (identité) un
 * élément déjà présent.
 */
export function collectReferenceCandidates(item, pools) {
  const { idCandidates, name } = referenceKeys(item)
  const out = []
  const seen = new Set()
  if (idCandidates.size) {
    for (const pool of pools) {
      for (const position of idPositions(pool, idCandidates)) {
        const c = pool[position]
        out.push(c)
        seen.add(c)
      }
    }
  }
  if (name) {
    for (const pool of pools) {
      for (const position of namePositions(pool, name)) {
        const c = pool[position]
        if (!seen.has(c)) {
          out.push(c)
          seen.add(c)
        }
      }
    }
  }
  return out
}
