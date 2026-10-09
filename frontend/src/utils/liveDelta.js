// Rafraîchissement incrémental de l'écran Live (backend : paramètre `since` de
// GET /spaces/:id/event-timeline et /transaction-baskets). Au lieu de retélécharger toute la
// chronologie et tous les paniers à chaque agrégation (≈ 90 % de la bande passante d'un match,
// mesuré le 2026-09-26), le client ne redemande que les dernières minutes et les remplace.
//
// `minuteLocal` = minute locale datée « YYYY-MM-DDTHH:mm » : la comparaison de chaînes est
// chronologique, y compris pour un event qui franchit minuit.

/** Dernière minute connue parmi les lignes, ou null. */
export function latestMinuteLocal(rows) {
  let latest = null
  for (const r of rows || []) {
    if (r?.minuteLocal && (!latest || r.minuteLocal > latest)) latest = r.minuteLocal
  }
  return latest
}

/** `minuteLocal` reculée de `minutes` (calcul sur l'horloge murale, sans fuseau). */
export function minuteLocalMinus(minuteLocal, minutes) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(minuteLocal || '')
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - minutes * 60000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

/**
 * Remplace les lignes à partir de `since` par celles reçues. Les lignes sans minute sont
 * toujours renvoyées par le serveur : celles déjà connues sont donc remplacées aussi.
 */
export function mergeSince(previousRows, freshRows, since) {
  const kept = (previousRows || []).filter((r) => r?.minuteLocal && r.minuteLocal < since)
  return kept.concat(freshRows || [])
}
