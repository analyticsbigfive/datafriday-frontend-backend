/**
 * Mémoire locale de la DERNIÈRE période par défaut connue du compte (préférence
 * « période par défaut »), pour que l'Analyse l'applique tout de suite au démarrage au lieu
 * d'attendre la lecture distante (~1 s). La lecture distante continue en arrière-plan et
 * corrige si besoin (voir startupPreferences).
 *
 * La clé porte l'identifiant du compte : sans identité, pas de cache, pour ne jamais
 * appliquer le choix d'un autre compte sur le même navigateur. Chaque accès au storage est
 * protégé (mode privé, quota atteint, storage bloqué) : le cache est un bonus, jamais un
 * point de panne.
 */

const KEY_PREFIX = 'analyse:default-range-preset:'

/**
 * @param {object} deps
 * @param {Storage|null|undefined} deps.storage localStorage (ou équivalent)
 * @param {string|null|undefined} deps.userId identifiant du compte connecté
 * @returns {{ read: () => (string|null), write: (preset: (string|null)) => void }|null}
 *   `null` si `storage` ou `userId` manque.
 */
export function createDefaultRangePresetCache({ storage, userId } = {}) {
  if (!storage || !userId) return null
  const key = `${KEY_PREFIX}${userId}`

  return {
    /** @returns {string|null} une chaîne non vide, sinon null (absent, vide ou storage en erreur) */
    read() {
      try {
        const value = storage.getItem(key)
        return typeof value === 'string' && value ? value : null
      } catch (_) {
        return null
      }
    },
    /** `write(null)` (ou valeur vide) supprime la clé. Ne lève jamais. */
    write(preset) {
      try {
        if (preset) storage.setItem(key, String(preset))
        else storage.removeItem(key)
      } catch (_) {
        // Quota, mode privé ou storage bloqué : on s'en passe.
      }
    },
  }
}
