/**
 * useComparisonSwipe : swipe horizontal mobile entre le rapport principal et la comparaison.
 *
 * Écouteurs touchstart / touchend PASSIFS posés sur un élément racine, retirés au démontage.
 * N'appelle `setMobileView` que si le drawer est ouvert ET l'écran est mobile.
 */
import { watch, onBeforeUnmount, unref } from 'vue'
import { resolveSwipe, isInHorizontalScroller } from '@/utils/comparisonSwipe'

/**
 * @param {{
 *   target: import('vue').Ref<Element|null>,   élément racine à écouter
 *   open: import('vue').Ref<boolean>,           drawer ouvert
 *   isMobile: import('vue').Ref<boolean>,       écran mobile (<= 900 px)
 *   mobileView: import('vue').Ref<string>,      écran affiché
 *   setMobileView: (v: string) => void,
 * }} deps
 */
export function useComparisonSwipe({ target, open, isMobile, mobileView, setMobileView }) {
  let start = null
  let bound = null

  function onStart(e) {
    const touch = e.touches && e.touches[0]
    if (!touch || (e.touches.length || 0) > 1) {
      start = null
      return
    }
    start = {
      x: touch.clientX,
      y: touch.clientY,
      locked: isInHorizontalScroller(e.target, bound),
    }
  }

  function onEnd(e) {
    const s = start
    start = null
    if (!s || !unref(open) || !unref(isMobile)) return
    const touch = e.changedTouches && e.changedTouches[0]
    if (!touch) return
    const next = resolveSwipe({
      dx: touch.clientX - s.x,
      dy: touch.clientY - s.y,
      startedInScrollable: s.locked,
      current: unref(mobileView),
    })
    if (next) setMobileView(next)
  }

  function onCancel() {
    start = null
  }

  function unbind() {
    if (!bound) return
    bound.removeEventListener('touchstart', onStart)
    bound.removeEventListener('touchend', onEnd)
    bound.removeEventListener('touchcancel', onCancel)
    bound = null
  }

  function bind(el) {
    unbind()
    if (!el || typeof el.addEventListener !== 'function') return
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    bound = el
  }

  watch(() => unref(target), bind, { immediate: true, flush: 'post' })
  onBeforeUnmount(unbind)

  return { unbind }
}
