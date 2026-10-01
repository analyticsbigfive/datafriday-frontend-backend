// useIncrementalList() : rendu progressif d'une longue liste (BUG-390-02).
//
// Monter des centaines de cartes d'un coup coûte plusieurs secondes (vue
// « Par article » d'Event Predict). On n'en affiche que `pageSize`, puis on
// ajoute un lot de `pageSize` chaque fois qu'une sentinelle placée en bas de
// liste devient visible (IntersectionObserver).
//
// Sans IntersectionObserver (jsdom, très vieux navigateurs), rien n'est
// observé : la sentinelle sert alors de bouton « Afficher plus » (showMore),
// la liste reste plafonnée au lieu de tout monter d'un coup.
//
// Utilisable depuis l'Options API : appeler dans setup() et retourner les
// champs à plat (les refs de premier niveau sont déballées sur `this`).
//
// Usage :
//   const list = useIncrementalList({ pageSize: 30 })
//   template : entries.slice(0, list.visibleCount)
//              <div v-if="visibleCount < total" :ref="list.setSentinel">…</div>
//   au changement de filtre : list.reset()

import { ref, nextTick, getCurrentInstance, onBeforeUnmount } from 'vue'

export const DEFAULT_PAGE_SIZE = 30

export function isIntersectionObserverSupported() {
  return typeof window !== 'undefined' && typeof window.IntersectionObserver === 'function'
}

export function useIncrementalList({ pageSize = DEFAULT_PAGE_SIZE, rootMargin = '400px 0px' } = {}) {
  const size = Math.max(1, Math.floor(Number(pageSize) || DEFAULT_PAGE_SIZE))
  const visibleCount = ref(size)
  const observerSupported = isIntersectionObserverSupported()
  let observer = null
  let sentinel = null

  function showMore() {
    visibleCount.value += size
  }

  function reset() {
    visibleCount.value = size
  }

  function disconnect() {
    if (observer) observer.disconnect()
    observer = null
    sentinel = null
  }

  // Après un lot ajouté, la sentinelle peut rester visible (écran haut, lot
  // court) : l'observer ne renotifie pas sans changement d'état, on la
  // ré-observe donc pour obtenir une nouvelle mesure initiale.
  function recheck() {
    nextTick(() => {
      if (!observer || !sentinel) return
      observer.unobserve(sentinel)
      observer.observe(sentinel)
    })
  }

  function onIntersect(entries) {
    if (!entries.some((e) => e.isIntersecting)) return
    showMore()
    recheck()
  }

  // Ref fonctionnelle à poser sur la sentinelle (`:ref="setSentinel"`). Vue
  // l'appelle avec l'élément au montage et avec null au démontage.
  function setSentinel(el) {
    const node = el && el.$el ? el.$el : el
    if (node === sentinel) return
    disconnect()
    if (!node || !observerSupported) return
    sentinel = node
    observer = new window.IntersectionObserver(onIntersect, { root: null, rootMargin })
    observer.observe(node)
  }

  if (getCurrentInstance()) onBeforeUnmount(disconnect)

  return { visibleCount, pageSize: size, observerSupported, showMore, reset, setSentinel, disconnect }
}
