import { onActivated, onDeactivated } from 'vue'

/**
 * Rafraichit une page gardee en vie (keep-alive) quand on y revient.
 *
 * `mounted` ne se rejoue pas en keep-alive : sans ce hook, la page garde les
 * donnees vues lors de la premiere visite jusqu'au hard refresh.
 *
 * - la premiere activation est ignoree (le chargement initial s'en charge)
 * - le rafraichissement n'a lieu que si la page a ete quittee depuis au moins
 *   `minAwayMs`, pour ne pas relancer des requetes a chaque aller-retour rapide
 * - `refresh` doit etre silencieux (pas de squelette) et ne jamais lever
 *
 * @param {() => (void | Promise<void>)} refresh
 * @param {{ minAwayMs?: number }} [options]
 */
export function useRefreshOnReturn(refresh, { minAwayMs = 30000 } = {}) {
  let firstActivation = true
  let leftAt = 0

  onActivated(() => {
    if (firstActivation) {
      firstActivation = false
      return
    }
    if (Date.now() - leftAt < minAwayMs) return
    try {
      const result = refresh()
      if (result && typeof result.catch === 'function') {
        result.catch((e) => console.warn('[refreshOnReturn]', e))
      }
    } catch (e) {
      console.warn('[refreshOnReturn]', e)
    }
  })

  onDeactivated(() => {
    leftAt = Date.now()
  })
}
