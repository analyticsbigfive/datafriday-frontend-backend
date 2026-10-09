/** Minute locale datée telle que renvoyée dans `minuteLocal` (ex. « 2026-10-10T19:42 »). */
export const MINUTE_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/**
 * Rafraîchissement incrémental de l'écran Live : ne garde, par event, que les lignes dont la
 * minute locale est >= `since` (même format, comparaison lexicographique = chronologique). Le
 * client remplace ses lignes à partir de `since` par celles-ci au lieu de tout retélécharger
 * (≈ 90 % de la bande passante d'un match, mesuré le 2026-09-26). Les lignes sans minute
 * (grain résumé) sont toujours renvoyées : elles ne peuvent pas être découpées dans le temps.
 */
export function rowsSinceMinute<T extends { minuteLocal?: string | null }>(
  byEvent: Record<string, T[]>,
  since: string | undefined,
): Record<string, T[]> {
  if (!since) return byEvent;
  return Object.fromEntries(
    Object.entries(byEvent).map(([eventId, rows]) => [
      eventId,
      (rows ?? []).filter((r) => !r.minuteLocal || r.minuteLocal >= since),
    ]),
  );
}
