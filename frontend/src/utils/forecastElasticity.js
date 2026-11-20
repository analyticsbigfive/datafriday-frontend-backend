/**
 * Élasticité prix de l'outil Forecast. Module PUR.
 *
 * Réglage choisi par l'utilisateur, un seul pour toute la liste de modifications, appliqué
 * aux modifications de prix (article, catégorie, type). Pour un ratio de prix r = P'/P :
 *   quantité' = quantité x r^e
 *   CA'       = CA x r^(1+e)
 * e = 0 (défaut) : les quantités ne bougent pas, le CA suit le prix.
 * e = -1 : une hausse de prix de 10 % fait baisser les quantités d'environ 10 %.
 * Prix ramené à 0 (r <= 0) : CA nul, quantités inchangées (r^e n'a pas de sens).
 * Les transactions ne suivent pas l'élasticité : seuls les leviers de volume les déplacent.
 */

export const ELASTICITY_MIN = -3
export const ELASTICITY_MAX = 0
export const ELASTICITY_STEP = 0.1
export const ELASTICITY_DEFAULT = 0

/** Borne l'élasticité dans [ELASTICITY_MIN, ELASTICITY_MAX], au dixième ; non numérique : 0. */
export function clampElasticity(v) {
  if (v == null || v === '') return ELASTICITY_DEFAULT
  const n = Number(v)
  if (!Number.isFinite(n)) return ELASTICITY_DEFAULT
  const bounded = Math.min(ELASTICITY_MAX, Math.max(ELASTICITY_MIN, n))
  const rounded = Math.round(bounded * 10) / 10
  return rounded === 0 ? 0 : rounded
}

/**
 * Effet d'un ratio de prix sur le CA et les quantités d'un article.
 * @param {number} ratio  P'/P
 * @param {number} [elasticity]
 * @returns {{ revenue: number, quantity: number }}
 */
export function priceEffect(ratio, elasticity = ELASTICITY_DEFAULT) {
  const r = Number(ratio)
  if (!Number.isFinite(r) || r === 1) return { revenue: 1, quantity: 1 }
  if (r <= 0) return { revenue: 0, quantity: 1 }
  const e = clampElasticity(elasticity)
  if (e === 0) return { revenue: r, quantity: 1 }
  const quantity = r ** e
  return { revenue: r * quantity, quantity }
}
