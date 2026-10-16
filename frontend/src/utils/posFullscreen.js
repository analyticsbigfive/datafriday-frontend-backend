// Aides Fullscreen API de la caisse POS (sans Vue, utilisables depuis la connexion comme depuis la caisse).
// Le navigateur peut refuser (pas de geste récent, iPhone) : jamais d'exception, un booléen.

export const rootElement = () => document.documentElement

export function currentFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null
}

/** Demande le plein écran ; renvoie false (jamais d'exception) si l'API est absente ou refusée. */
export async function requestPosFullscreen() {
  const element = rootElement()
  const request = element.requestFullscreen || element.webkitRequestFullscreen
  if (!request || currentFullscreenElement()) return !!currentFullscreenElement()
  try {
    await request.call(element)
    return true
  } catch {
    return false
  }
}

export async function exitPosFullscreen() {
  const exit = document.exitFullscreen || document.webkitExitFullscreen
  if (!exit || !currentFullscreenElement()) return
  try {
    await exit.call(document)
  } catch {
    /* déjà sorti */
  }
}

