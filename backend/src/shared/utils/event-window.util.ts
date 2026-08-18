/**
 * Résolution d'un instant réel (UTC) à partir d'un jour calendaire (`Event.eventDate`/
 * `eventStartDate`/`eventEndDate` — toujours ancré à minuit, sans heure) et d'une heure locale
 * "HH:mm" saisie par l'utilisateur pour le fuseau du Space (`Space.timezone`).
 *
 * Extrait de `staffing.service.ts` (BUG-329-02, docs/bugs/) où ce mécanisme existait déjà et
 * tournait en production pour le staffing — l'agrégation des ventes le réutilise maintenant au
 * lieu d'en dupliquer une 3ᵉ copie.
 */

/** JSON.parse tolérant : renvoie `fallback` en cas d'échec plutôt que de throw. */
function safeJsonParse<T>(str: string, fallback: T): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    return fallback;
  }
}

/**
 * Parse `Event.sessions` : le champ est parfois une string JSON d'array, parfois un array dont
 * chaque élément est lui-même une string JSON — sans ce parsing tolérant, `sessions[0].doorsOpening`
 * lit un caractère (« [ ») au lieu du champ attendu.
 */
export function parseEventSessions(raw: unknown): Array<{ doorsOpening?: string; showTime?: string }> {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    const parsed = safeJsonParse<unknown>(raw, []);
    list = Array.isArray(parsed) ? parsed : [];
  }
  return list
    .map((s) => (typeof s === 'string' ? safeJsonParse(s, null) : s))
    .filter(
      (s): s is { doorsOpening?: string; showTime?: string } =>
        !!s && typeof s === 'object' && !Array.isArray(s),
    );
}

/** Décalage UTC (minutes) d'un fuseau IANA à un instant donné, via `Intl` (pas de dépendance). */
export function utcOffsetMinutes(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset', hour: '2-digit' }).formatToParts(
    instant,
  );
  const raw = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'GMT+00:00';
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(raw);
  if (!match) return 0;
  const sign = match[1] === '-' ? -1 : 1;
  return sign * (parseInt(match[2], 10) * 60 + parseInt(match[3] ?? '0', 10));
}

/**
 * Combine un jour calendaire (Date ancrée à minuit UTC) avec une heure locale "HH:mm" pour un
 * fuseau donné → instant UTC réel. `null` si `hhmm` absent/invalide (l'appelant se replie alors
 * sur le jour calendaire brut ou une autre stratégie).
 */
export function combineDayAndLocalTime(day: Date, hhmm: string | undefined | null, timeZone: string): Date | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  // Passe 1 : traite HH:mm comme UTC ; passe 2 : corrige par le décalage réel du fuseau à cet
  // instant (gère les changements d'heure été/hiver).
  const naiveUtc = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hours, minutes);
  const offsetMin = utcOffsetMinutes(new Date(naiveUtc), timeZone);
  return new Date(naiveUtc - offsetMin * 60_000);
}

/** Fallback si l'événement n'a ni heure de fin ni durée déductible. */
export const DEFAULT_EVENT_DURATION_HOURS = 6;
