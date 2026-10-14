/**
 * Swipe mobile du drawer Comparaison : fonctions PURES (aucun état, aucun stockage).
 * Glisser vers la gauche affiche la comparaison, vers la droite le rapport principal.
 */

// Distance horizontale minimale (px) pour valider un geste.
export const SWIPE_MIN_DISTANCE = 70
// Le geste doit être nettement horizontal : |dx| > RATIO x |dy|.
export const SWIPE_HORIZONTAL_RATIO = 1.5

/**
 * @param {{ dx: number, dy: number, startedInScrollable?: boolean, current?: 'main'|'cmp' }} g
 *   dx / dy : déplacement fin - début du toucher ; current : écran affiché.
 * @returns {'main'|'cmp'|null} écran cible, ou null si le geste est ignoré ou sans effet.
 */
export function resolveSwipe({ dx, dy, startedInScrollable = false, current = 'main' } = {}) {
  if (startedInScrollable) return null
  const x = Number(dx)
  const y = Number(dy)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  if (Math.abs(x) < SWIPE_MIN_DISTANCE) return null
  if (!(Math.abs(x) > SWIPE_HORIZONTAL_RATIO * Math.abs(y))) return null
  const target = x < 0 ? 'cmp' : 'main'
  return target === current ? null : target
}

/**
 * Vrai si l'élément (ou un de ses ancêtres, jusqu'à `root` exclu) défile horizontalement :
 * bande des puces, rangée des widgets, tableaux, canvas de graphes. Le défilement est jugé
 * sur l'overflow-x calculé (auto / scroll) ET un contenu réellement plus large que la boîte ;
 * un canvas ou une zone marquée data-swipe-lock est toujours considéré comme verrouillé.
 * @param {EventTarget|null} target
 * @param {Element|null} [root]
 */
export function isInHorizontalScroller(target, root = null) {
  let el = target && target.nodeType === 1 ? target : target && target.parentElement
  while (el && el !== root && el.nodeType === 1) {
    const tag = el.tagName
    if (tag === 'CANVAS') return true
    if (el.hasAttribute && el.hasAttribute('data-swipe-lock')) return true
    let overflowX = ''
    try {
      overflowX = (typeof getComputedStyle === 'function' ? getComputedStyle(el).overflowX : '') || ''
    } catch (e) {
      overflowX = ''
    }
    if ((overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return true
    el = el.parentElement
  }
  return false
}
