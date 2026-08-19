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

/**
 * Au-delà de ce span (jours), un event est traité comme un "conteneur" (saison entière) et
 * n'obtient pas de fenêtre de vente : voir le commentaire détaillé de resolveEventSalesScope
 * (spaces.service.ts) — seuil à 2 jours pour couvrir un match à cheval sur minuit sans
 * repêcher un conteneur de saison (271-356 jours observés).
 */
export const MAX_EVENT_SPAN_DAYS = 2;

/** Champs d'un Event (ou équivalent) nécessaires au calcul de sa fenêtre de vente. */
export interface SalesWindowEventInput {
  id: string;
  eventDate: Date;
  eventEndDate: Date | null;
  eventEndTime: string | null;
  sessions: string | null;
}

/**
 * Heure de fin réelle d'un event : `eventEndTime` (posée sur `eventEndDate`), repli sur le
 * `showTime` de la dernière session. `null` si aucune heure de fin connue.
 */
export function preciseEventEnd(
  e: Pick<SalesWindowEventInput, 'eventDate' | 'eventEndDate' | 'eventEndTime' | 'sessions'>,
  spaceTimezone: string,
): Date | null {
  const endDay = new Date(e.eventEndDate ?? e.eventDate);
  const sessions = parseEventSessions(e.sessions);
  return combineDayAndLocalTime(endDay, e.eventEndTime ?? sessions[sessions.length - 1]?.showTime, spaceTimezone);
}

/**
 * Fenêtre de vente d'un event — règle métier BUG-339-02 (2026-08-19, docs/bugs/) :
 * les transactions d'un event vont de minuit (jour de début) jusqu'à son heure de fin réelle
 * (jour de fin, borne EXCLUSIVE côté requête : « jusqu'à 2h00 » = dernière transaction à
 * 1h59:59.999), EN EXCLUANT la tranche minuit → heure de fin d'un event voisin qui se termine
 * le jour où celui-ci commence (ex. "PFC - RC Lens" 14/02 → 15/02 03h00 ; "SFP-Toulouse"
 * démarre le 15/02 : sa fenêtre commence à 03h00, pas à minuit).
 *
 * - `windowEnd` : heure de fin réelle si connue, sinon repli historique jour calendaire
 *   entier (+1 jour, `eventEndDate` = dernier jour INCLUS).
 * - `windowStart` : minuit du jour de début, avancé à l'heure de fin du dernier voisin
 *   (`allSpaceEvents`, TOUS les events de l'espace) finissant ce jour-là. Seuls les voisins
 *   finissant AVANT la fin de cet event comptent — sinon, deux events le même jour se
 *   videraient mutuellement leur fenêtre.
 * - `null` : fenêtre vide (windowStart >= windowEnd) ou event-conteneur
 *   (span > MAX_EVENT_SPAN_DAYS, ex. "Saison 26/27").
 *
 * Consommateurs : resolveEventSalesScope (spaces.service.ts, page Analyse),
 * deriveEventConsumption (logistics.service.ts, réco post-event) et getPostEventBaseline
 * (inventory.service.ts) — les trois doivent parler de la MÊME fenêtre (BUG-339-03).
 */
export function computeEventSalesWindow(
  event: SalesWindowEventInput,
  allSpaceEvents: SalesWindowEventInput[],
  spaceTimezone: string,
): { windowStart: Date; windowEnd: Date } | null {
  const eventDate = new Date(event.eventDate);
  const endDate = new Date(event.eventEndDate ?? event.eventDate);
  const fallbackEnd = new Date(endDate);
  fallbackEnd.setDate(fallbackEnd.getDate() + 1);
  const windowEnd = preciseEventEnd(event, spaceTimezone) ?? fallbackEnd;

  let windowStart = eventDate;
  for (const neighbor of allSpaceEvents) {
    if (neighbor.id === event.id) continue;
    const neighborEndDay = new Date(neighbor.eventEndDate ?? neighbor.eventDate);
    if (neighborEndDay.getTime() !== eventDate.getTime()) continue;
    const neighborEnd = preciseEventEnd(neighbor, spaceTimezone);
    if (!neighborEnd) continue; // voisin sans heure de fin → pas d'exclusion (comportement historique)
    if (neighborEnd >= windowEnd) continue;
    if (neighborEnd > windowStart) windowStart = neighborEnd;
  }

  if (windowStart >= windowEnd) return null; // fenêtre vide
  const spanDays = (windowEnd.getTime() - eventDate.getTime()) / 86_400_000;
  if (spanDays > MAX_EVENT_SPAN_DAYS) return null; // event-conteneur (saison…)
  return { windowStart, windowEnd };
}
