/**
 * Index de lecture du catalogue menu items, pour l'inventaire.
 *
 * `buildConsolidatedInventory` et `buildStorageInventory` retrouvaient, pour CHAQUE ligne
 * d'inventaire, un menu item ou un composant par `.find` imbriqués sur tout le catalogue
 * (lignes x menu items x composants), sur des tableaux réactifs Vue. Sur La Beaujoire cela
 * bloquait le navigateur plus de 3 s. Cet index répond aux mêmes questions en une recherche
 * par clé, avec EXACTEMENT les mêmes résultats que les anciens parcours (premier élément dans
 * l'ordre du catalogue, comparaison stricte `===`).
 *
 * Index construit une fois par appel, jamais gardé entre deux appels : aucune donnée périmée.
 */

const EMPTY = []

/** Ajoute `index` à la liste de `key` (liste croissante, sans doublon). */
function pushIndex(map, key, index) {
  const list = map.get(key)
  if (!list) map.set(key, [index])
  else if (list[list.length - 1] !== index) list.push(index)
}

/** Fusionne deux listes d'indices croissantes en une liste croissante sans doublon. */
function mergeSorted(a, b) {
  if (!b.length) return a
  if (!a.length) return b
  const out = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    const x = i < a.length ? a[i] : Infinity
    const y = j < b.length ? b[j] : Infinity
    if (x === y) {
      out.push(x)
      i += 1
      j += 1
    } else if (x < y) {
      out.push(x)
      i += 1
    } else {
      out.push(y)
      j += 1
    }
  }
  return out
}

/**
 * @param {Array<object>} menuItems catalogue complet (ordre conservé)
 */
export function createMenuItemIndex(menuItems) {
  const list = Array.isArray(menuItems) ? menuItems : EMPTY
  const firstById = new Map()
  const firstByName = new Map()
  const firstComboByName = new Map()
  const withComponentId = new Map()
  const withComponentName = new Map()

  list.forEach((mi, i) => {
    if (!mi) return
    if (!firstById.has(mi.id)) firstById.set(mi.id, i)
    if (!firstByName.has(mi.name)) firstByName.set(mi.name, i)
    if (mi.comboItem === 'Yes' && !firstComboByName.has(mi.name)) firstComboByName.set(mi.name, i)
    if (mi.components) {
      for (const c of mi.components) {
        if (!c) continue
        pushIndex(withComponentId, c.id, i)
        pushIndex(withComponentName, c.name, i)
      }
    }
  })

  const at = (i) => (i === undefined ? undefined : list[i])

  return {
    /** Équivaut à `list.find(mi => mi.id === id || mi.name === name)`. */
    firstByIdOrName(id, name) {
      const a = firstById.get(id)
      const b = firstByName.get(name)
      if (a === undefined) return at(b)
      if (b === undefined) return at(a)
      return at(a < b ? a : b)
    },
    /** Équivaut à `list.find(mi => mi.name === name)`. */
    firstByName(name) {
      return at(firstByName.get(name))
    },
    /** Équivaut à `list.find(mi => mi.name === name && mi.comboItem === 'Yes')`. */
    firstComboByName(name) {
      return at(firstComboByName.get(name))
    },
    /**
     * Menu items (ordre du catalogue) dont AU MOINS UN composant a `id` ou `name`. Les autres
     * n'auraient rien donné au `.find(c => c.id === id || c.name === name)` du parcours d'origine.
     */
    withComponentIdOrName(id, name) {
      const merged = mergeSorted(withComponentId.get(id) || EMPTY, withComponentName.get(name) || EMPTY)
      return merged.map((i) => list[i])
    },
    /** Menu items (ordre du catalogue) dont au moins un composant s'appelle `name`. */
    withComponentNamed(name) {
      return (withComponentName.get(name) || EMPTY).map((i) => list[i])
    },
  }
}
