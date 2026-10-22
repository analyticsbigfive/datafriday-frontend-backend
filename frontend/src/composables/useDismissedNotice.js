import { ref } from 'vue'

/**
 * Notice fermable dont la fermeture est mémorisée par utilisateur dans localStorage.
 * Lecture et écriture sont protégées : stockage bloqué ou plein = la notice reste simplement
 * visible / non mémorisée, jamais d'exception.
 * @param {string} storageKey
 */
export function useDismissedNotice(storageKey) {
  function read() {
    try {
      return window.localStorage.getItem(storageKey) === '1'
    } catch (e) {
      return false
    }
  }

  const dismissed = ref(read())

  function dismiss() {
    dismissed.value = true
    try {
      window.localStorage.setItem(storageKey, '1')
    } catch (e) {
      // Fermeture valable pour la session seulement.
    }
  }

  return { dismissed, dismiss }
}
