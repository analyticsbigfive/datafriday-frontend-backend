// src/utils/componentCatalog.js
//
// Hydratation de la RECETTE d'un ComponentDefinition — BUG-292-01.
//
// Pourquoi ce fichier existe : la LISTE `/menu-components` ne renvoie pas
// `subComponents`. Seul le DÉTAIL `/menu-components/:id` porte la recette, et il
// l'expose sous deux relations (`ingredients[]` + `children[]`) — pas sous le nom
// `subComponents`, qui est la shape du builder front. Sans cette hydratation,
// `flattenComponentDef` reçoit une def vide et ne descend jamais : la feuille de
// course achèterait « de la sauce pickle » au lieu de son vinaigre et de son ail.
//
// La logique vivait uniquement dans `useSpaceData`, donc n'existait que pour les
// écrans qui passent par lui. La feuille de course (`SpaceRestockView`) lit le
// catalogue depuis le store `analyse`, alimenté par la liste — d'où un éclatement
// silencieusement inerte. Le code est ici pour que les deux chemins partagent la
// même implémentation plutôt que d'en avoir une et demie.

const cnorm = (s) => String(s ?? '').trim().toLowerCase()

/**
 * Index d'un catalogue de composants, par id ET par nom normalisé.
 * 1re occurrence gagnante sur chaque clé.
 */
export function indexComponentCatalog(catalogComponents = []) {
  const by = new Map()
  for (const c of catalogComponents || []) {
    if (c?.id != null && !by.has(`id:${c.id}`)) by.set(`id:${c.id}`, c)
    const n = cnorm(c?.name)
    if (n && !by.has(`nm:${n}`)) by.set(`nm:${n}`, c)
  }
  return by
}

/**
 * Complète des composants dépourvus de recette à partir d'un autre catalogue déjà
 * chargé (résolution par id puis par nom). Étape SYNCHRONE et gratuite : elle évite
 * un fetch détail quand l'information est déjà là.
 *
 * `numberOfUnitsRecipe` du composant de base reste prioritaire — c'est le rendement
 * de batch, et une valeur déjà posée est une intention.
 *
 * @returns {Array<object>} nouveau tableau (les entrées inchangées sont réutilisées)
 */
export function mergeSubComponentsFromCatalog(baseComponents = [], catalogComponents = []) {
  const catBy = indexComponentCatalog(catalogComponents)
  return (baseComponents || []).map((c) => {
    if (Array.isArray(c?.subComponents) && c.subComponents.length) return c
    const hit = catBy.get(`id:${c?.id}`) || catBy.get(`nm:${cnorm(c?.name)}`)
    return hit?.subComponents?.length
      ? {
          ...c,
          subComponents: hit.subComponents,
          numberOfUnitsRecipe: c.numberOfUnitsRecipe ?? hit.numberOfUnitsRecipe,
        }
      : c
  })
}

/**
 * Convertit le DÉTAIL d'un composant en `subComponents[]` normalisés, la shape
 * qu'attend `flattenComponentDef`.
 *
 * Deux contrats backend à connaître :
 *  - `ingredient.ingredientId` EST le `marketPriceId` (cf. ComponentCreateView) —
 *    c'est l'identité « matière achetée », celle sur laquelle l'inventaire joint ;
 *  - `child.componentId` est une ref vers une autre def (composant de composant).
 *
 * Une ligne sans nom résolvable est écartée : elle deviendrait une ligne fantôme
 * sur laquelle les agrégations par nom fusionneraient n'importe quoi (BUG-291-01).
 *
 * @param {object} full   réponse `/menu-components/:id`
 * @param {Map}    ingById catalogue ingrédients indexé par id (résout les libellés)
 */
export function buildSubComponentsFromDetail(full, ingById = new Map()) {
  const ings = Array.isArray(full?.ingredients) ? full.ingredients : []
  const children = Array.isArray(full?.children) ? full.children : []
  return [
    ...ings.map((ing) => {
      const iid = ing?.ingredientId || ing?.ingredient_id || null
      const cat = iid != null ? ingById.get(String(iid)) : null
      return {
        itemType: 'Ingredient',
        id: iid,
        marketPriceId: iid,
        name:
          ing?.itemName || ing?.name ||
          cat?.name || cat?.itemName || cat?.marketPrice?.supplierItem || null,
        numberOfUnits: Number(ing?.quantity ?? ing?.numberOfUnits ?? 0) || 0,
        unit: ing?.unit || ing?.recipeUnit || cat?.unit || 'unit',
      }
    }),
    ...children.map((ch) => {
      const cid = ch?.componentId || ch?.id || null
      return {
        itemType: 'Component',
        id: cid,
        sourceId: cid,
        name: ch?.itemName || ch?.name || null,
        numberOfUnits: Number(ch?.numberOfUnits ?? 0) || 0,
        unit: ch?.unit || 'unit',
      }
    }),
  ].filter((s) => s.name)
}

/**
 * Hydrate par fetch détail les composants qui n'ont toujours pas de recette.
 *
 * Concurrence bornée et échec TOLÉRÉ : un composant dont le détail ne répond pas
 * reste non éclaté (dégradation douce), il ne fait pas tomber la feuille de course.
 * Le compteur renvoyé permet à l'appelant de tracer la couverture — un éclatement
 * inerte doit être visible dans les logs, pas silencieux.
 *
 * @param {Array<object>} components
 * @param {object}   [opts]
 * @param {Array}    [opts.ingredients=[]] catalogue ingrédients (résolution de noms)
 * @param {number}   [opts.concurrency=5]
 * @param {Function} [opts.fetchComponent] injectable — défaut `getMenuComponent`
 * @returns {Promise<{components: Array<object>, hydrated: number, missing: number}>}
 */
export async function hydrateSubComponents(components = [], opts = {}) {
  const { ingredients = [], concurrency = 5, fetchComponent } = opts
  const out = [...(components || [])]
  const needDetail = out.filter((c) => c?.id && !(c?.subComponents?.length))
  if (!needDetail.length) {
    return { components: out, hydrated: 0, missing: 0 }
  }

  try {
    const { runWithConcurrency } = await import('@/utils/asyncPool')
    const fetcher =
      fetchComponent || (await import('@/api/endpoints/menu.api')).getMenuComponent

    const ingById = new Map(
      (ingredients || []).filter((x) => x?.id != null).map((x) => [String(x.id), x]),
    )
    const detailById = new Map()
    await runWithConcurrency(needDetail, concurrency, async (c) => {
      try {
        const d = await fetcher(c.id)
        const full = d?.data ?? d
        const subs = buildSubComponentsFromDetail(full, ingById)
        if (subs.length) {
          detailById.set(c.id, {
            subComponents: subs,
            numberOfUnitsRecipe: full?.numberOfUnitsRecipe,
          })
        }
      } catch (_) {
        /* toléré : composant sans détail → non éclaté */
      }
    })

    for (let i = 0; i < out.length; i++) {
      const hit = detailById.get(out[i]?.id)
      if (hit) {
        out[i] = {
          ...out[i],
          subComponents: hit.subComponents,
          numberOfUnitsRecipe: out[i].numberOfUnitsRecipe ?? hit.numberOfUnitsRecipe,
        }
      }
    }
    return {
      components: out,
      hydrated: detailById.size,
      missing: needDetail.length - detailById.size,
    }
  } catch (e) {
    console.warn('[componentCatalog] ⚠️ hydratation subComponents (détail) échouée:', e?.message)
    return { components: out, hydrated: 0, missing: needDetail.length }
  }
}
