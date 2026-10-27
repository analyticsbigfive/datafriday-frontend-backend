import { watch } from 'vue'

/**
 * Mémorise des filtres (refs) dans localStorage et les restaure à l'appel.
 * Même principe que la Market Price List (persistFilters / restoreFilters) :
 * survit au remount (éviction du keep-alive). Stockage indisponible ou JSON corrompu : ignoré.
 *
 * @param {string} storageKey clé localStorage (versionnée)
 * @param {Record<string, import('vue').Ref<string>>} refs filtres chaîne à mémoriser
 */
export function usePersistedFilters(storageKey, refs) {
  try {
    const raw = localStorage.getItem(storageKey)
    const saved = raw ? JSON.parse(raw) || {} : {}
    for (const [name, r] of Object.entries(refs)) {
      if (typeof saved[name] === 'string') r.value = saved[name]
    }
  } catch { /* JSON corrompu ou storage indisponible : on ignore */ }

  const persist = () => {
    try {
      const out = {}
      for (const [name, r] of Object.entries(refs)) out[name] = r.value
      localStorage.setItem(storageKey, JSON.stringify(out))
    } catch { /* storage indisponible : on ignore */ }
  }
  watch(Object.values(refs), persist)
  return { persist }
}
