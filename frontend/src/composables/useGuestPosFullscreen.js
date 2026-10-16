// Plein écran de la caisse (Fullscreen API). Le navigateur peut refuser (pas de geste récent,
// iPhone, politique du navigateur) : la caisse reste alors utilisable, elle occupe déjà toute la
// fenêtre, et on retente une fois au premier toucher. « Quitter le plein écran » est un choix
// du vendeur : on ne le rouvre plus de force.

import { onBeforeUnmount, onMounted, ref } from 'vue'
import { currentFullscreenElement, exitPosFullscreen, requestPosFullscreen, rootElement } from '@/utils/posFullscreen'

export function useGuestPosFullscreen() {
  const isFullscreen = ref(false)
  const supported = ref(!!(rootElement().requestFullscreen || rootElement().webkitRequestFullscreen))
  let userExited = false
  let retryHandler = null

  const sync = () => {
    isFullscreen.value = !!currentFullscreenElement()
  }

  function clearRetry() {
    if (retryHandler) document.removeEventListener('pointerdown', retryHandler)
    retryHandler = null
  }

  async function enter() {
    userExited = false
    const ok = await requestPosFullscreen()
    sync()
    return ok
  }

  async function exit() {
    userExited = true
    clearRetry()
    await exitPosFullscreen()
    sync()
  }

  const toggle = () => (isFullscreen.value ? exit() : enter())

  onMounted(async () => {
    document.addEventListener('fullscreenchange', sync)
    document.addEventListener('webkitfullscreenchange', sync)
    sync()
    if (!supported.value || isFullscreen.value) return
    const ok = await requestPosFullscreen()
    sync()
    if (!ok && !userExited) {
      // Refusé faute de geste : premier toucher = geste valide, on retente une seule fois.
      retryHandler = async () => {
        clearRetry()
        if (!userExited) {
          await requestPosFullscreen()
          sync()
        }
      }
      document.addEventListener('pointerdown', retryHandler, { once: true })
    }
  })

  onBeforeUnmount(() => {
    clearRetry()
    document.removeEventListener('fullscreenchange', sync)
    document.removeEventListener('webkitfullscreenchange', sync)
    exitPosFullscreen()
  })

  return { isFullscreen, supported, enter, exit, toggle }
}
