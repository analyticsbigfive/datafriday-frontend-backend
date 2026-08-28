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
 * Champs de dates d'un `Event` nécessaires au calcul de fenêtre. Tolère des ISO strings :
 * les events peuvent sortir d'un cache Redis où les Date ont été sérialisées.
 */
export interface EventDayFields {
  id?: string;
  eventDate: Date | string;
  eventStartDate?: Date | string | null;
  eventEndDate?: Date | string | null;
  eventEndTime?: string | null;
  integrationId?: string | null;
}

const startDayOf = (e: EventDayFields): Date => new Date((e.eventStartDate ?? e.eventDate) as any);
const endDayOf = (e: EventDayFields): Date =>
  new Date((e.eventEndDate ?? e.eventStartDate ?? e.eventDate) as any);

/** Minuit local (fuseau donné) du jour suivant `day` — borne haute exclusive d'une journée calendaire. */
export function startOfNextLocalDay(day: Date, timeZone: string): Date {
  const nextDay = new Date(day);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return combineDayAndLocalTime(nextDay, '00:00', timeZone) ?? nextDay;
}

/** Fin DÉCLARÉE d'un event : `eventEndTime` posée sur son jour de fin — `null` si non saisie/invalide. */
export function declaredEndOf(e: EventDayFields, timeZone: string): Date | null {
  return combineDayAndLocalTime(endDayOf(e), e.eventEndTime ?? null, timeZone);
}

/**
 * Fenêtre de transactions d'un event — règle métier de la slide « Transactions prises en compte
 * par Event » (Bertrand, 2026-08-25 — fiche 147-01), partagée entre l'agrégation (writer) et
 * `resolveEventSalesScope` (lecteur) pour que les deux ne divergent plus (cause racine des trois
 * CA différents de la fiche 145-01) :
 *
 * - début : minuit LOCAL du jour de début — jamais l'heure d'ouverture des portes, les ventes
 *   avant-match/hospitalité la précèdent parfois largement (BUG-360-02, Nantes-Rodez) ;
 * - fin : l'heure de fin déclarée (`eventEndTime`, posée sur le jour de fin — minuit franchi
 *   autorisé, ex. réel « SFP vs La Rochelle » fin 02:00 le lendemain), sinon journée calendaire
 *   pleine (minuit local suivant le jour de fin — pas d'heuristique inventée, règle Ulrich
 *   2026-08-25) ;
 * - frontière (slide : PFC-RC Lens 14/02 fin 02h00 → SFP-Toulouse démarre le 15/02 à 02h00) :
 *   si un voisin FINIT le jour où cet event commence, la fenêtre démarre à sa fin déclarée —
 *   la tranche minuit → fin du voisin lui appartient. Seule une fin DÉCLARÉE borne : le repli
 *   « journée pleine » d'un voisin sans `eventEndTime` ne doit jamais vider la fenêtre, et un
 *   voisin finissant après cet event ne borne pas non plus (deux events le même jour se
 *   videraient mutuellement).
 */
export function resolveEventTransactionWindow(
  event: EventDayFields,
  timeZone: string,
  neighbors: ReadonlyArray<EventDayFields> = [],
): { start: Date; end: Date } {
  const startDay = startDayOf(event);
  let start = combineDayAndLocalTime(startDay, '00:00', timeZone) ?? startDay;
  const end = declaredEndOf(event, timeZone) ?? startOfNextLocalDay(endDayOf(event), timeZone);
  for (const neighbor of neighbors) {
    if (event.id && neighbor.id === event.id) continue;
    // BUG-371-02 (2026-08-25) : quand les deux events ont chacun leur PROPRE `integrationId`
    // (BUG-368-02) et qu'ils diffèrent, leurs transactions sont DÉJÀ totalement séparées par
    // `t.integrationId` — aucun découpage temporel n'est nécessaire entre elles, quelle que soit
    // la fenêtre. Sans ce garde, deux clubs différents jouant le MÊME jour au même stade (ex.
    // SFP-Cardiff fin 23h30 / PFC-Le Havre fin 23h00, Jean Bouin 06/12) tronquaient à tort le
    // début de celui qui finit le plus tard à l'heure de fin de l'autre (fenêtre réduite à
    // 22h00→22h30, quasi aucune transaction dedans alors que les ventes couraient depuis le
    // matin) — alors qu'aucun risque de double comptage n'existe entre deux intégrations
    // distinctes. Ce garde ne s'applique PAS quand l'un des deux (ou les deux) n'a pas
    // d'`integrationId` connu : la règle de partage temporel reste nécessaire pour les données
    // non disambiguïsées par intégration (CSV Digifood partagé, mode `range` legacy — BUG-339-02).
    if (event.integrationId && neighbor.integrationId && event.integrationId !== neighbor.integrationId) continue;
    if (endDayOf(neighbor).getTime() !== startDay.getTime()) continue;
    const neighborEnd = declaredEndOf(neighbor, timeZone);
    if (!neighborEnd) continue; // pas de fin déclarée → pas d'exclusion
    if (neighborEnd >= end) continue;
    if (neighborEnd > start) start = neighborEnd;
  }
  return { start, end };
}
